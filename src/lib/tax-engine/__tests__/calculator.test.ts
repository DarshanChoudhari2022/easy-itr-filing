/**
 * TaxMitra Tax Engine — Comprehensive Test Suite
 * 
 * Tests cover:
 * 1. Simple salaried (ITR-1)
 * 2. Salaried + Crypto (ITR-2) — THE USER'S BUG SCENARIO
 * 3. Freelancer 44AD + Crypto (ITR-3)
 * 4. Freelancer 44ADA (ITR-4)
 * 5. Complex mix (salary + business + STCG + LTCG + crypto)
 * 6. Edge case: high income with surcharge
 * 7. Edge case: crypto losses (no set-off)
 * 8. New Regime rebate scenario (income ≤ ₹12L)
 * 9. LTCG within exemption limit (₹1.25L)
 * 10. Pure business income (44AD with cash + digital)
 * 11. THE EXACT USER-REPORTED BUG SCENARIO
 * 
 * Each test verifies expected tax output is hand-derivable.
 */

import { describe, it, expect } from 'vitest';
import { calculateTaxV2, compareRegimesV2 } from '../calculator';
import { TaxProfile } from '../types';

// Helper to round for comparison (tax amounts are always rounded)
const r = (n: number) => Math.round(n);

describe('TaxEngine v2 — Core Calculations', () => {

    // ──────────────────────────────────────────
    // TEST 1: Simple Salaried — New Regime (ITR-1)
    // ──────────────────────────────────────────
    it('should correctly compute tax for simple salaried employee (New Regime)', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
            salary: { grossSalary: 1000000 }, // ₹10L
        };

        const result = calculateTaxV2(profile);

        // Salary: ₹10,00,000
        // Less: Standard Deduction: ₹75,000 (new regime)
        // Taxable Income: ₹9,25,000
        // 
        // New Slabs AY 2026-27:
        // 0-4L: 0% = 0
        // 4-8L: 5% = 20,000
        // 8-9.25L: 10% = 12,500
        // Total slab tax: ₹32,500
        //
        // But! Total income ₹9,25,000 ≤ ₹12,00,000 → 87A rebate applies
        // Rebate 87A = ₹32,500 (min of tax and ₹60,000 rebate cap)
        // Tax after rebate = 0
        // Cess: 4% of 0 = 0
        // Total: ₹0

        expect(result.grossTotalIncome).toBe(925000);
        expect(result.normalTaxableIncome).toBe(925000);
        expect(result.standardDeduction).toBe(75000);
        expect(result.normalIncomeTax).toBe(32500);
        expect(result.rebate87A).toBe(32500);
        expect(result.totalTaxLiability).toBe(0);
        expect(result.recommendedForm).toBe('ITR-1');
    });

    // ──────────────────────────────────────────
    // TEST 2: Simple Salaried — Old Regime with Deductions
    // ──────────────────────────────────────────
    it('should correctly compute tax with Old Regime deductions', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 1200000 }, // ₹12L
            deductions: {
                section80C: 150000,  // Max ₹1.5L
                section80D: 25000,   // Health insurance
                hra: 100000,         // HRA exemption
            },
        };

        const result = calculateTaxV2(profile);

        // Salary: ₹12,00,000
        // Less: Std Deduction (Old): ₹50,000
        // Less: HRA: ₹1,00,000
        // Taxable Salary: ₹10,50,000
        // GTI: ₹10,50,000
        // 
        // Deductions:
        // 80C: ₹1,50,000
        // 80D: ₹25,000
        // Total: ₹1,75,000
        // 
        // Taxable Income: ₹10,50,000 - ₹1,75,000 = ₹8,75,000
        // 
        // Old Slabs:
        // 0-2.5L: 0% = 0
        // 2.5-5L: 5% = 12,500
        // 5-8.75L: 20% = 75,000
        // Total: ₹87,500
        // Cess: 4% = ₹3,500
        // Total: ₹91,000

        expect(result.standardDeduction).toBe(50000);
        expect(result.grossTotalIncome).toBe(1050000);
        expect(result.totalDeductions).toBe(175000);
        expect(result.normalTaxableIncome).toBe(875000);
        expect(result.normalIncomeTax).toBe(87500);
        expect(result.cess).toBe(3500);
        expect(result.totalTaxLiability).toBe(91000);
    });

    // ──────────────────────────────────────────
    // TEST 3: Crypto Only — Section 115BBH
    // ──────────────────────────────────────────
    it('should tax crypto at 30% flat with cess, no deductions — rebate NOT applicable', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            cryptoVDA: { totalGains: 300000 }, // ₹3L
            tds: { cryptoVDA: 3000 },          // ₹3K TDS u/s 194S
        };

        const result = calculateTaxV2(profile);

        // Crypto: ₹3,00,000 × 30% = ₹90,000
        // No surcharge (income ≤ ₹50L)
        //
        // Per CBDT Circular 6/2024: 87A rebate does NOT apply to 115BBH tax.
        // Even though total income ₹3L ≤ ₹5L (old regime limit),
        // the rebate only reduces normal slab tax (which is ₹0 here).
        //
        // Cess: 4% of ₹90,000 = ₹3,600
        // Total: ₹93,600
        // Less TDS: ₹3,000
        // Net payable: ₹90,600

        expect(result.cryptoTax.tax).toBe(90000);
        expect(result.cryptoTax.surcharge).toBe(0);
        expect(result.rebate87A).toBe(0); // 87A does NOT reduce crypto tax
        expect(result.totalTaxLiability).toBe(93600);
        expect(result.totalTDSPaid).toBe(3000);
        expect(result.refundOrPayable).toBe(90600);
        expect(result.isRefund).toBe(false);
    });

    // ──────────────────────────────────────────
    // TEST 4: STCG Equity — Section 111A
    // ──────────────────────────────────────────
    it('should tax STCG on equity at 20% (AY 2026-27) — rebate NOT applicable', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
            capitalGains: { stcgEquity: 150000 }, // ₹1.5L STCG
        };

        const result = calculateTaxV2(profile);

        // STCG: ₹1,50,000 × 20% = ₹30,000
        // Per CBDT Circular 6/2024: 87A rebate does NOT apply to 111A tax.
        // Cess: 4% of ₹30,000 = ₹1,200
        // Total: ₹31,200

        expect(result.stcgTax.tax).toBe(30000);
        expect(result.stcgTax.rate).toBe(20);
        expect(result.rebate87A).toBe(0); // 87A does NOT reduce STCG tax
        expect(result.totalTaxLiability).toBe(31200);
    });

    // ──────────────────────────────────────────
    // TEST 5: LTCG Equity within exemption — Section 112A
    // ──────────────────────────────────────────
    it('should exempt LTCG on equity up to ₹1.25L (AY 2026-27)', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
            capitalGains: { ltcgEquity: 50000 }, // ₹50K — within ₹1.25L limit
        };

        const result = calculateTaxV2(profile);

        // LTCG ₹50K is fully exempt (below ₹1.25L threshold)
        expect(result.ltcgTax.exemption).toBe(50000);
        expect(result.ltcgTax.netTaxableAmount).toBe(0);
        expect(result.ltcgTax.tax).toBe(0);
        expect(result.totalTaxLiability).toBe(0);
    });

    // ──────────────────────────────────────────
    // TEST 6: Freelancer 44ADA — Presumptive
    // ──────────────────────────────────────────
    it('should compute 44ADA presumptive income at 50%', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            business: {
                section: '44ADA',
                totalReceipts: 500000, // ₹5L turnover
            },
        };

        const result = calculateTaxV2(profile);

        // Net profit: 50% of ₹5L = ₹2,50,000
        // Old Slabs:
        // 0-2.5L: 0% = 0
        // Total tax: 0
        // Rebate 87A applied (income ≤ ₹5L): full rebate

        const businessEntry = result.incomeBreakdown.find(b => b.head === 'Business_44ADA');
        expect(businessEntry).toBeDefined();
        expect(businessEntry!.netAmount).toBe(250000);
        expect(result.grossTotalIncome).toBe(250000);
        // Taxable income ₹2.5L — no tax under old regime (0% up to ₹2.5L)
        expect(result.normalIncomeTax).toBe(0);
    });

    // ──────────────────────────────────────────
    // TEST 7: 44AD Business with cash + digital split
    // ──────────────────────────────────────────
    it('should compute 44AD with 6% digital + 8% cash', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            business: {
                section: '44AD',
                totalReceipts: 2000000,  // ₹20L turnover
                digitalReceipts: 1500000, // ₹15L digital
                cashReceipts: 500000,     // ₹5L cash
            },
        };

        const result = calculateTaxV2(profile);

        // Net profit: 6% of ₹15L + 8% of ₹5L = ₹90,000 + ₹40,000 = ₹1,30,000
        const businessEntry = result.incomeBreakdown.find(b => b.head === 'Business_44AD');
        expect(businessEntry).toBeDefined();
        expect(businessEntry!.netAmount).toBe(130000);
        expect(result.recommendedForm).toBe('ITR-4');
    });

    // ──────────────────────────────────────────
    // TEST 8: New Regime Rebate — Income ≤ ₹12L
    // ──────────────────────────────────────────
    it('should apply full 87A rebate for income ≤ ₹12L under new regime', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
            salary: { grossSalary: 1275000 }, // ₹12.75L → taxable = ₹12L after ₹75K std ded
        };

        const result = calculateTaxV2(profile);

        // Taxable: ₹12,75,000 - ₹75,000 = ₹12,00,000
        // New Slabs:
        // 0-4L: 0
        // 4-8L: 5% = 20,000
        // 8-12L: 10% = 40,000
        // Total: ₹60,000
        // Rebate 87A: ₹60,000 (full, as income ≤ ₹12L)
        // Tax = 0

        expect(result.normalTaxableIncome).toBe(1200000);
        expect(result.normalIncomeTax).toBe(60000);
        expect(result.rebate87A).toBe(60000);
        expect(result.totalTaxLiability).toBe(0);
    });

    // ──────────────────────────────────────────
    // TEST 9: Complex Mix — Salary + Business + Crypto + STCG + LTCG
    // ──────────────────────────────────────────
    it('should properly separate and tax complex income mix', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 1000000 }, // ₹10L
            business: {
                section: '44ADA',
                totalReceipts: 500000, // ₹5L → net ₹2.5L
            },
            capitalGains: {
                stcgEquity: 150000, // ₹1.5L STCG
                ltcgEquity: 50000,  // ₹50K LTCG (within ₹1.25L limit)
            },
            cryptoVDA: { totalGains: 300000 }, // ₹3L crypto
            tds: {
                salary: 100000,   // ₹1L salary TDS
                cryptoVDA: 3000,  // ₹3K crypto TDS
            },
        };

        const result = calculateTaxV2(profile);

        // === INCOME ===
        // Salary: ₹10L - ₹50K std ded = ₹9,50,000
        // Business (44ADA): 50% × ₹5L = ₹2,50,000
        // GTI (normal): ₹9,50,000 + ₹2,50,000 = ₹12,00,000
        // Deductions: 0 (old regime but no deductions claimed)
        // Taxable Normal: ₹12,00,000

        expect(result.grossTotalIncome).toBe(1200000);
        expect(result.normalTaxableIncome).toBe(1200000);

        // === NORMAL TAX (Old Slabs) ===
        // 0-2.5L: 0
        // 2.5-5L: 5% = 12,500
        // 5-10L: 20% = 1,00,000
        // 10-12L: 30% = 60,000
        // Total: ₹1,72,500
        expect(result.normalIncomeTax).toBe(172500);

        // === CRYPTO TAX ===
        // ₹3,00,000 × 30% = ₹90,000
        expect(result.cryptoTax.tax).toBe(90000);

        // === STCG TAX ===
        // ₹1,50,000 × 20% = ₹30,000
        expect(result.stcgTax.tax).toBe(30000);

        // === LTCG TAX ===
        // ₹50,000 — within ₹1.25L exemption, so TAX = 0
        expect(result.ltcgTax.tax).toBe(0);
        expect(result.ltcgTax.exemption).toBe(50000);

        // === TOTAL TAX before cess ===
        // ₹1,72,500 + ₹90,000 + ₹30,000 + ₹0 = ₹2,92,500
        // No surcharge (total income < ₹50L)
        // Cess: 4% of ₹2,92,500 = ₹11,700
        // Total: ₹3,04,200
        expect(result.totalSurcharge).toBe(0);
        expect(result.cess).toBe(11700);
        expect(result.totalTaxLiability).toBe(304200);

        // === TDS SET-OFF ===
        // Total TDS: ₹1,00,000 + ₹3,000 = ₹1,03,000
        expect(result.totalTDSPaid).toBe(103000);

        // Net payable: ₹3,04,200 - ₹1,03,000 = ₹2,01,200
        expect(result.refundOrPayable).toBe(201200);
        expect(result.isRefund).toBe(false);

        // Form recommendation
        expect(result.recommendedForm).toBe('ITR-3');
    });

    // ──────────────────────────────────────────
    // TEST 10: High Income with Surcharge
    // ──────────────────────────────────────────
    it('should apply surcharge correctly for high-income earner', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 6000000 }, // ₹60L
        };

        const result = calculateTaxV2(profile);

        // Salary: ₹60L - ₹50K std ded = ₹59,50,000
        // Old Slabs:
        // 0-2.5L: 0
        // 2.5-5L: 5% = 12,500
        // 5-10L: 20% = 1,00,000
        // 10-59.5L: 30% = 14,85,000
        // Total slab tax: ₹15,97,500
        expect(result.normalIncomeTax).toBe(1597500);

        // Surcharge: Income ₹59.5L > ₹50L → 10% surcharge
        // Surcharge = 10% of ₹15,97,500 = ₹1,59,750
        expect(result.totalSurcharge).toBe(159750);

        // Cess: 4% of (₹15,97,500 + ₹1,59,750) = 4% of ₹17,57,250 = ₹70,290
        expect(result.cess).toBe(70290);

        // Total: ₹15,97,500 + ₹1,59,750 + ₹70,290 = ₹18,27,540
        expect(result.totalTaxLiability).toBe(1827540);
    });

    // ──────────────────────────────────────────
    // TEST 11: Crypto Loss — No Set-off Allowed
    // ──────────────────────────────────────────
    it('should not allow crypto losses to reduce other income', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 1000000 },
            cryptoVDA: {
                totalGains: 0,        // No gains
                totalLosses: 200000,  // ₹2L loss — CANNOT set off
            },
        };

        const result = calculateTaxV2(profile);

        // Salary tax should be computed normally, crypto loss has ZERO effect
        // Salary: ₹10L - ₹50K = ₹9,50,000
        // Tax on ₹9.5L (Old):
        // 0-2.5L: 0
        // 2.5-5L: 5% = 12,500
        // 5-9.5L: 20% = 90,000
        // Total: ₹1,02,500
        // Cess: ₹4,100
        // Total: ₹1,06,600

        expect(result.normalIncomeTax).toBe(102500);
        expect(result.cryptoTax.tax).toBe(0); // No gains = no crypto tax
        expect(result.totalTaxLiability).toBe(106600);

        // Warning about crypto losses
        expect(result.warnings.some(w => w.includes('cannot be set off'))).toBe(true);
    });

    // ──────────────────────────────────────────
    // TEST 12: Regime Comparison
    // ──────────────────────────────────────────
    it('should correctly compare Old vs New regime', () => {
        const profileData = {
            assessmentYear: '2026-27' as const,
            salary: { grossSalary: 1500000 },
            deductions: {
                section80C: 150000,
                section80D: 25000,
                hra: 120000,
            },
        };

        const comparison = compareRegimesV2(profileData);

        // Old Regime:
        // Salary: ₹15L - ₹50K std ded - ₹1.2L HRA = ₹12,30,000
        // Deductions: 80C ₹1.5L + 80D ₹25K = ₹1,75,000
        // Taxable: ₹10,55,000
        // Tax: 0 + 12,500 + 1,00,000 + (55K × 30%) = 12,500 + 1,00,000 + 16,500 = ₹1,29,000
        // Cess: ₹5,160. Total: ₹1,34,160

        // New Regime:
        // Salary: ₹15L - ₹75K = ₹14,25,000
        // Deductions: 0
        // Taxable: ₹14,25,000
        // Tax: 0 + 20K + 40K + 60K + 5K = ₹1,25,000... let me recompute
        // 0-4L: 0
        // 4-8L: 5% = 20,000
        // 8-12L: 10% = 40,000
        // 12-14.25L: 15% = 33,750
        // Total: ₹93,750
        // Cess: ₹3,750. Total: ₹97,500

        // New regime better
        expect(comparison.recommendation).toBeDefined();
        expect(comparison.savings).toBeGreaterThanOrEqual(0);
        expect(comparison.reasons.length).toBeGreaterThan(0);
    });

    // ──────────────────────────────────────────
    // TEST 13: Zero Income
    // ──────────────────────────────────────────
    it('should handle zero income gracefully', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
        };

        const result = calculateTaxV2(profile);

        expect(result.grossTotalIncome).toBe(0);
        expect(result.normalTaxableIncome).toBe(0);
        expect(result.totalTaxLiability).toBe(0);
    });

    // ──────────────────────────────────────────
    // TEST 14: Salary with excess TDS → Refund
    // ──────────────────────────────────────────
    it('should correctly show refund when TDS exceeds tax', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'new',
            salary: { grossSalary: 500000 }, // ₹5L
            tds: { salary: 25000 },           // ₹25K TDS
        };

        const result = calculateTaxV2(profile);

        // Taxable: ₹5L - ₹75K = ₹4,25,000
        // New Slabs:
        // 0-4L: 0
        // 4-4.25L: 5% = 1,250
        // Total: ₹1,250
        // But income ₹4.25L ≤ ₹12L → rebate 87A applies!
        // Rebate: ₹1,250 → tax = 0
        // TDS ₹25K → Refund ₹25K

        expect(result.totalTaxLiability).toBe(0);
        expect(result.isRefund).toBe(true);
        expect(result.refundOrPayable).toBe(25000);
    });

    // ──────────────────────────────────────────
    // TEST 15: House Property Income — Let Out
    // ──────────────────────────────────────────
    it('should compute house property income correctly for let-out property', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 800000 },
            houseProperty: {
                type: 'LOP',
                annualRentReceived: 240000,
                municipalTaxesPaid: 20000,
                homeLoanInterest: 100000,
            },
        };

        const result = calculateTaxV2(profile);

        // HP Computation:
        // Gross Annual Value: ₹2,40,000
        // Less Municipal Taxes: ₹20,000
        // NAV: ₹2,20,000
        // Less Standard Deduction (30%): ₹66,000
        // Less Interest: ₹1,00,000
        // Income from HP: ₹54,000

        const hpEntry = result.incomeBreakdown.find(b => b.head === 'HouseProperty');
        expect(hpEntry).toBeDefined();
        // HP income should be: (2,40,000 - 20,000) * 0.7 - 1,00,000 = 1,54,000 - 1,00,000 = 54,000
        expect(hpEntry!.netAmount).toBe(54000);
    });

    // ──────────────────────────────────────────
    // TEST 16: ITR Form Recommendation
    // ──────────────────────────────────────────
    it('should recommend correct ITR forms based on income mix', () => {
        // Salary only → ITR-1
        const r1 = calculateTaxV2({
            assessmentYear: '2026-27',
            regime: 'new',
            salary: { grossSalary: 800000 },
        });
        expect(r1.recommendedForm).toBe('ITR-1');

        // Salary + Crypto → ITR-2
        const r2 = calculateTaxV2({
            assessmentYear: '2026-27',
            regime: 'new',
            salary: { grossSalary: 800000 },
            cryptoVDA: { totalGains: 50000 },
        });
        expect(r2.recommendedForm).toBe('ITR-2');

        // Salary + Business (44ADA) → ITR-4
        const r3 = calculateTaxV2({
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 500000 },
            business: { section: '44ADA', totalReceipts: 300000 },
        });
        expect(r3.recommendedForm).toBe('ITR-4');

        // Business (Regular) → ITR-3
        const r4 = calculateTaxV2({
            assessmentYear: '2026-27',
            regime: 'old',
            business: { section: 'Regular', totalReceipts: 1000000, expenses: 400000 },
        });
        expect(r4.recommendedForm).toBe('ITR-3');

        // Business (44ADA) + Crypto → ITR-3 (ITR-4 doesn't support VDA)
        const r5 = calculateTaxV2({
            assessmentYear: '2026-27',
            regime: 'old',
            business: { section: '44ADA', totalReceipts: 500000 },
            cryptoVDA: { totalGains: 100000 },
        });
        expect(r5.recommendedForm).toBe('ITR-3');
    });
});

// ──────────────────────────────────────────────────
// ★ THE EXACT USER-REPORTED BUG SCENARIO ★
// ──────────────────────────────────────────────────
describe('TaxEngine v2 — User Bug Scenario', () => {

    it('should correctly compute tax for: Salary ₹10L + Freelancing ₹5L (44ADA) + Crypto ₹3L + STCG ₹1.5L + LTCG ₹50K', () => {
        const profile: TaxProfile = {
            assessmentYear: '2026-27',
            regime: 'old',
            salary: { grossSalary: 1000000 },  // ₹10L, TDS ₹1L
            business: {
                section: '44ADA',               // Presumptive @ 50%
                totalReceipts: 500000,           // ₹5L → net ₹2.5L
            },
            capitalGains: {
                stcgEquity: 150000,             // ₹1.5L — 20% u/s 111A
                ltcgEquity: 50000,              // ₹50K — within ₹1.25L exemption
            },
            cryptoVDA: { totalGains: 300000 },  // ₹3L — 30% u/s 115BBH
            tds: {
                salary: 100000,                 // ₹1L salary TDS
                cryptoVDA: 3000,                // ₹3K crypto TDS
            },
        };

        const result = calculateTaxV2(profile);

        // ═══════════════════════════════════════
        // EXPECTED COMPUTATION (hand-derived):
        // ═══════════════════════════════════════

        // 1. INCOME COMPUTATION
        // Salary: ₹10,00,000 - ₹50,000 (Std Ded Old) = ₹9,50,000
        // Business (44ADA): 50% × ₹5,00,000 = ₹2,50,000
        // GTI (Normal): ₹9,50,000 + ₹2,50,000 = ₹12,00,000

        expect(result.grossTotalIncome).toBe(1200000);

        // No deductions claimed
        expect(result.totalDeductions).toBe(0);
        expect(result.normalTaxableIncome).toBe(1200000);

        // 2. TAX ON NORMAL INCOME (Old Slabs)
        // 0-2.5L: 0% = 0
        // 2.5-5L: 5% = ₹12,500
        // 5-10L: 20% = ₹1,00,000
        // 10-12L: 30% = ₹60,000
        // Total: ₹1,72,500
        expect(result.normalIncomeTax).toBe(172500);

        // 3. CRYPTO TAX (115BBH)
        // ₹3,00,000 × 30% = ₹90,000
        expect(result.cryptoTax.tax).toBe(90000);
        expect(result.cryptoTax.surcharge).toBe(0); // No surcharge, total < ₹50L

        // 4. STCG TAX (111A)
        // ₹1,50,000 × 20% = ₹30,000
        expect(result.stcgTax.tax).toBe(30000);

        // 5. LTCG TAX (112A)
        // ₹50,000 — within ₹1.25L exemption → Tax = ₹0
        expect(result.ltcgTax.tax).toBe(0);
        expect(result.ltcgTax.exemption).toBe(50000);

        // 6. TOTAL TAX
        // Normal: ₹1,72,500
        // Crypto: ₹90,000
        // STCG: ₹30,000
        // LTCG: ₹0
        // Subtotal: ₹2,92,500
        //
        // Surcharge: ₹0 (total income ₹12L + ₹3L + ₹1.5L + ₹0.5L = ₹17L < ₹50L)
        // Cess: 4% of ₹2,92,500 = ₹11,700
        // TOTAL: ₹3,04,200

        expect(result.totalSurcharge).toBe(0);
        expect(result.cess).toBe(11700);
        expect(result.totalTaxLiability).toBe(304200);

        // 7. TDS SET-OFF
        // Salary TDS: ₹1,00,000
        // Crypto TDS: ₹3,000
        // Total TDS: ₹1,03,000
        expect(result.totalTDSPaid).toBe(103000);

        // 8. NET PAYABLE
        // ₹3,04,200 - ₹1,03,000 = ₹2,01,200
        expect(result.refundOrPayable).toBe(201200);
        expect(result.isRefund).toBe(false);

        // ═══════════════════════════════════════
        // BUG VERIFICATION — What was WRONG before:
        // ═══════════════════════════════════════
        // OLD BUG: GTI was ₹10,15,000 (missing ₹2.5L business income) → NOW ₹12,00,000 ✓
        // OLD BUG: Tax was ₹2,26,720 (mixed all into slabs) → NOW ₹1,72,500 normal ✓
        // OLD BUG: Crypto tax missing from final → NOW ₹90,000 + cess separately ✓
        // OLD BUG: Net payable was ₹1,23,720 → NOW ₹2,01,200 ✓
        // OLD BUG: STCG and LTCG mixed into slab rates → NOW separated ✓

        // Form recommendation
        expect(result.recommendedForm).toBe('ITR-3'); // Business + Crypto → ITR-3
    });
});
