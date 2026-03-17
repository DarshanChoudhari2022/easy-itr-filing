/**
 * Crypto Tax API Client
 * 
 * Wraps all /api/crypto/* endpoints with typed responses.
 * Uses the Supabase session token for authentication.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Base fetch helper ──────────────────────────────────────────
async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }

    const url = `/api/crypto/${path}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers as Record<string, string> || {}),
    };

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json();

    if (!res.ok && !data.success) {
        throw new Error(data.message || data.error || `API error: ${res.status}`);
    }

    return data as T;
}


// ─── Types ──────────────────────────────────────────────────────

export interface TaxSummary {
    success?: boolean;
    not_computed?: boolean;
    user_id: string;
    financial_year: string;
    assessment_year: string;
    num_sell_events: number;
    num_fifo_lots: number;
    sale_consideration: number;
    cost_of_acquisition: number;
    taxable_capital_gains: number;
    gross_losses: number;
    staking_income: number;
    rewards_income: number;
    total_other_income: number;
    tds_credit: number;
    total_taxable: number;
    gross_tax: number;
    cess: number;
    total_tax_liability: number;
    net_tax_payable: number;
    refund_eligible: number;
    computed_at?: string;
}

export interface AssetPnL {
    asset: string;
    sale: number;
    cost: number;
    profit: number;
    loss: number;
    net_taxable: number;
    num_lots: number;
}

export interface AssetPnLResponse {
    success: boolean;
    financial_year: string;
    assets: AssetPnL[];
    totals: {
        sale: number;
        cost: number;
        profit: number;
        loss: number;
        net_taxable: number;
    };
}

export interface ScheduleVDARow {
    sl_no: number;
    asset: string;
    description: string;
    date_of_acquisition: string;
    date_of_transfer: string;
    head_of_income: string;
    cost_of_acquisition: number;
    sale_consideration: number;
    income_from_transfer: number;
    taxable_income: number;
}

export interface ScheduleVDAResponse {
    success: boolean;
    financial_year: string;
    rows: ScheduleVDARow[];
    total_rows: number;
    totals: {
        sale_consideration: number;
        cost_of_acquisition: number;
        taxable_income: number;
    };
}

export interface Transaction {
    id: string;
    type: string;
    asset: string;
    quantity: number;
    price_per_unit: number;
    value_inr: number;
    fee_inr: number;
    tds_inr: number;
    trade_date: string;
    financial_year: string;
    exchange: string;
    csv_source: string;
    category?: string;
    quote_currency?: string;
}

export interface TransactionsResponse {
    success: boolean;
    financial_year: string;
    transactions: Transaction[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

export interface DataQualityWarning {
    severity: 'critical' | 'high' | 'medium' | 'low';
    code: string;
    message: string;
    affected_assets?: string[];
    asset?: string;
    fix: string;
}

export interface DataQualityResponse {
    success: boolean;
    data_quality_score: number;
    status: 'clean' | 'critical' | 'warnings';
    warnings: DataQualityWarning[];
    info: { code: string; message: string }[];
    recommendation: string;
}

export interface UploadResponse {
    success: boolean;
    imported?: number;
    total_parsed?: number;
    trades_imported?: number;
    income_events_imported?: number;
    matched_to_trades?: number;
    total_tds_credit?: number;
    errors: { row: number; issue: string }[];
    message: string;
}

export interface ComputeTaxResponse {
    success: boolean;
    summary: TaxSummary;
    unmatched_sells: {
        asset: string;
        sell_date: string;
        unmatched_qty: number;
        note: string;
    }[];
    data_quality: string;
    message?: string;
}


// ─── API Methods ────────────────────────────────────────────────

/** Fetch available financial years */
export async function fetchAvailableYears(): Promise<string[]> {
    const data = await apiFetch<{ success: boolean; years: string[] }>('available-years');
    return data.years || [];
}

/** Fetch tax summary for a given FY */
export async function fetchOverview(fy: string): Promise<TaxSummary> {
    return apiFetch<TaxSummary>(`overview?fy=${fy}`);
}

/** Fetch asset-wise P&L for a given FY */
export async function fetchAssetPnL(fy: string): Promise<AssetPnLResponse> {
    return apiFetch<AssetPnLResponse>(`tax-drilldown?fy=${fy}`);
}

/** Fetch Schedule VDA data for a given FY */
export async function fetchScheduleVDA(fy: string): Promise<ScheduleVDAResponse> {
    return apiFetch<ScheduleVDAResponse>(`schedule-vda?fy=${fy}`);
}

/** Fetch paginated transactions */
export async function fetchTransactions(
    fy: string,
    type: string = 'all',
    page: number = 1,
    limit: number = 50,
    asset?: string,
): Promise<TransactionsResponse> {
    let url = `transactions?fy=${fy}&type=${type}&page=${page}&limit=${limit}`;
    if (asset) url += `&asset=${asset}`;
    return apiFetch<TransactionsResponse>(url);
}

/** Run data quality check */
export async function checkDataQuality(fy: string): Promise<DataQualityResponse> {
    return apiFetch<DataQualityResponse>(`check-data-quality?fy=${fy}`);
}

/** Trigger FIFO tax computation */
export async function computeTax(financialYear: string): Promise<ComputeTaxResponse> {
    return apiFetch<ComputeTaxResponse>('compute-tax', {
        method: 'POST',
        body: JSON.stringify({ financial_year: financialYear }),
    });
}

/** Upload Order History CSV */
export async function uploadOrderHistory(file: File): Promise<UploadResponse> {
    const csvText = await file.text();
    return apiFetch<UploadResponse>('upload/order-history', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
    });
}

/** Upload Insta History CSV */
export async function uploadInstaHistory(file: File): Promise<UploadResponse> {
    const csvText = await file.text();
    return apiFetch<UploadResponse>('upload/insta-history', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
    });
}

/** Upload TDS Certificate CSV */
export async function uploadTDS(file: File): Promise<UploadResponse> {
    const csvText = await file.text();
    return apiFetch<UploadResponse>('upload/tds-summary', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
    });
}

/** Delete all crypto data for the current user (for re-import) */
export async function deleteAllCryptoData(): Promise<{ success: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error('Not authenticated');

    const userId = session.user.id;

    // Delete from ALL crypto tables (both v5 new schema AND legacy tables)
    // Order matters: child tables first due to foreign keys
    const tablesToClear = [
        'crypto_tax_computations', // legacy
        'crypto_tax_lots',         // v5 (has FK to crypto_trades)
        'crypto_tax_summary',      // v5
        'crypto_income_events',    // v5
        'crypto_income',           // legacy
        'crypto_trades',           // v5
        'crypto_transactions',     // legacy
    ];

    for (const table of tablesToClear) {
        try {
            await supabase.from(table as any).delete().eq('user_id', userId);
        } catch {
            // Table may not exist — that's OK
        }
    }

    return { success: true };
}
