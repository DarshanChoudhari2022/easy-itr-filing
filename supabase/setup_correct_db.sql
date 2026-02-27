-- ══════════════════════════════════════════════════════════════════════
-- TaxMitra — Complete Database Setup Script
-- Run this in your CORRECT Supabase SQL Editor (project: pbtpujyieewitenlkisd)
-- Date: 2026-02-27
-- Safe to run multiple times (uses IF NOT EXISTS everywhere)
-- ══════════════════════════════════════════════════════════════════════


-- ═══ STEP 1: Check what exists ═══
SELECT 
  required.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status
FROM (
  VALUES 
    ('profiles'), ('user_roles'), ('gst_invoices'),
    ('income_sources'), ('deductions'), ('crypto_trades'),
    ('crypto_exchange_connections'), ('form16_data'), ('itr_filings'),
    ('bank_details'), ('tax_profiles'), ('ca_assignments'), ('ca_comments'),
    ('ais_data'), ('ais_records'),
    ('foreign_assets'), ('foreign_income'), ('crypto_inventory_lots'),
    ('audit_logs'), ('filing_steps_state'),
    ('crypto_income'),
    ('family_groups'), ('tax_documents'), ('advance_tax_payments')
) AS required(table_name)
LEFT JOIN information_schema.tables t 
  ON t.table_name = required.table_name 
  AND t.table_schema = 'public'
ORDER BY 
  CASE WHEN t.table_name IS NULL THEN 0 ELSE 1 END,
  required.table_name;


-- ═══ STEP 2: Extensions + Enums ═══
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('individual', 'professional', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.filing_status AS ENUM ('not_started', 'in_progress', 'submitted', 'processed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.income_source_type AS ENUM ('salary', 'house_property', 'capital_gains_equity', 'capital_gains_debt', 'capital_gains_property', 'business_professional', 'other_sources'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tax_regime AS ENUM ('old', 'new'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.itr_form AS ENUM ('ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══ STEP 3: Create all tables ═══

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, full_name text, pan_number text,
  filing_status filing_status NOT NULL DEFAULT 'not_started',
  assessment_year text DEFAULT '2026-27',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assessment_year text DEFAULT '2026-27';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS father_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aadhaar_last4 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS flat_no text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS building text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locality text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pincode text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text DEFAULT 'India';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resident_status text DEFAULT 'RES';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS filing_status_type text DEFAULT 'INDIVIDUAL';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_plan text DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_valid_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'individual',
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.gst_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL, invoice_date date NOT NULL,
  vendor_name text NOT NULL, vendor_gstin text,
  taxable_value numeric(15,2) NOT NULL DEFAULT 0,
  igst numeric(15,2) DEFAULT 0, cgst numeric(15,2) DEFAULT 0, sgst numeric(15,2) DEFAULT 0,
  total_value numeric(15,2) NOT NULL DEFAULT 0,
  is_purchase boolean DEFAULT true, match_status text DEFAULT 'pending',
  confidence_score numeric(5,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.income_sources (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  has_salary boolean DEFAULT false, salary_gross numeric(15,2) DEFAULT 0,
  salary_exemptions jsonb DEFAULT '{}', salary_tds numeric(15,2) DEFAULT 0,
  employer_name text, employer_tan text,
  has_house_property boolean DEFAULT false, house_property_type text DEFAULT 'SOP',
  annual_rent_received numeric(15,2) DEFAULT 0, municipal_taxes numeric(15,2) DEFAULT 0,
  home_loan_interest numeric(15,2) DEFAULT 0, net_house_property_income numeric(15,2) DEFAULT 0,
  has_business_income boolean DEFAULT false, business_type text, business_name text,
  business_code text, gstin text, total_turnover numeric(15,2) DEFAULT 0,
  digital_receipts numeric(15,2) DEFAULT 0, cash_receipts numeric(15,2) DEFAULT 0,
  presumptive_income numeric(15,2) DEFAULT 0, gross_profit numeric(15,2) DEFAULT 0,
  total_expenses numeric(15,2) DEFAULT 0, net_profit numeric(15,2) DEFAULT 0,
  has_capital_gains boolean DEFAULT false,
  stcg_equity numeric(15,2) DEFAULT 0, stcg_other numeric(15,2) DEFAULT 0,
  ltcg_equity numeric(15,2) DEFAULT 0, ltcg_other numeric(15,2) DEFAULT 0,
  has_crypto boolean DEFAULT false, crypto_gains numeric(15,2) DEFAULT 0, crypto_tds numeric(15,2) DEFAULT 0,
  has_other_sources boolean DEFAULT false, savings_interest numeric(15,2) DEFAULT 0,
  fd_interest numeric(15,2) DEFAULT 0, dividend_income numeric(15,2) DEFAULT 0,
  other_income numeric(15,2) DEFAULT 0, other_description text,
  has_foreign_income boolean DEFAULT false, foreign_income numeric(15,2) DEFAULT 0,
  has_agriculture boolean DEFAULT false, agriculture_income numeric(15,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year)
);

CREATE TABLE IF NOT EXISTS public.deductions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  section_80c numeric(15,2) DEFAULT 0, section_80ccc numeric(15,2) DEFAULT 0,
  section_80ccd_1 numeric(15,2) DEFAULT 0, section_80ccd_1b numeric(15,2) DEFAULT 0,
  section_80ccd_2 numeric(15,2) DEFAULT 0, section_80d numeric(15,2) DEFAULT 0,
  section_80dd numeric(15,2) DEFAULT 0, section_80ddb numeric(15,2) DEFAULT 0,
  section_80e numeric(15,2) DEFAULT 0, section_80ee numeric(15,2) DEFAULT 0,
  section_80eea numeric(15,2) DEFAULT 0, section_80eeb numeric(15,2) DEFAULT 0,
  section_80g numeric(15,2) DEFAULT 0, section_80gg numeric(15,2) DEFAULT 0,
  section_80gga numeric(15,2) DEFAULT 0, section_80ggc numeric(15,2) DEFAULT 0,
  section_80tta numeric(15,2) DEFAULT 0, section_80ttb numeric(15,2) DEFAULT 0,
  section_80u numeric(15,2) DEFAULT 0,
  hra_exemption numeric(15,2) DEFAULT 0, lta_exemption numeric(15,2) DEFAULT 0,
  deduction_details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year)
);

CREATE TABLE IF NOT EXISTS public.crypto_trades (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_symbol text NOT NULL, trade_type text NOT NULL,
  quantity numeric(20,8) NOT NULL, price_per_unit numeric(20,4) NOT NULL,
  fee numeric(20,8) DEFAULT 0, fee_currency text DEFAULT 'INR',
  tds_deducted numeric(15,2) DEFAULT 0, trade_date timestamptz NOT NULL,
  exchange text, assessment_year text DEFAULT '2026-27', tx_hash text,
  counterparty_token text, counterparty_quantity numeric(20,8) DEFAULT 0,
  inr_conversion_rate numeric(10,4) DEFAULT 1, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crypto_exchange_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL, api_key_encrypted text, api_secret_encrypted text,
  status text DEFAULT 'active', last_sync timestamptz,
  total_trades_synced int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);

CREATE TABLE IF NOT EXISTS public.form16_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  employer_name text, employer_tan text, employer_pan text,
  employee_name text, employee_pan text,
  period_from date, period_to date,
  gross_salary numeric(15,2) DEFAULT 0, exemptions jsonb DEFAULT '{}',
  deductions_under_16 jsonb DEFAULT '{}', income_chargeable numeric(15,2) DEFAULT 0,
  chapter_via jsonb DEFAULT '{}', total_tax_payable numeric(15,2) DEFAULT 0,
  tds_deducted numeric(15,2) DEFAULT 0, parse_confidence numeric(3,2) DEFAULT 0,
  raw_text text, file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year, employer_tan)
);

CREATE TABLE IF NOT EXISTS public.itr_filings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL, form_type text NOT NULL, regime text NOT NULL,
  filing_type text DEFAULT 'ORIGINAL', status text DEFAULT 'draft',
  gross_total_income numeric(15,2) DEFAULT 0, total_deductions numeric(15,2) DEFAULT 0,
  taxable_income numeric(15,2) DEFAULT 0, total_tax numeric(15,2) DEFAULT 0,
  tds_paid numeric(15,2) DEFAULT 0, refund_or_due numeric(15,2) DEFAULT 0,
  is_refund boolean DEFAULT false,
  filing_data jsonb NOT NULL DEFAULT '{}', tax_computation jsonb DEFAULT '{}',
  json_snapshot jsonb, ack_number text,
  filed_at timestamptz, verified_at timestamptz, verification_method text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_details (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number text NOT NULL, ifsc_code text NOT NULL, bank_name text NOT NULL,
  account_type text DEFAULT 'SB', is_refund_account boolean DEFAULT false,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_number, ifsc_code)
);

CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_name text NOT NULL, relation text DEFAULT 'self',
  pan_number text NOT NULL, full_name text NOT NULL,
  date_of_birth date, is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ca_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  ca_user_id uuid REFERENCES auth.users(id),
  assessment_year text NOT NULL, status text DEFAULT 'pending',
  priority text DEFAULT 'normal', notes text,
  assigned_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ca_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.ca_assignments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  section text, comment text NOT NULL, is_resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ⭐ CRITICAL TABLE — stores all crypto data + user settings as JSON
CREATE TABLE IF NOT EXISTS public.ais_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assessment_year TEXT NOT NULL,
  parsed_data JSONB,
  file_path TEXT, source_type TEXT, status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, assessment_year)
);

CREATE TABLE IF NOT EXISTS public.foreign_assets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL, country_code text NOT NULL, entity_name text NOT NULL,
  account_number text, peak_value_inr numeric(20,2), closing_balance_inr numeric(20,2),
  acquisition_date date, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.foreign_income (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_type text NOT NULL, country_code text NOT NULL,
  gross_income_fcy numeric(20,2) NOT NULL, tax_paid_fcy numeric(20,2) DEFAULT 0,
  conversion_rate numeric(10,4) NOT NULL, is_dtaa_relief_claimed boolean DEFAULT false,
  dtaa_article text, section_relief text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crypto_inventory_lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_symbol text NOT NULL, remaining_quantity numeric(20,8) NOT NULL,
  purchase_price_inr numeric(20,2) NOT NULL, purchase_date timestamptz NOT NULL,
  exchange text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, severity text DEFAULT 'info',
  metadata jsonb, ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.filing_steps_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step text DEFAULT 'getting_started',
  completed_steps text[] DEFAULT '{}', answers jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ais_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL, reported_value numeric(20,2) NOT NULL,
  source_name text, status text DEFAULT 'unmatched',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.family_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  head_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation text, access_level text DEFAULT 'full',
  UNIQUE(head_user_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS public.tax_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL, file_name text NOT NULL, file_url text NOT NULL,
  assessment_year text DEFAULT '2026-27', category text, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advance_tax_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_number int NOT NULL, amount_paid numeric(15,2) NOT NULL,
  payment_date date NOT NULL, challan_number text, bsr_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crypto_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_type text NOT NULL, asset text NOT NULL,
  quantity decimal(30,10), value_inr decimal(20,4) NOT NULL,
  transaction_date timestamptz NOT NULL, financial_year text NOT NULL,
  source text NOT NULL, source_id text, remarks text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source, source_id)
);


-- ═══ STEP 4: RLS + Policies ═══

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form16_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itr_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreign_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreign_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_steps_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_tax_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_income ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DO $$ 
DECLARE pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'profiles','user_roles','gst_invoices','income_sources','deductions',
      'crypto_trades','crypto_exchange_connections','form16_data','itr_filings',
      'bank_details','tax_profiles','ca_assignments','ca_comments','ais_data',
      'foreign_assets','foreign_income','crypto_inventory_lots','audit_logs',
      'filing_steps_state','ais_records','family_groups','tax_documents',
      'advance_tax_payments','crypto_income'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Create fresh policies
CREATE POLICY "own_profile_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_profile_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_invoices" ON public.gst_invoices FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_income" ON public.income_sources FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_deductions" ON public.deductions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_trades" ON public.crypto_trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_connections" ON public.crypto_exchange_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_form16" ON public.form16_data FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_filings" ON public.itr_filings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_banks" ON public.bank_details FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_tax_profiles" ON public.tax_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_ais_data" ON public.ais_data FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_foreign_assets" ON public.foreign_assets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_foreign_income" ON public.foreign_income FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_crypto_lots" ON public.crypto_inventory_lots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_filing_state" ON public.filing_steps_state FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_ais_records" ON public.ais_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_family" ON public.family_groups FOR ALL USING (auth.uid() = head_user_id);
CREATE POLICY "own_docs" ON public.tax_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_payments" ON public.advance_tax_payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_crypto_income" ON public.crypto_income FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_ca_select" ON public.ca_assignments FOR SELECT USING (auth.uid() = user_id OR auth.uid() = ca_user_id);
CREATE POLICY "own_ca_insert" ON public.ca_assignments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_ca_update" ON public.ca_assignments FOR UPDATE USING (auth.uid() = ca_user_id OR auth.uid() = user_id);
CREATE POLICY "ca_comments_select" ON public.ca_comments FOR SELECT USING (EXISTS (SELECT 1 FROM public.ca_assignments a WHERE a.id = assignment_id AND (a.user_id = auth.uid() OR a.ca_user_id = auth.uid())));
CREATE POLICY "ca_comments_insert" ON public.ca_comments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.ca_assignments a WHERE a.id = assignment_id AND (a.user_id = auth.uid() OR a.ca_user_id = auth.uid())));
CREATE POLICY "own_audit_logs" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id);


-- ═══ STEP 5: Auto-create profile on signup ═══

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'individual')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══ STEP 6: Ensure columns exist on pre-existing tables, then create Indexes ═══

-- If any table already existed without these columns, add them now
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS assessment_year text DEFAULT '2026-27';
ALTER TABLE public.deductions ADD COLUMN IF NOT EXISTS assessment_year text DEFAULT '2026-27';
ALTER TABLE public.crypto_trades ADD COLUMN IF NOT EXISTS assessment_year text DEFAULT '2026-27';
ALTER TABLE public.crypto_trades ADD COLUMN IF NOT EXISTS trade_date timestamptz;
ALTER TABLE public.itr_filings ADD COLUMN IF NOT EXISTS assessment_year text;
ALTER TABLE public.form16_data ADD COLUMN IF NOT EXISTS assessment_year text DEFAULT '2026-27';
ALTER TABLE public.ais_data ADD COLUMN IF NOT EXISTS assessment_year text;
ALTER TABLE public.crypto_income ADD COLUMN IF NOT EXISTS financial_year text;
ALTER TABLE public.bank_details ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_income_sources_user_ay ON public.income_sources(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_deductions_user_ay ON public.deductions(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_crypto_trades_user ON public.crypto_trades(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_crypto_trades_date ON public.crypto_trades(trade_date);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_itr_filings_user_ay ON public.itr_filings(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_form16_user_ay ON public.form16_data(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_bank_details_user ON public.bank_details(user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ais_data_user_key ON public.ais_data(user_id, assessment_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ci_user_fy ON public.crypto_income(user_id, financial_year);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ═══ STEP 7: Final verification ═══

SELECT 
  required.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN '✅ OK' ELSE '❌ MISSING' END AS status
FROM (
  VALUES 
    ('profiles'), ('user_roles'), ('gst_invoices'),
    ('income_sources'), ('deductions'), ('crypto_trades'),
    ('crypto_exchange_connections'), ('form16_data'), ('itr_filings'),
    ('bank_details'), ('tax_profiles'), ('ca_assignments'), ('ca_comments'),
    ('ais_data'), ('ais_records'),
    ('foreign_assets'), ('foreign_income'), ('crypto_inventory_lots'),
    ('audit_logs'), ('filing_steps_state'),
    ('crypto_income'),
    ('family_groups'), ('tax_documents'), ('advance_tax_payments')
) AS required(table_name)
LEFT JOIN information_schema.tables t 
  ON t.table_name = required.table_name 
  AND t.table_schema = 'public'
ORDER BY required.table_name;
