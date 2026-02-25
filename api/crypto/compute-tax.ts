/**
 * Vercel Serverless Function — Crypto Tax FIFO Computation
 *
 * POST /api/crypto/compute-tax
 *   Body: { financial_year: 'FY2024-25' }
 *   Auth: Bearer JWT (Supabase access token)
 *
 * Triggers the full FIFO tax computation pipeline:
 *   1. Clear previous computation for this user + FY
 *   2. Create tax lots from all BUY transactions (across ALL FYs)
 *   3. FIFO-match each SELL in the target FY against lots
 *   4. Compute summary: 30% tax + 4% cess, TDS credit, net payable
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { computeCryptoTax } from '../../src/lib/taxmitra/fifo-tax-engine';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // ── Auth ──
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }
        const token = authHeader.slice(7);

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // ── Validate body ──
        const { financial_year } = req.body || {};
        if (!financial_year || typeof financial_year !== 'string' || !financial_year.startsWith('FY')) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid financial_year. Expected format: FY2024-25',
            });
        }

        // Validate FY format: FY<YYYY>-<YY>
        const fyMatch = financial_year.match(/^FY(\d{4})-(\d{2})$/);
        if (!fyMatch) {
            return res.status(400).json({
                success: false,
                error: `Invalid financial_year format: ${financial_year}. Expected: FY2024-25`,
            });
        }

        // ── Run computation ──
        console.log(`[Compute Tax API] Starting for user ${user.id}, FY ${financial_year}`);
        const startTime = Date.now();

        const result = await computeCryptoTax(supabaseAdmin, user.id, financial_year);

        const elapsed = Date.now() - startTime;
        console.log(`[Compute Tax API] Completed in ${elapsed}ms:`, {
            success: result.success,
            trades: result.capital_gain_trades,
            grossGain: result.gross_capital_gain,
            tax: result.total_tax,
            tdsCredit: result.total_tds_credit,
            netPayable: result.net_payable,
        });

        return res.status(200).json(result);
    } catch (err) {
        console.error('[Compute Tax API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}
