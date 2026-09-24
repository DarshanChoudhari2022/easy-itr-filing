/**
 * Vercel Serverless Function — Available Financial Years
 *
 * GET /api/crypto/available-years
 *   Auth: Bearer JWT
 *
 * Returns which FYs have trade data — for the FY selector dropdown.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCORS, authenticate } from './_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const auth = await authenticate(req, res);
        if (!auth) return;

        const { userId, supabase } = auth;

        // Get distinct financial years from crypto_trades
        const { data: tradeYears, error: tradeError } = await supabase
            .from('crypto_trades')
            .select('financial_year')
            .eq('user_id', userId);

        // Also check income events
        const { data: incomeYears, error: incomeError } = await supabase
            .from('crypto_income_events')
            .select('financial_year')
            .eq('user_id', userId);

        if (tradeError || incomeError) throw new Error(tradeError?.message || incomeError?.message);
        const allYears = new Set<string>();
        (tradeYears || []).forEach(r => allYears.add(r.financial_year));
        (incomeYears || []).forEach(r => allYears.add(r.financial_year));

        const years = [...allYears].filter(y => /^FY\d{4}-\d{2}$/.test(y)).sort().reverse();

        return res.status(200).json({
            success: true,
            years,
        });
    } catch (err) {
        console.error('[Available Years API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}
