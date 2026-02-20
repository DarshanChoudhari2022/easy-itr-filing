-- ═══════════════════════════════════════════════════════════
-- TaxMitra Crypto Schema v5.1 — SAFE TO RUN (idempotent)
-- Run this in Supabase SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════

-- 1. RAW TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.raw_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL,
  exchange        text NOT NULL DEFAULT 'CoinDCX',
  external_id     text,
  content_hash    text NOT NULL,
  raw_payload     jsonb NOT NULL,
  sync_session_id uuid NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_hash)
);

-- 2. NORMALIZED TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.normalized_transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_transaction_id  uuid REFERENCES public.raw_transactions(id),
  external_id         text NOT NULL,
  exchange            text NOT NULL DEFAULT 'CoinDCX',
  transaction_type    text NOT NULL,
  event_class         text NOT NULL,
  is_taxable_event    boolean NOT NULL DEFAULT false,
  asset_symbol        text NOT NULL,
  quote_asset         text NOT NULL DEFAULT 'INR',
  pair                text NOT NULL,
  quantity            numeric(20,10) NOT NULL,
  price_per_unit      numeric(20,6) NOT NULL,
  price_inr           numeric(20,6) NOT NULL,
  gross_amount_quote  numeric(20,6) NOT NULL,
  gross_amount_inr    numeric(20,6) NOT NULL,
  fee_amount          numeric(20,10) DEFAULT 0,
  fee_asset           text DEFAULT 'INR',
  fee_inr             numeric(20,6) DEFAULT 0,
  tds_amount          numeric(15,4) DEFAULT 0,
  tds_rate            numeric(5,4) DEFAULT 0,
  tds_source          text DEFAULT 'none',
  trade_timestamp     timestamptz NOT NULL,
  financial_year      text NOT NULL,
  assessment_year     text NOT NULL,
  source              text NOT NULL,
  source_priority     int NOT NULL DEFAULT 1,
  content_hash        text NOT NULL,
  description         text,
  order_id            text,
  tx_hash             text,
  counter_asset       text,
  counter_quantity    numeric(20,10),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_hash)
);
-- If table already existed without tds_source column, add it
ALTER TABLE public.normalized_transactions ADD COLUMN IF NOT EXISTS tds_source text DEFAULT 'none';

-- 3. INVENTORY LOTS
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  lot_id              text NOT NULL,
  buy_transaction_id  text NOT NULL,
  asset_symbol        text NOT NULL,
  original_quantity   numeric(20,10) NOT NULL,
  remaining_quantity  numeric(20,10) NOT NULL,
  is_fully_consumed   boolean NOT NULL DEFAULT false,
  cost_basis_per_unit numeric(20,6) NOT NULL,
  total_cost_inr      numeric(20,6) NOT NULL,
  acquisition_date    timestamptz NOT NULL,
  acquisition_type    text NOT NULL,
  financial_year      text NOT NULL,
  exchange            text NOT NULL DEFAULT 'CoinDCX',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 4. DISPOSAL EVENTS
CREATE TABLE IF NOT EXISTS public.disposal_events (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  sell_transaction_id text NOT NULL,
  buy_lot_id          text NOT NULL,
  asset_symbol        text NOT NULL,
  matched_quantity    numeric(20,10) NOT NULL,
  buy_price_per_unit  numeric(20,6) NOT NULL,
  sell_price_per_unit numeric(20,6) NOT NULL,
  cost_of_acquisition numeric(20,6) NOT NULL,
  sale_consideration  numeric(20,6) NOT NULL,
  gain_loss           numeric(20,6) NOT NULL,
  buy_date            timestamptz NOT NULL,
  sell_date           timestamptz NOT NULL,
  holding_days        int NOT NULL,
  accounting_method   text NOT NULL DEFAULT 'FIFO',
  financial_year      text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 5. OTHER INCOME EVENTS
CREATE TABLE IF NOT EXISTS public.other_income_events (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id       uuid NOT NULL,
  transaction_id       text NOT NULL,
  income_type          text NOT NULL,
  asset_symbol         text NOT NULL,
  quantity             numeric(20,10) NOT NULL,
  price_inr_at_receipt numeric(20,6) NOT NULL,
  gross_value_inr      numeric(20,6) NOT NULL,
  receipt_date         timestamptz NOT NULL,
  financial_year       text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- 6. TDS RECORDS (from TDS Summary CSV / Form 26AS)
CREATE TABLE IF NOT EXISTS public.tds_records (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tds_date              timestamptz NOT NULL,
  section               text NOT NULL DEFAULT '194S',
  exchange              text NOT NULL DEFAULT 'CoinDCX',
  gross_consideration   numeric(20,6) NOT NULL,
  tds_rate              numeric(5,4) NOT NULL DEFAULT 0.01,
  tds_amount_inr        numeric(15,4) NOT NULL,
  trade_reference       text,
  certificate_number    text,
  tan_of_deductor       text,
  quarter               text,
  financial_year        text NOT NULL,
  source                text NOT NULL DEFAULT 'tds_csv',
  asset_symbol          text,
  order_type            text,
  raw_data              jsonb,
  content_hash          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_hash)
);

-- 7. IMPORT SESSIONS
CREATE TABLE IF NOT EXISTS public.crypto_import_sessions (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id            text NOT NULL,
  exchange              text NOT NULL DEFAULT 'CoinDCX',
  financial_year        text NOT NULL,
  status                text NOT NULL DEFAULT 'completed',
  total_files           int DEFAULT 0,
  total_transactions    int DEFAULT 0,
  total_tds_records     int DEFAULT 0,
  total_errors          int DEFAULT 0,
  file_details          jsonb,
  import_mode           text DEFAULT 'replace',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 8. SYNC LOGS
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sync_type               text NOT NULL,
  exchange                text NOT NULL DEFAULT 'CoinDCX',
  status                  text NOT NULL DEFAULT 'in_progress',
  total_records_fetched   int DEFAULT 0,
  new_records_added       int DEFAULT 0,
  duplicate_records       int DEFAULT 0,
  error_records           int DEFAULT 0,
  earliest_tx_date        timestamptz,
  latest_tx_date          timestamptz,
  has_data_gaps           boolean DEFAULT false,
  gap_details             jsonb,
  last_from_id            text,
  last_timestamp          bigint,
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  error_message           text,
  warnings                text[],
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- 9. RECONCILIATION LOGS
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computation_id      uuid NOT NULL,
  financial_year      text NOT NULL,
  recon_type          text NOT NULL,
  expected_value      numeric(20,6),
  computed_value      numeric(20,6),
  discrepancy         numeric(20,6),
  discrepancy_pct     numeric(8,4),
  status              text NOT NULL,
  details             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ═══ INDEXES ═══
CREATE INDEX IF NOT EXISTS idx_raw_tx_user ON public.raw_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_tx_sync ON public.raw_transactions(sync_session_id);
CREATE INDEX IF NOT EXISTS idx_norm_tx_user_ts ON public.normalized_transactions(user_id, trade_timestamp);
CREATE INDEX IF NOT EXISTS idx_norm_tx_user_fy ON public.normalized_transactions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_norm_tx_asset ON public.normalized_transactions(user_id, asset_symbol);
CREATE INDEX IF NOT EXISTS idx_lots_user ON public.inventory_lots(user_id, computation_id);
CREATE INDEX IF NOT EXISTS idx_lots_asset ON public.inventory_lots(user_id, asset_symbol, is_fully_consumed);
CREATE INDEX IF NOT EXISTS idx_disposal_user_fy ON public.disposal_events(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_other_income_user_fy ON public.other_income_events(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_tds_user_fy ON public.tds_records(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_import_sessions_user ON public.crypto_import_sessions(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_sync_user ON public.sync_logs(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_recon_user_fy ON public.reconciliation_logs(user_id, financial_year);

-- ═══ RLS ═══
ALTER TABLE public.raw_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

-- ═══ POLICIES (drop + recreate for safety) ═══
DO $$ BEGIN
  -- Drop existing policies if they exist (prevents "already exists" errors)
  DROP POLICY IF EXISTS "Users own raw_tx" ON public.raw_transactions;
  DROP POLICY IF EXISTS "Users own norm_tx" ON public.normalized_transactions;
  DROP POLICY IF EXISTS "Users own lots" ON public.inventory_lots;
  DROP POLICY IF EXISTS "Users own disposals" ON public.disposal_events;
  DROP POLICY IF EXISTS "Users own other_income" ON public.other_income_events;
  DROP POLICY IF EXISTS "Users own tds" ON public.tds_records;
  DROP POLICY IF EXISTS "Users own import_sessions" ON public.crypto_import_sessions;
  DROP POLICY IF EXISTS "Users own sync" ON public.sync_logs;
  DROP POLICY IF EXISTS "Users own recon" ON public.reconciliation_logs;
END $$;

CREATE POLICY "Users own raw_tx" ON public.raw_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own norm_tx" ON public.normalized_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own lots" ON public.inventory_lots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own disposals" ON public.disposal_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own other_income" ON public.other_income_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own tds" ON public.tds_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own import_sessions" ON public.crypto_import_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own sync" ON public.sync_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own recon" ON public.reconciliation_logs FOR ALL USING (auth.uid() = user_id);

-- ═══ DONE ═══
-- All tables, indexes, RLS and policies are now in place.
