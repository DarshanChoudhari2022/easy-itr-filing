/**
 * Enhanced Tax Calculation Engine
 * Includes Old vs New Regime Comparison, Advance Tax, and TDS Reconciliation
 */

import { AssessmentYear, YEAR_CONFIGS } from "./tax-config";

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
        section80C?: number;
        section80D?: number;
        section80TTA?: number;
        section80E?: number; // Education Loan
        section80G?: number; // Donations
        nps80CCD?: number; // NPS contribution
        hra?: number; // HRA exemption
        lta?: number; // Leave Travel Allowance
    };
    businessIncome?: number;
    capitalGains?: {
        shortTermEquity?: number; // 15%
        longTermEquity?: number; // 10% above 1L
        shortTermOther?: number; // Slab rate
        longTermOther?: number; // 20% with indexation
        cryptoVDA?: number; // 30% flat
    };
    vdaGains?: number;
    regime: "old" | "new";
    assessmentYear?: AssessmentYear;
    tdsPaid?: number;
    advanceTaxPaid?: number;
    selfAssessmentTax?: number;
}

export interface TaxResult {
    grossTotalIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    taxPayable: number;
    vdaTax: number;
    capitalGainsTax: number;
    slabs: { rate: string; amount: number; tax: number }[];
    cess: number;
    finalTax: number;
    rebate87A: number;
    surcharge: number;
    netTaxPayable: number;
    tdsPaid: number;
    advanceTaxPaid: number;
    refundOrDue: number;
    isRefund: boolean;
}

export interface RegimeComparison {
    oldRegime: TaxResult;
    newRegime: TaxResult;
    recommendation: 'old' | 'new';
    savings: number;
    reasons: string[];
}

export function calculateTax(data: TaxData): TaxResult {
    const {
        salary = 0,
        houseProperty = 0,
        otherSources = { savingsInterest: 0, fdInterest: 0, dividends: 0, misc: 0 },
        deductions = { section80C: 0, section80D: 0, section80TTA: 0, section80E: 0, section80G: 0, nps80CCD: 0, hra: 0, lta: 0 },
        businessIncome = 0,
        capitalGains = { shortTermEquity: 0, longTermEquity: 0, shortTermOther: 0, longTermOther: 0, cryptoVDA: 0 },
        vdaGains = 0,
        regime = "new",
        assessmentYear = "2025-26",
        tdsPaid = 0,
        advanceTaxPaid = 0,
        selfAssessmentTax = 0
    } = data;

    const config = YEAR_CONFIGS[assessmentYear];

    // Standard Deduction
    const standardDeduction = regime === "new" ? config.standardDeductionNew : config.standardDeductionOld;

    // 1. Gross Total Income
    const otherTotal = (otherSources.savingsInterest || 0) + (otherSources.fdInterest || 0) +
        (otherSources.dividends || 0) + (otherSources.misc || 0);

    const taxableSalary = Math.max(0, salary - standardDeduction - (regime === 'old' ? (deductions.hra || 0) + (deductions.lta || 0) : 0));
    const grossTotalIncome = taxableSalary + Math.max(-200000, houseProperty) + otherTotal + businessIncome;

    // 2. Deductions (Old Regime Only)
    let totalDeductions = 0;
    if (regime === "old") {
        const sec80C = Math.min(150000, deductions.section80C || 0);
        const sec80D = Math.min(75000, deductions.section80D || 0); // Up to 75k for senior parents
        const sec80TTA = Math.min(10000, otherSources.savingsInterest || 0);
        const sec80E = deductions.section80E || 0; // No limit
        const sec80G = deductions.section80G || 0; // Various limits
        const nps = Math.min(50000, deductions.nps80CCD || 0); // Additional 50k for NPS
        totalDeductions = sec80C + sec80D + sec80TTA + sec80E + sec80G + nps;
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
        const slabRange = slab.max === Infinity ? remaining : Math.min(remaining, slab.max - slab.min);
        const taxInSlab = slabRange * (slab.rate / 100);

        if (slabRange > 0) {
            slabs.push({ rate: `${slab.rate}%`, amount: slabRange, tax: taxInSlab });
        }

        taxPayable += taxInSlab;
        remaining -= slabRange;
    }

    // 4. Rebate 87A
    let rebate87A = 0;
    if (regime === "new" && taxableIncome <= 700000) {
        rebate87A = Math.min(taxPayable, 25000);
        taxPayable = Math.max(0, taxPayable - rebate87A);
    } else if (regime === "old" && taxableIncome <= 500000) {
        rebate87A = Math.min(taxPayable, 12500);
        taxPayable = Math.max(0, taxPayable - rebate87A);
    }

    // 5. Capital Gains Tax (Separate rates)
    let capitalGainsTax = 0;
    capitalGainsTax += (capitalGains.shortTermEquity || 0) * 0.15;
    const ltcg = Math.max(0, (capitalGains.longTermEquity || 0) - 100000);
    capitalGainsTax += ltcg * 0.10;
    capitalGainsTax += (capitalGains.longTermOther || 0) * 0.20;
    // Short term other at slab rate already included in gross income

    // 6. VDA/Crypto Tax (30% flat)
    const vdaTax = (vdaGains || 0) * 0.30 + (capitalGains.cryptoVDA || 0) * 0.30;

    // 7. Total Tax Before Surcharge
    const totalTaxBeforeSurcharge = taxPayable + capitalGainsTax + vdaTax;

    // 8. Surcharge (for high income)
    let surcharge = 0;
    if (taxableIncome > 5000000 && taxableIncome <= 10000000) {
        surcharge = totalTaxBeforeSurcharge * 0.10;
    } else if (taxableIncome > 10000000 && taxableIncome <= 20000000) {
        surcharge = totalTaxBeforeSurcharge * 0.15;
    } else if (taxableIncome > 20000000 && taxableIncome <= 50000000) {
        surcharge = totalTaxBeforeSurcharge * 0.25;
    } else if (taxableIncome > 50000000) {
        surcharge = totalTaxBeforeSurcharge * 0.37;
    }

    // 9. Cess (4%)
    const cess = (totalTaxBeforeSurcharge + surcharge) * 0.04;

    // 10. Final Tax
    const finalTax = totalTaxBeforeSurcharge + surcharge + cess;

    // 11. Net Payable/Refund
    const totalPaid = (tdsPaid || 0) + (advanceTaxPaid || 0) + (selfAssessmentTax || 0);
    const refundOrDue = totalPaid - finalTax;

    return {
        grossTotalIncome,
        totalDeductions,
        taxableIncome,
        taxPayable,
        vdaTax,
        capitalGainsTax,
        slabs,
        cess,
        finalTax,
        rebate87A,
        surcharge,
        netTaxPayable: finalTax,
        tdsPaid,
        advanceTaxPaid,
        refundOrDue: Math.abs(refundOrDue),
        isRefund: refundOrDue > 0
    };
}

/**
 * Compare Old vs New Regime and recommend the better option
 */
export function compareRegimes(data: Omit<TaxData, 'regime'>): RegimeComparison {
    const oldResult = calculateTax({ ...data, regime: 'old' });
    const newResult = calculateTax({ ...data, regime: 'new' });

    const oldBetter = oldResult.finalTax < newResult.finalTax;
    const savings = Math.abs(oldResult.finalTax - newResult.finalTax);

    const reasons: string[] = [];

    if (oldBetter) {
        if (oldResult.totalDeductions > 200000) {
            reasons.push(`Deductions of ₹${(oldResult.totalDeductions / 100000).toFixed(2)}L benefit old regime`);
        }
        if (data.deductions?.hra && data.deductions.hra > 100000) {
            reasons.push('HRA exemption makes old regime attractive');
        }
    } else {
        if ((oldResult.totalDeductions || 0) < 150000) {
            reasons.push('Limited deductions favor new regime');
        }
        reasons.push('Higher rebate threshold in new regime (₹7L vs ₹5L)');
    }

    return {
        oldRegime: oldResult,
        newRegime: newResult,
        recommendation: oldBetter ? 'old' : 'new',
        savings,
        reasons
    };
}

/**
 * Calculate Advance Tax installments
 */
export function calculateAdvanceTax(totalTax: number): {
    installments: { quarter: string; due: string; percentage: number; amount: number }[];
    totalDue: number;
} {
    const installments = [
        { quarter: 'Q1', due: 'June 15', percentage: 15, amount: totalTax * 0.15 },
        { quarter: 'Q2', due: 'September 15', percentage: 45, amount: totalTax * 0.45 },
        { quarter: 'Q3', due: 'December 15', percentage: 75, amount: totalTax * 0.75 },
        { quarter: 'Q4', due: 'March 15', percentage: 100, amount: totalTax },
    ];

    return { installments, totalDue: totalTax };
}
