/**
 * TaxMitra — CoinDCX Order History CSV Parser
 * =============================================
 * Pure parsing logic — no Supabase dependency.
 *
 * Handles ALL known CoinDCX CSV column-name variants:
 *   Order ID   → 'order_id' | 'id' | 'Order ID'
 *   Timestamp  → 'created_at' | 'timestamp' | 'Date'
 *   Pair       → 'market' | 'pair' | 'Market'
 *   Side       → 'side' | 'order_type' | 'Type'
 *   Quantity   → 'total_quantity' | 'quantity' | 'Quantity'
 *   Avg Price  → 'avg_price' | 'price' | 'Price'
 *   Total      → 'total' | 'amount' | 'Total'
 *   Fee        → 'fee' | 'commission' | 'Fee'
 *   Status     → 'status' | 'Status'
 *
 * Processing rules:
 *   - Skip rows where status ∉ {filled, completed, success}
 *   - Extract asset from pair (BTCINR → BTC, BTC/INR → BTC, ETH-INR → ETH)
 *   - Compute FY from timestamp (Apr 1 = start of FY)
 *   - Compute total_inr = qty × price if missing
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedOrderRow {
    source_id: string;
    source: 'ORDER_CSV';
    txn_type: 'BUY' | 'SELL';
    asset: string;
    quantity: number;
    price_inr: number;
    total_inr: number;
    fee_inr: number;
    tds_inr: number;
    timestamp: string;       // ISO 8601 string
    financial_year: string;  // e.g. FY2024-25
    pair: string;
    status: string;
    raw_data: Record<string, string>;
}

export interface ParseError {
    row: number;
    reason: string;
}

export interface OrderCSVParseResult {
    rows: ParsedOrderRow[];
    errors: ParseError[];
    summary: {
        total_buys: number;
        total_sells: number;
        assets: string[];
        date_range: { from: string; to: string };
        financial_years: string[];
    };
}

// ─── Column Mapping ──────────────────────────────────────────────────

interface ColumnMap {
    order_id: number;
    timestamp: number;
    pair: number;
    side: number;
    quantity: number;
    price: number;
    total: number;
    fee: number;
    status: number;
}

const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
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

/**
 * Statuses we accept. Everything else is skipped.
 */
const VALID_STATUSES = new Set([
    'filled', 'completed', 'success',
    'FILLED', 'COMPLETED', 'SUCCESS',
    'Filled', 'Completed', 'Success',
    // partial fills — sometimes CoinDCX exports use these
    'partially_filled', 'partial',
]);

// ─── Core Parser ─────────────────────────────────────────────────────

/**
 * Parse a CoinDCX Order History CSV string into normalized rows.
 *
 * @param csvText  Raw CSV file content (string)
 * @returns        Parsed rows, errors, and summary statistics
 */
export function parseOrderHistoryCSV(csvText: string): OrderCSVParseResult {
    const rows: ParsedOrderRow[] = [];
    const errors: ParseError[] = [];

    // Split lines, handle both \r\n and \n
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
    const colMap = detectColumns(headerCells);

    // Validate minimum required columns
    const missing: string[] = [];
    if (colMap.order_id === -1) missing.push('Order ID');
    if (colMap.timestamp === -1) missing.push('Timestamp');
    if (colMap.pair === -1 && colMap.side === -1) missing.push('Pair or Side');
    if (colMap.quantity === -1) missing.push('Quantity');

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
        const rowNum = i + 1;  // 1-indexed (header = row 1)
        try {
            const cells = parseCSVRow(lines[i]);
            if (cells.length < 3) {
                errors.push({ row: rowNum, reason: 'Too few columns' });
                continue;
            }

            // Build raw_data map for audit trail
            const rawData: Record<string, string> = {};
            headerCells.forEach((h, idx) => {
                rawData[h] = cells[idx] ?? '';
            });

            // ── Status filter ──
            const statusRaw = colMap.status >= 0 ? (cells[colMap.status] ?? '').trim() : 'filled';
            if (!VALID_STATUSES.has(statusRaw) && !VALID_STATUSES.has(statusRaw.toLowerCase())) {
                // Skip silently — not an error, just a non-filled order
                continue;
            }

            // ── Order ID ──
            const sourceId = (cells[colMap.order_id] ?? '').trim();
            if (!sourceId) {
                errors.push({ row: rowNum, reason: 'Missing order_id / source_id' });
                continue;
            }

            // ── Timestamp ──
            const tsRaw = colMap.timestamp >= 0 ? (cells[colMap.timestamp] ?? '').trim() : '';
            const timestamp = safeParseTimestamp(tsRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, reason: `Invalid date: "${tsRaw}"` });
                continue;
            }

            // ── Pair & Asset ──
            const pairRaw = colMap.pair >= 0 ? (cells[colMap.pair] ?? '').trim() : '';
            const asset = extractAsset(pairRaw);
            if (!asset) {
                errors.push({ row: rowNum, reason: `Cannot extract asset from pair: "${pairRaw}"` });
                continue;
            }

            // ── Side / Txn Type ──
            const sideRaw = colMap.side >= 0 ? (cells[colMap.side] ?? '').trim().toUpperCase() : '';
            let txnType: 'BUY' | 'SELL';
            if (sideRaw.includes('BUY') || sideRaw === 'B') {
                txnType = 'BUY';
            } else if (sideRaw.includes('SELL') || sideRaw === 'S') {
                txnType = 'SELL';
            } else {
                errors.push({ row: rowNum, reason: `Unknown side/type: "${sideRaw}"` });
                continue;
            }

            // ── Numeric fields ──
            const quantity = parseNum(cells[colMap.quantity]);
            const price = colMap.price >= 0 ? parseNum(cells[colMap.price]) : 0;
            let total = colMap.total >= 0 ? parseNum(cells[colMap.total]) : 0;
            const fee = colMap.fee >= 0 ? parseNum(cells[colMap.fee]) : 0;

            if (quantity <= 0) {
                errors.push({ row: rowNum, reason: `Invalid quantity: ${quantity}` });
                continue;
            }

            // Compute total if missing
            if (total <= 0 && price > 0) {
                total = quantity * price;
            }

            // ── Financial Year ──
            const fy = computeFinancialYear(timestamp);

            rows.push({
                source_id: sourceId,
                source: 'ORDER_CSV',
                txn_type: txnType,
                asset,
                quantity,
                price_inr: price,
                total_inr: total,
                fee_inr: fee,
                tds_inr: 0,  // TDS comes from TDS CSV, not order history
                timestamp: timestamp.toISOString(),
                financial_year: fy,
                pair: pairRaw,
                status: statusRaw,
                raw_data: rawData,
            });
        } catch (err) {
            errors.push({ row: rowNum, reason: `Unexpected error: ${(err as Error).message}` });
        }
    }

    // ── Step 3: Build summary ──
    const summary = buildSummary(rows);

    return { rows, errors, summary };
}


// ─── Column Detection ────────────────────────────────────────────────

function detectColumns(headers: string[]): ColumnMap {
    const normalized = headers.map(h =>
        h.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );

    // Track which column indices are already claimed to prevent collisions
    const claimed = new Set<number>();

    const find = (aliases: string[]): number => {
        // Pass 1: exact match only (prevents 'total' from matching 'total_quantity')
        for (const alias of aliases) {
            const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h === aliasNorm);
            if (idx !== -1) {
                claimed.add(idx);
                return idx;
            }
        }
        // Pass 2: substring match (fallback for fuzzy column names)
        for (const alias of aliases) {
            const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9_/]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const idx = normalized.findIndex((h, i) => !claimed.has(i) && h.includes(aliasNorm));
            if (idx !== -1) {
                claimed.add(idx);
                return idx;
            }
        }
        return -1;
    };

    // Order matters: detect more specific columns first to reduce collisions
    const quantity = find(COLUMN_ALIASES.quantity);  // 'total_quantity' before 'total'
    const order_id = find(COLUMN_ALIASES.order_id);
    const timestamp = find(COLUMN_ALIASES.timestamp);
    const pair = find(COLUMN_ALIASES.pair);
    const side = find(COLUMN_ALIASES.side);
    const price = find(COLUMN_ALIASES.price);
    const total = find(COLUMN_ALIASES.total);     // now won't collide with total_quantity
    const fee = find(COLUMN_ALIASES.fee);
    const status = find(COLUMN_ALIASES.status);

    return { order_id, timestamp, pair, side, quantity, price, total, fee, status };
}

// ─── CSV Row Parser (handles quoted fields with commas) ──────────────

function parseCSVRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
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

    // Unix milliseconds (13 digits)
    if (/^\d{13}$/.test(s)) {
        const d = new Date(parseInt(s));
        return isNaN(d.getTime()) ? null : d;
    }

    // Unix seconds (10 digits)
    if (/^\d{10}$/.test(s)) {
        const d = new Date(parseInt(s) * 1000);
        return isNaN(d.getTime()) ? null : d;
    }

    // ISO 8601 / YYYY-MM-DD variants
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    // DD-MM-YYYY or DD/MM/YYYY (Indian format)
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
        const [, day, month, year, h, m, sec] = dmyMatch;
        const d = new Date(
            parseInt(year), parseInt(month) - 1, parseInt(day),
            h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0,
        );
        return isNaN(d.getTime()) ? null : d;
    }

    // Named month: "Jan 15, 2024" or "15 Jan 2024"
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

    // Last resort
    const last = new Date(s);
    return isNaN(last.getTime()) ? null : last;
}

// ─── Asset Extraction from Pair ──────────────────────────────────────

/**
 * Extract base asset from a trading pair string.
 * Examples:
 *   BTCINR   → BTC
 *   BTC/INR  → BTC
 *   BTC-INR  → BTC
 *   ETHINR   → ETH
 *   SHIBINR  → SHIB
 *   MATICUSDT → MATIC
 *   I-BTCINR → BTC  (CoinDCX Insta prefix)
 */
function extractAsset(pair: string): string | null {
    if (!pair) return null;

    // Trim and uppercase
    let p = pair.trim().toUpperCase();

    // Remove CoinDCX Insta prefix: I-BTCINR → BTCINR
    p = p.replace(/^I-/, '');

    // Handle explicit separators: BTC/INR → BTC, BTC-INR → BTC
    if (p.includes('/')) return p.split('/')[0] || null;
    if (p.includes('-')) return p.split('-')[0] || null;
    if (p.includes('_')) return p.split('_')[0] || null;

    // Strip known quote currencies from the right
    const quotes = ['USDT', 'BUSD', 'INR', 'BTC', 'ETH', 'USDC', 'DAI'];
    for (const q of quotes) {
        if (p.endsWith(q) && p.length > q.length) {
            return p.slice(0, -q.length);
        }
    }

    // Fallback: return as-is if it looks like a single asset
    return p.length >= 2 ? p : null;
}

// ─── Financial Year Computation ──────────────────────────────────────

/**
 * Indian Financial Year: April 1 to March 31.
 *   2024-06-15 → FY2024-25
 *   2025-01-20 → FY2024-25
 *   2025-04-01 → FY2025-26
 */
export function computeFinancialYear(date: Date): string {
    const month = date.getMonth(); // 0-indexed: 0=Jan, 3=Apr
    const year = date.getFullYear();

    if (month >= 3) {
        // April (3) onwards → FY starts this year
        return `FY${year}-${String(year + 1).slice(-2)}`;
    } else {
        // Jan-Mar → FY started previous year
        return `FY${year - 1}-${String(year).slice(-2)}`;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    // Remove commas, currency symbols, spaces
    const cleaned = val.replace(/[₹$,\s]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function emptySummary(): OrderCSVParseResult['summary'] {
    return {
        total_buys: 0,
        total_sells: 0,
        assets: [],
        date_range: { from: '', to: '' },
        financial_years: [],
    };
}

function buildSummary(rows: ParsedOrderRow[]): OrderCSVParseResult['summary'] {
    if (rows.length === 0) return emptySummary();

    const buys = rows.filter(r => r.txn_type === 'BUY').length;
    const sells = rows.filter(r => r.txn_type === 'SELL').length;
    const assetsSet = new Set(rows.map(r => r.asset));
    const fySet = new Set(rows.map(r => r.financial_year));

    // Sort timestamps for date range
    const timestamps = rows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);
    const from = new Date(timestamps[0]).toISOString().split('T')[0];
    const to = new Date(timestamps[timestamps.length - 1]).toISOString().split('T')[0];

    return {
        total_buys: buys,
        total_sells: sells,
        assets: Array.from(assetsSet).sort(),
        date_range: { from, to },
        financial_years: Array.from(fySet).sort(),
    };
}
