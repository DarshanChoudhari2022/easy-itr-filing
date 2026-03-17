/**
 * Tax Reports Generator
 * 
 * Generates downloadable tax computation statements, 
 * summary reports, and filing receipts from the filing session.
 * 
 * Uses the unified taxEngine.ts for ALL tax computations.
 */

import type { FilingSession } from '@/lib/filing-session';
import { computeGrossTotalIncome, computeTotalTDS, autoDetectITRForm } from '@/lib/filing-session';
import { computeTax, type TaxResult, type TaxInput } from '@/lib/taxEngine';

export interface TaxComputationReport {
    personalInfo: { pan: string; name: string; ay: string; fy: string; regime: string; itrForm: string };
    incomeBreakdown: { head: string; amount: number }[];
    grossTotal: number;
    deductions: { section: string; amount: number }[];
    totalDeductions: number;
    taxableIncome: number;
    taxOnIncome: number;
    surcharge: number;
    cess: number;
    totalTax: number;
    tdsBreakdown: { source: string; amount: number }[];
    totalTDS: number;
    netPayable: number;
    isRefund: boolean;
}

/**
 * Build a TaxInput from a FilingSession for the engine
 */
function sessionToTaxInput(session: FilingSession, regime: 'old' | 'new'): TaxInput {
    return {
        regime,
        salary: session.salary.enabled ? {
            gross: session.salary.grossSalary,
            exemptAllowances: session.salary.exemptAllowances,
            professionalTax: session.salary.professionalTax,
        } : undefined,
        houseProperty: session.houseProperty.enabled ? {
            type: session.houseProperty.propertyType === 'self_occupied' ? 'self_occupied' : 'let_out',
            annualRent: session.houseProperty.annualRent,
            municipalTax: session.houseProperty.municipalTax,
            homeLoanInterest: session.houseProperty.homeLoanInterest,
        } : undefined,
        business: session.business.enabled ? {
            section: session.business.section as '44AD' | '44ADA' | 'regular',
            grossReceipts: session.business.grossReceipts,
            expenses: session.business.expenses,
            netProfit: session.business.netProfit,
        } : undefined,
        capitalGains: session.capitalGains.enabled ? {
            stcgEquity: session.capitalGains.stcgEquity,
            stcgOther: session.capitalGains.stcgOther,
            ltcgEquity: session.capitalGains.ltcgEquity,
            ltcgOther: session.capitalGains.ltcgOther,
        } : undefined,
        cryptoVDA: session.cryptoVDA.enabled ? {
            totalGains: session.cryptoVDA.taxableGains,
        } : undefined,
        otherSources: session.otherSources.enabled ? {
            savingsInterest: session.otherSources.savingsInterest,
            fdInterest: session.otherSources.fdInterest,
            dividendIncome: session.otherSources.dividendIncome,
            otherIncome: session.otherSources.otherIncome,
        } : undefined,
        deductions: {
            section80C: session.deductions.section80C,
            section80CCC: session.deductions.section80CCC,
            section80CCD1: session.deductions.section80CCD1,
            section80CCD1B: session.deductions.section80CCD1B,
            section80CCD2: session.deductions.section80CCD2,
            section80D: session.deductions.section80D,
            section80DD: session.deductions.section80DD,
            section80DDB: session.deductions.section80DDB,
            section80E: session.deductions.section80E,
            section80EE: session.deductions.section80EE,
            section80EEA: session.deductions.section80EEA,
            section80EEB: session.deductions.section80EEB,
            section80G: session.deductions.section80G,
            section80GG: session.deductions.section80GG,
            section80TTA: session.deductions.section80TTA,
            section80TTB: session.deductions.section80TTB,
            section80U: session.deductions.section80U,
            hra: session.deductions.hra,
            lta: session.deductions.lta,
            homeLoanInterest: session.deductions.homeLoanInterest,
        },
        tdsSalary: session.salary.tdsSalary,
        tdsCrypto: session.cryptoVDA.tdsCredit,
        tdsInterest: session.otherSources.tdsInterest,
        tdsDividend: session.otherSources.tdsDividend,
        advanceTax: session.taxesPaid.advanceTax,
        selfAssessmentTax: session.taxesPaid.selfAssessmentTax,
    };
}

export function generateComputationReport(session: FilingSession): TaxComputationReport {
    const regime = session.regime === 'old' ? 'old' : 'new';
    const taxInput = sessionToTaxInput(session, regime);
    const result = computeTax(taxInput);
    const { form } = autoDetectITRForm(session);

    // Income breakdown
    const incomeBreakdown: { head: string; amount: number }[] = [];
    if (session.salary.enabled) incomeBreakdown.push({ head: 'Income from Salary', amount: result.netSalaryIncome });
    if (session.houseProperty.enabled) incomeBreakdown.push({ head: 'Income from House Property', amount: result.housePropertyIncome });
    if (session.business.enabled) incomeBreakdown.push({ head: 'Profits & Gains from Business', amount: result.businessIncome });
    if (session.capitalGains.enabled) {
        const capGainsTotal = (session.capitalGains.stcgEquity || 0) + (session.capitalGains.ltcgEquity || 0) +
            (session.capitalGains.stcgOther || 0) + (session.capitalGains.ltcgOther || 0);
        if (capGainsTotal > 0) incomeBreakdown.push({ head: 'Capital Gains', amount: capGainsTotal });
    }
    if (session.cryptoVDA.enabled && session.cryptoVDA.taxableGains > 0) {
        incomeBreakdown.push({ head: 'Income from VDA/Crypto (§115BBH)', amount: session.cryptoVDA.taxableGains });
    }
    if (session.otherSources.enabled) {
        const otherTotal = session.otherSources.savingsInterest + session.otherSources.fdInterest +
            session.otherSources.dividendIncome + session.otherSources.otherIncome;
        if (otherTotal > 0) incomeBreakdown.push({ head: 'Income from Other Sources', amount: otherTotal });
    }
    if (session.foreignAssets.enabled) incomeBreakdown.push({ head: 'Foreign Income', amount: session.foreignAssets.foreignIncome });

    const grossTotal = incomeBreakdown.reduce((s, i) => s + i.amount, 0);

    // Deductions
    const deductions: { section: string; amount: number }[] = [];
    const d = session.deductions;
    if (d.section80C > 0) deductions.push({ section: '80C (PPF, ELSS, LIC, EPF)', amount: Math.min(d.section80C, 150000) });
    if (d.section80D > 0) deductions.push({ section: '80D (Health Insurance)', amount: d.section80D });
    if (d.section80CCD1B > 0) deductions.push({ section: '80CCD(1B) (NPS)', amount: Math.min(d.section80CCD1B, 50000) });
    if (d.section80E > 0) deductions.push({ section: '80E (Education Loan)', amount: d.section80E });
    if (d.section80G > 0) deductions.push({ section: '80G (Donations)', amount: d.section80G });
    if (d.section80TTA > 0) deductions.push({ section: '80TTA (Savings Interest)', amount: Math.min(d.section80TTA, 10000) });
    if (d.homeLoanInterest > 0) deductions.push({ section: '24(b) (Home Loan Interest)', amount: Math.min(d.homeLoanInterest, 200000) });

    // TDS breakdown
    const tdsBreakdown: { source: string; amount: number }[] = [];
    if (session.salary.tdsSalary > 0) tdsBreakdown.push({ source: 'TDS on Salary', amount: session.salary.tdsSalary });
    if (session.cryptoVDA.tdsCredit > 0) tdsBreakdown.push({ source: 'TDS on Crypto/VDA (§194S)', amount: session.cryptoVDA.tdsCredit });
    if (session.otherSources.tdsInterest > 0) tdsBreakdown.push({ source: 'TDS on Interest', amount: session.otherSources.tdsInterest });
    if (session.business.tdsPayments > 0) tdsBreakdown.push({ source: 'TDS on Professional', amount: session.business.tdsPayments });
    if (session.taxesPaid.advanceTax > 0) tdsBreakdown.push({ source: 'Advance Tax', amount: session.taxesPaid.advanceTax });

    return {
        personalInfo: {
            pan: session.personalInfo.pan || 'N/A',
            name: `${session.personalInfo.firstName || ''} ${session.personalInfo.lastName || ''}`.trim() || 'N/A',
            ay: session.assessmentYear,
            fy: session.financialYear,
            regime: session.regime === 'old' ? 'Old Regime' : 'New Regime',
            itrForm: form,
        },
        incomeBreakdown,
        grossTotal,
        deductions,
        totalDeductions: result.totalDeductions,
        taxableIncome: result.taxableIncome,
        taxOnIncome: result.slabTax + result.cryptoVDA.tax + result.stcg111A.tax + result.ltcg112A.tax + result.ltcgOther.tax,
        surcharge: result.surcharge,
        cess: result.cess,
        totalTax: result.totalTaxLiability,
        tdsBreakdown,
        totalTDS: result.totalTDSPaid,
        netPayable: result.netPayable,
        isRefund: result.isRefund,
    };
}

/**
 * Download Tax Computation Statement as HTML
 */
export function downloadComputationStatement(session: FilingSession): void {
    const r = generateComputationReport(session);
    const rows = (items: { head?: string; section?: string; source?: string; amount: number }[], labelKey: string) =>
        items.map(i => `<tr><td>${(i as any)[labelKey]}</td><td class="amt">₹${i.amount.toLocaleString('en-IN')}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Tax Computation — ${r.personalInfo.pan}</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#222}
h1{color:#1a237e;font-size:18px;text-align:center;border-bottom:2px solid #1a237e;padding-bottom:8px}
h2{font-size:14px;color:#333;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin:6px 0}
td{padding:5px 10px;font-size:13px;border-bottom:1px solid #eee}
.amt{text-align:right;font-family:monospace;white-space:nowrap}
.total{font-weight:bold;background:#f0f0f0;border-top:2px solid #999}
.highlight{background:#e8f5e9;font-weight:bold}
.refund{color:#2e7d32}.due{color:#c62828}
.info{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
@media print{body{padding:0}}
</style></head><body>
<h1>INCOME TAX COMPUTATION STATEMENT</h1>
<div class="info"><span><b>PAN:</b> ${r.personalInfo.pan}</span><span><b>Name:</b> ${r.personalInfo.name}</span></div>
<div class="info"><span><b>AY:</b> ${r.personalInfo.ay}</span><span><b>FY:</b> ${r.personalInfo.fy}</span></div>
<div class="info"><span><b>ITR Form:</b> ${r.personalInfo.itrForm}</span><span><b>Regime:</b> ${r.personalInfo.regime}</span></div>
<h2>A. Income from All Heads</h2>
<table>${rows(r.incomeBreakdown, 'head')}
<tr class="total"><td>Gross Total Income</td><td class="amt">₹${r.grossTotal.toLocaleString('en-IN')}</td></tr></table>
<h2>B. Deductions under Chapter VI-A</h2>
<table>${r.deductions.length > 0 ? rows(r.deductions, 'section') : '<tr><td colspan="2" style="text-align:center;color:#999">No deductions claimed (New Regime)</td></tr>'}
<tr class="total"><td>Total Deductions</td><td class="amt">₹${r.totalDeductions.toLocaleString('en-IN')}</td></tr></table>
<h2>C. Tax Computation</h2>
<table>
<tr><td>Taxable Income</td><td class="amt">₹${r.taxableIncome.toLocaleString('en-IN')}</td></tr>
<tr><td>Tax on Income</td><td class="amt">₹${r.taxOnIncome.toLocaleString('en-IN')}</td></tr>
<tr><td>Surcharge</td><td class="amt">₹${r.surcharge.toLocaleString('en-IN')}</td></tr>
<tr><td>Health & Education Cess (4%)</td><td class="amt">₹${r.cess.toLocaleString('en-IN')}</td></tr>
<tr class="total"><td>Total Tax Liability</td><td class="amt">₹${r.totalTax.toLocaleString('en-IN')}</td></tr></table>
<h2>D. Taxes Paid (TDS / Advance Tax)</h2>
<table>${rows(r.tdsBreakdown, 'source')}
<tr class="total"><td>Total Taxes Paid</td><td class="amt">₹${r.totalTDS.toLocaleString('en-IN')}</td></tr></table>
<h2>E. Tax Payable / Refund</h2>
<table><tr class="highlight ${r.isRefund ? 'refund' : 'due'}">
<td>${r.isRefund ? '🟢 Refund Due' : '🔴 Tax Payable'}</td>
<td class="amt">₹${Math.abs(r.netPayable).toLocaleString('en-IN')}</td>
</tr></table>
<p style="text-align:center;margin-top:20px;font-size:11px;color:#999">Generated by EasyITR on ${new Date().toLocaleDateString('en-IN')}</p>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tax_Computation_${r.personalInfo.pan}_${r.personalInfo.ay.replace(/\s/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

