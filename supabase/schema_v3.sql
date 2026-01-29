-- TaxBay Schema Extension: AIS, Family, and Documents

-- 11. AIS/TIS Reconciler
CREATE TABLE public.ais_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'SFT-005 (Dividends)', 'SFT-001 (Interest)'
  reported_value numeric(20,2) NOT NULL,
  source_name text,
  status text DEFAULT 'unmatched', -- 'matched', 'mismatch', 'ignored'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Family/Group Management
CREATE TABLE public.family_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  head_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation text, -- 'Spouse', 'Parent', 'Child'
  access_level text DEFAULT 'full', -- 'view', 'full'
  UNIQUE(head_user_id, member_user_id)
);

-- 13. Secure Tax Vault (Documents)
CREATE TABLE public.tax_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL, -- 'Form 16', '26AS', 'Receipt'
  file_name text NOT NULL,
  file_url text NOT NULL,
  assessment_year text DEFAULT '2026-27',
  category text, -- 'Income', 'Deduction', 'GST'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. Advance Tax Tracker
CREATE TABLE public.advance_tax_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_number int NOT NULL, -- 1, 2, 3, 4
  amount_paid numeric(15,2) NOT NULL,
  payment_date date NOT NULL,
  challan_number text,
  bsr_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.ais_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_tax_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own AIS" ON public.ais_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own family" ON public.family_groups FOR ALL USING (auth.uid() = head_user_id);
CREATE POLICY "Users can manage own docs" ON public.tax_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own payments" ON public.advance_tax_payments FOR ALL USING (auth.uid() = user_id);
