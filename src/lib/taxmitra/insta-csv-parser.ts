/**
 * TaxMitra — CoinDCX Insta History CSV Parser
 * ==============================================
 * Pure parsing logic — no Supabase dependency.
 *
 * CoinDCX "Insta" = instant buy/sell (OTC-style trades).
 * These have a different CSV format from the Exchange order history.
 *
 * Column aliases:
 *   ID         → 'id' | 'transaction_id' | 'ID' | 'txn_id'
 *   Date       → 'created_at' | 'date' | 'Date' | 'timestamp'
 *   Type/Side  → 'type' | 'side' | 'Type' | 'action'
 *   Coin/Asset → 'coin' | 'asset' | 'Coin' | 'currency' | 'crypto'
 *   Quantity   → 'quantity' | 'crypto_amount' | 'Quantity' | 'amount'
 *   INR Amount → 'inr_amount' | 'amount' | 'INR Amount' | 'total' | 'inr_value'
 *   Fee        → 'fee' | 'charges' | 'Fee' | 'commission'
 *
 * Processing:
 *   - source = 'INSTA_CSV'
 *   - price_inr = total_inr / quantity
 *   - FY computed from timestamp (Apr 1 = start)
 */

import { computeFinancialYear } from './order-csv-parser';

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedInstaRow {
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

export interface InstaParseError {
    row: number;
    reason: string;
}

export interface InstaCSVParseResult {
    rows: ParsedInstaRow[];
    errors: InstaParseError[];
    summary: {
        total_buys: number;
        total_sells: number;
        total_inr_volume: number;
        assets: string[];
        date_range: { from: string; to: string };
        financial_years: string[];
    };
}

// ─── Column Mapping ──────────────────────────────────────────────────

interface InstaColumnMap {
    id: number;
    date: number;
    side: number;
    asset: number;
    quantity: number;
    inr_amount: number;
    fee: number;
}

const INSTA_COLUMN_ALIASES: Record<keyof InstaColumnMap, string[]> = {
    id: ['id', 'transaction_id', 'txn_id', 'trade_id', 'order_id', 'ref'],
    date: ['created_at', 'date', 'timestamp', 'time', 'datetime', 'trade_date'],
    side: ['type', 'side', 'action', 'order_type', 'trade_type', 'buy/sell', 'direction'],
    asset: ['coin', 'asset', 'currency', 'crypto', 'symbol', 'token', 'coin_name'],
    quantity: ['quantity', 'crypto_amount', 'qty', 'volume', 'size', 'units'],
    inr_amount: ['inr_amount', 'inr_value', 'inr amount', 'amount', 'total', 'total_inr', 'fiat_amount', 'inr', 'value', 'gross_amount'],
    fee: ['fee', 'charges', 'commission', 'fee_amount', 'trading_fee', 'brokerage'],
};

// ─── Core Parser ─────────────────────────────────────────────────────

export function parseInstaHistoryCSV(csvText: string): InstaCSVParseResult {
    const rows: ParsedInstaRow[] = [];
    const errors: InstaParseError[] = [];

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
    const colMap = detectInstaColumns(headerCells);

    // Validate required columns
    const missing: string[] = [];
    if (colMap.id === -1) missing.push('ID');
    if (colMap.date === -1) missing.push('Date');
    if (colMap.side === -1) missing.push('Type/Side');
    if (colMap.quantity === -1 && colMap.inr_amount === -1) missing.push('Quantity or INR Amount');

    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Could not detect required column(s): ${missing.join(', ')}. ` +
                `Headers found: [${headerCells.join(', ')}]`,
        });
        return { rows, errors, summary: emptySummary() };
    }

    for (let i = 1; i < lines.length; i++) {
        const rowNum = i + 1;
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 3) {
                errors.push({ row: rowNum, reason: 'Too few columns' });
                continue;
            }

            // Raw data for audit trail
            const rawData: Record<string, string> = {};
            headerCells.forEach((h, idx) => {
                rawData[h] = cells[idx] ?? '';
            });

            // ── ID ──
            const sourceId = (cells[colMap.id] ?? '').trim();
            if (!sourceId) {
                errors.push({ row: rowNum, reason: 'Missing ID / transaction_id' });
                continue;
            }

            // ── Date ──
            const dateRaw = colMap.date >= 0 ? (cells[colMap.date] ?? '').trim() : '';
            const timestamp = safeParseTimestamp(dateRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, reason: `Invalid date: "${dateRaw}"` });
                continue;
            }

            // ── Side / Type ──
            const sideRaw = colMap.side >= 0 ? (cells[colMap.side] ?? '').trim().toUpperCase() : '';
            let txnType: 'BUY' | 'SELL';
            if (sideRaw.includes('BUY') || sideRaw === 'B') {
                txnType = 'BUY';
            } else if (sideRaw.includes('SELL') || sideRaw === 'S') {
                txnType = 'SELL';
            } else {
                errors.push({ row: rowNum, reason: `Unknown type/side: "${sideRaw}"` });
                continue;
            }

            // ── Asset ──
            let asset = 'UNKNOWN';
            if (colMap.asset >= 0) {
                const assetRaw = (cells[colMap.asset] ?? '').trim().toUpperCase();
                asset = extractInstaAsset(assetRaw) || 'UNKNOWN';
            }
            if (asset === 'UNKNOWN') {
                errors.push({ row: rowNum, reason: 'Missing or unrecognized asset/coin' });
                continue;
            }

            // ── Quantity ──
            const quantity = colMap.quantity >= 0 ? parseNum(cells[colMap.quantity]) : 0;

            // ── INR Amount ──
            const totalInr = colMap.inr_amount >= 0 ? parseNum(cells[colMap.inr_amount]) : 0;

            // ── Fee ──
            const fee = colMap.fee >= 0 ? parseNum(cells[colMap.fee]) : 0;

            // Validate: need at least quantity or total
            if (quantity <= 0 && totalInr <= 0) {
                errors.push({ row: rowNum, reason: `Both quantity (${quantity}) and INR amount (${totalInr}) are zero/invalid` });
                continue;
            }

            // ── Compute price_inr ──
            let priceInr = 0;
            if (quantity > 0 && totalInr > 0) {
                priceInr = totalInr / quantity;
            }

            // ── Financial Year ──
            const fy = computeFinancialYear(timestamp);

            rows.push({
                source_id: sourceId,
                source: 'INSTA_CSV',
                txn_type: txnType,
                asset,
                quantity,
                price_inr: Math.round(priceInr * 100) / 100,
                total_inr: totalInr,
                fee_inr: fee,
                tds_inr: 0,
                timestamp: timestamp.toISOString(),
                financial_year: fy,
                pair: `${asset}INR`,
                status: 'COMPLETED',
                raw_data: rawData,
            });
        } catch (err) {
            errors.push({ row: rowNum, reason: `Unexpected error: ${(err as Error).message}` });
        }
    }

    return { rows, errors, summary: buildInstaSummary(rows) };
}


// ─── Column Detection ────────────────────────────────────────────────

function detectInstaColumns(headers: string[]): InstaColumnMap {
    const normalized = headers.map(h =>
        h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );

    const claimed = new Set<number>();

    const find = (aliases: string[]): number => {
        // Pass 1: exact match
        for (const alias of aliases) {
            const an = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h === an);
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        // Pass 2: substring
        for (const alias of aliases) {
            const an = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h.includes(an));
            if (idx !== -1) { claimed.add(idx); return idx; }
        }
        return -1;
    };

    // Detect specific columns first to avoid collisions
    const id = find(INSTA_COLUMN_ALIASES.id);
    const asset = find(INSTA_COLUMN_ALIASES.asset);
    const inr_amount = find(INSTA_COLUMN_ALIASES.inr_amount);
    const quantity = find(INSTA_COLUMN_ALIASES.quantity);
    const date = find(INSTA_COLUMN_ALIASES.date);
    const side = find(INSTA_COLUMN_ALIASES.side);
    const fee = find(INSTA_COLUMN_ALIASES.fee);

    return { id, date, side, asset, quantity, inr_amount, fee };
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
            } else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim()); current = '';
        } else current += ch;
    }
    result.push(current.trim());
    return result;
}


// ─── Date Parsing ────────────────────────────────────────────────────

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

function extractInstaAsset(raw: string): string | null {
    if (!raw) return null;
    let p = raw.trim().toUpperCase();
    p = p.replace(/^I-/, '');
    // "Bitcoin (BTC)" → BTC
    const parenMatch = p.match(/\(([A-Z0-9]+)\)/);
    if (parenMatch) return parenMatch[1];
    // Separators
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;
    // Strip quote currencies
    for (const q of ['USDT', 'BUSD', 'INR', 'USDC']) {
        if (p.endsWith(q) && p.length > q.length) return p.slice(0, -q.length);
    }
    return p.length >= 2 ? p : null;
}


// ─── Helpers ─────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const cleaned = val.replace(/[₹$,\s]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function emptySummary(): InstaCSVParseResult['summary'] {
    return {
        total_buys: 0,
        total_sells: 0,
        total_inr_volume: 0,
        assets: [],
        date_range: { from: '', to: '' },
        financial_years: [],
    };
}

function buildInstaSummary(rows: ParsedInstaRow[]): InstaCSVParseResult['summary'] {
    if (rows.length === 0) return emptySummary();

    const buys = rows.filter(r => r.txn_type === 'BUY').length;
    const sells = rows.filter(r => r.txn_type === 'SELL').length;
    const totalVol = rows.reduce((s, r) => s + r.total_inr, 0);
    const assetsSet = new Set(rows.map(r => r.asset));
    const fySet = new Set(rows.map(r => r.financial_year));
    const ts = rows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);

    return {
        total_buys: buys,
        total_sells: sells,
        total_inr_volume: Math.round(totalVol * 100) / 100,
        assets: [...assetsSet].sort(),
        date_range: {
            from: new Date(ts[0]).toISOString().split('T')[0],
            to: new Date(ts[ts.length - 1]).toISOString().split('T')[0],
        },
        financial_years: [...fySet].sort(),
    };
}
