/**
 * Enhanced Tax Calculation Engine — Production Grade
 * Includes Old vs New Regime Comparison, Advance Tax, TDS Reconciliation
 * Implements AY 2024-25, 2025-26, 2026-27 rules including Union Budget 2025
 * 
 * Key rules handled:
 * - Slab-based tax for normal income
 * - Rebate u/s 87A with marginal relief
 * - Surcharge with new regime cap
 * - 4% Health & Education Cess
 * - Special rates: STCG 15%/20%, LTCG 10%/12.5%, VDA 30%
 * - Section 115BBH (no loss set-off for VDA)
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
        section80EE?: number; // Home loan interest (first-time buyers)
        section80EEA?: number; // Affordable housing
        section80DD?: number; // Disabled dependent
        section80DDB?: number; // Medical treatment
        section80U?: number; // Disability
    };
    businessIncome?: number;
    capitalGains?: {
        shortTermEquity?: number; // 20% (from AY 2025-26, was 15%)
        longTermEquity?: number; // 12.5% above ₹1.25L (from AY 2025-26)
        shortTermOther?: number; // Slab rate
        longTermOther?: number; // 12.5% (was 20% with indexation)
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
    marginalRelief: number;
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
        deductions = {},
        businessIncome = 0,
        capitalGains = { shortTermEquity: 0, longTermEquity: 0, shortTermOther: 0, longTermOther: 0, cryptoVDA: 0 },
        vdaGains = 0,
        regime = "new",
        assessmentYear = "2026-27",
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

    const salaryExemptions = regime === 'old'
        ? (deductions.hra || 0) + (deductions.lta || 0)
        : 0;
    const taxableSalary = Math.max(0, salary - standardDeduction - salaryExemptions);

    // House property loss capped at ₹2L for set-off against other heads
    const hpSetOff = Math.max(-200000, houseProperty);
    const grossTotalIncome = taxableSalary + hpSetOff + otherTotal + businessIncome +
        (capitalGains.shortTermOther || 0); // Short-term other at slab rate

    // 2. Deductions (Old Regime Only — New Regime allows only 80CCD(2) employer NPS)
    let totalDeductions = 0;
    if (regime === "old") {
        const sec80C = Math.min(config.section80CLimit, deductions.section80C || 0);
        const sec80D = Math.min(75000, deductions.section80D || 0);
        const sec80TTA = Math.min(10000, deductions.section80TTA || 0);
        const sec80E = deductions.section80E || 0; // No limit
        const sec80G = deductions.section80G || 0;
        const nps = Math.min(config.section80CCDExtraLimit, deductions.nps80CCD || 0);
        const sec80EE = Math.min(50000, deductions.section80EE || 0);
        const sec80EEA = Math.min(150000, deductions.section80EEA || 0);
        const sec80DD = Math.min(125000, deductions.section80DD || 0);
        const sec80DDB = Math.min(100000, deductions.section80DDB || 0);
        const sec80U = Math.min(125000, deductions.section80U || 0);
        totalDeductions = sec80C + sec80D + sec80TTA + sec80E + sec80G + nps +
            sec80EE + sec80EEA + sec80DD + sec80DDB + sec80U;
    } else {
        // New regime: Only NPS employer contribution (80CCD(2)) and standard deduction
        // Standard deduction already applied above
        // 80CCD(1B) extra ₹50K allowed in new regime from AY 2026-27
        if (assessmentYear === "2026-27") {
            totalDeductions = Math.min(config.section80CCDExtraLimit, deductions.nps80CCD || 0);
        }
    }

    const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);

    // 3. Tax Computation (Slabs) — only on normal income
    let taxOnNormalIncome = 0;
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

        taxOnNormalIncome += taxInSlab;
        remaining -= slabRange;
    }

    // 4. Rebate u/s 87A with Marginal Relief
    let rebate87A = 0;
    let marginalRelief = 0;
    const rebateConfig = config.rebate87A;

    if (regime === "new") {
        if (taxableIncome <= rebateConfig.newRegimeLimit) {
            rebate87A = Math.min(taxOnNormalIncome, rebateConfig.newRegimeAmount);
        } else {
            // Marginal relief: tax should not exceed income above threshold
            const incomeAboveLimit = taxableIncome - rebateConfig.newRegimeLimit;
            const taxWithoutRebate = taxOnNormalIncome;
            if (taxWithoutRebate > incomeAboveLimit && incomeAboveLimit > 0) {
                marginalRelief = taxWithoutRebate - incomeAboveLimit;
                taxOnNormalIncome = incomeAboveLimit;
            }
        }
    } else {
        if (taxableIncome <= rebateConfig.oldRegimeLimit) {
            rebate87A = Math.min(taxOnNormalIncome, rebateConfig.oldRegimeAmount);
        }
    }

    let taxPayable = Math.max(0, taxOnNormalIncome - rebate87A);

    // 5. Capital Gains Tax (Separate rates — not eligible for slab/rebate)
    let capitalGainsTax = 0;
    // STCG on equity (Section 111A): 20% from AY 2025-26 (was 15%)
    const stcgEquityRate = assessmentYear === "2024-25" ? 0.15 : 0.20;
    capitalGainsTax += (capitalGains.shortTermEquity || 0) * stcgEquityRate;

    // LTCG on equity (Section 112A): 12.5% above ₹1.25L from AY 2025-26 (was 10% above ₹1L)
    const ltcgExemption = assessmentYear === "2024-25" ? 100000 : 125000;
    const ltcgRate = assessmentYear === "2024-25" ? 0.10 : 0.125;
    const ltcgEquity = Math.max(0, (capitalGains.longTermEquity || 0) - ltcgExemption);
    capitalGainsTax += ltcgEquity * ltcgRate;

    // LTCG on other assets (Section 112): 12.5% from AY 2025-26 (was 20% with indexation)
    const ltcgOtherRate = assessmentYear === "2024-25" ? 0.20 : 0.125;
    capitalGainsTax += (capitalGains.longTermOther || 0) * ltcgOtherRate;

    // 6. VDA/Crypto Tax (30% flat — Section 115BBH, no loss set-off)
    const vdaTotalGains = Math.max(0, vdaGains || 0) + Math.max(0, capitalGains.cryptoVDA || 0);
    const vdaTax = vdaTotalGains * (config.vdaTaxRate / 100);

    // 7. Total Tax Before Surcharge & Cess
    const totalTaxBeforeSurcharge = taxPayable + capitalGainsTax + vdaTax;

    // 8. Surcharge (config-driven)
    let surcharge = 0;
    const totalIncomeForSurcharge = taxableIncome + (capitalGains.shortTermEquity || 0) +
        (capitalGains.longTermEquity || 0) + (capitalGains.longTermOther || 0) + vdaTotalGains;

    for (const slab of config.surcharge.slabs) {
        if (totalIncomeForSurcharge > slab.min && totalIncomeForSurcharge <= slab.max) {
            let rate = slab.rate;
            // Cap surcharge for new regime
            if (regime === "new" && rate > config.surcharge.maxRateNewRegime) {
                rate = config.surcharge.maxRateNewRegime;
            }
            surcharge = totalTaxBeforeSurcharge * (rate / 100);
            break;
        }
    }

    // Marginal surcharge relief (tax+surcharge should not exceed income above threshold)
    if (surcharge > 0) {
        const applicableSlab = config.surcharge.slabs.find(
            s => totalIncomeForSurcharge > s.min && totalIncomeForSurcharge <= s.max
        );
        if (applicableSlab && applicableSlab.min > 0) {
            const prevSlab = config.surcharge.slabs.find(s => s.max === applicableSlab.min);
            if (prevSlab) {
                const prevRate = Math.min(prevSlab.rate, regime === "new" ? config.surcharge.maxRateNewRegime : 100);
                const taxAtPrevSurcharge = totalTaxBeforeSurcharge + totalTaxBeforeSurcharge * (prevRate / 100);
                const incomeAbove = totalIncomeForSurcharge - applicableSlab.min;
                const taxWithCurrentSurcharge = totalTaxBeforeSurcharge + surcharge;
                if (taxWithCurrentSurcharge - taxAtPrevSurcharge > incomeAbove) {
                    surcharge = Math.max(0, taxAtPrevSurcharge + incomeAbove - totalTaxBeforeSurcharge);
                }
            }
        }
    }

    // 9. Health & Education Cess
    const cess = (totalTaxBeforeSurcharge + surcharge) * (config.cessRate / 100);

    // 10. Final Tax
    const finalTax = Math.round(totalTaxBeforeSurcharge + surcharge + cess);

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
        cess: Math.round(cess),
        finalTax,
        rebate87A,
        surcharge: Math.round(surcharge),
        netTaxPayable: finalTax,
        tdsPaid,
        advanceTaxPaid,
        refundOrDue: Math.abs(refundOrDue),
        isRefund: refundOrDue > 0,
        marginalRelief: Math.round(marginalRelief)
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
    const ay = data.assessmentYear || "2026-27";
    const config = YEAR_CONFIGS[ay];

    if (oldBetter) {
        if (oldResult.totalDeductions > 200000) {
            reasons.push(`Your deductions of ₹${(oldResult.totalDeductions / 100000).toFixed(2)}L significantly reduce tax under Old Regime`);
        }
        if (data.deductions?.hra && data.deductions.hra > 100000) {
            reasons.push('Your HRA exemption makes Old Regime more attractive');
        }
        if (data.deductions?.section80C && data.deductions.section80C >= 100000) {
            reasons.push('Your 80C investments (EPF, PPF, ELSS) save more under Old Regime');
        }
        if (data.deductions?.section80D && data.deductions.section80D > 25000) {
            reasons.push('Health insurance premium deduction benefits Old Regime');
        }
    } else {
        if ((oldResult.totalDeductions || 0) < 150000) {
            reasons.push('Your deductions are limited — New Regime\'s lower slabs save more');
        }
        const rebateThreshold = ay === "2026-27" ? "₹12L" : "₹7L";
        reasons.push(`New Regime offers full tax rebate for income up to ${rebateThreshold}`);
        if (ay === "2026-27") {
            reasons.push('Budget 2025 introduced more favorable slab rates under New Regime');
        }
        if (config.standardDeductionNew > config.standardDeductionOld) {
            reasons.push(`New Regime offers higher standard deduction of ₹${(config.standardDeductionNew / 1000).toFixed(0)}K`);
        }
    }

    if (savings === 0) {
        reasons.length = 0;
        reasons.push('Both regimes result in the same tax — choose based on convenience');
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
    installments: { quarter: string; due: string; percentage: number; amount: number; cumulative: number }[];
    totalDue: number;
} {
    const installments = [
        { quarter: 'Q1', due: 'June 15', percentage: 15, amount: Math.round(totalTax * 0.15), cumulative: Math.round(totalTax * 0.15) },
        { quarter: 'Q2', due: 'September 15', percentage: 45, amount: Math.round(totalTax * 0.30), cumulative: Math.round(totalTax * 0.45) },
        { quarter: 'Q3', due: 'December 15', percentage: 75, amount: Math.round(totalTax * 0.30), cumulative: Math.round(totalTax * 0.75) },
        { quarter: 'Q4', due: 'March 15', percentage: 100, amount: Math.round(totalTax * 0.25), cumulative: Math.round(totalTax) },
    ];

    return { installments, totalDue: Math.round(totalTax) };
}

/**
 * Calculate presumptive income under Section 44AD / 44ADA
 */
export function calculatePresumptiveIncome(
    section: '44AD' | '44ADA',
    totalReceipts: number,
    digitalReceipts?: number,
    cashReceipts?: number
): { presumptiveIncome: number; rate: string; description: string } {
    if (section === '44ADA') {
        // 50% for professionals (doctors, lawyers, architects, CAs, etc.)
        return {
            presumptiveIncome: Math.round(totalReceipts * 0.50),
            rate: '50%',
            description: 'Presumptive income for professionals under Section 44ADA (50% of gross receipts)'
        };
    }

    // 44AD: 8% for cash, 6% for digital receipts
    const digital = digitalReceipts ?? 0;
    const cash = cashReceipts ?? (totalReceipts - digital);

    const digitalIncome = digital * 0.06;
    const cashIncome = cash * 0.08;
    const presumptiveIncome = Math.round(digitalIncome + cashIncome);

    return {
        presumptiveIncome,
        rate: `6% digital + 8% cash`,
        description: `Presumptive business income under Section 44AD (₹${Math.round(digitalIncome).toLocaleString('en-IN')} from digital + ₹${Math.round(cashIncome).toLocaleString('en-IN')} from cash)`
    };
}
