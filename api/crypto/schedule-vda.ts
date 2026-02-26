/**
 * Vercel Serverless Function — Schedule VDA for ITR Filing
 *
 * GET /api/crypto/schedule-vda?fy=FY2024-25
 *   Auth: Bearer JWT
 *
 * Returns lot-level rows formatted for the ITR Schedule VDA form.
 * Each row = one sell↔buy lot match with acquisition/transfer dates.
 * Powers the "Schedule VDA" / "ITR Export" screen.
 *
 * ITR Schedule VDA columns:
 *   Sl No, Date of Transfer, Date of Acquisition, Head of Income,
 *   Cost of Acquisition, Consideration Received, Income from VDA
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

        // ── Fetch all computation rows with lot + sell transaction details ──
        const { data: comps, error: compErr } = await supabase
            .from('crypto_tax_computations')
            .select(`
                id,
                qty_matched,
                cost_of_acquisition,
                sale_consideration,
                capital_gain,
                is_unknown_lot,
                lot:crypto_tax_lots!lot_id(asset, purchase_date),
                sell:crypto_transactions!sell_txn_id(asset, timestamp)
            `)
            .eq('user_id', userId)
            .eq('financial_year', fy)
            .order('created_at', { ascending: true });

        if (compErr) {
            return res.status(500).json({ success: false, error: `Computation fetch failed: ${compErr.message}` });
        }

        // ── Format into Schedule VDA rows ──
        const rows = (comps || []).map((c, idx) => {
            const asset = (c.lot as any)?.asset || (c.sell as any)?.asset || 'UNKNOWN';
            const acquisitionDate = (c.lot as any)?.purchase_date || null;
            const transferDate = (c.sell as any)?.timestamp || null;

            return {
                sl_no: idx + 1,
                asset,
                date_of_acquisition: acquisitionDate ? formatIndianDate(new Date(acquisitionDate)) : 'N/A',
                date_of_transfer: transferDate ? formatIndianDate(new Date(transferDate)) : 'N/A',
                head_of_income: 'Capital Gains',
                cost_of_acquisition: round2(Number(c.cost_of_acquisition) || 0),
                consideration_received: round2(Number(c.sale_consideration) || 0),
                income_from_vda: round2(Number(c.capital_gain) || 0),
                qty_matched: Number(c.qty_matched) || 0,
                is_unknown_lot: c.is_unknown_lot || false,
            };
        });

        // ── Totals ──
        const totals = {
            cost_of_acquisition: round2(rows.reduce((s, r) => s + r.cost_of_acquisition, 0)),
            consideration_received: round2(rows.reduce((s, r) => s + r.consideration_received, 0)),
            income_from_vda: round2(rows.reduce((s, r) => s + r.income_from_vda, 0)),
        };

        return res.status(200).json({
            success: true,
            financial_year: fy,
            total_entries: rows.length,
            rows,
            totals,
        });
    } catch (err) {
        console.error('[Schedule VDA API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}

/**
 * Format date as DD/MM/YYYY (Indian date format for ITR filing).
 * Converts to IST (UTC+5:30) first.
 */
function formatIndianDate(date: Date): string {
    // Convert to IST
    const istMs = date.getTime() + (5.5 * 60 * 60 * 1000);
    const ist = new Date(istMs);
    const d = ist.getUTCDate().toString().padStart(2, '0');
    const m = (ist.getUTCMonth() + 1).toString().padStart(2, '0');
    const y = ist.getUTCFullYear();
    return `${d}/${m}/${y}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
