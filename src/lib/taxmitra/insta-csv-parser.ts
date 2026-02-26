/**
 * TaxMitra — CoinDCX Insta History CSV Parser
 * ==============================================
 * Pure parsing logic — no Supabase dependency.
 *
 * CoinDCX "Insta" = instant buy/sell (OTC-style trades) + staking/rewards.
 * These have a different CSV format from the Exchange order history.
 *
 * Insta History CSV columns:
 *   Timestamp | Type | Currency | Amount | INR_Value | Remarks
 *
 * Row types that can appear:
 *   "buy"              → BUY trade (→ crypto_transactions)
 *   "sell"             → SELL trade (→ crypto_transactions)
 *   "staking_interest" → Staking income (→ crypto_income)
 *   "reward"           → Cashback/reward (→ crypto_income)
 *
 * Processing:
 *   - source = 'INSTA_CSV' (for trades) / 'coindcx_insta' (for income)
 *   - price_inr = INR_Value / Amount (for trades)
 *   - FY computed from timestamp (Apr 1 = start)
 *   - All FYs imported (historical BUY lots needed for FIFO)
 *   - Synthetic source_id = hash(Timestamp+Currency+Amount+Type) for dedup
 */

import { computeFinancialYear } from './order-csv-parser';
import CryptoJS from 'crypto-js';

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

/** Income events: staking_interest, reward, airdrop */
export interface ParsedInstaIncomeRow {
    source_id: string;
    source: 'coindcx_insta';
    income_type: 'staking' | 'reward' | 'airdrop' | 'interest';
    asset: string;
    quantity: number;
    value_inr: number;
    transaction_date: string;     // ISO 8601
    financial_year: string;       // e.g. FY2024-25
    remarks: string;
    raw_data: Record<string, string>;
}

export interface InstaParseError {
    row: number;
    reason: string;
}

export interface InstaCSVParseResult {
    rows: ParsedInstaRow[];
    incomeRows: ParsedInstaIncomeRow[];
    errors: InstaParseError[];
    summary: {
        total_buys: number;
        total_sells: number;
        total_income_events: number;
        total_inr_volume: number;
        total_income_inr: number;
        assets: string[];
        date_range: { from: string; to: string };
        financial_years: string[];
    };
}

// ─── Column Mapping ──────────────────────────────────────────────────

interface InstaColumnMap {
    id: number;
    date: number;
    side: number;       // Type column: buy, sell, staking_interest, reward
    asset: number;      // Currency column
    quantity: number;    // Amount column (crypto amount)
    inr_amount: number; // INR_Value column
    fee: number;
    remarks: number;
}

/**
 * Column aliases cover both CoinDCX "Insta History" and "Insta OTC" formats.
 * 
 * CRITICAL detection order:
 *   1. quantity MUST be detected before inr_amount (because 'amount' matches both)
 *   2. quantity aliases: 'quantity', 'crypto_amount', 'amount' (the Amount column)
 *   3. inr_amount aliases: 'inr_value', 'inr_amount', 'total', 'value' 
 *      (NOT 'amount' — that's claimed by quantity)
 */
const INSTA_COLUMN_ALIASES: Record<keyof InstaColumnMap, string[]> = {
    id: ['id', 'transaction_id', 'txn_id', 'trade_id', 'order_id', 'ref'],
    date: ['timestamp', 'created_at', 'date', 'time', 'datetime', 'trade_date'],
    side: ['type', 'side', 'action', 'order_type', 'trade_type', 'buy/sell', 'direction'],
    asset: ['currency', 'coin', 'asset', 'crypto', 'symbol', 'token', 'coin_name'],
    quantity: ['quantity', 'crypto_amount', 'qty', 'amount', 'volume', 'size', 'units'],
    inr_amount: ['inr_value', 'inr_amount', 'inr amount', 'total', 'total_inr', 'fiat_amount', 'inr', 'value', 'gross_amount'],
    fee: ['fee', 'charges', 'commission', 'fee_amount', 'trading_fee', 'brokerage'],
    remarks: ['remarks', 'remark', 'notes', 'note', 'description', 'comment'],
};

/**
 * Map raw Type values to our normalized income_type.
 * Any Type not in TRADE_TYPES or INCOME_TYPES is skipped.
 */
const TRADE_TYPES = new Set(['buy', 'sell']);
const INCOME_TYPE_MAP: Record<string, ParsedInstaIncomeRow['income_type']> = {
    'staking_interest': 'staking',
    'staking': 'staking',
    'staking_reward': 'staking',
    'reward': 'reward',
    'cashback': 'reward',
    'referral': 'reward',
    'airdrop': 'airdrop',
    'interest': 'interest',
    'lending_interest': 'interest',
    'reward_interest': 'staking',
};

// ─── Core Parser ─────────────────────────────────────────────────────

export function parseInstaHistoryCSV(csvText: string): InstaCSVParseResult {
    const rows: ParsedInstaRow[] = [];
    const incomeRows: ParsedInstaIncomeRow[] = [];
    const errors: InstaParseError[] = [];

    const lines = csvText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length < 2) {
        errors.push({ row: 0, reason: 'CSV file is empty or has only a header row' });
        return { rows, incomeRows, errors, summary: emptySummary() };
    }

    const headerCells = parseCSVRow(lines[0]);
    const colMap = detectInstaColumns(headerCells);

    // Validate required columns — ID is optional (we generate synthetic IDs)
    const missing: string[] = [];
    if (colMap.date === -1) missing.push('Timestamp/Date');
    if (colMap.side === -1) missing.push('Type/Side');
    if (colMap.quantity === -1 && colMap.inr_amount === -1) missing.push('Amount or INR_Value');

    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Could not detect required column(s): ${missing.join(', ')}. ` +
                `Headers found: [${headerCells.join(', ')}]`,
        });
        return { rows, incomeRows, errors, summary: emptySummary() };
    }

    const hasIdColumn = colMap.id >= 0;
    if (!hasIdColumn) {
        // Not an error — just informational
        errors.push({
            row: 0,
            reason: 'No "ID" column found. Generating synthetic IDs from row data for dedup.',
        });
    }

    const seenIds = new Set<string>();

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

            // ── Date ──
            const dateRaw = colMap.date >= 0 ? (cells[colMap.date] ?? '').trim() : '';
            const timestamp = safeParseTimestamp(dateRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, reason: `Invalid date: "${dateRaw}"` });
                continue;
            }

            // ── Type / Side ──
            const typeRaw = colMap.side >= 0 ? (cells[colMap.side] ?? '').trim().toLowerCase() : '';
            if (!typeRaw) {
                errors.push({ row: rowNum, reason: 'Missing Type/Side value' });
                continue;
            }

            // ── Asset ──
            let asset = 'UNKNOWN';
            if (colMap.asset >= 0) {
                const assetRaw = (cells[colMap.asset] ?? '').trim().toUpperCase();
                asset = extractInstaAsset(assetRaw) || 'UNKNOWN';
            }
            if (asset === 'UNKNOWN') {
                errors.push({ row: rowNum, reason: 'Missing or unrecognized asset/currency' });
                continue;
            }

            // ── Quantity ──
            const quantity = colMap.quantity >= 0 ? parseNum(cells[colMap.quantity]) : 0;

            // ── INR Amount ──
            const inrValue = colMap.inr_amount >= 0 ? parseNum(cells[colMap.inr_amount]) : 0;

            // ── Fee ──
            const fee = colMap.fee >= 0 ? parseNum(cells[colMap.fee]) : 0;

            // ── Remarks ──
            const remarks = colMap.remarks >= 0 ? (cells[colMap.remarks] ?? '').trim() : '';

            // ── Source ID (for dedup) ──
            let sourceId: string;
            if (hasIdColumn) {
                sourceId = (cells[colMap.id] ?? '').trim();
                if (!sourceId) {
                    sourceId = generateInstaId(dateRaw, typeRaw, asset, quantity, inrValue);
                }
            } else {
                sourceId = generateInstaId(dateRaw, typeRaw, asset, quantity, inrValue);
            }

            // Dedup within this parse
            if (seenIds.has(sourceId)) {
                continue;
            }
            seenIds.add(sourceId);

            // ── Financial Year ──
            const fy = computeFinancialYear(timestamp);

            // ── Route by Type ──
            if (TRADE_TYPES.has(typeRaw)) {
                // ───── BUY / SELL trade ─────
                if (quantity <= 0 && inrValue <= 0) {
                    errors.push({ row: rowNum, reason: `Both quantity (${quantity}) and INR value (${inrValue}) are zero/invalid` });
                    continue;
                }

                let priceInr = 0;
                if (quantity > 0 && inrValue > 0) {
                    priceInr = inrValue / quantity;
                }

                const txnType = typeRaw === 'buy' ? 'BUY' : 'SELL';

                rows.push({
                    source_id: sourceId,
                    source: 'INSTA_CSV',
                    txn_type: txnType as 'BUY' | 'SELL',
                    asset,
                    quantity,
                    price_inr: Math.round(priceInr * 100) / 100,
                    total_inr: inrValue,
                    fee_inr: fee,
                    tds_inr: 0, // TDS comes from TDS CSV
                    timestamp: timestamp.toISOString(),
                    financial_year: fy,
                    pair: `${asset}INR`,
                    status: 'COMPLETED',
                    raw_data: rawData,
                });

            } else if (INCOME_TYPE_MAP[typeRaw]) {
                // ───── Staking / Reward / Airdrop income ─────
                const incomeType = INCOME_TYPE_MAP[typeRaw];

                incomeRows.push({
                    source_id: sourceId,
                    source: 'coindcx_insta',
                    income_type: incomeType,
                    asset,
                    quantity,
                    value_inr: inrValue,
                    transaction_date: timestamp.toISOString(),
                    financial_year: fy,
                    remarks,
                    raw_data: rawData,
                });

            } else {
                // Unknown type — skip with warning (not an error)
                errors.push({ row: rowNum, reason: `Unknown transaction type: "${typeRaw}" — skipping (not buy/sell/staking/reward)` });
            }

        } catch (err) {
            errors.push({ row: rowNum, reason: `Unexpected error: ${(err as Error).message}` });
        }
    }

    return { rows, incomeRows, errors, summary: buildInstaSummary(rows, incomeRows) };
}


// ─── Synthetic ID Generation ─────────────────────────────────────────

/**
 * Generate a deterministic synthetic ID from row content.
 * Same row → same ID for dedup across re-uploads.
 */
function generateInstaId(
    dateStr: string,
    type: string,
    asset: string,
    quantity: number,
    inrValue: number,
): string {
    const raw = `${dateStr}|${type}|${asset}|${quantity}|${inrValue}`;
    const hash = CryptoJS.SHA256(raw).toString().slice(0, 16);
    return `INSTA-${hash}`;
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

    // CRITICAL ORDER:
    // 1. quantity BEFORE inr_amount (prevent 'amount' substring collision)
    // 2. side BEFORE id (prevent 'id' stealing 'Side' via "side".includes("id"))
    // 3. date early (prevent 'created_at' collisions)
    const quantity = find(INSTA_COLUMN_ALIASES.quantity);
    const date = find(INSTA_COLUMN_ALIASES.date);
    const side = find(INSTA_COLUMN_ALIASES.side);
    const asset = find(INSTA_COLUMN_ALIASES.asset);
    const inr_amount = find(INSTA_COLUMN_ALIASES.inr_amount);
    const id = find(INSTA_COLUMN_ALIASES.id);
    const fee = find(INSTA_COLUMN_ALIASES.fee);
    const remarks = find(INSTA_COLUMN_ALIASES.remarks);

    return { id, date, side, asset, quantity, inr_amount, fee, remarks };
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
    // Accept raw asset (e.g. "ADA", "SHIB", "INR")
    return p.length >= 2 ? p : null;
}


// ─── Helpers ─────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const cleaned = val.replace(/[₹$,\s]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : Math.abs(n);
}

function emptySummary(): InstaCSVParseResult['summary'] {
    return {
        total_buys: 0,
        total_sells: 0,
        total_income_events: 0,
        total_inr_volume: 0,
        total_income_inr: 0,
        assets: [],
        date_range: { from: '', to: '' },
        financial_years: [],
    };
}

function buildInstaSummary(
    rows: ParsedInstaRow[],
    incomeRows: ParsedInstaIncomeRow[],
): InstaCSVParseResult['summary'] {
    const allRows = [
        ...rows.map(r => ({ timestamp: r.timestamp, asset: r.asset, fy: r.financial_year })),
        ...incomeRows.map(r => ({ timestamp: r.transaction_date, asset: r.asset, fy: r.financial_year })),
    ];

    if (allRows.length === 0) return emptySummary();

    const buys = rows.filter(r => r.txn_type === 'BUY').length;
    const sells = rows.filter(r => r.txn_type === 'SELL').length;
    const totalVol = rows.reduce((s, r) => s + r.total_inr, 0);
    const totalIncomeInr = incomeRows.reduce((s, r) => s + r.value_inr, 0);
    const assetsSet = new Set(allRows.map(r => r.asset));
    const fySet = new Set(allRows.map(r => r.fy));
    const ts = allRows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);

    return {
        total_buys: buys,
        total_sells: sells,
        total_income_events: incomeRows.length,
        total_inr_volume: Math.round(totalVol * 100) / 100,
        total_income_inr: Math.round(totalIncomeInr * 100) / 100,
        assets: [...assetsSet].sort(),
        date_range: {
            from: new Date(ts[0]).toISOString().split('T')[0],
            to: new Date(ts[ts.length - 1]).toISOString().split('T')[0],
        },
        financial_years: [...fySet].sort(),
    };
}
