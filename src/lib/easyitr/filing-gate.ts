/**
 * EasyITR — Filing Gate
 * =======================
 * Evaluates whether the user can safely file taxes based on:
 *   - Data coverage checklist completion
 *   - Reconciliation results
 *   - Needs-review item resolution
 *
 * Implements hard blockers (cannot override) and soft blockers (overridable
 * with explicit typed acknowledgement).
 */

import type { FYChecklist, CoverageResult } from './coverage-tracker';
import type { NeedsReviewItem } from './needs-review-service';
import type { DataGap } from './gap-detector';
import type { DuplicateCandidate } from './duplicate-detector';

// ============= TYPES =============

export type HardBlockerType =
    | 'NO_TRADE_DATA'
    | 'UNRESOLVED_REVIEW_ITEMS'
    | 'ZERO_TRANSACTIONS_IN_FY';

export type SoftBlockerType =
    | 'NO_TDS_DATA'
    | 'MISSING_INSTA_CSV'
    | 'NEGATIVE_INVENTORY'
    | 'TDS_MISMATCH'
    | 'DATE_RANGE_GAP'
    | 'LOW_COVERAGE_SCORE'
    | 'UNRESOLVED_DUPLICATES';

export interface FilingBlocker {
    type: HardBlockerType | SoftBlockerType;
    severity: 'hard' | 'soft';
    message: string;
    canOverride: boolean;
    riskDescription?: string;
    impactEstimate?: string;     // e.g., "TDS credit may differ by ₹500+"
}

export interface FilingGateResult {
    canFile: boolean;
    blockers: FilingBlocker[];
    warnings: string[];
    overrideAvailable: boolean;
    coverageScore: number;
    taxPreviewEnabled: boolean;
}

export interface OverrideRecord {
    financialYear: string;
    overriddenBlockers: SoftBlockerType[];
    acknowledgedRisks: string[];
    typedConfirmation: string;
    timestamp: Date;
    coverageScoreAtOverride: number;
}

// ============= CORE FUNCTIONS =============

/**
 * Evaluate the filing gate — determines if user can file or what's blocking them.
 */
export function evaluateFilingGate(
    checklist: FYChecklist,
    options: {
        needsReviewItems?: NeedsReviewItem[];
        gaps?: DataGap[];
        unresolvedDuplicates?: DuplicateCandidate[];
        negativeInventoryAssets?: string[];
        tdsDiscrepancyPct?: number;
        transactionCount?: number;
    } = {}
): FilingGateResult {
    const blockers: FilingBlocker[] = [];
    const warnings: string[] = [];

    const {
        needsReviewItems = [],
        gaps = [],
        unresolvedDuplicates = [],
        negativeInventoryAssets = [],
        tdsDiscrepancyPct = 0,
        transactionCount = 0,
    } = options;

    // ═══ HARD BLOCKERS (cannot be overridden) ═══

    // 1. No trade data at all
    const orderHistoryItem = checklist.items.find(i => i.source === 'order_history_csv');
    if (orderHistoryItem?.status === 'pending') {
        blockers.push({
            type: 'NO_TRADE_DATA',
            severity: 'hard',
            message: 'Order History CSV is required. Upload from CoinDCX → Orders → Filled Orders.',
            canOverride: false,
        });
    }

    // 2. Unresolved review items (blockers only)
    const pendingBlockers = needsReviewItems.filter(
        i => i.severity === 'blocker' && i.status === 'pending'
    );
    if (pendingBlockers.length > 0) {
        blockers.push({
            type: 'UNRESOLVED_REVIEW_ITEMS',
            severity: 'hard',
            message: `${pendingBlockers.length} transaction(s) need your review before filing. Go to "Needs Review" tab.`,
            canOverride: false,
        });
    }

    // 3. Zero transactions for the FY
    if (transactionCount === 0 && orderHistoryItem?.status === 'uploaded') {
        blockers.push({
            type: 'ZERO_TRANSACTIONS_IN_FY',
            severity: 'hard',
            message: 'No transactions found for this financial year. Verify your CSV date range covers the correct FY.',
            canOverride: false,
        });
    }

    // ═══ SOFT BLOCKERS (can be overridden with acknowledgement) ═══

    // 4. No TDS data
    const tdsItem = checklist.items.find(i => i.source === 'tds_summary_csv');
    if (tdsItem?.status === 'pending') {
        blockers.push({
            type: 'NO_TDS_DATA',
            severity: 'soft',
            message: 'TDS Summary CSV not uploaded. TDS credit will be estimated at 1% of sell volume.',
            canOverride: true,
            riskDescription: 'Your TDS credit may be inaccurate. This could result in paying more tax than necessary or an incorrect refund claim.',
            impactEstimate: 'TDS credit could differ from Form 26AS by ₹500+',
        });
    }

    // 5. Missing Insta CSV (when conditionally required)
    const instaItem = checklist.items.find(i => i.source === 'insta_history_csv');
    if (instaItem?.isConditionallyRequired && instaItem.status === 'pending') {
        blockers.push({
            type: 'MISSING_INSTA_CSV',
            severity: 'soft',
            message: 'Instant Buy/Sell trades detected but Insta History CSV not uploaded. Buy-side cost basis will be estimated.',
            canOverride: true,
            riskDescription: 'Cost of acquisition for Insta trades will be estimated from market price, which may differ from actual purchase price.',
        });
    }

    // 6. Negative inventory
    if (negativeInventoryAssets.length > 0) {
        blockers.push({
            type: 'NEGATIVE_INVENTORY',
            severity: 'soft',
            message: `${negativeInventoryAssets.length} asset(s) have negative inventory (${negativeInventoryAssets.join(', ')}). Missing buy/deposit transactions.`,
            canOverride: true,
            riskDescription: 'Selling more than purchased means buy-side data is missing. Cost of acquisition will be ₹0 for unmatched sells, inflating your tax.',
        });
    }

    // 7. TDS mismatch
    if (tdsDiscrepancyPct > 5) {
        blockers.push({
            type: 'TDS_MISMATCH',
            severity: 'soft',
            message: `TDS discrepancy of ${tdsDiscrepancyPct.toFixed(1)}% detected between computed and expected values.`,
            canOverride: true,
            riskDescription: 'Your claimed TDS credit may not match Form 26AS, which could trigger a notice from the Income Tax Department.',
        });
    }

    // 8. Date range gaps
    const criticalGaps = gaps.filter(g => g.severity === 'blocker' || g.severity === 'critical');
    if (criticalGaps.length > 0) {
        blockers.push({
            type: 'DATE_RANGE_GAP',
            severity: 'soft',
            message: `${criticalGaps.length} significant date range gap(s) detected in transaction data.`,
            canOverride: true,
            riskDescription: 'Your CSV may not cover the full financial year. Transactions during gap periods will be missing from tax computation.',
        });
    }

    // 9. Low coverage score
    if (checklist.coverageScore < 60) {
        blockers.push({
            type: 'LOW_COVERAGE_SCORE',
            severity: 'soft',
            message: `Data coverage is only ${checklist.coverageScore}%. Recommended minimum is 80% for reliable tax computation.`,
            canOverride: true,
            riskDescription: 'Multiple data sources are missing. Tax computation may be significantly inaccurate.',
        });
    }

    // 10. Unresolved duplicate candidates
    if (unresolvedDuplicates.length > 0) {
        blockers.push({
            type: 'UNRESOLVED_DUPLICATES',
            severity: 'soft',
            message: `${unresolvedDuplicates.length} potential duplicate transaction(s) need review.`,
            canOverride: true,
            riskDescription: 'Duplicate transactions could inflate or deflate your capital gains calculation.',
        });
    }

    // Add warnings for non-blocking issues
    const pendingWarnings = needsReviewItems.filter(
        i => i.severity === 'warning' && i.status === 'pending'
    );
    if (pendingWarnings.length > 0) {
        warnings.push(`${pendingWarnings.length} transaction(s) have warnings that should be reviewed.`);
    }

    // Determine overall outcome
    const hasHardBlockers = blockers.some(b => b.severity === 'hard');
    const hasSoftBlockers = blockers.some(b => b.severity === 'soft');

    return {
        canFile: blockers.length === 0,
        blockers,
        warnings,
        overrideAvailable: !hasHardBlockers && hasSoftBlockers,
        coverageScore: checklist.coverageScore,
        taxPreviewEnabled: !hasHardBlockers && checklist.coverageScore >= 30,
    };
}

/**
 * Validate an override attempt. Returns true only if all conditions are met.
 */
export function validateOverride(
    typedText: string,
    checkboxes: boolean[],
    expectedCheckboxCount: number = 3
): { valid: boolean; error?: string } {
    // Must type exact phrase
    if (typedText.trim() !== 'I ACCEPT THE RISK') {
        return { valid: false, error: 'Please type "I ACCEPT THE RISK" exactly as shown.' };
    }

    // All checkboxes must be checked
    if (checkboxes.length < expectedCheckboxCount || !checkboxes.every(Boolean)) {
        return { valid: false, error: 'Please acknowledge all risk statements by checking all boxes.' };
    }

    return { valid: true };
}

/**
 * Create an override record for audit logging.
 */
export function createOverrideRecord(
    financialYear: string,
    blockers: FilingBlocker[],
    coverageScore: number,
    typedConfirmation: string
): OverrideRecord {
    return {
        financialYear,
        overriddenBlockers: blockers
            .filter(b => b.severity === 'soft')
            .map(b => b.type as SoftBlockerType),
        acknowledgedRisks: blockers
            .filter(b => b.riskDescription)
            .map(b => b.riskDescription!),
        typedConfirmation,
        timestamp: new Date(),
        coverageScoreAtOverride: coverageScore,
    };
}

// ============= PERSISTENCE =============

const OVERRIDE_STORAGE_KEY = 'easyitr_filing_overrides';

export function saveOverride(override: OverrideRecord): void {
    try {
        const all = loadAllOverrides();
        all[override.financialYear] = override;
        localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
        console.error('[FilingGate] Failed to save override:', e);
    }
}

export function loadOverride(financialYear: string): OverrideRecord | null {
    try {
        const all = loadAllOverrides();
        const record = all[financialYear];
        if (!record) return null;
        record.timestamp = new Date(record.timestamp);
        return record;
    } catch {
        return null;
    }
}

export function hasActiveOverride(financialYear: string): boolean {
    return loadOverride(financialYear) !== null;
}

function loadAllOverrides(): Record<string, OverrideRecord> {
    try {
        const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

