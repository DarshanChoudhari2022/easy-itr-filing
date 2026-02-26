/**
 * Vercel Serverless Function — Crypto Tax Overview
 *
 * GET /api/crypto/overview?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns the tax computation summary from the last compute-tax run.
 * Powers the main Overview / Dashboard screen.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCORS, authenticate, parseFY } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const auth = await authenticate(req, res);
        if (!auth) return; // 401 already sent

        const fy = parseFY(req, res);
        if (!fy) return; // 400 already sent

        const { userId, supabase } = auth;

        // ── 1. Aggregate tax computation rows ──
        const { data: comps, error: compErr } = await supabase
            .from('crypto_tax_computations')
            .select('sale_consideration, cost_of_acquisition, capital_gain, tds_attributed, is_unknown_lot')
            .eq('user_id', userId)
            .eq('financial_year', fy);

        if (compErr) {
            return res.status(500).json({ success: false, error: `Computation fetch failed: ${compErr.message}` });
        }

        const rows = comps || [];

        let saleConsideration = 0;
        let costOfAcquisition = 0;
        let taxableCapitalGains = 0;
        let grossLosses = 0;

        for (const c of rows) {
            saleConsideration += Number(c.sale_consideration) || 0;
            costOfAcquisition += Number(c.cost_of_acquisition) || 0;
            const gain = Number(c.capital_gain) || 0;
            if (gain > 0) {
                taxableCapitalGains += gain;
            } else {
                grossLosses += Math.abs(gain);
            }
        }

        // ── 2. Other Income from crypto_income table ──
        const { data: incomeRows, error: incErr } = await supabase
            .from('crypto_income')
            .select('income_type, value_inr')
            .eq('user_id', userId)
            .eq('financial_year', fy);

        let otherIncome = 0;
        const otherIncomeBreakdown: Record<string, number> = {};

        if (!incErr && incomeRows) {
            for (const r of incomeRows) {
                const val = Number(r.value_inr) || 0;
                otherIncome += val;
                const type = r.income_type || 'other';
                otherIncomeBreakdown[type] = (otherIncomeBreakdown[type] || 0) + val;
            }
        }

        // ── 3. TDS Credit ──
        const { data: tdsTxns } = await supabase
            .from('crypto_transactions')
            .select('tds_inr')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .in('txn_type', ['TDS', 'SELL'])
            .gt('tds_inr', 0);

        let tdsCredit = 0;
        if (tdsTxns) {
            tdsCredit = tdsTxns.reduce((s, t) => s + (Number(t.tds_inr) || 0), 0);
        }

        // ── 4. TDS by exchange (from sell transactions) ──
        const { data: sellTxns } = await supabase
            .from('crypto_transactions')
            .select('source, tds_inr, total_inr')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .eq('txn_type', 'SELL');

        const tdsByExchange: Record<string, { tds_deducted: number; total_sale_value: number }> = {};
        if (sellTxns) {
            for (const t of sellTxns) {
                const exchange = t.source?.replace('_CSV', '') || 'CoinDCX';
                if (!tdsByExchange[exchange]) {
                    tdsByExchange[exchange] = { tds_deducted: 0, total_sale_value: 0 };
                }
                tdsByExchange[exchange].tds_deducted += Number(t.tds_inr) || 0;
                tdsByExchange[exchange].total_sale_value += Number(t.total_inr) || 0;
            }
        }

        // ── 5. Tax Calculation ──
        const totalTaxable = taxableCapitalGains + otherIncome;
        const grossTax = round2(totalTaxable * 0.30);
        const cess = round2(grossTax * 0.04);
        const totalTax = round2(grossTax + cess);
        const netPayable = round2(Math.max(totalTax - tdsCredit, 0));

        return res.status(200).json({
            success: true,
            financial_year: fy,
            capital_gain_trades: rows.length,
            sale_consideration: round2(saleConsideration),
            cost_of_acquisition: round2(costOfAcquisition),
            taxable_capital_gains: round2(taxableCapitalGains),
            gross_losses: round2(grossLosses),
            other_income: round2(otherIncome),
            other_income_breakdown: Object.fromEntries(
                Object.entries(otherIncomeBreakdown).map(([k, v]) => [k, round2(v)])
            ),
            tds_credit: round2(tdsCredit),
            gross_tax: grossTax,
            cess,
            total_tax: totalTax,
            net_payable: netPayable,
            tds_refund_eligible: round2(Math.max(tdsCredit - totalTax, 0)),
            tds_by_exchange: Object.entries(tdsByExchange).map(([exchange, data]) => ({
                exchange,
                tds_deducted: round2(data.tds_deducted),
                total_sale_value: round2(data.total_sale_value),
            })),
        });
    } catch (err) {
        console.error('[Overview API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
