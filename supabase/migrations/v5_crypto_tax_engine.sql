-- ═══════════════════════════════════════════════════════════════════
-- CRYPTO TAX ENGINE v5 — Clean Slate Migration
-- Run in Supabase SQL Editor to set up the new schema.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Wipe old broken tables ────────────────────────────────────
DROP TABLE IF EXISTS tax_lots CASCADE;
DROP TABLE IF EXISTS tax_computation CASCADE;
DROP TABLE IF EXISTS crypto_tax_computations CASCADE;
DROP TABLE IF EXISTS crypto_transactions CASCADE;
DROP TABLE IF EXISTS crypto_income CASCADE;
DROP TABLE IF EXISTS crypto_data_coverage CASCADE;
DROP TABLE IF EXISTS income_sources CASCADE;

-- Also drop new tables if re-running this migration
DROP TABLE IF EXISTS crypto_tax_lots CASCADE;
DROP TABLE IF EXISTS crypto_tax_summary CASCADE;
DROP TABLE IF EXISTS crypto_income_events CASCADE;
DROP TABLE IF EXISTS crypto_trades CASCADE;


-- ─── Table 1: Every buy and sell trade ──────────────────────────
CREATE TABLE crypto_trades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('buy','sell')),
  asset          TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'INR',
  quantity       NUMERIC(36,10) NOT NULL,
  price_per_unit NUMERIC(24,6)  NOT NULL,  -- INR per coin, from CSV Price column
  value_inr      NUMERIC(24,2)  NOT NULL,  -- Total INR, from CSV Total column
  fee_inr        NUMERIC(24,2)  NOT NULL DEFAULT 0,
  tds_inr        NUMERIC(24,2)  NOT NULL DEFAULT 0,
  qty_remaining  NUMERIC(36,10),           -- NULL for sells, filled for buys
  trade_date     TIMESTAMPTZ    NOT NULL,
  financial_year TEXT           NOT NULL,   -- 'FY2024-25', computed from date
  exchange       TEXT           NOT NULL DEFAULT 'CoinDCX',
  csv_source     TEXT           NOT NULL,   -- 'order_history' | 'insta_history'
  external_id    TEXT           NOT NULL,   -- order ID from CSV
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, csv_source, external_id)
);


-- ─── Table 2: Income events (staking, rewards, airdrops) ────────
CREATE TABLE crypto_income_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_type    TEXT NOT NULL CHECK (income_type IN ('staking','reward','airdrop','mining')),
  asset          TEXT NOT NULL,
  quantity       NUMERIC(36,10),
  value_inr      NUMERIC(24,2) NOT NULL,
  event_date     TIMESTAMPTZ   NOT NULL,
  financial_year TEXT          NOT NULL,
  exchange       TEXT          NOT NULL DEFAULT 'CoinDCX',
  csv_source     TEXT          NOT NULL,
  external_id    TEXT          NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, csv_source, external_id)
);


-- ─── Table 3: FIFO lot matches (one row per buy-lot consumed) ───
CREATE TABLE crypto_tax_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  financial_year  TEXT NOT NULL,
  asset           TEXT NOT NULL,
  sell_trade_id   UUID NOT NULL REFERENCES crypto_trades(id),
  buy_trade_id    UUID REFERENCES crypto_trades(id),
  qty_matched     NUMERIC(36,10) NOT NULL,
  buy_date        TIMESTAMPTZ,
  sell_date       TIMESTAMPTZ NOT NULL,
  cost_inr        NUMERIC(24,2) NOT NULL,   -- proportional cost of this lot
  proceeds_inr    NUMERIC(24,2) NOT NULL,   -- proportional proceeds
  gain_inr        NUMERIC(24,2) NOT NULL,   -- proceeds - cost (can be negative)
  taxable_gain_inr NUMERIC(24,2) NOT NULL,  -- MAX(gain, 0) per §115BBH
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ─── Table 4: Final tax summary per user per FY ─────────────────
CREATE TABLE crypto_tax_summary (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id),
  financial_year        TEXT NOT NULL,
  assessment_year       TEXT NOT NULL,
  num_sell_events       INT,
  num_fifo_lots         INT,
  sale_consideration    NUMERIC(24,2),
  cost_of_acquisition   NUMERIC(24,2),
  taxable_capital_gains NUMERIC(24,2),
  gross_losses          NUMERIC(24,2),
  staking_income        NUMERIC(24,2),
  rewards_income        NUMERIC(24,2),
  total_other_income    NUMERIC(24,2),
  tds_credit            NUMERIC(24,2),
  total_taxable         NUMERIC(24,2),
  gross_tax             NUMERIC(24,2),
  cess                  NUMERIC(24,2),
  total_tax_liability   NUMERIC(24,2),
  net_tax_payable       NUMERIC(24,2),
  refund_eligible       NUMERIC(24,2),
  computed_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, financial_year)
);


-- ─── Indexes ─────────────────────────────────────────────────────
CREATE INDEX idx_trades_user_fy    ON crypto_trades(user_id, financial_year);
CREATE INDEX idx_trades_user_asset ON crypto_trades(user_id, asset, trade_date);
CREATE INDEX idx_lots_user_fy      ON crypto_tax_lots(user_id, financial_year);
CREATE INDEX idx_income_user_fy    ON crypto_income_events(user_id, financial_year);


-- ─── Row Level Security (RLS) ────────────────────────────────────
ALTER TABLE crypto_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_income_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tax_summary ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see/modify their own data
-- Service role bypasses RLS, so API endpoints using service key work fine

CREATE POLICY "Users access own crypto_trades"
  ON crypto_trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own crypto_income_events"
  ON crypto_income_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own crypto_tax_lots"
  ON crypto_tax_lots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own crypto_tax_summary"
  ON crypto_tax_summary FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
