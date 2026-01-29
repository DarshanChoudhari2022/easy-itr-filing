-- TaxBay Database Schema
-- Run this in your Supabase SQL Editor to set up the foundation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Enums
CREATE TYPE public.app_role AS ENUM ('individual', 'professional', 'admin');
CREATE TYPE public.filing_status AS ENUM ('not_started', 'in_progress', 'submitted', 'processed', 'rejected');
CREATE TYPE public.income_source_type AS ENUM ('salary', 'house_property', 'capital_gains_equity', 'capital_gains_debt', 'capital_gains_property', 'business_professional', 'other_sources');
CREATE TYPE public.tax_regime AS ENUM ('old', 'new');
CREATE TYPE public.itr_form AS ENUM ('ITR-1', 'ITR-2', 'ITR-3', 'ITR-4');

-- 2. Profiles Table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  pan_number text,
  filing_status filing_status NOT NULL DEFAULT 'not_started',
  assessment_year text DEFAULT '2026-27',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. User Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'individual',
  UNIQUE (user_id, role)
);

-- 4. GST Invoices Table (Module 1)
CREATE TABLE public.gst_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  vendor_name text NOT NULL,
  vendor_gstin text,
  taxable_value numeric(15,2) NOT NULL DEFAULT 0,
  igst numeric(15,2) DEFAULT 0,
  cgst numeric(15,2) DEFAULT 0,
  sgst numeric(15,2) DEFAULT 0,
  total_value numeric(15,2) NOT NULL DEFAULT 0,
  is_purchase boolean DEFAULT true,
  match_status text DEFAULT 'pending', -- pending, matched, fuzzy, missing
  confidence_score numeric(5,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own invoices" ON public.gst_invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON public.gst_invoices FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Trigger for Profile Creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'individual');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
