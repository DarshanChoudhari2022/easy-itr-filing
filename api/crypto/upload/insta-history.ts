/**
 * Vercel Serverless Function — CoinDCX Insta History CSV Upload
 *
 * POST /api/crypto/upload/insta-history
 *   Content-Type: multipart/form-data OR application/json with { csv: "..." }
 *   Auth: Bearer JWT
 *
 * CoinDCX Insta History CSV columns (actual):
 *   Order ID | Currency | Side | Total Quantity | Total Amount |
 *   Fee | TDS Amount | Status | Created At | Updated At
 *
 * IMPORTANT:
 *   - Side = "buy" or "sell" (not "type")
 *   - Total Amount = INR value (this is value_inr)
 *   - Total Quantity = crypto quantity
 *   - Status must be "filled" to be counted
 *   - TDS Amount is parsed and stored
 *   - Order ID is used as external_id for idempotent upserts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Keyword maps for type classification ───────────────────────
const TRADE_KEYWORDS = ['buy', 'sell', 'instant buy', 'instant sell'];
const STAKING_KEYWORDS = ['staking', 'staking_interest', 'stake', 'staking interest'];
const REWARD_KEYWORDS = ['reward', 'cashback', 'referral', 'bonus'];
const AIRDROP_KEYWORDS = ['airdrop', 'distribution'];

const QUOTE_CURRENCIES = ['USDT', 'USDC', 'BUSD', 'INR', 'BTC', 'ETH', 'BNB', 'DAI'];

// ─── Handler ────────────────────────────────────────────────────
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

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // ── 2. Extract CSV text ──
        let csvText: string;
        if (typeof req.body === 'string') {
            csvText = req.body;
        } else if (req.body?.csv) {
            csvText = req.body.csv;
        } else if (req.body?.file) {
            const fileData = req.body.file;
            if (Buffer.isBuffer(fileData)) csvText = fileData.toString('utf-8');
            else if (typeof fileData === 'string') csvText = fileData;
            else if (fileData?.data) csvText = Buffer.from(fileData.data).toString('utf-8');
            else return res.status(400).json({ success: false, error: 'Could not read file from request body' });
        } else {
            return res.status(400).json({ success: false, error: 'No CSV data found. Send JSON with { csv: "..." }.' });
        }

        // ── 3. Parse CSV ──
        const lines = csvText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            return res.status(400).json({ success: false, error: 'Empty CSV' });
        }

        const headerCells = parseCSVRow(lines[0]);
        const headers = headerCells.map(h => h.trim());

        const cols = {
            orderId: findCol(headers, ['order id', 'order_id', 'orderid']),
            currency: findCol(headers, ['currency', 'asset', 'coin', 'token', 'symbol']),
            side: findCol(headers, ['side', 'type', 'transaction type', 'txn type', 'category']),
            quantity: findCol(headers, ['total quantity', 'total_quantity', 'amount', 'quantity', 'qty']),
            totalAmount: findCol(headers, ['total amount', 'total_amount', 'inr_value', 'inr value', 'value', 'inr amount', 'amount inr']),
            fee: findCol(headers, ['fee', 'fee amount', 'fee_amount']),
            tds: findCol(headers, ['tds amount', 'tds_amount', 'tds']),
            status: findCol(headers, ['status', 'order_status', 'state']),
            timestamp: findCol(headers, ['created at', 'created_at', 'timestamp', 'date', 'time', 'datetime']),
            remarks: findCol(headers, ['remarks', 'note', 'description', 'memo']),
        };

        const VALID_STATUSES = new Set(['filled', 'completed', 'success']);

        const trades: any[] = [];
        const income: any[] = [];
        const errors: { row: number; issue: string }[] = [];

        for (let i = 1; i < lines.length; i++) {
            try {
                const cells = parseCSVRow(lines[i]);
                const row: Record<string, string> = {};
                headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });

                // Status filter: only count filled orders
                if (cols.status) {
                    const statusVal = (row[cols.status] || '').toLowerCase().trim();
                    if (statusVal && !VALID_STATUSES.has(statusVal)) continue;
                }

                const rawSide = cols.side ? (row[cols.side] || '').toLowerCase().trim() : '';
                const rawCurrency = cols.currency ? (row[cols.currency] || '').toUpperCase().trim() : '';
                const rawAmount = cols.quantity ? parseNum(row[cols.quantity]) : 0;
                const rawInrVal = cols.totalAmount ? parseNum(row[cols.totalAmount]) : 0;
                const rawFee = cols.fee ? parseNum(row[cols.fee]) : 0;
                const rawTds = cols.tds ? parseNum(row[cols.tds]) : 0;
                const rawDate = cols.timestamp ? (row[cols.timestamp] || '').trim() : '';
                const rawOrderId = cols.orderId ? (row[cols.orderId] || '').trim() : '';

                if (!rawDate || !rawCurrency) continue;
                if (isNaN(rawAmount) || rawAmount <= 0) continue;
                if (isNaN(rawInrVal)) {
                    errors.push({ row: i + 1, issue: 'Non-numeric INR value' });
                    continue;
                }

                const eventDate = safeParseTimestamp(rawDate);
                if (!eventDate) { errors.push({ row: i + 1, issue: `Bad date: ${rawDate}` }); continue; }
                const fy = getFinancialYear(eventDate);

                // Use Order ID for dedup (most reliable), fallback to composite key
                const externalId = rawOrderId
                    ? `insta-${rawOrderId}`
                    : `insta-${rawDate}-${rawCurrency}-${rawAmount}-${rawSide}`.replace(/\s+/g, '_');

                const isTrade = rawSide === 'buy' || rawSide === 'sell' ||
                    TRADE_KEYWORDS.some(k => rawSide.includes(k));
                const isStaking = STAKING_KEYWORDS.some(k => rawSide.includes(k));
                const isReward = REWARD_KEYWORDS.some(k => rawSide.includes(k));
                const isAirdrop = AIRDROP_KEYWORDS.some(k => rawSide.includes(k));

                if (isTrade) {
                    const side = rawSide.includes('sell') ? 'sell' : 'buy';
                    trades.push({
                        user_id: user.id,
                        type: side,
                        asset: rawCurrency,
                        quote_currency: 'INR',
                        quantity: rawAmount,
                        price_per_unit: rawAmount > 0 ? rawInrVal / rawAmount : 0,
                        value_inr: rawInrVal,
                        fee_inr: isNaN(rawFee) ? 0 : rawFee,
                        tds_inr: isNaN(rawTds) ? 0 : rawTds,
                        qty_remaining: side === 'buy' ? rawAmount : null,
                        trade_date: eventDate.toISOString(),
                        financial_year: fy,
                        exchange: 'CoinDCX',
                        csv_source: 'insta_history',
                        external_id: externalId,
                    });
                } else if (isStaking || isReward || isAirdrop) {
                    income.push({
                        user_id: user.id,
                        income_type: isStaking ? 'staking' : isAirdrop ? 'airdrop' : 'reward',
                        asset: rawCurrency,
                        quantity: rawAmount,
                        value_inr: rawInrVal,
                        event_date: eventDate.toISOString(),
                        financial_year: fy,
                        exchange: 'CoinDCX',
                        csv_source: 'insta_history',
                        external_id: externalId,
                    });
                } else {
                    errors.push({ row: i + 1, issue: `Unknown type "${rawSide}" — skipped` });
                }
            } catch (e) {
                errors.push({ row: i + 1, issue: (e as Error).message });
            }
        }

        // ── 4. Upsert ──
        const results = await Promise.all([
            trades.length > 0
                ? supabase.from('crypto_trades').upsert(trades, { onConflict: 'user_id,csv_source,external_id', ignoreDuplicates: true })
                : { error: null },
            income.length > 0
                ? supabase.from('crypto_income_events').upsert(income, { onConflict: 'user_id,csv_source,external_id', ignoreDuplicates: true })
                : { error: null },
        ]);

        if (results[0].error) errors.push({ row: 0, issue: `Trade DB error: ${results[0].error.message}` });
        if (results[1].error) errors.push({ row: 0, issue: `Income DB error: ${results[1].error.message}` });

        return res.status(200).json({
            success: true,
            trades_imported: trades.length,
            income_events_imported: income.length,
            errors,
            message: `Imported ${trades.length} trades and ${income.length} income events.${errors.length ? ` ${errors.length} rows skipped.` : ''}`,
        });
    } catch (err) {
        console.error('[Insta History Upload] Unhandled error:', err);
        const message = (err as Error).message || 'Unknown error';
        return res.status(500).json({
            success: false,
            error: `Internal server error: ${message}`,
            message,
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

function getFinancialYear(date: Date): string {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const start = month >= 4 ? year : year - 1;
    return `FY${start}-${String(start + 1).slice(-2)}`;
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

function safeParseTimestamp(raw: string): Date | null {
    if (!raw) return null;
    const s = raw.trim();
    if (/^\d{13}$/.test(s)) { const d = new Date(parseInt(s)); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{10}$/.test(s)) { const d = new Date(parseInt(s) * 1000); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const [, day, month, year, h, m, sec] = dmyMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0);
    }
    const last = new Date(s);
    return isNaN(last.getTime()) ? null : last;
}

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[₹$,\s]/g, '').trim());
    return isNaN(n) ? 0 : n;
}
