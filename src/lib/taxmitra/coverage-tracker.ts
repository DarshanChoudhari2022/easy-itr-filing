/**
 * TaxMitra — FY Data Coverage Tracker
 * ====================================
 * Tracks which data sources have been provided per Financial Year.
 * Computes coverage scores and determines filing readiness.
 * 
 * CORE RULE: Tax computation is BLOCKED until all required data sources
 * are uploaded or explicitly marked as not applicable.
 */

import type { NormalizedTransaction, TDSRecord, CoinDCXFileType } from './coindcx-ingestion';
import { classifyVdaEvent } from './tax-computation-engine';

// ============= TYPES =============

export type DataSourceType =
    | 'api_sync'
    | 'order_history_csv'
    | 'tds_summary_csv'
    | 'insta_history_csv'
    | 'rewards_csv'
    | 'futures_pnl_csv'
    | 'manual_rewards';

export type ChecklistItemStatus =
    | 'pending'
    | 'uploaded'
    | 'not_applicable'
    | 'acknowledged_missing';

export type CoverageLevel = 'critical' | 'low' | 'medium' | 'high' | 'complete';

export type TaxPreviewState = 'LOCKED' | 'INCOMPLETE' | 'WARNING' | 'READY';

export interface ChecklistItem {
    id: string;
    label: string;
    source: DataSourceType;
    status: ChecklistItemStatus;
    isRequired: boolean;             // Always-required
    isConditionallyRequired: boolean;// Set by reconciliation engine
    uploadedAt?: Date;
    fileName?: string;
    recordCount?: number;
    dateRangeCovered?: { start: Date; end: Date };
    validationResult?: {
        status: 'valid' | 'warnings' | 'errors';
        errors: string[];
        warnings: string[];
    };
    howToGetInstructions: string;
}

export interface FYChecklist {
    financialYear: string;
    items: ChecklistItem[];
    overallStatus: 'incomplete' | 'validation_pending' | 'issues_found' | 'ready';
    coverageScore: number;
    coverageLevel: CoverageLevel;
    taxPreviewState: TaxPreviewState;
    isSafeToFile: boolean;
    blockerCount: number;
    needsReviewCount: number;
    lastUpdated: Date;
}

export interface ConditionalRequirement {
    source: DataSourceType;
    reason: string;
    severity: 'critical' | 'warning' | 'info';
    affectedAmount?: number;
    affectedTransactionCount?: number;
}

export interface CoverageResult {
    score: number;
    level: CoverageLevel;
    label: string;
    color: string;
    canFile: boolean;
    taxPreviewState: TaxPreviewState;
}

// ============= CONSTANTS =============

const HOW_TO_INSTRUCTIONS: Record<DataSourceType, string> = {
    api_sync: 'Go to Settings → CoinDCX API → Enter API Key & Secret → Click "Sync"',
    order_history_csv: 'CoinDCX → Orders → Order History → FILLED ORDERS tab → Set date range for FY → Click "Download CSV"',
    tds_summary_csv: 'CoinDCX → Profile → Reports → TDS Summary → Select FY → Click "Export CSV"',
    insta_history_csv: 'CoinDCX → Orders → Insta History → Set date range for FY → Download CSV',
    rewards_csv: 'CoinDCX → Wallet → Rewards/Staking History → Download CSV (if available)',
    futures_pnl_csv: 'CoinDCX → Futures → P&L Report → Set date range for FY → Download',
    manual_rewards: 'Click "+ Add Trade" → Select "Staking Reward" or "Airdrop" → Enter details manually',
};

const SOURCE_WEIGHTS: Record<DataSourceType, number> = {
    order_history_csv: 35,    // Core trade data
    tds_summary_csv: 30,      // TDS + Insta/P2P coverage
    api_sync: 10,             // Supplementary
    insta_history_csv: 10,    // If conditionally required
    rewards_csv: 10,          // If conditionally required
    futures_pnl_csv: 5,       // If conditionally required
    manual_rewards: 0,        // Bonus, not scored
};

// ============= CORE FUNCTIONS =============

/**
 * Create a fresh checklist for a Financial Year.
 * All items start as 'pending'.
 */
export function createFYChecklist(financialYear: string): FYChecklist {
    const items: ChecklistItem[] = [
        {
            id: 'order_history_csv',
            label: 'Order History CSV',
            source: 'order_history_csv',
            status: 'pending',
            isRequired: true,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.order_history_csv,
        },
        {
            id: 'tds_summary_csv',
            label: 'TDS Summary CSV',
            source: 'tds_summary_csv',
            status: 'pending',
            isRequired: true,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.tds_summary_csv,
        },
        {
            id: 'insta_history_csv',
            label: 'Insta History CSV',
            source: 'insta_history_csv',
            status: 'pending',
            isRequired: false,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.insta_history_csv,
        },
        {
            id: 'rewards_csv',
            label: 'Rewards / Interest CSV',
            source: 'rewards_csv',
            status: 'pending',
            isRequired: false,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.rewards_csv,
        },
        {
            id: 'futures_pnl_csv',
            label: 'Futures P&L Report',
            source: 'futures_pnl_csv',
            status: 'pending',
            isRequired: false,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.futures_pnl_csv,
        },
        {
            id: 'api_sync',
            label: 'CoinDCX API Sync',
            source: 'api_sync',
            status: 'pending',
            isRequired: false,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.api_sync,
        },
        {
            id: 'manual_rewards',
            label: 'Manual Reward Entries',
            source: 'manual_rewards',
            status: 'pending',
            isRequired: false,
            isConditionallyRequired: false,
            howToGetInstructions: HOW_TO_INSTRUCTIONS.manual_rewards,
        },
    ];

    return {
        financialYear,
        items,
        overallStatus: 'incomplete',
        coverageScore: 0,
        coverageLevel: 'critical',
        taxPreviewState: 'LOCKED',
        isSafeToFile: false,
        blockerCount: 2, // order_history + tds_summary are required
        needsReviewCount: 0,
        lastUpdated: new Date(),
    };
}

/**
 * Update a checklist item's status after file upload.
 */
export function updateChecklistItem(
    checklist: FYChecklist,
    source: DataSourceType,
    update: {
        status: ChecklistItemStatus;
        fileName?: string;
        recordCount?: number;
        dateRangeCovered?: { start: Date; end: Date };
        validationResult?: ChecklistItem['validationResult'];
    }
): FYChecklist {
    const updatedItems = checklist.items.map(item => {
        if (item.source !== source) return item;
        return {
            ...item,
            ...update,
            uploadedAt: update.status === 'uploaded' ? new Date() : item.uploadedAt,
        };
    });

    const updated: FYChecklist = {
        ...checklist,
        items: updatedItems,
        lastUpdated: new Date(),
    };

    // Recompute derived fields
    return recomputeChecklist(updated);
}

/**
 * Detect conditional requirements based on already-uploaded data.
 * Called after Order History CSV and TDS Summary CSV are both uploaded.
 */
export function detectConditionalRequirements(
    orderHistoryTxs: NormalizedTransaction[],
    tdsSummaryTxs: NormalizedTransaction[],
    allTransactions: NormalizedTransaction[],
): ConditionalRequirement[] {
    const requirements: ConditionalRequirement[] = [];

    // 1. Detect Insta/P2P trades: sells in TDS CSV not in Order History
    const orderSellIds = new Set(
        orderHistoryTxs
            .filter(tx => tx.transactionType === 'sell')
            .map(tx => tx.orderId)
            .filter(Boolean)
    );

    const unmatchedTDSSells = tdsSummaryTxs.filter(tx =>
        tx.transactionType === 'sell' && tx.orderId && !orderSellIds.has(tx.orderId)
    );

    if (unmatchedTDSSells.length > 0) {
        requirements.push({
            source: 'insta_history_csv',
            reason: `${unmatchedTDSSells.length} sell transaction(s) in TDS Summary are not in Order History. These are likely Instant Buy/Sell or P2P trades. Upload Insta History CSV for accurate cost basis.`,
            severity: 'critical',
            affectedAmount: unmatchedTDSSells.reduce((s, tx) => s + (tx.grossAmountInr || 0), 0),
            affectedTransactionCount: unmatchedTDSSells.length,
        });
    }

    // 2. Detect futures activity
    const hasFuturesActivity = allTransactions.some(tx =>
        tx.description?.toLowerCase().includes('futures') ||
        tx.description?.toLowerCase().includes('margin') ||
        tx.transactionType?.includes('futures') ||
        tx.transactionType?.includes('margin') ||
        tx.pair?.includes('PERP')
    );
    if (hasFuturesActivity) {
        requirements.push({
            source: 'futures_pnl_csv',
            reason: 'Futures/margin trading activity detected. Upload Futures P&L report for complete tax computation.',
            severity: 'critical',
        });
    }

    // 3. Detect reward/staking activity
    const hasRewardActivity = allTransactions.some(tx => {
        const event = classifyVdaEvent(tx);
        return ['REWARD', 'STAKING', 'AIRDROP', 'INTEREST_EARNED', 'REFERRAL_BONUS', 'MINING'].includes(event);
    });
    if (hasRewardActivity) {
        requirements.push({
            source: 'rewards_csv',
            reason: 'Staking/reward activity detected in your transactions. Upload Rewards CSV for accurate "Other Income" computation.',
            severity: 'warning',
        });
    }

    return requirements;
}

/**
 * Apply conditional requirements to checklist.
 */
export function applyConditionalRequirements(
    checklist: FYChecklist,
    requirements: ConditionalRequirement[]
): FYChecklist {
    const updatedItems = checklist.items.map(item => {
        const req = requirements.find(r => r.source === item.source);
        if (req) {
            return {
                ...item,
                isConditionallyRequired: true,
            };
        }
        return item;
    });

    return recomputeChecklist({
        ...checklist,
        items: updatedItems,
        lastUpdated: new Date(),
    });
}

/**
 * Compute coverage score based on checklist state.
 */
export function computeCoverageScore(checklist: FYChecklist): CoverageResult {
    let score = 0;
    let totalWeight = 0;

    for (const item of checklist.items) {
        const weight = SOURCE_WEIGHTS[item.source] || 0;
        const isEffectivelyRequired = item.isRequired || item.isConditionallyRequired;

        if (!isEffectivelyRequired && item.status === 'pending') {
            // Optional and not uploaded — don't penalize
            continue;
        }

        totalWeight += weight;

        switch (item.status) {
            case 'uploaded':
                score += weight;
                break;
            case 'not_applicable':
                score += weight * 0.8; // Good — explicitly marked
                break;
            case 'acknowledged_missing':
                score += weight * 0.25; // Minimal credit
                break;
            case 'pending':
                // No credit
                break;
        }
    }

    // Normalize to 0-100
    const normalizedScore = totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;

    // Determine level
    let level: CoverageLevel;
    let label: string;
    let color: string;
    let canFile: boolean;
    let taxPreviewState: TaxPreviewState;

    if (normalizedScore >= 95) {
        level = 'complete';
        label = '✅ Safe to File';
        color = 'green';
        canFile = true;
        taxPreviewState = 'READY';
    } else if (normalizedScore >= 80) {
        level = 'high';
        label = '⚠️ Mostly Complete — Review Warnings';
        color = 'yellow';
        canFile = true;
        taxPreviewState = 'WARNING';
    } else if (normalizedScore >= 60) {
        level = 'medium';
        label = '🟠 Significant Gaps — Tax Preview Unreliable';
        color = 'orange';
        canFile = false;
        taxPreviewState = 'INCOMPLETE';
    } else if (normalizedScore >= 30) {
        level = 'low';
        label = '🔴 Major Data Missing — Do Not File';
        color = 'red';
        canFile = false;
        taxPreviewState = 'INCOMPLETE';
    } else {
        level = 'critical';
        label = '🔴 Insufficient Data — Upload Required';
        color = 'red';
        canFile = false;
        taxPreviewState = 'LOCKED';
    }

    return { score: normalizedScore, level, label, color, canFile, taxPreviewState };
}

/**
 * Map CoinDCX file type to checklist data source.
 */
export function mapFileTypeToSource(fileType: CoinDCXFileType): DataSourceType | null {
    switch (fileType) {
        case 'trades': return 'order_history_csv';
        case 'tds': return 'tds_summary_csv';
        case 'rewards': return 'rewards_csv';
        case 'deposits': return null; // Deposits are supplementary, no checklist item
        case 'withdrawals': return null;
        default: return null;
    }
}

/**
 * Get the FY date range for validation.
 */
export function getFYDateRange(financialYear: string): { start: Date; end: Date } {
    const startYear = parseInt(financialYear.split('-')[0]);
    return {
        start: new Date(startYear, 3, 1),      // 1 April
        end: new Date(startYear + 1, 2, 31, 23, 59, 59), // 31 March 23:59:59
    };
}

// ============= INTERNAL HELPERS =============

/**
 * Recompute all derived fields on a checklist.
 */
function recomputeChecklist(checklist: FYChecklist): FYChecklist {
    const coverage = computeCoverageScore(checklist);

    // Count blockers: required items that are still pending
    const blockerCount = checklist.items.filter(item =>
        (item.isRequired || item.isConditionallyRequired) &&
        item.status === 'pending'
    ).length;

    // Determine overall status
    let overallStatus: FYChecklist['overallStatus'];
    if (blockerCount > 0) {
        overallStatus = 'incomplete';
    } else if (checklist.items.some(i => i.validationResult?.status === 'errors')) {
        overallStatus = 'issues_found';
    } else if (checklist.items.some(i => i.validationResult?.status === 'warnings')) {
        overallStatus = 'validation_pending';
    } else {
        overallStatus = 'ready';
    }

    // Override preview state if there are blockers
    let taxPreviewState = coverage.taxPreviewState;
    if (blockerCount > 0 && taxPreviewState !== 'LOCKED') {
        taxPreviewState = coverage.score < 60 ? 'LOCKED' : 'INCOMPLETE';
    }

    return {
        ...checklist,
        coverageScore: coverage.score,
        coverageLevel: coverage.level,
        taxPreviewState,
        isSafeToFile: coverage.canFile && blockerCount === 0 && checklist.needsReviewCount === 0,
        blockerCount,
        overallStatus,
    };
}

// ============= PERSISTENCE (localStorage) =============

const CHECKLIST_STORAGE_KEY = 'taxmitra_fy_checklist';

/**
 * Save checklist to localStorage.
 */
export function saveChecklist(checklist: FYChecklist): void {
    try {
        const existing = loadAllChecklists();
        existing[checklist.financialYear] = checklist;
        localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
        console.error('[CoverageTracker] Failed to save checklist:', e);
    }
}

/**
 * Load checklist for a specific FY from localStorage.
 */
export function loadChecklist(financialYear: string): FYChecklist | null {
    try {
        const all = loadAllChecklists();
        const stored = all[financialYear];
        if (!stored) return null;
        // Revive dates
        stored.lastUpdated = new Date(stored.lastUpdated);
        stored.items = stored.items.map(item => ({
            ...item,
            uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : undefined,
            dateRangeCovered: item.dateRangeCovered ? {
                start: new Date(item.dateRangeCovered.start),
                end: new Date(item.dateRangeCovered.end),
            } : undefined,
        }));
        return stored;
    } catch (e) {
        console.error('[CoverageTracker] Failed to load checklist:', e);
        return null;
    }
}

/**
 * Load or create a checklist for a FY.
 */
export function getOrCreateChecklist(financialYear: string): FYChecklist {
    return loadChecklist(financialYear) || createFYChecklist(financialYear);
}

function loadAllChecklists(): Record<string, FYChecklist> {
    try {
        const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}
