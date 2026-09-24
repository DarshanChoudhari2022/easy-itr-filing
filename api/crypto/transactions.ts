/**
 * Vercel Serverless Function — Paginated Transaction Ledger
 *
 * GET /api/crypto/transactions?fy=FY2024-25&type=all&asset=&page=1&limit=50
 *   Auth: Bearer JWT
 *
 * Returns paginated transactions from crypto_trades.
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

        const typeFilter = ((req.query.type as string) || 'all').toLowerCase();
        const assetFilter = ((req.query.asset as string) || '').toUpperCase();
        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
        const offset = (page - 1) * limit;

        // ── Trades from crypto_trades ──
        let query = supabase
            .from('crypto_trades')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .order('trade_date', { ascending: false });

        if (typeFilter && typeFilter !== 'all') {
            query = query.eq('type', typeFilter);
        }
        if (assetFilter) {
            query = query.eq('asset', assetFilter);
        }

        const { data: trades, count, error } = await query.range(offset, offset + limit - 1);

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        // ── Also fetch income events if type=all or type=staking/reward ──
        let incomeRows: any[] = [];
        if (typeFilter === 'all' || typeFilter === 'staking' || typeFilter === 'reward' || typeFilter === 'airdrop') {
            let incQuery = supabase
                .from('crypto_income_events')
                .select('*')
                .eq('user_id', userId)
                .eq('financial_year', fy)
                .order('event_date', { ascending: false });

            if (typeFilter === 'staking') incQuery = incQuery.eq('income_type', 'staking');
            else if (typeFilter === 'reward') incQuery = incQuery.eq('income_type', 'reward');
            else if (typeFilter === 'airdrop') incQuery = incQuery.eq('income_type', 'airdrop');

            if (assetFilter) incQuery = incQuery.eq('asset', assetFilter);

            const { data: incData } = await incQuery;
            incomeRows = (incData || []).map(r => ({
                id: r.id,
                type: r.income_type,
                asset: r.asset,
                quantity: Number(r.quantity) || 0,
                price_per_unit: 0,
                value_inr: Number(r.value_inr) || 0,
                fee_inr: 0,
                tds_inr: 0,
                trade_date: r.event_date,
                financial_year: r.financial_year,
                exchange: r.exchange,
                csv_source: r.csv_source,
                category: 'income',
            }));
        }

        // Format trade rows
        const tradeRows = (trades || []).map(t => ({
            ...t,
            quantity: Number(t.quantity),
            price_per_unit: Number(t.price_per_unit),
            value_inr: Number(t.value_inr),
            fee_inr: Number(t.fee_inr),
            tds_inr: Number(t.tds_inr),
            category: 'trade',
        }));

        // Merge and sort
        const allRows = [...tradeRows, ...incomeRows]
            .sort((a, b) => new Date(b.trade_date || b.event_date).getTime() - new Date(a.trade_date || a.event_date).getTime());

        const totalCount = (count || 0) + incomeRows.length;

        return res.status(200).json({
            success: true,
            financial_year: fy,
            transactions: typeFilter === 'all' ? allRows.slice(0, limit) : allRows,
            total: totalCount,
            page,
            limit,
            total_pages: Math.ceil(totalCount / limit),
        });
    } catch (err) {
        console.error('[Transactions API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}
