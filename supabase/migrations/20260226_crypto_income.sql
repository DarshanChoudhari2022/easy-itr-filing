-- ══════════════════════════════════════════════════════════════════════
-- TaxMitra — crypto_income table
-- Date: 2026-02-26
-- Purpose: Store individual staking, reward, airdrop, and interest
--          income events from CoinDCX Insta History CSV.
--
-- The income_sources table has UNIQUE(user_id, assessment_year) which
-- only allows 1 row per user per year — but there are multiple reward
-- events per year (ADA staking Dec 11, Dec 23, Jan 17, etc.).
--
-- This table stores each event as a separate row with proper dedup.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crypto_income (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Income details
  income_type       text NOT NULL,          -- 'staking' | 'reward' | 'airdrop' | 'interest'
  asset             text NOT NULL,          -- 'ADA', 'SHIB', 'INR', etc.
  quantity          decimal(30,10),         -- Amount of asset received
  value_inr         decimal(20,4) NOT NULL, -- INR value at time of receipt

  -- Temporal
  transaction_date  timestamptz NOT NULL,
  financial_year    text NOT NULL,          -- e.g. 'FY2024-25'

  -- Source tracking
  source            text NOT NULL,          -- 'coindcx_insta', 'coindcx_api', 'manual'
  source_id         text,                   -- Unique ID from source (hash for dedup)
  remarks           text,                   -- Original remarks from CSV

  created_at        timestamptz DEFAULT now(),

  -- Dedup: same source + source_id per user = same income event
  UNIQUE(user_id, source, source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ci_user_id
  ON public.crypto_income(user_id);

CREATE INDEX IF NOT EXISTS idx_ci_financial_year
  ON public.crypto_income(financial_year);

CREATE INDEX IF NOT EXISTS idx_ci_user_fy
  ON public.crypto_income(user_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_ci_income_type
  ON public.crypto_income(income_type);

CREATE INDEX IF NOT EXISTS idx_ci_asset
  ON public.crypto_income(asset);


-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.crypto_income ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users own crypto_income" ON public.crypto_income;
END $$;

CREATE POLICY "Users own crypto_income"
  ON public.crypto_income FOR ALL
  USING (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- DONE — crypto_income table ready for staking/reward/airdrop events.
-- ══════════════════════════════════════════════════════════════════════
