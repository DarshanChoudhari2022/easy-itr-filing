/**
 * EasyITR Tax Engine — Core Calculation Module
 * AY 2024-25, 2025-26, 2026-27 compliant
 * 
 * ARCHITECTURE:
 * Step 1: Normalize & Validate inputs
 * Step 2: Classify income by head (separate normal vs special-rate)
 * Step 3: Compute tax on NORMAL income through slabs
 * Step 4: Compute tax on SPECIAL RATE incomes SEPARATELY
 *         - Section 115BBH (Crypto/VDA) → 30% flat, NO deductions, NO loss set-off
 *         - Section 111A (STCG equity) → 20% (AY 2026-27) / 15% (earlier)
 *         - Section 112A (LTCG equity) → 12.5% above ₹1.25L / 10% above ₹1L
 *         - Section 112 (LTCG other) → 12.5% / 20%
 * Step 5: Apply Rebate 87A (only on eligible tax, excludes 112A tax)
 * Step 6: Apply Surcharge (separate calculation for special-rate incomes)
 * Step 7: Apply Cess @ 4%
 * Step 8: Aggregate + TDS set-off → Final payable/refund
 * 
 * KEY RULE: Each special-rate income is taxed INDEPENDENTLY.
 *           They do NOT go through slab rates.
 *           Surcharge on CG/VDA is capped at 15%.
 * 
 * Every calculation below is hand-derivable. No black-box functions.
 */

import {
    TaxProfile,
    TaxCalculationResult,
    RegimeComparisonResult,
    IncomeBreakdown,
    IncomeHead,
    SlabDetail,
    SpecialRateTaxDetail,
    TaxRegime,
    ITRFormType,
    TDSBySource,
} from './types';

import { getConfig, YearTaxConfig, TaxSlab } from './tax-rates';

// ============= HELPER: Compute tax through slabs =============

function computeSlabTax(
    taxableIncome: number,
    slabs: TaxSlab[]
): { tax: number; details: SlabDetail[] } {
    let remaining = taxableIncome;
    let totalTax = 0;
    const details: SlabDetail[] = [];

    for (const slab of slabs) {
        if (remaining <= 0) break;

        const slabWidth = slab.max === Infinity
            ? remaining
            : Math.min(remaining, slab.max - slab.min);

        const taxInSlab = slabWidth * (slab.rate / 100);

        if (slabWidth > 0) {
            const rangeStr = slab.max === Infinity
                ? `Above ₹${(slab.min / 100000).toFixed(1)}L`
                : `₹${(slab.min / 100000).toFixed(1)}L - ₹${(slab.max / 100000).toFixed(1)}L`;

            details.push({
                range: rangeStr,
                rate: slab.rate,
                taxableAmount: slabWidth,
                tax: taxInSlab,
            });
        }

        totalTax += taxInSlab;
        remaining -= slabWidth;
    }

    return { tax: totalTax, details };
}

// ============= HELPER: Compute surcharge =============

function computeSurcharge(
    taxAmount: number,
    totalIncome: number,
    config: YearTaxConfig,
    regime: TaxRegime,
    isSpecialRateIncome: boolean = false
): number {
    if (taxAmount <= 0 || totalIncome <= 0) return 0;

    let surchargeRate = 0;

    for (const slab of config.surchargeSlabs) {
        if (totalIncome > slab.min && totalIncome <= slab.max) {
            surchargeRate = slab.rate;
            break;
        }
    }

    // Cap for new regime
    if (regime === 'new' && surchargeRate > config.surchargeCapNewRegime) {
        surchargeRate = config.surchargeCapNewRegime;
    }

    // Cap for special rate incomes (STCG 111A, LTCG 112A, 112, 115BBH)
    // As per CBDT, surcharge on tax attributable to CG/VDA is capped at 15%
    if (isSpecialRateIncome && surchargeRate > config.surchargeCap_SpecialRateIncome) {
        surchargeRate = config.surchargeCap_SpecialRateIncome;
    }

    let surcharge = taxAmount * (surchargeRate / 100);

    // Marginal surcharge relief
    // If total income just crosses the surcharge threshold, the incremental
    // tax+surcharge should not exceed the incremental income above threshold
    if (surcharge > 0) {
        const applicableSlab = config.surchargeSlabs.find(
            s => totalIncome > s.min && totalIncome <= s.max
        );
        if (applicableSlab && applicableSlab.min > 0) {
            const prevSlab = config.surchargeSlabs.find(s => s.max === applicableSlab.min);
            if (prevSlab) {
                let prevRate = prevSlab.rate;
                if (regime === 'new' && prevRate > config.surchargeCapNewRegime) {
                    prevRate = config.surchargeCapNewRegime;
                }
                if (isSpecialRateIncome && prevRate > config.surchargeCap_SpecialRateIncome) {
                    prevRate = config.surchargeCap_SpecialRateIncome;
                }

                const taxAtPrevSurcharge = taxAmount * (1 + prevRate / 100);
                const taxWithCurrentSurcharge = taxAmount + surcharge;
                const incomeAboveThreshold = totalIncome - applicableSlab.min;

                if (taxWithCurrentSurcharge - taxAtPrevSurcharge > incomeAboveThreshold) {
                    surcharge = Math.max(0, taxAtPrevSurcharge + incomeAboveThreshold - taxAmount);
                }
            }
        }
    }

    return surcharge;
}

// ============= HELPER: Compute presumptive income =============

function computePresumptiveIncome(
    section: '44AD' | '44ADA',
    totalReceipts: number,
    digitalReceipts?: number,
    cashReceipts?: number,
    config?: YearTaxConfig
): number {
    if (section === '44ADA') {
        // 50% of gross receipts
        return Math.round(totalReceipts * 0.50);
    }

    // 44AD: 6% for digital, 8% for cash
    const cfg = config || getConfig();
    const digital = digitalReceipts ?? totalReceipts; // Default: all digital
    const cash = cashReceipts ?? 0;

    return Math.round(
        digital * (cfg.presumptive44AD.digitalRate / 100) +
        cash * (cfg.presumptive44AD.cashRate / 100)
    );
}

// ============= HELPER: Compute house property income =============

function computeHousePropertyIncome(
    hp: TaxProfile['houseProperty'],
    config: YearTaxConfig
): number {
    if (!hp) return 0;

    if (hp.type === 'SOP') {
        // Self-occupied: NAV is 0, only interest deduction applies
        const interestDeduction = Math.min(hp.homeLoanInterest || 0, config.hpInterestLimitSOP);
        return -interestDeduction; // Always negative or zero for SOP
    }

    // Let-out property
    const grossAnnualValue = hp.annualRentReceived;
    const netAnnualValue = Math.max(0, grossAnnualValue - (hp.municipalTaxesPaid || 0));
    const standardDeduction = netAnnualValue * (config.hpStandardDeduction / 100); // 30% of NAV
    const interestDeduction = hp.homeLoanInterest || 0; // No cap for LOP
    const incomeFromHP = netAnnualValue - standardDeduction - interestDeduction;

    return incomeFromHP;
}

// ============= HELPER: Compute deductions =============

function computeDeductions(
    deductions: TaxProfile['deductions'],
    regime: TaxRegime,
    config: YearTaxConfig,
    grossTotalIncome: number,
    ay: string
): number {
    if (!deductions) return 0;

    let totalDeductions = 0;

    if (regime === 'old') {
        // Chapter VI-A deductions — full set allowed
        const sec80C = Math.min(config.section80CLimit,
            (deductions.section80C || 0) +
            (deductions.section80CCC || 0) +
            (deductions.section80CCD1 || 0)
        );
        totalDeductions += sec80C;

        totalDeductions += Math.min(config.section80CCDExtraLimit, deductions.section80CCD1B || 0);
        totalDeductions += deductions.section80CCD2 || 0; // Employer NPS — no hard cap here (10% of basic)
        totalDeductions += Math.min(75000, deductions.section80D || 0);
        totalDeductions += Math.min(125000, deductions.section80DD || 0);
        totalDeductions += Math.min(100000, deductions.section80DDB || 0);
        totalDeductions += deductions.section80E || 0;     // No limit
        totalDeductions += Math.min(50000, deductions.section80EE || 0);
        totalDeductions += Math.min(150000, deductions.section80EEA || 0);
        totalDeductions += Math.min(150000, deductions.section80EEB || 0);
        totalDeductions += deductions.section80G || 0;
        totalDeductions += Math.min(60000, deductions.section80GG || 0);
        totalDeductions += deductions.section80GGA || 0;
        totalDeductions += deductions.section80GGC || 0;
        totalDeductions += Math.min(10000, deductions.section80TTA || 0);
        totalDeductions += Math.min(50000, deductions.section80TTB || 0);
        totalDeductions += Math.min(125000, deductions.section80U || 0);

        // Salary exemptions (HRA, LTA) — these reduce salary income at source
        // They are NOT Chapter VI-A deductions, but we handle them here for simplicity
        // as they already reduce GTI before deductions are applied
    } else {
        // New Regime: Only 80CCD(2) — Employer NPS is allowed
        totalDeductions += deductions.section80CCD2 || 0;

        // AY 2026-27: 80CCD(1B) also allowed in new regime per some proposals
        // TODO: Confirm with CA — keeping for future-proofing
        if (ay === '2026-27') {
            totalDeductions += Math.min(config.section80CCDExtraLimit, deductions.section80CCD1B || 0);
        }
    }

    // Deductions cannot exceed GTI (cannot create loss via Chapter VI-A)
    totalDeductions = Math.min(totalDeductions, Math.max(0, grossTotalIncome));

    return totalDeductions;
}

// ============= HELPER: Total TDS =============

function computeTotalTDS(tds?: TDSBySource): number {
    if (!tds) return 0;
    return (tds.salary || 0) +
        (tds.interest || 0) +
        (tds.rent || 0) +
        (tds.professional || 0) +
        (tds.cryptoVDA || 0) +
        (tds.property || 0) +
        (tds.dividend || 0) +
        (tds.other || 0);
}

// ============= HELPER: ITR Form Recommendation =============

function recommendITRForm(profile: TaxProfile): ITRFormType {
    const hasBusiness = !!profile.business;
    const hasCrypto = profile.cryptoVDA && profile.cryptoVDA.totalGains > 0;
    const hasCapitalGains = profile.capitalGains && (
        (profile.capitalGains.stcgEquity || 0) > 0 ||
        (profile.capitalGains.ltcgEquity || 0) > 0 ||
        (profile.capitalGains.stcgOther || 0) > 0 ||
        (profile.capitalGains.ltcgOther || 0) > 0
    );
    const hasForeignIncome = (profile.foreignIncome || 0) > 0;

    if (hasBusiness) {
        // Business income present
        if (profile.business!.section === 'Regular') {
            return 'ITR-3';
        }
        // With presumptive: check if crypto/CG also exists
        if (hasCrypto || hasCapitalGains || hasForeignIncome) {
            return 'ITR-3'; // ITR-4 doesn't support CG/VDA
        }
        return 'ITR-4'; // Eligible for Sugam
    }

    if (hasCrypto || hasCapitalGains || hasForeignIncome) {
        return 'ITR-2';
    }

    // Simple salary + HP + Other Sources
    const totalIncome = (profile.salary?.grossSalary || 0) +
        (profile.otherSources?.savingsInterest || 0) +
        (profile.otherSources?.fdInterest || 0) +
        (profile.otherSources?.dividendIncome || 0) +
        (profile.otherSources?.otherIncome || 0) +
        (profile.houseProperty?.annualRentReceived || 0);

    if (totalIncome <= 5000000 && !hasForeignIncome) {
        return 'ITR-1';
    }

    return 'ITR-2';
}

// ============= HELPER: Regime Eligibility =============

function checkRegimeEligibility(profile: TaxProfile): {
    canUseNew: boolean;
    canUseOld: boolean;
    reason?: string;
} {
    // Both regimes are always technically available for individuals
    // But we provide guidance:

    const hasBusiness = !!profile.business;
    const hasCrypto = profile.cryptoVDA && profile.cryptoVDA.totalGains > 0;

    const warnings: string[] = [];

    // Note: Crypto IS taxable under both regimes (115BBH applies regardless).
    // The common misconception is that crypto forces Old Regime — this is INCORRECT.
    // 115BBH applies a flat 30% regardless of regime choice.
    // However, old regime allows more deductions which may lower overall tax.

    if (hasBusiness && profile.business!.section !== 'Regular') {
        // Presumptive business can use either regime, but switching from
        // new to old has a 5-year lock-in consequence
        warnings.push('Switching from New Regime to Old has a 5-year lock-in for business income');
    }

    return {
        canUseNew: true,
        canUseOld: true,
        reason: warnings.length > 0 ? warnings.join('; ') : undefined,
    };
}

// ============= MAIN: calculateTaxV2 =============

/**
 * The core tax computation function.
 * 
 * Computes tax with proper separation of:
 * 1. Normal income (slab rates)
 * 2. STCG 111A (special rate)
 * 3. LTCG 112A (special rate with exemption)
 * 4. LTCG Other (special rate)
 * 5. Crypto/VDA 115BBH (30% flat, no deductions)
 * 
 * Each computed SEPARATELY, then aggregated for surcharge + cess.
 */
export function calculateTaxV2(profile: TaxProfile): TaxCalculationResult {
    const config = getConfig(profile.assessmentYear);
    const regime = profile.regime || 'new';
    const ay = profile.assessmentYear || '2026-27';
    const warnings: string[] = [];

    // ────────────────────────────────────────────────
    // STEP 1: INCOME COMPUTATION BY HEAD
    // ────────────────────────────────────────────────

    const incomeBreakdown: IncomeBreakdown[] = [];

    // 1a. Salary Income
    const salaryExemptions = regime === 'old'
        ? (profile.deductions?.hra || 0) + (profile.deductions?.lta || 0)
        : 0;
    const profTax = profile.salary?.professionalTax || 0;
    const grossSalary = profile.salary?.grossSalary || 0;

    // Standard deduction applied to salary income
    const standardDeduction = grossSalary > 0
        ? (regime === 'new' ? config.standardDeductionNew : config.standardDeductionOld)
        : 0;

    const netSalary = Math.max(0, grossSalary - standardDeduction - salaryExemptions - profTax);

    if (grossSalary > 0) {
        incomeBreakdown.push({
            head: IncomeHead.SALARY,
            grossAmount: grossSalary,
            deductions: standardDeduction + salaryExemptions + profTax,
            netAmount: netSalary,
        });
    }

    // 1b. House Property Income
    const hpIncome = computeHousePropertyIncome(profile.houseProperty, config);
    // HP loss capped at ₹2L for set-off against other heads
    const hpSetOff = Math.max(-config.hpLossSetoffLimit, hpIncome);

    if (profile.houseProperty) {
        incomeBreakdown.push({
            head: IncomeHead.HOUSE_PROPERTY,
            grossAmount: profile.houseProperty.annualRentReceived || 0,
            deductions: Math.max(0, (profile.houseProperty.annualRentReceived || 0) - hpIncome),
            netAmount: hpSetOff,
        });
    }

    // 1c. Business Income
    let businessNetProfit = 0;
    if (profile.business) {
        const biz = profile.business;
        let headType: IncomeHead;

        if (biz.section === '44AD') {
            businessNetProfit = computePresumptiveIncome(
                '44AD', biz.totalReceipts, biz.digitalReceipts, biz.cashReceipts, config
            );
            headType = IncomeHead.BUSINESS_44AD;
        } else if (biz.section === '44ADA') {
            businessNetProfit = computePresumptiveIncome(
                '44ADA', biz.totalReceipts
            );
            headType = IncomeHead.BUSINESS_44ADA;
        } else {
            // Regular: user provides expenses, we compute net profit
            businessNetProfit = biz.netProfit ?? (biz.totalReceipts - (biz.expenses || 0));
            headType = IncomeHead.BUSINESS_REGULAR;
        }

        incomeBreakdown.push({
            head: headType,
            grossAmount: biz.totalReceipts,
            deductions: biz.totalReceipts - businessNetProfit,
            netAmount: businessNetProfit,
        });
    }

    // 1d. Other Sources
    const otherSourcesTotal =
        (profile.otherSources?.savingsInterest || 0) +
        (profile.otherSources?.fdInterest || 0) +
        (profile.otherSources?.dividendIncome || 0) +
        (profile.otherSources?.otherIncome || 0);

    if (otherSourcesTotal > 0) {
        incomeBreakdown.push({
            head: IncomeHead.OTHER_SOURCES,
            grossAmount: otherSourcesTotal,
            deductions: 0,
            netAmount: otherSourcesTotal,
        });
    }

    // 1e. STCG Other (non-equity, taxed at slab rate — included in normal income)
    const stcgOther = profile.capitalGains?.stcgOther || 0;
    if (stcgOther > 0) {
        incomeBreakdown.push({
            head: IncomeHead.CAPITAL_GAINS_STCG_OTHER,
            grossAmount: stcgOther,
            deductions: 0,
            netAmount: stcgOther,
        });
    }

    // ────────────────────────────────────────────────
    // STEP 2: GROSS TOTAL INCOME (Normal heads only)
    // ────────────────────────────────────────────────
    // GTI = Salary(net) + HP(set-off) + Business + OtherSources + STCG_Other
    // STCG_Other (debt/gold/property <24m) is taxed at slab rates → included here

    const grossTotalIncome = netSalary + hpSetOff + businessNetProfit + otherSourcesTotal + stcgOther;

    // ────────────────────────────────────────────────
    // STEP 3: DEDUCTIONS (Chapter VI-A)
    // ────────────────────────────────────────────────
    // Deductions apply ONLY to normal income, NOT to special-rate incomes

    const totalDeductions = computeDeductions(profile.deductions, regime, config, grossTotalIncome, ay);

    const normalTaxableIncome = Math.max(0, grossTotalIncome - totalDeductions);

    // ────────────────────────────────────────────────
    // STEP 4: TAX ON NORMAL INCOME (Slab rates)
    // ────────────────────────────────────────────────

    const activeSlabs = regime === 'new' ? config.newSlabs : config.oldSlabs;
    let slabResult = computeSlabTax(normalTaxableIncome, activeSlabs);
    let normalIncomeTax = slabResult.tax;
    const agricultureIncome = Math.max(0, profile.agricultureIncome || 0);
    const basicExemptionLimit = activeSlabs[0]?.max === Infinity ? 0 : activeSlabs[0]?.max || 0;
    const appliesAgriculturePartialIntegration =
        agricultureIncome > 5000 && normalTaxableIncome > basicExemptionLimit;

    if (appliesAgriculturePartialIntegration) {
        const taxOnIncomePlusAgriculture = computeSlabTax(normalTaxableIncome + agricultureIncome, activeSlabs);
        const taxOnExemptionPlusAgriculture = computeSlabTax(basicExemptionLimit + agricultureIncome, activeSlabs);
        const taxBeforeIntegration = slabResult.tax;

        normalIncomeTax = Math.max(0, taxOnIncomePlusAgriculture.tax - taxOnExemptionPlusAgriculture.tax);
        slabResult = {
            tax: normalIncomeTax,
            details: [
                ...slabResult.details,
                {
                    range: 'Agriculture partial integration adjustment',
                    rate: 0,
                    taxableAmount: agricultureIncome,
                    tax: normalIncomeTax - taxBeforeIntegration,
                },
            ],
        };
    }

    // ────────────────────────────────────────────────
    // STEP 5: TAX ON SPECIAL RATE INCOMES (SEPARATELY)
    // ────────────────────────────────────────────────

    // 5a. Crypto/VDA — Section 115BBH
    const cryptoGains = Math.max(0, profile.cryptoVDA?.totalGains || 0);
    const cryptoTaxAmount = cryptoGains * (config.vdaTaxRate / 100);

    const cryptoTaxDetail: SpecialRateTaxDetail = {
        section: '115BBH',
        description: 'Crypto/VDA Income — 30% flat tax, no deductions allowed',
        taxableAmount: cryptoGains,
        exemption: 0,
        netTaxableAmount: cryptoGains,
        rate: config.vdaTaxRate,
        tax: cryptoTaxAmount,
        surcharge: 0,  // Computed later
        cess: 0,       // Computed later
        totalTax: 0,   // Computed later
    };

    if (cryptoGains > 0) {
        incomeBreakdown.push({
            head: IncomeHead.CRYPTO_VDA,
            grossAmount: cryptoGains,
            deductions: 0,
            netAmount: cryptoGains,
        });
    }

    // VDA losses warning
    if (profile.cryptoVDA && (profile.cryptoVDA.totalLosses || 0) > 0) {
        warnings.push(
            `Crypto/VDA losses of ₹${(profile.cryptoVDA.totalLosses || 0).toLocaleString('en-IN')} ` +
            `cannot be set off against any other income (Section 115BBH). ` +
            `These losses also cannot be carried forward.`
        );
    }

    // 5b. STCG Equity — Section 111A
    const stcgEquity = profile.capitalGains?.stcgEquity || 0;
    const stcgEquityTaxAmount = stcgEquity * (config.stcgEquityRate / 100);

    const stcgTaxDetail: SpecialRateTaxDetail = {
        section: '111A',
        description: `Short Term Capital Gains (Listed Equity) — ${config.stcgEquityRate}%`,
        taxableAmount: stcgEquity,
        exemption: 0,
        netTaxableAmount: stcgEquity,
        rate: config.stcgEquityRate,
        tax: stcgEquityTaxAmount,
        surcharge: 0,
        cess: 0,
        totalTax: 0,
    };

    if (stcgEquity > 0) {
        incomeBreakdown.push({
            head: IncomeHead.CAPITAL_GAINS_STCG_111A,
            grossAmount: stcgEquity,
            deductions: 0,
            netAmount: stcgEquity,
        });
    }

    // 5c. LTCG Equity — Section 112A
    const ltcgEquityGross = profile.capitalGains?.ltcgEquity || 0;
    const ltcgExemption = Math.min(ltcgEquityGross, config.ltcgEquityExemption);
    const ltcgEquityTaxable = Math.max(0, ltcgEquityGross - ltcgExemption);
    const ltcgEquityTaxAmount = ltcgEquityTaxable * (config.ltcgEquityRate / 100);

    const ltcgTaxDetail: SpecialRateTaxDetail = {
        section: '112A',
        description: `Long Term Capital Gains (Listed Equity) — ${config.ltcgEquityRate}% above ₹${(config.ltcgEquityExemption / 100000).toFixed(1)}L`,
        taxableAmount: ltcgEquityGross,
        exemption: ltcgExemption,
        netTaxableAmount: ltcgEquityTaxable,
        rate: config.ltcgEquityRate,
        tax: ltcgEquityTaxAmount,
        surcharge: 0,
        cess: 0,
        totalTax: 0,
    };

    if (ltcgEquityGross > 0) {
        incomeBreakdown.push({
            head: IncomeHead.CAPITAL_GAINS_LTCG_112A,
            grossAmount: ltcgEquityGross,
            deductions: ltcgExemption,
            netAmount: ltcgEquityTaxable,
        });
    }

    // 5d. LTCG Other — Section 112
    const ltcgOther = profile.capitalGains?.ltcgOther || 0;
    const ltcgOtherTaxAmount = ltcgOther * (config.ltcgOtherRate / 100);

    const ltcgOtherTaxDetail: SpecialRateTaxDetail = {
        section: '112',
        description: `Long Term Capital Gains (Other Assets) — ${config.ltcgOtherRate}%`,
        taxableAmount: ltcgOther,
        exemption: 0,
        netTaxableAmount: ltcgOther,
        rate: config.ltcgOtherRate,
        tax: ltcgOtherTaxAmount,
        surcharge: 0,
        cess: 0,
        totalTax: 0,
    };

    if (ltcgOther > 0) {
        incomeBreakdown.push({
            head: IncomeHead.CAPITAL_GAINS_LTCG_OTHER,
            grossAmount: ltcgOther,
            deductions: 0,
            netAmount: ltcgOther,
        });
    }

    // ────────────────────────────────────────────────
    // STEP 6: TOTAL TAX BEFORE REBATE
    // ────────────────────────────────────────────────

    const totalTaxBeforeRebate = normalIncomeTax + cryptoTaxAmount +
        stcgEquityTaxAmount + ltcgEquityTaxAmount + ltcgOtherTaxAmount;

    // ────────────────────────────────────────────────
    // STEP 7: REBATE u/s 87A
    // ────────────────────────────────────────────────
    // Per CBDT Circular No. 6/2024 dated 24.09.2024 [S.O. 3966(E)]:
    // Section 87A rebate is ONLY available against NORMAL slab-based tax.
    // It is NOT available against tax computed at special rates under:
    //   - Section 111A (STCG on listed equity)
    //   - Section 112A (LTCG on listed equity)
    //   - Section 112 (LTCG on other assets)
    //   - Section 115BBH (Crypto/VDA)
    //
    // Rebate eligibility: Total income (all heads) must be ≤ threshold.
    // Total income for this purpose includes ALL incomes but rebate reduces
    // ONLY the normal slab-computed tax.

    const totalIncomeAllHeads = normalTaxableIncome + cryptoGains +
        stcgEquity + ltcgEquityGross + ltcgOther;

    // Tax eligible for rebate = ONLY normal slab tax
    const taxEligibleForRebate = normalIncomeTax;

    // Special rate taxes — NOT eligible for rebate
    const totalSpecialRateTax = cryptoTaxAmount + stcgEquityTaxAmount +
        ltcgEquityTaxAmount + ltcgOtherTaxAmount;

    let rebate87A = 0;
    let marginalRelief = 0;

    const rebateConfig = config.rebate87A;

    if (regime === 'new') {
        if (totalIncomeAllHeads <= rebateConfig.newRegimeLimit) {
            rebate87A = Math.min(taxEligibleForRebate, rebateConfig.newRegimeAmount);
        } else {
            // Marginal relief on rebate (only for normal tax portion):
            // If income slightly exceeds ₹12L, the total tax payable should not
            // result in a situation where paying 1 rupee more in income costs more
            // than 1 rupee in tax. Only applied to normal tax.
            const incomeAboveLimit = totalIncomeAllHeads - rebateConfig.newRegimeLimit;
            const normalTaxPlusSpecial = normalIncomeTax + totalSpecialRateTax;

            if (normalIncomeTax > 0 && incomeAboveLimit > 0 && normalTaxPlusSpecial > incomeAboveLimit) {
                // Marginal relief: (tax without rebate) - (income above limit)
                // But only reduce the normal tax component
                const normalTaxPortion = Math.min(normalIncomeTax, incomeAboveLimit);
                const remainingForSpecial = incomeAboveLimit - normalTaxPortion;
                if (normalIncomeTax > normalTaxPortion + remainingForSpecial) {
                    marginalRelief = normalIncomeTax - normalTaxPortion;
                    rebate87A = marginalRelief;
                }
            }
        }
    } else {
        if (totalIncomeAllHeads <= rebateConfig.oldRegimeLimit) {
            rebate87A = Math.min(taxEligibleForRebate, rebateConfig.oldRegimeAmount);
        }
    }

    // Tax after rebate = normal tax (after rebate) + all special rate taxes
    const normalTaxAfterRebate = Math.max(0, normalIncomeTax - rebate87A);
    const taxAfterRebate = normalTaxAfterRebate + totalSpecialRateTax;

    // ────────────────────────────────────────────────
    // STEP 8: SURCHARGE
    // ────────────────────────────────────────────────
    // Surcharge is computed on total income (all heads), but:
    // - Normal income surcharge: normal rate
    // - Special rate incomes (CG, VDA): surcharge CAPPED at 15%
    //
    // Each category's surcharge is computed separately on its own tax.
    // Surcharge is computed AFTER rebate for normal income,
    // and on full tax for special rate incomes (rebate doesn't apply to them).

    const surchargeOnNormal = computeSurcharge(
        normalTaxAfterRebate, totalIncomeAllHeads, config, regime, false
    );

    // Surcharge on crypto (capped at 15%)
    const cryptoSurcharge = computeSurcharge(
        cryptoTaxAmount, totalIncomeAllHeads, config, regime, true
    );
    cryptoTaxDetail.surcharge = Math.round(cryptoSurcharge);

    // Surcharge on STCG 111A (capped at 15%)
    const stcgSurcharge = computeSurcharge(
        stcgEquityTaxAmount, totalIncomeAllHeads, config, regime, true
    );
    stcgTaxDetail.surcharge = Math.round(stcgSurcharge);

    // Surcharge on LTCG 112A (capped at 15%)
    const ltcgSurcharge = computeSurcharge(
        ltcgEquityTaxAmount, totalIncomeAllHeads, config, regime, true
    );
    ltcgTaxDetail.surcharge = Math.round(ltcgSurcharge);

    // Surcharge on LTCG Other (capped at 15%)
    const ltcgOtherSurcharge = computeSurcharge(
        ltcgOtherTaxAmount, totalIncomeAllHeads, config, regime, true
    );
    ltcgOtherTaxDetail.surcharge = Math.round(ltcgOtherSurcharge);

    const totalSurcharge = surchargeOnNormal + cryptoSurcharge +
        stcgSurcharge + ltcgSurcharge + ltcgOtherSurcharge;

    // ────────────────────────────────────────────────
    // STEP 9: HEALTH & EDUCATION CESS @ 4%
    // ────────────────────────────────────────────────
    // Cess = 4% of (Tax + Surcharge)

    const cess = (taxAfterRebate + totalSurcharge) * (config.cessRate / 100);

    // Compute per-category cess
    const cryptoCess = (cryptoTaxAmount + cryptoSurcharge) * (config.cessRate / 100);
    cryptoTaxDetail.cess = Math.round(cryptoCess);
    cryptoTaxDetail.totalTax = Math.round(cryptoTaxAmount + cryptoSurcharge + cryptoCess);

    const stcgCess = (stcgEquityTaxAmount + stcgSurcharge) * (config.cessRate / 100);
    stcgTaxDetail.cess = Math.round(stcgCess);
    stcgTaxDetail.totalTax = Math.round(stcgEquityTaxAmount + stcgSurcharge + stcgCess);

    const ltcgCess = (ltcgEquityTaxAmount + ltcgSurcharge) * (config.cessRate / 100);
    ltcgTaxDetail.cess = Math.round(ltcgCess);
    ltcgTaxDetail.totalTax = Math.round(ltcgEquityTaxAmount + ltcgSurcharge + ltcgCess);

    const ltcgOtherCess = (ltcgOtherTaxAmount + ltcgOtherSurcharge) * (config.cessRate / 100);
    ltcgOtherTaxDetail.cess = Math.round(ltcgOtherCess);
    ltcgOtherTaxDetail.totalTax = Math.round(ltcgOtherTaxAmount + ltcgOtherSurcharge + ltcgOtherCess);

    // ────────────────────────────────────────────────
    // STEP 10: TOTAL TAX LIABILITY
    // ────────────────────────────────────────────────

    const totalTaxLiability = Math.round(taxAfterRebate + totalSurcharge + cess);

    // ────────────────────────────────────────────────
    // STEP 11: TDS SET-OFF & FINAL PAYABLE
    // ────────────────────────────────────────────────
    // All TDS (including 194S on crypto) can be set off against total tax liability.
    // TDS is a tax CREDIT, not income-specific for set-off purposes.

    const totalTDSPaid = computeTotalTDS(profile.tds);
    const advanceTaxPaid = profile.advanceTaxPaid || 0;
    const selfAssessmentTax = profile.selfAssessmentTax || 0;
    const totalTaxesPaid = totalTDSPaid + advanceTaxPaid + selfAssessmentTax;

    const refundOrPayable = totalTaxesPaid - totalTaxLiability;

    // ────────────────────────────────────────────────
    // STEP 12: WARNINGS & VALIDATION
    // ────────────────────────────────────────────────

    if (totalTDSPaid > totalTaxLiability && totalTaxLiability > 0) {
        warnings.push(
            `TDS paid (₹${totalTDSPaid.toLocaleString('en-IN')}) exceeds tax liability ` +
            `(₹${totalTaxLiability.toLocaleString('en-IN')}). You are eligible for a refund of ` +
            `₹${Math.abs(refundOrPayable).toLocaleString('en-IN')}.`
        );
    }

    const regimeEligibility = checkRegimeEligibility(profile);
    const recommendedForm = recommendITRForm(profile);

    // Agriculture income warning
    if (agricultureIncome > 5000) {
        warnings.push(
            appliesAgriculturePartialIntegration
                ? 'Agriculture income exceeds ₹5,000. Partial integration has been applied to slab tax computation; keep evidence for review.'
                : 'Agriculture income exceeds ₹5,000, but partial integration did not change tax because normal taxable income is within the basic exemption limit.'
        );
    }

    // ────────────────────────────────────────────────
    // RETURN RESULT
    // ────────────────────────────────────────────────

    return {
        // Income
        incomeBreakdown,
        grossTotalIncome,
        standardDeduction,
        totalDeductions,
        normalTaxableIncome,

        // Tax on normal income
        normalIncomeTax,
        slabs: slabResult.details,

        // Special rate taxes
        cryptoTax: cryptoTaxDetail,
        stcgTax: stcgTaxDetail,
        ltcgTax: ltcgTaxDetail,
        ltcgOtherTax: ltcgOtherTaxDetail,

        // Aggregation
        totalTaxBeforeRebate,
        rebate87A,
        marginalRelief,
        taxAfterRebate,
        surchargeOnNormal: Math.round(surchargeOnNormal),
        totalSurcharge: Math.round(totalSurcharge),
        cess: Math.round(cess),
        totalTaxLiability,

        // Payments
        totalTDSPaid,
        tdsBySource: profile.tds || {},
        advanceTaxPaid,
        selfAssessmentTax,
        totalTaxesPaid,

        // Final
        refundOrPayable: Math.abs(refundOrPayable),
        isRefund: refundOrPayable >= 0,

        // Metadata
        recommendedForm,
        regime,
        assessmentYear: ay,
        warnings,
        regimeEligibility,
    };
}

// ============= REGIME COMPARISON =============

export function compareRegimesV2(
    profile: Omit<TaxProfile, 'regime'>
): RegimeComparisonResult {
    const oldResult = calculateTaxV2({ ...profile, regime: 'old' });
    const newResult = calculateTaxV2({ ...profile, regime: 'new' });

    const oldBetter = oldResult.totalTaxLiability < newResult.totalTaxLiability;
    const savings = Math.abs(oldResult.totalTaxLiability - newResult.totalTaxLiability);

    const reasons: string[] = [];
    const config = getConfig(profile.assessmentYear);

    if (savings === 0) {
        reasons.push('Both regimes result in the same tax — choose based on convenience');
    } else if (oldBetter) {
        if (oldResult.totalDeductions > 200000) {
            reasons.push(
                `Your deductions of ₹${(oldResult.totalDeductions / 100000).toFixed(2)}L ` +
                `significantly reduce tax under Old Regime`
            );
        }
        if (profile.deductions?.hra && profile.deductions.hra > 100000) {
            reasons.push('Your HRA exemption makes Old Regime more attractive');
        }
        if (profile.deductions?.section80C && profile.deductions.section80C >= 100000) {
            reasons.push('Your 80C investments (EPF, PPF, ELSS) save more under Old Regime');
        }
        if (profile.deductions?.section80D && profile.deductions.section80D > 25000) {
            reasons.push('Health insurance premium deduction benefits Old Regime');
        }
    } else {
        if ((oldResult.totalDeductions || 0) < 150000) {
            reasons.push("Your deductions are limited — New Regime's lower slabs save more");
        }
        const ay = profile.assessmentYear || '2026-27';
        const rebateThreshold = ay === '2026-27' ? '₹12L' : '₹7L';
        reasons.push(`New Regime offers full tax rebate for income up to ${rebateThreshold}`);
        if (ay === '2026-27') {
            reasons.push('Budget 2025 introduced more favorable slab rates under New Regime');
        }
        if (config.standardDeductionNew > config.standardDeductionOld) {
            reasons.push(
                `New Regime offers higher standard deduction of ₹${(config.standardDeductionNew / 1000).toFixed(0)}K`
            );
        }
    }

    return {
        oldRegime: oldResult,
        newRegime: newResult,
        recommendation: oldBetter ? 'old' : 'new',
        savings,
        reasons,
    };
}

// ============= BACKWARD COMPATIBILITY ADAPTER =============

/**
 * Adapter that converts the old `TaxData` interface to the new `TaxProfile`
 * and returns a result compatible with the old `TaxResult` interface.
 * 
 * This allows the existing UI to work with the new engine without
 * requiring immediate frontend changes.
 */
export function calculateTaxCompat(data: {
    salary?: number;
    houseProperty?: number;
    otherSources?: { savingsInterest?: number; fdInterest?: number; dividends?: number; misc?: number };
    deductions?: Record<string, number | undefined>;
    businessIncome?: number;
    capitalGains?: {
        shortTermEquity?: number;
        longTermEquity?: number;
        shortTermOther?: number;
        longTermOther?: number;
        cryptoVDA?: number;
    };
    vdaGains?: number;
    regime: 'old' | 'new';
    assessmentYear?: string;
    tdsPaid?: number;
    advanceTaxPaid?: number;
    selfAssessmentTax?: number;
    // New fields for proper business income
    businessSection?: '44AD' | '44ADA' | 'Regular';
    businessTurnover?: number;
    businessExpenses?: number;
}): {
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
    // New fields exposed
    cryptoTaxDetail: SpecialRateTaxDetail;
    stcgTaxDetail: SpecialRateTaxDetail;
    ltcgTaxDetail: SpecialRateTaxDetail;
    incomeBreakdown: IncomeBreakdown[];
    warnings: string[];
    recommendedForm: ITRFormType;
} {
    // Build TaxProfile from old-style data
    const cryptoGains = Math.max(0, data.vdaGains || 0) +
        Math.max(0, data.capitalGains?.cryptoVDA || 0);

    const profile: TaxProfile = {
        assessmentYear: (data.assessmentYear as any) || '2026-27',
        regime: data.regime,
        salary: data.salary ? { grossSalary: data.salary } : undefined,
        houseProperty: data.houseProperty !== undefined && data.houseProperty !== 0
            ? {
                type: data.houseProperty < 0 ? 'SOP' : 'LOP',
                annualRentReceived: Math.max(0, data.houseProperty),
                municipalTaxesPaid: 0,
                // If HP income is negative (loss), treat as SOP with loan interest = abs(value)
                homeLoanInterest: data.houseProperty < 0 ? Math.abs(data.houseProperty) : 0,
            }
            : undefined,
        business: data.businessIncome !== undefined && data.businessIncome !== 0
            ? {
                section: data.businessSection || '44ADA',
                totalReceipts: data.businessTurnover || data.businessIncome,
                netProfit: data.businessIncome,
                expenses: data.businessExpenses || 0,
            }
            : undefined,
        capitalGains: {
            stcgEquity: data.capitalGains?.shortTermEquity || 0,
            ltcgEquity: data.capitalGains?.longTermEquity || 0,
            stcgOther: data.capitalGains?.shortTermOther || 0,
            ltcgOther: data.capitalGains?.longTermOther || 0,
        },
        cryptoVDA: cryptoGains > 0 ? { totalGains: cryptoGains } : undefined,
        otherSources: {
            savingsInterest: data.otherSources?.savingsInterest || 0,
            fdInterest: data.otherSources?.fdInterest || 0,
            dividendIncome: data.otherSources?.dividends || 0,
            otherIncome: data.otherSources?.misc || 0,
        },
        deductions: data.deductions ? {
            section80C: data.deductions.section80C,
            section80D: data.deductions.section80D,
            section80TTA: data.deductions.section80TTA,
            section80TTB: data.deductions.section80TTB,
            section80E: data.deductions.section80E,
            section80G: data.deductions.section80G,
            section80CCD1B: data.deductions.nps80CCD as number,
            section80CCD2: data.deductions.nps80CCD2 as number,
            section80EE: data.deductions.section80EE,
            section80EEA: data.deductions.section80EEA,
            section80DD: data.deductions.section80DD,
            section80DDB: data.deductions.section80DDB,
            section80U: data.deductions.section80U,
            section80GG: data.deductions.section80GG,
            hra: data.deductions.hra as number,
            lta: data.deductions.lta as number,
        } : undefined,
        tds: {
            salary: data.tdsPaid || 0,
        },
        advanceTaxPaid: data.advanceTaxPaid || 0,
        selfAssessmentTax: data.selfAssessmentTax || 0,
    };

    const result = calculateTaxV2(profile);

    // Convert to old format
    return {
        grossTotalIncome: result.grossTotalIncome,
        totalDeductions: result.totalDeductions,
        taxableIncome: result.normalTaxableIncome,
        taxPayable: result.taxAfterRebate,
        vdaTax: result.cryptoTax.tax,
        capitalGainsTax: result.stcgTax.tax + result.ltcgTax.tax + result.ltcgOtherTax.tax,
        slabs: result.slabs.map(s => ({
            rate: `${s.rate}%`,
            amount: s.taxableAmount,
            tax: s.tax,
        })),
        cess: result.cess,
        finalTax: result.totalTaxLiability,
        rebate87A: result.rebate87A,
        surcharge: result.totalSurcharge,
        netTaxPayable: result.totalTaxLiability,
        tdsPaid: result.totalTDSPaid,
        advanceTaxPaid: result.advanceTaxPaid,
        refundOrDue: result.refundOrPayable,
        isRefund: result.isRefund,
        marginalRelief: result.marginalRelief,
        // New fields
        cryptoTaxDetail: result.cryptoTax,
        stcgTaxDetail: result.stcgTax,
        ltcgTaxDetail: result.ltcgTax,
        incomeBreakdown: result.incomeBreakdown,
        warnings: result.warnings,
        recommendedForm: result.recommendedForm,
    };
}

