/**
 * Vercel Serverless Function — CoinDCX Order History CSV Upload
 *
 * POST /api/crypto/upload/order-history
 *   Content-Type: multipart/form-data OR application/json with { csv: "..." }
 *   Auth: Bearer JWT (Supabase access token)
 *
 * CoinDCX Order History CSV columns (actual):
 *   Order ID | Market | Pair | Total Quantity | Remaining Quantity |
 *   Price Per Unit | Avg Price | Fee Amount | Total Tds INR |
 *   Side | Order Type | Status | Exchange code | Created At | Updated At
 *
 * CRITICAL FIXES (v7):
 *   1. Non-INR pairs (ACA_USDT, ONDO_USDT) = TWO trades:
 *      sell ACA_USDT → SELL ACA + BUY USDT
 *      buy ONDO_USDT → BUY ONDO + SELL USDT
 *   2. USDT→INR conversion: INR_value = Total_TDS_INR / 0.01
 *   3. Partial fills: filledQty = Total Quantity - Remaining Quantity
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────────
interface ParsedTrade {
    user_id: string;
    type: 'buy' | 'sell';
    asset: string;
    quote_currency: string;
    quantity: number;
    price_per_unit: number;
    value_inr: number;
    fee_inr: number;
    tds_inr: number;
    qty_remaining: number | null;
    trade_date: string;
    financial_year: string;
    exchange: string;
    csv_source: string;
    external_id: string;
}

interface ParseError {
    row: number;
    issue: string;
}

// ─── Quote currencies for market pair parsing ───────────────────
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
            // Raw string body
            csvText = req.body;
        } else if (req.body?.csv) {
            // JSON body with { csv: "..." }
            csvText = req.body.csv;
        } else if (req.body?.file) {
            // Multipart/form-data (if Vercel parses it)
            const fileData = req.body.file;
            if (Buffer.isBuffer(fileData)) csvText = fileData.toString('utf-8');
            else if (typeof fileData === 'string') csvText = fileData;
            else if (fileData?.data) csvText = Buffer.from(fileData.data).toString('utf-8');
            else return res.status(400).json({ success: false, error: 'Could not read file from request body' });
        } else {
            return res.status(400).json({
                success: false,
                error: 'No CSV data found. Send JSON with { csv: "..." } or multipart with field "file".',
                bodyType: typeof req.body,
                bodyKeys: req.body ? Object.keys(req.body) : [],
            });
        }

        // ── 3. Parse CSV ──
        const lines = csvText
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        if (lines.length < 2) {
            return res.status(400).json({ success: false, error: 'CSV file is empty or has only a header row' });
        }

        const headerCells = parseCSVRow(lines[0]);
        const headers = headerCells.map(h => h.trim());

        // Detect column names dynamically
        const cols = {
            date: findCol(headers, ['created at', 'created_at', 'date', 'datetime', 'time', 'timestamp', 'trade_date', 'order_date']),
            market: findCol(headers, ['pair', 'market', 'symbol', 'trading pair', 'trading_pair', 'instrument', 'coin_pair']),
            type: findCol(headers, ['side', 'type', 'order type', 'order_type', 'direction', 'action', 'buy/sell', 'trade_type']),
            price: findCol(headers, ['price per unit', 'price_per_unit', 'price', 'rate', 'avg price', 'avg_price', 'unit_price', 'average_price']),
            amount: findCol(headers, ['total quantity', 'total_quantity', 'amount', 'quantity', 'qty', 'filled', 'volume']),
            remaining: findCol(headers, ['remaining quantity', 'remaining_quantity', 'remaining']),
            total: findCol(headers, ['total', 'value', 'turnover', 'consideration', 'total_amount']),
            fee: findCol(headers, ['fee amount', 'fee_amount', 'fee', 'commission', 'charges', 'brokerage', 'trading_fee']),
            tds: findCol(headers, ['total tds inr', 'tds', 'tds_inr', 'total_tds_inr', 'tds amount']),
            orderId: findCol(headers, ['order id', 'orderid', 'order_id', 'id', 'reference', 'txn id', 'trade_id']),
            status: findCol(headers, ['status', 'order_status', 'state', 'fill_status']),
        };

        // Validate required columns (total not required — can compute from price × qty)
        const required: (keyof typeof cols)[] = ['date', 'market', 'type', 'price', 'amount'];
        const missing = required.filter(k => !cols[k]);
        if (missing.length) {
            return res.status(400).json({
                success: false,
                error: `Could not detect columns: ${missing.join(', ')}. Found: ${headers.join(', ')}. Make sure this is a CoinDCX Order History CSV.`,
            });
        }

        // ── 4. Parse rows ──
        const toInsert: ParsedTrade[] = [];
        const errors: ParseError[] = [];
        const VALID_STATUSES = new Set([
            'filled', 'completed', 'success', 'partially_filled', 'partial',
            'partially_cancelled',
        ]);

        for (let i = 1; i < lines.length; i++) {
            try {
                const cells = parseCSVRow(lines[i]);
                const row: Record<string, string> = {};
                headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });

                // Skip rows with bad status
                if (cols.status) {
                    const statusVal = row[cols.status].toLowerCase();
                    if (statusVal && !VALID_STATUSES.has(statusVal)
                        && !statusVal.includes('partial') && !statusVal.includes('filled')) continue;
                }

                const rawType = (row[cols.type!] || '').toLowerCase().trim();
                const rawMarket = (row[cols.market!] || '').trim();
                const rawDate = (row[cols.date!] || '').trim();
                const rawPrice = parseNum(row[cols.price!]);
                let rawAmount = parseNum(row[cols.amount!]);
                const rawRemaining = cols.remaining ? parseNum(row[cols.remaining]) : 0;
                let rawTotal = cols.total ? parseNum(row[cols.total!]) : 0;
                const rawFee = cols.fee ? parseNum(row[cols.fee]) : 0;
                const rawTds = cols.tds ? parseNum(row[cols.tds]) : 0;
                const rawId = cols.orderId ? row[cols.orderId].trim() : '';

                // Skip blank rows
                if (!rawMarket || !rawDate || !rawType) continue;

                // Parse type
                let side: 'buy' | 'sell';
                if (rawType.includes('buy') || rawType === 'b') side = 'buy';
                else if (rawType.includes('sell') || rawType === 's') side = 'sell';
                else {
                    errors.push({ row: i + 1, issue: `Unrecognised type "${rawType}" — skipped` });
                    continue;
                }

                if (isNaN(rawPrice) || isNaN(rawAmount)) {
                    errors.push({ row: i + 1, issue: `Non-numeric price/amount — skipped` });
                    continue;
                }

                // Handle partial fills: filledQty = Total Quantity - Remaining Quantity
                const filledQty = rawAmount - rawRemaining;
                if (filledQty <= 0) {
                    continue; // Fully cancelled order
                }
                rawAmount = filledQty;

                // Parse market pair
                const { asset, quote } = parseMarketPair(rawMarket);

                // ── INR value computation ──
                let valueInr: number;
                if (quote === 'INR') {
                    // INR pair: value = qty × price
                    valueInr = rawAmount * rawPrice;
                } else {
                    // NON-INR pair (USDT/USDC): derive INR from TDS or fee
                    // TDS is 1% of INR sale value on CoinDCX
                    if (rawTds > 0) {
                        valueInr = rawTds / 0.01;
                    } else if (rawFee > 0) {
                        // Fee is ~0.2% on Binance exchange (B- prefix)
                        valueInr = rawFee / 0.002;
                    } else {
                        valueInr = 0; // Dust trade
                    }
                }

                if (rawAmount <= 0) {
                    continue;
                }

                // Parse date
                const tradeDate = safeParseTimestamp(rawDate);
                if (!tradeDate) {
                    errors.push({ row: i + 1, issue: `Invalid date: "${rawDate}"` });
                    continue;
                }

                const fy = getFinancialYear(tradeDate);
                const externalId = rawId || `oh-${rawDate}-${rawMarket}-${rawAmount}-${rawType}`;

                if (quote === 'INR') {
                    // ── Simple INR pair: ONE trade record ──
                    toInsert.push({
                        user_id: user.id,
                        type: side,
                        asset,
                        quote_currency: quote,
                        quantity: rawAmount,
                        price_per_unit: rawPrice,
                        value_inr: valueInr,
                        fee_inr: isNaN(rawFee) ? 0 : rawFee,
                        tds_inr: rawTds,
                        qty_remaining: side === 'buy' ? rawAmount : null,
                        trade_date: tradeDate.toISOString(),
                        financial_year: fy,
                        exchange: 'CoinDCX',
                        csv_source: 'order_history',
                        external_id: externalId,
                    });
                } else {
                    // ── NON-INR pair: TWO trade records ──
                    // Example: sell ACA_USDT → SELL ACA + BUY USDT
                    //          buy ONDO_USDT → BUY ONDO + SELL USDT
                    const quoteQty = rawAmount * rawPrice; // qty in USDT/USDC

                    // Leg 1: The crypto asset
                    toInsert.push({
                        user_id: user.id,
                        type: side,
                        asset,
                        quote_currency: quote,
                        quantity: rawAmount,
                        price_per_unit: rawPrice,
                        value_inr: valueInr,
                        fee_inr: isNaN(rawFee) ? 0 : rawFee,
                        tds_inr: side === 'sell' ? rawTds : 0,
                        qty_remaining: side === 'buy' ? rawAmount : null,
                        trade_date: tradeDate.toISOString(),
                        financial_year: fy,
                        exchange: 'CoinDCX',
                        csv_source: 'order_history',
                        external_id: externalId + '_asset',
                    });

                    // Leg 2: The quote currency (reverse side)
                    // If you SELL crypto for USDT, you RECEIVE (BUY) USDT
                    // If you BUY crypto with USDT, you SPEND (SELL) USDT
                    toInsert.push({
                        user_id: user.id,
                        type: side === 'sell' ? 'buy' : 'sell',
                        asset: quote, // USDT, USDC, etc.
                        quote_currency: 'INR',
                        quantity: quoteQty,
                        price_per_unit: valueInr > 0 ? valueInr / quoteQty : 0,
                        value_inr: valueInr,
                        fee_inr: 0,
                        tds_inr: side === 'buy' ? rawTds : 0,
                        qty_remaining: side === 'sell' ? quoteQty : null, // buy leg for USDT
                        trade_date: tradeDate.toISOString(),
                        financial_year: fy,
                        exchange: 'CoinDCX',
                        csv_source: 'order_history',
                        external_id: externalId + '_quote',
                    });
                }
            } catch (e) {
                errors.push({ row: i + 1, issue: (e as Error).message });
            }
        }

        if (toInsert.length === 0) {
            return res.status(200).json({
                success: false,
                imported: 0,
                errors,
                message: 'No valid rows found in CSV.',
            });
        }

        // ── 5. Upsert in batches ──
        let imported = 0;
        const BATCH_SIZE = 500;

        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const batch = toInsert.slice(i, i + BATCH_SIZE);
            const { data: inserted, error: dbError } = await supabase
                .from('crypto_trades')
                .upsert(batch, { onConflict: 'user_id,csv_source,external_id', ignoreDuplicates: true })
                .select('id');

            if (dbError) {
                errors.push({ row: i + 1, issue: `DB error: ${dbError.message}` });
            } else {
                imported += (inserted as any[])?.length ?? 0;
            }
        }

        // Build summary
        const buys = toInsert.filter(t => t.type === 'buy');
        const sells = toInsert.filter(t => t.type === 'sell');
        const assets = [...new Set(toInsert.map(t => t.asset))].sort();
        const fys = [...new Set(toInsert.map(t => t.financial_year))].sort();

        return res.status(200).json({
            success: true,
            imported,
            total_parsed: toInsert.length,
            errors,
            summary: {
                total_buys: buys.length,
                total_sells: sells.length,
                assets,
                financial_years: fys,
            },
            message: `Imported ${imported} trades (${buys.length} buys, ${sells.length} sells).${errors.length ? ` ${errors.length} rows skipped.` : ''}`,
        });
    } catch (err) {
        console.error('[Order History Upload] Unhandled error:', err);
        const message = (err as Error).message || 'Unknown error';
        return res.status(500).json({
            success: false,
            error: `Internal server error: ${message}`,
            message,
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// Inline Utilities (Vercel serverless can't import from src/)
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

function parseMarketPair(market: string): { asset: string; quote: string } {
    // CoinDCX Pair format: "I-ADA_INR", "B-ACA_USDT", "KC-ONDO_USDT"
    // Strip exchange prefix (I-, B-, KC-)
    let m = market.toUpperCase().trim().replace(/^[A-Z]+-/, '');
    if (m.includes('_')) { const [a, q] = m.split('_'); return { asset: a, quote: q || 'INR' }; }
    if (m.includes('/')) { const [a, q] = m.split('/'); return { asset: a, quote: q || 'INR' }; }
    if (m.includes('-')) { const [a, q] = m.split('-'); return { asset: a, quote: q || 'INR' }; }
    for (const q of QUOTE_CURRENCIES) {
        if (m.endsWith(q) && m.length > q.length) return { asset: m.slice(0, -q.length), quote: q };
    }
    return { asset: m, quote: 'INR' };
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
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += ch;
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
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
            h ? parseInt(h) : 0, m ? parseInt(m) : 0, sec ? parseInt(sec) : 0);
        return isNaN(d.getTime()) ? null : d;
    }
    const last = new Date(s);
    return isNaN(last.getTime()) ? null : last;
}

function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[₹$,\s]/g, '').trim());
    return isNaN(n) ? 0 : n;
}
