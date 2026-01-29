-- BharatTax Database Schema - Part 1: Tables and Enums
-- Comprehensive Indian Tax SaaS Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('individual', 'professional', 'admin');

-- Create enum for filing status
CREATE TYPE public.filing_status AS ENUM ('not_started', 'in_progress', 'submitted', 'processed', 'rejected');

-- Create enum for income source types
CREATE TYPE public.income_source_type AS ENUM (
  'salary',
  'house_property',
  'capital_gains_equity',
  'capital_gains_debt',
  'capital_gains_property',
  'business_professional',
  'other_sources'
);

-- Create enum for deduction sections
CREATE TYPE public.deduction_section AS ENUM (
  'section_80c',
  'section_80d',
  'section_80e',
  'section_80g',
  'section_80tta',
  'section_80ttb',
  'hra',
  'lta',
  'other'
);

-- Create enum for tax regime
CREATE TYPE public.tax_regime AS ENUM ('old', 'new');

-- Create enum for ITR forms
CREATE TYPE public.itr_form AS ENUM ('ITR-1', 'ITR-2', 'ITR-3', 'ITR-4');

-- =====================================================
-- USER ROLES TABLE (Create first so functions can reference it)
-- =====================================================

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'individual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- =====================================================
-- CLIENTS TABLE (for CA/Professionals) - Create before functions
-- =====================================================

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_pan text,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, client_user_id)
);

-- =====================================================
-- HELPER FUNCTIONS (Security Definer)
-- =====================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Function to check if user is a professional with client access
CREATE OR REPLACE FUNCTION public.is_professional_of_client(_client_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.professional_id = auth.uid()
      AND c.client_user_id = _client_user_id
  )
$$;

-- Function to check if user can access data
CREATE OR REPLACE FUNCTION public.can_access_user_data(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_admin() 
    OR auth.uid() = _target_user_id 
    OR public.is_professional_of_client(_target_user_id)
$$;

-- =====================================================
-- RLS for user_roles (after functions are created)
-- =====================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin());

-- =====================================================
-- RLS for clients
-- =====================================================

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can view own clients"
  ON public.clients FOR SELECT
  USING (professional_id = auth.uid() OR client_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Professionals can manage own clients"
  ON public.clients FOR INSERT
  WITH CHECK (professional_id = auth.uid() AND public.has_role(auth.uid(), 'professional'));

CREATE POLICY "Professionals can update own clients"
  ON public.clients FOR UPDATE
  USING (professional_id = auth.uid() OR public.is_admin());

CREATE POLICY "Professionals can delete own clients"
  ON public.clients FOR DELETE
  USING (professional_id = auth.uid() OR public.is_admin());

-- =====================================================
-- PROFILES TABLE
-- =====================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  pan_number text,
  aadhaar_last_four text,
  phone text,
  filing_status filing_status NOT NULL DEFAULT 'not_started',
  suggested_itr_form itr_form,
  assessment_year text DEFAULT '2026-27',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible profiles"
  ON public.profiles FOR SELECT
  USING (public.can_access_user_data(user_id));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- =====================================================
-- INCOME SOURCES TABLE
-- =====================================================

CREATE TABLE public.income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type income_source_type NOT NULL,
  description text,
  employer_name text,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  tds_deducted numeric(15,2) DEFAULT 0,
  assessment_year text NOT NULL DEFAULT '2026-27',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible income"
  ON public.income_sources FOR SELECT
  USING (public.can_access_user_data(user_id));

CREATE POLICY "Users can insert own income"
  ON public.income_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_professional_of_client(user_id));

CREATE POLICY "Users can update accessible income"
  ON public.income_sources FOR UPDATE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

CREATE POLICY "Users can delete own income"
  ON public.income_sources FOR DELETE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

-- =====================================================
-- CRYPTO TRADES TABLE
-- =====================================================

CREATE TABLE public.crypto_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  token_symbol text NOT NULL,
  token_name text,
  trade_type text NOT NULL,
  quantity numeric(20,8) NOT NULL,
  buy_price numeric(15,2) NOT NULL,
  sell_price numeric(15,2),
  trade_date date NOT NULL,
  gain_loss numeric(15,2),
  tds_paid numeric(15,2) DEFAULT 0,
  assessment_year text NOT NULL DEFAULT '2026-27',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible crypto trades"
  ON public.crypto_trades FOR SELECT
  USING (public.can_access_user_data(user_id));

CREATE POLICY "Users can insert own crypto trades"
  ON public.crypto_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_professional_of_client(user_id));

CREATE POLICY "Users can update accessible crypto trades"
  ON public.crypto_trades FOR UPDATE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

CREATE POLICY "Users can delete own crypto trades"
  ON public.crypto_trades FOR DELETE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

-- =====================================================
-- DEDUCTIONS TABLE
-- =====================================================

CREATE TABLE public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section deduction_section NOT NULL,
  description text,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  proof_document_url text,
  assessment_year text NOT NULL DEFAULT '2026-27',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible deductions"
  ON public.deductions FOR SELECT
  USING (public.can_access_user_data(user_id));

CREATE POLICY "Users can insert own deductions"
  ON public.deductions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_professional_of_client(user_id));

CREATE POLICY "Users can update accessible deductions"
  ON public.deductions FOR UPDATE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

CREATE POLICY "Users can delete own deductions"
  ON public.deductions FOR DELETE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

-- =====================================================
-- TAX SUMMARIES TABLE
-- =====================================================

CREATE TABLE public.tax_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL DEFAULT '2026-27',
  total_income numeric(15,2) DEFAULT 0,
  total_deductions numeric(15,2) DEFAULT 0,
  taxable_income_old numeric(15,2) DEFAULT 0,
  taxable_income_new numeric(15,2) DEFAULT 0,
  tax_old_regime numeric(15,2) DEFAULT 0,
  tax_new_regime numeric(15,2) DEFAULT 0,
  tds_total numeric(15,2) DEFAULT 0,
  suggested_regime tax_regime,
  suggested_itr_form itr_form,
  tax_payable numeric(15,2) DEFAULT 0,
  tax_refund numeric(15,2) DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, assessment_year)
);

ALTER TABLE public.tax_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible tax summaries"
  ON public.tax_summaries FOR SELECT
  USING (public.can_access_user_data(user_id));

CREATE POLICY "Users can insert own tax summaries"
  ON public.tax_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_professional_of_client(user_id));

CREATE POLICY "Users can update accessible tax summaries"
  ON public.tax_summaries FOR UPDATE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

CREATE POLICY "Users can delete own tax summaries"
  ON public.tax_summaries FOR DELETE
  USING (auth.uid() = user_id OR public.is_professional_of_client(user_id) OR public.is_admin());

-- =====================================================
-- CHAT MESSAGES TABLE (for Tax Guru AI)
-- =====================================================

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_income_sources_updated_at
  BEFORE UPDATE ON public.income_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crypto_trades_updated_at
  BEFORE UPDATE ON public.crypto_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deductions_updated_at
  BEFORE UPDATE ON public.deductions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_summaries_updated_at
  BEFORE UPDATE ON public.tax_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNCTION: Create profile on signup
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'individual');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_clients_professional_id ON public.clients(professional_id);
CREATE INDEX idx_clients_client_user_id ON public.clients(client_user_id);
CREATE INDEX idx_income_sources_user_id ON public.income_sources(user_id);
CREATE INDEX idx_crypto_trades_user_id ON public.crypto_trades(user_id);
CREATE INDEX idx_deductions_user_id ON public.deductions(user_id);
CREATE INDEX idx_tax_summaries_user_id ON public.tax_summaries(user_id);
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);