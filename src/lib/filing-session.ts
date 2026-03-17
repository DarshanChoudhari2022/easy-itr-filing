/**
 * Filing Session — Central Data Store for ITR Filing
 * 
 * Single source of truth for all filing data. Every module
 * (Crypto, Income, Deductions, Form16, AIS) pushes data here.
 * The wizard reads from here to build the ITR JSON.
 * 
 * Storage: Supabase `filing_sessions` table + localStorage cache
 */

import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type FilingStatus =
    | 'not_started'
    | 'personal_info'
    | 'income_selection'
    | 'income_entry'
    | 'deductions'
    | 'regime_selection'
    | 'review'
    | 'json_generated'
    | 'filed';

export type ITRFormType = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'auto';
export type TaxRegime = 'old' | 'new' | 'undecided';

export interface PersonalInfo {
    pan: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    dateOfBirth: string;
    gender: 'M' | 'F' | 'O';
    fatherName: string;
    email: string;
    mobile: string;
    flatNo: string;
    building?: string;
    street?: string;
    locality?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    residentStatus: 'RES' | 'NRI' | 'RNOR';
    filingStatus: 'INDIVIDUAL' | 'HUF';
}

export interface SalaryIncome {
    enabled: boolean;
    employerName: string;
    employerTAN: string;
    grossSalary: number;
    exemptAllowances: number;
    standardDeduction: number;
    professionalTax: number;
    netTaxable: number;
    tdsSalary: number;
    form16Uploaded: boolean;
}

export interface HousePropertyIncome {
    enabled: boolean;
    propertyType: 'self_occupied' | 'let_out' | 'deemed_let_out';
    annualRent: number;
    municipalTax: number;
    homeLoanInterest: number;
    netIncome: number;
}

export interface CapitalGainsIncome {
    enabled: boolean;
    // Equity
    stcgEquity: number;   // 15% STCG on listed shares
    ltcgEquity: number;   // 10% LTCG > ₹1L on listed shares
    // Other
    stcgOther: number;    // Slab rate
    ltcgOther: number;    // 20% with indexation
    // Property
    ltcgProperty: number;
    // Total
    totalCapitalGains: number;
    tdsCapitalGains: number;
}

export interface CryptoVDAIncome {
    enabled: boolean;
    taxableGains: number;          // From crypto module
    saleConsideration: number;     // Total sell proceeds
    costOfAcquisition: number;     // FIFO cost basis
    grossLosses: number;           // Non-deductible losses
    otherIncome: number;           // Staking/rewards
    tdsCredit: number;             // §194S TDS
    numSellEvents: number;
    numFifoLots: number;
    financialYear: string;
    scheduleVDA: ScheduleVDAEntry[];
    syncedAt?: string;             // When crypto data was last synced
}

export interface ScheduleVDAEntry {
    slNo: number;
    asset: string;
    description: string;
    dateOfAcquisition: string;
    dateOfTransfer: string;
    costOfAcquisition: number;
    saleConsideration: number;
    incomeFromTransfer: number;
    taxableIncome: number;
}

export interface BusinessIncome {
    enabled: boolean;
    section: '44AD' | '44ADA' | 'regular';
    natureOfBusiness: string;
    grossReceipts: number;
    presumptiveRate: number;
    presumptiveIncome: number;
    expenses?: number;
    netProfit: number;
    tdsPayments: number;
}

export interface OtherSourcesIncome {
    enabled: boolean;
    savingsInterest: number;
    fdInterest: number;
    dividendIncome: number;
    otherIncome: number;
    otherDescription: string;
    tdsInterest: number;
    tdsDividend: number;
}

export interface ForeignAssetsIncome {
    enabled: boolean;
    foreignIncome: number;
    countryCode: string;
    taxPaidAbroad: number;
    assets: {
        type: string;
        country: string;
        value: number;
        income: number;
    }[];
}

export interface AgricultureIncome {
    enabled: boolean;
    amount: number;
}

export interface DeductionsData {
    // Chapter VI-A
    section80C: number;      // PPF, ELSS, LIC, etc. (Max 1.5L)
    section80CCC: number;    // Pension fund
    section80CCD1: number;   // NPS employee (within 80C limit)
    section80CCD1B: number;  // NPS additional (Max 50K)
    section80CCD2: number;   // NPS employer (14% of salary)
    section80D: number;      // Health insurance (Max 25K/50K)
    section80DD: number;     // Disabled dependent
    section80DDB: number;    // Medical treatment
    section80E: number;      // Education loan interest
    section80EE: number;     // Home loan interest (first-time)
    section80EEA: number;    // Affordable housing
    section80EEB: number;    // EV loan interest
    section80G: number;      // Donations
    section80GG: number;     // Rent paid (no HRA)
    section80GGA: number;    // Scientific research
    section80GGC: number;    // Political party
    section80TTA: number;    // Savings interest (Max 10K)
    section80TTB: number;    // Senior citizen interest (Max 50K)
    section80U: number;      // Disability
    // House property
    homeLoanInterest: number; // §24(b) up to 2L
    hra: number;              // HRA exemption
    lta: number;              // Leave travel
    // Total
    totalDeductions: number;
}

export interface TaxesPaid {
    tdsSalary: number;
    tdsInterest: number;
    tdsDividend: number;
    tdsRent: number;
    tdsProfessional: number;
    tdsProperty: number;
    tdsCrypto: number;
    tdsOther: number;
    tcs: number;
    advanceTax: number;
    selfAssessmentTax: number;
    totalTDS: number;
}

export interface BankDetail {
    accountNumber: string;
    ifsc: string;
    bankName: string;
    accountType: 'SB' | 'CA' | 'OTH';
    isRefundAccount: boolean;
}

export interface ComputedTax {
    regime: TaxRegime;
    grossTotalIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    taxOnIncome: number;
    surcharge: number;
    cess: number;
    totalTaxLiability: number;
    totalTDSPaid: number;
    netPayable: number;
    isRefund: boolean;
    refundAmount: number;
    marginalRelief: number;
    rebate87A: number;
    vdaTax: number;
    capitalGainsTax: number;
}

export interface FilingSession {
    id?: string;
    userId: string;
    assessmentYear: string;       // 'AY 2026-27'
    financialYear: string;        // 'FY2025-26'
    status: FilingStatus;
    currentStep: number;
    itrForm: ITRFormType;
    regime: TaxRegime;
    filingType: 'ORIGINAL' | 'REVISED' | 'BELATED';

    // Data sections
    personalInfo: Partial<PersonalInfo>;
    salary: SalaryIncome;
    houseProperty: HousePropertyIncome;
    capitalGains: CapitalGainsIncome;
    cryptoVDA: CryptoVDAIncome;
    business: BusinessIncome;
    otherSources: OtherSourcesIncome;
    foreignAssets: ForeignAssetsIncome;
    agriculture: AgricultureIncome;
    deductions: DeductionsData;
    taxesPaid: TaxesPaid;
    bankDetails: BankDetail[];

    // Computed
    computedTaxOld?: ComputedTax;
    computedTaxNew?: ComputedTax;
    selectedRegime?: TaxRegime;

    // Metadata
    jsonGeneratedAt?: string;
    filedAt?: string;
    createdAt: string;
    updatedAt: string;

    // Validation
    validationErrors: string[];
    validationWarnings: string[];
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════

export function createDefaultSession(userId: string, fy: string): FilingSession {
    const startYr = parseInt(fy.replace('FY', '').split('-')[0]);
    const ay = `AY ${startYr + 1}-${String(startYr + 2).slice(-2)}`;

    return {
        userId,
        assessmentYear: ay,
        financialYear: fy,
        status: 'not_started',
        currentStep: 0,
        itrForm: 'auto',
        regime: 'undecided',
        filingType: 'ORIGINAL',
        personalInfo: {},
        salary: { enabled: false, employerName: '', employerTAN: '', grossSalary: 0, exemptAllowances: 0, standardDeduction: 75000, professionalTax: 0, netTaxable: 0, tdsSalary: 0, form16Uploaded: false },
        houseProperty: { enabled: false, propertyType: 'self_occupied', annualRent: 0, municipalTax: 0, homeLoanInterest: 0, netIncome: 0 },
        capitalGains: { enabled: false, stcgEquity: 0, ltcgEquity: 0, stcgOther: 0, ltcgOther: 0, ltcgProperty: 0, totalCapitalGains: 0, tdsCapitalGains: 0 },
        cryptoVDA: { enabled: false, taxableGains: 0, saleConsideration: 0, costOfAcquisition: 0, grossLosses: 0, otherIncome: 0, tdsCredit: 0, numSellEvents: 0, numFifoLots: 0, financialYear: fy, scheduleVDA: [] },
        business: { enabled: false, section: '44AD', natureOfBusiness: '', grossReceipts: 0, presumptiveRate: 6, presumptiveIncome: 0, netProfit: 0, tdsPayments: 0 },
        otherSources: { enabled: false, savingsInterest: 0, fdInterest: 0, dividendIncome: 0, otherIncome: 0, otherDescription: '', tdsInterest: 0, tdsDividend: 0 },
        foreignAssets: { enabled: false, foreignIncome: 0, countryCode: '', taxPaidAbroad: 0, assets: [] },
        agriculture: { enabled: false, amount: 0 },
        deductions: {
            section80C: 0, section80CCC: 0, section80CCD1: 0, section80CCD1B: 0, section80CCD2: 0,
            section80D: 0, section80DD: 0, section80DDB: 0, section80E: 0, section80EE: 0,
            section80EEA: 0, section80EEB: 0, section80G: 0, section80GG: 0, section80GGA: 0,
            section80GGC: 0, section80TTA: 0, section80TTB: 0, section80U: 0,
            homeLoanInterest: 0, hra: 0, lta: 0, totalDeductions: 0,
        },
        taxesPaid: {
            tdsSalary: 0, tdsInterest: 0, tdsDividend: 0, tdsRent: 0,
            tdsProfessional: 0, tdsProperty: 0, tdsCrypto: 0, tdsOther: 0,
            tcs: 0, advanceTax: 0, selfAssessmentTax: 0, totalTDS: 0,
        },
        bankDetails: [],
        validationErrors: [],
        validationWarnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE — localStorage + Supabase
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'easyitr_filing_session';

function getStorageKey(userId: string, fy: string): string {
    return `${STORAGE_KEY}_${userId}_${fy}`;
}

/** Save session to localStorage (instant) + try Supabase (async) */
export async function saveFilingSession(session: FilingSession): Promise<void> {
    session.updatedAt = new Date().toISOString();

    // 1. localStorage (instant, offline-safe)
    const key = getStorageKey(session.userId, session.financialYear);
    try {
        localStorage.setItem(key, JSON.stringify(session));
    } catch (e) {
        console.warn('[FilingSession] localStorage save failed:', e);
    }

    // 2. Supabase (async)
    try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!authSession) return;

        const payload = {
            user_id: session.userId,
            financial_year: session.financialYear,
            assessment_year: session.assessmentYear,
            status: session.status,
            current_step: session.currentStep,
            itr_form: session.itrForm,
            regime: session.regime,
            filing_type: session.filingType,
            data: JSON.stringify(session),
            updated_at: session.updatedAt,
        };

        // Upsert by user_id + financial_year
        await supabase
            .from('filing_sessions' as any)
            .upsert(payload, { onConflict: 'user_id,financial_year' });
    } catch (e) {
        console.warn('[FilingSession] Supabase save failed (will retry):', e);
    }
}

/** Load session — try localStorage first, then Supabase */
export async function loadFilingSession(userId: string, fy: string): Promise<FilingSession | null> {
    const key = getStorageKey(userId, fy);

    // 1. Try localStorage first (fast)
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const session = JSON.parse(cached) as FilingSession;
            if (session.userId === userId && session.financialYear === fy) {
                return session;
            }
        }
    } catch (e) {
        console.warn('[FilingSession] localStorage load failed:', e);
    }

    // 2. Try Supabase
    try {
        const result: any = await supabase
            .from('filing_sessions' as any)
            .select('data')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .single();

        if (result?.data?.data) {
            const sessionData = typeof result.data.data === 'string' ? JSON.parse(result.data.data) : result.data.data;
            // Cache to localStorage
            localStorage.setItem(key, JSON.stringify(sessionData));
            return sessionData as FilingSession;
        }
    } catch (e) {
        // No session exists yet — that's fine
    }

    return null;
}

/** Get or create a filing session */
export async function getOrCreateSession(userId: string, fy: string): Promise<FilingSession> {
    const existing = await loadFilingSession(userId, fy);
    if (existing) return existing;

    const session = createDefaultSession(userId, fy);
    await saveFilingSession(session);
    return session;
}

/** Delete filing session */
export async function deleteFilingSession(userId: string, fy: string): Promise<void> {
    const key = getStorageKey(userId, fy);
    localStorage.removeItem(key);
    try {
        await supabase.from('filing_sessions' as any).delete().eq('user_id', userId).eq('financial_year', fy);
    } catch (e) { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// AUTO-DETECT ITR FORM
// ═══════════════════════════════════════════════════════════════

export function autoDetectITRForm(session: FilingSession): { form: ITRFormType; reason: string } {
    const { salary, houseProperty, capitalGains, cryptoVDA, business, foreignAssets, otherSources } = session;

    // ITR-3: Business income (non-presumptive)
    if (business.enabled && business.section === 'regular') {
        return { form: 'ITR-3', reason: 'You have business/professional income (non-presumptive).' };
    }

    // ITR-4: Presumptive business (44AD/44ADA)
    if (business.enabled && (business.section === '44AD' || business.section === '44ADA')) {
        // But if also has capital gains or crypto, needs ITR-3
        if (capitalGains.enabled || cryptoVDA.enabled) {
            return { form: 'ITR-3', reason: 'Business income + Capital Gains/Crypto requires ITR-3.' };
        }
        return { form: 'ITR-4', reason: 'Presumptive business income under §44AD/44ADA.' };
    }

    // ITR-2: Capital gains, crypto, foreign assets, multiple house properties
    if (capitalGains.enabled || cryptoVDA.enabled || foreignAssets.enabled) {
        return {
            form: 'ITR-2', reason: cryptoVDA.enabled
                ? 'You have crypto/VDA income — Schedule VDA requires ITR-2.'
                : capitalGains.enabled
                    ? 'You have capital gains from stocks/property.'
                    : 'You have foreign assets/income.'
        };
    }

    // ITR-1: Simple salary + 1 house + other sources ≤ 50L
    const totalIncome = (salary.enabled ? salary.grossSalary : 0)
        + (houseProperty.enabled ? Math.abs(houseProperty.netIncome) : 0)
        + (otherSources.enabled ? (otherSources.savingsInterest + otherSources.fdInterest + otherSources.dividendIncome + otherSources.otherIncome) : 0);

    if (totalIncome <= 5000000) {
        return { form: 'ITR-1', reason: 'Simple salary/pension income under ₹50 lakhs — ITR-1 (Sahaj).' };
    }

    // Default to ITR-2 if income > 50L
    return { form: 'ITR-2', reason: 'Total income exceeds ₹50 lakhs.' };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateSession(session: FilingSession): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Personal info
    if (!session.personalInfo.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(session.personalInfo.pan)) {
        errors.push('Valid PAN number is required (format: ABCDE1234F).');
    }
    if (!session.personalInfo.firstName) errors.push('First name is required.');
    if (!session.personalInfo.dateOfBirth) errors.push('Date of birth is required.');
    if (!session.personalInfo.mobile) errors.push('Mobile number is required.');
    if (!session.personalInfo.email) errors.push('Email address is required.');
    if (!session.personalInfo.city) errors.push('City is required.');
    if (!session.personalInfo.state) errors.push('State is required.');
    if (!session.personalInfo.pincode || !/^\d{6}$/.test(session.personalInfo.pincode)) {
        errors.push('Valid 6-digit pincode is required.');
    }

    // Bank details
    if (session.bankDetails.length === 0) {
        errors.push('At least one bank account is required for filing.');
    } else {
        const hasRefund = session.bankDetails.some(b => b.isRefundAccount);
        if (!hasRefund) warnings.push('No bank account marked for refund. Select one if expecting refund.');
    }

    // Income validation
    const hasAnyIncome = session.salary.enabled || session.houseProperty.enabled ||
        session.capitalGains.enabled || session.cryptoVDA.enabled || session.business.enabled ||
        session.otherSources.enabled || session.foreignAssets.enabled;
    if (!hasAnyIncome) {
        warnings.push('No income sources selected. Add at least one income source.');
    }

    // Crypto validation
    if (session.cryptoVDA.enabled && session.cryptoVDA.scheduleVDA.length === 0) {
        warnings.push('Crypto income enabled but no Schedule VDA data. Sync from Crypto module.');
    }

    // ITR form validation
    if (session.itrForm === 'ITR-1') {
        const total = (session.salary.grossSalary || 0) + (session.otherSources.savingsInterest || 0) +
            (session.otherSources.fdInterest || 0) + (session.otherSources.dividendIncome || 0);
        if (total > 5000000) errors.push('ITR-1 not allowed for income > ₹50 lakhs. Switch to ITR-2.');
        if (session.cryptoVDA.enabled) errors.push('ITR-1 does not support crypto/VDA income. Use ITR-2.');
        if (session.capitalGains.enabled) errors.push('ITR-1 does not support capital gains. Use ITR-2.');
        if (session.foreignAssets.enabled) errors.push('ITR-1 does not support foreign assets. Use ITR-2.');
        if (session.business.enabled) errors.push('ITR-1 does not support business income. Use ITR-3/4.');
    }

    // Deduction limits
    const total80C = session.deductions.section80C + session.deductions.section80CCC + session.deductions.section80CCD1;
    if (total80C > 150000) {
        warnings.push(`80C+80CCC+80CCD(1) total ₹${total80C.toLocaleString()} exceeds ₹1.5L limit. Will be capped.`);
    }
    if (session.deductions.section80CCD1B > 50000) {
        warnings.push('80CCD(1B) NPS deduction exceeds ₹50,000 limit. Will be capped.');
    }

    // Regime
    if (session.regime === 'undecided') {
        warnings.push('Tax regime not selected yet. Compare Old vs New before filing.');
    }

    return { errors, warnings };
}

// ═══════════════════════════════════════════════════════════════
// COMPUTE TOTALS
// ═══════════════════════════════════════════════════════════════

export function computeGrossTotalIncome(session: FilingSession): number {
    let total = 0;
    if (session.salary.enabled) total += session.salary.netTaxable;
    if (session.houseProperty.enabled) total += session.houseProperty.netIncome;
    if (session.capitalGains.enabled) total += session.capitalGains.totalCapitalGains;
    // Crypto VDA taxed separately at 30% — but included in gross total
    if (session.cryptoVDA.enabled) total += session.cryptoVDA.taxableGains + session.cryptoVDA.otherIncome;
    if (session.business.enabled) total += session.business.netProfit;
    if (session.otherSources.enabled) {
        total += session.otherSources.savingsInterest + session.otherSources.fdInterest
            + session.otherSources.dividendIncome + session.otherSources.otherIncome;
    }
    if (session.foreignAssets.enabled) total += session.foreignAssets.foreignIncome;
    return total;
}

export function computeTotalTDS(session: FilingSession): number {
    let tds = 0;
    if (session.salary.enabled) tds += session.salary.tdsSalary;
    if (session.capitalGains.enabled) tds += session.capitalGains.tdsCapitalGains;
    if (session.cryptoVDA.enabled) tds += session.cryptoVDA.tdsCredit;
    if (session.business.enabled) tds += session.business.tdsPayments;
    if (session.otherSources.enabled) tds += session.otherSources.tdsInterest + session.otherSources.tdsDividend;
    tds += session.taxesPaid.advanceTax + session.taxesPaid.selfAssessmentTax;
    return tds;
}

/** Get the enabled income types as labels */
export function getEnabledIncomeTypes(session: FilingSession): string[] {
    const types: string[] = [];
    if (session.salary.enabled) types.push('Salary');
    if (session.houseProperty.enabled) types.push('House Property');
    if (session.capitalGains.enabled) types.push('Capital Gains');
    if (session.cryptoVDA.enabled) types.push('Crypto/VDA');
    if (session.business.enabled) types.push('Business/Profession');
    if (session.otherSources.enabled) types.push('Other Sources');
    if (session.foreignAssets.enabled) types.push('Foreign Assets');
    if (session.agriculture.enabled) types.push('Agriculture');
    return types;
}

/** Get filing progress percentage */
export function getFilingProgress(session: FilingSession): number {
    const steps: boolean[] = [
        // Step 1: Personal info
        !!(session.personalInfo.pan && session.personalInfo.firstName),
        // Step 2: Income selection
        session.salary.enabled || session.houseProperty.enabled || session.capitalGains.enabled ||
        session.cryptoVDA.enabled || session.business.enabled || session.otherSources.enabled,
        // Step 3: Income entry (at least one source has data)
        (session.salary.enabled && session.salary.grossSalary > 0) ||
        (session.cryptoVDA.enabled && session.cryptoVDA.taxableGains !== 0) ||
        (session.business.enabled && session.business.grossReceipts > 0) ||
        (session.otherSources.enabled && (session.otherSources.savingsInterest > 0 || session.otherSources.fdInterest > 0)),
        // Step 4: Deductions
        session.deductions.totalDeductions > 0 || session.regime === 'new',
        // Step 5: Regime selected
        session.regime !== 'undecided',
        // Step 6: Bank details
        session.bankDetails.length > 0,
        // Step 7: Review passed
        session.validationErrors.length === 0 && session.status !== 'not_started',
        // Step 8: JSON generated
        !!session.jsonGeneratedAt,
    ];
    const done = steps.filter(Boolean).length;
    return Math.round((done / steps.length) * 100);
}

