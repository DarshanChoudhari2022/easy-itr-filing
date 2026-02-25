/**
 * Vercel Serverless Function — CoinDCX TDS Summary CSV Upload
 *
 * POST /api/crypto/upload/tds-summary?fy=FY2024-25
 *
 * Accept:  multipart/form-data with field name "file"
 * Auth:    Bearer JWT (Supabase access token)
 * Query:   fy — the financial year being uploaded (e.g. FY2024-25)
 *
 * Response:
 *   {
 *     success: true,
 *     imported: N,
 *     matched_to_orders: M,
 *     skipped: K,
 *     total_tds_inr: 28770.38,
 *     errors: []
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';


// ─── Types ───────────────────────────────────────────────────────────

interface ParsedTDSRow {
    source_id: string;
    source: 'TDS_CSV';
    txn_type: 'TDS';
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
    has_order_id: boolean;
    order_id: string;
}

interface ParseError {
    row: number;
    reason: string;
}

// ─── Column Aliases ──────────────────────────────────────────────────

const TDS_COLUMN_ALIASES: Record<string, string[]> = {
    date: ['date', 'transaction_date', 'tds_date', 'trade_date', 'deduction_date', 'timestamp', 'created_at'],
    tds_amount: ['tds_amount', 'tds_deducted', 'tds amount', 'tds deducted', 'tds', 'tds_inr', 'tax_deducted', 'tds_value'],
    sale_amount: ['sale_amount', 'total_sale_value', 'sale value', 'sale_value', 'gross_amount', 'gross amount', 'gross_consideration', 'consideration', 'total', 'amount', 'total_amount', 'value'],
    asset: ['asset', 'coin', 'market', 'currency', 'symbol', 'pair', 'crypto', 'token', 'asset_name', 'coin_name'],
    order_id: ['order_id', 'reference', 'order id', 'trade_reference', 'trade reference', 'ref', 'txn_id', 'transaction_id', 'id'],
};

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

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // ── 2. Get FY ──
        const fy = (req.query.fy as string) || '';
        if (!fy || !fy.startsWith('FY')) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid ?fy= query parameter. Expected format: FY2024-25',
            });
        }

        // ── 3. Extract CSV content ──
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
            return res.status(400).json({
                success: false,
                error: 'No file found. Send as multipart/form-data with field "file", or JSON with field "csv".',
            });
        }

        // ── 4. Parse TDS CSV ──
        const parseResult = parseTDSCSV(csvText);

        if (parseResult.rows.length === 0) {
            return res.status(200).json({
                success: false,
                imported: 0,
                matched_to_orders: 0,
                skipped: 0,
                total_tds_inr: 0,
                errors: parseResult.errors.length > 0
                    ? parseResult.errors
                    : [{ row: 0, reason: 'No valid TDS rows found in CSV' }],
            });
        }

        // ── 5. Filter to requested FY ──
        const fyRows = parseResult.rows.filter(r => r.financial_year === fy);
        const otherFYRows = parseResult.rows.filter(r => r.financial_year !== fy);

        if (otherFYRows.length > 0) {
            parseResult.errors.push({
                row: 0,
                reason: `${otherFYRows.length} TDS row(s) from other FY(s) skipped: ${[...new Set(otherFYRows.map(r => r.financial_year))].join(', ')}`,
            });
        }

        if (fyRows.length === 0) {
            return res.status(200).json({
                success: false,
                imported: 0,
                matched_to_orders: 0,
                skipped: 0,
                total_tds_inr: 0,
                errors: [{
                    row: 0,
                    reason: `No TDS rows found for ${fy}. All ${parseResult.rows.length} rows belong to other FY(s).`,
                }],
            });
        }

        // ── 6. Process: match to orders + insert standalone ──
        let matchedToOrders = 0;
        let imported = 0;
        let skipped = 0;
        let totalTdsInr = 0;

        // 6a. Rows with order_id — try to match to ORDER_CSV records
        const rowsWithOrderId = fyRows.filter(r => r.has_order_id);
        const rowsForStandalone = fyRows.filter(r => !r.has_order_id);

        for (const row of rowsWithOrderId) {
            try {
                const { data: updated, error: updateErr } = await supabaseAdmin
                    .from('crypto_transactions')
                    .update({ tds_inr: row.tds_inr })
                    .eq('user_id', user.id)
                    .eq('source', 'ORDER_CSV')
                    .eq('source_id', row.order_id)
                    .select('id');

                if (!updateErr && updated && updated.length > 0) {
                    matchedToOrders++;
                    totalTdsInr += row.tds_inr;
                } else {
                    // No match — treat as standalone
                    rowsForStandalone.push(row);
                }
            } catch {
                rowsForStandalone.push(row);
            }
        }

        // 6b. Insert standalone TDS records
        if (rowsForStandalone.length > 0) {
            const dbRows = rowsForStandalone.map(row => ({
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
                    console.error('[TDS API] Batch error:', insertErr);
                    parseResult.errors.push({
                        row: i + 1,
                        reason: `DB insert error: ${insertErr.message}`,
                    });
                } else {
                    const count = (inserted as any[])?.length ?? 0;
                    imported += count;
                    skipped += batch.length - count;
                    totalTdsInr += batch.slice(0, count).reduce((s, r) => s + (r.tds_inr || 0), 0);
                }
            }
        }

        // ── 7. Update coverage ──
        try {
            await supabaseAdmin
                .from('crypto_data_coverage')
                .upsert(
                    {
                        user_id: user.id,
                        financial_year: fy,
                        tds_csv_status: 'UPLOADED',
                        tds_csv_rows: imported + matchedToOrders,
                        last_updated: new Date().toISOString(),
                    },
                    { onConflict: 'user_id,financial_year' },
                );
        } catch (coverageErr) {
            console.warn('[TDS API] Coverage update failed:', coverageErr);
        }

        // ── 8. Respond ──
        return res.status(200).json({
            success: true,
            imported,
            matched_to_orders: matchedToOrders,
            skipped,
            total_tds_inr: Math.round(totalTdsInr * 100) / 100,
            errors: parseResult.errors,
        });
    } catch (err) {
        console.error('[TDS API] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}


// ═══════════════════════════════════════════════════════════════════════
// INLINE TDS CSV PARSER (self-contained for Vercel serverless)
// ═══════════════════════════════════════════════════════════════════════

function parseTDSCSV(csvText: string): {
    rows: ParsedTDSRow[];
    errors: ParseError[];
} {
    const rows: ParsedTDSRow[] = [];
    const errors: ParseError[] = [];

    const lines = csvText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length < 2) {
        errors.push({ row: 0, reason: 'CSV file is empty or has only a header row' });
        return { rows, errors };
    }

    const headerCells = parseCSVRow(lines[0]);
    const colMap = detectColumns(headerCells);

    const missing: string[] = [];
    if (colMap.date === -1) missing.push('Date');
    if (colMap.tds_amount === -1) missing.push('TDS Amount');
    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Missing column(s): ${missing.join(', ')}. Headers: [${headerCells.join(', ')}]`,
        });
        return { rows, errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1;
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 2) { errors.push({ row: rowNum, reason: 'Too few columns' }); continue; }

            const rawData: Record<string, string> = {};
            headerCells.forEach((h, idx) => { rawData[h] = cells[idx] ?? ''; });

            const dateRaw = (cells[colMap.date] ?? '').trim();
            const timestamp = safeParseTimestamp(dateRaw);
            if (!timestamp) { errors.push({ row: rowNum, reason: `Invalid date: "${dateRaw}"` }); continue; }

            const tdsInr = parseNum(cells[colMap.tds_amount]);
            if (tdsInr <= 0) { errors.push({ row: rowNum, reason: `Invalid TDS amount: ${cells[colMap.tds_amount]}` }); continue; }

            const saleInr = colMap.sale_amount >= 0 ? parseNum(cells[colMap.sale_amount]) : 0;

            let asset = 'UNKNOWN';
            if (colMap.asset >= 0) {
                const assetRaw = (cells[colMap.asset] ?? '').trim().toUpperCase();
                asset = extractAsset(assetRaw) || 'UNKNOWN';
            }

            const orderId = colMap.order_id >= 0 ? (cells[colMap.order_id] ?? '').trim() : '';
            const hasOrderId = orderId.length > 0;

            const sourceId = hasOrderId
                ? `TDS-${orderId}`
                : `TDS-${simpleHash(dateRaw + asset + tdsInr.toString())}`;

            const fy = computeFY(timestamp);

            rows.push({
                source_id: sourceId,
                source: 'TDS_CSV',
                txn_type: 'TDS',
                asset,
                quantity: 0,
                price_inr: 0,
                total_inr: saleInr,
                fee_inr: 0,
                tds_inr: tdsInr,
                timestamp: timestamp.toISOString(),
                financial_year: fy,
                pair: '',
                status: 'CONFIRMED',
                raw_data: rawData,
                has_order_id: hasOrderId,
                order_id: orderId,
            });
        } catch (err) {
            errors.push({ row: rowNum, reason: `Error: ${(err as Error).message}` });
        }
    }

    return { rows, errors };
}


// ─── Column detection ──

function detectColumns(headers: string[]): Record<string, number> {
    const norm = headers.map(h =>
        h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );
    const claimed = new Set<number>();
    const find = (aliases: string[]): number => {
        for (const a of aliases) {
            const an = a.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = norm.findIndex((h, i) => !claimed.has(i) && h === an);
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        for (const a of aliases) {
            const an = a.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = norm.findIndex((h, i) => !claimed.has(i) && h.includes(an));
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        return -1;
    };
    const tds_amount = find(TDS_COLUMN_ALIASES.tds_amount);
    const date = find(TDS_COLUMN_ALIASES.date);
    const asset = find(TDS_COLUMN_ALIASES.asset);
    const order_id = find(TDS_COLUMN_ALIASES.order_id);
    const sale_amount = find(TDS_COLUMN_ALIASES.sale_amount);
    return { date, tds_amount, sale_amount, asset, order_id };
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

function extractAsset(raw: string): string | null {
    if (!raw) return null;
    let p = raw.trim().toUpperCase().replace(/^I-/, '');
    const parenMatch = p.match(/\(([A-Z0-9]+)\)/);
    if (parenMatch) return parenMatch[1];
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;
    for (const q of ['USDT', 'BUSD', 'INR', 'USDC']) {
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

function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}
