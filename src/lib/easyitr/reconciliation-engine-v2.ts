/**
 * EasyITR — Reconciliation Engine
 * ==================================
 * Full reconciliation pipeline that runs after every data import.
 * Orchestrates all checks: duplicates, gaps, cross-source matching,
 * TDS integrity, inventory balance, and transaction classification.
 *
 * 8-Step Pipeline:
 *   1. Duplicate Detection (3-layer)
 *   2. Date Range Coverage
 *   3. Cross-Source Reconciliation (Order CSV ↔ TDS CSV matching)
 *   4. TDS Integrity Check
 *   5. Inventory Balance Check (negative inventory = missing buys)
 *   6. Transaction Classification (UNKNOWN → Needs Review)
 *   7. Cancelled Order Filter
 *   8. Internal Transfer Detection
 */

import type { NormalizedTransaction, TDSRecord } from './coindcx-ingestion';
import { detectDuplicates, type DuplicateDetectionResult } from './duplicate-detector';
import { detectGaps, type GapDetectionResult } from './gap-detector';
import { classifyAndReview, type NeedsReviewResult, type NeedsReviewItem } from './needs-review-service';
import { classifyVdaEvent } from './tax-computation-engine';
import type { FYChecklist } from './coverage-tracker';

// ============= TYPES =============

export type ReconciliationCheckStatus = 'pass' | 'warning' | 'fail' | 'skipped';

export interface ReconciliationCheck {
    id: string;
    name: string;
    status: ReconciliationCheckStatus;
    detail: string;
    metadata?: Record<string, any>;
}

export interface CrossSourceMatch {
    orderCsvSellCount: number;
    tdsCsvSellCount: number;
    matchedCount: number;
    unmatchedInTDS: number;         // In TDS but not in Order CSV (Insta/P2P)
    unmatchedInOrder: number;       // In Order CSV but not in TDS CSV
    totalConsiderationOrderCsv: number;
    totalConsiderationTdsCsv: number;
    considerationDiscrepancyPct: number;
}

export interface InventoryCheck {
    asset: string;
    totalBought: number;
    totalSold: number;
    balance: number;
    isNegative: boolean;
}

export interface FullReconciliationResult {
    financialYear: string;
    checks: ReconciliationCheck[];
    passCount: number;
    warningCount: number;
    failCount: number;
    overallStatus: 'healthy' | 'warnings' | 'issues';

    // Detailed results from sub-engines
    duplicateResult: DuplicateDetectionResult;
    gapResult: GapDetectionResult;
    crossSourceMatch: CrossSourceMatch | null;
    inventoryChecks: InventoryCheck[];
    needsReviewResult: NeedsReviewResult;

    // Clean output
    cleanTransactions: NormalizedTransaction[];
    negativeInventoryAssets: string[];
    tdsDiscrepancyPct: number;

    computedAt: Date;
}

// ============= CORE FUNCTION =============

/**
 * Run the full 8-step reconciliation pipeline.
 */
export function runFullReconciliation(
    transactions: NormalizedTransaction[],
    tdsRecords: TDSRecord[],
    financialYear: string,
    checklist: FYChecklist,
    existingReviews: NeedsReviewItem[] = []
): FullReconciliationResult {
    const checks: ReconciliationCheck[] = [];

    console.log(`[Reconciliation] Starting full pipeline for FY ${financialYear} with ${transactions.length} transactions...`);

    // ─── Step 1: Duplicate Detection ───
    const duplicateResult = detectDuplicates(transactions);
    checks.push({
        id: 'duplicates',
        name: 'Duplicate Detection',
        status: duplicateResult.needsReviewCount > 0 ? 'warning' :
            duplicateResult.autoResolvedCount > 0 ? 'pass' : 'pass',
        detail: duplicateResult.removedCount > 0
            ? `${duplicateResult.autoResolvedCount} duplicate(s) auto-resolved, ${duplicateResult.needsReviewCount} need review`
            : 'No duplicates detected',
        metadata: {
            autoResolved: duplicateResult.autoResolvedCount,
            needsReview: duplicateResult.needsReviewCount,
            removed: duplicateResult.removedCount,
        },
    });

    // Use deduplicated transactions for remaining checks
    let cleanTransactions = duplicateResult.deduplicatedTransactions;

    // ─── Step 2: Date Range Coverage ───
    const gapResult = detectGaps(cleanTransactions, financialYear);
    const criticalGaps = gapResult.gaps.filter(g => g.severity === 'blocker' || g.severity === 'critical');
    checks.push({
        id: 'date_range',
        name: 'Date Range Coverage',
        status: criticalGaps.length > 0 ? 'fail' :
            gapResult.gaps.length > 0 ? 'warning' : 'pass',
        detail: gapResult.gaps.length === 0
            ? `Full FY covered (${gapResult.dateRangeCoverage.coversPct}%)`
            : `${gapResult.gaps.length} gap(s) detected (coverage: ${gapResult.dateRangeCoverage.coversPct}%)`,
        metadata: {
            coversPct: gapResult.dateRangeCoverage.coversPct,
            gapCount: gapResult.gaps.length,
            criticalGapCount: criticalGaps.length,
        },
    });

    // ─── Step 3: Cross-Source Reconciliation ───
    let crossSourceMatch: CrossSourceMatch | null = null;
    const orderCsvItem = checklist.items.find(i => i.source === 'order_history_csv');
    const tdsCsvItem = checklist.items.find(i => i.source === 'tds_summary_csv');

    if (orderCsvItem?.status === 'uploaded' && tdsCsvItem?.status === 'uploaded') {
        const orderTxs = cleanTransactions.filter(tx =>
            tx.rawData?.source === 'csv' && (
                tx.rawData?.fileType === 'trades' ||
                tx.rawData?.file_type === 'trades'
            )
        );
        const tdsTxs = cleanTransactions.filter(tx =>
            tx.rawData?.source === 'csv' && (
                tx.rawData?.fileType === 'tds' ||
                tx.rawData?.file_type === 'tds' ||
                tx.description?.includes('TDS')
            )
        );

        const orderSellIds = new Set(
            orderTxs.filter(tx => tx.transactionType === 'sell').map(tx => tx.orderId).filter(Boolean)
        );
        const tdsSellIds = new Set(
            tdsTxs.filter(tx => tx.transactionType === 'sell').map(tx => tx.orderId).filter(Boolean)
        );

        const matched = [...orderSellIds].filter(id => tdsSellIds.has(id)).length;
        const unmatchedInTDS = [...tdsSellIds].filter(id => !orderSellIds.has(id)).length;
        const unmatchedInOrder = [...orderSellIds].filter(id => !tdsSellIds.has(id)).length;

        const totalConsiderationOrder = orderTxs
            .filter(tx => tx.transactionType === 'sell')
            .reduce((s, tx) => s + (tx.grossAmountInr || 0), 0);
        const totalConsiderationTds = tdsTxs
            .filter(tx => tx.transactionType === 'sell')
            .reduce((s, tx) => s + (tx.grossAmountInr || 0), 0);

        const discPct = totalConsiderationTds > 0
            ? Math.abs(totalConsiderationOrder - totalConsiderationTds) / totalConsiderationTds * 100
            : 0;

        crossSourceMatch = {
            orderCsvSellCount: orderSellIds.size,
            tdsCsvSellCount: tdsSellIds.size,
            matchedCount: matched,
            unmatchedInTDS,
            unmatchedInOrder,
            totalConsiderationOrderCsv: totalConsiderationOrder,
            totalConsiderationTdsCsv: totalConsiderationTds,
            considerationDiscrepancyPct: discPct,
        };

        checks.push({
            id: 'cross_source',
            name: 'Cross-Source Reconciliation',
            status: unmatchedInTDS > 0 ? 'warning' : 'pass',
            detail: unmatchedInTDS > 0
                ? `${unmatchedInTDS} sell(s) in TDS CSV not in Order History (likely Insta/P2P)`
                : `${matched} sells matched across Order History and TDS Summary`,
            metadata: crossSourceMatch,
        });
    } else {
        checks.push({
            id: 'cross_source',
            name: 'Cross-Source Reconciliation',
            status: 'skipped',
            detail: 'Requires both Order History CSV and TDS Summary CSV to be uploaded',
        });
    }

    // ─── Step 4: TDS Integrity Check ───
    let tdsDiscrepancyPct = 0;
    if (tdsRecords.length > 0) {
        const tdsCsvTotal = tdsRecords
            .filter(r => r.financialYear === financialYear)
            .reduce((s, r) => s + r.tdsAmountInr, 0);

        const sellTxs = cleanTransactions.filter(tx => {
            const event = classifyVdaEvent(tx);
            return ['SPOT_SELL', 'CRYPTO_TO_CRYPTO_SELL', 'P2P_INR_SELL'].includes(event) &&
                tx.financialYear === financialYear;
        });
        const totalSellConsideration = sellTxs.reduce((s, tx) => s + (tx.grossAmountInr || 0), 0);
        const theoreticalTds = totalSellConsideration * 0.01;

        tdsDiscrepancyPct = theoreticalTds > 0
            ? Math.abs(tdsCsvTotal - theoreticalTds) / theoreticalTds * 100
            : 0;

        checks.push({
            id: 'tds_integrity',
            name: 'TDS Integrity',
            status: tdsDiscrepancyPct > 10 ? 'fail' :
                tdsDiscrepancyPct > 5 ? 'warning' : 'pass',
            detail: `TDS from CSV: ₹${tdsCsvTotal.toFixed(0)}, Theoretical (1% of sells): ₹${theoreticalTds.toFixed(0)} (${tdsDiscrepancyPct.toFixed(1)}% diff)`,
            metadata: {
                tdsCsvTotal,
                theoreticalTds,
                discrepancyPct: tdsDiscrepancyPct,
                sellConsideration: totalSellConsideration,
            },
        });
    } else {
        checks.push({
            id: 'tds_integrity',
            name: 'TDS Integrity',
            status: tdsCsvItem?.status === 'pending' ? 'fail' : 'skipped',
            detail: 'TDS Summary CSV not uploaded — TDS credit will be estimated',
        });
    }

    // ─── Step 5: Inventory Balance Check ───
    const inventoryChecks = computeInventoryBalances(cleanTransactions);
    const negativeAssets = inventoryChecks.filter(c => c.isNegative);

    checks.push({
        id: 'inventory',
        name: 'Inventory Balance',
        status: negativeAssets.length > 0 ? 'warning' : 'pass',
        detail: negativeAssets.length > 0
            ? `${negativeAssets.length} asset(s) have negative inventory: ${negativeAssets.map(a => a.asset).join(', ')}`
            : `All ${inventoryChecks.length} asset inventories are balanced`,
        metadata: {
            totalAssets: inventoryChecks.length,
            negativeAssets: negativeAssets.map(a => a.asset),
        },
    });

    // ─── Step 6: Transaction Classification ───
    const needsReviewResult = classifyAndReview(cleanTransactions, existingReviews);
    checks.push({
        id: 'classification',
        name: 'Transaction Classification',
        status: needsReviewResult.blockerCount > 0 ? 'fail' :
            needsReviewResult.warningCount > 0 ? 'warning' : 'pass',
        detail: needsReviewResult.items.length === 0
            ? 'All transactions classified successfully'
            : `${needsReviewResult.blockerCount} blocker(s), ${needsReviewResult.warningCount} warning(s) need review`,
        metadata: {
            blockerCount: needsReviewResult.blockerCount,
            warningCount: needsReviewResult.warningCount,
            totalReviewItems: needsReviewResult.items.length,
        },
    });

    // Use classified transactions from here on
    cleanTransactions = needsReviewResult.classifiedTransactions;

    // ─── Step 7: Cancelled Order Filter ───
    const cancelledCount = transactions.filter(tx => {
        const status = (tx.rawData?.status || '').toLowerCase();
        return status === 'cancelled' || status === 'rejected';
    }).length;

    checks.push({
        id: 'cancelled_orders',
        name: 'Cancelled Order Filter',
        status: 'pass',
        detail: cancelledCount > 0
            ? `${cancelledCount} cancelled/rejected order(s) excluded from computation`
            : 'No cancelled orders found',
    });

    // ─── Step 8: Internal Transfer Detection ───
    const transferCount = cleanTransactions.filter(tx => {
        const event = classifyVdaEvent(tx);
        return event === 'TRANSFER_SELF';
    }).length;

    checks.push({
        id: 'internal_transfers',
        name: 'Internal Transfer Detection',
        status: 'pass',
        detail: transferCount > 0
            ? `${transferCount} internal transfer(s) identified (non-taxable)`
            : 'No internal transfers detected',
    });

    // ─── Summary ───
    const passCount = checks.filter(c => c.status === 'pass').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const failCount = checks.filter(c => c.status === 'fail').length;

    const overallStatus: FullReconciliationResult['overallStatus'] =
        failCount > 0 ? 'issues' :
            warningCount > 0 ? 'warnings' : 'healthy';

    console.log(`[Reconciliation] Complete: ${passCount} pass, ${warningCount} warnings, ${failCount} failures`);

    return {
        financialYear,
        checks,
        passCount,
        warningCount,
        failCount,
        overallStatus,
        duplicateResult,
        gapResult,
        crossSourceMatch,
        inventoryChecks,
        needsReviewResult,
        cleanTransactions,
        negativeInventoryAssets: negativeAssets.map(a => a.asset),
        tdsDiscrepancyPct,
        computedAt: new Date(),
    };
}

// ============= HELPERS =============

/**
 * Compute per-asset inventory balance to detect negative inventory.
 */
function computeInventoryBalances(
    transactions: NormalizedTransaction[]
): InventoryCheck[] {
    const byAsset = new Map<string, { bought: number; sold: number }>();

    for (const tx of transactions) {
        const event = classifyVdaEvent(tx);
        const asset = tx.assetSymbol;
        if (!asset || asset === 'INR') continue;

        if (!byAsset.has(asset)) {
            byAsset.set(asset, { bought: 0, sold: 0 });
        }
        const record = byAsset.get(asset)!;

        if (['SPOT_BUY', 'CRYPTO_TO_CRYPTO_BUY', 'P2P_INR_BUY',
            'DEPOSIT_CRYPTO', 'REWARD', 'STAKING', 'AIRDROP',
            'REFERRAL_BONUS', 'INTEREST_EARNED', 'MINING'].includes(event)) {
            record.bought += tx.quantity || 0;
        }
        if (['SPOT_SELL', 'CRYPTO_TO_CRYPTO_SELL', 'P2P_INR_SELL',
            'WITHDRAW_CRYPTO'].includes(event)) {
            record.sold += tx.quantity || 0;
        }
    }

    const checks: InventoryCheck[] = [];
    for (const [asset, { bought, sold }] of byAsset) {
        const balance = bought - sold;
        checks.push({
            asset,
            totalBought: bought,
            totalSold: sold,
            balance,
            isNegative: balance < -0.0001, // Allow tiny floating point drift
        });
    }

    return checks.sort((a, b) => a.asset.localeCompare(b.asset));
}

