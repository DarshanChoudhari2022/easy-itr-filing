/**
 * Vercel Serverless Function — Crypto Tax Drilldown (Asset-wise P&L)
 *
 * GET /api/crypto/tax-drilldown?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns asset-wise breakdown of profits, losses, and net taxable amount.
 * Each row = one crypto asset with its aggregated gains/losses from FIFO matching.
 * Powers the "Tax Drill-Down" / "Asset P&L" screen.
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

        // ── Fetch all computation rows with lot details ──
        // Join with crypto_tax_lots to get the asset name
        const { data: comps, error: compErr } = await supabase
            .from('crypto_tax_computations')
            .select(`
                capital_gain,
                sale_consideration,
                cost_of_acquisition,
                qty_matched,
                is_unknown_lot,
                lot:crypto_tax_lots!lot_id(asset),
                sell:crypto_transactions!sell_txn_id(asset)
            `)
            .eq('user_id', userId)
            .eq('financial_year', fy);

        if (compErr) {
            return res.status(500).json({ success: false, error: `Computation fetch failed: ${compErr.message}` });
        }

        // ── Aggregate by asset ──
        const assetMap: Record<string, {
            gross_profit: number;
            gross_loss: number;
            net_taxable: number;
            total_sale: number;
            total_cost: number;
            trade_count: number;
        }> = {};

        for (const c of (comps || [])) {
            // Determine asset: prefer lot.asset (buy-side), fallback to sell.asset
            const asset = (c.lot as any)?.asset || (c.sell as any)?.asset || 'UNKNOWN';

            if (!assetMap[asset]) {
                assetMap[asset] = {
                    gross_profit: 0,
                    gross_loss: 0,
                    net_taxable: 0,
                    total_sale: 0,
                    total_cost: 0,
                    trade_count: 0,
                };
            }

            const gain = Number(c.capital_gain) || 0;
            const sale = Number(c.sale_consideration) || 0;
            const cost = Number(c.cost_of_acquisition) || 0;

            assetMap[asset].total_sale += sale;
            assetMap[asset].total_cost += cost;
            assetMap[asset].trade_count += 1;

            if (gain > 0) {
                assetMap[asset].gross_profit += gain;
                assetMap[asset].net_taxable += gain;     // Only profits are taxable
            } else {
                assetMap[asset].gross_loss += Math.abs(gain);
                // net_taxable does NOT decrease — 115BBH: losses not deducted
            }
        }

        // ── Sort by net_taxable DESC ──
        const assets = Object.entries(assetMap)
            .map(([asset, data]) => ({
                asset,
                gross_profit: round2(data.gross_profit),
                gross_loss: round2(data.gross_loss),
                net_taxable: round2(data.net_taxable),
                total_sale: round2(data.total_sale),
                total_cost: round2(data.total_cost),
                trade_count: data.trade_count,
            }))
            .sort((a, b) => b.net_taxable - a.net_taxable);

        // ── Totals ──
        const totals = {
            gross_profit: round2(assets.reduce((s, a) => s + a.gross_profit, 0)),
            gross_loss: round2(assets.reduce((s, a) => s + a.gross_loss, 0)),
            net_taxable: round2(assets.reduce((s, a) => s + a.net_taxable, 0)),
            total_sale: round2(assets.reduce((s, a) => s + a.total_sale, 0)),
            total_cost: round2(assets.reduce((s, a) => s + a.total_cost, 0)),
            trade_count: assets.reduce((s, a) => s + a.trade_count, 0),
        };

        return res.status(200).json({
            success: true,
            financial_year: fy,
            assets,
            totals,
        });
    } catch (err) {
        console.error('[Tax Drilldown API] Unhandled error:', err);
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
