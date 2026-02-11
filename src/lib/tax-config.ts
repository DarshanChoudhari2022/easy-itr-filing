export type AssessmentYear = "2024-25" | "2025-26" | "2026-27";

export interface TaxSlab {
    min: number;
    max: number;
    rate: number;
}

export interface RebateConfig {
    oldRegimeLimit: number;      // Income limit for old regime rebate
    oldRegimeAmount: number;     // Max rebate under old regime
    newRegimeLimit: number;      // Income limit for new regime rebate
    newRegimeAmount: number;     // Max rebate under new regime
}

export interface SurchargeConfig {
    slabs: { min: number; max: number; rate: number }[];
    maxRateNewRegime: number;    // Cap for new regime surcharge
}

export interface YearConfig {
    ay: AssessmentYear;
    fy: string;
    standardDeductionOld: number;
    standardDeductionNew: number;
    oldSlabs: TaxSlab[];
    newSlabs: TaxSlab[];
    rebate87A: RebateConfig;
    surcharge: SurchargeConfig;
    cessRate: number;            // Health & Education Cess
    section80CLimit: number;     // Max 80C deduction
    section80CCDExtraLimit: number; // Extra NPS deduction
    vdaTaxRate: number;          // 30% flat for VDA/crypto
    tdsSectionRate194S: number;  // 1% TDS on VDA
}

export const YEAR_CONFIGS: Record<AssessmentYear, YearConfig> = {
    "2024-25": {
        ay: "2024-25",
        fy: "2023-24",
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
        surcharge: {
            slabs: [
                { min: 0, max: 5000000, rate: 0 },
                { min: 5000000, max: 10000000, rate: 10 },
                { min: 10000000, max: 20000000, rate: 15 },
                { min: 20000000, max: 50000000, rate: 25 },
                { min: 50000000, max: Infinity, rate: 37 },
            ],
            maxRateNewRegime: 25,
        },
        cessRate: 4,
        section80CLimit: 150000,
        section80CCDExtraLimit: 50000,
        vdaTaxRate: 30,
        tdsSectionRate194S: 1,
    },
    "2025-26": {
        ay: "2025-26",
        fy: "2024-25",
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
        surcharge: {
            slabs: [
                { min: 0, max: 5000000, rate: 0 },
                { min: 5000000, max: 10000000, rate: 10 },
                { min: 10000000, max: 20000000, rate: 15 },
                { min: 20000000, max: 50000000, rate: 25 },
                { min: 50000000, max: Infinity, rate: 37 },
            ],
            maxRateNewRegime: 25,
        },
        cessRate: 4,
        section80CLimit: 150000,
        section80CCDExtraLimit: 50000,
        vdaTaxRate: 30,
        tdsSectionRate194S: 1,
    },
    "2026-27": {
        ay: "2026-27",
        fy: "2025-26",
        standardDeductionOld: 50000,
        standardDeductionNew: 75000,
        oldSlabs: [
            { min: 0, max: 250000, rate: 0 },
            { min: 250000, max: 500000, rate: 5 },
            { min: 500000, max: 1000000, rate: 20 },
            { min: 1000000, max: Infinity, rate: 30 },
        ],
        // Union Budget 2025: Revised new regime slabs for FY 2025-26
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
        surcharge: {
            slabs: [
                { min: 0, max: 5000000, rate: 0 },
                { min: 5000000, max: 10000000, rate: 10 },
                { min: 10000000, max: 20000000, rate: 15 },
                { min: 20000000, max: 50000000, rate: 25 },
                { min: 50000000, max: Infinity, rate: 37 },
            ],
            maxRateNewRegime: 25,
        },
        cessRate: 4,
        section80CLimit: 150000,
        section80CCDExtraLimit: 50000,
        vdaTaxRate: 30,
        tdsSectionRate194S: 1,
    },
};

export const DEFAULT_AY: AssessmentYear = "2026-27";
