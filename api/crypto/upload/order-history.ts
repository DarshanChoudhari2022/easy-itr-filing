/**
 * Vercel Serverless Function — CoinDCX Order History CSV Upload
 *
 * POST /api/crypto/upload/order-history?fy=FY2024-25
 *
 * Accept:  multipart/form-data with field name "file"
 * Auth:    Bearer JWT (Supabase access token)
 * Query:   fy — the financial year being uploaded (e.g. FY2024-25)
 *
 * Response:
 *   {
 *     success: true,
 *     imported: N,
 *     skipped: M,
 *     errors: [{ row: N, reason: 'string' }],
 *     summary: { total_buys, total_sells, assets, date_range, financial_years },
 *     preview: [ first 10 parsed rows ]
 *   }
 *
 * Note: This endpoint duplicates the client-side upload logic for cases
 * where server-side processing is preferred (mobile, bulk uploads, API integrations).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Inline CSV Parser (same logic as order-csv-parser.ts) ───────────
// We inline this because Vercel serverless functions cannot import
// from src/ (they run in a separate Node.js context).

interface ParsedOrderRow {
    source_id: string;
    source: 'ORDER_CSV';
    txn_type: 'BUY' | 'SELL';
    asset: string;
    quantity: number;
    price_inr: number;
    total_inr: number;
    fee_inr: number;
    tds_inr: number;
    timestamp: string;
    financial_year: string;
    pair: string;
    status: string;
    raw_data: Record<string, string>;
}

interface ParseError {
    row: number;
    reason: string;
}

interface ParseSummary {
    total_buys: number;
    total_sells: number;
    assets: string[];
    date_range: { from: string; to: string };
    financial_years: string[];
}

// Column aliases
const COLUMN_ALIASES: Record<string, string[]> = {
    order_id: ['order_id', 'id', 'order id', 'orderid', 'trade_id', 'tradeid'],
    timestamp: ['created_at', 'timestamp', 'date', 'time', 'datetime', 'trade_date', 'executed_at', 'order_date'],
    pair: ['market', 'pair', 'symbol', 'trading_pair', 'coin_pair', 'instrument'],
    side: ['side', 'order_type', 'type', 'trade_type', 'buy/sell', 'direction', 'action'],
    quantity: ['total_quantity', 'quantity', 'qty', 'executed_quantity', 'filled_quantity', 'volume', 'size', 'amount_of_coin'],
    price: ['avg_price', 'price', 'price_per_unit', 'rate', 'execution_price', 'average_price', 'unit_price'],
    total: ['total', 'amount', 'value', 'total_amount', 'gross_amount', 'net_amount', 'total_value'],
    fee: ['fee', 'commission', 'fee_amount', 'trading_fee', 'charges', 'brokerage'],
    status: ['status', 'order_status', 'state', 'fill_status'],
};

const VALID_STATUSES = new Set([
    'filled', 'completed', 'success', 'FILLED', 'COMPLETED', 'SUCCESS',
    'Filled', 'Completed', 'Success', 'partially_filled', 'partial',
]);

// ─── Handler ─────────────────────────────────────────────────────────

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
        // ── 1. Auth: extract user from JWT ──
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }
        const token = authHeader.slice(7);

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

        // Use service role for DB inserts to bypass RLS (we validate the JWT manually)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        // Verify the JWT
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // ── 2. Get financial year from query param ──
        const fy = (req.query.fy as string) || '';
        if (!fy || !fy.startsWith('FY')) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid ?fy= query parameter. Expected format: FY2024-25',
            });
        }

        // ── 3. Extract CSV content from request body ──
        // Vercel auto-parses multipart/form-data into req.body
        // The file content will be a Buffer or string
        let csvText: string;

        if (req.body?.file) {
            // If Vercel parsed the file
            const fileData = req.body.file;
            if (Buffer.isBuffer(fileData)) {
                csvText = fileData.toString('utf-8');
            } else if (typeof fileData === 'string') {
                csvText = fileData;
            } else if (fileData?.data) {
                csvText = Buffer.from(fileData.data).toString('utf-8');
            } else {
                return res.status(400).json({ success: false, error: 'Could not read file from request' });
            }
        } else if (typeof req.body === 'string') {
            // Raw CSV string in body
            csvText = req.body;
        } else if (req.body?.csv) {
            // JSON body with csv field
            csvText = req.body.csv;
        } else {
            return res.status(400).json({
                success: false,
                error: 'No file found. Send as multipart/form-data with field "file", or JSON with field "csv".',
            });
        }

        // ── 4. Parse CSV ──
        const parseResult = parseOrderCSV(csvText);

        if (parseResult.rows.length === 0) {
            return res.status(200).json({
                success: false,
                imported: 0,
                skipped: 0,
                errors: parseResult.errors.length > 0
                    ? parseResult.errors
                    : [{ row: 0, reason: 'No valid rows found in CSV' }],
                summary: parseResult.summary,
                preview: [],
            });
        }

        // ── 5. Filter to requested FY ──
        const fyRows = parseResult.rows.filter(r => r.financial_year === fy);
        const otherFYRows = parseResult.rows.filter(r => r.financial_year !== fy);

        if (otherFYRows.length > 0) {
            parseResult.errors.push({
                row: 0,
                reason: `${otherFYRows.length} row(s) from other FY(s) skipped: ${[...new Set(otherFYRows.map(r => r.financial_year))].join(', ')}`,
            });
        }

        if (fyRows.length === 0) {
            return res.status(200).json({
                success: false,
                imported: 0,
                skipped: 0,
                errors: [{
                    row: 0,
                    reason: `No rows found for ${fy}. All ${parseResult.rows.length} rows belong to other FY(s).`,
                }],
                summary: parseResult.summary,
                preview: parseResult.rows.slice(0, 10),
            });
        }

        // ── 6. Insert into crypto_transactions ──
        const dbRows = fyRows.map(row => ({
            user_id: user.id,
            source: row.source,
            source_id: row.source_id,
            txn_type: row.txn_type,
            asset: row.asset,
            quantity: row.quantity,
            price_inr: row.price_inr,
            total_inr: row.total_inr,
            fee_inr: row.fee_inr,
            tds_inr: row.tds_inr,
            timestamp: row.timestamp,
            financial_year: row.financial_year,
            pair: row.pair,
            status: row.status,
            raw_data: row.raw_data,
        }));

        let imported = 0;
        let skipped = 0;
        const BATCH_SIZE = 500;

        for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
            const batch = dbRows.slice(i, i + BATCH_SIZE);

            const { data: inserted, error: insertErr } = await supabaseAdmin
                .from('crypto_transactions')
                .upsert(batch, {
                    onConflict: 'user_id,source,source_id',
                    ignoreDuplicates: true,
                })
                .select('id');

            if (insertErr) {
                console.error('[Order History API] Batch error:', insertErr);
                parseResult.errors.push({
                    row: i + 1,
                    reason: `DB insert error: ${insertErr.message}`,
                });
            } else {
                const count = (inserted as any[])?.length ?? 0;
                imported += count;
                skipped += batch.length - count;
            }
        }

        // ── 7. Update crypto_data_coverage ──
        try {
            await supabaseAdmin
                .from('crypto_data_coverage')
                .upsert(
                    {
                        user_id: user.id,
                        financial_year: fy,
                        order_csv_status: 'UPLOADED',
                        order_csv_rows: imported,
                        last_updated: new Date().toISOString(),
                    },
                    { onConflict: 'user_id,financial_year' },
                );
        } catch (coverageErr) {
            console.warn('[Order History API] Coverage update failed:', coverageErr);
        }

        // ── 8. Respond ──
        return res.status(200).json({
            success: true,
            imported,
            skipped,
            errors: parseResult.errors,
            summary: parseResult.summary,
            preview: parseResult.rows.slice(0, 10),
        });
    } catch (err) {
        console.error('[Order History API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}


// ═══════════════════════════════════════════════════════════════════════
// INLINE CSV PARSER (same logic as order-csv-parser.ts, self-contained)
// ═══════════════════════════════════════════════════════════════════════

function parseOrderCSV(csvText: string): {
    rows: ParsedOrderRow[];
    errors: ParseError[];
    summary: ParseSummary;
} {
    const rows: ParsedOrderRow[] = [];
    const errors: ParseError[] = [];

    const lines = csvText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length < 2) {
        errors.push({ row: 0, reason: 'CSV file is empty or has only a header row' });
        return { rows, errors, summary: emptySummary() };
    }

    const headerCells = parseCSVRow(lines[0]);
    const colMap = detectColumns(headerCells);

    // Validate required columns
    const missing: string[] = [];
    if (colMap.order_id === -1) missing.push('Order ID');
    if (colMap.timestamp === -1) missing.push('Timestamp');
    if (colMap.quantity === -1) missing.push('Quantity');
    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Missing column(s): ${missing.join(', ')}. Headers: [${headerCells.join(', ')}]`,
        });
        return { rows, errors, summary: emptySummary() };
    }

    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1;
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 3) { errors.push({ row: rowNum, reason: 'Too few columns' }); continue; }

            const rawData: Record<string, string> = {};
            headerCells.forEach((h, idx) => { rawData[h] = cells[idx] ?? ''; });

            const statusRaw = colMap.status >= 0 ? (cells[colMap.status] ?? '').trim() : 'filled';
            if (!VALID_STATUSES.has(statusRaw) && !VALID_STATUSES.has(statusRaw.toLowerCase())) continue;

            const sourceId = (cells[colMap.order_id] ?? '').trim();
            if (!sourceId) { errors.push({ row: rowNum, reason: 'Missing order_id' }); continue; }

            const tsRaw = colMap.timestamp >= 0 ? (cells[colMap.timestamp] ?? '').trim() : '';
            const timestamp = safeParseTimestamp(tsRaw);
            if (!timestamp) { errors.push({ row: rowNum, reason: `Invalid date: "${tsRaw}"` }); continue; }

            const pairRaw = colMap.pair >= 0 ? (cells[colMap.pair] ?? '').trim() : '';
            const asset = extractAsset(pairRaw);
            if (!asset) { errors.push({ row: rowNum, reason: `Cannot extract asset: "${pairRaw}"` }); continue; }

            const sideRaw = colMap.side >= 0 ? (cells[colMap.side] ?? '').trim().toUpperCase() : '';
            let txnType: 'BUY' | 'SELL';
            if (sideRaw.includes('BUY') || sideRaw === 'B') txnType = 'BUY';
            else if (sideRaw.includes('SELL') || sideRaw === 'S') txnType = 'SELL';
            else { errors.push({ row: rowNum, reason: `Unknown side: "${sideRaw}"` }); continue; }

            const quantity = parseNum(cells[colMap.quantity]);
            const price = colMap.price >= 0 ? parseNum(cells[colMap.price]) : 0;
            let total = colMap.total >= 0 ? parseNum(cells[colMap.total]) : 0;
            const fee = colMap.fee >= 0 ? parseNum(cells[colMap.fee]) : 0;

            if (quantity <= 0) { errors.push({ row: rowNum, reason: `Invalid quantity: ${quantity}` }); continue; }
            if (total <= 0 && price > 0) total = quantity * price;

            const fy = computeFY(timestamp);

            rows.push({
                source_id: sourceId,
                source: 'ORDER_CSV',
                txn_type: txnType,
                asset,
                quantity,
                price_inr: price,
                total_inr: total,
                fee_inr: fee,
                tds_inr: 0,
                timestamp: timestamp.toISOString(),
                financial_year: fy,
                pair: pairRaw,
                status: statusRaw,
                raw_data: rawData,
            });
        } catch (err) {
            errors.push({ row: rowNum, reason: `Error: ${(err as Error).message}` });
        }
    }

    return { rows, errors, summary: buildSummary(rows) };
}

// ─── Column detection ──

function detectColumns(headers: string[]): Record<string, number> {
    const norm = headers.map(h =>
        h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );
    const find = (aliases: string[]): number => {
        for (const a of aliases) {
            const an = a.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = norm.findIndex(h => h === an || h.includes(an));
            if (idx !== -1) return idx;
        }
        return -1;
    };
    const map: Record<string, number> = {};
    for (const key of Object.keys(COLUMN_ALIASES)) {
        map[key] = find(COLUMN_ALIASES[key]);
    }
    return map;
}

// ─── CSV row parser ──

function parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += ch;
    }
    result.push(current.trim());
    return result;
}

// ─── Date parsing ──

function safeParseTimestamp(raw: string): Date | null {
    if (!raw) return null;
    const s = raw.trim();
    if (/^\d{13}$/.test(s)) { const d = new Date(parseInt(s)); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{10}$/.test(s)) { const d = new Date(parseInt(s) * 1000); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const [, day, month, year, h, m, sec] = dmyMatch;
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
            h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0);
        return isNaN(d.getTime()) ? null : d;
    }
    const last = new Date(s);
    return isNaN(last.getTime()) ? null : last;
}

// ─── Asset extraction ──

function extractAsset(pair: string): string | null {
    if (!pair) return null;
    let p = pair.trim().toUpperCase().replace(/^I-/, '');
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;
    if (p.includes('_')) return p.split('_')[0] || null;
    for (const q of ['USDT', 'BUSD', 'INR', 'BTC', 'ETH', 'USDC', 'DAI']) {
        if (p.endsWith(q) && p.length > q.length) return p.slice(0, -q.length);
    }
    return p.length >= 2 ? p : null;
}

// ─── FY computation ──

function computeFY(date: Date): string {
    const month = date.getMonth();
    const year = date.getFullYear();
    if (month >= 3) return `FY${year}-${String(year + 1).slice(-2)}`;
    return `FY${year - 1}-${String(year).slice(-2)}`;
}

// ─── Helpers ──

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[₹$,\s]/g, '').trim());
    return isNaN(n) ? 0 : n;
}

function emptySummary(): ParseSummary {
    return { total_buys: 0, total_sells: 0, assets: [], date_range: { from: '', to: '' }, financial_years: [] };
}

function buildSummary(rows: ParsedOrderRow[]): ParseSummary {
    if (rows.length === 0) return emptySummary();
    const buys = rows.filter(r => r.txn_type === 'BUY').length;
    const sells = rows.filter(r => r.txn_type === 'SELL').length;
    const ts = rows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);
    return {
        total_buys: buys,
        total_sells: sells,
        assets: [...new Set(rows.map(r => r.asset))].sort(),
        date_range: {
            from: new Date(ts[0]).toISOString().split('T')[0],
            to: new Date(ts[ts.length - 1]).toISOString().split('T')[0],
        },
        financial_years: [...new Set(rows.map(r => r.financial_year))].sort(),
    };
}
