-- ══════════════════════════════════════════════════════════════
-- TaxMitra Crypto Tax Engine v5 — Production Schema Migration
-- Date: 2026-02-19
-- Purpose: Complete schema for FIFO inventory, gap detection,
--          CSV merge, reconciliation, and audit trail.
-- ══════════════════════════════════════════════════════════════

-- 1. RAW TRANSACTIONS (immutable audit log)
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
CREATE INDEX IF NOT EXISTS idx_raw_tx_user ON public.raw_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_tx_sync ON public.raw_transactions(sync_session_id);

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
CREATE INDEX IF NOT EXISTS idx_norm_tx_user_ts ON public.normalized_transactions(user_id, trade_timestamp);
CREATE INDEX IF NOT EXISTS idx_norm_tx_user_fy ON public.normalized_transactions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_norm_tx_asset ON public.normalized_transactions(user_id, asset_symbol);

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
CREATE INDEX IF NOT EXISTS idx_lots_user ON public.inventory_lots(user_id, computation_id);
CREATE INDEX IF NOT EXISTS idx_lots_asset ON public.inventory_lots(user_id, asset_symbol, is_fully_consumed);

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
CREATE INDEX IF NOT EXISTS idx_disposal_user_fy ON public.disposal_events(user_id, financial_year);

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
CREATE INDEX IF NOT EXISTS idx_other_income_user_fy ON public.other_income_events(user_id, financial_year);

-- 6. SYNC LOGS
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
CREATE INDEX IF NOT EXISTS idx_sync_user ON public.sync_logs(user_id, exchange);

-- 7. RECONCILIATION LOGS
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
CREATE INDEX IF NOT EXISTS idx_recon_user_fy ON public.reconciliation_logs(user_id, financial_year);

-- 8. RLS POLICIES
ALTER TABLE public.raw_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own raw_tx" ON public.raw_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own norm_tx" ON public.normalized_transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own lots" ON public.inventory_lots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own disposals" ON public.disposal_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own other_income" ON public.other_income_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own sync" ON public.sync_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own recon" ON public.reconciliation_logs FOR ALL USING (auth.uid() = user_id);
