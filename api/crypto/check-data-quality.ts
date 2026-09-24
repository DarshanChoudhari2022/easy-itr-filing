/**
 * Vercel Serverless Function — Data Quality Check
 *
 * GET /api/crypto/check-data-quality?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Shows the user what data gaps exist BEFORE they compute tax.
 * Replaces the need for hardcoded fixes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCORS, authenticate, parseFY } from './_shared.js';

interface Warning {
    severity: 'critical' | 'high' | 'medium' | 'low';
    code: string;
    message: string;
    affected_assets?: string[];
    asset?: string;
    fix: string;
}

interface Info {
    code: string;
    message: string;
}

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

        const warnings: Warning[] = [];
        const info: Info[] = [];

        // ── Check 1: Corrupt buy prices (price ≈ ₹1.00) ──
        const { data: corruptBuys } = await supabase
            .from('crypto_trades')
            .select('asset, price_per_unit, quantity, value_inr')
            .eq('user_id', userId)
            .eq('type', 'buy')
            .gte('price_per_unit', 0.99)
            .lte('price_per_unit', 1.01);

        if (corruptBuys && corruptBuys.length > 0) {
            const assets = [...new Set(corruptBuys.map(r => r.asset))];
            warnings.push({
                severity: 'critical',
                code: 'CORRUPT_BUY_PRICES',
                message: `${corruptBuys.length} buy rows have price_per_unit ≈ ₹1.00 — quantity stored as price (corrupt data from API sync).`,
                affected_assets: assets,
                fix: 'Delete all crypto_trades rows and re-import using the Order History CSV from CoinDCX Reports. Do NOT import via API.'
            });
        }

        // ── Check 2: Sell quantity exceeds buy quantity per asset ──
        const { data: allTrades } = await supabase
            .from('crypto_trades')
            .select('asset, type, quantity')
            .eq('user_id', userId);

        const totals: Record<string, { bought: number; sold: number }> = {};
        for (const t of (allTrades || [])) {
            if (!totals[t.asset]) totals[t.asset] = { bought: 0, sold: 0 };
            totals[t.asset][t.type === 'buy' ? 'bought' : 'sold'] += Number(t.quantity);
        }

        for (const [asset, q] of Object.entries(totals)) {
            if (q.sold > q.bought * 1.001) {
                warnings.push({
                    severity: 'high',
                    code: 'MISSING_BUY_LOTS',
                    message: `${asset}: sold ${q.sold.toFixed(4)} but only ${q.bought.toFixed(4)} in buy history. Shortfall: ${(q.sold - q.bought).toFixed(4)} ${asset}.`,
                    asset,
                    fix: `Upload the ALL-TIME Order History CSV from CoinDCX. The missing ${asset} buys are from an earlier year.`
                });
            }
        }

        // ── Check 3: Unmatched sells (no buy_trade_id in lots) ──
        const { data: fyLots } = await supabase
            .from('crypto_tax_lots')
            .select('asset, buy_trade_id')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .is('buy_trade_id', null);

        if (fyLots && fyLots.length > 0) {
            const assets = [...new Set(fyLots.map(r => r.asset))];
            warnings.push({
                severity: 'high',
                code: 'UNMATCHED_SELLS',
                message: `${fyLots.length} FIFO lot rows have no buy match — cost basis is ₹0 for these.`,
                affected_assets: assets,
                fix: 'Upload historical buy data (All-Time Order History). Then re-run Calculate Tax.'
            });
        }

        // ── Check 4: No sell data for this FY ──
        const { count: sellCount } = await supabase
            .from('crypto_trades')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'sell')
            .eq('financial_year', fy);

        if (!sellCount || sellCount === 0) {
            info.push({
                code: 'NO_SELL_DATA',
                message: `No sell trades found for ${fy}. Upload Order History CSV first.`,
            });
        }

        // ── Check 5: No buy data at all ──
        const { count: buyCount } = await supabase
            .from('crypto_trades')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'buy');

        if (!buyCount || buyCount === 0) {
            info.push({
                code: 'NO_BUY_DATA',
                message: 'No buy trades found at all. Upload All-Time Order History CSV to provide cost basis for tax computation.',
            });
        }

        // ── Check 6: TDS data ──
        const { data: tdsRows } = await supabase
            .from('crypto_trades')
            .select('tds_inr')
            .eq('user_id', userId)
            .eq('type', 'sell')
            .eq('financial_year', fy)
            .gt('tds_inr', 0);

        if (!tdsRows || tdsRows.length === 0) {
            info.push({
                code: 'NO_TDS_DATA',
                message: 'No TDS data found for sell trades. Upload TDS Certificate CSV to claim TDS credit.',
            });
        }

        // Score
        const score = Math.max(0,
            100
            - warnings.filter(w => w.severity === 'critical').length * 40
            - warnings.filter(w => w.severity === 'high').length * 20
            - warnings.filter(w => w.severity === 'medium').length * 10
        );

        return res.status(200).json({
            success: true,
            data_quality_score: score,
            status: warnings.length === 0 ? 'clean' : score < 60 ? 'critical' : 'warnings',
            warnings,
            info,
            recommendation: warnings.length === 0
                ? 'Data looks good. You can safely run Calculate Tax.'
                : 'Fix warnings above before computing tax for accurate results.',
        });
    } catch (err) {
        console.error('[Data Quality API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}
