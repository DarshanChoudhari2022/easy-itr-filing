export type AssessmentYear = "2024-25" | "2025-26" | "2026-27";

export interface TaxSlab {
    min: number;
    max: number;
    rate: number;
}

export interface YearConfig {
    ay: AssessmentYear;
    fy: string;
    standardDeductionOld: number;
    standardDeductionNew: number;
    oldSlabs: TaxSlab[];
    newSlabs: TaxSlab[];
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
        newSlabs: [
            { min: 0, max: 300000, rate: 0 },
            { min: 300000, max: 700000, rate: 5 },
            { min: 700000, max: 1000000, rate: 10 },
            { min: 1000000, max: 1200000, rate: 15 },
            { min: 1200000, max: 1500000, rate: 20 },
            { min: 1500000, max: Infinity, rate: 30 },
        ],
    },
};

export const DEFAULT_AY: AssessmentYear = "2026-27";
