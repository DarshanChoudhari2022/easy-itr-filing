/**
 * Supabase Data Service
 * Handles all CRUD operations for tax filing data
 * Provides persistence layer for income, deductions, filings, crypto, and bank details
 */

import { supabase } from '../integrations/supabase/client';

// ============ INCOME SOURCES ============

export interface IncomeSourcesData {
    assessment_year: string;
    has_salary?: boolean;
    salary_gross?: number;
    salary_exemptions?: Record<string, number>;
    salary_tds?: number;
    employer_name?: string;
    employer_tan?: string;
    has_house_property?: boolean;
    house_property_type?: string;
    annual_rent_received?: number;
    municipal_taxes?: number;
    home_loan_interest?: number;
    net_house_property_income?: number;
    has_business_income?: boolean;
    business_type?: string;
    business_name?: string;
    business_code?: string;
    gstin?: string;
    total_turnover?: number;
    digital_receipts?: number;
    cash_receipts?: number;
    presumptive_income?: number;
    has_capital_gains?: boolean;
    stcg_equity?: number;
    stcg_other?: number;
    ltcg_equity?: number;
    ltcg_other?: number;
    has_crypto?: boolean;
    crypto_gains?: number;
    crypto_tds?: number;
    has_other_sources?: boolean;
    savings_interest?: number;
    fd_interest?: number;
    dividend_income?: number;
    other_income?: number;
    has_agriculture?: boolean;
    agriculture_income?: number;
}

export async function saveIncomeSources(data: IncomeSourcesData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('income_sources')
        .upsert({
            user_id: user.id,
            ...data,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id,assessment_year',
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getIncomeSources(assessmentYear: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', user.id)
        .eq('assessment_year', assessmentYear)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// ============ DEDUCTIONS ============

export interface DeductionsData {
    assessment_year: string;
    section_80c?: number;
    section_80ccc?: number;
    section_80ccd_1?: number;
    section_80ccd_1b?: number;
    section_80ccd_2?: number;
    section_80d?: number;
    section_80dd?: number;
    section_80ddb?: number;
    section_80e?: number;
    section_80ee?: number;
    section_80eea?: number;
    section_80g?: number;
    section_80gg?: number;
    section_80tta?: number;
    section_80ttb?: number;
    section_80u?: number;
    hra_exemption?: number;
    lta_exemption?: number;
    deduction_details?: Record<string, any>;
}

export async function saveDeductions(data: DeductionsData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('deductions')
        .upsert({
            user_id: user.id,
            ...data,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id,assessment_year',
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getDeductions(assessmentYear: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('deductions')
        .select('*')
        .eq('user_id', user.id)
        .eq('assessment_year', assessmentYear)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// ============ BANK DETAILS ============

export interface BankDetailsData {
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_type?: string;
    is_refund_account?: boolean;
    is_primary?: boolean;
}

export async function saveBankDetails(data: BankDetailsData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('bank_details')
        .upsert({
            user_id: user.id,
            ...data,
        }, {
            onConflict: 'user_id,account_number,ifsc_code',
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getBankDetails() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('bank_details')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function deleteBankDetail(id: string) {
    const { error } = await supabase
        .from('bank_details')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============ CRYPTO TRADES ============

export interface CryptoTradeData {
    token_symbol: string;
    trade_type: string;
    quantity: number;
    price_per_unit: number;
    fee?: number;
    fee_currency?: string;
    tds_deducted?: number;
    trade_date: string;
    exchange?: string;
    assessment_year?: string;
    tx_hash?: string;
    metadata?: Record<string, any>;
}

export async function saveCryptoTrades(trades: CryptoTradeData[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const rows = trades.map(trade => ({
        user_id: user.id,
        ...trade,
    }));

    const { data, error } = await supabase
        .from('crypto_trades')
        .insert(rows)
        .select();

    if (error) throw error;
    return data;
}

export async function getCryptoTrades(assessmentYear?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
        .from('crypto_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('trade_date', { ascending: true });

    if (assessmentYear) {
        query = query.eq('assessment_year', assessmentYear);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function deleteCryptoTrade(id: string) {
    const { error } = await supabase
        .from('crypto_trades')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function deleteAllCryptoTrades(assessmentYear?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
        .from('crypto_trades')
        .delete()
        .eq('user_id', user.id);

    if (assessmentYear) {
        query = query.eq('assessment_year', assessmentYear);
    }

    const { error } = await query;
    if (error) throw error;
}

// ============ FORM 16 DATA ============

export interface Form16SaveData {
    assessment_year: string;
    employer_name?: string;
    employer_tan?: string;
    employer_pan?: string;
    gross_salary?: number;
    exemptions?: Record<string, number>;
    deductions_under_16?: Record<string, number>;
    tds_deducted?: number;
    parse_confidence?: number;
    raw_text?: string;
}

export async function saveForm16Data(data: Form16SaveData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('form16_data')
        .upsert({
            user_id: user.id,
            ...data,
        }, {
            onConflict: 'user_id,assessment_year,employer_tan',
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getForm16Data(assessmentYear: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('form16_data')
        .select('*')
        .eq('user_id', user.id)
        .eq('assessment_year', assessmentYear);

    if (error) throw error;
    return data || [];
}

// ============ ITR FILINGS ============

export interface ITRFilingData {
    assessment_year: string;
    form_type: string;
    regime: string;
    filing_type?: string;
    status?: string;
    gross_total_income?: number;
    total_deductions?: number;
    taxable_income?: number;
    total_tax?: number;
    tds_paid?: number;
    refund_or_due?: number;
    is_refund?: boolean;
    filing_data: Record<string, any>;
    tax_computation?: Record<string, any>;
    json_snapshot?: Record<string, any>;
}

export async function saveITRFiling(data: ITRFilingData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('itr_filings')
        .insert({
            user_id: user.id,
            ...data,
            updated_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getITRFilings(assessmentYear?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
        .from('itr_filings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (assessmentYear) {
        query = query.eq('assessment_year', assessmentYear);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function updateITRFilingStatus(id: string, status: string, ackNumber?: string) {
    const updates: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
    };

    if (status === 'filed') {
        updates.filed_at = new Date().toISOString();
    }
    if (status === 'verified') {
        updates.verified_at = new Date().toISOString();
    }
    if (ackNumber) {
        updates.ack_number = ackNumber;
    }

    const { data, error } = await supabase
        .from('itr_filings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ============ PROFILE KYC ============

export interface ProfileKYCData {
    full_name?: string;
    pan_number?: string;
    date_of_birth?: string;
    gender?: string;
    father_name?: string;
    mobile?: string;
    aadhaar_last4?: string;
    flat_no?: string;
    building?: string;
    street?: string;
    locality?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    resident_status?: string;
    filing_status_type?: string;
    onboarding_completed?: boolean;
}

export async function updateProfileKYC(data: ProfileKYCData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id)
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getProfileKYC() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) throw error;
    return data;
}

// ============ USER PLAN ============

export async function getUserPlan(): Promise<{ plan: string; validUntil: string | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { plan: 'free', validUntil: null };

    const { data, error } = await supabase
        .from('profiles')
        .select('current_plan, plan_valid_until')
        .eq('id', user.id)
        .single();

    if (error || !data) return { plan: 'free', validUntil: null };

    // Check if plan has expired
    if (data.plan_valid_until && new Date(data.plan_valid_until) < new Date()) {
        return { plan: 'free', validUntil: null };
    }

    return {
        plan: (data as any).current_plan || 'free',
        validUntil: (data as any).plan_valid_until,
    };
}

