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

    // Types
    type AccountingMethod,
    type TaxLot,
    type LotMatch,
    type VDAReportLine,
    type AssetGainSummary,
    type TDSReconciliation,
    type TaxComputationResult,
} from './tax-computation-engine';

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
