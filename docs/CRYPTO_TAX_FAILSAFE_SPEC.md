# Fail-Safe Crypto Tax System — Complete Specification
# CoinDCX Integration for Indian Users (Section 115BBH)

> **Version:** 1.0.0 | **Date:** 2026-02-24  
> **Compliance:** Section 115BBH, Section 194S, Schedule VDA  
> **Platform:** TaxMitra (EasyFile ITR)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Data Model & Required CoinDCX Files/APIs](#2-data-model--required-coindcx-filesapis)
3. [Account Linking & Data Ingestion Flow](#3-account-linking--data-ingestion-flow)
4. [Reconciliation & Completeness Engine](#4-reconciliation--completeness-engine)
5. [Coverage & Completeness Dashboard](#5-coverage--completeness-dashboard)
6. [UI/UX for Upload, Validation & Error Handling](#6-uiux-for-upload-validation--error-handling)
7. [Filing Safeguards & Override Protocol](#7-filing-safeguards--override-protocol)
8. [Technical Implementation Map](#8-technical-implementation-map)

---

## 1. Executive Summary

### The Core Problem

No single CoinDCX data channel provides 100% transaction coverage. The API misses Insta Buy/Sell, P2P trades, and exact TDS. CSVs miss staking rewards. A user who relies on only one source **will** have incorrect tax calculations.

### The Solution: Compulsory Multi-Source Ingestion

This system **blocks tax computation** until all required data sources for a selected Financial Year are uploaded or explicitly acknowledged as not applicable. It cross-validates every transaction across sources, flags gaps, and prevents filing with incomplete data unless the user signs an explicit risk acknowledgement.

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Zero-trust data** | Every source is validated; no single source is assumed complete |
| **Compulsory completeness** | Tax preview disabled until coverage checklist is satisfied |
| **Reconciliation-first** | Cross-checks run automatically after every import |
| **Explicit overrides only** | Incomplete data requires typed acknowledgement, not a checkbox |
| **Full audit trail** | Every import, merge, gap, and override is logged immutably |

---

## 2. Data Model & Required CoinDCX Files/APIs

### 2.1 CoinDCX Data Sources — Complete Matrix

| # | Data Source | Type | What It Contains | What It Misses | Required? |
|---|-----------|------|-----------------|----------------|-----------|
| 1 | **CoinDCX API** (trade_history) | API | Spot trade fills (buy/sell) with qty, price, fee, order_id | No Insta, no P2P, no TDS, no rewards | Recommended |
| 2 | **Order History CSV** | CSV | All spot buy+sell orders with qty, price, fee, order_id | No Insta, no P2P, no TDS | **YES** |
| 3 | **TDS Summary CSV** | CSV | All sell events (spot+insta+P2P) with exact TDS deducted per 194S | No buy-side data, no quantities for Insta/P2P | **YES** |
| 4 | **Insta History CSV** | CSV | Insta Buy/Sell trades with qty, price, fee | Only Insta trades | Conditional* |
| 5 | **Rewards/Interest CSV** | CSV | Staking rewards, interest earned, referral bonuses | Only reward events | Conditional* |
| 6 | **Futures P&L Report** | CSV | Futures/derivatives settlement data | Only futures | Conditional* |
| 7 | **Manual Entry** | UI | Airdrops, mining income, off-exchange transfers | N/A | Conditional* |

> *Conditional = Required if the reconciliation engine detects evidence of these transaction types (e.g., TDS CSV shows sells not in Order History → Insta/P2P detected → Insta CSV becomes required).

### 2.2 Derived Requirements Per FY

```
FY_DATA_REQUIREMENTS = {
  ALWAYS_REQUIRED: [
    'order_history_csv',    // Spot trades (cost basis authority)
    'tds_summary_csv',      // TDS credit + Insta/P2P sell detection
  ],
  CONDITIONALLY_REQUIRED: [
    'insta_history_csv',    // IF TDS CSV shows non-spot sells
    'rewards_csv',          // IF user has staking/lending enabled
    'futures_pnl_csv',      // IF user traded futures/margin
  ],
  RECOMMENDED: [
    'api_sync',             // Real-time validation + supplementary data
    'manual_rewards',       // Airdrops, mining (no export available)
  ]
}
```

### 2.3 Database Schema Additions

```sql
-- ══════════════════════════════════════════════════════════════
-- TABLE: fy_data_checklist
-- Purpose: Track which data sources have been provided per FY.
-- Gate for tax computation: all required items must be 'uploaded' or 'not_applicable'.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fy_data_checklist (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year  text NOT NULL,           -- '2024-25'
  
  -- Per-source status
  order_history_csv   text NOT NULL DEFAULT 'pending',  
  tds_summary_csv     text NOT NULL DEFAULT 'pending',  
  insta_history_csv   text NOT NULL DEFAULT 'pending',  
  rewards_csv         text NOT NULL DEFAULT 'pending',  
  futures_pnl_csv     text NOT NULL DEFAULT 'pending',  
  api_sync            text NOT NULL DEFAULT 'pending',  
  manual_rewards      text NOT NULL DEFAULT 'pending',  
  -- Status values: 'pending' | 'uploaded' | 'not_applicable' | 'acknowledged_missing'
  
  -- Conditional requirements (set by reconciliation engine)
  insta_required      boolean NOT NULL DEFAULT false,
  rewards_required    boolean NOT NULL DEFAULT false,
  futures_required    boolean NOT NULL DEFAULT false,
  
  -- Override tracking
  override_active     boolean NOT NULL DEFAULT false,
  override_reason     text,
  override_timestamp  timestamptz,
  override_ip         text,
  
  -- Computed coverage
  coverage_score      int NOT NULL DEFAULT 0,  -- 0-100
  coverage_level      text NOT NULL DEFAULT 'incomplete',
  is_safe_to_file     boolean NOT NULL DEFAULT false,
  
  -- Metadata
  last_reconciled_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, financial_year)
);

-- ══════════════════════════════════════════════════════════════
-- TABLE: data_gap_registry
-- Purpose: Every detected gap is stored as an actionable item.
-- Gaps block filing until resolved or acknowledged.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.data_gap_registry (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year  text NOT NULL,
  
  -- Gap details
  gap_type        text NOT NULL,  -- See GapType enum below
  severity        text NOT NULL,  -- 'blocker' | 'critical' | 'warning' | 'info'
  category        text NOT NULL,  -- 'date_range' | 'transaction_count' | 'tds' | 'duplicate' | 'unclassified' | 'negative_inventory'
  
  -- Human-readable description
  title           text NOT NULL,
  description     text NOT NULL,
  action_required text NOT NULL,  -- What user must do
  
  -- Technical details
  affected_assets text[],         -- ['BTC', 'ETH'] or null
  date_range_start timestamptz,
  date_range_end   timestamptz,
  expected_value   numeric(20,6),
  actual_value     numeric(20,6),
  
  -- Resolution
  status          text NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'acknowledged' | 'false_positive'
  resolved_at     timestamptz,
  resolved_by     text,           -- 'system' | 'user_upload' | 'user_acknowledge'
  
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gap_user_fy ON public.data_gap_registry(user_id, financial_year, status);

-- ══════════════════════════════════════════════════════════════
-- TABLE: needs_review_transactions
-- Purpose: Transactions that could not be auto-classified.
-- BLOCKS tax computation until all are resolved.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.needs_review_transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year      text NOT NULL,
  
  -- Original transaction reference
  transaction_id      uuid REFERENCES public.normalized_transactions(id),
  raw_transaction_id  uuid REFERENCES public.raw_transactions(id),
  
  -- Why it needs review
  review_reason       text NOT NULL,  -- 'unclassified_type' | 'suspicious_amount' | 'duplicate_candidate' | 'negative_inventory' | 'missing_price' | 'unknown_asset'
  review_description  text NOT NULL,
  
  -- User resolution
  status              text NOT NULL DEFAULT 'pending',  -- 'pending' | 'resolved' | 'excluded' | 'confirmed'
  user_classification text,           -- User's chosen classification
  user_notes          text,
  resolved_at         timestamptz,
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_user_fy ON public.needs_review_transactions(user_id, financial_year, status);
```

### 2.4 Gap Type Enumeration

```typescript
type GapType =
  | 'MISSING_DATE_RANGE'         // Trades between X and Y not present
  | 'TRUNCATED_CSV'              // CSV appears cut off (row count vs expected)
  | 'MISSING_PAGES'              // Pagination gap detected in API data
  | 'TDS_MISMATCH'               // TDS from CSV ≠ computed TDS
  | 'SELL_VOLUME_MISMATCH'       // Sell volume from TDS CSV ≠ Order History
  | 'NEGATIVE_INVENTORY'         // Selling more than bought (missing buys)
  | 'UNMATCHED_TDS_SELLS'        // Sells in TDS CSV not found in Order History
  | 'DUPLICATE_DETECTED'         // Same transaction from multiple sources
  | 'INCONSISTENT_QUANTITY'      // Same order_id, different quantities
  | 'CANCELLED_ORDER_INCLUDED'   // Cancelled/rejected order in data
  | 'INTERNAL_TRANSFER_AMBIGUITY'// Could be transfer or trade
  | 'MISSING_INSTA_BUY_DATA'     // Insta sell found but no buy-side cost basis
  | 'MISSING_FUTURES_DATA'       // Futures activity implied but no P&L report
  | 'MISSING_REWARD_DATA'        // Reward transactions detected but no CSV
  | 'FY_BOUNDARY_TRADES'         // Trades near FY boundary need IST verification
  | 'UNKNOWN_ASSET'              // Asset symbol not recognized
  | 'ZERO_PRICE_TRADE';          // Trade with ₹0 price (suspicious)
```

---

## 3. Account Linking & Data Ingestion Flow

### 3.1 Step-by-Step User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRYPTO TAX SETUP WIZARD                       │
│                                                                   │
│  Step 1: Select Financial Year                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  📅 Select FY:  [2024-25 ▼]                                 │ │
│  │                                                               │ │
│  │  Assessment Year: 2025-26                                     │ │
│  │  Period: 1 April 2024 — 31 March 2025                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Step 2: Connect CoinDCX (Optional but Recommended)              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  🔗 API Key: [________________________]                      │ │
│  │  🔑 Secret:  [________________________]  [👁]               │ │
│  │                                                               │ │
│  │  [Validate & Sync]   or   [Skip — I'll upload CSVs only]    │ │
│  │                                                               │ │
│  │  ℹ️ API provides supplementary data. CSVs are still required │ │
│  │     for complete coverage (TDS, Insta, P2P).                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Step 3: Upload Required Files (MANDATORY)                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  ✅ = Uploaded   ⏳ = Pending   ❌ = Missing (Required)       │ │
│  │  ⚠️ = Missing (Detected Needed)   ➖ = Not Applicable        │ │
│  │                                                               │ │
│  │  ❌ Order History CSV ............... [Upload] [How to get?]  │ │
│  │     CoinDCX → Orders → Filled Orders → Download CSV          │ │
│  │     Date range must cover: 01 Apr 2024 — 31 Mar 2025         │ │
│  │                                                               │ │
│  │  ❌ TDS Summary CSV ................. [Upload] [How to get?]  │ │
│  │     CoinDCX → Profile → Reports → TDS → FY 2024-25          │ │
│  │                                                               │ │
│  │  ⏳ Insta History CSV ............... [Upload] [Not Used ▼]   │ │
│  │     Required IF you used Instant Buy/Sell feature             │ │
│  │                                                               │ │
│  │  ⏳ Rewards/Interest CSV ............ [Upload] [Not Used ▼]   │ │
│  │     Required IF you earned staking/lending rewards            │ │
│  │                                                               │ │
│  │  ⏳ Futures P&L Report .............. [Upload] [Not Used ▼]   │ │
│  │     Required IF you traded futures/margin                     │ │
│  │                                                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [← Back]                    [Run Validation & Continue →]       │
│                                                                   │
│  ⚠️ Tax calculation is DISABLED until required files are uploaded │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Per-Year Checklist State Machine

```typescript
interface FYChecklist {
  financialYear: string;
  items: ChecklistItem[];
  overallStatus: 'incomplete' | 'validation_pending' | 'issues_found' | 'ready';
  coverageScore: number;           // 0-100
  isSafeToFile: boolean;
  blockerCount: number;            // Must be 0 to enable filing
  needsReviewCount: number;        // Must be 0 to enable filing
}

interface ChecklistItem {
  id: string;
  label: string;
  source: DataSourceType;
  status: 'pending' | 'uploaded' | 'not_applicable' | 'acknowledged_missing';
  isRequired: boolean;             // Always-required vs conditional
  isConditionallyRequired: boolean;// Set by reconciliation engine
  uploadedAt?: Date;
  fileName?: string;
  fileHash?: string;
  recordCount?: number;
  dateRangeCovered?: { start: Date; end: Date };
  validationResult?: {
    status: 'valid' | 'warnings' | 'errors';
    errors: string[];
    warnings: string[];
  };
  howToGetInstructions: string;    // Step-by-step for this specific file
}
```

### 3.3 Conditional Requirement Detection

After the first two mandatory CSVs are uploaded, the reconciliation engine auto-detects what else is needed:

```typescript
function detectConditionalRequirements(
  orderHistoryTxs: NormalizedTransaction[],
  tdsSummaryTxs: NormalizedTransaction[],
  tdsRecords: TDSRecord[]
): ConditionalRequirement[] {
  const requirements: ConditionalRequirement[] = [];

  // 1. Detect Insta/P2P trades: sells in TDS CSV not in Order History
  const orderSellIds = new Set(orderHistoryTxs
    .filter(tx => tx.transactionType === 'sell')
    .map(tx => tx.orderId));
  
  const unmatchedTDSSells = tdsSummaryTxs.filter(tx => 
    tx.transactionType === 'sell' && !orderSellIds.has(tx.orderId)
  );
  
  if (unmatchedTDSSells.length > 0) {
    requirements.push({
      source: 'insta_history_csv',
      reason: `${unmatchedTDSSells.length} sell transactions in TDS Summary are not in Order History. These are likely Insta Buy/Sell or P2P trades.`,
      severity: 'critical',
      affectedAmount: unmatchedTDSSells.reduce((s, tx) => s + tx.grossAmountInr, 0),
    });
  }

  // 2. Detect futures activity: look for margin/futures keywords
  const hasFuturesActivity = [...orderHistoryTxs, ...tdsSummaryTxs].some(tx =>
    tx.description?.toLowerCase().includes('futures') ||
    tx.description?.toLowerCase().includes('margin') ||
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
  const hasRewardActivity = [...orderHistoryTxs, ...tdsSummaryTxs].some(tx =>
    tx.transactionType?.includes('reward') ||
    tx.transactionType?.includes('staking') ||
    tx.description?.toLowerCase().includes('interest')
  );
  if (hasRewardActivity) {
    requirements.push({
      source: 'rewards_csv',
      reason: 'Staking/reward activity detected. Upload Rewards CSV for accurate "Other Income" computation.',
      severity: 'warning',
    });
  }

  return requirements;
}
```

---

## 4. Reconciliation & Completeness Engine

### 4.1 Reconciliation Pipeline

After every data import, the engine runs these checks **automatically**:

```
RECONCILIATION PIPELINE (runs after every import)
══════════════════════════════════════════════════

  ┌──────────────────┐
  │ 1. DUPLICATE      │ → Detect same transaction from API + CSV + manual
  │    DETECTION       │ → Content hash + order_id + fingerprint matching
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 2. DATE RANGE     │ → Verify imported data covers full FY (1 Apr – 31 Mar)
  │    COVERAGE        │ → Detect gaps > 7 days with no activity
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 3. CROSS-SOURCE   │ → Match Order CSV sells ↔ TDS CSV sells
  │    RECONCILIATION  │ → Verify quantities, prices, fees match
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 4. TDS INTEGRITY  │ → Sum of TDS from CSV vs 1% of total sell volume
  │    CHECK           │ → Flag if discrepancy > ₹500
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 5. INVENTORY       │ → Run FIFO and check for negative inventory
  │    BALANCE CHECK   │ → Any negative = missing buy transactions
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 6. TRANSACTION     │ → Every transaction must have a valid VdaEventType
  │    CLASSIFICATION  │ → UNKNOWN → "Needs Review" bucket (blocks filing)
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 7. CANCELLED       │ → Detect orders with status='cancelled'/'rejected'
  │    ORDER FILTER    │ → Remove from tax computation, log as excluded
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 8. INTERNAL        │ → Detect deposit+withdrawal pairs (same amount, ±1hr)
  │    TRANSFER DETECT │ → Mark as TRANSFER_SELF (non-taxable)
  └──────────────────┘
```

### 4.2 Duplicate Detection (3-Layer)

```typescript
interface DuplicateCandidate {
  transaction1: NormalizedTransaction;
  transaction2: NormalizedTransaction;
  matchType: 'exact_hash' | 'order_id' | 'fingerprint' | 'fuzzy';
  confidence: number;              // 0-100
  autoResolved: boolean;           // true if confidence >= 95
  resolution?: 'keep_first' | 'keep_second' | 'keep_highest_priority' | 'needs_review';
}

function detectDuplicates(allTxs: NormalizedTransaction[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  // Layer 1: Exact content hash match (100% confidence)
  const byHash = groupBy(allTxs, tx => tx.contentHash);
  for (const [hash, txs] of Object.entries(byHash)) {
    if (txs.length > 1) {
      // Keep highest priority source (API > CSV > Manual)
      candidates.push({
        transaction1: txs[0], transaction2: txs[1],
        matchType: 'exact_hash', confidence: 100, autoResolved: true,
        resolution: 'keep_highest_priority'
      });
    }
  }

  // Layer 2: Same order_id (95% confidence)
  const byOrderId = groupBy(allTxs.filter(tx => tx.orderId), tx => tx.orderId!);
  for (const [orderId, txs] of Object.entries(byOrderId)) {
    if (txs.length > 1) {
      const uniqueSources = new Set(txs.map(tx => tx.rawData?.source));
      if (uniqueSources.size > 1) {
        // Same order from different sources
        candidates.push({
          transaction1: txs[0], transaction2: txs[1],
          matchType: 'order_id', confidence: 95, autoResolved: true,
          resolution: 'keep_highest_priority'
        });
      }
    }
  }

  // Layer 3: Fingerprint (timestamp + asset + qty + type within 60s)
  // Confidence 70-90 depending on match precision
  for (let i = 0; i < allTxs.length; i++) {
    for (let j = i + 1; j < allTxs.length; j++) {
      const a = allTxs[i], b = allTxs[j];
      if (a.assetSymbol === b.assetSymbol &&
          a.transactionType === b.transactionType &&
          Math.abs(a.quantity - b.quantity) < 0.000001 &&
          Math.abs(a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime()) < 60000) {
        const priceMatch = Math.abs(a.priceInr - b.priceInr) / Math.max(a.priceInr, 1) < 0.01;
        candidates.push({
          transaction1: a, transaction2: b,
          matchType: 'fingerprint',
          confidence: priceMatch ? 90 : 70,
          autoResolved: priceMatch,
          resolution: priceMatch ? 'keep_highest_priority' : 'needs_review'
        });
      }
    }
  }

  return candidates;
}
```

### 4.3 Date Range Gap Detection

```typescript
interface DateGap {
  start: Date;
  end: Date;
  durationDays: number;
  severity: 'info' | 'warning' | 'critical';
  possibleReason: string;
}

function detectDateGaps(
  transactions: NormalizedTransaction[],
  fyStart: Date,       // 1 April
  fyEnd: Date,         // 31 March
  maxGapDays: number = 14
): DateGap[] {
  const gaps: DateGap[] = [];
  const sorted = transactions
    .filter(tx => tx.tradeTimestamp >= fyStart && tx.tradeTimestamp <= fyEnd)
    .sort((a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime());

  if (sorted.length === 0) {
    gaps.push({
      start: fyStart, end: fyEnd,
      durationDays: 365,
      severity: 'critical',
      possibleReason: 'No transactions found for this FY. Upload Order History CSV.'
    });
    return gaps;
  }

  // Check gap at start of FY
  const firstTxDate = sorted[0].tradeTimestamp;
  const startGapDays = daysBetween(fyStart, firstTxDate);
  if (startGapDays > maxGapDays) {
    gaps.push({
      start: fyStart, end: firstTxDate,
      durationDays: startGapDays,
      severity: startGapDays > 30 ? 'critical' : 'warning',
      possibleReason: `No trades found between ${formatDate(fyStart)} and ${formatDate(firstTxDate)}. ` +
        `If you traded during this period, your CSV may be truncated.`
    });
  }

  // Check inter-transaction gaps
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i-1].tradeTimestamp, sorted[i].tradeTimestamp);
    if (gap > maxGapDays) {
      gaps.push({
        start: sorted[i-1].tradeTimestamp,
        end: sorted[i].tradeTimestamp,
        durationDays: gap,
        severity: gap > 45 ? 'warning' : 'info',
        possibleReason: `${gap}-day gap. This may be normal inactivity or missing data.`
      });
    }
  }

  // Check gap at end of FY
  const lastTxDate = sorted[sorted.length - 1].tradeTimestamp;
  const endGapDays = daysBetween(lastTxDate, fyEnd);
  if (endGapDays > maxGapDays) {
    gaps.push({
      start: lastTxDate, end: fyEnd,
      durationDays: endGapDays,
      severity: endGapDays > 30 ? 'warning' : 'info',
      possibleReason: `No trades after ${formatDate(lastTxDate)}. Verify CSV date range ends at 31 Mar.`
    });
  }

  // Check for truncated CSV: if last page has exactly N rows (500, 1000)
  const totalRows = sorted.length;
  if (totalRows % 500 === 0 || totalRows % 1000 === 0) {
    gaps.push({
      start: lastTxDate, end: fyEnd,
      durationDays: endGapDays,
      severity: 'warning',
      possibleReason: `CSV has exactly ${totalRows} rows — possible pagination truncation. ` +
        `Re-download with full date range or check CoinDCX for more pages.`
    });
  }

  return gaps;
}
```

### 4.4 Needs Review Bucket (Zero-Unclassified Rule)

```typescript
// CRITICAL RULE: Filing is BLOCKED until needsReview.length === 0

function classifyAllTransactions(
  transactions: NormalizedTransaction[]
): { classified: NormalizedTransaction[]; needsReview: NeedsReviewItem[] } {
  const classified: NormalizedTransaction[] = [];
  const needsReview: NeedsReviewItem[] = [];

  for (const tx of transactions) {
    const event = classifyVdaEvent(tx);
    
    if (event === 'UNKNOWN') {
      needsReview.push({
        transaction: tx,
        reason: 'unclassified_type',
        description: `Transaction type "${tx.transactionType}" on ${formatDate(tx.tradeTimestamp)} ` +
          `for ${tx.quantity} ${tx.assetSymbol} could not be auto-classified.`,
        suggestedActions: [
          { label: 'Mark as Spot Buy', value: 'buy' },
          { label: 'Mark as Spot Sell', value: 'sell' },
          { label: 'Mark as Internal Transfer (non-taxable)', value: 'transfer' },
          { label: 'Mark as Reward/Airdrop', value: 'reward' },
          { label: 'Exclude from computation', value: 'exclude' },
        ]
      });
      continue;
    }

    // Additional review triggers
    if (tx.quantity <= 0) {
      needsReview.push({
        transaction: tx, reason: 'suspicious_amount',
        description: `Zero or negative quantity (${tx.quantity}) for ${tx.assetSymbol}.`,
        suggestedActions: [
          { label: 'Fix quantity manually', value: 'edit' },
          { label: 'Exclude', value: 'exclude' },
        ]
      });
      continue;
    }

    if (tx.priceInr <= 0 && tx.grossAmountInr <= 0) {
      needsReview.push({
        transaction: tx, reason: 'missing_price',
        description: `No price data for ${tx.assetSymbol} trade on ${formatDate(tx.tradeTimestamp)}.`,
        suggestedActions: [
          { label: 'Enter price manually', value: 'edit' },
          { label: 'Use market price at time', value: 'auto_price' },
        ]
      });
      continue;
    }

    classified.push({ ...tx, event_class: event });
  }

  return { classified, needsReview };
}
```

---

## 5. Coverage & Completeness Dashboard

### 5.1 Dashboard Layout

```
╔══════════════════════════════════════════════════════════════════════╗
║                  DATA COVERAGE — FY 2024-25                         ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │  OVERALL STATUS:  🔴 DATA INCOMPLETE — DO NOT FILE             │  ║
║  │                                                                  │  ║
║  │  Coverage Score: ████████░░░░░░░░░░░░ 62%                       │  ║
║  │                                                                  │  ║
║  │  2 blockers must be resolved before tax computation              │  ║
║  │  3 items need your review                                        │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
║                                                                      ║
║  ═══ DATA SOURCES ═══                                                ║
║                                                                      ║
║  ✅ CoinDCX API Sync ............. 210 fills fetched (24 May 2024    ║
║     │                               — 28 Mar 2025)                   ║
║     └ ℹ️ API data is supplementary. CSVs are authoritative.          ║
║                                                                      ║
║  ✅ Order History CSV ............ 71 orders (01 Apr 2024            ║
║     │                               — 31 Mar 2025)   ✓ Full FY     ║
║     └ Uploaded: trades_fy25.csv (15 KB, 72 rows)                     ║
║                                                                      ║
║  ❌ TDS Summary CSV .............. NOT UPLOADED                       ║
║     │  ⛔ BLOCKER: Cannot compute accurate TDS credit without this   ║
║     │  ⛔ BLOCKER: May be missing Insta/P2P sell transactions        ║
║     └ [Upload Now]  [How to download from CoinDCX →]                 ║
║                                                                      ║
║  ⚠️ Insta History CSV ............ NOT UPLOADED                      ║
║     │  Status will update after TDS CSV is analyzed                   ║
║     └ [Upload]  [I don't use Instant Buy/Sell]                       ║
║                                                                      ║
║  ➖ Rewards CSV .................. Marked: Not Applicable             ║
║  ➖ Futures P&L .................. Marked: Not Applicable             ║
║                                                                      ║
║  ═══ RECONCILIATION RESULTS ═══                                      ║
║                                                                      ║
║  │ Check                    │ Status  │ Detail                    │  ║
║  ├──────────────────────────┼─────────┼───────────────────────────┤  ║
║  │ Date Range Coverage      │ ✅ Pass │ Full FY covered           │  ║
║  │ Duplicate Detection      │ ✅ Pass │ 12 dupes auto-resolved    │  ║
║  │ TDS Integrity            │ ❌ Fail │ TDS CSV not uploaded      │  ║
║  │ Inventory Balance        │ ⚠️ Warn │ SHIB: negative inventory  │  ║
║  │ Unclassified Txns        │ ⚠️ Warn │ 3 transactions need review│  ║
║  │ Cancelled Order Filter   │ ✅ Pass │ 0 cancelled orders found  │  ║
║  │ Internal Transfer Detect │ ✅ Pass │ 2 transfers identified    │  ║
║                                                                      ║
║  ═══ DATE RANGE COVERAGE ═══                                         ║
║                                                                      ║
║  Apr ██████ May ██████ Jun ██████ Jul ██████ Aug ██████ Sep ██████   ║
║  Oct ██████ Nov ██████ Dec ██████ Jan ██████ Feb ██████ Mar ██████   ║
║                                                                      ║
║  ✅ All months have trade activity — no suspicious gaps               ║
║                                                                      ║
║  ═══ KEY METRICS ═══                                                 ║
║                                                                      ║
║  │ Metric                   │ Expected │ Imported │ Status        │  ║
║  ├──────────────────────────┼──────────┼──────────┼───────────────┤  ║
║  │ Total Trades (orders)    │ ~71      │ 71       │ ✅ Match      │  ║
║  │ Total Sell Volume        │ ~₹28.7L  │ ₹28.7L   │ ✅ Match      │  ║
║  │ TDS Credit               │ ₹28,770  │ ₹0       │ ❌ Missing    │  ║
║  │ Unique Assets Traded     │ —        │ 8        │ ℹ️ Info       │  ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

### 5.2 Coverage Score Computation

```typescript
function computeCoverageScore(checklist: FYChecklist): number {
  let score = 0;
  const weights = {
    order_history_csv: 35,    // Core trade data
    tds_summary_csv: 30,      // TDS + Insta/P2P coverage
    api_sync: 10,             // Supplementary
    insta_history_csv: 10,    // If conditionally required
    rewards_csv: 10,          // If conditionally required
    futures_pnl_csv: 5,       // If conditionally required
  };

  for (const item of checklist.items) {
    const weight = weights[item.source] || 0;
    if (item.status === 'uploaded') {
      score += weight;
    } else if (item.status === 'not_applicable') {
      // Redistribute weight proportionally to other items
      score += weight * 0.5; // Partial credit for explicit N/A
    } else if (item.status === 'acknowledged_missing') {
      score += weight * 0.25; // Minimal credit for acknowledged gaps
    }
    // 'pending' = 0 points
  }

  // Penalty for unresolved issues
  const reviewPenalty = Math.min(20, checklist.needsReviewCount * 5);
  const gapPenalty = Math.min(15, checklist.blockerCount * 5);
  
  return Math.max(0, Math.min(100, score - reviewPenalty - gapPenalty));
}

function getCoverageLevel(score: number): CoverageLevel {
  if (score >= 95) return { level: 'complete', color: 'green', label: '✅ Safe to File', canFile: true };
  if (score >= 80) return { level: 'high', color: 'yellow', label: '⚠️ Mostly Complete — Review Warnings', canFile: true };
  if (score >= 60) return { level: 'medium', color: 'orange', label: '🟠 Significant Gaps — Tax Preview Unreliable', canFile: false };
  if (score >= 30) return { level: 'low', color: 'red', label: '🔴 Major Data Missing — Do Not File', canFile: false };
  return { level: 'critical', color: 'red', label: '🔴 Insufficient Data — Upload Required', canFile: false };
}
```

---

## 6. UI/UX for Upload, Validation & Error Handling

### 6.1 Tax Preview States

The tax computation UI has 4 mutually exclusive states:

```typescript
type TaxPreviewState =
  | 'LOCKED'           // Coverage < 60% OR blockers exist → computation disabled
  | 'INCOMPLETE'       // 60-80% coverage → shows estimate with huge "INCOMPLETE" watermark
  | 'WARNING'          // 80-95% → shows results with yellow warnings banner
  | 'READY';           // 95-100% → full results, "Safe to File" badge

// UI behavior per state:
const UI_STATES = {
  LOCKED: {
    showTaxComputation: false,
    showPreviewButton: true,       // But greyed out
    previewButtonLabel: 'Upload required data to enable tax preview',
    showWarningBanner: true,
    bannerType: 'error',
    bannerMessage: 'Tax computation is disabled. Upload all required files first.',
    allowExport: false,
    allowScheduleVDA: false,
  },
  INCOMPLETE: {
    showTaxComputation: true,
    showWatermark: true,           // "⚠️ INCOMPLETE — FOR REFERENCE ONLY"
    watermarkOpacity: 0.15,
    showWarningBanner: true,
    bannerType: 'warning',
    bannerMessage: 'These numbers are ESTIMATES based on partial data. ' +
                   'Do NOT use for filing. Upload remaining files for accurate computation.',
    allowExport: false,            // Cannot download Schedule VDA
    allowScheduleVDA: false,
  },
  WARNING: {
    showTaxComputation: true,
    showWarningBanner: true,
    bannerType: 'info',
    bannerMessage: 'Minor data gaps detected. Review warnings below before filing.',
    allowExport: true,
    allowScheduleVDA: true,
    showAcknowledgementCheckbox: true,
  },
  READY: {
    showTaxComputation: true,
    showWarningBanner: false,
    showSafeToFileBadge: true,
    allowExport: true,
    allowScheduleVDA: true,
  }
};
```

### 6.2 Tax Summary with Drill-Down (READY state)

```
╔══════════════════════════════════════════════════════════════════╗
║  TAX SUMMARY — FY 2024-25 (AY 2025-26)     ✅ Safe to File     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ═══ CAPITAL GAINS (Section 115BBH) ═══                          ║
║                                                                  ║
║  │ Category      │ Sale Consid. │ Cost of Acq. │ Gain/Loss  │   ║
║  ├───────────────┼──────────────┼──────────────┼────────────┤   ║
║  │ Spot Trades   │ ₹28,10,432   │ ₹26,46,801   │ ₹1,63,631  │   ║
║  │ Insta Trades  │ ₹0           │ ₹0           │ ₹0         │   ║
║  │ P2P Trades    │ ₹0           │ ₹0           │ ₹0         │   ║
║  │ Futures       │ ₹0           │ ₹0           │ ₹0         │   ║
║  ├───────────────┼──────────────┼──────────────┼────────────┤   ║
║  │ TOTAL         │ ₹28,10,432   │ ₹26,46,801   │ ₹1,63,631  │   ║
║  └───────────────┴──────────────┴──────────────┴────────────┘   ║
║                                                                  ║
║  [▶ View per-asset breakdown]  [▶ View per-trade drill-down]     ║
║                                                                  ║
║  ═══ PER-ASSET BREAKDOWN (click to expand) ═══                   ║
║                                                                  ║
║  ▶ BTC (Bitcoin) .......... Gain: ₹89,432    [12 trades]         ║
║  ▶ ETH (Ethereum) ........ Gain: ₹45,200    [8 trades]          ║
║  ▶ SOL (Solana) ........... Loss: ₹-12,100   [5 trades]         ║
║  ▶ SHIB (Shiba Inu) ...... Gain: ₹41,099    [46 trades]        ║
║                                                                  ║
║  ═══ OTHER VDA INCOME (Section 56/115BBH) ═══                    ║
║                                                                  ║
║  │ Type              │ Amount      │ Tax Treatment           │   ║
║  ├────────────────────┼─────────────┼─────────────────────────┤   ║
║  │ Staking Rewards    │ ₹1,240.50  │ 30% flat (conservative) │   ║
║  │ Interest Earned    │ ₹600.45    │ 30% flat (conservative) │   ║
║  │ Airdrops           │ ₹0         │ —                       │   ║
║  ├────────────────────┼─────────────┼─────────────────────────┤   ║
║  │ TOTAL              │ ₹1,840.95  │                         │   ║
║                                                                  ║
║  ═══ TAX COMPUTATION ═══                                         ║
║                                                                  ║
║  Taxable Capital Gains .... ₹1,63,631                            ║
║  + Other VDA Income ....... ₹1,841                               ║
║  = Total Taxable VDA ...... ₹1,65,472                            ║
║                                                                  ║
║  Tax @ 30% ................ ₹49,642                              ║
║  + Surcharge .............. ₹0                                   ║
║  + Cess @ 4% .............. ₹1,986                               ║
║  = Total Tax Liability .... ₹51,628                              ║
║                                                                  ║
║  - TDS Credit (194S) ...... ₹28,770                              ║
║  = Net Tax Payable ........ ₹22,858                              ║
║                                                                  ║
║  [Download Schedule VDA CSV]  [Download Tax Report PDF]          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 6.3 Per-Trade Drill-Down (from asset click)

When user clicks on an asset (e.g., BTC), they see:

```
DRILL-DOWN: BTC (Bitcoin) — FY 2024-25
═══════════════════════════════════════

│ # │ Date       │ Type │ Qty      │ Buy Price │ Sell Price │ Cost     │ Sale     │ Gain/Loss │ FIFO Lots Used │
├───┼────────────┼──────┼──────────┼───────────┼────────────┼──────────┼──────────┼───────────┼────────────────┤
│ 1 │ 15 May '24 │ Sell │ 0.005    │ ₹42,100   │ ₹53,200   │ ₹210.50  │ ₹266.00  │ +₹55.50   │ lot-BTC-1      │
│ 2 │ 22 Jul '24 │ Sell │ 0.010    │ ₹41,800   │ ₹55,100   │ ₹418.00  │ ₹551.00  │ +₹133.00  │ lot-BTC-1,2    │
│ … │ …          │ …    │ …        │ …         │ …          │ …        │ …        │ …         │ …              │
│12 │ 28 Mar '25 │ Sell │ 0.002    │ ₹44,500   │ ₹71,200   │ ₹89.00   │ ₹142.40  │ +₹53.40   │ lot-BTC-5      │
├───┴────────────┴──────┴──────────┴───────────┴────────────┴──────────┴──────────┴───────────┴────────────────┤
│                                                    TOTAL: │ ₹8,932   │ ₹12,876  │ +₹3,944   │               │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Filing Safeguards & Override Protocol

### 7.1 Filing Gate Logic

```typescript
interface FilingGateResult {
  canFile: boolean;
  blockers: FilingBlocker[];       // Must ALL be resolved to file
  warnings: FilingWarning[];       // Should review but non-blocking
  overrideAvailable: boolean;      // true only if no HARD blockers
}

type HardBlocker = 
  | 'NO_TRADE_DATA'               // No Order History CSV uploaded
  | 'NO_TDS_DATA'                 // No TDS Summary CSV uploaded  
  | 'UNRESOLVED_REVIEW_ITEMS'     // Transactions in "Needs Review" bucket
  | 'ZERO_TRANSACTIONS_IN_FY';    // No transactions found for selected FY

type SoftBlocker = 
  | 'MISSING_INSTA_CSV'           // Insta trades detected but no CSV
  | 'NEGATIVE_INVENTORY'          // Some assets have missing buys
  | 'TDS_MISMATCH_OVER_5PCT'     // TDS discrepancy > 5%
  | 'DATE_RANGE_GAP'             // Suspicious gaps in trade dates
  | 'LOW_COVERAGE_SCORE';        // Score < 80%

function evaluateFilingGate(
  checklist: FYChecklist,
  reconciliation: ReconciliationResult,
  needsReviewCount: number
): FilingGateResult {
  const blockers: FilingBlocker[] = [];
  const warnings: FilingWarning[] = [];

  // HARD BLOCKERS — Cannot be overridden
  if (checklist.items.find(i => i.source === 'order_history_csv')?.status === 'pending') {
    blockers.push({
      type: 'NO_TRADE_DATA',
      severity: 'hard',
      message: 'Order History CSV is required. Upload from CoinDCX → Orders → Filled Orders.',
      canOverride: false,
    });
  }

  if (needsReviewCount > 0) {
    blockers.push({
      type: 'UNRESOLVED_REVIEW_ITEMS',
      severity: 'hard',
      message: `${needsReviewCount} transaction(s) need your review before filing.`,
      canOverride: false,
    });
  }

  // SOFT BLOCKERS — Can be overridden with explicit acknowledgement
  if (checklist.items.find(i => i.source === 'tds_summary_csv')?.status === 'pending') {
    blockers.push({
      type: 'NO_TDS_DATA',
      severity: 'soft',
      message: 'TDS Summary CSV not uploaded. TDS credit will be estimated at 1% of sell volume.',
      canOverride: true,
      riskDescription: 'Your TDS credit may be inaccurate. This could result in paying more tax than necessary or an incorrect refund claim.',
    });
  }

  const hasHardBlockers = blockers.some(b => b.severity === 'hard');
  
  return {
    canFile: blockers.length === 0,
    blockers,
    warnings,
    overrideAvailable: !hasHardBlockers && blockers.length > 0,
  };
}
```

### 7.2 Override Protocol (For Soft Blockers Only)

```
╔══════════════════════════════════════════════════════════════════╗
║           ⚠️ DATA INCOMPLETE — OVERRIDE REQUIRED                ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  The following data gaps have been detected:                     ║
║                                                                  ║
║  1. ❌ TDS Summary CSV not uploaded                              ║
║     Risk: TDS credit estimated, not actual. May differ by ₹500+ ║
║                                                                  ║
║  2. ⚠️ Insta History CSV not uploaded                            ║
║     Risk: 3 sell transactions lack buy-side cost basis.          ║
║     Impact: Cost of acquisition estimated from market price.     ║
║                                                                  ║
║  ─────────────────────────────────────────────────────────────── ║
║                                                                  ║
║  To proceed despite incomplete data, you must:                   ║
║                                                                  ║
║  □ I understand my tax computation may be inaccurate             ║
║  □ I accept responsibility for any discrepancies                 ║
║  □ I acknowledge that the Income Tax Department may flag         ║
║    differences between my reported TDS and Form 26AS             ║
║                                                                  ║
║  Type "I ACCEPT THE RISK" to proceed:                            ║
║  ┌──────────────────────────────────────────────────────────┐    ║
║  │                                                          │    ║
║  └──────────────────────────────────────────────────────────┘    ║
║                                                                  ║
║  [Cancel — Go Back to Upload]          [Proceed with Override]   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 7.3 Override Audit Log

```typescript
interface OverrideRecord {
  userId: string;
  financialYear: string;
  overriddenBlockers: SoftBlocker[];
  acknowledgedRisks: string[];
  typedConfirmation: string;       // Must exactly match "I ACCEPT THE RISK"
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  coverageScoreAtOverride: number;
  computationHashAtOverride: string; // Hash of tax result at time of override
}
```

---

## 8. Technical Implementation Map

### 8.1 New Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/taxmitra/reconciliation-engine.ts` | Full reconciliation pipeline (§4) | P0 |
| `src/lib/taxmitra/coverage-tracker.ts` | FY checklist + coverage score (§5) | P0 |
| `src/lib/taxmitra/filing-gate.ts` | Filing safeguards + override protocol (§7) | P0 |
| `src/lib/taxmitra/gap-detector.ts` | Date range + truncation + gap detection (§4.3) | P1 |
| `src/lib/taxmitra/duplicate-detector.ts` | 3-layer duplicate detection (§4.2) | P1 |
| `src/lib/taxmitra/needs-review-service.ts` | Manage "Needs Review" bucket (§4.4) | P1 |
| `src/components/taxmitra/CoverageDashboard.tsx` | Coverage & completeness UI (§5.1) | P1 |
| `src/components/taxmitra/DataUploadWizard.tsx` | Step-by-step upload flow (§3.1) | P1 |
| `src/components/taxmitra/FilingGateModal.tsx` | Override confirmation modal (§7.2) | P2 |
| `src/components/taxmitra/NeedsReviewPanel.tsx` | Transaction review UI (§4.4) | P2 |
| `src/components/taxmitra/TaxDrillDown.tsx` | Per-asset, per-trade drill-down (§6.3) | P2 |

### 8.2 Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Crypto.tsx` | Integrate CoverageDashboard, gate tax preview, add drill-down |
| `src/lib/taxmitra/tax-computation-engine.ts` | Add `dataCoverage` check before computation, emit NeedsReview items |
| `src/lib/taxmitra/coindcx-ingestion.ts` | Add truncation detection, row-count validation |
| `src/lib/taxmitra/merge-engine.ts` | Integrate duplicate-detector, emit duplicate candidates |
| `src/lib/coindcx-api.ts` | Add pagination gap detection, sync metadata |

### 8.3 Implementation Phases

**Phase 1 (Week 1): Foundation**
- Create `fy_data_checklist` + `data_gap_registry` + `needs_review_transactions` tables
- Build `coverage-tracker.ts` with checklist state machine
- Build `CoverageDashboard.tsx` component
- Wire checklist into Crypto.tsx — show before tax computation

**Phase 2 (Week 2): Reconciliation**
- Build `reconciliation-engine.ts` with all 8 pipeline steps
- Build `gap-detector.ts` for date range analysis
- Build `duplicate-detector.ts` with 3-layer matching
- Build `needs-review-service.ts` for unclassified transaction management

**Phase 3 (Week 3): Filing Safeguards**
- Build `filing-gate.ts` with hard/soft blocker evaluation
- Build `FilingGateModal.tsx` with typed confirmation
- Build `NeedsReviewPanel.tsx` for transaction classification UI
- Integrate all gates into Crypto.tsx export flow

**Phase 4 (Week 4): Polish**
- Build `TaxDrillDown.tsx` for per-asset, per-trade breakdown
- Add "How to download" tooltips with CoinDCX screenshots
- Add conditional requirement auto-detection
- End-to-end testing with real CoinDCX data

---

*Specification generated for TaxMitra v6.0.0 — 2026-02-24*
