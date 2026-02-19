/**
 * Tax Mitra — CoinDCX CSV Ingestion Engine
 * =========================================
 * Production-ready parsers for each CoinDCX file type:
 *   1. Trades (Spot)        — buy/sell of crypto on CoinDCX
 *   2. Deposits              — fiat/crypto deposits
 *   3. Withdrawals           — fiat/crypto withdrawals
 *   4. TDS Report            — Section 194S TDS certificates
 *   5. Rewards / Staking     — staking, airdrops, interest
 *
 * Design:
 *   - Column-name-based detection (resilient to CoinDCX renaming columns)
 *   - SHA-256 content hashing for idempotent re-imports
 *   - Raw row preservation for full audit trail
 *   - All amounts converted to INR at time of transaction
 */

// ============= TYPES =============

export type CoinDCXFileType =
    | 'trades'
    | 'deposits'
    | 'withdrawals'
    | 'tds'
    | 'rewards'
    | 'generic';

export interface ColumnMapping {
    [logicalName: string]: number; // column index
}

export interface ParsedRow {
    rowNumber: number;
    rawData: Record<string, string>;
    parsed: NormalizedTransaction | null;
    error?: string;
}

export interface NormalizedTransaction {
    externalId: string;
    exchange: string;
    transactionType: string;
    isTaxableEvent: boolean;
    assetSymbol: string;
    quoteAsset: string;
    pair: string;
    quantity: number;
    pricePerUnit: number;
    priceInr: number;
    grossAmountQuote: number;
    grossAmountInr: number;
    feeAmount: number;
    feeAsset: string;
    feeInr: number;
    tdsAmount: number;
    tdsRate: number;
    counterAsset?: string;
    counterQuantity?: number;
    tradeTimestamp: Date;
    financialYear: string;
    assessmentYear: string;
    description: string;
    txHash?: string;
    orderId?: string;
    rawData: Record<string, string>;
    contentHash: string;
}

export interface TDSRecord {
    tdsDate: Date;
    section: string;
    exchange: string;
    grossConsiderationInr: number;
    tdsRate: number;
    tdsAmountInr: number;
    tradeReference: string;
    certificateNumber: string;
    tanOfDeductor: string;
    quarter: string;
    financialYear: string;
    rawData: Record<string, string>;
}

export interface FileParseResult {
    fileType: CoinDCXFileType;
    fileName: string;
    contentHash: string;
    totalRows: number;
    successCount: number;
    errorCount: number;
    duplicateCount: number;
    transactions: NormalizedTransaction[];
    tdsRecords: TDSRecord[];
    errors: { line: number; message: string; rawData?: Record<string, string> }[];
    warnings: string[];
}

export interface ImportSessionResult {
    sessionId: string;
    exchange: string;
    financialYear: string;
    files: FileParseResult[];
    totalTransactions: number;
    totalTDSRecords: number;
    totalErrors: number;
    totalDuplicates: number;
    warnings: string[];
}

// ============= CONSTANTS =============

const KNOWN_QUOTE_ASSETS = ['INR', 'USDT', 'BUSD', 'BTC', 'ETH', 'USDC'];
const TAXABLE_TYPES = ['sell', 'swap_out', 'gift_sent', 'nft_sale'];
const TDS_RATE = 0.01;
const TDS_THRESHOLD_RETAIL = 50000; // ₹50,000 for retail users

// ============= UTILITY FUNCTIONS =============

/**
 * Simple SHA-256 hash (browser-compatible using SubtleCrypto)
 */
export async function computeContentHash(content: string): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: simple hash for non-browser environments
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Compute content hash for a single row (for dedup)
 */
function computeRowHash(row: Record<string, string>): string {
    const key = Object.values(row).join('|');
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Financial year for a given date (Indian FY: Apr→Mar)
 * CRITICAL: Uses IST timezone for FY boundary detection.
 * A trade at 2025-03-31T22:00 UTC = 2025-04-01T03:30 IST → FY 2025-26
 */
function getFinancialYear(date: Date): string {
    // Convert to IST for accurate FY assignment
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const ist = new Date(utcMs + IST_OFFSET_MS);
    const m = ist.getMonth(); // 0-indexed
    const y = ist.getFullYear();
    if (m >= 3) {
        return `${y}-${(y + 1).toString().slice(-2)}`;
    }
    return `${y - 1}-${y.toString().slice(-2)}`;
}

function getAssessmentYear(fy: string): string {
    const start = parseInt(fy.split('-')[0]);
    return `${start + 1}-${((start + 2) % 100).toString().padStart(2, '0')}`;
}

/**
 * Robust date parser handling CoinDCX's various date formats:
 *   - Unix ms (13 digits), Unix s (10 digits)
 *   - ISO 8601
 *   - DD-MM-YYYY, DD/MM/YYYY
 *   - "Jan 15, 2025" style
 */
function parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(NaN);
    const s = dateStr.trim();

    // Unix ms
    if (/^\d{13}$/.test(s)) return new Date(parseInt(s));

    // Unix s
    if (/^\d{10}$/.test(s)) return new Date(parseInt(s) * 1000);

    // ISO: YYYY-MM-DD... (handle 'UTC' suffix from CoinDCX)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        // Replace ' UTC' with 'Z' and spaces before time with 'T' for reliable parsing
        let normalized = s.replace(/\s+UTC\s*$/i, 'Z').replace(/\s+/, 'T');
        const d = new Date(normalized);
        if (!isNaN(d.getTime())) return d;
        // Fallback: try original string
        const d2 = new Date(s);
        if (!isNaN(d2.getTime())) return d2;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmy) {
        const [, day, month, year, h, m, sec] = dmy;
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
            h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0);
        if (!isNaN(d.getTime())) return d;
    }

    // Named month: "Jan 15, 2025" or "15 Jan 2025"
    const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const nm = s.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})|(\w{3})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (nm) {
        let day: number, mi: number, year: number;
        if (nm[1]) {
            day = parseInt(nm[1]);
            mi = months[nm[2].toLowerCase()] ?? -1;
            year = parseInt(nm[3]);
        } else {
            mi = months[nm[4].toLowerCase()] ?? -1;
            day = parseInt(nm[5]);
            year = parseInt(nm[6]);
        }
        if (mi >= 0) {
            const d = new Date(year, mi, day);
            if (!isNaN(d.getTime())) return d;
        }
    }

    // Last resort
    const last = new Date(s);
    return !isNaN(last.getTime()) ? last : new Date(NaN);
}

/**
 * Extract base asset from a pair string
 * e.g., "BTCINR" → "BTC", "ETH/USDT" → "ETH", "BTC-INR" → "BTC"
 */
function extractBaseAsset(pair: string): string {
    if (!pair) return 'UNKNOWN';
    let cleaned = pair.toUpperCase().trim();

    // CoinDCX internal format: strip "I-" prefix (e.g., "I-DOGE_INR" → "DOGE_INR")
    if (/^[A-Z]-/.test(cleaned)) {
        cleaned = cleaned.substring(2);
    }

    // Handle slash/dash/underscore separated pairs
    for (const sep of ['/', '_', '-']) {
        if (cleaned.includes(sep)) {
            const parts = cleaned.split(sep);
            if (parts[0].length >= 2) return parts[0];
        }
    }

    // Handle concatenated pairs (BTCINR, ETHUSDT, DOGEINR)
    for (const quote of KNOWN_QUOTE_ASSETS) {
        if (cleaned.endsWith(quote)) {
            const base = cleaned.slice(0, -quote.length);
            if (base.length >= 2) return base;
        }
    }

    return cleaned;
}

/**
 * Extract quote asset from a pair string
 */
function extractQuoteAsset(pair: string): string {
    if (!pair) return 'INR';
    let cleaned = pair.toUpperCase().trim();

    // CoinDCX internal format: strip "I-" prefix (e.g., "I-DOGE_INR" → "DOGE_INR")
    if (/^[A-Z]-/.test(cleaned)) {
        cleaned = cleaned.substring(2);
    }

    for (const sep of ['/', '_', '-']) {
        if (cleaned.includes(sep)) {
            return cleaned.split(sep).pop() || 'INR';
        }
    }

    for (const quote of KNOWN_QUOTE_ASSETS) {
        if (cleaned.endsWith(quote)) return quote;
    }

    return 'INR';
}

/**
 * Smart column mapper — finds column index by checking multiple possible header names
 */
function findColumn(headers: string[], ...candidates: string[]): number {
    const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const c of candidates) {
        const target = c.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Exact match first
        const exact = lower.indexOf(target);
        if (exact >= 0) return exact;
        // Partial match
        const partial = lower.findIndex(h => h.includes(target) || target.includes(h));
        if (partial >= 0) return partial;
    }
    return -1;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Convert header + row arrays into an object
 */
function rowToRecord(headers: string[], values: string[]): Record<string, string> {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
        record[h] = values[i] || '';
    });
    return record;
}

// ============= FILE PARSERS =============

/**
 * 1. TRADES CSV PARSER
 * ---------------------
 * CoinDCX trade export columns (typical):
 *   Trade Time, Pair/Symbol, Side (Buy/Sell), Quantity, Price, Fee, Fee Currency, Total, Order ID
 */
export function parseCoinDCXTradesCSV(
    csvContent: string,
    fileName: string = 'trades.csv',
    fxRateLookup?: (asset: string, date: Date) => number
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'trades',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
        result.errors.push({ line: 1, message: 'CSV file is empty or has no data rows' });
        return result;
    }

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    // Map columns — supports both CoinDCX "Trade History" AND "Order History" formats
    const col = {
        date: findColumn(headers, 'time', 'date', 'created_at', 'trade_time', 'timestamp', 'order_time', 'order_date'),
        pair: findColumn(headers, 'market', 'pair', 'symbol', 'coin_pair', 'instrument', 'trading_pair'),
        side: findColumn(headers, 'side', 'action', 'type', 'order_type', 'buy_sell', 'direction', 'trade_type'),
        qty: findColumn(headers, 'filled_quantity', 'filled_qty', 'quantity', 'qty', 'amount', 'volume', 'executed_qty', 'traded_quantity'),
        price: findColumn(headers, 'average_price', 'avg_price', 'price', 'rate', 'execution_price', 'price_per_unit'),
        fee: findColumn(headers, 'fee', 'commission', 'fee_amount', 'charges', 'trading_fee'),
        feeCurrency: findColumn(headers, 'fee_currency', 'fee_asset', 'fee_coin'),
        total: findColumn(headers, 'total', 'value', 'net_amount', 'gross_amount', 'total_amount'),
        orderId: findColumn(headers, 'order_id', 'id', 'trade_id', 'txn_id'),
        tds: findColumn(headers, 'tds', 'tds_amount', 'tds_deducted', 'tds_charged'),
        status: findColumn(headers, 'status', 'order_status', 'state'),
        remainingQty: findColumn(headers, 'remaining_quantity', 'remaining_qty', 'unfilled_qty'),
    };

    // Fallback to positional if no headers matched
    if (col.date === -1 && col.qty === -1) {
        result.warnings.push('Could not auto-detect columns — using positional fallback (Date, Pair, Side, Qty, Price, Fee)');
        col.date = 0; col.pair = 1; col.side = 2; col.qty = 3; col.price = 4; col.fee = 5;
    }

    const seenHashes = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 3) continue;

            const rawData = rowToRecord(headers, values);
            const rowHash = computeRowHash(rawData);

            // Dedup within this file
            if (seenHashes.has(rowHash)) {
                result.duplicateCount++;
                continue;
            }
            seenHashes.add(rowHash);

            // Skip non-filled orders (cancelled, open, rejected)
            // BUT keep partially_cancelled and partially_filled (they have filled qty)
            if (col.status >= 0) {
                const statusVal = values[col.status]?.toLowerCase().trim() || '';
                if (statusVal === 'cancelled' || statusVal === 'rejected' || statusVal === 'open' || statusVal === 'init' || statusVal === 'untriggered') {
                    result.warnings.push(`Row ${i + 1}: Skipped ${statusVal} order`);
                    continue;
                }
            }

            const dateStr = col.date >= 0 ? values[col.date] : '';
            const pairStr = col.pair >= 0 ? values[col.pair] : '';
            const sideStr = col.side >= 0 ? values[col.side] : 'buy';
            let qtyStr = col.qty >= 0 ? values[col.qty] : '0';
            const priceStr = col.price >= 0 ? values[col.price] : '0';
            const feeStr = col.fee >= 0 ? values[col.fee] : '0';
            const feeCurrStr = col.feeCurrency >= 0 ? values[col.feeCurrency] : 'INR';
            const orderIdStr = col.orderId >= 0 ? values[col.orderId] : `coindcx-${i}`;
            const totalStr = col.total >= 0 ? values[col.total] : '';

            // For partially_cancelled orders: filled qty = total qty - remaining qty
            if (col.status >= 0 && col.remainingQty >= 0) {
                const statusVal = values[col.status]?.toLowerCase().trim() || '';
                if (statusVal.includes('partial')) {
                    const totalQty = Math.abs(parseFloat(qtyStr) || 0);
                    const remainQty = Math.abs(parseFloat(values[col.remainingQty]) || 0);
                    const filledQty = totalQty - remainQty;
                    if (filledQty > 0) {
                        qtyStr = filledQty.toString();
                        result.warnings.push(`Row ${i + 1}: Partially filled — using filled qty ${filledQty} (total ${totalQty} - remaining ${remainQty})`);
                    } else {
                        result.warnings.push(`Row ${i + 1}: Skipped partially_cancelled order with 0 filled qty`);
                        continue;
                    }
                }
            }
            const tdsStr = col.tds >= 0 ? values[col.tds] : '0';

            // Parse fields
            const tradeDate = parseDate(dateStr);
            if (isNaN(tradeDate.getTime())) {
                result.errors.push({ line: i + 1, message: `Invalid date: "${dateStr}"`, rawData });
                result.errorCount++;
                continue;
            }

            const quantity = Math.abs(parseFloat(qtyStr) || 0);
            const pricePerUnit = Math.abs(parseFloat(priceStr) || 0);
            const feeAmount = Math.abs(parseFloat(feeStr) || 0);
            const tdsAmount = Math.abs(parseFloat(tdsStr) || 0);

            if (quantity === 0) {
                result.errors.push({ line: i + 1, message: 'Quantity is zero — skipping', rawData });
                result.errorCount++;
                continue;
            }

            const baseAsset = extractBaseAsset(pairStr);
            const quoteAsset = extractQuoteAsset(pairStr);
            const sideNorm = sideStr.toLowerCase().trim();
            const isBuy = sideNorm.includes('buy') || sideNorm === 'b';
            const txType = isBuy ? 'buy' : 'sell';

            // ── INR conversion ──
            // Priority: use the CSV 'total' column as the authoritative INR amount when available.
            // CoinDCX exports include a 'total' column with the exact INR trade value.
            // Recomputing quantity × price can differ due to rounding or fee inclusion.
            const totalFromCsv = totalStr ? Math.abs(parseFloat(totalStr) || 0) : 0;

            let priceInr = pricePerUnit;
            let grossAmountInr: number;

            if (totalFromCsv > 0 && quoteAsset === 'INR') {
                // Use the exact total from the CSV (most accurate)
                grossAmountInr = totalFromCsv;
                // Derive priceInr from total for consistency
                priceInr = quantity > 0 ? totalFromCsv / quantity : pricePerUnit;
            } else {
                // Non-INR pair or no total column — compute from price
                if (quoteAsset !== 'INR') {
                    if (fxRateLookup) {
                        const rate = fxRateLookup(quoteAsset, tradeDate);
                        priceInr = pricePerUnit * rate;
                    } else {
                        const defaultRates: Record<string, number> = {
                            'USDT': 84, 'USDC': 84, 'BUSD': 84,
                            'BTC': 7500000, 'ETH': 250000
                        };
                        priceInr = pricePerUnit * (defaultRates[quoteAsset] || 84);
                        result.warnings.push(`Row ${i + 1}: Used default FX rate for ${quoteAsset}/INR. For accuracy, upload FX data.`);
                    }
                }
                grossAmountInr = quantity * priceInr;
            }

            const feeInr = feeCurrStr.toUpperCase() === 'INR' ? feeAmount : feeAmount * priceInr;
            const fy = getFinancialYear(tradeDate);
            const ay = getAssessmentYear(fy);

            // Compute TDS: if not provided in CSV, estimate 1% on ALL sell consideration
            // CoinDCX deducts 1% TDS (Section 194S) on every sell transaction
            // The ₹50K threshold is applied at the aggregate level by the exchange, not per-tx
            let computedTds = tdsAmount;
            if (computedTds === 0 && txType === 'sell' && grossAmountInr > 0) {
                computedTds = grossAmountInr * TDS_RATE;
            }

            const tx: NormalizedTransaction = {
                externalId: orderIdStr,
                exchange: 'CoinDCX',
                transactionType: txType,
                isTaxableEvent: txType === 'sell',
                assetSymbol: baseAsset,
                quoteAsset,
                pair: `${baseAsset}/${quoteAsset}`,
                quantity,
                pricePerUnit,
                priceInr,
                grossAmountQuote: quantity * pricePerUnit,
                grossAmountInr,
                feeAmount,
                feeAsset: feeCurrStr.toUpperCase(),
                feeInr,
                tdsAmount: computedTds,
                tdsRate: TDS_RATE,
                tradeTimestamp: tradeDate,
                financialYear: fy,
                assessmentYear: ay,
                description: `${txType.toUpperCase()} ${quantity} ${baseAsset} @ ${priceInr.toFixed(2)} INR on CoinDCX`,
                orderId: orderIdStr,
                rawData,
                contentHash: rowHash,
            };

            result.transactions.push(tx);
            result.successCount++;

        } catch (err) {
            result.errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

/**
 * 2. DEPOSITS CSV PARSER
 * ----------------------
 * Non-taxable events — used for inventory tracking only
 */
export function parseCoinDCXDepositsCSV(
    csvContent: string,
    fileName: string = 'deposits.csv'
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'deposits',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return result;

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    const col = {
        date: findColumn(headers, 'time', 'date', 'created_at', 'timestamp'),
        asset: findColumn(headers, 'asset', 'coin', 'currency', 'token', 'symbol'),
        qty: findColumn(headers, 'quantity', 'amount', 'volume', 'size'),
        txHash: findColumn(headers, 'txid', 'tx_hash', 'hash', 'transaction_id', 'reference'),
        source: findColumn(headers, 'source', 'from', 'sender', 'network'),
        status: findColumn(headers, 'status', 'state'),
    };

    // Fallback
    if (col.date === -1) { col.date = 0; col.asset = 1; col.qty = 2; }

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const rawData = rowToRecord(headers, values);

            // Skip failed deposits
            const status = col.status >= 0 ? values[col.status]?.toLowerCase() : 'completed';
            if (status.includes('fail') || status.includes('cancel')) continue;

            const asset = col.asset >= 0 ? values[col.asset].toUpperCase().trim() : 'UNKNOWN';
            const quantity = Math.abs(parseFloat(col.qty >= 0 ? values[col.qty] : '0') || 0);
            const depositDate = parseDate(col.date >= 0 ? values[col.date] : '');

            if (isNaN(depositDate.getTime()) || quantity === 0) {
                result.errors.push({ line: i + 1, message: 'Invalid date or zero quantity', rawData });
                result.errorCount++;
                continue;
            }

            const fy = getFinancialYear(depositDate);

            const tx: NormalizedTransaction = {
                externalId: col.txHash >= 0 ? values[col.txHash] : `deposit-${i}`,
                exchange: 'CoinDCX',
                transactionType: 'deposit',
                isTaxableEvent: false,
                assetSymbol: asset,
                quoteAsset: 'INR',
                pair: `${asset}/INR`,
                quantity,
                pricePerUnit: 0,
                priceInr: 0,
                grossAmountQuote: 0,
                grossAmountInr: 0,
                feeAmount: 0,
                feeAsset: 'INR',
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: depositDate,
                financialYear: fy,
                assessmentYear: getAssessmentYear(fy),
                description: `DEPOSIT ${quantity} ${asset} into CoinDCX`,
                txHash: col.txHash >= 0 ? values[col.txHash] : undefined,
                rawData,
                contentHash: computeRowHash(rawData),
            };

            result.transactions.push(tx);
            result.successCount++;
        } catch (err) {
            result.errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

/**
 * 3. WITHDRAWALS CSV PARSER
 * -------------------------
 * Non-taxable events — used for inventory tracking only
 */
export function parseCoinDCXWithdrawalsCSV(
    csvContent: string,
    fileName: string = 'withdrawals.csv'
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'withdrawals',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return result;

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    const col = {
        date: findColumn(headers, 'time', 'date', 'created_at', 'timestamp'),
        asset: findColumn(headers, 'asset', 'coin', 'currency', 'token', 'symbol'),
        qty: findColumn(headers, 'quantity', 'amount', 'volume'),
        fee: findColumn(headers, 'fee', 'withdrawal_fee', 'network_fee'),
        feeAsset: findColumn(headers, 'fee_asset', 'fee_currency'),
        txHash: findColumn(headers, 'txid', 'tx_hash', 'hash', 'transaction_id'),
        destination: findColumn(headers, 'destination', 'to', 'address', 'recipient'),
        status: findColumn(headers, 'status', 'state'),
    };

    if (col.date === -1) { col.date = 0; col.asset = 1; col.qty = 2; }

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const rawData = rowToRecord(headers, values);

            const status = col.status >= 0 ? values[col.status]?.toLowerCase() : 'completed';
            if (status.includes('fail') || status.includes('cancel') || status.includes('pending')) continue;

            const asset = col.asset >= 0 ? values[col.asset].toUpperCase().trim() : 'UNKNOWN';
            const quantity = Math.abs(parseFloat(col.qty >= 0 ? values[col.qty] : '0') || 0);
            const wdDate = parseDate(col.date >= 0 ? values[col.date] : '');
            const fee = Math.abs(parseFloat(col.fee >= 0 ? values[col.fee] : '0') || 0);

            if (isNaN(wdDate.getTime()) || quantity === 0) {
                result.errors.push({ line: i + 1, message: 'Invalid date or zero quantity', rawData });
                result.errorCount++;
                continue;
            }

            const fy = getFinancialYear(wdDate);

            const tx: NormalizedTransaction = {
                externalId: col.txHash >= 0 ? values[col.txHash] : `withdrawal-${i}`,
                exchange: 'CoinDCX',
                transactionType: 'withdrawal',
                isTaxableEvent: false,
                assetSymbol: asset,
                quoteAsset: 'INR',
                pair: `${asset}/INR`,
                quantity,
                pricePerUnit: 0,
                priceInr: 0,
                grossAmountQuote: 0,
                grossAmountInr: 0,
                feeAmount: fee,
                feeAsset: col.feeAsset >= 0 ? values[col.feeAsset]?.toUpperCase() || asset : asset,
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: wdDate,
                financialYear: fy,
                assessmentYear: getAssessmentYear(fy),
                description: `WITHDRAWAL ${quantity} ${asset} from CoinDCX`,
                txHash: col.txHash >= 0 ? values[col.txHash] : undefined,
                rawData,
                contentHash: computeRowHash(rawData),
            };

            result.transactions.push(tx);
            result.successCount++;
        } catch (err) {
            result.errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

/**
 * 4. TDS REPORT CSV PARSER
 * -------------------------
 * Section 194S TDS certificates/report from CoinDCX
 */
export function parseCoinDCXTDSCSV(
    csvContent: string,
    fileName: string = 'tds.csv'
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'tds',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return result;

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    const col = {
        date: findColumn(headers, 'date', 'time', 'tds_date', 'deduction_date', 'timestamp', 'transaction_date'),
        asset: findColumn(headers, 'asset', 'coin', 'symbol', 'token', 'currency'),
        qty: findColumn(headers, 'quantity', 'qty', 'amount_sold', 'volume'),
        consideration: findColumn(headers, 'consideration', 'gross_amount', 'amount', 'sale_amount', 'value', 'total', 'gross_consideration'),
        tdsAmount: findColumn(headers, 'tds_amount', 'tds', 'tax_deducted', 'deduction', 'tds_inr', 'tds_deducted'),
        tdsRate: findColumn(headers, 'tds_rate', 'rate', 'rate_percent'),
        tradeRef: findColumn(headers, 'trade_id', 'reference', 'transaction_id', 'order_id', 'trade_reference'),
        certificate: findColumn(headers, 'certificate', 'cert_no', 'certificate_number'),
        tan: findColumn(headers, 'tan', 'tan_number', 'deductor_tan'),
        section: findColumn(headers, 'section'),
        quarter: findColumn(headers, 'quarter', 'q'),
    };

    if (col.date === -1 || col.tdsAmount === -1) {
        // Try ultra-minimal: Date, Amount, TDS
        col.date = 0;
        col.consideration = 1;
        col.tdsAmount = 2;
        result.warnings.push('TDS CSV headers not recognized — using positional fallback');
    }

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const rawData = rowToRecord(headers, values);
            const tdsDate = parseDate(col.date >= 0 ? values[col.date] : '');
            const consideration = Math.abs(parseFloat(col.consideration >= 0 ? values[col.consideration] : '0') || 0);
            const tdsAmt = Math.abs(parseFloat(col.tdsAmount >= 0 ? values[col.tdsAmount] : '0') || 0);

            if (isNaN(tdsDate.getTime()) || tdsAmt === 0) {
                result.errors.push({ line: i + 1, message: 'Invalid TDS date or zero amount', rawData });
                result.errorCount++;
                continue;
            }

            const fy = getFinancialYear(tdsDate);

            // Determine quarter
            const month = tdsDate.getMonth();
            let quarter = 'Q4';
            if (month >= 3 && month <= 5) quarter = 'Q1';
            else if (month >= 6 && month <= 8) quarter = 'Q2';
            else if (month >= 9 && month <= 11) quarter = 'Q3';

            const record: TDSRecord = {
                tdsDate,
                section: col.section >= 0 ? values[col.section] || '194S' : '194S',
                exchange: 'CoinDCX',
                grossConsiderationInr: consideration,
                tdsRate: col.tdsRate >= 0 ? parseFloat(values[col.tdsRate]) / 100 || TDS_RATE : TDS_RATE,
                tdsAmountInr: tdsAmt,
                tradeReference: col.tradeRef >= 0 ? values[col.tradeRef] || '' : '',
                certificateNumber: col.certificate >= 0 ? values[col.certificate] || '' : '',
                tanOfDeductor: col.tan >= 0 ? values[col.tan] || '' : '',
                quarter: col.quarter >= 0 ? values[col.quarter] || quarter : quarter,
                financialYear: fy,
                rawData,
            };

            result.tdsRecords.push(record);

            // CRITICAL: Generate a synthetic SELL transaction from the TDS record.
            // This ensures that even if 'Insta' or 'P2P' trades are missing from the API/Trades CSV,
            // the sale consideration (and thus Capital Gains) is captured.
            const asset = col.asset >= 0 ? values[col.asset].toUpperCase().trim() : 'USDT';
            const quantity = col.qty >= 0 ? Math.abs(parseFloat(values[col.qty]) || 0) : 0;

            // Generate transaction for the sell event recorded in TDS summary
            const sellTx: NormalizedTransaction = {
                externalId: record.tradeReference || `tds-sell-${fy}-${i}`,
                exchange: 'CoinDCX',
                transactionType: 'sell',
                isTaxableEvent: true,
                assetSymbol: asset,
                quoteAsset: 'INR',
                pair: `${asset}/INR`,
                quantity: quantity || (consideration / 100000), // Fallback if qty missing (unlikely in TDS report)
                pricePerUnit: quantity > 0 ? consideration / quantity : 0,
                priceInr: quantity > 0 ? consideration / quantity : 0,
                grossAmountQuote: consideration,
                grossAmountInr: consideration,
                feeAmount: 0,
                feeAsset: 'INR',
                feeInr: 0,
                tdsAmount: tdsAmt,
                tdsRate: record.tdsRate,
                tradeTimestamp: tdsDate,
                financialYear: fy,
                assessmentYear: getAssessmentYear(fy),
                description: `SELL ${quantity || ''} ${asset} (from TDS Summary report)`,
                orderId: record.tradeReference,
                rawData,
                contentHash: computeRowHash(rawData) + '-sell',
            };

            result.transactions.push(sellTx);
            result.successCount++;

        } catch (err) {
            result.errors.push({ line: i + 1, message: `TDS parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

/**
 * 5. REWARDS / STAKING CSV PARSER
 * --------------------------------
 * Staking rewards, airdrops, referral bonuses, lending interest
 * These are taxable as "Other Income" under Section 56 at slab rates
 * (though VDA rewards may also fall under 115BBH — conservative: tax at 30%)
 */
export function parseCoinDCXRewardsCSV(
    csvContent: string,
    fileName: string = 'rewards.csv',
    fxRateLookup?: (asset: string, date: Date) => number
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'rewards',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return result;

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    const col = {
        date: findColumn(headers, 'time', 'date', 'created_at', 'timestamp'),
        asset: findColumn(headers, 'asset', 'coin', 'currency', 'token', 'reward_coin'),
        qty: findColumn(headers, 'quantity', 'amount', 'reward_amount', 'earned'),
        type: findColumn(headers, 'reward_type', 'type', 'category', 'source'),
        value: findColumn(headers, 'value', 'value_inr', 'worth', 'inr_value'),
        id: findColumn(headers, 'id', 'reward_id', 'reference'),
    };

    if (col.date === -1) { col.date = 0; col.asset = 1; col.qty = 2; }

    const rewardTypeMap: Record<string, string> = {
        'staking': 'reward_staking',
        'stake': 'reward_staking',
        'lending': 'reward_interest',
        'interest': 'reward_interest',
        'airdrop': 'reward_airdrop',
        'referral': 'reward_airdrop',
        'bonus': 'reward_airdrop',
        'mining': 'reward_mining',
        'cashback': 'reward_airdrop',
        'settlement': 'reward_airdrop', // Treat settlements as zero-cost acquisitions/adjustments
        'reward': 'reward_airdrop',
    };

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const rawData = rowToRecord(headers, values);
            const asset = col.asset >= 0 ? values[col.asset].toUpperCase().trim() : 'UNKNOWN';
            const quantity = Math.abs(parseFloat(col.qty >= 0 ? values[col.qty] : '0') || 0);
            const rewardDate = parseDate(col.date >= 0 ? values[col.date] : '');

            if (isNaN(rewardDate.getTime()) || quantity === 0) {
                result.errors.push({ line: i + 1, message: 'Invalid date or zero quantity', rawData });
                result.errorCount++;
                continue;
            }

            // Determine reward type
            const typeStr = col.type >= 0 ? values[col.type]?.toLowerCase().trim() : 'reward';
            let txType = 'reward_airdrop';
            for (const [key, val] of Object.entries(rewardTypeMap)) {
                if (typeStr.includes(key)) { txType = val; break; }
            }

            // Get INR value
            let priceInr = 0;
            if (asset === 'INR') {
                priceInr = 1;
            } else if (col.value >= 0 && values[col.value]) {
                const totalValue = Math.abs(parseFloat(values[col.value].replace(/[^\d.]/g, '')) || 0);
                priceInr = quantity > 0 ? totalValue / quantity : 0;
            }

            if (priceInr === 0 && asset !== 'INR' && fxRateLookup) {
                priceInr = fxRateLookup(asset, rewardDate);
            }


            const fy = getFinancialYear(rewardDate);

            const tx: NormalizedTransaction = {
                externalId: col.id >= 0 ? values[col.id] : `reward-${i}`,
                exchange: 'CoinDCX',
                transactionType: txType,
                isTaxableEvent: false, // Taxed as other income, not capital gain
                assetSymbol: asset,
                quoteAsset: 'INR',
                pair: `${asset}/INR`,
                quantity,
                pricePerUnit: priceInr,
                priceInr,
                grossAmountQuote: quantity * priceInr,
                grossAmountInr: quantity * priceInr,
                feeAmount: 0,
                feeAsset: 'INR',
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: rewardDate,
                financialYear: fy,
                assessmentYear: getAssessmentYear(fy),
                description: `${txType.toUpperCase()} ${quantity} ${asset} from CoinDCX`,
                rawData,
                contentHash: computeRowHash(rawData),
            };

            result.transactions.push(tx);
            result.successCount++;

        } catch (err) {
            result.errors.push({ line: i + 1, message: `Reward parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

// ============= WAZIRX PARSER =============

/**
 * 6. WAZIRX TRADES CSV PARSER
 * ----------------------------
 * WazirX trade export columns (typical):
 *   Date, Market (e.g. BTC/INR), Price, Volume, Amount, Side (Buy/Sell), Fee, Fee Currency, TDS
 * 
 * Note: WazirX exports XLSX — user should save as CSV or use the flat-file version.
 */
export function parseWazirXTradesCSV(
    csvContent: string,
    fileName: string = 'wazirx_trades.csv',
    fxRateLookup?: (asset: string, date: Date) => number
): FileParseResult {
    const result: FileParseResult = {
        fileType: 'trades',
        fileName,
        contentHash: '',
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        transactions: [],
        tdsRecords: [],
        errors: [],
        warnings: []
    };

    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
        result.errors.push({ line: 1, message: 'CSV file is empty or has no data rows' });
        return result;
    }

    const headers = parseCSVLine(lines[0]);
    result.totalRows = lines.length - 1;

    // WazirX specific column mapping
    const col = {
        date: findColumn(headers, 'date', 'time', 'created_at', 'timestamp', 'trade_date'),
        market: findColumn(headers, 'market', 'pair', 'symbol', 'coin_pair', 'trading_pair'),
        price: findColumn(headers, 'price', 'rate', 'avg_price', 'execution_price'),
        volume: findColumn(headers, 'volume', 'quantity', 'qty', 'amount', 'filled_qty', 'traded_quantity'),
        amount: findColumn(headers, 'amount', 'total', 'value', 'net_amount'),
        side: findColumn(headers, 'side', 'type', 'action', 'buy_sell', 'trade_type'),
        fee: findColumn(headers, 'fee', 'commission', 'charges', 'trading_fee'),
        feeCurrency: findColumn(headers, 'fee_currency', 'fee_asset', 'fee_coin'),
        tds: findColumn(headers, 'tds', 'tds_charged', 'tds_amount', 'tds_deducted'),
        orderId: findColumn(headers, 'order_id', 'id', 'trade_id', 'txn_id'),
    };

    // Fallback
    if (col.date === -1 && col.volume === -1) {
        result.warnings.push('Could not auto-detect WazirX columns — using positional fallback');
        col.date = 0; col.market = 1; col.price = 2; col.volume = 3; col.amount = 4; col.side = 5; col.fee = 6;
    }

    const seenHashes = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
        try {
            const values = parseCSVLine(lines[i]);
            if (values.length < 3) continue;

            const rawData = rowToRecord(headers, values);
            const rowHash = computeRowHash(rawData);

            if (seenHashes.has(rowHash)) {
                result.duplicateCount++;
                continue;
            }
            seenHashes.add(rowHash);

            const dateStr = col.date >= 0 ? values[col.date] : '';
            const marketStr = col.market >= 0 ? values[col.market] : '';
            const priceStr = col.price >= 0 ? values[col.price] : '0';
            const volumeStr = col.volume >= 0 ? values[col.volume] : '0';
            const sideStr = col.side >= 0 ? values[col.side] : 'buy';
            const feeStr = col.fee >= 0 ? values[col.fee] : '0';
            const feeCurrStr = col.feeCurrency >= 0 ? values[col.feeCurrency] : 'INR';
            const tdsStr = col.tds >= 0 ? values[col.tds] : '0';
            const orderIdStr = col.orderId >= 0 ? values[col.orderId] : `wazirx-${i}`;

            const tradeDate = parseDate(dateStr);
            if (isNaN(tradeDate.getTime())) {
                result.errors.push({ line: i + 1, message: `Invalid date: "${dateStr}"`, rawData });
                result.errorCount++;
                continue;
            }

            const quantity = Math.abs(parseFloat(volumeStr) || 0);
            const pricePerUnit = Math.abs(parseFloat(priceStr) || 0);
            const feeAmount = Math.abs(parseFloat(feeStr) || 0);
            const tdsAmount = Math.abs(parseFloat(tdsStr) || 0);

            if (quantity === 0) {
                result.errors.push({ line: i + 1, message: 'Volume is zero — skipping', rawData });
                result.errorCount++;
                continue;
            }

            // WazirX market format: "BTC/INR" or "ETH/USDT" 
            const baseAsset = extractBaseAsset(marketStr);
            const quoteAsset = extractQuoteAsset(marketStr);
            const sideNorm = sideStr.toLowerCase().trim();
            const isBuy = sideNorm.includes('buy') || sideNorm === 'b';
            const txType = isBuy ? 'buy' : 'sell';

            // INR conversion
            let priceInr = pricePerUnit;
            if (quoteAsset !== 'INR') {
                if (fxRateLookup) {
                    const rate = fxRateLookup(quoteAsset, tradeDate);
                    priceInr = pricePerUnit * rate;
                } else {
                    const defaultRates: Record<string, number> = {
                        'USDT': 84, 'USDC': 84, 'BUSD': 84,
                        'BTC': 7500000, 'ETH': 250000, 'WRX': 15
                    };
                    priceInr = pricePerUnit * (defaultRates[quoteAsset] || 84);
                    result.warnings.push(`Row ${i + 1}: Used default FX rate for ${quoteAsset}/INR.`);
                }
            }

            const grossAmountInr = quantity * priceInr;
            const feeInr = feeCurrStr.toUpperCase() === 'INR' ? feeAmount : feeAmount * priceInr;
            const fy = getFinancialYear(tradeDate);
            const ay = getAssessmentYear(fy);

            // TDS estimation: 1% on ALL sell transactions (Section 194S)
            let computedTds = tdsAmount;
            if (computedTds === 0 && txType === 'sell' && grossAmountInr > 0) {
                computedTds = grossAmountInr * TDS_RATE;
            }

            const tx: NormalizedTransaction = {
                externalId: orderIdStr,
                exchange: 'WazirX',
                transactionType: txType,
                isTaxableEvent: txType === 'sell',
                assetSymbol: baseAsset,
                quoteAsset,
                pair: `${baseAsset}/${quoteAsset}`,
                quantity,
                pricePerUnit,
                priceInr,
                grossAmountQuote: quantity * pricePerUnit,
                grossAmountInr,
                feeAmount,
                feeAsset: feeCurrStr.toUpperCase(),
                feeInr,
                tdsAmount: computedTds,
                tdsRate: TDS_RATE,
                tradeTimestamp: tradeDate,
                financialYear: fy,
                assessmentYear: ay,
                description: `${txType.toUpperCase()} ${quantity} ${baseAsset} @ ${priceInr.toFixed(2)} INR on WazirX`,
                orderId: orderIdStr,
                rawData,
                contentHash: rowHash,
            };

            result.transactions.push(tx);
            result.successCount++;

        } catch (err) {
            result.errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
            result.errorCount++;
        }
    }

    return result;
}

// ============= AUTO-DETECT FILE TYPE =============

/**
 * Auto-detect the CoinDCX CSV file type based on headers
 */
export function detectCoinDCXFileType(csvContent: string): CoinDCXFileType {
    const firstLine = csvContent.split('\n')[0]?.toLowerCase() || '';

    // Check for TRADE indicators FIRST — this is critical because CoinDCX Order History
    // CSV has a "Tds" column that would falsely match the TDS check below.
    const hasTradeIndicators = firstLine.includes('side') || firstLine.includes('pair') ||
        firstLine.includes('market') || firstLine.includes('action') ||
        firstLine.includes('avg price') || firstLine.includes('average_price') ||
        firstLine.includes('filled_quantity') || firstLine.includes('total quantity') ||
        firstLine.includes('price per unit') || firstLine.includes('order id') ||
        firstLine.includes('volume') || firstLine.includes('quantity');

    if (hasTradeIndicators) {
        return 'trades';
    }

    // Check for TDS indicators
    if (firstLine.includes('tds') || firstLine.includes('deduct') || firstLine.includes('certificate') || firstLine.includes('tan_number')) {
        return 'tds';
    }
    if (firstLine.includes('reward') || firstLine.includes('staking') || firstLine.includes('airdrop') || firstLine.includes('earned')) {
        return 'rewards';
    }
    if (firstLine.includes('deposit') || (firstLine.includes('type') && firstLine.includes('credit'))) {
        return 'deposits';
    }
    if (firstLine.includes('withdrawal') || firstLine.includes('withdraw')) {
        return 'withdrawals';
    }

    // Fallback: treat unknown files as trades (most common download)
    return 'trades';
}

/**
 * Parse any CoinDCX CSV by auto-detecting the file type
 */
export function parseCoinDCXFile(
    csvContent: string,
    fileName: string,
    fileTypeHint?: CoinDCXFileType,
    fxRateLookup?: (asset: string, date: Date) => number
): FileParseResult {
    const fileType = fileTypeHint || detectCoinDCXFileType(csvContent);

    switch (fileType) {
        case 'trades':
            return parseCoinDCXTradesCSV(csvContent, fileName, fxRateLookup);
        case 'deposits':
            return parseCoinDCXDepositsCSV(csvContent, fileName);
        case 'withdrawals':
            return parseCoinDCXWithdrawalsCSV(csvContent, fileName);
        case 'tds':
            return parseCoinDCXTDSCSV(csvContent, fileName);
        case 'rewards':
            return parseCoinDCXRewardsCSV(csvContent, fileName, fxRateLookup);
        default:
            // Fallback: try as trades
            return parseCoinDCXTradesCSV(csvContent, fileName, fxRateLookup);
    }
}

// ============= MULTI-FILE IMPORT SESSION =============

/**
 * Process a complete import session with multiple CSV files.
 * Supports CoinDCX and WazirX exchanges.
 * 
 * Usage:
 *   const files = [
 *     { name: 'trades_fy25.csv', content: '...', type: 'trades' },
 *     { name: 'tds_report.csv', content: '...', type: 'tds' },
 *   ];
 *   const result = await processImportSession('sess-123', '2025-26', files, undefined, 'CoinDCX');
 */
export async function processImportSession(
    sessionId: string,
    financialYear: string,
    files: { name: string; content: string; type?: CoinDCXFileType }[],
    fxRateLookup?: (asset: string, date: Date) => number,
    exchange: string = 'CoinDCX'
): Promise<ImportSessionResult> {
    const session: ImportSessionResult = {
        sessionId,
        exchange,
        financialYear,
        files: [],
        totalTransactions: 0,
        totalTDSRecords: 0,
        totalErrors: 0,
        totalDuplicates: 0,
        warnings: [],
    };

    const globalHashes = new Set<string>();

    for (const file of files) {
        // Compute file-level hash for dedup
        const fileHash = await computeContentHash(file.content);

        // Route to correct parser based on exchange
        let parseResult: FileParseResult;
        if (exchange.toLowerCase() === 'wazirx') {
            parseResult = parseWazirXTradesCSV(file.content, file.name, fxRateLookup);
        } else {
            parseResult = parseCoinDCXFile(file.content, file.name, file.type, fxRateLookup);
        }
        parseResult.contentHash = fileHash;

        // Detect actual FY from transaction data
        const fyPrefix = financialYear; // e.g., '2024-25' (user's selected FY)
        const fyStartYear = parseInt(fyPrefix.split('-')[0]);

        // Count how many transactions belong to each FY
        const fyCounts: Record<string, number> = {};
        for (const tx of parseResult.transactions) {
            fyCounts[tx.financialYear] = (fyCounts[tx.financialYear] || 0) + 1;
        }

        // Auto-detect: if NO transactions match selected FY, use the most common FY from data
        const hasMatchingFY = fyCounts[fyPrefix] > 0;
        let effectiveFY = fyPrefix;
        if (!hasMatchingFY && Object.keys(fyCounts).length > 0) {
            // Find the FY with the most transactions
            const detectedFY = Object.entries(fyCounts).sort((a, b) => b[1] - a[1])[0][0];
            session.warnings.push(
                `⚠️ FY mismatch: Your CSV data is from FY ${detectedFY}, but you selected FY ${fyPrefix}. Auto-using FY ${detectedFY} from the data.`
            );
            effectiveFY = detectedFY;
        }

        const effectiveFYStart = parseInt(effectiveFY.split('-')[0]);

        // No longer filter by FY during ingestion. Keep ALL transactions for full wallet history.
        // This is critical for FIFO to track lots across multiple years.
        session.warnings.push(`${file.name}: Imported ${parseResult.transactions.length} total records into wallet history.`);


        // SMART RECONCILIATION: Merge data across files using Order IDs
        // Trade files (Spot/Margin/Insta) are highly detailed.
        // TDS files are the source of truth for Sale Consideration.
        const dedupedTx: NormalizedTransaction[] = [];
        for (const tx of parseResult.transactions) {
            // Priority 1: Check if we have seen this EXACT content hash (exact same row)
            if (globalHashes.has(tx.contentHash)) {
                parseResult.duplicateCount++;
                continue;
            }

            // Priority 2: Check if we have seen this Order ID/External ID (different file type for same trade)
            if (tx.orderId || tx.externalId) {
                const id = tx.orderId || tx.externalId;
                const existing = dedupedTx.find(t => t.orderId === id || t.externalId === id);

                if (existing) {
                    // We already have this trade from another file in this session.
                    // Merge info: e.g., if existing is from 'trades' and new is from 'tds', 
                    // ensure existing has the authoritative TDS amount.
                    if (parseResult.fileType === 'tds') {
                        existing.tdsAmount = tx.tdsAmount || existing.tdsAmount;
                        existing.rawData = { ...existing.rawData, ...tx.rawData };
                        parseResult.duplicateCount++;
                        continue;
                    }
                    // If existing is from 'tds' (synthetic) and new is from 'trades' (real), 
                    // replacement is better because 'trades' has qty/price.
                    if (existing.description?.includes('from TDS Summary')) {
                        // Replace synthetic with real
                        const idx = dedupedTx.indexOf(existing);
                        dedupedTx[idx] = tx;
                        continue;
                    }
                }
            }

            globalHashes.add(tx.contentHash);
            dedupedTx.push(tx);
        }
        parseResult.transactions = dedupedTx;

        session.files.push(parseResult);
        session.totalTransactions = dedupedTx.length + (session.totalTransactions || 0);
        session.totalTDSRecords += parseResult.tdsRecords.length;
        session.totalErrors += parseResult.errorCount;
        session.totalDuplicates += parseResult.duplicateCount;
        session.warnings.push(...parseResult.warnings);
    }

    // Validate session
    if (session.totalTransactions === 0 && session.totalTDSRecords === 0) {
        session.warnings.push('⚠️ No transactions or TDS records found for the selected financial year.');
    }

    return session;
}
