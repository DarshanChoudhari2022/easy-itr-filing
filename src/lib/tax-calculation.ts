
/**
 * TaxMitra Calculation Engine
 * Handles Indian Income Tax Rules for AY 2026-27 (FY 2025-26)
 */

export interface TaxData {
    salary?: number;
    houseProperty?: number;
    otherSources?: {
        savingsInterest?: number;
        fdInterest?: number;
        dividends?: number;
    };
    deductions?: {
        section80C?: number; // Caps at 1.5L
        section80D?: number; // Health Insurance
        section80TTA?: number; // Savings interest (Old regime only)
    };
    vdaGains?: number; // Crypto/VDA - Taxed at 30% flat (Section 115BBH)
    regime: "old" | "new";
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
        vdaGains = 0,
        regime = "new"
    } = data;

    // 1. Gross Total Income (Excluding VDA which is taxed separately)
    const otherTotal = (otherSources.savingsInterest || 0) + (otherSources.fdInterest || 0) + (otherSources.dividends || 0);
    const standardDeduction = regime === "new" ? 75000 : 50000;

    // Adjusted Salary after Standard Deduction
    const taxableSalary = Math.max(0, salary - standardDeduction);

    const grossTotalIncome = taxableSalary + houseProperty + otherTotal;

    // 2. Deductions
    let totalDeductions = 0;
    if (regime === "old") {
        const sec80C = Math.min(150000, deductions.section80C || 0);
        const sec80D = Math.min(25000, deductions.section80D || 0); // Simplified
        const sec80TTA = Math.min(10000, otherSources.savingsInterest || 0);
        totalDeductions = sec80C + sec80D + sec80TTA;
    } else {
        // New regime has no chapter VI-A deductions except 80CCD(2) etc. 
        // We simulate zero for now as per simple filing.
        totalDeductions = 0;
    }

    const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);

    // 3. Tax Computation (Slabs)
    let taxPayable = 0;
    const slabs: { rate: string; amount: number; tax: number }[] = [];

    if (regime === "new") {
        // AY 2026-27 New Regime Slabs (As per Budget 2024-25 / Finance Bill)
        // 0-3L: Nil
        // 3-7L: 5%
        // 7-10L: 10%
        // 10-12L: 15%
        // 12-15L: 20%
        // >15L: 30%

        const schedule = [
            { limit: 300000, rate: 0 },
            { limit: 400000, rate: 0.05 }, // 3-7: 4L gap
            { limit: 300000, rate: 0.10 }, // 7-10: 3L gap
            { limit: 200000, rate: 0.15 }, // 10-12: 2L gap
            { limit: 300000, rate: 0.20 }, // 12-15: 3L gap
            { limit: Infinity, rate: 0.30 }
        ];

        let remaining = taxableIncome;

        // Slab 1: 0-3L
        const s1 = Math.min(remaining, 300000);
        slabs.push({ rate: "0%", amount: s1, tax: 0 });
        remaining -= s1;

        if (remaining > 0) {
            // Slab 2: 3-7L
            const s2 = Math.min(remaining, 400000);
            const t2 = s2 * 0.05;
            slabs.push({ rate: "5%", amount: s2, tax: t2 });
            taxPayable += t2;
            remaining -= s2;
        }

        if (remaining > 0) {
            // Slab 3: 7-10L
            const s3 = Math.min(remaining, 300000);
            const t3 = s3 * 0.10;
            slabs.push({ rate: "10%", amount: s3, tax: t3 });
            taxPayable += t3;
            remaining -= s3;
        }

        if (remaining > 0) {
            // Slab 4: 10-12L
            const s4 = Math.min(remaining, 200000);
            const t4 = s4 * 0.15;
            slabs.push({ rate: "15%", amount: s4, tax: t4 });
            taxPayable += t4;
            remaining -= s4;
        }

        if (remaining > 0) {
            // Slab 5: 12-15L
            const s5 = Math.min(remaining, 300000);
            const t5 = s5 * 0.20;
            slabs.push({ rate: "20%", amount: s5, tax: t5 });
            taxPayable += t5;
            remaining -= s5;
        }

        if (remaining > 0) {
            // Slab 6: >15L
            const t6 = remaining * 0.30;
            slabs.push({ rate: "30%", amount: remaining, tax: t6 });
            taxPayable += t6;
        }

        // Rebate under 87A for New Regime (Up to 7L income = Nil tax)
        if (taxableIncome <= 700000) {
            taxPayable = 0;
        }
    } else {
        // Old Regime Slabs (Simplified)
        // 0-2.5L: Nil
        // 2.5-5L: 5%
        // 5-10L: 20%
        // >10L: 30%
        let remaining = taxableIncome;

        const s1 = Math.min(remaining, 250000);
        slabs.push({ rate: "0%", amount: s1, tax: 0 });
        remaining -= s1;

        if (remaining > 0) {
            const s2 = Math.min(remaining, 250000);
            const t2 = s2 * 0.05;
            slabs.push({ rate: "5%", amount: s2, tax: t2 });
            taxPayable += t2;
            remaining -= s2;
        }

        if (remaining > 0) {
            const s3 = Math.min(remaining, 500000);
            const t3 = s3 * 0.20;
            slabs.push({ rate: "20%", amount: s3, tax: t3 });
            taxPayable += t3;
            remaining -= s3;
        }

        if (remaining > 0) {
            const t4 = remaining * 0.30;
            slabs.push({ rate: "30%", amount: remaining, tax: t4 });
            taxPayable += t4;
        }

        // Rebate under 87A for Old Regime (Up to 5L income)
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
