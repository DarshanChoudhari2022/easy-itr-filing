/**
 * Tax Reports Generator
 * 
 * Generates downloadable tax computation statements, 
 * summary reports, and filing receipts from the filing session.
 */

import type { FilingSession } from '@/lib/filing-session';
import { computeGrossTotalIncome, computeTotalTDS, autoDetectITRForm } from '@/lib/filing-session';

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

export function generateComputationReport(session: FilingSession): TaxComputationReport {
    const grossTotal = computeGrossTotalIncome(session);
    const totalTDS = computeTotalTDS(session);
    const { form } = autoDetectITRForm(session);

    // Income breakdown
    const incomeBreakdown: { head: string; amount: number }[] = [];
    if (session.salary.enabled) incomeBreakdown.push({ head: 'Income from Salary', amount: session.salary.netTaxable || session.salary.grossSalary - session.salary.standardDeduction });
    if (session.houseProperty.enabled) incomeBreakdown.push({ head: 'Income from House Property', amount: session.houseProperty.netIncome });
    if (session.business.enabled) incomeBreakdown.push({ head: 'Profits & Gains from Business', amount: session.business.netProfit });
    if (session.capitalGains.enabled) incomeBreakdown.push({ head: 'Capital Gains (Equity/Other)', amount: session.capitalGains.totalCapitalGains });
    if (session.cryptoVDA.enabled) incomeBreakdown.push({ head: 'Income from VDA/Crypto (§115BBH)', amount: session.cryptoVDA.taxableGains });
    if (session.otherSources.enabled) {
        const otherTotal = session.otherSources.savingsInterest + session.otherSources.fdInterest + session.otherSources.dividendIncome + session.otherSources.otherIncome;
        incomeBreakdown.push({ head: 'Income from Other Sources', amount: otherTotal });
    }
    if (session.foreignAssets.enabled) incomeBreakdown.push({ head: 'Foreign Income', amount: session.foreignAssets.foreignIncome });

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
    const totalDed = deductions.reduce((s, x) => s + x.amount, 0);

    // Tax calculation (simplified)
    const taxableIncome = Math.max(0, grossTotal - (session.regime === 'new' ? 75000 : totalDed));
    const isNew = session.regime === 'new';
    let taxOnIncome = 0;
    if (isNew) {
        const slabs: [number, number, number][] = [[0, 400000, 0], [400000, 800000, 5], [800000, 1200000, 10], [1200000, 1600000, 15], [1600000, 2000000, 20], [2000000, 2400000, 25], [2400000, Infinity, 30]];
        for (const [min, max, rate] of slabs) { if (taxableIncome > min) taxOnIncome += (Math.min(taxableIncome, max) - min) * rate / 100; }
        if (taxableIncome <= 1200000) taxOnIncome = 0;
    } else {
        const slabs: [number, number, number][] = [[0, 250000, 0], [250000, 500000, 5], [500000, 1000000, 20], [1000000, Infinity, 30]];
        for (const [min, max, rate] of slabs) { if (taxableIncome > min) taxOnIncome += (Math.min(taxableIncome, max) - min) * rate / 100; }
        if (taxableIncome <= 500000) taxOnIncome = 0;
    }
    // VDA tax at flat 30%
    const vdaTax = session.cryptoVDA.enabled ? session.cryptoVDA.taxableGains * 0.30 : 0;
    taxOnIncome += vdaTax;

    const surcharge = 0; // Simplified
    const cess = Math.round(taxOnIncome * 0.04);
    const totalTax = Math.round(taxOnIncome + surcharge + cess);
    const netPayable = totalTax - totalTDS;

    // TDS breakdown
    const tdsBreakdown: { source: string; amount: number }[] = [];
    if (session.salary.tdsSalary > 0) tdsBreakdown.push({ source: 'TDS on Salary', amount: session.salary.tdsSalary });
    if (session.cryptoVDA.tdsCredit > 0) tdsBreakdown.push({ source: 'TDS on Crypto/VDA (§194S)', amount: session.cryptoVDA.tdsCredit });
    if (session.otherSources.tdsInterest > 0) tdsBreakdown.push({ source: 'TDS on Interest', amount: session.otherSources.tdsInterest });
    if (session.business.tdsPayments > 0) tdsBreakdown.push({ source: 'TDS on Professional', amount: session.business.tdsPayments });

    return {
        personalInfo: { pan: session.personalInfo.pan || 'N/A', name: `${session.personalInfo.firstName || ''} ${session.personalInfo.lastName || ''}`.trim() || 'N/A', ay: session.assessmentYear, fy: session.financialYear, regime: session.regime === 'old' ? 'Old Regime' : 'New Regime', itrForm: form },
        incomeBreakdown, grossTotal, deductions, totalDeductions: totalDed,
        taxableIncome, taxOnIncome: Math.round(taxOnIncome), surcharge, cess,
        totalTax, tdsBreakdown, totalTDS, netPayable, isRefund: netPayable < 0,
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
<p style="text-align:center;margin-top:20px;font-size:11px;color:#999">Generated by TaxMitra on ${new Date().toLocaleDateString('en-IN')}</p>
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
