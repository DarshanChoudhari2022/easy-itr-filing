-- ══════════════════════════════════════════════════════════════════════
-- TaxMitra Crypto Tax Module v6 — KoinX-Match Schema
-- Date: 2026-02-25
-- Purpose: Clean crypto tax tables for FIFO lot matching, capital
--          gains computation, and data coverage tracking.
--          Designed to match KoinX output precisely.
--
-- Tables:
--   1. crypto_transactions       — All crypto txns (from CSV, API, manual)
--   2. crypto_tax_lots           — FIFO inventory lots (buy-side)
--   3. crypto_tax_computations   — Sell↔Lot matches with gain/tax calc
--   4. crypto_data_coverage      — CSV upload status dashboard
--
-- Safe to re-run (all CREATE IF NOT EXISTS / idempotent).
-- ══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- TABLE 1: crypto_transactions
-- Master table for ALL crypto transactions regardless of source.
-- Sources: ORDER_CSV, TDS_CSV, INSTA_CSV, API, MANUAL
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source tracking
  source          varchar NOT NULL,         -- ORDER_CSV | TDS_CSV | INSTA_CSV | API | MANUAL
  source_id       varchar NOT NULL,         -- Original ID from source file / API

  -- Transaction details
  txn_type        varchar NOT NULL,         -- BUY | SELL | REWARD | DEPOSIT | WITHDRAWAL
  asset           varchar NOT NULL,         -- Coin symbol: BTC, ETH, DOGE, etc.
  quantity        decimal(30,10) NOT NULL,
  price_inr       decimal(20,4) NOT NULL DEFAULT 0,
  total_inr       decimal(20,4) NOT NULL DEFAULT 0,
  fee_inr         decimal(20,4) NOT NULL DEFAULT 0,
  tds_inr         decimal(20,4) NOT NULL DEFAULT 0,

  -- Temporal
  "timestamp"     timestamptz NOT NULL,
  financial_year  varchar(10) NOT NULL,     -- e.g. FY2024-25

  -- Optional metadata
  pair            varchar,                  -- Original trading pair: BTCINR, ETHINR
  status          varchar DEFAULT 'CONFIRMED',
  raw_data        jsonb,

  created_at      timestamptz DEFAULT now(),

  -- Dedup: same source + source_id per user = same transaction
  UNIQUE(user_id, source, source_id)
);

-- Indexes for crypto_transactions
CREATE INDEX IF NOT EXISTS idx_ct_user_id
  ON public.crypto_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_ct_financial_year
  ON public.crypto_transactions(financial_year);

CREATE INDEX IF NOT EXISTS idx_ct_asset
  ON public.crypto_transactions(asset);

CREATE INDEX IF NOT EXISTS idx_ct_timestamp
  ON public.crypto_transactions("timestamp");

CREATE INDEX IF NOT EXISTS idx_ct_user_fy
  ON public.crypto_transactions(user_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_ct_user_asset
  ON public.crypto_transactions(user_id, asset);

CREATE INDEX IF NOT EXISTS idx_ct_user_txn_type
  ON public.crypto_transactions(user_id, txn_type);


-- ─────────────────────────────────────────────────────────────────────
-- TABLE 2: crypto_tax_lots
-- FIFO inventory lots — one row per BUY acquisition.
-- remaining_qty decreases as sells consume the lot.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_tax_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  txn_id          uuid REFERENCES public.crypto_transactions(id) ON DELETE SET NULL,

  asset           varchar NOT NULL,
  original_qty    decimal(30,10) NOT NULL,
  remaining_qty   decimal(30,10) NOT NULL,
  cost_per_unit   decimal(20,10) NOT NULL,
  purchase_date   timestamptz NOT NULL,
  financial_year  varchar(10),
  is_exhausted    boolean DEFAULT false
);

-- Indexes for crypto_tax_lots
CREATE INDEX IF NOT EXISTS idx_ctl_user_id
  ON public.crypto_tax_lots(user_id);

CREATE INDEX IF NOT EXISTS idx_ctl_asset
  ON public.crypto_tax_lots(asset);

CREATE INDEX IF NOT EXISTS idx_ctl_user_asset_active
  ON public.crypto_tax_lots(user_id, asset, is_exhausted);

CREATE INDEX IF NOT EXISTS idx_ctl_user_fy
  ON public.crypto_tax_lots(user_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_ctl_purchase_date
  ON public.crypto_tax_lots(purchase_date);


-- ─────────────────────────────────────────────────────────────────────
-- TABLE 3: crypto_tax_computations
-- Each row = one sell↔lot match with full capital gains breakdown.
-- Multiple rows per sell if the sell exhausted multiple lots.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_tax_computations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sell_txn_id         uuid REFERENCES public.crypto_transactions(id) ON DELETE SET NULL,
  lot_id              uuid REFERENCES public.crypto_tax_lots(id) ON DELETE SET NULL,

  -- Matching
  qty_matched         decimal(30,10) NOT NULL,

  -- Capital gains
  cost_of_acquisition decimal(20,4) NOT NULL,
  sale_consideration  decimal(20,4) NOT NULL,
  capital_gain        decimal(20,4) NOT NULL,   -- sale_consideration - cost_of_acquisition

  -- Tax
  tds_attributed      decimal(20,4) DEFAULT 0,
  financial_year      varchar(10) NOT NULL,
  gross_tax           decimal(20,4) DEFAULT 0,  -- 30% flat on gains (Section 115BBH)
  cess                decimal(20,4) DEFAULT 0,  -- 4% health & education cess
  total_tax           decimal(20,4) DEFAULT 0,  -- gross_tax + cess

  -- Edge case: sell with no matching buy lot (pre-tracking acquisitions)
  is_unknown_lot      boolean DEFAULT false,

  created_at          timestamptz DEFAULT now()
);

-- Indexes for crypto_tax_computations
CREATE INDEX IF NOT EXISTS idx_ctc_user_id
  ON public.crypto_tax_computations(user_id);

CREATE INDEX IF NOT EXISTS idx_ctc_financial_year
  ON public.crypto_tax_computations(financial_year);

CREATE INDEX IF NOT EXISTS idx_ctc_user_fy
  ON public.crypto_tax_computations(user_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_ctc_sell_txn
  ON public.crypto_tax_computations(sell_txn_id);

CREATE INDEX IF NOT EXISTS idx_ctc_lot
  ON public.crypto_tax_computations(lot_id);


-- ─────────────────────────────────────────────────────────────────────
-- TABLE 4: crypto_data_coverage
-- Tracks which CSVs the user has uploaded and their status.
-- Powers the "Data Coverage Dashboard" in the UI.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_data_coverage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year    varchar(10) NOT NULL,

  -- Upload status per CSV type: 'NOT_UPLOADED' | 'UPLOADED' | 'PROCESSING' | 'ERROR'
  order_csv_status  varchar DEFAULT 'NOT_UPLOADED',
  tds_csv_status    varchar DEFAULT 'NOT_UPLOADED',
  insta_csv_status  varchar DEFAULT 'NOT_UPLOADED',

  -- Row counts (0 until successfully parsed)
  order_csv_rows    int DEFAULT 0,
  tds_csv_rows      int DEFAULT 0,
  insta_csv_rows    int DEFAULT 0,

  last_updated      timestamptz DEFAULT now(),

  -- One coverage record per user per FY
  UNIQUE(user_id, financial_year)
);

-- Indexes for crypto_data_coverage
CREATE INDEX IF NOT EXISTS idx_cdc_user_id
  ON public.crypto_data_coverage(user_id);

CREATE INDEX IF NOT EXISTS idx_cdc_user_fy
  ON public.crypto_data_coverage(user_id, financial_year);


-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_tax_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_data_coverage ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════
-- POLICIES (drop + recreate for idempotency)
-- ══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users own crypto_transactions"     ON public.crypto_transactions;
  DROP POLICY IF EXISTS "Users own crypto_tax_lots"         ON public.crypto_tax_lots;
  DROP POLICY IF EXISTS "Users own crypto_tax_computations" ON public.crypto_tax_computations;
  DROP POLICY IF EXISTS "Users own crypto_data_coverage"    ON public.crypto_data_coverage;
END $$;

CREATE POLICY "Users own crypto_transactions"
  ON public.crypto_transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users own crypto_tax_lots"
  ON public.crypto_tax_lots FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users own crypto_tax_computations"
  ON public.crypto_tax_computations FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users own crypto_data_coverage"
  ON public.crypto_data_coverage FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Upsert data coverage on CSV upload
-- Usage: SELECT upsert_crypto_data_coverage('user-uuid', 'FY2024-25', 'order', 'UPLOADED', 150);
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.upsert_crypto_data_coverage(
  p_user_id       uuid,
  p_financial_year varchar(10),
  p_csv_type      varchar,      -- 'order' | 'tds' | 'insta'
  p_status        varchar,      -- 'UPLOADED' | 'PROCESSING' | 'ERROR'
  p_row_count     int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.crypto_data_coverage (user_id, financial_year)
  VALUES (p_user_id, p_financial_year)
  ON CONFLICT (user_id, financial_year) DO NOTHING;

  IF p_csv_type = 'order' THEN
    UPDATE public.crypto_data_coverage
    SET order_csv_status = p_status,
        order_csv_rows   = p_row_count,
        last_updated     = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;

  ELSIF p_csv_type = 'tds' THEN
    UPDATE public.crypto_data_coverage
    SET tds_csv_status = p_status,
        tds_csv_rows   = p_row_count,
        last_updated   = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;

  ELSIF p_csv_type = 'insta' THEN
    UPDATE public.crypto_data_coverage
    SET insta_csv_status = p_status,
        insta_csv_rows   = p_row_count,
        last_updated     = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;
  END IF;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- DONE — Crypto Tax Module v6 (KoinX-Match) schema is ready.
-- ══════════════════════════════════════════════════════════════════════
