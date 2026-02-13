-- FIX INCOME SOURCES TABLE SCHEMA
-- This script relaxes constraints to allow multiple income entries (Manual Entry + Auto-fill).

DO $$ 
BEGIN
    -- 1. Make source_type optional (if not already)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'source_type') THEN
        ALTER TABLE public.income_sources ALTER COLUMN source_type DROP NOT NULL;
    END IF;

    -- 2. Add Missing Columns (Salary, House Property, Business, etc.)
    -- These columns are needed by the Auto-fill service but might be null for Manual Entry.
    
    -- Salary
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'has_salary') THEN
        ALTER TABLE public.income_sources ADD COLUMN has_salary boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'salary_gross') THEN
        ALTER TABLE public.income_sources ADD COLUMN salary_gross numeric default 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'salary_exemptions') THEN
        ALTER TABLE public.income_sources ADD COLUMN salary_exemptions jsonb default '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'salary_tds') THEN
        ALTER TABLE public.income_sources ADD COLUMN salary_tds numeric default 0;
    END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'employer_tan') THEN
        ALTER TABLE public.income_sources ADD COLUMN employer_tan text;
    END IF;

    -- House Property
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'has_house_property') THEN
         ALTER TABLE public.income_sources ADD COLUMN has_house_property boolean default false;
    END IF;
    -- (Add other columns as needed, kept brief for this targeted fix)

    -- Missing Generic Columns for List Model (used by Income.tsx and Reconciler)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'amount') THEN
        ALTER TABLE public.income_sources ADD COLUMN amount numeric default 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'tds_deducted') THEN
        ALTER TABLE public.income_sources ADD COLUMN tds_deducted numeric default 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'description') THEN
        ALTER TABLE public.income_sources ADD COLUMN description text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'employer_name') THEN
        ALTER TABLE public.income_sources ADD COLUMN employer_name text;
    END IF;

    -- Crypto / VDA (used by Crypto Tax page → Filing Wizard bridge)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'has_crypto') THEN
        ALTER TABLE public.income_sources ADD COLUMN has_crypto boolean default false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'crypto_gains') THEN
        ALTER TABLE public.income_sources ADD COLUMN crypto_gains numeric default 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'crypto_tds') THEN
        ALTER TABLE public.income_sources ADD COLUMN crypto_tds numeric default 0;
    END IF;
    
    -- 3. REMOVE Unique Constraint if it exists
    -- This constraint blocks adding multiple income sources (e.g. 2 salaries or Salary + Business).
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_sources_user_ay_unique') THEN
        ALTER TABLE public.income_sources DROP CONSTRAINT income_sources_user_ay_unique;
    END IF;

END $$;
