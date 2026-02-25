/**
 * TaxMitra — Duplicate Detector
 * ==============================
 * 3-layer duplicate detection for transactions from multiple sources:
 *   Layer 1: Exact content hash match (100% confidence)
 *   Layer 2: Same order_id from different sources (95% confidence)
 *   Layer 3: Fingerprint match — same timestamp+asset+qty+type within 60s (70-90%)
 */

import type { NormalizedTransaction } from './coindcx-ingestion';

// ============= TYPES =============

export type DuplicateMatchType = 'exact_hash' | 'order_id' | 'fingerprint';
export type DuplicateResolution = 'keep_first' | 'keep_second' | 'keep_highest_priority' | 'needs_review';

export interface DuplicateCandidate {
    id: string;
    transaction1: NormalizedTransaction;
    transaction2: NormalizedTransaction;
    matchType: DuplicateMatchType;
    confidence: number;              // 0-100
    autoResolved: boolean;
    resolution: DuplicateResolution;
    reason: string;
}

export interface DuplicateDetectionResult {
    candidates: DuplicateCandidate[];
    autoResolvedCount: number;
    needsReviewCount: number;
    deduplicatedTransactions: NormalizedTransaction[];
    removedCount: number;
}

// ============= CORE FUNCTIONS =============

/**
 * Run 3-layer duplicate detection on all transactions.
 * Returns deduplicated list + candidates for review.
 */
export function detectDuplicates(
    transactions: NormalizedTransaction[]
): DuplicateDetectionResult {
    const candidates: DuplicateCandidate[] = [];
    const seenIds = new Set<string>();
    let candidateCounter = 0;

    // Layer 1: Exact content hash match (100% confidence)
    const byHash = new Map<string, NormalizedTransaction[]>();
    for (const tx of transactions) {
        const hash = tx.contentHash;
        if (!hash) continue;
        const existing = byHash.get(hash) || [];
        existing.push(tx);
        byHash.set(hash, existing);
    }

    for (const [, txs] of byHash) {
        if (txs.length <= 1) continue;
        // Mark all but one as duplicate
        for (let i = 1; i < txs.length; i++) {
            const id = `dup-hash-${candidateCounter++}`;
            candidates.push({
                id,
                transaction1: txs[0],
                transaction2: txs[i],
                matchType: 'exact_hash',
                confidence: 100,
                autoResolved: true,
                resolution: 'keep_highest_priority',
                reason: `Identical content hash: ${txs[0].contentHash?.substring(0, 12)}...`,
            });
            seenIds.add(txs[i].externalId + txs[i].contentHash);
        }
    }

    // Layer 2: Same order_id from different sources (95% confidence)
    const byOrderId = new Map<string, NormalizedTransaction[]>();
    for (const tx of transactions) {
        if (!tx.orderId) continue;
        const existing = byOrderId.get(tx.orderId) || [];
        existing.push(tx);
        byOrderId.set(tx.orderId, existing);
    }

    for (const [orderId, txs] of byOrderId) {
        if (txs.length <= 1) continue;
        const sources = new Set(txs.map(tx => tx.rawData?.source || 'unknown'));
        if (sources.size <= 1) continue; // Same source — might be fills, not duplicates

        const dupKey = txs[1].externalId + txs[1].contentHash;
        if (seenIds.has(dupKey)) continue; // Already caught by Layer 1

        const id = `dup-order-${candidateCounter++}`;
        candidates.push({
            id,
            transaction1: txs[0],
            transaction2: txs[1],
            matchType: 'order_id',
            confidence: 95,
            autoResolved: true,
            resolution: 'keep_highest_priority',
            reason: `Same order ID "${orderId}" from different sources (${Array.from(sources).join(', ')})`,
        });
        seenIds.add(dupKey);
    }

    // Layer 3: Fingerprint match (70-90% confidence)
    // Same asset + type + quantity within 60 seconds
    const sorted = [...transactions].sort((a, b) =>
        getTime(a) - getTime(b)
    );

    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i];
            const b = sorted[j];

            // Time window: within 60 seconds
            const timeDiff = Math.abs(getTime(a) - getTime(b));
            if (timeDiff > 60000) break; // Sorted, so no more matches

            // Same asset and type
            if (a.assetSymbol !== b.assetSymbol) continue;
            if (a.transactionType !== b.transactionType) continue;

            // Same quantity (within tiny tolerance)
            const qtyDiff = Math.abs(a.quantity - b.quantity);
            if (qtyDiff > 0.000001 * Math.max(a.quantity, 1)) continue;

            // Already caught by earlier layers?
            const dupKey = b.externalId + b.contentHash;
            if (seenIds.has(dupKey)) continue;

            // Check price similarity for confidence scoring
            const priceDiff = a.priceInr > 0 && b.priceInr > 0
                ? Math.abs(a.priceInr - b.priceInr) / Math.max(a.priceInr, 1)
                : 1;

            const priceMatch = priceDiff < 0.01;
            const confidence = priceMatch ? 90 : 70;
            const autoResolved = priceMatch;

            const id = `dup-fp-${candidateCounter++}`;
            candidates.push({
                id,
                transaction1: a,
                transaction2: b,
                matchType: 'fingerprint',
                confidence,
                autoResolved,
                resolution: autoResolved ? 'keep_highest_priority' : 'needs_review',
                reason: `Same ${a.assetSymbol} ${a.transactionType} for ${a.quantity} within ${Math.round(timeDiff / 1000)}s` +
                    (priceMatch ? ' (price matches)' : ' (price differs — review needed)'),
            });
            seenIds.add(dupKey);
        }
    }

    // Build deduplicated transaction list
    const removedIds = new Set<string>();
    for (const dup of candidates) {
        if (!dup.autoResolved) continue;

        // Keep the transaction with highest source priority
        const p1 = getSourcePriority(dup.transaction1);
        const p2 = getSourcePriority(dup.transaction2);
        const toRemove = p1 <= p2 ? dup.transaction2 : dup.transaction1;
        removedIds.add(toRemove.externalId + toRemove.contentHash);
    }

    const deduplicatedTransactions = transactions.filter(tx =>
        !removedIds.has(tx.externalId + tx.contentHash)
    );

    return {
        candidates,
        autoResolvedCount: candidates.filter(c => c.autoResolved).length,
        needsReviewCount: candidates.filter(c => !c.autoResolved).length,
        deduplicatedTransactions,
        removedCount: transactions.length - deduplicatedTransactions.length,
    };
}

// ============= HELPERS =============

function getTime(tx: NormalizedTransaction): number {
    return tx.tradeTimestamp instanceof Date
        ? tx.tradeTimestamp.getTime()
        : new Date(tx.tradeTimestamp).getTime();
}

function getSourcePriority(tx: NormalizedTransaction): number {
    const source = (tx.rawData?.source || '').toLowerCase();
    if (source === 'api') return 1;
    if (source === 'csv') return 2;
    if (source === 'manual') return 3;
    return 4;
}
