-- TaxBay Advanced Database Schema (Production Grade)
-- Part 2: Advanced Modules (Foreign Assets, Audit, Enhanced Crypto)

-- 7. Foreign Assets & Income (Compliance Module)
-- Required for Schedule FA and DTAA Relief
CREATE TABLE public.foreign_assets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL, -- 'equity', 'bank_account', 'real_estate', 'other'
  country_code text NOT NULL, -- e.g., 'US', 'UK'
  entity_name text NOT NULL,
  account_number text,
  peak_value_inr numeric(20,2),
  closing_balance_inr numeric(20,2),
  acquisition_date date,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.foreign_income (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  income_type text NOT NULL, -- 'dividend', 'interest', 'salary', 'capital_gain'
  country_code text NOT NULL,
  gross_income_fcy numeric(20,2) NOT NULL,
  tax_paid_fcy numeric(20,2) DEFAULT 0,
  conversion_rate numeric(10,4) NOT NULL, -- SBI rate as per IT rules
  is_dtaa_relief_claimed boolean DEFAULT false,
  dtaa_article text,
  section_relief text, -- '90', '90A', '91'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Enhanced Crypto Tracking (FIFO/LIFO Ready)
-- Tracking individual lots for precise capital gains
CREATE TABLE public.crypto_inventory_lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_symbol text NOT NULL,
  remaining_quantity numeric(20,8) NOT NULL,
  purchase_price_inr numeric(20,2) NOT NULL,
  purchase_date timestamptz NOT NULL,
  exchange text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Audit & compliance Logs (Enterprise Feature)
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid, -- For CA firms
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- 'DATA_IMPORT', 'FILING_SUBMITTED', 'RULE_MODIFIED'
  severity text DEFAULT 'info',
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Filing Steps (For Guided Wizard State)
CREATE TABLE public.filing_steps_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step text DEFAULT 'getting_started',
  completed_steps text[] DEFAULT '{}',
  answers jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.foreign_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreign_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_steps_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own foreign assets" ON public.foreign_assets 
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own foreign income" ON public.foreign_income 
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own crypto lots" ON public.crypto_inventory_lots 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Enterprise view of logs" ON public.audit_logs 
  FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
  );

CREATE POLICY "Users can manage own filing state" ON public.filing_steps_state 
  FOR ALL USING (auth.uid() = user_id);
