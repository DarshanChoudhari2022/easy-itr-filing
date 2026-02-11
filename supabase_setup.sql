-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. UPDATING PROFILES (Authentication & User Details)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_plan text default 'free',
ADD COLUMN IF NOT EXISTS plan_valid_until timestamp with time zone,
ADD COLUMN IF NOT EXISTS pan_number text,
ADD COLUMN IF NOT EXISTS aadhaar_number text,
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS father_name text,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS address_flat text,
ADD COLUMN IF NOT EXISTS address_premises text,
ADD COLUMN IF NOT EXISTS address_street text,
ADD COLUMN IF NOT EXISTS address_city text,
ADD COLUMN IF NOT EXISTS address_state text,
ADD COLUMN IF NOT EXISTS address_pincode text;

-- 2. ITR FILINGS (Tracking Tax Returns)
CREATE TABLE IF NOT EXISTS public.itr_filings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  assessment_year text not null,
  form_type text default 'ITR-1',
  filing_data jsonb default '{}'::jsonb,
  regime text default 'new',
  status text default 'draft', -- draft, filed, verified
  ack_number text,
  filed_at timestamp with time zone,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. INCOME SOURCES (Salary, House Property, etc.)
CREATE TABLE IF NOT EXISTS public.income_sources (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    source_type text not null,
    description text,
    employer_name text,
    amount numeric default 0,
    tds_deducted numeric default 0,
    assessment_year text,
    created_at timestamp with time zone default now()
);

-- 4. DEDUCTIONS (80C, 80D, etc.)
CREATE TABLE IF NOT EXISTS public.deductions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    section text not null,
    description text,
    amount numeric default 0,
    proof_url text,
    created_at timestamp with time zone default now()
);

-- 5. BANK DETAILS (For Refunds)
CREATE TABLE IF NOT EXISTS public.bank_details (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    bank_name text,
    account_number text,
    ifsc_code text,
    account_type text default 'savings',
    is_primary boolean default false,
    is_validated boolean default false,
    created_at timestamp with time zone default now()
);

-- 6. FILING STATE (Progress Tracking)
CREATE TABLE IF NOT EXISTS public.filing_steps_state (
    user_id uuid references auth.users primary key,
    current_step integer default 1,
    answers jsonb default '{}'::jsonb,
    is_complete boolean default false,
    updated_at timestamp with time zone default now()
);

-- 7. ADDITIONAL TABLES (GST & Crypto)
CREATE TABLE IF NOT EXISTS public.gst_invoices (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    gstin text,
    invoice_number text,
    invoice_date date,
    taxable_value numeric,
    igst numeric,
    cgst numeric,
    sgst numeric,
    status text, -- uploaded, filed
    created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS public.crypto_trades (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    exchange text,
    trade_type text, -- buy/sell
    symbol text,
    quantity numeric,
    price numeric,
    trade_date timestamp with time zone,
    img_url text, -- optional for uploaded proof
    created_at timestamp with time zone default now()
);

-- 8. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itr_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_steps_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;

-- 9. CREATE POLICIES (Allow users to manage THEIR OWN data)
DO $$ 
BEGIN
    -- ITR Filings
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'itr_filings' AND policyname = 'Users can manage own filings') THEN
        CREATE POLICY "Users can manage own filings" ON public.itr_filings FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Income Sources
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'income_sources' AND policyname = 'Users can manage own income') THEN
        CREATE POLICY "Users can manage own income" ON public.income_sources FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Deductions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deductions' AND policyname = 'Users can manage own deductions') THEN
        CREATE POLICY "Users can manage own deductions" ON public.deductions FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Bank Details
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_details' AND policyname = 'Users can manage own bank details') THEN
        CREATE POLICY "Users can manage own bank details" ON public.bank_details FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Filing State
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'filing_steps_state' AND policyname = 'Users can manage own filing state') THEN
        CREATE POLICY "Users can manage own filing state" ON public.filing_steps_state FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- GST Invoices
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gst_invoices' AND policyname = 'Users can manage own GST invoices') THEN
        CREATE POLICY "Users can manage own GST invoices" ON public.gst_invoices FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Crypto Trades
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_trades' AND policyname = 'Users can manage own crypto trades') THEN
        CREATE POLICY "Users can manage own crypto trades" ON public.crypto_trades FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
