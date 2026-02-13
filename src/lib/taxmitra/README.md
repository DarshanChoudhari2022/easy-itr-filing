# Tax Mitra - Crypto Tax Engine

## Overview
Tax Mitra is a comprehensive **production-grade** crypto tax calculation engine designed for Indian tax laws (AY 2026-27). It handles data ingestion from major exchanges (CoinDCX), computes capital gains under **Section 115BBH**, tracks TDS under **Section 194S**, and generates ITR-ready reports.

## Features
- **Multi-File Ingestion**: Upload Trades, Deposits, Withdrawals, TDS, and Rewards CSVs.
- **Robust FIFO Engine**:
  - **Prior-FY Continuity**: Automatically retains buy/deposit history from previous years to build accurate cost basis.
  - **Strict Asset Segregation**: Separate FIFO queues for each asset (BTC, ETH, etc.).
  - **Sold-Asset Cost Basis**: Calculates "Cost of Acquisition" strictly for sold tokens (matching Schedule VDA requirements).
- **Tax Compliance (Benchmarks Matched with KoinX)**:
  - **Section 115BBH**: Flat 30% tax on gains. No set-off of losses.
  - **Surcharge & Cess**: 4% Health & Education Cess + applicable surcharge.
  - **Other Income**: Staking/Airdrops taxed separately from capital gains.
  - **TDS Reconciliation**: Uses trade-data TDS as primary credit source, reconciles against Form 26AS certificates.
- **Reporting**:
  - Schedule VDA (CSV) for direct upload to ITR utility.
  - TDS Reconciliation (Quarter-wise breakdown).
  - P&L Summary with distinct Capital Gains vs Other Income split.

## Usage

### 1. Ingestion
Use `runFullImport` to process CSV files. The engine automatically detects file types and **filters** data.
> **Note**: The ingestion layer intelligently filters out *future* transactions but **retains prior-year buy-side transactions** essential for FIFO cost basis.
```typescript
const result = await runFullImport('2024-25', [
  { name: 'trades.csv', content: '...' },
  { name: 'deposits.csv', content: '...' }
]);
```

### 2. Computation
Compute tax for a specific financial year.
```typescript
const taxResult = await computeTaxForFY('2024-25');
console.log(taxResult.netTaxPayable);
```

### 3. Reporting
Generate downloadable reports.
```typescript
const vdaReport = await exportScheduleVDA('2024-25');
// Returns { filename: '...', csv: '...' }
```

## Database Schema
The engine relies on the following Supabase tables:
- `crypto_import_sessions`: Tracks upload batches and status.
- `crypto_transactions`: Normalized ledger of all activities (including prior FY history).
- `crypto_tds_records`: TDS records for reconciliation.
- `crypto_tax_summaries`: Cached tax calculation results for UI display.
- `crypto_vda_report_lines`: Detailed line-items for Schedule VDA report.
- `crypto_fx_rates`: Daily INR rates for foreign assets.

## Integration
The frontend integration is handled in `src/pages/Crypto.tsx`. It connects the file upload UI to `runFullImport` and displays stats using `computeTaxForFY`.

## Version History
- **v2.1.0** (Current):
  - Fixed cost basis calculation to sum only *sold* assets (not total portfolio buys).
  - Fixed TDS credit logic to prefer trade data (fallback to certificates only if higher).
  - Fixed ingestion to retain prior-FY buy history for accurate FIFO mapping.
  - Added support for `swap_out` TDS collection.
- **v2.0.0**: Initial production release with Section 115BBH support.
