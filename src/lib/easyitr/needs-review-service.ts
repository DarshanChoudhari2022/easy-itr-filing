/**
 * EasyITR — Needs Review Service
 * ================================
 * Manages the "Needs Review" bucket — transactions that could not be
 * auto-classified or have suspicious data. Filing is BLOCKED until
 * all items in this bucket are resolved.
 *
 * CRITICAL RULE: needsReview.length MUST be 0 before filing is enabled.
 */

import type { NormalizedTransaction } from './coindcx-ingestion';
import { classifyVdaEvent, type VdaEventType } from './tax-computation-engine';

// ============= TYPES =============

export type ReviewReason =
    | 'unclassified_type'
    | 'suspicious_amount'
    | 'duplicate_candidate'
    | 'negative_inventory'
    | 'missing_price'
    | 'unknown_asset'
    | 'zero_quantity'
    | 'cancelled_order';

export interface SuggestedAction {
    label: string;
    value: string;
    description?: string;
}

export interface NeedsReviewItem {
    id: string;
    transaction: NormalizedTransaction;
    reason: ReviewReason;
    description: string;
    suggestedActions: SuggestedAction[];
    severity: 'blocker' | 'warning';
    status: 'pending' | 'resolved' | 'excluded';
    userClassification?: string;
    userNotes?: string;
    resolvedAt?: Date;
}

export interface NeedsReviewResult {
    items: NeedsReviewItem[];
    blockerCount: number;
    warningCount: number;
    classifiedTransactions: NormalizedTransaction[];
}

// ============= CORE FUNCTIONS =============

/**
 * Classify all transactions and identify those needing manual review.
 * Returns both the clean classified list and the needs-review items.
 */
export function classifyAndReview(
    transactions: NormalizedTransaction[],
    existingReviews: NeedsReviewItem[] = []
): NeedsReviewResult {
    const items: NeedsReviewItem[] = [];
    const classifiedTransactions: NormalizedTransaction[] = [];
    let reviewCounter = 0;

    // Build a map of previously resolved items
    const resolvedMap = new Map<string, NeedsReviewItem>();
    for (const review of existingReviews) {
        if (review.status === 'resolved' || review.status === 'excluded') {
            resolvedMap.set(review.transaction.externalId + review.transaction.contentHash, review);
        }
    }

    for (const tx of transactions) {
        const txKey = tx.externalId + tx.contentHash;
        const previouslyResolved = resolvedMap.get(txKey);

        // Apply previous resolution if available
        if (previouslyResolved) {
            if (previouslyResolved.status === 'excluded') {
                continue; // Skip excluded transactions
            }
            if (previouslyResolved.userClassification) {
                classifiedTransactions.push({
                    ...tx,
                    transactionType: previouslyResolved.userClassification,
                    event_class: previouslyResolved.userClassification,
                });
                continue;
            }
        }

        const event = classifyVdaEvent(tx);

        // Check 1: Unclassified type
        if (event === 'UNKNOWN') {
            items.push(createReviewItem(
                `review-${reviewCounter++}`,
                tx,
                'unclassified_type',
                `Transaction type "${tx.transactionType}" on ${formatDate(tx.tradeTimestamp)} for ${tx.quantity} ${tx.assetSymbol} could not be auto-classified.`,
                'blocker',
                [
                    { label: 'Mark as Spot Buy', value: 'buy', description: 'This was a purchase of crypto' },
                    { label: 'Mark as Spot Sell', value: 'sell', description: 'This was a sale of crypto' },
                    { label: 'Mark as Internal Transfer', value: 'transfer', description: 'Non-taxable self-transfer between wallets' },
                    { label: 'Mark as Reward/Airdrop', value: 'reward', description: 'Free crypto received (taxable as income)' },
                    { label: 'Exclude from computation', value: 'exclude', description: 'Remove this transaction entirely' },
                ]
            ));
            continue;
        }

        // Check 2: Zero or negative quantity
        if (tx.quantity <= 0) {
            items.push(createReviewItem(
                `review-${reviewCounter++}`,
                tx,
                'zero_quantity',
                `Zero or negative quantity (${tx.quantity}) for ${tx.assetSymbol} on ${formatDate(tx.tradeTimestamp)}.`,
                'blocker',
                [
                    { label: 'Enter quantity manually', value: 'edit' },
                    { label: 'Exclude from computation', value: 'exclude' },
                ]
            ));
            continue;
        }

        // Check 3: Missing price data
        if ((tx.priceInr <= 0 && tx.grossAmountInr <= 0) &&
            event !== 'DEPOSIT_CRYPTO' && event !== 'TRANSFER_SELF') {
            items.push(createReviewItem(
                `review-${reviewCounter++}`,
                tx,
                'missing_price',
                `No price data for ${tx.assetSymbol} ${tx.transactionType} on ${formatDate(tx.tradeTimestamp)}.`,
                'warning',
                [
                    { label: 'Enter price manually', value: 'edit' },
                    { label: 'Use estimated market price', value: 'auto_price' },
                    { label: 'Exclude from computation', value: 'exclude' },
                ]
            ));
            continue;
        }

        // Check 4: Unknown asset symbol
        if (tx.assetSymbol === 'UNKNOWN' || !tx.assetSymbol) {
            items.push(createReviewItem(
                `review-${reviewCounter++}`,
                tx,
                'unknown_asset',
                `Unrecognized asset symbol on ${formatDate(tx.tradeTimestamp)}. Original pair: "${tx.pair}".`,
                'blocker',
                [
                    { label: 'Enter correct symbol', value: 'edit' },
                    { label: 'Exclude from computation', value: 'exclude' },
                ]
            ));
            continue;
        }

        // Check 5: Suspiciously large trade amount
        if (tx.grossAmountInr > 50000000) { // > ₹5 Crore
            items.push(createReviewItem(
                `review-${reviewCounter++}`,
                tx,
                'suspicious_amount',
                `Very large transaction: ₹${formatCurrency(tx.grossAmountInr)} for ${tx.quantity} ${tx.assetSymbol}. Please verify this is correct.`,
                'warning',
                [
                    { label: 'Confirm — this is correct', value: 'confirm' },
                    { label: 'Fix amount', value: 'edit' },
                    { label: 'Exclude from computation', value: 'exclude' },
                ]
            ));
            // Still add to classified (it's a warning, not a blocker)
        }

        // Passed all checks
        classifiedTransactions.push({
            ...tx,
            event_class: event,
        });
    }

    return {
        items,
        blockerCount: items.filter(i => i.severity === 'blocker' && i.status === 'pending').length,
        warningCount: items.filter(i => i.severity === 'warning' && i.status === 'pending').length,
        classifiedTransactions,
    };
}

/**
 * Resolve a review item with a user's decision.
 */
export function resolveReviewItem(
    items: NeedsReviewItem[],
    itemId: string,
    resolution: {
        action: string;       // 'buy', 'sell', 'transfer', 'reward', 'exclude', 'confirm', 'edit'
        notes?: string;
        editedTransaction?: Partial<NormalizedTransaction>;
    }
): NeedsReviewItem[] {
    return items.map(item => {
        if (item.id !== itemId) return item;

        if (resolution.action === 'exclude') {
            return {
                ...item,
                status: 'excluded' as const,
                userNotes: resolution.notes,
                resolvedAt: new Date(),
            };
        }

        return {
            ...item,
            status: 'resolved' as const,
            userClassification: resolution.action,
            userNotes: resolution.notes,
            resolvedAt: new Date(),
        };
    });
}

/**
 * Check if all review items are resolved (filing gate).
 */
export function allItemsResolved(items: NeedsReviewItem[]): boolean {
    return items.every(item =>
        item.status === 'resolved' ||
        item.status === 'excluded' ||
        item.severity !== 'blocker'
    );
}

// ============= PERSISTENCE =============

const REVIEW_STORAGE_KEY = 'easyitr_needs_review';

export function saveReviewItems(financialYear: string, items: NeedsReviewItem[]): void {
    try {
        const all = loadAllReviews();
        all[financialYear] = items;
        localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
        console.error('[NeedsReview] Failed to save:', e);
    }
}

export function loadReviewItems(financialYear: string): NeedsReviewItem[] {
    try {
        const all = loadAllReviews();
        const items = all[financialYear] || [];
        // Revive dates
        return items.map((item: any) => ({
            ...item,
            transaction: {
                ...item.transaction,
                tradeTimestamp: new Date(item.transaction.tradeTimestamp),
            },
            resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : undefined,
        }));
    } catch {
        return [];
    }
}

function loadAllReviews(): Record<string, NeedsReviewItem[]> {
    try {
        const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

// ============= HELPERS =============

function createReviewItem(
    id: string,
    tx: NormalizedTransaction,
    reason: ReviewReason,
    description: string,
    severity: 'blocker' | 'warning',
    actions: SuggestedAction[],
): NeedsReviewItem {
    return {
        id,
        transaction: tx,
        reason,
        description,
        suggestedActions: actions,
        severity,
        status: 'pending',
    };
}

function formatDate(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return 'Unknown date';
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
    }).format(value);
}

