/**
 * Tax Mitra — Crypto Tax Engine
 * ==============================
 * Production-ready Indian crypto tax computation engine
 * 
 * Features:
 *   ✓ CoinDCX multi-file CSV ingestion (Trades, Deposits, Withdrawals, TDS, Rewards)
 *   ✓ Auto-detection of file types from headers
 *   ✓ FIFO/LIFO/HIFO cost basis accounting
 *   ✓ Section 115BBH compliance (30% flat tax, no loss offset)
 *   ✓ Section 194S TDS tracking & reconciliation
 *   ✓ Surcharge + 4% Health & Education Cess
 *   ✓ Schedule VDA generation for ITR filing
 *   ✓ TDS reconciliation for 26AS cross-check
 *   ✓ Idempotent imports with SHA-256 content hashing
 *   ✓ Full FIFO audit trail for CA review
 *   ✓ FX rate conversion for non-INR pairs
 *   ✓ Supabase persistence with RLS
 * 
 * Architecture:
 *   ┌──────────────────┐
 *   │  CSV Files Upload │
 *   └────────┬─────────┘
 *            ▼
 *   ┌──────────────────┐    ┌──────────────┐
 *   │  CoinDCX Ingestion│───▶│  FX Rate      │
 *   │  (5 file parsers) │    │  Lookup       │
 *   └────────┬─────────┘    └──────────────┘
 *            ▼
 *   ┌──────────────────┐
 *   │  Persistence      │
 *   │  (Supabase CRUD)  │
 *   └────────┬─────────┘
 *            ▼
 *   ┌──────────────────┐
 *   │  Tax Computation  │
 *   │  Engine (FIFO)    │
 *   └────────┬─────────┘
 *            ▼
 *   ┌──────────────────┐
 *   │  Reports          │
 *   │  (VDA, TDS, P&L)  │
 *   └──────────────────┘
 * 
 * @version 2.0.0
 * @author Tax Mitra Team
 */

// ============= INGESTION LAYER =============
export {
    // Parsers
    parseCoinDCXTradesCSV,
    parseCoinDCXDepositsCSV,
    parseCoinDCXWithdrawalsCSV,
    parseCoinDCXTDSCSV,
    parseCoinDCXRewardsCSV,
    parseWazirXTradesCSV,
    parseCoinDCXFile,
    detectCoinDCXFileType,
    processImportSession,
    computeContentHash,

    // Types
    type CoinDCXFileType,
    type NormalizedTransaction,
    type TDSRecord,
    type FileParseResult,
    type ImportSessionResult,
    type ColumnMapping,
    type ParsedRow,
} from './coindcx-ingestion';

// ============= TAX COMPUTATION ENGINE =============
export {
    // Engine
    computeVdaTaxForFinancialYear,
    formatPnLSummary,
    generateScheduleVDACSV,
    generateTDSReconciliationCSV,

    // Canonical helpers (single source of truth)
    mapTxToFinancialYear,
    classifyVdaEvent,

    // Types
    type AccountingMethod,
    type VdaEventType,
    type TaxLot,
    type LotMatch,
    type VDAReportLine,
    type AssetGainSummary,
    type TDSReconciliation,
    type TaxComputationResult,
    type DataCoverageScore,
} from './tax-computation-engine';

// ============= ORDER AGGREGATION (v5 — KoinX Matching) =============
export {
    aggregateFillsToOrders,
    deduplicateTransactions,
    isValidTrade,

    type AggregationResult,
    type AggregationStats,
} from './order-aggregator';

// ============= PERSISTENCE LAYER =============
export {
    // Import operations
    runFullImport,
    createImportSession,
    rollbackImportSession,
    getImportSessions,

    // Tax computation
    computeTaxForFY,
    getCachedTaxSummary,

    // Data access
    getTransactionStats,
    getVDAReportLines,
    getPnLSummary,

    // Report exports
    exportScheduleVDA,
    exportTDSReconciliation,

    // FX rates
    getINRRate,
    createFxRateLookup,

    // Types
    type PersistenceResult,
    type ImportProgress,
} from './persistence-service';

// ============= FAIL-SAFE COVERAGE TRACKER =============
export {
    createFYChecklist,
    updateChecklistItem,
    detectConditionalRequirements,
    applyConditionalRequirements,
    computeCoverageScore,
    mapFileTypeToSource,
    getFYDateRange,
    getOrCreateChecklist,
    saveChecklist,
    loadChecklist,

    type DataSourceType,
    type ChecklistItemStatus,
    type CoverageLevel,
    type TaxPreviewState,
    type ChecklistItem,
    type FYChecklist,
    type ConditionalRequirement,
    type CoverageResult,
} from './coverage-tracker';

// ============= GAP DETECTOR =============
export {
    detectGaps,

    type GapType,
    type GapSeverity,
    type DataGap,
    type GapDetectionResult,
    type MonthActivity,
} from './gap-detector';

// ============= DUPLICATE DETECTOR =============
export {
    detectDuplicates,

    type DuplicateMatchType,
    type DuplicateResolution,
    type DuplicateCandidate,
    type DuplicateDetectionResult,
} from './duplicate-detector';

// ============= NEEDS REVIEW SERVICE =============
export {
    classifyAndReview,
    resolveReviewItem,
    allItemsResolved,
    saveReviewItems,
    loadReviewItems,

    type ReviewReason,
    type SuggestedAction,
    type NeedsReviewItem,
    type NeedsReviewResult,
} from './needs-review-service';

// ============= RECONCILIATION ENGINE v2 =============
export {
    runFullReconciliation,

    type ReconciliationCheckStatus,
    type ReconciliationCheck,
    type CrossSourceMatch,
    type InventoryCheck,
    type FullReconciliationResult,
} from './reconciliation-engine-v2';

// ============= FILING GATE =============
export {
    evaluateFilingGate,
    validateOverride,
    createOverrideRecord,
    saveOverride,
    loadOverride,
    hasActiveOverride,

    type HardBlockerType,
    type SoftBlockerType,
    type FilingBlocker,
    type FilingGateResult,
    type OverrideRecord,
} from './filing-gate';
