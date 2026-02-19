# TaxMitra Crypto Tax Engine — Production Architecture v5

> **Date:** 2026-02-19 | **Engine Version:** 5.0.0  
> **Compliance:** Section 115BBH, Section 194S, Schedule VDA  
> **Status:** Implementation-Ready

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [Data Sync Strategy](#3-data-sync-strategy)
4. [FIFO Engine Design](#4-fifo-engine-design)
5. [Other Income Engine](#5-other-income-engine)
6. [Financial Year Reporting](#6-financial-year-reporting)
7. [Edge Case Handling](#7-edge-case-handling)
8. [Reconciliation Engine](#8-reconciliation-engine)
9. [Performance Strategy](#9-performance-strategy)

---

## 1. System Architecture

### 1.1 Architecture Diagram (Text)

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React/TS)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Crypto   │  │ CSV      │  │ Dashboard│  │ Schedule VDA   │  │
│  │ Settings │  │ Upload   │  │ Summary  │  │ Report Export  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │
│       │              │             │                │            │
│  ─────┴──────────────┴─────────────┴────────────────┴────────── │
│                     Crypto Page (Crypto.tsx)                      │
└──────────────────────────────┬───────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
│  DATA SYNC LAYER │ │ CSV INGESTION   │ │ MERGE & DEDUP ENGINE │
│                  │ │                 │ │                      │
│ coindcx-api.ts   │ │ coindcx-        │ │ merge-engine.ts      │
│                  │ │ ingestion.ts    │ │ (NEW)                │
│ • Paginated API  │ │                 │ │                      │
│ • Gap detection  │ │ • Trades CSV    │ │ • Content hash dedup │
│ • Rate limiting  │ │ • Deposits CSV  │ │ • Timestamp+qty hash │
│ • Incremental    │ │ • Withdrawals   │ │ • Source priority     │
│   sync           │ │ • TDS CSV       │ │ • Conflict resolution│
│                  │ │ • Rewards CSV   │ │                      │
└────────┬─────────┘ └───────┬─────────┘ └──────────┬───────────┘
         │                   │                      │
         └───────────────────┴──────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ NORMALIZED      │
                    │ TRANSACTION     │
                    │ STORE           │
                    │                 │
                    │ normalized_     │
                    │ transactions    │
                    │ (Supabase)      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ FIFO INVENTORY  │
                    │ ENGINE          │
                    │                 │
                    │ tax-computation │
                    │ -engine.ts      │
                    │                 │
                    │ • Global FIFO   │
                    │ • All-year lots │
                    │ • FY filtering  │
                    │   at report lvl │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌───────────┐ ┌──────────────┐
     │ CAPITAL GAINS│ │ OTHER     │ │ TDS          │
     │ REPORT       │ │ INCOME    │ │ RECONCILE    │
     │              │ │           │ │              │
     │ Schedule VDA │ │ Staking   │ │ Trade TDS vs │
     │ CSV/PDF      │ │ Rewards   │ │ 26AS/Certs   │
     └──────────────┘ │ Interest  │ └──────────────┘
                      └───────────┘
```

### 1.2 Module Breakdown

| Module | File | Responsibility |
|--------|------|---------------|
| **API Sync** | `coindcx-api.ts` | Paginated fetch, rate limiting, gap detection |
| **CSV Ingestion** | `coindcx-ingestion.ts` | Parse all CSV types, normalize to common schema |
| **Merge Engine** | `merge-engine.ts` (NEW) | Deduplicate API + CSV, resolve conflicts |
| **Inventory Engine** | `tax-computation-engine.ts` | Global FIFO across all years, lot matching |
| **Reporting** | `tax-computation-engine.ts` | FY-filtered gains, Schedule VDA generation |
| **Reconciliation** | `reconciliation-engine.ts` (NEW) | TDS/volume/inventory cross-checks |
| **Sync Metadata** | `sync-service.ts` (NEW) | Track sync state, gaps, last sync timestamps |

---

## 2. Database Schema

### 2.1 Core Tables

```sql
-- ══════════════════════════════════════════════════════════════
-- TABLE 1: raw_transactions
-- Purpose: Immutable audit log of every data point ingested.
-- Never modified after insert. Source of truth for re-processing.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.raw_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source identification
  source          text NOT NULL,         -- 'api_spot', 'api_margin', 'api_futures', 'api_deposit', 'api_withdrawal', 'api_reward', 'csv_trades', 'csv_deposits', 'csv_withdrawals', 'csv_tds', 'csv_rewards', 'manual'
  exchange        text NOT NULL DEFAULT 'CoinDCX',
  external_id     text,                  -- Exchange-assigned ID (trade ID, order ID, etc.)
  
  -- Content hash for idempotent re-imports
  content_hash    text NOT NULL,         -- SHA-256 of canonical row data
  
  -- Raw data (immutable)
  raw_payload     jsonb NOT NULL,        -- Complete original record
  
  -- Sync metadata
  sync_session_id uuid NOT NULL,         -- Links to sync_logs
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  
  -- Dedup index: prevent re-importing same record
  UNIQUE(user_id, content_hash)
);

CREATE INDEX idx_raw_tx_user ON public.raw_transactions(user_id);
CREATE INDEX idx_raw_tx_sync ON public.raw_transactions(sync_session_id);
CREATE INDEX idx_raw_tx_source ON public.raw_transactions(user_id, source);


-- ══════════════════════════════════════════════════════════════
-- TABLE 2: normalized_transactions
-- Purpose: Cleaned, typed, INR-valued transactions ready for
-- the FIFO engine. Derived from raw_transactions.
-- Can be recomputed from raw_transactions at any time.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.normalized_transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_transaction_id  uuid REFERENCES public.raw_transactions(id),
  
  -- Core fields
  external_id         text NOT NULL,
  exchange            text NOT NULL DEFAULT 'CoinDCX',
  transaction_type    text NOT NULL,      -- 'buy', 'sell', 'swap_in', 'swap_out', 'deposit', 'withdrawal', 'reward_staking', 'reward_interest', 'reward_airdrop', 'p2p_buy', 'p2p_sell', 'futures_settlement', 'manual'
  event_class         text NOT NULL,      -- VdaEventType enum: 'SPOT_BUY', 'SPOT_SELL', etc.
  is_taxable_event    boolean NOT NULL DEFAULT false,
  
  -- Asset details
  asset_symbol        text NOT NULL,
  quote_asset         text NOT NULL DEFAULT 'INR',
  pair                text NOT NULL,
  
  -- Amounts
  quantity            numeric(20,10) NOT NULL,
  price_per_unit      numeric(20,6) NOT NULL,  -- in quote currency
  price_inr           numeric(20,6) NOT NULL,  -- in INR
  gross_amount_quote  numeric(20,6) NOT NULL,
  gross_amount_inr    numeric(20,6) NOT NULL,
  
  -- Fees
  fee_amount          numeric(20,10) DEFAULT 0,
  fee_asset           text DEFAULT 'INR',
  fee_inr             numeric(20,6) DEFAULT 0,
  
  -- TDS
  tds_amount          numeric(15,4) DEFAULT 0,
  tds_rate            numeric(5,4) DEFAULT 0,
  
  -- Temporal
  trade_timestamp     timestamptz NOT NULL,
  financial_year      text NOT NULL,      -- '2024-25'
  assessment_year     text NOT NULL,      -- '2025-26'
  
  -- Source tracking
  source              text NOT NULL,      -- 'api', 'csv', 'manual'
  source_priority     int NOT NULL DEFAULT 1, -- 1=api (highest), 2=csv, 3=manual
  content_hash        text NOT NULL,
  
  -- Metadata
  description         text,
  order_id            text,
  tx_hash             text,
  counter_asset       text,
  counter_quantity    numeric(20,10),
  
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  
  -- Dedup: one normalized record per source content hash per user
  UNIQUE(user_id, content_hash)
);

CREATE INDEX idx_norm_tx_user_ts ON public.normalized_transactions(user_id, trade_timestamp);
CREATE INDEX idx_norm_tx_user_fy ON public.normalized_transactions(user_id, financial_year);
CREATE INDEX idx_norm_tx_asset ON public.normalized_transactions(user_id, asset_symbol);
CREATE INDEX idx_norm_tx_event ON public.normalized_transactions(user_id, event_class);


-- ══════════════════════════════════════════════════════════════
-- TABLE 3: inventory_lots
-- Purpose: FIFO inventory state. Recomputed on each engine run.
-- Stores the current state of all buy lots (consumed + remaining).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,      -- Links to computation run
  
  -- Lot details
  lot_id              text NOT NULL,       -- 'lot-BTC-42'
  buy_transaction_id  text NOT NULL,       -- Links to normalized_transactions.external_id
  asset_symbol        text NOT NULL,
  
  -- Quantities
  original_quantity   numeric(20,10) NOT NULL,
  remaining_quantity  numeric(20,10) NOT NULL,
  is_fully_consumed   boolean NOT NULL DEFAULT false,
  
  -- Cost basis
  cost_basis_per_unit numeric(20,6) NOT NULL,  -- INR
  total_cost_inr      numeric(20,6) NOT NULL,
  
  -- Temporal
  acquisition_date    timestamptz NOT NULL,
  acquisition_type    text NOT NULL,       -- 'purchase', 'swap', 'reward', 'transfer', 'airdrop'
  financial_year      text NOT NULL,
  
  -- Source
  exchange            text NOT NULL DEFAULT 'CoinDCX',
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lots_user ON public.inventory_lots(user_id, computation_id);
CREATE INDEX idx_lots_asset ON public.inventory_lots(user_id, asset_symbol, is_fully_consumed);


-- ══════════════════════════════════════════════════════════════
-- TABLE 4: disposal_events
-- Purpose: Each FIFO lot match for a disposal (sell).
-- One sell may produce multiple disposal_events (one per lot consumed).
-- Only disposals in the target FY are included in tax reports.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.disposal_events (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  
  -- Transaction links
  sell_transaction_id text NOT NULL,
  buy_lot_id          text NOT NULL,
  
  -- Asset
  asset_symbol        text NOT NULL,
  matched_quantity    numeric(20,10) NOT NULL,
  
  -- Financials
  buy_price_per_unit  numeric(20,6) NOT NULL,
  sell_price_per_unit numeric(20,6) NOT NULL,
  cost_of_acquisition numeric(20,6) NOT NULL,   -- INR
  sale_consideration  numeric(20,6) NOT NULL,    -- INR
  gain_loss           numeric(20,6) NOT NULL,    -- INR (positive=gain, negative=loss)
  
  -- Dates (for Schedule VDA)
  buy_date            timestamptz NOT NULL,
  sell_date           timestamptz NOT NULL,
  holding_days        int NOT NULL,
  
  -- Classification
  accounting_method   text NOT NULL DEFAULT 'FIFO',
  financial_year      text NOT NULL,     -- FY of the DISPOSAL (for reporting)
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_disposal_user_fy ON public.disposal_events(user_id, financial_year);
CREATE INDEX idx_disposal_computation ON public.disposal_events(computation_id);


-- ══════════════════════════════════════════════════════════════
-- TABLE 5: other_income_events
-- Purpose: Rewards, staking, interest, airdrops valued at FMV.
-- Taxed under Section 56 / 115BBH at 30%.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.other_income_events (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  
  -- Transaction link
  transaction_id      text NOT NULL,
  
  -- Details
  income_type         text NOT NULL,      -- 'staking', 'interest', 'airdrop', 'referral', 'mining', 'cashback'
  asset_symbol        text NOT NULL,
  quantity            numeric(20,10) NOT NULL,
  price_inr_at_receipt numeric(20,6) NOT NULL,
  gross_value_inr     numeric(20,6) NOT NULL,
  
  -- Temporal
  receipt_date        timestamptz NOT NULL,
  financial_year      text NOT NULL,
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_other_income_user_fy ON public.other_income_events(user_id, financial_year);


-- ══════════════════════════════════════════════════════════════
-- TABLE 6: sync_logs
-- Purpose: Track every sync session (API fetch or CSV import).
-- Used for incremental sync, gap detection, audit trail.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session info
  sync_type           text NOT NULL,      -- 'api_full', 'api_incremental', 'csv_import', 'manual_entry'
  exchange            text NOT NULL DEFAULT 'CoinDCX',
  status              text NOT NULL DEFAULT 'in_progress',  -- 'in_progress', 'completed', 'failed', 'partial'
  
  -- Stats
  total_records_fetched   int DEFAULT 0,
  new_records_added       int DEFAULT 0,
  duplicate_records       int DEFAULT 0,
  error_records           int DEFAULT 0,
  
  -- Temporal range of fetched data
  earliest_tx_date    timestamptz,
  latest_tx_date      timestamptz,
  
  -- Gap detection
  has_data_gaps       boolean DEFAULT false,
  gap_details         jsonb,              -- [{start: '...', end: '...', reason: '...'}]
  
  -- API pagination state
  last_from_id        text,               -- For resumable pagination
  last_timestamp      bigint,             -- For incremental sync
  
  -- Completion
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  error_message       text,
  warnings            text[],
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_user ON public.sync_logs(user_id, exchange);
CREATE INDEX idx_sync_status ON public.sync_logs(user_id, status);


-- ══════════════════════════════════════════════════════════════
-- TABLE 7: reconciliation_logs
-- Purpose: Store results of reconciliation checks.
-- Compares computed totals vs exchange data vs KoinX/26AS.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  financial_year      text NOT NULL,
  
  -- Reconciliation type
  recon_type          text NOT NULL,      -- 'tds', 'sell_volume', 'inventory', 'trade_count'
  
  -- Expected vs Actual
  expected_value      numeric(20,6),
  computed_value      numeric(20,6),
  discrepancy         numeric(20,6),
  discrepancy_pct     numeric(8,4),
  
  -- Status
  status              text NOT NULL,      -- 'matched', 'minor_discrepancy', 'major_discrepancy'
  details             jsonb,              -- Detailed breakdown
  
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recon_user_fy ON public.reconciliation_logs(user_id, financial_year);


-- ══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.raw_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own raw_tx" ON public.raw_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own norm_tx" ON public.normalized_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own lots" ON public.inventory_lots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own disposals" ON public.disposal_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own income" ON public.other_income_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own sync" ON public.sync_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own recon" ON public.reconciliation_logs FOR ALL USING (auth.uid() = user_id);
```

---

## 3. Data Sync Strategy

### 3.A Full Historical Sync (API)

```
PROCEDURE: full_historical_sync(credentials, onProgress)
─────────────────────────────────────────────────────────
1. Create sync_log entry (status='in_progress')
2. Validate credentials via /exchange/v1/users/balances
3. Fetch market details for symbol mapping
4. Fetch live ticker rates (for reward valuation)

5. PAGINATED TRADE FETCH:
   ┌─────────────────────────────────────────────────┐
   │  from_id = null                                  │
   │  all_trades = []                                 │
   │                                                  │
   │  LOOP:                                           │
   │    response = POST /exchange/v1/orders/           │
   │               trade_history                      │
   │               { limit: 500, from_id: from_id }   │
   │                                                  │
   │    IF response.data.length == 0 → BREAK          │
   │                                                  │
   │    all_trades.extend(response.data)               │
   │    from_id = response.data.last().id              │
   │                                                  │
   │    IF response.data.length < 500 → BREAK         │
   │    (last page reached)                            │
   │                                                  │
   │    SLEEP 200ms  (rate limiting)                   │
   │  END LOOP                                        │
   │                                                  │
   │  MAX_PAGES = 20 (safety: 10,000 trades max)      │
   └─────────────────────────────────────────────────┘

6. Fetch margin orders (POST /exchange/v1/margin/fetch_orders)
7. Fetch futures positions
8. Fetch deposits & withdrawals
9. Fetch lending/staking rewards
10. Normalize ALL records → NormalizedTransaction[]
11. Compute content_hash for each record
12. Upsert into raw_transactions (ON CONFLICT content_hash DO NOTHING)
13. Upsert into normalized_transactions
14. Run gap detection → update sync_log
15. Update sync_log (status='completed', stats)
```

**Incremental Sync (Timestamp-Based):**

```
PROCEDURE: incremental_sync(credentials)
────────────────────────────────────────
1. Load last sync_log for this user+exchange
2. from_timestamp = last_sync.latest_tx_date (minus 1 hour buffer)
3. Fetch trades with { from_timestamp, limit: 500 }
4. Paginate until exhausted
5. Deduplicate against existing content_hashes
6. Insert only new records
7. Re-run FIFO engine (full history, not just new records)
```

### 3.B CSV Import Layer

```
PROCEDURE: csv_import(files[], financialYear)
─────────────────────────────────────────────
1. Create sync_log (sync_type='csv_import')
2. For each file:
   a. Auto-detect file type (trades/deposits/withdrawals/tds/rewards)
   b. Parse using appropriate parser (coindcx-ingestion.ts)
   c. For each parsed row:
      - Compute content_hash = SHA256(canonical_row_string)
      - Check against existing raw_transactions.content_hash
      - IF duplicate → skip, increment duplicate_count
      - IF new → insert into raw_transactions + normalized_transactions
3. Merge with existing API data (see 3.C below)
4. Update sync_log with stats
5. Re-run FIFO engine
```

**CSV-to-Normalized Field Mapping:**

| CSV Column | Normalized Field | Notes |
|-----------|-----------------|-------|
| Trade Time / Date | trade_timestamp | Parse via robust date parser |
| Symbol / Pair | asset_symbol, quote_asset | Extract via pair parser |
| Side / Type | transaction_type | Map buy/sell/swap |
| Quantity / Volume | quantity | |
| Price | price_per_unit, price_inr | Convert via historical FX |
| Fee / Commission | fee_amount, fee_inr | Convert if non-INR |
| Order ID | order_id, external_id | Primary dedup key |
| TDS | tds_amount | From TDS CSV |

**Duplicate Detection (Two-Layer):**

```python
# Layer 1: Exchange Transaction ID match
def is_duplicate_by_id(new_tx, existing_txs):
    return any(
        e.external_id == new_tx.external_id 
        or e.order_id == new_tx.order_id
        for e in existing_txs
    )

# Layer 2: Fingerprint hash (for records without matching IDs)
def compute_fingerprint(tx):
    canonical = f"{tx.trade_timestamp.isoformat()}|{tx.asset_symbol}|{tx.quantity:.10f}|{tx.transaction_type}|{tx.price_per_unit:.6f}"
    return sha256(canonical)

def is_duplicate_by_fingerprint(new_tx, existing_txs):
    fp = compute_fingerprint(new_tx)
    return any(compute_fingerprint(e) == fp for e in existing_txs)
```

### 3.C Gap Detection Logic

```python
def detect_data_gaps(user_id, sync_result):
    gaps = []
    
    # Gap 1: API doesn't go back far enough
    api_first_date = min(tx.trade_timestamp for tx in sync_result.api_transactions)
    # If user claims account was created before API's earliest record
    if user_account_creation_date and api_first_date > user_account_creation_date + timedelta(days=30):
        gaps.append({
            'type': 'HISTORICAL_GAP',
            'start': user_account_creation_date,
            'end': api_first_date,
            'severity': 'critical',
            'action': 'REQUIRE_CSV_UPLOAD',
            'message': f'API data starts {api_first_date}. Account may have earlier trades. Upload CSV for complete history.'
        })
    
    # Gap 2: Negative inventory detected
    for asset, neg_count in inventory_check.items():
        if neg_count > 0:
            gaps.append({
                'type': 'MISSING_BUY_DATA',
                'asset': asset,
                'severity': 'critical',
                'action': 'REQUIRE_CSV_UPLOAD',
                'message': f'{asset}: {neg_count} sell(s) without matching buy lots. Missing purchase history.'
            })
    
    # Gap 3: Sell volume mismatch vs exchange reported totals
    api_sell_volume = sum(tx.gross_amount_inr for tx in sells)
    if known_exchange_sell_volume:
        pct_diff = abs(api_sell_volume - known_exchange_sell_volume) / known_exchange_sell_volume
        if pct_diff > 0.05:  # >5% difference
            gaps.append({
                'type': 'VOLUME_MISMATCH',
                'severity': 'warning',
                'expected': known_exchange_sell_volume,
                'actual': api_sell_volume,
                'action': 'SUGGEST_CSV_UPLOAD'
            })
    
    # Gap 4: TDS mismatch
    computed_tds = api_sell_volume * 0.01
    if known_tds_from_26as:
        if abs(computed_tds - known_tds_from_26as) > 500:  # >₹500 diff
            gaps.append({
                'type': 'TDS_MISMATCH',
                'severity': 'warning',
                'computed': computed_tds,
                'expected_26as': known_tds_from_26as,
                'action': 'UPLOAD_TDS_CSV'
            })
    
    return gaps
```

---

## 4. FIFO Engine Design

### 4.1 Core Rules (Indian VDA Taxation)

| Rule | Implementation | Legal Basis |
|------|---------------|-------------|
| Global inventory from inception | Process ALL transactions from day 1 | FIFO principle |
| Chronological ordering | Sort by trade_timestamp ASC | FIFO definition |
| BUY → add lot | Create TaxLot with qty, cost, date | Cost of acquisition |
| SELL → consume oldest lots | FIFO: consume earliest available lot | Section 115BBH |
| Brokerage excluded from cost | Fee NOT added to cost basis | Section 115BBH(2) |
| No loss offset | Losses tracked but cannot reduce gains | Section 115BBH(2)(b) |
| 30% flat tax | grossGains × 0.30 | Section 115BBH(1) |
| 4% cess | (tax + surcharge) × 0.04 | Finance Act |
| Stablecoins = VDA | USDT/USDC trades are taxable | VDA definition |

### 4.2 FIFO Pseudocode

```python
def compute_fifo_for_user(all_transactions, target_fy):
    """
    CRITICAL ARCHITECTURE:
    - Process ALL transactions from account inception (all FYs)
    - Build global FIFO queue chronologically
    - ALL sells consume lots (including prior-year sells)
    - ONLY REPORT gains for disposals where sell_date ∈ target_fy
    """
    
    # Step 1: Classify every transaction
    for tx in all_transactions:
        tx.event_class = classify_vda_event(tx)
    
    # Step 2: Group by asset
    by_asset = group_by(all_transactions, key=lambda tx: tx.asset_symbol)
    
    results = {}
    for asset, txs in by_asset.items():
        # Step 3: Sort chronologically (CRITICAL for FIFO)
        txs.sort(key=lambda tx: tx.trade_timestamp)
        
        inventory = []        # FIFO queue of TaxLot
        fy_matches = []       # LotMatch records for target FY only
        fy_gains = 0
        fy_losses = 0
        
        for tx in txs:
            event = tx.event_class
            is_target_fy = (tx.financial_year == target_fy)
            
            # Skip non-inventory events
            if event in ['TRANSFER_SELF', 'DEPOSIT_FIAT', 'WITHDRAW_FIAT', 'FEE_ONLY', 'UNKNOWN']:
                continue
            
            if is_acquisition(event):
                # ── ADD LOT ──
                net_qty = tx.quantity
                cost_per_unit = tx.price_inr  # INR cost
                
                # Fee in base asset reduces quantity (physical fact)
                if tx.fee_asset == asset and tx.fee_amount > 0:
                    net_qty = max(0, tx.quantity - tx.fee_amount)
                
                # NOTE: Fee in quote currency is NOT added to cost
                # per 115BBH — only "cost of acquisition" is deductible
                
                if net_qty <= 0:
                    continue
                
                lot = TaxLot(
                    id=f"lot-{asset}-{counter}",
                    buy_tx_id=tx.external_id,
                    asset=asset,
                    original_qty=net_qty,
                    remaining_qty=net_qty,
                    cost_per_unit=cost_per_unit,
                    acquisition_date=tx.trade_timestamp,
                    acquisition_type=map_event_to_acq_type(event),
                    fy=tx.financial_year,
                )
                inventory.append(lot)
            
            elif is_disposal(event):
                # ── CONSUME FIFO LOTS ──
                # CRITICAL: Process ALL sells, not just target FY
                remaining = tx.quantity
                sale_price = tx.price_inr
                
                # Negative inventory check
                available = sum(lot.remaining_qty for lot in inventory)
                if available < remaining - 1e-8:
                    log_warning(f"{asset}: Selling {remaining} but only {available} available")
                
                while remaining > 1e-8 and inventory:
                    lot = inventory[0]  # FIFO: oldest lot
                    
                    if lot.remaining_qty <= 0:
                        inventory.pop(0)
                        continue
                    
                    matched = min(lot.remaining_qty, remaining)
                    proceeds = matched * sale_price
                    cost = matched * lot.cost_per_unit
                    gain = proceeds - cost
                    
                    # Only record for target FY reporting
                    if is_target_fy:
                        fy_matches.append(LotMatch(
                            sell_tx_id=tx.external_id,
                            buy_lot_id=lot.id,
                            asset=asset,
                            matched_qty=matched,
                            cost_of_acquisition=cost,
                            sale_consideration=proceeds,
                            gain_loss=gain,
                            buy_date=lot.acquisition_date,
                            sell_date=tx.trade_timestamp,
                            holding_days=(tx.trade_timestamp - lot.acquisition_date).days,
                        ))
                        
                        # 115BBH: Track gains and losses SEPARATELY
                        if gain > 0:
                            fy_gains += gain
                        else:
                            fy_losses += abs(gain)
                    
                    lot.remaining_qty -= matched
                    if lot.remaining_qty < 1e-8:
                        lot.is_fully_consumed = True
                        inventory.pop(0)
                    
                    remaining -= matched
        
        results[asset] = {
            'matches': fy_matches,
            'remaining_lots': inventory,
            'gross_gains': fy_gains,
            'gross_losses': fy_losses,
            'taxable_gain': fy_gains,  # = gross_gains (NO loss offset)
        }
    
    return results
```

---

## 5. Other Income Engine

```python
def compute_other_income(all_transactions, target_fy):
    """
    Classify and value non-trade crypto income.
    Taxed at 30% under Section 115BBH (conservative) or slab rates.
    Also creates cost basis lots for FIFO (reward → later sell).
    """
    income_events = []
    breakdown = {'staking': 0, 'interest': 0, 'airdrop': 0, 'referral': 0, 'mining': 0, 'cashback': 0}
    
    for tx in all_transactions:
        event = classify_vda_event(tx)
        if event not in ['REWARD', 'STAKING', 'AIRDROP', 'REFERRAL_BONUS', 'INTEREST_EARNED', 'MINING']:
            continue
        if tx.financial_year != target_fy:
            continue
        
        # Value at INR price at time of receipt
        value_inr = tx.gross_amount_inr or (tx.quantity * tx.price_inr)
        
        income_events.append(OtherIncomeEvent(
            tx_id=tx.external_id,
            income_type=event.lower(),
            asset=tx.asset_symbol,
            quantity=tx.quantity,
            price_inr=tx.price_inr,
            value_inr=value_inr,
            receipt_date=tx.trade_timestamp,
            fy=target_fy,
        ))
        
        # Categorize
        category = {
            'STAKING': 'staking', 'INTEREST_EARNED': 'interest',
            'AIRDROP': 'airdrop', 'REFERRAL_BONUS': 'referral',
            'MINING': 'mining', 'REWARD': 'cashback'
        }.get(event, 'cashback')
        breakdown[category] += value_inr
    
    total = sum(breakdown.values())
    return total, breakdown, income_events
```

---

## 6. Financial Year Reporting Layer

```python
# ╔════════════════════════════════════════════════════════════════╗
# ║  CRITICAL RULE: FY filter applies ONLY to disposal events     ║
# ║  Transaction FETCH must NEVER be filtered by FY               ║
# ║  FIFO requires full history from inception to present         ║
# ╚════════════════════════════════════════════════════════════════╝

def generate_fy_report(user_id, target_fy):
    # 1. Fetch ALL normalized_transactions (ALL years)
    all_txs = db.normalized_transactions.where(user_id=user_id).order_by('trade_timestamp')
    
    # 2. Run FIFO engine on FULL history
    fifo_results = compute_fifo_for_user(all_txs, target_fy)
    
    # 3. FY filter is INSIDE the FIFO engine:
    #    - ALL buys create lots (all years)
    #    - ALL sells consume lots (all years)
    #    - Only REPORT disposals where sell_date is in target_fy
    
    # 4. Other income: filter by receipt_date in target_fy
    other_income, breakdown, events = compute_other_income(all_txs, target_fy)
    
    # 5. Tax computation
    taxable_capital_gains = sum(r['taxable_gain'] for r in fifo_results.values())
    total_taxable = taxable_capital_gains + other_income
    base_tax = total_taxable * 0.30
    surcharge = compute_surcharge(total_taxable, base_tax)
    cess = (base_tax + surcharge) * 0.04
    total_tax = base_tax + surcharge + cess
    tds_credit = compute_tds_credit(all_txs, target_fy)
    net_payable = total_tax - tds_credit
    
    return TaxReport(
        fy=target_fy,
        capital_gains=taxable_capital_gains,
        other_income=other_income,
        total_tax=total_tax,
        tds_credit=tds_credit,
        net_payable=net_payable,
        schedule_vda=generate_schedule_vda(fifo_results),
    )
```

---

## 7. Edge Case Handling

| Edge Case | Detection | Resolution |
|-----------|-----------|------------|
| **Partial fills** | Same order_id, multiple fill records | Aggregate by order_id: sum qty, weighted-avg price |
| **Stablecoin trades** | asset_symbol ∈ STABLECOIN_LIST | Treat as VDA (taxable). Use historical USDT/INR rate |
| **Zero-value settlements** | quantity=0 or gross_amount=0 | Skip (TRANSFER_SELF classification). Log as warning |
| **Token redenomination** | Token name change (MATIC→POL) | Maintain mapping table. Map old→new symbol. Preserve lot history |
| **Dust balances** | remaining_qty < 0.00000001 | Treat as zero. Mark lot as fully consumed |
| **Negative inventory** | Sell qty > available inventory | Log critical warning. Create phantom lot at zero cost. Require CSV upload |
| **Rounding precision** | Floating point drift | Use 10-decimal precision. Round to 2 decimals only at final INR reporting |
| **Crypto-to-crypto swap** | quote_asset ≠ 'INR' | Two-leg: SELL base asset at FMV in INR, BUY quote asset at same FMV |
| **P2P trades** | Not in API data | Detected via gap detection. Require CSV import |
| **Fee in base asset** | fee_asset == asset_symbol | Reduce acquired quantity by fee amount |
| **Fee in quote currency** | fee_asset == quote_asset | NOT added to cost basis per 115BBH |

---

## 8. Reconciliation Engine

```python
def run_reconciliation(user_id, target_fy, computation_result):
    recon_results = []
    
    # ═══ CHECK 1: TDS Reconciliation ═══
    computed_tds = sum(tx.tds_amount for tx in fy_sells)
    theoretical_tds = total_sell_consideration * 0.01
    tds_from_26as = load_26as_tds(user_id, target_fy)  # If uploaded
    tds_from_csv = sum(r.tds_amount for r in tds_records if r.fy == target_fy)
    
    tds_expected = tds_from_26as or tds_from_csv or theoretical_tds
    tds_discrepancy = abs(computed_tds - tds_expected)
    
    recon_results.append({
        'type': 'tds',
        'expected': tds_expected,
        'computed': computed_tds,
        'discrepancy': tds_discrepancy,
        'status': 'matched' if tds_discrepancy < 500 else
                  'minor_discrepancy' if tds_discrepancy < 5000 else
                  'major_discrepancy',
    })
    
    # ═══ CHECK 2: Sell Volume Reconciliation ═══
    computed_sell_vol = computation_result.total_consideration_inr
    # Cross-check: TDS × 100 should ≈ sell volume
    implied_sell_vol = tds_expected * 100  # If 1% TDS
    sell_discrepancy = abs(computed_sell_vol - implied_sell_vol) / max(implied_sell_vol, 1)
    
    recon_results.append({
        'type': 'sell_volume',
        'computed': computed_sell_vol,
        'implied_from_tds': implied_sell_vol,
        'discrepancy_pct': sell_discrepancy * 100,
        'status': 'matched' if sell_discrepancy < 0.05 else 'major_discrepancy',
    })
    
    # ═══ CHECK 3: Inventory Balance ═══
    for asset_summary in computation_result.asset_summaries:
        if asset_summary.current_holding < -0.00001:
            recon_results.append({
                'type': 'inventory',
                'asset': asset_summary.asset_symbol,
                'holding': asset_summary.current_holding,
                'status': 'major_discrepancy',
                'message': 'Negative inventory — missing buy transactions',
            })
    
    # ═══ CHECK 4: Trade Count ═══
    api_trade_count = count_trades(source='api')
    csv_trade_count = count_trades(source='csv')
    total_unique = count_unique_trades()
    
    recon_results.append({
        'type': 'trade_count',
        'api_trades': api_trade_count,
        'csv_trades': csv_trade_count,
        'total_unique': total_unique,
        'duplicates_removed': (api_trade_count + csv_trade_count) - total_unique,
    })
    
    # Store results
    for r in recon_results:
        db.reconciliation_logs.insert(user_id=user_id, fy=target_fy, **r)
    
    return recon_results
```

---

## 9. Performance Strategy

### 9.1 Architecture for 10,000+ Users

| Component | Strategy |
|-----------|----------|
| **Compute isolation** | Each user's FIFO runs independently. No cross-user dependencies |
| **Recompute efficiency** | FIFO engine is pure function: same inputs → same outputs. Cache result keyed by `hash(all_tx_content_hashes)` |
| **Incremental sync** | Only fetch new trades since last sync. Full FIFO recompute required (FIFO is path-dependent) |
| **Background jobs** | Sync and compute run in Web Workers (browser) or Supabase Edge Functions (server) |
| **Caching** | Cache computation result in `localStorage` and Supabase. Invalidate on new sync |
| **Database** | Indexes on (user_id, financial_year), (user_id, trade_timestamp), (user_id, content_hash) |
| **Pagination** | API results paginated. UI displays paginated lot matches |

### 9.2 Idempotent Reprocessing

```
Every computation is idempotent:
1. Content hash on every raw record prevents duplicate inserts
2. FIFO engine processes ALL records from scratch each time
3. Previous computation results (lots, disposals) are REPLACED, not appended
4. computation_id links all outputs to a single run
5. Re-running with same inputs produces identical outputs
```

### 9.3 Computation Caching

```python
def get_or_compute(user_id, target_fy):
    # Build cache key from all transaction hashes
    all_hashes = db.normalized_transactions
        .where(user_id=user_id)
        .select('content_hash')
        .order_by('content_hash')
    
    cache_key = sha256('|'.join(all_hashes) + target_fy)
    
    cached = cache.get(f"tax_result:{user_id}:{cache_key}")
    if cached:
        return cached
    
    result = compute_fifo_for_user(...)
    cache.set(f"tax_result:{user_id}:{cache_key}", result, ttl=3600)
    return result
```

---

## Summary: What Changes From Current Architecture

| Current (v4) | New (v5) | Why |
|-------------|----------|-----|
| Transactions stored in `crypto_trades` (flat) | Split into `raw_transactions` + `normalized_transactions` | Immutable audit trail + reprocessable normalized layer |
| No persistent FIFO lots | `inventory_lots` table | Audit trail, CA review, debugging |
| No disposal tracking | `disposal_events` table | Schedule VDA generation, per-trade audit |
| No sync history | `sync_logs` table | Gap detection, incremental sync, audit |
| No reconciliation | `reconciliation_logs` table | TDS/volume cross-checks |
| API fetch: single call, 500 limit | Paginated fetch with from_id | Complete trade history |
| CSV import: separate flow | Unified merge engine with content-hash dedup | No duplicates between API + CSV |
| No gap detection | Automatic gap detection | Proactive CSV upload prompts |
| FIFO recomputed in-memory only | Results persisted to DB | Faster re-access, audit trail |

---

## Compliance Checklist

- [x] Section 115BBH: 30% flat tax on VDA gains
- [x] Section 194S: 1% TDS on consideration
- [x] No loss set-off between VDAs
- [x] Brokerage NOT deductible from cost basis
- [x] Stablecoins treated as VDA
- [x] IST timezone for FY boundary detection
- [x] Schedule VDA report generation
- [x] Full audit trail for CA review
- [x] Idempotent reprocessing
- [x] Negative inventory prevention with warnings
- [x] Multi-year FIFO with global inventory
- [x] Reconciliation against 26AS/TDS certificates

---

*Document generated for TaxMitra v5.0.0 — 2026-02-19*
