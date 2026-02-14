-- Create ais_data table for storing arbitrary user data (crypto transactions, settings, etc.)
-- This table was missing but referenced in the codebase for persistent storage.

CREATE TABLE IF NOT EXISTS public.ais_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    assessment_year TEXT NOT NULL, -- Used as a key for different data types (e.g. 'taxmitra_transactions', 'taxSettings')
    parsed_data JSONB,
    source_type TEXT, -- e.g. 'user_data_store'
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, assessment_year)
);

-- Enable RLS
ALTER TABLE public.ais_data ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own ais_data" 
ON public.ais_data FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ais_data" 
ON public.ais_data FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ais_data" 
ON public.ais_data FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ais_data" 
ON public.ais_data FOR DELETE 
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ais_data_user_key ON public.ais_data(user_id, assessment_year);
