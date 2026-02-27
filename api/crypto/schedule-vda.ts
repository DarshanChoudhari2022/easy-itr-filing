/**
 * Vercel Serverless Function — ITR Schedule VDA
 *
 * GET /api/crypto/schedule-vda?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns one row per FIFO lot match, formatted for ITR Schedule VDA.
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
        if (!auth) return;

        const fy = parseFY(req, res);
        if (!fy) return;

        const { userId, supabase } = auth;

        const { data: lots, error } = await supabase
            .from('crypto_tax_lots')
            .select('*')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .order('sell_date', { ascending: true });

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        const rows = (lots || []).map((lot, i) => ({
            sl_no: i + 1,
            asset: lot.asset,
            description: `${parseFloat(lot.qty_matched).toFixed(8)} ${lot.asset}`,
            date_of_acquisition: lot.buy_date ? lot.buy_date.split('T')[0] : 'N/A',
            date_of_transfer: lot.sell_date.split('T')[0],
            head_of_income: 'Capital Gains',
            cost_of_acquisition: round2(Number(lot.cost_inr)),
            sale_consideration: round2(Number(lot.proceeds_inr)),
            income_from_transfer: round2(Number(lot.gain_inr)),
            taxable_income: round2(Number(lot.taxable_gain_inr)),
        }));

        return res.status(200).json({
            success: true,
            financial_year: fy,
            rows,
            total_rows: rows.length,
            totals: {
                sale_consideration: round2(rows.reduce((s, r) => s + r.sale_consideration, 0)),
                cost_of_acquisition: round2(rows.reduce((s, r) => s + r.cost_of_acquisition, 0)),
                taxable_income: round2(rows.reduce((s, r) => s + r.taxable_income, 0)),
            },
        });
    } catch (err) {
        console.error('[Schedule VDA API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
