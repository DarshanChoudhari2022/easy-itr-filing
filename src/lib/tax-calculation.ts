import { AssessmentYear, YEAR_CONFIGS } from "./tax-config";

/**
 * TaxMitra Calculation Engine
 * Handles Indian Income Tax Rules for multiple Assessment Years
 */

export interface TaxData {
    salary?: number;
    houseProperty?: number;
    otherSources?: {
        savingsInterest?: number;
        fdInterest?: number;
        dividends?: number;
        misc?: number;
    };
    deductions?: {
        section80C?: number; // Caps at 1.5L
        section80D?: number; // Health Insurance
        section80TTA?: number; // Savings interest (Old regime only)
    };
    businessIncome?: number; // For consultants/freelancers (Net Taxable)
    vdaGains?: number; // Crypto/VDA - Taxed at 30% flat (Section 115BBH)
    regime: "old" | "new";
    assessmentYear?: AssessmentYear;
}

export interface TaxResult {
    grossTotalIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    taxPayable: number;
    vdaTax: number;
    slabs: { rate: string; amount: number; tax: number }[];
    cess: number;
    finalTax: number;
}

export function calculateTax(data: TaxData): TaxResult {
    const {
        salary = 0,
        houseProperty = 0,
        otherSources = { savingsInterest: 0, fdInterest: 0, dividends: 0 },
        deductions = { section80C: 0, section80D: 0, section80TTA: 0 },
        businessIncome = 0,
        vdaGains = 0,
        regime = "new",
        assessmentYear = "2025-26"
    } = data;

    const config = YEAR_CONFIGS[assessmentYear];

    // 1. Gross Total Income (Excluding VDA which is taxed separately)
    const otherTotal = (otherSources.savingsInterest || 0) + (otherSources.fdInterest || 0) + (otherSources.dividends || 0) + (otherSources.misc || 0);
    const standardDeduction = regime === "new" ? config.standardDeductionNew : config.standardDeductionOld;

    // Adjusted Salary after Standard Deduction
    const taxableSalary = Math.max(0, salary - standardDeduction);

    const grossTotalIncome = taxableSalary + houseProperty + otherTotal + businessIncome;

    // 2. Deductions
    let totalDeductions = 0;
    if (regime === "old") {
        const sec80C = Math.min(150000, deductions.section80C || 0);
        const sec80D = Math.min(25000, deductions.section80D || 0); // Simplified
        const sec80TTA = Math.min(10000, otherSources.savingsInterest || 0);
        totalDeductions = sec80C + sec80D + sec80TTA;
    } else {
        totalDeductions = 0;
    }

    const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);

    // 3. Tax Computation (Slabs)
    let taxPayable = 0;
    const slabs: { rate: string; amount: number; tax: number }[] = [];

    const activeSlabs = regime === "new" ? config.newSlabs : config.oldSlabs;
    let remaining = taxableIncome;

    for (let i = 0; i < activeSlabs.length; i++) {
        if (remaining <= 0) break;
        const slab = activeSlabs[i];
        const nextSlabMin = activeSlabs[i + 1]?.min || Infinity;
        const slabRange = slab.max === Infinity ? Infinity : (slab.max - slab.min);
        const taxableInSlab = Math.min(remaining, slabRange);

        const taxInSlab = taxableInSlab * (slab.rate / 100);
        slabs.push({
            rate: `${slab.rate}%`,
            amount: taxableInSlab,
            tax: taxInSlab
        });

        taxPayable += taxInSlab;
        remaining -= taxableInSlab;
    }

    // 87A Rebate logic
    if (regime === "new") {
        // For AY 25-26 and 26-27, rebate is up to 7L taxable income
        if (taxableIncome <= 700000) {
            taxPayable = 0;
        }
    } else {
        // Old regime rebate up to 5L
        if (taxableIncome <= 500000) {
            taxPayable = 0;
        }
    }

    // 4. VDA Tax (30% flat no exemptions)
    const vdaTax = vdaGains * 0.30;

    const totalTaxBeforeCess = taxPayable + vdaTax;
    const cess = totalTaxBeforeCess * 0.04;
    const finalTax = totalTaxBeforeCess + cess;

    return {
        grossTotalIncome,
        totalDeductions,
        taxableIncome,
        taxPayable,
        vdaTax,
        slabs,
        cess,
        finalTax
    };
}
