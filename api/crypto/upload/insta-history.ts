/**
 * Vercel Serverless Function — CoinDCX Insta History CSV Upload
 *
 * POST /api/crypto/upload/insta-history?fy=FY2024-25
 *
 * Accept:  multipart/form-data with field name "file"
 * Auth:    Bearer JWT (Supabase access token)
 * Query:   fy — financial year (e.g. FY2024-25)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Types ──

interface ParsedInstaRow {
    source_id: string;
    source: 'INSTA_CSV';
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

interface ParseError { row: number; reason: string; }

// ─── Column Aliases ──

const COL_ALIASES: Record<string, string[]> = {
    id: ['id', 'transaction_id', 'txn_id', 'trade_id', 'order_id', 'ref'],
    date: ['created_at', 'date', 'timestamp', 'time', 'datetime', 'trade_date'],
    side: ['type', 'side', 'action', 'order_type', 'trade_type', 'buy/sell', 'direction'],
    asset: ['coin', 'asset', 'currency', 'crypto', 'symbol', 'token', 'coin_name'],
    quantity: ['quantity', 'crypto_amount', 'qty', 'amount', 'volume', 'size', 'units'],
    inr_amount: ['inr_amount', 'inr_value', 'inr amount', 'total', 'total_inr', 'fiat_amount', 'inr', 'value', 'gross_amount'],
    fee: ['fee', 'charges', 'commission', 'fee_amount', 'trading_fee', 'brokerage'],
};

// ─── Handler ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        // Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer '))
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });

        const token = authHeader.slice(7);
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        // FY
        const fy = (req.query.fy as string) || '';
        if (!fy || !fy.startsWith('FY'))
            return res.status(400).json({ success: false, error: 'Missing ?fy= (e.g. FY2024-25)' });

        // CSV
        let csvText: string;
        if (req.body?.file) {
            const f = req.body.file;
            if (Buffer.isBuffer(f)) csvText = f.toString('utf-8');
            else if (typeof f === 'string') csvText = f;
            else if (f?.data) csvText = Buffer.from(f.data).toString('utf-8');
            else return res.status(400).json({ success: false, error: 'Could not read file' });
        } else if (typeof req.body === 'string') csvText = req.body;
        else if (req.body?.csv) csvText = req.body.csv;
        else return res.status(400).json({ success: false, error: 'No file. Send multipart "file" or JSON "csv".' });

        // Parse
        const parseResult = parseInstaCSV(csvText);

        if (parseResult.rows.length === 0) {
            return res.status(200).json({
                success: false, imported: 0, skipped: 0,
                errors: parseResult.errors.length > 0 ? parseResult.errors : [{ row: 0, reason: 'No valid rows' }],
                summary: { total_buys: 0, total_sells: 0, assets: [], financial_years: [] },
            });
        }

        // Filter FY
        const fyRows = parseResult.rows.filter(r => r.financial_year === fy);
        const otherRows = parseResult.rows.filter(r => r.financial_year !== fy);
        if (otherRows.length > 0)
            parseResult.errors.push({ row: 0, reason: `${otherRows.length} row(s) from other FY(s) skipped` });

        if (fyRows.length === 0) {
            return res.status(200).json({
                success: false, imported: 0, skipped: 0,
                errors: [{ row: 0, reason: `No rows for ${fy}. All belong to other FY(s).` }],
                summary: { total_buys: 0, total_sells: 0, assets: [], financial_years: [...new Set(parseResult.rows.map(r => r.financial_year))] },
            });
        }

        // Insert
        const dbRows = fyRows.map(r => ({
            user_id: user.id,
            source: r.source, source_id: r.source_id, txn_type: r.txn_type,
            asset: r.asset, quantity: r.quantity, price_inr: r.price_inr,
            total_inr: r.total_inr, fee_inr: r.fee_inr, tds_inr: r.tds_inr,
            timestamp: r.timestamp, financial_year: r.financial_year,
            pair: r.pair, status: r.status, raw_data: r.raw_data,
        }));

        let imported = 0, skipped = 0;
        const BATCH = 500;
        for (let i = 0; i < dbRows.length; i += BATCH) {
            const batch = dbRows.slice(i, i + BATCH);
            const { data: ins, error: err } = await supabaseAdmin
                .from('crypto_transactions')
                .upsert(batch, { onConflict: 'user_id,source,source_id', ignoreDuplicates: true })
                .select('id');
            if (err) {
                parseResult.errors.push({ row: i + 1, reason: `DB error: ${err.message}` });
            } else {
                const c = (ins as any[])?.length ?? 0;
                imported += c; skipped += batch.length - c;
            }
        }

        // Coverage
        try {
            await supabaseAdmin.from('crypto_data_coverage').upsert({
                user_id: user.id, financial_year: fy,
                insta_csv_status: 'UPLOADED', insta_csv_rows: imported,
                last_updated: new Date().toISOString(),
            }, { onConflict: 'user_id,financial_year' });
        } catch { }

        const buys = fyRows.filter(r => r.txn_type === 'BUY').length;
        const sells = fyRows.filter(r => r.txn_type === 'SELL').length;

        return res.status(200).json({
            success: true, imported, skipped,
            errors: parseResult.errors,
            summary: {
                total_buys: buys, total_sells: sells,
                assets: [...new Set(fyRows.map(r => r.asset))].sort(),
                financial_years: [fy],
            },
            preview: parseResult.rows.slice(0, 10),
        });
    } catch (err) {
        console.error('[Insta API] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error', message: (err as Error).message });
    }
}


// ═══════════════════════════════════════════════════════════════════════
// INLINE PARSER
// ═══════════════════════════════════════════════════════════════════════

function parseInstaCSV(csvText: string): { rows: ParsedInstaRow[]; errors: ParseError[] } {
    const rows: ParsedInstaRow[] = [];
    const errors: ParseError[] = [];

    const lines = csvText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) { errors.push({ row: 0, reason: 'Empty CSV' }); return { rows, errors }; }

    const hdr = parseCSVRow(lines[0]);
    const col = detectCols(hdr);

    const missing: string[] = [];
    if (col.id === -1) missing.push('ID');
    if (col.date === -1) missing.push('Date');
    if (col.side === -1) missing.push('Type/Side');
    if (missing.length > 0) {
        errors.push({ row: 1, reason: `Missing column(s): ${missing.join(', ')}. Headers: [${hdr.join(', ')}]` });
        return { rows, errors };
    }

    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1;
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 3) { errors.push({ row: rowNum, reason: 'Too few columns' }); continue; }

            const rawData: Record<string, string> = {};
            hdr.forEach((h, idx) => { rawData[h] = cells[idx] ?? ''; });

            const sourceId = (cells[col.id] ?? '').trim();
            if (!sourceId) { errors.push({ row: rowNum, reason: 'Missing ID' }); continue; }

            const dateRaw = (cells[col.date] ?? '').trim();
            const ts = safeParseTimestamp(dateRaw);
            if (!ts) { errors.push({ row: rowNum, reason: `Invalid date: "${dateRaw}"` }); continue; }

            const sideRaw = (cells[col.side] ?? '').trim().toUpperCase();
            let txnType: 'BUY' | 'SELL';
            if (sideRaw.includes('BUY') || sideRaw === 'B') txnType = 'BUY';
            else if (sideRaw.includes('SELL') || sideRaw === 'S') txnType = 'SELL';
            else { errors.push({ row: rowNum, reason: `Unknown side: "${sideRaw}"` }); continue; }

            let asset = 'UNKNOWN';
            if (col.asset >= 0) { asset = extractAsset((cells[col.asset] ?? '').trim().toUpperCase()) || 'UNKNOWN'; }
            if (asset === 'UNKNOWN') { errors.push({ row: rowNum, reason: 'Missing asset' }); continue; }

            const qty = col.quantity >= 0 ? parseNum(cells[col.quantity]) : 0;
            const totalInr = col.inr_amount >= 0 ? parseNum(cells[col.inr_amount]) : 0;
            const fee = col.fee >= 0 ? parseNum(cells[col.fee]) : 0;

            if (qty <= 0 && totalInr <= 0) { errors.push({ row: rowNum, reason: 'Zero qty and amount' }); continue; }

            let priceInr = 0;
            if (qty > 0 && totalInr > 0) priceInr = totalInr / qty;

            rows.push({
                source_id: sourceId, source: 'INSTA_CSV', txn_type: txnType,
                asset, quantity: qty, price_inr: Math.round(priceInr * 100) / 100,
                total_inr: totalInr, fee_inr: fee, tds_inr: 0,
                timestamp: ts.toISOString(), financial_year: computeFY(ts),
                pair: `${asset}INR`, status: 'COMPLETED', raw_data: rawData,
            });
        } catch (err) {
            errors.push({ row: rowNum, reason: `Error: ${(err as Error).message}` });
        }
    }

    return { rows, errors };
}

// Helpers inlined for Vercel

function detectCols(headers: string[]): Record<string, number> {
    const norm = headers.map(h => h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));
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
    return {
        id: find(COL_ALIASES.id), asset: find(COL_ALIASES.asset),
        quantity: find(COL_ALIASES.quantity), inr_amount: find(COL_ALIASES.inr_amount),
        date: find(COL_ALIASES.date), side: find(COL_ALIASES.side), fee: find(COL_ALIASES.fee),
    };
}

function parseCSVRow(line: string): string[] {
    const r: string[] = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { r.push(cur.trim()); cur = ''; }
        else cur += c;
    }
    r.push(cur.trim()); return r;
}

function safeParseTimestamp(raw: string): Date | null {
    if (!raw) return null; const s = raw.trim();
    if (/^\d{13}$/.test(s)) { const d = new Date(parseInt(s)); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{10}$/.test(s)) { const d = new Date(parseInt(s) * 1000); return isNaN(d.getTime()) ? null : d; }
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
    const dm = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dm) { const d = new Date(parseInt(dm[3]), parseInt(dm[2]) - 1, parseInt(dm[1]), dm[4] ? parseInt(dm[4]) : 0, dm[5] ? parseInt(dm[5]) : 0, dm[6] ? parseInt(dm[6]) : 0); return isNaN(d.getTime()) ? null : d; }
    const last = new Date(s); return isNaN(last.getTime()) ? null : last;
}

function extractAsset(raw: string): string | null {
    if (!raw) return null; let p = raw.trim().toUpperCase().replace(/^I-/, '');
    const pm = p.match(/\(([A-Z0-9]+)\)/); if (pm) return pm[1];
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;
    for (const q of ['USDT', 'BUSD', 'INR', 'USDC']) { if (p.endsWith(q) && p.length > q.length) return p.slice(0, -q.length); }
    return p.length >= 2 ? p : null;
}

function computeFY(d: Date): string {
    const m = d.getMonth(), y = d.getFullYear();
    return m >= 3 ? `FY${y}-${String(y + 1).slice(-2)}` : `FY${y - 1}-${String(y).slice(-2)}`;
}

function parseNum(v: string | undefined): number {
    if (!v) return 0; const n = parseFloat(v.replace(/[₹$,\s]/g, '').trim()); return isNaN(n) ? 0 : n;
}
