/**
 * Vercel Serverless Function — Crypto Tax Overview
 *
 * GET /api/crypto/overview?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns the full tax summary for the overview screen.
 * Reads directly from crypto_tax_summary — no re-computation.
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

        const { data, error } = await supabase
            .from('crypto_tax_summary')
            .select('*')
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .single();

        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ success: false, error: error.message });
        }

        if (!data) {
            return res.status(200).json({ success: true, not_computed: true, financial_year: fy });
        }

        return res.status(200).json({
            success: true,
            ...data,
        });
    } catch (err) {
        console.error('[Overview API] Error:', err);
        return res.status(500).json({ success: false, error: (err as Error).message });
    }
}
