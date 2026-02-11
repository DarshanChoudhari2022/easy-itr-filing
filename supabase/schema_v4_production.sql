-- ============================================================
-- TaxMitra Production Schema v4
-- Complete schema for ITR filing SaaS
-- Run AFTER schema.sql, schema_advanced.sql, schema_v3.sql
-- ============================================================

-- ============ 1. EXTEND PROFILES WITH KYC FIELDS ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('M', 'F', 'O'));
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
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resident_status text DEFAULT 'RES' CHECK (resident_status IN ('RES', 'NRI', 'RNOR'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS filing_status_type text DEFAULT 'INDIVIDUAL' CHECK (filing_status_type IN ('INDIVIDUAL', 'HUF'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_plan text DEFAULT 'free' CHECK (current_plan IN ('free', 'pro', 'expert'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_valid_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- ============ 2. INCOME SOURCES TABLE ============
CREATE TABLE IF NOT EXISTS public.income_sources (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  
  -- Salary Income
  has_salary boolean DEFAULT false,
  salary_gross numeric(15,2) DEFAULT 0,
  salary_exemptions jsonb DEFAULT '{}', -- {hra: 0, lta: 0, professional_tax: 0, gratuity: 0, leave_encashment: 0}
  salary_tds numeric(15,2) DEFAULT 0,
  employer_name text,
  employer_tan text,
  
  -- House Property
  has_house_property boolean DEFAULT false,
  house_property_type text DEFAULT 'SOP', -- SOP (self-occupied), LOP (let-out), Deemed
  annual_rent_received numeric(15,2) DEFAULT 0,
  municipal_taxes numeric(15,2) DEFAULT 0,
  home_loan_interest numeric(15,2) DEFAULT 0,
  net_house_property_income numeric(15,2) DEFAULT 0,
  
  -- Business/Professional Income
  has_business_income boolean DEFAULT false,
  business_type text, -- 'business_44AD', 'professional_44ADA', 'regular'
  business_name text,
  business_code text,
  gstin text,
  total_turnover numeric(15,2) DEFAULT 0,
  digital_receipts numeric(15,2) DEFAULT 0,
  cash_receipts numeric(15,2) DEFAULT 0,
  presumptive_income numeric(15,2) DEFAULT 0,
  gross_profit numeric(15,2) DEFAULT 0,
  total_expenses numeric(15,2) DEFAULT 0,
  net_profit numeric(15,2) DEFAULT 0,
  
  -- Capital Gains
  has_capital_gains boolean DEFAULT false,
  stcg_equity numeric(15,2) DEFAULT 0,
  stcg_other numeric(15,2) DEFAULT 0,
  ltcg_equity numeric(15,2) DEFAULT 0,
  ltcg_other numeric(15,2) DEFAULT 0,
  
  -- Crypto/VDA
  has_crypto boolean DEFAULT false,
  crypto_gains numeric(15,2) DEFAULT 0,
  crypto_tds numeric(15,2) DEFAULT 0,
  
  -- Other Sources
  has_other_sources boolean DEFAULT false,
  savings_interest numeric(15,2) DEFAULT 0,
  fd_interest numeric(15,2) DEFAULT 0,
  dividend_income numeric(15,2) DEFAULT 0,
  other_income numeric(15,2) DEFAULT 0,
  other_description text,
  
  -- Foreign Income
  has_foreign_income boolean DEFAULT false,
  foreign_income numeric(15,2) DEFAULT 0,
  
  -- Agriculture
  has_agriculture boolean DEFAULT false,
  agriculture_income numeric(15,2) DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year)
);

-- ============ 3. DEDUCTIONS TABLE ============
CREATE TABLE IF NOT EXISTS public.deductions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  
  -- Chapter VI-A
  section_80c numeric(15,2) DEFAULT 0,
  section_80ccc numeric(15,2) DEFAULT 0,
  section_80ccd_1 numeric(15,2) DEFAULT 0,
  section_80ccd_1b numeric(15,2) DEFAULT 0, -- Extra NPS ₹50K
  section_80ccd_2 numeric(15,2) DEFAULT 0, -- Employer NPS
  section_80d numeric(15,2) DEFAULT 0,
  section_80dd numeric(15,2) DEFAULT 0,
  section_80ddb numeric(15,2) DEFAULT 0,
  section_80e numeric(15,2) DEFAULT 0,
  section_80ee numeric(15,2) DEFAULT 0,
  section_80eea numeric(15,2) DEFAULT 0,
  section_80eeb numeric(15,2) DEFAULT 0,
  section_80g numeric(15,2) DEFAULT 0,
  section_80gg numeric(15,2) DEFAULT 0,
  section_80gga numeric(15,2) DEFAULT 0,
  section_80ggc numeric(15,2) DEFAULT 0,
  section_80tta numeric(15,2) DEFAULT 0,
  section_80ttb numeric(15,2) DEFAULT 0,
  section_80u numeric(15,2) DEFAULT 0,
  
  -- Exemptions
  hra_exemption numeric(15,2) DEFAULT 0,
  lta_exemption numeric(15,2) DEFAULT 0,
  
  -- Breakdown details (JSON for flexibility)
  deduction_details jsonb DEFAULT '{}',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year)
);

-- ============ 4. CRYPTO TRADES TABLE ============
CREATE TABLE IF NOT EXISTS public.crypto_trades (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_symbol text NOT NULL,
  trade_type text NOT NULL, -- 'buy','sell','swap_in','swap_out','airdrop','staking','mining','gift_received','gift_sent','nft_purchase','nft_sale','transfer_in','transfer_out'
  quantity numeric(20,8) NOT NULL,
  price_per_unit numeric(20,4) NOT NULL, -- Price in INR
  fee numeric(20,8) DEFAULT 0,
  fee_currency text DEFAULT 'INR',
  tds_deducted numeric(15,2) DEFAULT 0,
  trade_date timestamptz NOT NULL,
  exchange text,
  assessment_year text DEFAULT '2026-27',
  tx_hash text,
  counterparty_token text,
  counterparty_quantity numeric(20,8) DEFAULT 0,
  inr_conversion_rate numeric(10,4) DEFAULT 1, -- For foreign exchanges
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 5. CRYPTO EXCHANGE CONNECTIONS ============
CREATE TABLE IF NOT EXISTS public.crypto_exchange_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  api_key_encrypted text,
  api_secret_encrypted text,
  status text DEFAULT 'active',
  last_sync timestamptz,
  total_trades_synced int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);

-- ============ 6. FORM 16 DATA ============
CREATE TABLE IF NOT EXISTS public.form16_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  employer_name text,
  employer_tan text,
  employer_pan text,
  employee_name text,
  employee_pan text,
  period_from date,
  period_to date,
  gross_salary numeric(15,2) DEFAULT 0,
  exemptions jsonb DEFAULT '{}',
  deductions_under_16 jsonb DEFAULT '{}',
  income_chargeable numeric(15,2) DEFAULT 0,
  chapter_via jsonb DEFAULT '{}',
  total_tax_payable numeric(15,2) DEFAULT 0,
  tds_deducted numeric(15,2) DEFAULT 0,
  parse_confidence numeric(3,2) DEFAULT 0,
  raw_text text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year, employer_tan)
);

-- ============ 7. ITR FILINGS HISTORY ============
CREATE TABLE IF NOT EXISTS public.itr_filings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL,
  form_type text NOT NULL, -- 'ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'
  regime text NOT NULL, -- 'OLD', 'NEW'
  filing_type text DEFAULT 'ORIGINAL', -- 'ORIGINAL', 'REVISED', 'BELATED'
  status text DEFAULT 'draft', -- 'draft', 'generated', 'filed', 'verified', 'processed'
  
  -- Tax computation snapshot
  gross_total_income numeric(15,2) DEFAULT 0,
  total_deductions numeric(15,2) DEFAULT 0,
  taxable_income numeric(15,2) DEFAULT 0,
  total_tax numeric(15,2) DEFAULT 0,
  tds_paid numeric(15,2) DEFAULT 0,
  refund_or_due numeric(15,2) DEFAULT 0,
  is_refund boolean DEFAULT false,
  
  -- Full data snapshots
  filing_data jsonb NOT NULL DEFAULT '{}',
  tax_computation jsonb DEFAULT '{}',
  json_snapshot jsonb, -- The actual ITR JSON that was downloaded
  
  -- Filing details
  ack_number text,
  filed_at timestamptz,
  verified_at timestamptz,
  verification_method text, -- 'aadhaar_otp', 'net_banking', 'dsc'
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 8. BANK DETAILS ============
CREATE TABLE IF NOT EXISTS public.bank_details (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  ifsc_code text NOT NULL,
  bank_name text NOT NULL,
  account_type text DEFAULT 'SB', -- 'SB' (Savings), 'CA' (Current), 'OTH' (Other)
  is_refund_account boolean DEFAULT false,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_number, ifsc_code)
);

-- ============ 9. TAX PROFILES (Self, Spouse, HUF) ============
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  relation text DEFAULT 'self', -- 'self', 'spouse', 'parent', 'child', 'huf'
  pan_number text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 10. CA ASSIGNMENTS (Expert Plan) ============
CREATE TABLE IF NOT EXISTS public.ca_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  ca_user_id uuid REFERENCES auth.users(id),
  assessment_year text NOT NULL,
  status text DEFAULT 'pending', -- 'pending','assigned','in_review','changes_requested','approved','completed'
  priority text DEFAULT 'normal',
  notes text,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ca_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.ca_assignments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  section text, -- 'salary', 'deductions', 'crypto', 'general', 'house_property', 'capital_gains'
  comment text NOT NULL,
  is_resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS POLICIES ============
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

-- Income Sources
CREATE POLICY "Users manage own income" ON public.income_sources FOR ALL USING (auth.uid() = user_id);

-- Deductions
CREATE POLICY "Users manage own deductions" ON public.deductions FOR ALL USING (auth.uid() = user_id);

-- Crypto Trades
CREATE POLICY "Users manage own trades" ON public.crypto_trades FOR ALL USING (auth.uid() = user_id);

-- Exchange Connections
CREATE POLICY "Users manage own connections" ON public.crypto_exchange_connections FOR ALL USING (auth.uid() = user_id);

-- Form 16
CREATE POLICY "Users manage own form16" ON public.form16_data FOR ALL USING (auth.uid() = user_id);

-- ITR Filings
CREATE POLICY "Users manage own filings" ON public.itr_filings FOR ALL USING (auth.uid() = user_id);

-- Bank Details
CREATE POLICY "Users manage own banks" ON public.bank_details FOR ALL USING (auth.uid() = user_id);

-- Tax Profiles
CREATE POLICY "Users manage own tax profiles" ON public.tax_profiles FOR ALL USING (auth.uid() = user_id);

-- CA Assignments (user sees own, CA sees assigned)
CREATE POLICY "Users view own assignments" ON public.ca_assignments FOR SELECT 
  USING (auth.uid() = user_id OR auth.uid() = ca_user_id);
CREATE POLICY "Users create own assignments" ON public.ca_assignments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "CA updates assigned" ON public.ca_assignments FOR UPDATE 
  USING (auth.uid() = ca_user_id OR auth.uid() = user_id);

-- CA Comments
CREATE POLICY "Assignment participants view comments" ON public.ca_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ca_assignments a 
    WHERE a.id = assignment_id 
    AND (a.user_id = auth.uid() OR a.ca_user_id = auth.uid())
  ));
CREATE POLICY "Assignment participants add comments" ON public.ca_comments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ca_assignments a 
    WHERE a.id = assignment_id 
    AND (a.user_id = auth.uid() OR a.ca_user_id = auth.uid())
  ));

-- ============ INDEXES FOR PERFORMANCE ============
CREATE INDEX IF NOT EXISTS idx_income_sources_user_ay ON public.income_sources(user_id, assessment_year);
CREATE INDEX IF NOT EXISTS idx_deductions_user_ay ON public.deductions(user_id, assessment_year);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_user ON public.crypto_trades(user_id, assessment_year);
CREATE INDEX IF NOT EXISTS idx_crypto_trades_date ON public.crypto_trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_itr_filings_user_ay ON public.itr_filings(user_id, assessment_year);
CREATE INDEX IF NOT EXISTS idx_form16_user_ay ON public.form16_data(user_id, assessment_year);
CREATE INDEX IF NOT EXISTS idx_bank_details_user ON public.bank_details(user_id);
