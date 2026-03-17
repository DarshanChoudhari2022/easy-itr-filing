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

    // BUG 3 FIX: Use upsert instead of insert to prevent 409 Conflict errors
    // when income_sources is saved multiple times for the same user + assessment year.
    const { data: result, error } = await supabase
        .from('income_sources' as any)
        .upsert({
            user_id: user.id,
            ...data,
            updated_at: new Date().toISOString(),
        } as any, {
            onConflict: 'user_id,assessment_year',
        })
        .select()
        .single();

    if (error) throw error;
    return result;
}

export async function getIncomeSources(assessmentYear: string): Promise<IncomeSourcesData> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('income_sources' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('assessment_year', assessmentYear);

    if (error) throw error;

    // Aggregation Logic: Convert List of Rows -> Summary Object
    const summary: IncomeSourcesData = { assessment_year: assessmentYear };

    if (data && Array.isArray(data)) {
        data.forEach((row: any) => {
            // Salary
            if (row.source_type === 'salary' || row.has_salary) {
                summary.has_salary = true;
                summary.salary_gross = (summary.salary_gross || 0) + (row.amount || row.salary_gross || 0);
                summary.salary_tds = (summary.salary_tds || 0) + (row.tds_deducted || row.salary_tds || 0);
            }

            // House Property
            if (row.source_type === 'house_property' || row.has_house_property) {
                summary.has_house_property = true;
                summary.net_house_property_income = (summary.net_house_property_income || 0) + (row.amount || row.net_house_property_income || 0);
            }

            // Business
            if (row.source_type === 'business' || row.source_type === 'business_professional' || row.has_business_income) {
                summary.has_business_income = true;
                summary.presumptive_income = (summary.presumptive_income || 0) + (row.amount || row.presumptive_income || 0);
            }

            // Capital Gains
            if (row.source_type?.startsWith('capital_gains') || row.has_capital_gains) {
                summary.has_capital_gains = true;
                if (row.source_type === 'capital_gains_equity') {
                    summary.ltcg_equity = (summary.ltcg_equity || 0) + (row.amount || row.ltcg_equity || 0);
                } else {
                    summary.ltcg_other = (summary.ltcg_other || 0) + (row.amount || row.ltcg_other || 0);
                }
            }

            // Other Sources
            if (row.source_type === 'other_sources' || row.has_other_sources) {
                summary.has_other_sources = true;
                summary.other_income = (summary.other_income || 0) + (row.amount || row.other_income || 0);
            }
        });
    }

    return summary;
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
        .from('deductions' as any)
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

export async function getDeductions(assessmentYear: string): Promise<DeductionsData> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('deductions' as any)
        .select('*')
        .eq('user_id', user.id);
    // Note: Deductions usually span user context, but if filtered by AY, add .eq('assessment_year', assessmentYear) if column exists.
    // Assuming deductions table has no assessment_year for manual entries or ignoring it for aggregation if mixed.
    // Actually, schema implies they are items. Let's filter by AY if consistent.

    if (error) throw error;

    // Aggregation Logic: Convert List of Rows -> Summary Object
    const summary: DeductionsData = { assessment_year: assessmentYear };

    if (data && Array.isArray(data)) {
        data.forEach((row: any) => {
            if (row.section) {
                const key = row.section as keyof DeductionsData;
                // TS might verify key validity. Casting summary as any to assign dynamically.
                const currentVal = (summary as any)[key] || 0;
                (summary as any)[key] = currentVal + (row.amount || 0);
            }
            // If row has column-based data (from saveDeductions upsert), merge it
            // checking keys like section_80c directly
            Object.keys(row).forEach(k => {
                if (k.startsWith('section_') && typeof row[k] === 'number') {
                    const key = k as keyof DeductionsData;
                    const val = row[k] as number;
                    (summary as any)[key] = ((summary as any)[key] || 0) + val;
                }
            });
        });
    }

    return summary;
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
        .from('bank_details' as any)
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
        .from('bank_details' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function deleteBankDetail(id: string) {
    const { error } = await supabase
        .from('bank_details' as any)
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
        .from('crypto_trades' as any)
        .insert(rows)
        .select();

    if (error) throw error;
    return data;
}

export async function getCryptoTrades(assessmentYear?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
        .from('crypto_trades' as any)
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
        .from('crypto_trades' as any)
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function deleteAllCryptoTrades(assessmentYear?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
        .from('crypto_trades' as any)
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
        .from('form16_data' as any)
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
        .from('form16_data' as any)
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
        .from('itr_filings' as any)
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
        .from('itr_filings' as any)
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
        .from('itr_filings' as any)
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
    const profile = data as any;
    if (profile.plan_valid_until && new Date(profile.plan_valid_until) < new Date()) {
        return { plan: 'free', validUntil: null };
    }

    return {
        plan: (data as any).current_plan || 'free',
        validUntil: (data as any).plan_valid_until,
    };
}


// ============ AIS DATA ============

export interface AISDBData {
    assessment_year: string;
    parsed_data: Record<string, any>;
    file_path?: string;
    source_type?: string;
    status?: string;
}

export async function saveAISData(data: AISDBData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await supabase
        .from('ais_data' as any)
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

export async function getAISData(assessmentYear: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('ais_data' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('assessment_year', assessmentYear)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function uploadAISFile(file: File, assessmentYear: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const filePath = `ais/${user.id}/${assessmentYear}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('tax_documents')
        .upload(filePath, file);

    if (uploadError) throw uploadError;

    return filePath;
}

export async function getFileUrl(filePath: string) {
    const { data, error } = await supabase.storage
        .from('tax_documents')
        .createSignedUrl(filePath, 3600);

    if (error) {
        console.error('Error creating signed URL:', error);
        return null;
    }

    return data.signedUrl;
}

// ============ USER DATA STORE (replaces localStorage) ============
// Generic key-value store per user in Supabase.
// Uses the existing `filing_steps_state` table's `answers` JSON column
// with a composite key approach: user_id identifies the user,
// and we store all user data as a JSON blob.
// This ensures data is available from any browser/device.

/**
 * Save a piece of user data to Supabase.
 * This stores data in a per-user JSON blob that persists across browsers.
 * 
 * Data keys used:
 * - easyitr_transactions: NormalizedTransaction[]
 * - easyitr_tds: TDSRecord[]
 * - taxSettings: TaxSettings
 * - easyitr_crypto_tax_summary: crypto tax computation result
 * - easyitr_coindcx_creds: CoinDCX API credentials (base64 encoded)
 * - notificationSettings: notification preferences
 * - privacySettings: privacy preferences
 */

// We use a separate table approach with the 'ais_data' pattern — 
// upsert keyed on (user_id, data_key).
// Since we might not have a custom table, we'll use a generic approach
// with the existing tables.

export async function saveUserData(dataKey: string, value: any): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use ais_data table with assessment_year = data_key as a generic store
    // This is a workaround — ideally we'd have a dedicated user_data table
    const { error } = await supabase
        .from('ais_data' as any)
        .upsert({
            user_id: user.id,
            assessment_year: `__userdata__${dataKey}`,
            parsed_data: value,
            source_type: 'user_data_store',
            status: 'active',
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id,assessment_year',
        });

    if (error) {
        console.warn(`[UserDataStore] Failed to save '${dataKey}':`, error.message);
        throw error;
    }
    console.log(`[UserDataStore] ✅ Saved '${dataKey}' to database`);
}

export async function loadUserData<T = any>(dataKey: string): Promise<T | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('ais_data' as any)
        .select('parsed_data')
        .eq('user_id', user.id)
        .eq('assessment_year', `__userdata__${dataKey}`)
        .maybeSingle();

    if (error) {
        console.warn(`[UserDataStore] Failed to load '${dataKey}':`, error.message);
        return null;
    }

    if (!data) return null;
    return (data as any).parsed_data as T;
}

export async function deleteUserData(dataKey: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('ais_data' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('assessment_year', `__userdata__${dataKey}`);

    if (error) {
        console.warn(`[UserDataStore] Failed to delete '${dataKey}':`, error.message);
    }
}

/**
 * Save multiple data keys at once (batch save).
 * Each key-value pair is saved as a separate row.
 */
export async function saveUserDataBatch(entries: Record<string, any>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const rows = Object.entries(entries).map(([key, value]) => ({
        user_id: user.id,
        assessment_year: `__userdata__${key}`,
        parsed_data: value,
        source_type: 'user_data_store',
        status: 'active',
        updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('ais_data' as any)
        .upsert(rows, {
            onConflict: 'user_id,assessment_year',
        });

    if (error) {
        console.warn(`[UserDataStore] Batch save failed:`, error.message);
        throw error;
    }
    console.log(`[UserDataStore] ✅ Batch saved ${rows.length} keys`);
}

