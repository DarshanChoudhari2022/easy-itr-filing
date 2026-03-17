/**
 * EasyITR — CoinDCX TDS Summary CSV Parser
 * ============================================
 * Pure parsing logic — no Supabase dependency.
 *
 * Handles ALL known CoinDCX TDS CSV column-name variants:
 *   Date        → 'date' | 'transaction_date' | 'Date'
 *   TDS Amount  → 'tds_amount' | 'tds_deducted' | 'TDS Amount' | 'TDS Deducted'
 *   Sale Amount → 'sale_amount' | 'total_sale_value' | 'Sale Value' | 'Gross Amount'
 *   Asset/Coin  → 'asset' | 'coin' | 'market' | 'Coin' | 'Currency'
 *   Order ID    → 'order_id' | 'reference' | 'Order ID' | 'Trade Reference'
 *
 * Processing rules:
 *   - Each row = one TDS deduction event
 *   - source = 'TDS_CSV', txn_type = 'TDS'
 *   - source_id = order_id if present, else hash(date + asset + tds_amount)
 *   - FY computed from date (Apr 1 = start of FY)
 */

import { computeFinancialYear } from './order-csv-parser';

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedTDSRow {
    source_id: string;
    source: 'TDS_CSV';
    txn_type: 'TDS';
    asset: string;
    quantity: number;        // 0 for TDS rows
    price_inr: number;       // 0 for TDS rows
    total_inr: number;       // sale/gross consideration
    fee_inr: number;         // 0 for TDS rows
    tds_inr: number;         // the TDS amount
    timestamp: string;       // ISO 8601
    financial_year: string;  // e.g. FY2024-25
    pair: string;            // empty for TDS rows
    status: string;          // 'CONFIRMED'
    raw_data: Record<string, string>;
    // TDS-specific linking
    has_order_id: boolean;   // true if CSV had an order_id for this row
    order_id: string;        // the original order_id to match against ORDER_CSV rows
}

export interface TDSParseError {
    row: number;
    reason: string;
}

export interface TDSCSVParseResult {
    rows: ParsedTDSRow[];
    errors: TDSParseError[];
    summary: {
        total_rows: number;
        rows_with_order_id: number;
        rows_without_order_id: number;
        total_tds_inr: number;
        total_sale_inr: number;
        assets: string[];
        date_range: { from: string; to: string };
        financial_years: string[];
    };
}

// ─── Column Mapping ──────────────────────────────────────────────────

interface TDSColumnMap {
    date: number;
    tds_amount: number;
    sale_amount: number;
    asset: number;
    order_id: number;
}

const TDS_COLUMN_ALIASES: Record<keyof TDSColumnMap, string[]> = {
    date: ['date', 'transaction_date', 'tds_date', 'trade_date', 'deduction_date', 'timestamp', 'created_at'],
    tds_amount: ['tds_amount', 'tds_deducted', 'tds amount', 'tds deducted', 'tds', 'tds_inr', 'tax_deducted', 'tds_value'],
    sale_amount: ['sale_amount', 'total_sale_value', 'sale value', 'sale_value', 'gross_amount', 'gross amount', 'gross_consideration', 'consideration', 'total', 'amount', 'total_amount', 'value'],
    asset: ['asset', 'coin', 'market', 'currency', 'symbol', 'pair', 'crypto', 'token', 'asset_name', 'coin_name'],
    order_id: ['order_id', 'reference', 'order id', 'trade_reference', 'trade reference', 'ref', 'txn_id', 'transaction_id', 'id'],
};

// ─── Core Parser ─────────────────────────────────────────────────────

/**
 * Parse a CoinDCX TDS Summary CSV string into normalized rows.
 */
export function parseTDSSummaryCSV(csvText: string): TDSCSVParseResult {
    const rows: ParsedTDSRow[] = [];
    const errors: TDSParseError[] = [];

    const lines = csvText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length < 2) {
        errors.push({ row: 0, reason: 'CSV file is empty or has only a header row' });
        return { rows, errors, summary: emptySummary() };
    }

    // ── Step 1: Parse header and detect columns ──
    const headerCells = parseCSVRow(lines[0]);
    const colMap = detectTDSColumns(headerCells);

    // Validate: we need at minimum date + tds_amount
    const missing: string[] = [];
    if (colMap.date === -1) missing.push('Date');
    if (colMap.tds_amount === -1) missing.push('TDS Amount');

    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Could not detect required column(s): ${missing.join(', ')}. ` +
                `Headers found: [${headerCells.join(', ')}]`,
        });
        return { rows, errors, summary: emptySummary() };
    }

    // ── Step 2: Parse data rows ──
    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1;
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 2) {
                errors.push({ row: rowNum, reason: 'Too few columns' });
                continue;
            }

            // Build raw_data
            const rawData: Record<string, string> = {};
            headerCells.forEach((h, idx) => {
                rawData[h] = cells[idx] ?? '';
            });

            // ── Date ──
            const dateRaw = (cells[colMap.date] ?? '').trim();
            const timestamp = safeParseTimestamp(dateRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, reason: `Invalid date: "${dateRaw}"` });
                continue;
            }

            // ── TDS Amount ──
            const tdsInr = parseNum(cells[colMap.tds_amount]);
            if (tdsInr <= 0) {
                errors.push({ row: rowNum, reason: `Invalid or zero TDS amount: ${cells[colMap.tds_amount]}` });
                continue;
            }

            // ── Sale Amount (optional) ──
            const saleInr = colMap.sale_amount >= 0 ? parseNum(cells[colMap.sale_amount]) : 0;

            // ── Asset (optional but important) ──
            let asset = 'UNKNOWN';
            if (colMap.asset >= 0) {
                const assetRaw = (cells[colMap.asset] ?? '').trim().toUpperCase();
                asset = extractAssetFromTDS(assetRaw) || 'UNKNOWN';
            }

            // ── Order ID (optional — for linking to ORDER_CSV) ──
            const orderId = colMap.order_id >= 0 ? (cells[colMap.order_id] ?? '').trim() : '';
            const hasOrderId = orderId.length > 0;

            // ── Source ID for dedup ──
            const sourceId = hasOrderId
                ? `TDS-${orderId}`
                : `TDS-${simpleHash(dateRaw + asset + tdsInr.toString())}`;

            // ── Financial Year ──
            const fy = computeFinancialYear(timestamp);

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
            errors.push({ row: rowNum, reason: `Unexpected error: ${(err as Error).message}` });
        }
    }

    return { rows, errors, summary: buildTDSSummary(rows) };
}


// ─── Column Detection ────────────────────────────────────────────────

function detectTDSColumns(headers: string[]): TDSColumnMap {
    const normalized = headers.map(h =>
        h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );

    const claimed = new Set<number>();

    const find = (aliases: string[]): number => {
        // Pass 1: exact match
        for (const alias of aliases) {
            const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h === aliasNorm);
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        // Pass 2: substring match
        for (const alias of aliases) {
            const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h.includes(aliasNorm));
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        return -1;
    };

    // Detect most specific first
    const tds_amount = find(TDS_COLUMN_ALIASES.tds_amount);
    const date = find(TDS_COLUMN_ALIASES.date);
    const asset = find(TDS_COLUMN_ALIASES.asset);
    const order_id = find(TDS_COLUMN_ALIASES.order_id);
    const sale_amount = find(TDS_COLUMN_ALIASES.sale_amount);

    return { date, tds_amount, sale_amount, asset, order_id };
}


// ─── CSV Row Parser ──────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'; i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}


// ─── Date Parsing ────────────────────────────────────────────────────

function safeParseTimestamp(raw: string): Date | null {
    if (!raw) return null;
    const s = raw.trim();

    // Unix ms
    if (/^\d{13}$/.test(s)) {
        const d = new Date(parseInt(s));
        return isNaN(d.getTime()) ? null : d;
    }
    // Unix sec
    if (/^\d{10}$/.test(s)) {
        const d = new Date(parseInt(s) * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    // ISO / YYYY-MM-DD
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // DD-MM-YYYY / DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const [, day, month, year, h, m, sec] = dmyMatch;
        const d = new Date(
            parseInt(year), parseInt(month) - 1, parseInt(day),
            h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0,
        );
        return isNaN(d.getTime()) ? null : d;
    }
    // Named month
    const monthNames: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const namedMatch = s.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})|(\w{3})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (namedMatch) {
        let day: number, monthIdx: number, year: number;
        if (namedMatch[1]) {
            day = parseInt(namedMatch[1]);
            monthIdx = monthNames[namedMatch[2].toLowerCase()] ?? -1;
            year = parseInt(namedMatch[3]);
        } else {
            monthIdx = monthNames[namedMatch[4].toLowerCase()] ?? -1;
            day = parseInt(namedMatch[5]);
            year = parseInt(namedMatch[6]);
        }
        if (monthIdx >= 0) {
            const d = new Date(year, monthIdx, day);
            return isNaN(d.getTime()) ? null : d;
        }
    }

    const last = new Date(s);
    return isNaN(last.getTime()) ? null : last;
}


// ─── Asset Extraction ────────────────────────────────────────────────

/**
 * Extract asset symbol from TDS CSV asset column.
 * TDS CSVs may have: 'BTC', 'BTCINR', 'BTC/INR', 'Bitcoin (BTC)', etc.
 */
function extractAssetFromTDS(raw: string): string | null {
    if (!raw) return null;
    let p = raw.trim().toUpperCase();

    // Remove Insta prefix
    p = p.replace(/^I-/, '');

    // Handle "Bitcoin (BTC)" format → extract parenthesized symbol
    const parenMatch = p.match(/\(([A-Z0-9]+)\)/);
    if (parenMatch) return parenMatch[1];

    // Handle explicit separators
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;

    // Strip known quote suffixes
    for (const q of ['USDT', 'BUSD', 'INR', 'USDC']) {
        if (p.endsWith(q) && p.length > q.length) {
            return p.slice(0, -q.length);
        }
    }

    return p.length >= 2 ? p : null;
}


// ─── Simple Hash ─────────────────────────────────────────────────────

/**
 * Simple deterministic hash for generating dedup keys.
 * Not cryptographic — just needs to be consistent.
 */
function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}


// ─── Helpers ─────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const cleaned = val.replace(/[₹$,\s]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function emptySummary(): TDSCSVParseResult['summary'] {
    return {
        total_rows: 0,
        rows_with_order_id: 0,
        rows_without_order_id: 0,
        total_tds_inr: 0,
        total_sale_inr: 0,
        assets: [],
        date_range: { from: '', to: '' },
        financial_years: [],
    };
}

function buildTDSSummary(rows: ParsedTDSRow[]): TDSCSVParseResult['summary'] {
    if (rows.length === 0) return emptySummary();

    const withOrderId = rows.filter(r => r.has_order_id).length;
    const totalTds = rows.reduce((sum, r) => sum + r.tds_inr, 0);
    const totalSale = rows.reduce((sum, r) => sum + r.total_inr, 0);
    const assetsSet = new Set(rows.map(r => r.asset));
    const fySet = new Set(rows.map(r => r.financial_year));
    const timestamps = rows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);

    return {
        total_rows: rows.length,
        rows_with_order_id: withOrderId,
        rows_without_order_id: rows.length - withOrderId,
        total_tds_inr: Math.round(totalTds * 100) / 100,
        total_sale_inr: Math.round(totalSale * 100) / 100,
        assets: [...assetsSet].sort(),
        date_range: {
            from: new Date(timestamps[0]).toISOString().split('T')[0],
            to: new Date(timestamps[timestamps.length - 1]).toISOString().split('T')[0],
        },
        financial_years: [...fySet].sort(),
    };
}

