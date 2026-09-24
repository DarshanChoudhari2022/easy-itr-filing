/**
 * Vercel Serverless Function — Asset-wise P&L
 *
 * GET /api/crypto/tax-drilldown?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns asset-wise profit/loss table — computed from crypto_tax_lots.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCORS, authenticate, parseFY } from './_shared.js';

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
            .select('asset, gain_inr, taxable_gain_inr, proceeds_inr, cost_inr, qty_matched, buy_date, sell_date')
            .eq('user_id', userId)
            .eq('financial_year', fy);

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        const byAsset: Record<string, {
            asset: string;
            sale: number;
            cost: number;
            profit: number;
            loss: number;
            net_taxable: number;
            num_lots: number;
        }> = {};

        for (const lot of (lots || [])) {
            const asset = lot.asset;
            if (!byAsset[asset]) {
                byAsset[asset] = { asset, sale: 0, cost: 0, profit: 0, loss: 0, net_taxable: 0, num_lots: 0 };
            }
            const g = Number(lot.gain_inr);
            byAsset[asset].sale += Number(lot.proceeds_inr);
            byAsset[asset].cost += Number(lot.cost_inr);
            byAsset[asset].net_taxable += Number(lot.taxable_gain_inr);
            byAsset[asset].num_lots += 1;
            if (g > 0) byAsset[asset].profit += g;
            else byAsset[asset].loss += Math.abs(g);
        }

        const result = Object.values(byAsset)
            .map(a => ({
                ...a,
                sale: round2(a.sale),
                cost: round2(a.cost),
                profit: round2(a.profit),
                loss: round2(a.loss),
                net_taxable: round2(a.net_taxable),
            }))
            .sort((a, b) => b.net_taxable - a.net_taxable);

        return res.status(200).json({
            success: true,
            financial_year: fy,
            assets: result,
            totals: {
                sale: round2(result.reduce((s, a) => s + a.sale, 0)),
                cost: round2(result.reduce((s, a) => s + a.cost, 0)),
                profit: round2(result.reduce((s, a) => s + a.profit, 0)),
                loss: round2(result.reduce((s, a) => s + a.loss, 0)),
                net_taxable: round2(result.reduce((s, a) => s + a.net_taxable, 0)),
            },
        });
    } catch (err) {
        console.error('[Tax Drilldown API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
