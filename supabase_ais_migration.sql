-- AIS DATA (Stores Parsed AIS + File Path)
CREATE TABLE IF NOT EXISTS public.ais_data (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    assessment_year text not null,
    financial_year text,
    parsed_data jsonb default '{}'::jsonb,
    file_path text, -- Path in Supabase Storage
    source_type text default 'pdf', -- 'pdf', 'json', 'manual'
    status text default 'uploaded',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- RLS
ALTER TABLE public.ais_data ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ais_data' AND policyname = 'Users can manage own ais data') THEN
        CREATE POLICY "Users can manage own ais data" ON public.ais_data FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Unique Constraint for Upsert
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ais_data_unique_user_ay') THEN
        ALTER TABLE public.ais_data ADD CONSTRAINT ais_data_unique_user_ay UNIQUE (user_id, assessment_year);
    END IF;
END $$;

-- STORAGE SETUP for 'tax_documents'
-- Creates the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax_documents', 'tax_documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow users to upload their own files (Path: ais/{user_id}/...)
-- We check if the 2nd segment of the path matches the User ID
CREATE POLICY "Users can upload own tax docs"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'tax_documents' 
    AND auth.uid()::text = (regexp_split_to_array(name, '/'))[2]
);

-- Policy: Allow users to view their own files
CREATE POLICY "Users can view own tax docs"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'tax_documents' 
    AND auth.uid()::text = (regexp_split_to_array(name, '/'))[2]
);
