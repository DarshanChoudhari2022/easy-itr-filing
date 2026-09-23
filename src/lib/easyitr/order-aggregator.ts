/**
 * EasyITR — Order-Level Aggregation Engine
 * ==========================================
 * 
 * KEY INSIGHT (KoinX Matching):
 *   CoinDCX API returns fill-level trades (one order → multiple fills).
 *   KoinX aggregates fills into order-level transactions.
 *   This is the #1 reason for transaction count + capital gains mismatch.
 * 
 *   Example:
 *     API fills:    Fill1: 0.1 BTC @ ₹50,100 (orderABC) + Fill2: 0.4 BTC @ ₹50,200 (orderABC)
 *     KoinX view:   Order ABC: 0.5 BTC @ ₹50,180 (VWAP) → 1 transaction
 * 
 * This module converts fill-level transactions to order-level transactions,
 * matching KoinX's aggregation logic exactly.
 * 
 * @version 1.0.0
 */

import type { NormalizedTransaction } from './coindcx-ingestion';

// ============= TYPES =============

export interface AggregationResult {
    /** Order-level transactions (deduplicated, aggregated) */
    transactions: NormalizedTransaction[];
    /** Statistics about the aggregation */
    stats: AggregationStats;
    /** Warnings generated during aggregation */
    warnings: string[];
}

export interface AggregationStats {
    /** Number of fill-level transactions received */
    inputFillCount: number;
    /** Number of order-level transactions produced */
    outputOrderCount: number;
    /** Number of fills that were aggregated (grouped into orders) */
    fillsAggregated: number;
    /** Number of single-fill orders (no aggregation needed) */
    singleFillOrders: number;
    /** Number of multi-fill orders */
    multiFillOrders: number;
    /** Number of transactions without orderId (kept as-is) */
    noOrderIdCount: number;
    /** Number of invalid/filtered transactions */
    filteredCount: number;
    /** Breakdown by filter reason */
    filterReasons: Record<string, number>;
}

// ============= VALIDATION =============

/**
 * Transaction validation gate.
 * Rejects invalid/noise transactions that inflate counts and corrupt calculations.
 * 
 * KoinX does NOT include:
 *   - UNKNOWN asset transactions
 *   - Zero-quantity trades
 *   - Zero-value trades with no price data
 *   - Non-trade deposits/withdrawals of fiat (INR)
 */
export function isValidTrade(tx: NormalizedTransaction): { valid: boolean; reason?: string } {
    // 1. Reject UNKNOWN assets
    const asset = (tx.assetSymbol || '').toUpperCase().trim();
    if (!asset || asset === 'UNKNOWN' || asset === 'NULL' || asset === 'UNDEFINED') {
        return { valid: false, reason: 'UNKNOWN_ASSET' };
    }

    // 2. Reject zero or negative quantity
    const qty = Number(tx.quantity) || 0;
    if (qty <= 0) {
        return { valid: false, reason: 'ZERO_QUANTITY' };
    }

    // 3. Reject zero-value trades (no price data at all)
    const price = Number(tx.priceInr) || Number(tx.pricePerUnit) || 0;
    const grossInr = Number(tx.grossAmountInr) || 0;
    if (price <= 0 && grossInr <= 0) {
        // Exception: deposits, withdrawals, and rewards can have zero INR value
        const t = (tx.transactionType || '').toLowerCase();
        if (!t.includes('deposit') && !t.includes('withdrawal') &&
            !t.includes('reward') && !t.includes('airdrop') &&
            !t.includes('staking') && !t.includes('interest')) {
            return { valid: false, reason: 'ZERO_VALUE' };
        }
    }

    // 4. Reject INR (fiat) as base asset — these are deposits/withdrawals, not crypto trades
    if (asset === 'INR') {
        return { valid: false, reason: 'FIAT_ASSET' };
    }

    // 5. Reject trial/test endpoint noise (very short external IDs that look synthetic)
    const extId = (tx.externalId || '').trim();
    if (extId.startsWith('trial-') || extId.startsWith('test-')) {
        return { valid: false, reason: 'TEST_DATA' };
    }

    return { valid: true };
}

// ============= ORDER AGGREGATION =============

/**
 * Aggregate fill-level transactions to order-level transactions.
 * This is the key transformation to match KoinX's transaction counting.
 * 
 * Logic:
 *   1. Group fills by (orderId + side) — one order can only be buy OR sell
 *   2. For each group:
 *      - Sum quantities → totalQuantity
 *      - Compute VWAP price = Σ(qty_i × price_i) / Σ(qty_i)
 *      - Sum fees → totalFee
 *      - Sum TDS → totalTds
 *      - Use earliest fill timestamp as order timestamp
 *      - Sum gross amounts
 *   3. Produce one NormalizedTransaction per order
 *   4. Transactions without orderId are kept as-is
 * 
 * @param transactions - Fill-level transactions from API/CSV
 * @param options - Aggregation options
 * @returns Aggregated order-level transactions
 */
export function aggregateFillsToOrders(
    transactions: NormalizedTransaction[],
    options: {
        /** Whether to validate and filter transactions */
        validateFirst?: boolean;
        /** Whether to aggregate (false = pass-through for debugging) */
        aggregate?: boolean;
    } = { validateFirst: true, aggregate: true }
): AggregationResult {
    const warnings: string[] = [];
    const stats: AggregationStats = {
        inputFillCount: transactions.length,
        outputOrderCount: 0,
        fillsAggregated: 0,
        singleFillOrders: 0,
        multiFillOrders: 0,
        noOrderIdCount: 0,
        filteredCount: 0,
        filterReasons: {},
    };

    // Step 1: Validate and filter
    let validTxs = transactions;
    if (options.validateFirst !== false) {
        validTxs = [];
        for (const tx of transactions) {
            const check = isValidTrade(tx);
            if (check.valid) {
                validTxs.push(tx);
            } else {
                stats.filteredCount++;
                const reason = check.reason || 'UNKNOWN_REASON';
                stats.filterReasons[reason] = (stats.filterReasons[reason] || 0) + 1;
                warnings.push(`Filtered txn [${tx.externalId}]: ${reason} (${tx.assetSymbol}, qty=${tx.quantity})`);
            }
        }
    }

    // Step 2: If aggregation is disabled, return validated transactions as-is
    if (options.aggregate === false) {
        stats.outputOrderCount = validTxs.length;
        return { transactions: validTxs, stats, warnings };
    }

    // Step 3: Group by orderId + side
    const orderGroups = new Map<string, NormalizedTransaction[]>();
    const noOrderTxs: NormalizedTransaction[] = [];

    for (const tx of validTxs) {
        const orderId = (tx.orderId || '').trim();
        const txType = (tx.transactionType || '').toLowerCase();

        // Determine side for grouping
        const isBuy = txType.includes('buy') || txType === 'swap_in' || txType === 'p2p_buy';
        const isSell = txType.includes('sell') || txType === 'swap_out' || txType === 'p2p_sell';

        if (!orderId || orderId.startsWith('coindcx-') || orderId.startsWith('man-')) {
            // No real orderId — can't aggregate, keep as-is
            noOrderTxs.push(tx);
            stats.noOrderIdCount++;
            continue;
        }

        // Group key: orderId + side (one order can only be buy OR sell)
        const side = isBuy ? 'buy' : (isSell ? 'sell' : 'other');
        const groupKey = `${orderId}__${side}__${tx.assetSymbol}`;

        if (!orderGroups.has(groupKey)) {
            orderGroups.set(groupKey, []);
        }
        orderGroups.get(groupKey)!.push(tx);
    }

    // Step 4: Aggregate each order group
    const aggregatedTxs: NormalizedTransaction[] = [];

    for (const [groupKey, fills] of orderGroups.entries()) {
        if (fills.length === 1) {
            // Single fill — no aggregation needed
            aggregatedTxs.push(fills[0]);
            stats.singleFillOrders++;
        } else {
            // Multi-fill — aggregate into one order-level transaction
            const aggregated = aggregateFills(fills, warnings);
            if (aggregated) {
                aggregatedTxs.push(aggregated);
                stats.multiFillOrders++;
                stats.fillsAggregated += fills.length;
            } else {
                // Fallback: keep individual fills if aggregation fails
                aggregatedTxs.push(...fills);
                warnings.push(`Failed to aggregate ${fills.length} fills for order ${fills[0].orderId}`);
            }
        }
    }

    // Add non-order transactions
    aggregatedTxs.push(...noOrderTxs);

    // Sort chronologically
    aggregatedTxs.sort((a, b) => {
        const ta = a.tradeTimestamp instanceof Date ? a.tradeTimestamp.getTime() : new Date(a.tradeTimestamp).getTime();
        const tb = b.tradeTimestamp instanceof Date ? b.tradeTimestamp.getTime() : new Date(b.tradeTimestamp).getTime();
        return ta - tb;
    });

    stats.outputOrderCount = aggregatedTxs.length;

    return { transactions: aggregatedTxs, stats, warnings };
}

// ============= INTERNAL: Aggregate fills of one order =============

function aggregateFills(
    fills: NormalizedTransaction[],
    warnings: string[]
): NormalizedTransaction | null {
    if (!fills.length) return null;

    // Reference fill (for metadata that doesn't change across fills)
    const ref = fills[0];

    // Ensure all fills have numeric values
    const parsedFills = fills.map(f => ({
        ...f,
        quantity: Number(f.quantity) || 0,
        pricePerUnit: Number(f.pricePerUnit) || 0,
        priceInr: Number(f.priceInr) || 0,
        grossAmountQuote: Number(f.grossAmountQuote) || 0,
        grossAmountInr: Number(f.grossAmountInr) || 0,
        feeAmount: Number(f.feeAmount) || 0,
        feeInr: Number(f.feeInr) || 0,
        tdsAmount: Number(f.tdsAmount) || 0,
    }));

    // Sum quantities
    const totalQuantity = parsedFills.reduce((sum, f) => sum + f.quantity, 0);
    if (totalQuantity <= 0) {
        warnings.push(`Order ${ref.orderId}: Total quantity is ${totalQuantity} after aggregation`);
        return null;
    }

    // Compute VWAP (Volume Weighted Average Price)
    // VWAP = Σ(quantity_i × price_i) / Σ(quantity_i)
    const weightedPriceSum = parsedFills.reduce((sum, f) => sum + f.quantity * f.pricePerUnit, 0);
    const vwapPricePerUnit = weightedPriceSum / totalQuantity;

    const weightedPriceInrSum = parsedFills.reduce((sum, f) => sum + f.quantity * f.priceInr, 0);
    const vwapPriceInr = weightedPriceInrSum / totalQuantity;

    // Sum quote and INR gross amounts
    const totalGrossQuote = parsedFills.reduce((sum, f) => sum + f.grossAmountQuote, 0);
    const totalGrossInr = parsedFills.reduce((sum, f) => sum + f.grossAmountInr, 0);

    // Sum fees
    const totalFeeAmount = parsedFills.reduce((sum, f) => sum + f.feeAmount, 0);
    const totalFeeInr = parsedFills.reduce((sum, f) => sum + f.feeInr, 0);

    // Sum TDS
    const totalTds = parsedFills.reduce((sum, f) => sum + f.tdsAmount, 0);

    // Use earliest timestamp as the order timestamp (consistent with KoinX)
    const earliestTimestamp = parsedFills.reduce((earliest, f) => {
        const ts = f.tradeTimestamp instanceof Date ? f.tradeTimestamp : new Date(f.tradeTimestamp);
        return ts < earliest ? ts : earliest;
    }, parsedFills[0].tradeTimestamp instanceof Date ? parsedFills[0].tradeTimestamp : new Date(parsedFills[0].tradeTimestamp));

    // Build content hash from all fills' hashes (deterministic)
    const combinedHash = parsedFills
        .map(f => f.contentHash)
        .sort()
        .join('|');

    // Build description
    const side = ref.transactionType.toUpperCase();
    const description = `${side} ${totalQuantity} ${ref.assetSymbol} @ ₹${vwapPriceInr.toFixed(2)} VWAP (${fills.length} fills)`;

    // Return aggregated order
    const aggregated: NormalizedTransaction = {
        externalId: ref.orderId || ref.externalId, // Use orderId as the primary ID
        exchange: ref.exchange,
        transactionType: ref.transactionType,
        event_class: ref.event_class,
        isTaxableEvent: ref.isTaxableEvent,
        assetSymbol: ref.assetSymbol,
        quoteAsset: ref.quoteAsset,
        pair: ref.pair,
        quantity: totalQuantity,
        pricePerUnit: vwapPricePerUnit,
        priceInr: vwapPriceInr,
        grossAmountQuote: totalGrossQuote,
        grossAmountInr: totalGrossInr,
        feeAmount: totalFeeAmount,
        feeAsset: ref.feeAsset,
        feeInr: totalFeeInr,
        tdsAmount: totalTds,
        tdsRate: ref.tdsRate,
        tradeTimestamp: earliestTimestamp,
        financialYear: ref.financialYear,
        assessmentYear: ref.assessmentYear,
        description,
        orderId: ref.orderId,
        txHash: ref.txHash,
        contentHash: `order-agg-${combinedHash.substring(0, 32)}`,
        rawData: {
            _aggregated: 'true',
            _fillCount: String(fills.length),
            _fills: parsedFills.map(f => f.externalId).join(','),
        },
    };

    return aggregated;
}

// ============= UTILITY: Deduplication by content hash =============

/**
 * Deduplicate transactions by content hash.
 * Keeps the first occurrence (highest priority source).
 * 
 * Priority: API (source_priority=1) > CSV (2) > Manual (3)
 */
export function deduplicateTransactions(
    transactions: NormalizedTransaction[]
): { unique: NormalizedTransaction[]; duplicateCount: number } {
    const seen = new Map<string, NormalizedTransaction>();
    let duplicateCount = 0;

    for (const tx of transactions) {
        const hash = tx.contentHash || computeFingerprint(tx);

        if (seen.has(hash)) {
            duplicateCount++;
            continue;
        }

        // Also check by orderId + asset + side (cross-source dedup)
        const altKey = computeOrderKey(tx);
        if (altKey && seen.has(altKey)) {
            duplicateCount++;
            continue;
        }

        seen.set(hash, tx);
        if (altKey) seen.set(altKey, tx);
    }

    return {
        unique: Array.from(new Set(seen.values())),
        duplicateCount,
    };
}

/**
 * Compute a fingerprint for a transaction (for dedup when content hash is missing).
 */
function computeFingerprint(tx: NormalizedTransaction): string {
    const ts = tx.tradeTimestamp instanceof Date
        ? tx.tradeTimestamp.toISOString()
        : new Date(tx.tradeTimestamp || '').toISOString();

    return [
        ts,
        (tx.assetSymbol || '').toUpperCase(),
        (Number(tx.quantity) || 0).toFixed(10),
        (tx.transactionType || '').toLowerCase(),
        (Number(tx.priceInr) || 0).toFixed(6),
    ].join('|');
}

/**
 * Compute an order-level key for cross-source deduplication.
 * Used to prevent the same order from appearing via both API and CSV.
 */
function computeOrderKey(tx: NormalizedTransaction): string | null {
    const orderId = (tx.orderId || '').trim();
    if (!orderId || orderId.startsWith('coindcx-') || orderId.startsWith('man-')) {
        return null;
    }

    const side = (tx.transactionType || '').toLowerCase().includes('buy') ? 'buy' : 'sell';
    return `orderkey:${orderId}:${tx.assetSymbol}:${side}`;
}

