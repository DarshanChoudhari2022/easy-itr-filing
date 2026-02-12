# Tax Mitra - Crypto Tax Engine

## Overview
Tax Mitra is a comprehensive crypto tax calculation engine designed for Indian tax laws (AY 2026-27). It handles data ingestion from major exchanges (CoinDCX), computes capital gains under Section 115BBH, tracks TDS under Section 194S, and generates ITR-ready reports.

## Features
- **Multi-File Ingestion**: Upload Trades, Deposits, Withdrawals, and TDS CSVs.
- **Deduplication**: SHA-256 content hashing prevents duplicate imports.
- **Tax Calculation**:
  - Section 115BBH: Flat 30% tax on gains (no loss set-off).
  - Surcharge & Cess: Automatically applied.
  - FIFO Accounting: Strict First-In-First-Out basis tracking.
- **Reporting**:
  - Schedule VDA (CSV/Excel) for direct upload to ITR utility.
  - TDS Reconciliation (Form 26AS vs Actual).
  - Monthly/yearly trade volume analytics.

## Usage

### 1. Ingestion
Use `runFullImport` to process CSV files. The engine automatically detects file types.
```typescript
const result = await runFullImport('2025-26', [
  { name: 'trades.csv', content: '...' },
  { name: 'deposits.csv', content: '...' }
]);
```

### 2. Computation
Compute tax for a specific financial year.
```typescript
const taxResult = await computeTaxForFY('2025-26');
console.log(taxResult.totalTaxLiability);
```

### 3. Reporting
Generate downloadable reports.
```typescript
const vdaReport = await exportScheduleVDA('2025-26');
// Returns { filename: '...', csv: '...' }
```

## Database Schema
The engine relies on the following Supabase tables:
- `crypto_import_sessions`: Tracks upload batches.
- `crypto_transactions`: Normalized ledger of all activities.
- `crypto_tds_entries`: TDS records for reconciliation.
- `crypto_tax_snapshots`: Cached tax calculation results.
- `crypto_fx_rates`: Daily INR rates for foreign assets.

## Integration
The frontend integration is handled in `src/pages/Crypto.tsx`. It connects the file upload UI to `runFullImport` and displays stats using `computeTaxForFY`.
