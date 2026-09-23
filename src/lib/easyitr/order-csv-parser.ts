/**
 * EasyITR — CoinDCX Order History CSV Parser
 * =============================================
 * Pure parsing logic — no Supabase dependency.
 *
 * Handles ALL known CoinDCX CSV column-name variants:
 *   Order ID   → 'order_id' | 'id' | 'Order ID'
 *   Timestamp  → 'created_at' | 'timestamp' | 'Date'
 *   Pair       → 'market' | 'pair' | 'Market'
 *   Side       → 'side' | 'order_type' | 'Type'
 *   Quantity   → 'total_quantity' | 'quantity' | 'Amount'
 *   Avg Price  → 'avg_price' | 'price' | 'Price'
 *   Total      → 'total' | 'Total'
 *   Fee        → 'fee' | 'commission' | 'Fee'
 *   Status     → 'status' | 'Status'
 *
 * Processing rules:
 *   - Skip rows where status ∉ {filled, completed, success} (if status column exists)
 *   - If no status column present, assume all rows are filled orders
 *   - Extract asset from pair (BTCINR → BTC, BTC/INR → BTC, ETH-INR → ETH)
 *   - Also extract quote_currency (INR, USDT, etc.) for proper valuation
 *   - Compute FY from timestamp (Apr 1 = start of FY)
 *   - Use the exchange Total column for INR pairs; compute qty × price only if missing
 *   - Import ALL financial years (BUY orders from older FYs are cost lots for FIFO)
 *   - Generate synthetic source_id when order_id column is missing
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ParsedOrderRow {
    source_id: string;
    source: 'ORDER_CSV';
    txn_type: 'BUY' | 'SELL';
    asset: string;
    quote_currency: string;   // INR, USDT, BTC, etc.
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
        total_inr_volume: number;
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
    remaining: number;
    price: number;
    total: number;
    fee: number;
    tds: number;
    status: number;
}

/**
 * Column aliases — order matters within each field.
 * More specific aliases come first to prevent false matches.
 * 
 * IMPORTANT: 'amount' is listed under quantity (not total) because
 * CoinDCX Order History CSV uses "Amount" for the crypto quantity
 * and "Total" for the INR value (Price × Amount).
 * 
 * CRITICAL v7 additions:
 *   - remaining: 'remaining_quantity' for partial fill handling
 *   - tds: 'total_tds_inr' for USDT→INR conversion
 */
const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
    order_id: ['order_id', 'id', 'order id', 'orderid', 'trade_id', 'tradeid'],
    timestamp: ['created_at', 'created at', 'timestamp', 'date', 'time', 'datetime', 'trade_date', 'executed_at', 'order_date'],
    pair: ['pair', 'market', 'symbol', 'trading_pair', 'coin_pair', 'instrument'],
    side: ['side', 'order_type', 'type', 'trade_type', 'buy/sell', 'direction', 'action'],
    quantity: ['total_quantity', 'total quantity', 'filled_quantity', 'executed_quantity', 'quantity', 'qty', 'volume', 'size', 'amount_of_coin', 'amount'],
    remaining: ['remaining_quantity', 'remaining quantity', 'remaining'],
    price: ['price_per_unit', 'price per unit', 'avg_price', 'average_price', 'price', 'rate', 'execution_price', 'unit_price'],
    total: ['total', 'total_amount', 'total_value', 'gross_amount', 'net_amount', 'value'],
    fee: ['fee_amount', 'fee amount', 'fee', 'commission', 'trading_fee', 'charges', 'brokerage'],
    tds: ['total_tds_inr', 'total tds inr', 'tds', 'tds_inr', 'tds_amount', 'tds amount'],
    status: ['status', 'order_status', 'state', 'fill_status'],
};

/**
 * Known quote currencies to strip from concatenated pair strings.
 * Order matters: longer suffixes first to avoid partial matches (e.g. BNB before BN).
 */
const KNOWN_QUOTE_CURRENCIES = ['USDT', 'BUSD', 'USDC', 'INR', 'BTC', 'ETH', 'BNB', 'DAI'];

/**
 * Statuses we accept. Everything else is skipped.
 */
const VALID_STATUSES = new Set([
    'filled', 'completed', 'success',
    'FILLED', 'COMPLETED', 'SUCCESS',
    'Filled', 'Completed', 'Success',
    // partial fills — sometimes CoinDCX exports use these
    'partially_filled', 'partial', 'partially_cancelled',
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
    // order_id is OPTIONAL — we generate a synthetic ID if missing
    const missing: string[] = [];
    if (colMap.timestamp === -1) missing.push('Timestamp/Date');
    if (colMap.pair === -1 && colMap.side === -1) missing.push('Pair/Market or Side/Type');
    if (colMap.quantity === -1) missing.push('Quantity/Amount');

    if (missing.length > 0) {
        errors.push({
            row: 1,
            reason: `Could not detect required column(s): ${missing.join(', ')}. ` +
                `Headers found: [${headerCells.join(', ')}]`,
        });
        return { rows, errors, summary: emptySummary() };
    }

    // Track if order_id column is missing — we'll generate synthetic IDs
    const hasOrderIdColumn = colMap.order_id >= 0;
    if (!hasOrderIdColumn) {
        // Not an error — just a warning
        errors.push({
            row: 0,
            reason: 'No "Order ID" / "id" column found. Generating synthetic IDs from row data.',
        });
    }

    // ── Step 2: Parse data rows ──
    const seenIds = new Set<string>();

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
            // If no status column exists (common in CoinDCX "Order History" exports),
            // treat all rows as filled/valid orders.
            if (colMap.status >= 0) {
                const statusRaw = (cells[colMap.status] ?? '').trim();
                if (statusRaw && !VALID_STATUSES.has(statusRaw) && !VALID_STATUSES.has(statusRaw.toLowerCase())) {
                    // Skip silently — not an error, just a non-filled order
                    continue;
                }
            }

            // ── Timestamp ──
            const tsRaw = colMap.timestamp >= 0 ? (cells[colMap.timestamp] ?? '').trim() : '';
            const timestamp = safeParseTimestamp(tsRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, reason: `Invalid date: "${tsRaw}"` });
                continue;
            }

            // ── Pair & Asset Extraction ──
            const pairRaw = colMap.pair >= 0 ? (cells[colMap.pair] ?? '').trim() : '';
            const extracted = extractAssetAndQuote(pairRaw);
            if (!extracted) {
                errors.push({ row: rowNum, reason: `Cannot extract asset from pair: "${pairRaw}"` });
                continue;
            }
            const { asset, quoteCurrency } = extracted;

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
            const rawQuantity = parseNum(cells[colMap.quantity]);
            const rawRemaining = colMap.remaining >= 0 ? parseNum(cells[colMap.remaining]) : 0;
            const price = colMap.price >= 0 ? parseNum(cells[colMap.price]) : 0;
            const total = colMap.total >= 0 ? parseNum(cells[colMap.total]) : 0;
            const fee = colMap.fee >= 0 ? parseNum(cells[colMap.fee]) : 0;
            const tds = colMap.tds >= 0 ? parseNum(cells[colMap.tds]) : 0;

            // Handle partial fills: filledQty = Total Quantity - Remaining Quantity
            const quantity = rawQuantity - rawRemaining;
            if (quantity <= 0) {
                continue; // Fully cancelled or empty order
            }

            // ── INR VALUE COMPUTATION ──
            // For INR pairs: value_inr = exchange total; fall back to qty × price.
            // For NON-INR pairs (USDT/USDC): derive from TDS (TDS = 1% of INR value)
            let valueInr: number;
            if (quoteCurrency === 'INR') {
                valueInr = total > 0 ? total : quantity * price;
            } else {
                // Non-INR pair: derive INR from TDS or fee
                if (tds > 0) {
                    valueInr = tds / 0.01; // TDS is 1% of INR sale value
                } else if (fee > 0) {
                    valueInr = fee / 0.002; // Fee is ~0.2% on Binance exchange
                } else {
                    valueInr = 0; // Dust trade
                }
            }

            // ── Order ID / Source ID ──
            let sourceId: string;
            if (hasOrderIdColumn) {
                sourceId = (cells[colMap.order_id] ?? '').trim();
                if (!sourceId) {
                    sourceId = generateSyntheticId(tsRaw, pairRaw, sideRaw, quantity, price, i);
                }
            } else {
                sourceId = generateSyntheticId(tsRaw, pairRaw, sideRaw, quantity, price, i);
            }

            // ── Financial Year ──
            const fy = computeFinancialYear(timestamp);

            // ── Status ──
            const statusValue = colMap.status >= 0 ? (cells[colMap.status] ?? '').trim() : 'filled';

            if (seenIds.has(sourceId)) continue;
            seenIds.add(sourceId);

            rows.push({
                source_id: sourceId,
                source: 'ORDER_CSV',
                txn_type: txnType,
                asset,
                quote_currency: quoteCurrency,
                quantity,
                price_inr: quoteCurrency === 'INR' ? price : (valueInr > 0 ? valueInr / quantity : 0),
                total_inr: valueInr,
                fee_inr: fee,
                tds_inr: 0,
                timestamp: timestamp.toISOString(),
                financial_year: fy,
                pair: pairRaw,
                status: statusValue,
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


// ─── Synthetic ID Generation ─────────────────────────────────────────

/**
 * Generate a deterministic synthetic source_id from row data.
 * This ensures the same CSV row always produces the same ID,
 * enabling deduplication on re-upload (UNIQUE(user_id, source, source_id)).
 * 
 * Format: "ORD-{date}-{pair}-{side}-{qty}-{price}"
 * This is deterministic: same row data → same ID.
 */
function generateSyntheticId(
    dateStr: string,
    pair: string,
    side: string,
    quantity: number,
    price: number,
    _rowIndex: number,
): string {
    // Normalize to create a stable fingerprint
    const datePart = dateStr.replace(/[^0-9]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const pairPart = pair.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const sidePart = side.charAt(0).toUpperCase(); // B or S
    const qtyPart = quantity.toFixed(6).replace('.', 'd');
    const pricePart = price.toFixed(2).replace('.', 'd');

    return `ORD-${datePart}-${pairPart}-${sidePart}-${qtyPart}-${pricePart}`;
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
    // CRITICAL: quantity MUST be detected before total, because 'amount' is a
    // quantity alias and would otherwise be stolen by 'total' detection.
    const quantity = find(COLUMN_ALIASES.quantity);  // 'total_quantity', 'amount' before 'total'
    const remaining = find(COLUMN_ALIASES.remaining); // 'remaining_quantity'
    const order_id = find(COLUMN_ALIASES.order_id);
    const timestamp = find(COLUMN_ALIASES.timestamp);
    const pair = find(COLUMN_ALIASES.pair);
    const side = find(COLUMN_ALIASES.side);
    const price = find(COLUMN_ALIASES.price);
    const total = find(COLUMN_ALIASES.total);     // now won't collide with total_quantity or amount
    const fee = find(COLUMN_ALIASES.fee);
    const tds = find(COLUMN_ALIASES.tds);         // 'total_tds_inr'
    const status = find(COLUMN_ALIASES.status);

    return { order_id, timestamp, pair, side, quantity, remaining, price, total, fee, tds, status };
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

// ─── Asset & Quote Currency Extraction from Pair ─────────────────────

/**
 * Extract base asset AND quote currency from a trading pair string.
 * 
 * Examples:
 *   XRPINR    → { asset: 'XRP',   quoteCurrency: 'INR'  }
 *   ADAINR    → { asset: 'ADA',   quoteCurrency: 'INR'  }
 *   ACAINR    → { asset: 'ACA',   quoteCurrency: 'INR'  }
 *   DOGEUSDT  → { asset: 'DOGE',  quoteCurrency: 'USDT' }
 *   BTC/INR   → { asset: 'BTC',   quoteCurrency: 'INR'  }
 *   ETH-USDT  → { asset: 'ETH',   quoteCurrency: 'USDT' }
 *   I-BTCINR  → { asset: 'BTC',   quoteCurrency: 'INR'  }
 *   COTIINR   → { asset: 'COTI',  quoteCurrency: 'INR'  }
 */
function extractAssetAndQuote(pair: string): { asset: string; quoteCurrency: string } | null {
    if (!pair) return null;

    // Trim and uppercase
    let p = pair.trim().toUpperCase();

    // Remove known CoinDCX exchange prefixes: I-BTCINR, B-ACA_USDT, KC-ONDO_USDT.
    // Do this narrowly so normal pairs like ETH-INR keep their base asset.
    p = p.replace(/^(I|B|KC)-/, '');

    // Handle explicit separators: BTC/INR → BTC + INR
    for (const sep of ['/', '-', '_']) {
        if (p.includes(sep)) {
            const parts = p.split(sep);
            const base = parts[0] || null;
            const quote = parts[1] || 'INR';
            if (base && base.length >= 2) {
                return { asset: base, quoteCurrency: quote };
            }
        }
    }

    // Handle concatenated pairs: XRPINR, DOGEUSDT, ADAINR, COTIINR
    // Strip known quote currencies from the right (longest match first)
    for (const q of KNOWN_QUOTE_CURRENCIES) {
        if (p.endsWith(q) && p.length > q.length) {
            const base = p.slice(0, -q.length);
            if (base.length >= 2) {
                return { asset: base, quoteCurrency: q };
            }
        }
    }

    // Fallback: return as-is if it looks like a single asset (assume INR quote)
    if (p.length >= 2) {
        return { asset: p, quoteCurrency: 'INR' };
    }

    return null;
}

/**
 * Legacy wrapper for backward compatibility with existing tests.
 * Extracts just the base asset from a trading pair string.
 */
function extractAsset(pair: string): string | null {
    const result = extractAssetAndQuote(pair);
    return result ? result.asset : null;
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
    return isNaN(n) ? 0 : Math.abs(n);
}

function emptySummary(): OrderCSVParseResult['summary'] {
    return {
        total_buys: 0,
        total_sells: 0,
        total_inr_volume: 0,
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
    const totalInrVolume = rows.reduce((s, r) => s + r.total_inr, 0);

    // Sort timestamps for date range
    const timestamps = rows.map(r => new Date(r.timestamp).getTime()).sort((a, b) => a - b);
    const from = new Date(timestamps[0]).toISOString().split('T')[0];
    const to = new Date(timestamps[timestamps.length - 1]).toISOString().split('T')[0];

    return {
        total_buys: buys,
        total_sells: sells,
        total_inr_volume: Math.round(totalInrVolume * 100) / 100,
        assets: Array.from(assetsSet).sort(),
        date_range: { from, to },
        financial_years: Array.from(fySet).sort(),
    };
}

