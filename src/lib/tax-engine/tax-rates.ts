/**
 * TaxMitra Tax Engine — AY 2026-27 Tax Rates & Configuration
 * 
 * Ground truth source: CBDT notification + Union Budget 2025
 * 
 * This file contains ALL hardcoded tax law parameters.
 * Every number here should be verifiable against official circulars.
 */

import { AssessmentYear } from './types';

// ============= TAX SLAB DEFINITION =============

export interface TaxSlab {
    min: number;
    max: number;   // Infinity for the last slab
    rate: number;  // Percentage (e.g., 5 for 5%)
}

export interface SurchargeSlabConfig {
    min: number;
    max: number;
    rate: number;
}

export interface YearTaxConfig {
    ay: AssessmentYear;
    fy: string;

    // Standard Deduction
    standardDeductionOld: number;
    standardDeductionNew: number;

    // Slab Rates
    oldSlabs: TaxSlab[];
    newSlabs: TaxSlab[];

    // Rebate u/s 87A
    rebate87A: {
        oldRegimeLimit: number;      // Max total income for rebate eligibility
        oldRegimeAmount: number;     // Max rebate amount
        newRegimeLimit: number;
        newRegimeAmount: number;
    };

    // Surcharge
    surchargeSlabs: SurchargeSlabConfig[];
    /** Surcharge cap for new regime */
    surchargeCapNewRegime: number;
    /** Special rate incomes (STCG 111A, LTCG 112A, 112) — surcharge capped at 15% */
    surchargeCap_SpecialRateIncome: number;

    // Cess
    cessRate: number;              // 4% Health & Education Cess

    // Section 80C limits
    section80CLimit: number;       // ₹1.5L
    section80CCDExtraLimit: number; // ₹50K (80CCD(1B))

    // Capital Gains Rates
    /** STCG on listed equity (Section 111A) */
    stcgEquityRate: number;
    /** LTCG on listed equity (Section 112A) — above exemption */
    ltcgEquityRate: number;
    /** LTCG exemption limit for equity (Section 112A) */
    ltcgEquityExemption: number;
    /** LTCG on other assets (Section 112) */
    ltcgOtherRate: number;

    // Crypto/VDA
    /** Section 115BBH flat rate */
    vdaTaxRate: number;            // 30%
    /** TDS rate on VDA (Section 194S) */
    tdsSectionRate194S: number;    // 1%

    // Presumptive Taxation
    /** Section 44AD — business */
    presumptive44AD: {
        digitalRate: number;       // 6%
        cashRate: number;          // 8%
        turnoverLimit: number;     // ₹3 Crore (if 95%+ digital)
    };
    /** Section 44ADA — professionals */
    presumptive44ADA: {
        rate: number;              // 50%
        turnoverLimit: number;     // ₹75L
    };

    // House Property
    hpStandardDeduction: number;   // 30% of NAV
    hpInterestLimitSOP: number;    // ₹2L for self-occupied
    hpLossSetoffLimit: number;     // ₹2L max set-off against other heads
}

// ============= AY 2026-27 CONFIGURATION =============

const AY_2026_27: YearTaxConfig = {
    ay: '2026-27',
    fy: '2025-26',

    standardDeductionOld: 50000,
    standardDeductionNew: 75000,

    oldSlabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 5 },
        { min: 500000, max: 1000000, rate: 20 },
        { min: 1000000, max: Infinity, rate: 30 },
    ],

    // Union Budget 2025 Revised New Regime Slabs
    newSlabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 5 },
        { min: 800000, max: 1200000, rate: 10 },
        { min: 1200000, max: 1600000, rate: 15 },
        { min: 1600000, max: 2000000, rate: 20 },
        { min: 2000000, max: 2400000, rate: 25 },
        { min: 2400000, max: Infinity, rate: 30 },
    ],

    rebate87A: {
        oldRegimeLimit: 500000,
        oldRegimeAmount: 12500,
        // Budget 2025: Full rebate for income ≤ ₹12L under new regime
        newRegimeLimit: 1200000,
        newRegimeAmount: 60000,
    },

    surchargeSlabs: [
        { min: 0, max: 5000000, rate: 0 },
        { min: 5000000, max: 10000000, rate: 10 },
        { min: 10000000, max: 20000000, rate: 15 },
        { min: 20000000, max: 50000000, rate: 25 },
        { min: 50000000, max: Infinity, rate: 37 },
    ],
    surchargeCapNewRegime: 25,
    // For STCG 111A, LTCG 112A/112 — surcharge capped at 15%
    surchargeCap_SpecialRateIncome: 15,

    cessRate: 4,

    section80CLimit: 150000,
    section80CCDExtraLimit: 50000,

    // AY 2026-27 (post Union Budget 2024): STCG @ 20%, LTCG @ 12.5%
    stcgEquityRate: 20,
    ltcgEquityRate: 12.5,
    ltcgEquityExemption: 125000,  // ₹1.25L exemption
    ltcgOtherRate: 12.5,

    vdaTaxRate: 30,
    tdsSectionRate194S: 1,

    presumptive44AD: {
        digitalRate: 6,
        cashRate: 8,
        turnoverLimit: 30000000,   // ₹3 Crore
    },
    presumptive44ADA: {
        rate: 50,
        turnoverLimit: 7500000,    // ₹75L
    },

    hpStandardDeduction: 30,      // 30% of NAV
    hpInterestLimitSOP: 200000,   // ₹2L
    hpLossSetoffLimit: 200000,    // ₹2L
};

// ============= AY 2025-26 CONFIGURATION =============

const AY_2025_26: YearTaxConfig = {
    ay: '2025-26',
    fy: '2024-25',

    standardDeductionOld: 50000,
    standardDeductionNew: 75000,

    oldSlabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 5 },
        { min: 500000, max: 1000000, rate: 20 },
        { min: 1000000, max: Infinity, rate: 30 },
    ],

    newSlabs: [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 700000, rate: 5 },
        { min: 700000, max: 1000000, rate: 10 },
        { min: 1000000, max: 1200000, rate: 15 },
        { min: 1200000, max: 1500000, rate: 20 },
        { min: 1500000, max: Infinity, rate: 30 },
    ],

    rebate87A: {
        oldRegimeLimit: 500000,
        oldRegimeAmount: 12500,
        newRegimeLimit: 700000,
        newRegimeAmount: 25000,
    },

    surchargeSlabs: [
        { min: 0, max: 5000000, rate: 0 },
        { min: 5000000, max: 10000000, rate: 10 },
        { min: 10000000, max: 20000000, rate: 15 },
        { min: 20000000, max: 50000000, rate: 25 },
        { min: 50000000, max: Infinity, rate: 37 },
    ],
    surchargeCapNewRegime: 25,
    surchargeCap_SpecialRateIncome: 15,

    cessRate: 4,

    section80CLimit: 150000,
    section80CCDExtraLimit: 50000,

    // Post Union Budget 2024
    stcgEquityRate: 20,
    ltcgEquityRate: 12.5,
    ltcgEquityExemption: 125000,
    ltcgOtherRate: 12.5,

    vdaTaxRate: 30,
    tdsSectionRate194S: 1,

    presumptive44AD: {
        digitalRate: 6,
        cashRate: 8,
        turnoverLimit: 30000000,
    },
    presumptive44ADA: {
        rate: 50,
        turnoverLimit: 7500000,
    },

    hpStandardDeduction: 30,
    hpInterestLimitSOP: 200000,
    hpLossSetoffLimit: 200000,
};

// ============= AY 2024-25 CONFIGURATION =============

const AY_2024_25: YearTaxConfig = {
    ay: '2024-25',
    fy: '2023-24',

    standardDeductionOld: 50000,
    standardDeductionNew: 50000,

    oldSlabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 5 },
        { min: 500000, max: 1000000, rate: 20 },
        { min: 1000000, max: Infinity, rate: 30 },
    ],

    newSlabs: [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 600000, rate: 5 },
        { min: 600000, max: 900000, rate: 10 },
        { min: 900000, max: 1200000, rate: 15 },
        { min: 1200000, max: 1500000, rate: 20 },
        { min: 1500000, max: Infinity, rate: 30 },
    ],

    rebate87A: {
        oldRegimeLimit: 500000,
        oldRegimeAmount: 12500,
        newRegimeLimit: 700000,
        newRegimeAmount: 25000,
    },

    surchargeSlabs: [
        { min: 0, max: 5000000, rate: 0 },
        { min: 5000000, max: 10000000, rate: 10 },
        { min: 10000000, max: 20000000, rate: 15 },
        { min: 20000000, max: 50000000, rate: 25 },
        { min: 50000000, max: Infinity, rate: 37 },
    ],
    surchargeCapNewRegime: 25,
    surchargeCap_SpecialRateIncome: 15,

    cessRate: 4,

    section80CLimit: 150000,
    section80CCDExtraLimit: 50000,

    // Pre-Budget 2024 rates
    stcgEquityRate: 15,
    ltcgEquityRate: 10,
    ltcgEquityExemption: 100000,   // ₹1L
    ltcgOtherRate: 20,             // With indexation

    vdaTaxRate: 30,
    tdsSectionRate194S: 1,

    presumptive44AD: {
        digitalRate: 6,
        cashRate: 8,
        turnoverLimit: 30000000,
    },
    presumptive44ADA: {
        rate: 50,
        turnoverLimit: 7500000,
    },

    hpStandardDeduction: 30,
    hpInterestLimitSOP: 200000,
    hpLossSetoffLimit: 200000,
};

// ============= CONFIG REGISTRY =============

export const TAX_CONFIGS: Record<AssessmentYear, YearTaxConfig> = {
    '2024-25': AY_2024_25,
    '2025-26': AY_2025_26,
    '2026-27': AY_2026_27,
};

export const DEFAULT_AY: AssessmentYear = '2026-27';

export function getConfig(ay?: AssessmentYear): YearTaxConfig {
    return TAX_CONFIGS[ay || DEFAULT_AY];
}
