-- Beginner ITR SaaS hardening and schema repair
-- Date: 2026-09-23
-- Purpose:
--   1. Restore tables referenced by the current crypto import/calculation code.
--   2. Add missing filing_sessions persistence table used by FilingSession.
--   3. Harden RLS policy checks and SECURITY DEFINER search paths.
--   4. Add FK indexes found missing during audit.

CREATE TABLE IF NOT EXISTS public.filing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year varchar(10) NOT NULL,
  assessment_year varchar(12) NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  current_step integer NOT NULL DEFAULT 0,
  itr_form text NOT NULL DEFAULT 'auto',
  regime text NOT NULL DEFAULT 'undecided',
  filing_type text NOT NULL DEFAULT 'ORIGINAL',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, financial_year)
);

ALTER TABLE public.filing_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own filing sessions" ON public.filing_sessions;
CREATE POLICY "Users manage own filing sessions"
  ON public.filing_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.crypto_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  source_id varchar NOT NULL,
  txn_type varchar NOT NULL,
  asset varchar NOT NULL,
  quantity numeric(30,10) NOT NULL,
  price_inr numeric(20,4) NOT NULL DEFAULT 0,
  total_inr numeric(20,4) NOT NULL DEFAULT 0,
  fee_inr numeric(20,4) NOT NULL DEFAULT 0,
  tds_inr numeric(20,4) NOT NULL DEFAULT 0,
  "timestamp" timestamptz NOT NULL,
  financial_year varchar(10) NOT NULL,
  pair varchar,
  status varchar DEFAULT 'CONFIRMED',
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS public.crypto_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_type varchar NOT NULL,
  asset varchar NOT NULL,
  quantity numeric(30,10) NOT NULL DEFAULT 0,
  value_inr numeric(20,4) NOT NULL DEFAULT 0,
  transaction_date timestamptz NOT NULL,
  financial_year varchar(10) NOT NULL,
  source varchar NOT NULL,
  source_id varchar NOT NULL,
  remarks text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS public.crypto_tax_computations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sell_txn_id uuid REFERENCES public.crypto_transactions(id) ON DELETE SET NULL,
  lot_id uuid,
  qty_matched numeric(30,10) NOT NULL,
  cost_of_acquisition numeric(20,4) NOT NULL,
  sale_consideration numeric(20,4) NOT NULL,
  capital_gain numeric(20,4) NOT NULL,
  tds_attributed numeric(20,4) DEFAULT 0,
  financial_year varchar(10) NOT NULL,
  gross_tax numeric(20,4) DEFAULT 0,
  cess numeric(20,4) DEFAULT 0,
  total_tax numeric(20,4) DEFAULT 0,
  is_unknown_lot boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crypto_data_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year varchar(10) NOT NULL,
  order_csv_status varchar DEFAULT 'NOT_UPLOADED',
  tds_csv_status varchar DEFAULT 'NOT_UPLOADED',
  insta_csv_status varchar DEFAULT 'NOT_UPLOADED',
  order_csv_rows integer DEFAULT 0,
  tds_csv_rows integer DEFAULT 0,
  insta_csv_rows integer DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(user_id, financial_year)
);

ALTER TABLE public.crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_tax_computations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_data_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own crypto_transactions" ON public.crypto_transactions;
CREATE POLICY "Users own crypto_transactions"
  ON public.crypto_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own crypto_income" ON public.crypto_income;
CREATE POLICY "Users own crypto_income"
  ON public.crypto_income
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own crypto_tax_computations" ON public.crypto_tax_computations;
CREATE POLICY "Users own crypto_tax_computations"
  ON public.crypto_tax_computations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own crypto_data_coverage" ON public.crypto_data_coverage;
CREATE POLICY "Users own crypto_data_coverage"
  ON public.crypto_data_coverage
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_filing_sessions_user_fy ON public.filing_sessions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_user_fy ON public.crypto_transactions(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_user_asset ON public.crypto_transactions(user_id, asset);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_timestamp ON public.crypto_transactions("timestamp");
CREATE INDEX IF NOT EXISTS idx_crypto_income_user_fy ON public.crypto_income(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_crypto_tax_computations_user_fy ON public.crypto_tax_computations(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_crypto_tax_computations_sell_txn ON public.crypto_tax_computations(sell_txn_id);
CREATE INDEX IF NOT EXISTS idx_crypto_data_coverage_user_fy ON public.crypto_data_coverage(user_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_advance_tax_payments_user_id ON public.advance_tax_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_ais_records_user_id ON public.ais_records(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_assignments_ca_user_id ON public.ca_assignments(ca_user_id);
CREATE INDEX IF NOT EXISTS idx_ca_assignments_user_id ON public.ca_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_comments_assignment_id ON public.ca_comments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_ca_comments_author_id ON public.ca_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_crypto_inventory_lots_user_id ON public.crypto_inventory_lots(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tax_lots_buy_trade_id ON public.crypto_tax_lots(buy_trade_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tax_lots_sell_trade_id ON public.crypto_tax_lots(sell_trade_id);
CREATE INDEX IF NOT EXISTS idx_family_groups_member_user_id ON public.family_groups(member_user_id);
CREATE INDEX IF NOT EXISTS idx_foreign_assets_user_id ON public.foreign_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_foreign_income_user_id ON public.foreign_income(user_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_user_id ON public.gst_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_documents_user_id ON public.tax_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_user_id ON public.tax_profiles(user_id);

CREATE OR REPLACE FUNCTION public.upsert_crypto_data_coverage(
  p_user_id uuid,
  p_financial_year varchar(10),
  p_csv_type varchar,
  p_status varchar,
  p_row_count integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'cannot upsert coverage for another user';
  END IF;

  INSERT INTO public.crypto_data_coverage (user_id, financial_year)
  VALUES (p_user_id, p_financial_year)
  ON CONFLICT (user_id, financial_year) DO NOTHING;

  IF p_csv_type = 'order' THEN
    UPDATE public.crypto_data_coverage
    SET order_csv_status = p_status, order_csv_rows = p_row_count, last_updated = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;
  ELSIF p_csv_type = 'tds' THEN
    UPDATE public.crypto_data_coverage
    SET tds_csv_status = p_status, tds_csv_rows = p_row_count, last_updated = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;
  ELSIF p_csv_type = 'insta' THEN
    UPDATE public.crypto_data_coverage
    SET insta_csv_status = p_status, insta_csv_rows = p_row_count, last_updated = now()
    WHERE user_id = p_user_id AND financial_year = p_financial_year;
  ELSE
    RAISE EXCEPTION 'unknown csv type: %', p_csv_type;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'individual')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
