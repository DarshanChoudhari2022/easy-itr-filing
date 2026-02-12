-- ============================================================
-- Tax Mitra — Crypto Tax Engine Schema
-- AY 2026-27 (FY 2025-26)
-- Section 115BBH + Section 194S Compliance
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. VDA Asset Registry
-- Canonical list of all tokens the system knows about
-- ============================================================
CREATE TABLE IF NOT EXISTS vda_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL UNIQUE,        -- BTC, ETH, MATIC, etc.
    name TEXT,                                  -- Bitcoin, Ethereum, etc.
    asset_type VARCHAR(30) DEFAULT 'crypto',    -- crypto, stablecoin, nft, wrapped
    decimals INTEGER DEFAULT 8,
    coingecko_id TEXT,                          -- For price lookups
    is_stablecoin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common assets
INSERT INTO vda_assets (symbol, name, asset_type, is_stablecoin) VALUES
    ('BTC', 'Bitcoin', 'crypto', false),
    ('ETH', 'Ethereum', 'crypto', false),
    ('USDT', 'Tether', 'stablecoin', true),
    ('USDC', 'USD Coin', 'stablecoin', true),
    ('MATIC', 'Polygon', 'crypto', false),
    ('SOL', 'Solana', 'crypto', false),
    ('XRP', 'Ripple', 'crypto', false),
    ('DOGE', 'Dogecoin', 'crypto', false),
    ('ADA', 'Cardano', 'crypto', false),
    ('DOT', 'Polkadot', 'crypto', false),
    ('AVAX', 'Avalanche', 'crypto', false),
    ('SHIB', 'Shiba Inu', 'crypto', false),
    ('LINK', 'Chainlink', 'crypto', false),
    ('INR', 'Indian Rupee', 'fiat', false)
ON CONFLICT (symbol) DO NOTHING;

-- ============================================================
-- 2. Import Sessions
-- Tracks each upload batch per user, exchange, and FY
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_import_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange VARCHAR(50) NOT NULL DEFAULT 'CoinDCX',
    financial_year VARCHAR(10) NOT NULL,        -- '2024-25', '2025-26'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
        -- pending → processing → completed / failed
    total_files INTEGER DEFAULT 0,
    total_rows_parsed INTEGER DEFAULT 0,
    total_transactions_created INTEGER DEFAULT 0,
    total_duplicates_skipped INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_sessions_user ON crypto_import_sessions(user_id);
CREATE INDEX idx_import_sessions_fy ON crypto_import_sessions(financial_year);

-- ============================================================
-- 3. Raw Files
-- Metadata of each uploaded CSV
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_raw_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES crypto_import_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type VARCHAR(30) NOT NULL,
        -- 'trades', 'deposits', 'withdrawals', 'tds', 'rewards', 'generic'
    file_size_bytes INTEGER,
    row_count INTEGER DEFAULT 0,
    parsed_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    content_hash VARCHAR(64),                   -- SHA-256 of file content for dedup
    parse_errors JSONB DEFAULT '[]',            -- [{line, message}]
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent uploading the exact same file twice
    UNIQUE(user_id, content_hash)
);

CREATE INDEX idx_raw_files_session ON crypto_raw_files(session_id);

-- ============================================================
-- 4. Raw Rows (Optional — stores original CSV data for audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_raw_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES crypto_raw_files(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_data JSONB NOT NULL,                    -- Original CSV row as key-value
    normalized BOOLEAN DEFAULT FALSE,
    transaction_id UUID,                        -- Link back to normalized tx
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_rows_file ON crypto_raw_rows(file_id);

-- ============================================================
-- 5. Normalized Transactions
-- The single source of truth for all VDA events
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    import_session_id UUID REFERENCES crypto_import_sessions(id),
    raw_file_id UUID REFERENCES crypto_raw_files(id),
    raw_row_id UUID REFERENCES crypto_raw_rows(id),

    -- Trade Identity
    external_id TEXT,                           -- trade_id from exchange
    exchange VARCHAR(50) NOT NULL DEFAULT 'CoinDCX',
    
    -- Classification
    transaction_type VARCHAR(30) NOT NULL,
        -- 'buy', 'sell', 'swap_in', 'swap_out', 'deposit', 'withdrawal',
        -- 'reward_staking', 'reward_airdrop', 'reward_interest', 'reward_mining',
        -- 'gift_received', 'gift_sent', 'internal_transfer', 'fee'
    is_taxable_event BOOLEAN DEFAULT FALSE,     -- True for sell, swap_out, gift_sent
    category VARCHAR(30) NOT NULL DEFAULT 'trade',
        -- 'trade', 'transfer', 'reward', 'fee', 'other'

    -- Asset Details
    asset_symbol VARCHAR(20) NOT NULL,
    quote_asset VARCHAR(20) DEFAULT 'INR',      -- What was received/paid
    pair VARCHAR(40),                           -- e.g., 'BTC/INR', 'ETH/USDT'

    -- Amounts
    quantity DECIMAL(36, 18) NOT NULL,
    price_per_unit DECIMAL(36, 8) NOT NULL,     -- Price in quote_asset
    price_inr DECIMAL(36, 2) NOT NULL,          -- Price in INR (converted)
    gross_amount_quote DECIMAL(36, 8),          -- quantity * price_per_unit
    gross_amount_inr DECIMAL(36, 2),            -- quantity * price_inr
    
    -- Fees
    fee_amount DECIMAL(36, 8) DEFAULT 0,
    fee_asset VARCHAR(20),
    fee_inr DECIMAL(36, 2) DEFAULT 0,

    -- TDS
    tds_amount DECIMAL(36, 2) DEFAULT 0,        -- TDS deducted by exchange
    tds_rate DECIMAL(5, 4) DEFAULT 0.01,        -- Usually 1%

    -- Swap/Trade counterparty
    counter_asset VARCHAR(20),                  -- For crypto-to-crypto
    counter_quantity DECIMAL(36, 18),
    
    -- Timestamps
    trade_timestamp TIMESTAMPTZ NOT NULL,
    settlement_timestamp TIMESTAMPTZ,
    
    -- Financial Year classification
    financial_year VARCHAR(10) NOT NULL,
    assessment_year VARCHAR(10) NOT NULL,

    -- Metadata
    description TEXT,
    tx_hash VARCHAR(100),                       -- On-chain transaction hash
    order_id TEXT,
    raw_data JSONB,                             -- Original row for audit
    
    -- Dedup & Audit
    content_hash VARCHAR(64),                   -- Hash of key fields for dedup
    is_duplicate BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Idempotency: prevent exact duplicate transactions
    UNIQUE(user_id, external_id, exchange, trade_timestamp, asset_symbol, transaction_type)
);

CREATE INDEX idx_crypto_tx_user ON crypto_transactions(user_id);
CREATE INDEX idx_crypto_tx_fy ON crypto_transactions(financial_year);
CREATE INDEX idx_crypto_tx_asset ON crypto_transactions(asset_symbol);
CREATE INDEX idx_crypto_tx_type ON crypto_transactions(transaction_type);
CREATE INDEX idx_crypto_tx_date ON crypto_transactions(trade_timestamp);
CREATE INDEX idx_crypto_tx_session ON crypto_transactions(import_session_id);
CREATE INDEX idx_crypto_tx_taxable ON crypto_transactions(user_id, financial_year, is_taxable_event);

-- ============================================================
-- 6. TDS Records
-- Separate tracking for Section 194S TDS
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_tds_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES crypto_transactions(id),
    import_session_id UUID REFERENCES crypto_import_sessions(id),

    -- TDS Details
    tds_date TIMESTAMPTZ NOT NULL,
    section VARCHAR(10) DEFAULT '194S',
    exchange VARCHAR(50) DEFAULT 'CoinDCX',
    
    -- Amounts
    gross_consideration_inr DECIMAL(36, 2) NOT NULL,
    tds_rate DECIMAL(5, 4) DEFAULT 0.01,
    tds_amount_inr DECIMAL(36, 2) NOT NULL,
    
    -- Reconciliation
    matched_to_trade BOOLEAN DEFAULT FALSE,
    trade_reference TEXT,                       -- Exchange trade ID
    certificate_number TEXT,                    -- TDS certificate number
    
    -- For 26AS cross-check
    tan_of_deductor VARCHAR(15),               -- CoinDCX TAN
    quarter VARCHAR(5),                        -- Q1, Q2, Q3, Q4
    
    -- Metadata
    raw_data JSONB,
    financial_year VARCHAR(10) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, trade_reference, tds_date, exchange)
);

CREATE INDEX idx_tds_user ON crypto_tds_records(user_id);
CREATE INDEX idx_tds_fy ON crypto_tds_records(financial_year);
CREATE INDEX idx_tds_matched ON crypto_tds_records(matched_to_trade);

-- ============================================================
-- 7. FX Rates
-- Daily INR rates for non-INR quote pairs
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_fx_rates (
    asset_symbol VARCHAR(20) NOT NULL,
    rate_date DATE NOT NULL,
    rate_inr DECIMAL(36, 8) NOT NULL,           -- 1 unit of asset = X INR
    source VARCHAR(30) DEFAULT 'coingecko',     -- Data source
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (asset_symbol, rate_date)
);

-- Pre-populate USDT rates (approximate)
INSERT INTO crypto_fx_rates (asset_symbol, rate_date, rate_inr, source)
SELECT 'USDT', date_series::DATE, 83.50 + (random() * 2), 'seed_data'
FROM generate_series('2024-04-01'::DATE, '2026-03-31'::DATE, '1 day') AS date_series
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. Tax Lots (FIFO/LIFO/HIFO tracking)
-- Records each acquisition lot for cost basis matching
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_tax_lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buy_transaction_id UUID NOT NULL REFERENCES crypto_transactions(id),
    
    asset_symbol VARCHAR(20) NOT NULL,
    original_quantity DECIMAL(36, 18) NOT NULL,
    remaining_quantity DECIMAL(36, 18) NOT NULL,
    cost_basis_per_unit DECIMAL(36, 8) NOT NULL, -- In INR
    total_cost_inr DECIMAL(36, 2) NOT NULL,
    
    acquisition_date TIMESTAMPTZ NOT NULL,
    acquisition_type VARCHAR(30) NOT NULL,       -- 'purchase', 'swap', 'reward', 'airdrop'
    exchange VARCHAR(50),
    financial_year VARCHAR(10) NOT NULL,
    
    is_fully_consumed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tax_lots_user_asset ON crypto_tax_lots(user_id, asset_symbol);
CREATE INDEX idx_tax_lots_remaining ON crypto_tax_lots(user_id, asset_symbol, is_fully_consumed);
CREATE INDEX idx_tax_lots_date ON crypto_tax_lots(acquisition_date);

-- ============================================================
-- 9. Lot Matches (Audit Trail)
-- Records each FIFO match: which sell consumed which buy lot
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_lot_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    sell_transaction_id UUID NOT NULL REFERENCES crypto_transactions(id),
    buy_lot_id UUID NOT NULL REFERENCES crypto_tax_lots(id),
    
    asset_symbol VARCHAR(20) NOT NULL,
    matched_quantity DECIMAL(36, 18) NOT NULL,
    
    -- Cost & Proceeds
    buy_price_per_unit DECIMAL(36, 8) NOT NULL,
    sell_price_per_unit DECIMAL(36, 8) NOT NULL,
    cost_of_acquisition DECIMAL(36, 2) NOT NULL,
    sale_consideration DECIMAL(36, 2) NOT NULL,
    gain_loss DECIMAL(36, 2) NOT NULL,
    
    -- Holding period
    buy_date TIMESTAMPTZ NOT NULL,
    sell_date TIMESTAMPTZ NOT NULL,
    holding_days INTEGER NOT NULL,
    
    -- Tax classification
    accounting_method VARCHAR(10) NOT NULL DEFAULT 'FIFO',
    financial_year VARCHAR(10) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lot_matches_user ON crypto_lot_matches(user_id);
CREATE INDEX idx_lot_matches_fy ON crypto_lot_matches(financial_year);
CREATE INDEX idx_lot_matches_asset ON crypto_lot_matches(asset_symbol);

-- ============================================================
-- 10. Tax Summaries (Computed per FY)
-- Pre-computed summary for fast UI rendering
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_tax_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    financial_year VARCHAR(10) NOT NULL,
    assessment_year VARCHAR(10) NOT NULL,
    
    -- Gross figures
    total_buy_volume INTEGER DEFAULT 0,         -- Count of buy transactions
    total_sell_volume INTEGER DEFAULT 0,        -- Count of sell transactions
    total_consideration_inr DECIMAL(36, 2) DEFAULT 0,
    total_cost_of_acquisition_inr DECIMAL(36, 2) DEFAULT 0,
    
    -- Gains & Losses
    gross_gains_inr DECIMAL(36, 2) DEFAULT 0,   -- Sum of all profitable trades
    gross_losses_inr DECIMAL(36, 2) DEFAULT 0,  -- Sum of all loss-making trades
    net_gain_loss_inr DECIMAL(36, 2) DEFAULT 0, -- For info only
    
    -- Taxable amount (Section 115BBH rules)
    taxable_capital_gains DECIMAL(36, 2) DEFAULT 0, -- = gross_gains (NO loss set-off)
    
    -- Other Income (rewards, staking, airdrops)
    other_income_inr DECIMAL(36, 2) DEFAULT 0,
    
    -- Tax Computation
    tax_on_gains_30pct DECIMAL(36, 2) DEFAULT 0,
    tax_on_other_30pct DECIMAL(36, 2) DEFAULT 0,
    surcharge DECIMAL(36, 2) DEFAULT 0,
    cess_4pct DECIMAL(36, 2) DEFAULT 0,
    total_tax_liability DECIMAL(36, 2) DEFAULT 0,
    
    -- TDS & Payments
    total_tds_paid DECIMAL(36, 2) DEFAULT 0,
    total_tds_records INTEGER DEFAULT 0,
    tds_reconciliation_status VARCHAR(20) DEFAULT 'pending',
        -- 'pending', 'matched', 'discrepancy'
    tds_discrepancy_pct DECIMAL(5, 2) DEFAULT 0,
    
    -- Final
    net_tax_payable DECIMAL(36, 2) DEFAULT 0,   -- Positive = pay, Negative = refund
    
    -- VDA Schedule Stats
    total_vda_entries INTEGER DEFAULT 0,
    unique_assets_traded INTEGER DEFAULT 0,
    
    -- Computation metadata
    accounting_method VARCHAR(10) DEFAULT 'FIFO',
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    engine_version VARCHAR(10) DEFAULT '2.0.0',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, financial_year)
);

-- ============================================================
-- 11. VDA Report Lines (Schedule VDA for ITR)
-- One row per disposal event, ready for ITR Schedule VDA
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_vda_report_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    summary_id UUID REFERENCES crypto_tax_summaries(id),
    financial_year VARCHAR(10) NOT NULL,
    
    sl_no INTEGER NOT NULL,
    date_of_transfer DATE NOT NULL,
    date_of_acquisition DATE,
    head_of_income VARCHAR(50) DEFAULT 'Capital Gains - 115BBH',
    description_of_vda TEXT NOT NULL,           -- e.g., "0.5 BTC (Bitcoin)"
    asset_symbol VARCHAR(20) NOT NULL,
    
    sale_consideration DECIMAL(36, 2) NOT NULL,
    cost_of_acquisition DECIMAL(36, 2) NOT NULL,
    income_from_transfer DECIMAL(36, 2) NOT NULL, -- gain or loss
    
    exchange VARCHAR(50) DEFAULT 'CoinDCX',
    sell_transaction_id UUID REFERENCES crypto_transactions(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vda_lines_user ON crypto_vda_report_lines(user_id, financial_year);

-- ============================================================
-- 12. Exchange-wise TDS Summary (for 26AS cross-check)
-- ============================================================
CREATE TABLE IF NOT EXISTS crypto_tds_exchange_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    financial_year VARCHAR(10) NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    quarter VARCHAR(5),                        -- Q1, Q2, Q3, Q4
    
    total_trades INTEGER DEFAULT 0,
    total_consideration_inr DECIMAL(36, 2) DEFAULT 0,
    total_tds_inr DECIMAL(36, 2) DEFAULT 0,
    
    -- 26AS values (user-entered or AIS-parsed)
    form26as_tds DECIMAL(36, 2),
    discrepancy DECIMAL(36, 2),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, financial_year, exchange, quarter)
);

-- ============================================================
-- RLS Policies — Users can only access their own data
-- ============================================================
ALTER TABLE crypto_import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_raw_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_raw_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tds_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_lot_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tax_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_vda_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_tds_exchange_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for each table
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'crypto_import_sessions',
            'crypto_raw_files',
            'crypto_transactions',
            'crypto_tds_records',
            'crypto_tax_lots',
            'crypto_lot_matches',
            'crypto_tax_summaries',
            'crypto_vda_report_lines',
            'crypto_tds_exchange_summary'
        ])
    LOOP
        EXECUTE format(
            'CREATE POLICY "%s_user_policy" ON %I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());',
            tbl, tbl
        );
    END LOOP;
END $$;

-- Raw rows policy uses file-level access through session
CREATE POLICY "crypto_raw_rows_user_policy" ON crypto_raw_rows
    FOR ALL USING (
        file_id IN (
            SELECT id FROM crypto_raw_files WHERE user_id = auth.uid()
        )
    );

-- ============================================================
-- Helper Functions
-- ============================================================

-- Get financial year from a date
CREATE OR REPLACE FUNCTION get_financial_year(d DATE)
RETURNS VARCHAR(10) AS $$
BEGIN
    IF EXTRACT(MONTH FROM d) >= 4 THEN
        RETURN EXTRACT(YEAR FROM d)::TEXT || '-' || 
               LPAD((EXTRACT(YEAR FROM d)::INT + 1) % 100::TEXT, 2, '0');
    ELSE
        RETURN (EXTRACT(YEAR FROM d)::INT - 1)::TEXT || '-' || 
               LPAD(EXTRACT(YEAR FROM d)::INT % 100::TEXT, 2, '0');
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get assessment year from financial year
CREATE OR REPLACE FUNCTION get_assessment_year(fy VARCHAR(10))
RETURNS VARCHAR(10) AS $$
DECLARE
    start_year INT;
BEGIN
    start_year := SPLIT_PART(fy, '-', 1)::INT;
    RETURN (start_year + 1)::TEXT || '-' || LPAD(((start_year + 2) % 100)::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Trigger: Auto-set financial_year on transactions
-- ============================================================
CREATE OR REPLACE FUNCTION set_transaction_fy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.financial_year IS NULL OR NEW.financial_year = '' THEN
        NEW.financial_year := get_financial_year(NEW.trade_timestamp::DATE);
    END IF;
    IF NEW.assessment_year IS NULL OR NEW.assessment_year = '' THEN
        NEW.assessment_year := get_assessment_year(NEW.financial_year);
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_transaction_fy
    BEFORE INSERT OR UPDATE ON crypto_transactions
    FOR EACH ROW EXECUTE FUNCTION set_transaction_fy();

-- ============================================================
-- Trigger: Auto-classify taxable events
-- ============================================================
CREATE OR REPLACE FUNCTION classify_taxable_event()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_taxable_event := NEW.transaction_type IN (
        'sell', 'swap_out', 'gift_sent', 'nft_sale'
    );
    
    NEW.category := CASE
        WHEN NEW.transaction_type IN ('buy', 'sell', 'swap_in', 'swap_out') THEN 'trade'
        WHEN NEW.transaction_type IN ('deposit', 'withdrawal', 'internal_transfer') THEN 'transfer'
        WHEN NEW.transaction_type LIKE 'reward_%' THEN 'reward'
        WHEN NEW.transaction_type = 'fee' THEN 'fee'
        ELSE 'other'
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_classify_taxable
    BEFORE INSERT OR UPDATE ON crypto_transactions
    FOR EACH ROW EXECUTE FUNCTION classify_taxable_event();

-- ============================================================
-- Done. Schema ready for Tax Mitra Crypto Engine v2.
-- ============================================================
