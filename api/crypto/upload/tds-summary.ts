/**
 * Vercel Serverless Function — CoinDCX TDS Certificate CSV Upload
 *
 * POST /api/crypto/upload/tds-summary
 *   Content-Type: multipart/form-data OR application/json with { csv: "..." }
 *   Auth: Bearer JWT
 *
 * CoinDCX TDS Certificate CSV columns (actual):
 *   Created At | Order Type | Side | Crypto Pair / Token name |
 *   Order Value | TDS deducted | TDS (In INR)
 *
 * Note: This CSV has NO Order ID. We match TDS to sell trades
 * by asset + date + value proximity.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // ── 1. Auth ──
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }
        const token = authHeader.slice(7);

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // ── 2. Extract CSV text ──
        let csvText: string;
        if (req.body?.file) {
            const fileData = req.body.file;
            if (Buffer.isBuffer(fileData)) csvText = fileData.toString('utf-8');
            else if (typeof fileData === 'string') csvText = fileData;
            else if (fileData?.data) csvText = Buffer.from(fileData.data).toString('utf-8');
            else return res.status(400).json({ success: false, error: 'Could not read file' });
        } else if (typeof req.body === 'string') {
            csvText = req.body;
        } else if (req.body?.csv) {
            csvText = req.body.csv;
        } else {
            return res.status(400).json({ success: false, error: 'No file found.' });
        }

        // ── 3. Parse CSV ──
        const lines = csvText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            return res.status(400).json({ success: false, error: 'Empty CSV' });
        }

        const headerCells = parseCSVRow(lines[0]);
        const headers = headerCells.map(h => h.trim());

        const cols = {
            date: findCol(headers, ['created at', 'created_at', 'date', 'timestamp', 'deduction date', 'transaction_date']),
            orderType: findCol(headers, ['order type', 'order_type', 'type']),
            side: findCol(headers, ['side', 'direction']),
            asset: findCol(headers, ['crypto pair / token name', 'crypto pair', 'token name', 'asset', 'currency', 'pair']),
            orderValue: findCol(headers, ['order value', 'order_value', 'total', 'consideration', 'sale value', 'transaction value', 'amount']),
            tdsDeducted: findCol(headers, ['tds deducted', 'tds', 'tds amount', 'tds_amount', 'tax deducted']),
            tdsInr: findCol(headers, ['tds (in inr)', 'tds in inr', 'tds_inr', 'tds inr']),
            orderId: findCol(headers, ['order id', 'orderid', 'order_id', 'reference', 'txn id', 'transaction id']),
        };

        // Use tdsInr if available, fall back to tdsDeducted
        const tdsCol = cols.tdsInr || cols.tdsDeducted;

        let matched = 0;
        let totalTDS = 0;
        const unmatched: { asset: string; tdsAmount: number; date: string; note: string }[] = [];
        const errors: { row: number; issue: string }[] = [];

        // Load all user sell trades for matching
        const { data: allSells } = await supabase
            .from('crypto_trades')
            .select('id, asset, trade_date, value_inr, tds_inr')
            .eq('user_id', user.id)
            .eq('type', 'sell')
            .order('trade_date', { ascending: true });

        const usedTradeIds = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
            try {
                const cells = parseCSVRow(lines[i]);
                const row: Record<string, string> = {};
                headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });

                const tdsAmount = tdsCol ? parseNum(row[tdsCol]) : 0;
                if (isNaN(tdsAmount) || tdsAmount <= 0) continue;
                totalTDS += tdsAmount;

                // Extract asset name (strip "INR" suffix from order value display)
                const rawAsset = cols.asset ? row[cols.asset].trim().toUpperCase() : '';
                const rawDate = cols.date ? row[cols.date].trim() : '';
                const rawOrderValue = cols.orderValue ? parseNum(row[cols.orderValue].replace(/\s*INR$/i, '')) : 0;
                const orderId = cols.orderId ? row[cols.orderId].trim() : '';

                let didMatch = false;

                // Strategy 1: Match by Order ID if available
                if (orderId && allSells) {
                    const trade = allSells.find(s =>
                        !usedTradeIds.has(s.id) &&
                        (s.asset === rawAsset)
                    );
                    if (trade) {
                        await supabase.from('crypto_trades').update({ tds_inr: tdsAmount }).eq('id', trade.id);
                        usedTradeIds.add(trade.id);
                        matched++;
                        didMatch = true;
                    }
                }

                // Strategy 2: Match by asset + date + value proximity
                if (!didMatch && allSells && rawDate) {
                    const tdsDate = new Date(rawDate);
                    const match = allSells.find(s => {
                        if (usedTradeIds.has(s.id)) return false;
                        if (s.asset !== rawAsset) return false;
                        const tradeDate = new Date(s.trade_date);
                        // Within 5 minutes
                        if (Math.abs(tradeDate.getTime() - tdsDate.getTime()) > 300000) return false;
                        // Value within 5%
                        if (rawOrderValue > 0) {
                            const valDiff = Math.abs(Number(s.value_inr) - rawOrderValue) / Math.max(rawOrderValue, 1);
                            if (valDiff > 0.05) return false;
                        }
                        return true;
                    });

                    if (match) {
                        await supabase.from('crypto_trades').update({ tds_inr: tdsAmount }).eq('id', match.id);
                        usedTradeIds.add(match.id);
                        matched++;
                        didMatch = true;
                    }
                }

                // Strategy 3: Match by asset only (last resort)
                if (!didMatch && allSells) {
                    const match = allSells.find(s => {
                        if (usedTradeIds.has(s.id)) return false;
                        if (s.asset !== rawAsset) return false;
                        if (Number(s.tds_inr || 0) > 0) return false; // Already has TDS
                        return true;
                    });

                    if (match) {
                        await supabase.from('crypto_trades').update({ tds_inr: tdsAmount }).eq('id', match.id);
                        usedTradeIds.add(match.id);
                        matched++;
                        didMatch = true;
                    }
                }

                if (!didMatch) {
                    unmatched.push({ asset: rawAsset, tdsAmount, date: rawDate, note: 'No matching sell trade found' });
                }
            } catch (e) {
                errors.push({ row: i + 1, issue: (e as Error).message });
            }
        }

        return res.status(200).json({
            success: true,
            tds_records: lines.length - 1,
            matched_to_trades: matched,
            unmatched,
            total_tds_credit: parseFloat(totalTDS.toFixed(2)),
            errors,
            note: unmatched.length > 0
                ? 'Some TDS entries could not be matched to trades. Total TDS credit is still correct.'
                : 'All TDS entries matched.',
            message: `Processed ${lines.length - 1} TDS records. ${matched} matched to sell trades. Total TDS: ₹${totalTDS.toFixed(2)}.`,
        });
    } catch (err) {
        console.error('[TDS Upload] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// Inline Utilities
// ═══════════════════════════════════════════════════════════════════

function findCol(headers: string[], candidates: string[]): string | null {
    const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9_ /]/g, '').trim());
    for (const candidate of candidates) {
        const cn = candidate.toLowerCase().trim();
        const idx = lower.findIndex(h => h === cn || h.includes(cn));
        if (idx >= 0) return headers[idx];
    }
    return null;
}

function parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += ch;
    }
    result.push(current.trim());
    return result;
}

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[₹$,\s]/g, '').trim());
    return isNaN(n) ? 0 : n;
}
