/**
 * Vercel Serverless Function — Unified Transaction Ledger
 *
 * GET /api/crypto/transactions?fy=FY2024-25&type=&asset=&page=1&limit=50
 *   Auth: Bearer JWT
 *
 * Returns a paginated, unified transaction ledger combining:
 *   - crypto_transactions (buy, sell, deposit, withdrawal)
 *   - crypto_income (staking, reward, airdrop)
 *
 * Filters:
 *   type:  "buy" | "sell" | "staking" | "reward" | "all" (default: "all")
 *   asset: filter by coin symbol (e.g. "BTC", "ADA")
 *   page:  1-based page number (default: 1)
 *   limit: rows per page (default: 50, max: 200)
 *
 * Response includes total_count for pagination controls.
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

        // ── Parse query params ──
        const typeFilter = ((req.query.type as string) || 'all').toLowerCase();
        const assetFilter = ((req.query.asset as string) || '').toUpperCase();
        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
        const offset = (page - 1) * limit;

        // ── Map type filter to txn_types ──
        const txnTypes: string[] = [];
        const includeIncome = typeFilter === 'all' || typeFilter === 'staking' || typeFilter === 'reward';
        const includeTrades = typeFilter === 'all' || typeFilter === 'buy' || typeFilter === 'sell';

        if (typeFilter === 'buy') txnTypes.push('BUY');
        else if (typeFilter === 'sell') txnTypes.push('SELL');
        else if (typeFilter === 'settlement') txnTypes.push('TDS');
        else if (typeFilter !== 'staking' && typeFilter !== 'reward') {
            txnTypes.push('BUY', 'SELL', 'TDS', 'DEPOSIT', 'WITHDRAWAL', 'REWARD');
        }

        // ── Fetch transactions ──
        const transactions: UnifiedRow[] = [];
        let totalCount = 0;

        if (includeTrades && txnTypes.length > 0) {
            let query = supabase
                .from('crypto_transactions')
                .select('id, source, txn_type, asset, quantity, price_inr, total_inr, fee_inr, tds_inr, timestamp, financial_year, pair', { count: 'exact' })
                .eq('user_id', userId)
                .eq('financial_year', fy)
                .in('txn_type', txnTypes)
                .order('timestamp', { ascending: false });

            if (assetFilter) {
                query = query.eq('asset', assetFilter);
            }

            const { data: txns, count, error: txnErr } = await query
                .range(offset, offset + limit - 1);

            if (txnErr) {
                return res.status(500).json({ success: false, error: `Transaction fetch failed: ${txnErr.message}` });
            }

            totalCount += count || 0;

            for (const t of (txns || [])) {
                transactions.push({
                    id: t.id,
                    type: (t.txn_type as string).toLowerCase(),
                    asset: t.asset,
                    quantity: Number(t.quantity) || 0,
                    price_inr: Number(t.price_inr) || 0,
                    value_inr: Number(t.total_inr) || 0,
                    fee_inr: Number(t.fee_inr) || 0,
                    tds_inr: Number(t.tds_inr) || 0,
                    timestamp: t.timestamp,
                    source: t.source || 'unknown',
                    pair: t.pair || `${t.asset}/INR`,
                    category: 'trade',
                });
            }
        }

        // ── Fetch income events (if applicable) ──
        if (includeIncome) {
            let incQuery = supabase
                .from('crypto_income')
                .select('id, income_type, asset, quantity, value_inr, transaction_date, source, remarks', { count: 'exact' })
                .eq('user_id', userId)
                .eq('financial_year', fy)
                .order('transaction_date', { ascending: false });

            // Apply type filter for income
            if (typeFilter === 'staking') {
                incQuery = incQuery.eq('income_type', 'staking');
            } else if (typeFilter === 'reward') {
                incQuery = incQuery.eq('income_type', 'reward');
            }

            if (assetFilter) {
                incQuery = incQuery.eq('asset', assetFilter);
            }

            // Only fetch income if we haven't filled the page with trades
            // For "all" type, we merge both sources
            if (typeFilter === 'staking' || typeFilter === 'reward') {
                // Pure income query — use pagination directly
                const { data: incRows, count: incCount, error: incErr } = await incQuery
                    .range(offset, offset + limit - 1);

                if (incErr) {
                    return res.status(500).json({ success: false, error: `Income fetch failed: ${incErr.message}` });
                }

                totalCount = incCount || 0;

                for (const r of (incRows || [])) {
                    transactions.push({
                        id: r.id,
                        type: r.income_type || 'reward',
                        asset: r.asset,
                        quantity: Number(r.quantity) || 0,
                        price_inr: 0,
                        value_inr: Number(r.value_inr) || 0,
                        fee_inr: 0,
                        tds_inr: 0,
                        timestamp: r.transaction_date,
                        source: r.source || 'coindcx_insta',
                        pair: `${r.asset}/INR`,
                        category: 'income',
                        remarks: r.remarks || undefined,
                    });
                }
            } else if (typeFilter === 'all') {
                // For "all", fetch income events and append them
                const { data: incRows, count: incCount, error: incErr } = await incQuery;

                if (!incErr && incRows) {
                    totalCount += incCount || 0;

                    for (const r of incRows) {
                        transactions.push({
                            id: r.id,
                            type: r.income_type || 'reward',
                            asset: r.asset,
                            quantity: Number(r.quantity) || 0,
                            price_inr: 0,
                            value_inr: Number(r.value_inr) || 0,
                            fee_inr: 0,
                            tds_inr: 0,
                            timestamp: r.transaction_date,
                            source: r.source || 'coindcx_insta',
                            pair: `${r.asset}/INR`,
                            category: 'income',
                            remarks: r.remarks || undefined,
                        });
                    }
                }
            }
        }

        // ── Sort combined results by timestamp DESC ──
        transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // ── Paginate combined results (for "all" type where both sources are merged) ──
        const paginatedRows = typeFilter === 'all'
            ? transactions.slice(0, limit)
            : transactions;

        return res.status(200).json({
            success: true,
            financial_year: fy,
            page,
            limit,
            total_count: totalCount,
            total_pages: Math.ceil(totalCount / limit),
            has_more: page * limit < totalCount,
            transactions: paginatedRows,
        });
    } catch (err) {
        console.error('[Transactions API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}

interface UnifiedRow {
    id: string;
    type: string;
    asset: string;
    quantity: number;
    price_inr: number;
    value_inr: number;
    fee_inr: number;
    tds_inr: number;
    timestamp: string;
    source: string;
    pair: string;
    category: 'trade' | 'income';
    remarks?: string;
}
