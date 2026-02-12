/**
 * TaxMitra Tax Engine — Type Definitions
 * AY 2026-27 (FY 2025-26) compliant
 * 
 * These types model the complete Indian Income Tax computation
 * with proper separation of income heads, special rate incomes,
 * and category-wise TDS tracking.
 */

// ============= INCOME HEAD CLASSIFICATION =============

export enum IncomeHead {
    SALARY = 'Salary',
    HOUSE_PROPERTY = 'HouseProperty',
    BUSINESS_44AD = 'Business_44AD',
    BUSINESS_44ADA = 'Business_44ADA',
    BUSINESS_REGULAR = 'Business_Regular',
    BUSINESS_SPECULATIVE = 'Business_Speculative',       // Intraday equity
    BUSINESS_NON_SPECULATIVE = 'Business_NonSpeculative', // F&O
    CAPITAL_GAINS_STCG_111A = 'CapitalGains_STCG_111A',  // Listed equity STCG @ special rate
    CAPITAL_GAINS_STCG_OTHER = 'CapitalGains_STCG_Other', // Non-equity STCG @ slab rate
    CAPITAL_GAINS_LTCG_112A = 'CapitalGains_LTCG_112A',  // Listed equity LTCG @ special rate
    CAPITAL_GAINS_LTCG_OTHER = 'CapitalGains_LTCG_Other', // Other LTCG
    CRYPTO_VDA = 'Crypto_VDA',                            // Section 115BBH — 30% flat
    OTHER_SOURCES = 'OtherSources',
}

export type TaxRegime = 'old' | 'new';

export type AssessmentYear = '2024-25' | '2025-26' | '2026-27';

export type ITRFormType = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';

export type BusinessSection = '44AD' | '44ADA' | 'Regular';

// ============= INPUT: TAX PROFILE =============

export interface SalaryIncome {
    grossSalary: number;
    /** Exemptions like HRA, LTA that are already computed */
    exemptions?: number;
    /** Professional tax paid */
    professionalTax?: number;
}

export interface HousePropertyIncome {
    /** 'SOP' = Self-Occupied, 'LOP' = Let-Out */
    type: 'SOP' | 'LOP';
    annualRentReceived: number;
    municipalTaxesPaid: number;
    /** Home loan interest paid — max ₹2L deductible for SOP */
    homeLoanInterest: number;
}

export interface BusinessIncome {
    section: BusinessSection;
    /** Gross receipts / turnover */
    totalReceipts: number;
    /**
     * For 44AD: digitalReceipts (taxed at 6%) vs cashReceipts (taxed at 8%)
     * If not split, all treated as digital (conservative)
     */
    digitalReceipts?: number;
    cashReceipts?: number;
    /**
     * Only for 'Regular' section — actual expenses claimed
     */
    expenses?: number;
    /**
     * Computed net profit — auto-calculated for presumptive,
     * user-provided for Regular
     */
    netProfit?: number;
}

export interface CapitalGainsInput {
    /** Listed equity STCG (<12 months) — taxed @ 20% (AY 2026-27) / 15% (earlier) */
    stcgEquity?: number;
    /** Non-equity STCG (debt, gold, property <24/36 months) — taxed at slab rate */
    stcgOther?: number;
    /** Listed equity LTCG (>12 months) — taxed @ 12.5% above ₹1.25L exemption */
    ltcgEquity?: number;
    /** Other LTCG (property, gold, debt) — taxed @ 12.5% / 20% w/ indexation (AY dependent) */
    ltcgOther?: number;
}

export interface CryptoVDAInput {
    /** Total taxable gains from VDA transactions (after cost of acquisition) */
    totalGains: number;
    /**
     * VDA losses CANNOT be set off against any other income
     * and cannot be carried forward. Tracked for reporting only.
     */
    totalLosses?: number;
}

export interface OtherSourcesInput {
    savingsInterest?: number;
    fdInterest?: number;
    dividendIncome?: number;
    otherIncome?: number;
}

/**
 * TDS tracked by source for proper set-off rules
 * 
 * Key rule: TDS u/s 194S (crypto) can be set off against ANY income,
 * not just crypto. This is because TDS itself is a tax credit.
 * However, crypto LOSSES cannot be set off.
 */
export interface TDSBySource {
    /** TDS on salary (Form 16) */
    salary?: number;
    /** TDS on interest (194A) */
    interest?: number;
    /** TDS on rent (194I) */
    rent?: number;
    /** TDS on professional fees (194J) */
    professional?: number;
    /** TDS on VDA/Crypto (194S) — 1% */
    cryptoVDA?: number;
    /** TDS on property sale (194IA) */
    property?: number;
    /** TDS on dividends (194) */
    dividend?: number;
    /** Any other TDS */
    other?: number;
}

export interface DeductionsInput {
    // Chapter VI-A deductions (only for Old Regime)
    section80C?: number;        // Max ₹1.5L — EPF, PPF, ELSS, LIC, etc.
    section80CCC?: number;      // Pension fund contribution
    section80CCD1?: number;     // Employee NPS contribution
    section80CCD1B?: number;    // Extra NPS ₹50K
    section80CCD2?: number;     // Employer NPS (allowed in both regimes)
    section80D?: number;        // Health insurance — max ₹75K (senior) / ₹25K
    section80DD?: number;       // Disabled dependent — max ₹1.25L
    section80DDB?: number;      // Medical treatment — max ₹1L
    section80E?: number;        // Education loan interest — no limit
    section80EE?: number;       // First-time home loan — max ₹50K
    section80EEA?: number;      // Affordable housing — max ₹1.5L
    section80EEB?: number;      // EV loan interest — max ₹1.5L
    section80G?: number;        // Donations
    section80GG?: number;       // Rent paid without HRA — max ₹60K
    section80GGA?: number;      // Scientific research donations
    section80GGC?: number;      // Political party donations
    section80TTA?: number;      // Savings interest — max ₹10K (non-senior)
    section80TTB?: number;      // Savings+FD interest — max ₹50K (senior only)
    section80U?: number;        // Disability — max ₹1.25L
    hra?: number;               // HRA exemption (computed)
    lta?: number;               // Leave Travel Allowance
    homeLoanInterest?: number;  // Section 24(b) — max ₹2L for SOP
}

/**
 * Complete Tax Profile — Input to the TaxEngine
 */
export interface TaxProfile {
    assessmentYear: AssessmentYear;
    regime: TaxRegime;

    // Personal info (affects surcharge, rebate, senior citizen rules)
    age?: number;                // For senior citizen benefits
    residentialStatus?: 'RES' | 'NRI' | 'RNOR';

    // Income Sources
    salary?: SalaryIncome;
    houseProperty?: HousePropertyIncome;
    business?: BusinessIncome;
    capitalGains?: CapitalGainsInput;
    cryptoVDA?: CryptoVDAInput;
    otherSources?: OtherSourcesInput;

    // Deductions
    deductions?: DeductionsInput;

    // Tax Payments
    tds?: TDSBySource;
    advanceTaxPaid?: number;
    selfAssessmentTax?: number;

    // Foreign income (for NRI/RNOR)
    foreignIncome?: number;
    // Agriculture income (exempt but affects tax rate via partial integration)
    agricultureIncome?: number;
}

// ============= OUTPUT: TAX CALCULATION RESULT =============

export interface SlabDetail {
    range: string;
    rate: number;
    taxableAmount: number;
    tax: number;
}

export interface SpecialRateTaxDetail {
    section: string;
    description: string;
    taxableAmount: number;
    exemption: number;
    netTaxableAmount: number;
    rate: number;
    tax: number;
    surcharge: number;
    cess: number;
    totalTax: number;
}

export interface IncomeBreakdown {
    head: IncomeHead;
    grossAmount: number;
    deductions: number;
    netAmount: number;
}

export interface TaxCalculationResult {
    // Income Computation
    incomeBreakdown: IncomeBreakdown[];

    /** Sum of Salary + HP + Business + Other Sources (heads taxed at slab rate) */
    grossTotalIncome: number;

    /** Standard deduction applied */
    standardDeduction: number;

    /** Total Chapter VI-A deductions */
    totalDeductions: number;

    /** Taxable income for slab calculation = GTI - Deductions */
    normalTaxableIncome: number;

    // Tax Computation
    /** Tax on normal income through slab rates */
    normalIncomeTax: number;
    /** Slab-wise breakdown */
    slabs: SlabDetail[];

    /** Special rate tax details */
    cryptoTax: SpecialRateTaxDetail;
    stcgTax: SpecialRateTaxDetail;
    ltcgTax: SpecialRateTaxDetail;
    ltcgOtherTax: SpecialRateTaxDetail;

    /** Total tax on all income heads before rebate */
    totalTaxBeforeRebate: number;

    /** Rebate u/s 87A */
    rebate87A: number;
    /** Marginal relief on rebate */
    marginalRelief: number;

    /** Tax after rebate */
    taxAfterRebate: number;

    /** Surcharge on normal income (if applicable) */
    surchargeOnNormal: number;
    /** Total surcharge */
    totalSurcharge: number;

    /** Health & Education Cess @ 4% on (tax + surcharge) */
    cess: number;

    /** Total tax liability = tax + surcharge + cess */
    totalTaxLiability: number;

    // TDS & Payments
    totalTDSPaid: number;
    tdsBySource: TDSBySource;
    advanceTaxPaid: number;
    selfAssessmentTax: number;
    totalTaxesPaid: number;

    // Final
    /** Positive = refund, Negative = balance payable */
    refundOrPayable: number;
    isRefund: boolean;

    // Metadata
    recommendedForm: ITRFormType;
    regime: TaxRegime;
    assessmentYear: AssessmentYear;
    warnings: string[];

    /** Regime eligibility info */
    regimeEligibility: {
        canUseNew: boolean;
        canUseOld: boolean;
        reason?: string;
    };
}

// ============= REGIME COMPARISON =============

export interface RegimeComparisonResult {
    oldRegime: TaxCalculationResult;
    newRegime: TaxCalculationResult;
    recommendation: TaxRegime;
    savings: number;
    reasons: string[];
}
