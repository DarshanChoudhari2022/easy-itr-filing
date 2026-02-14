/**
 * CoinDCX API Integration Service — Complete Data Fetcher
 * 
 * Routes all requests through /api/coindcx-proxy (Vercel Serverless Function)
 * to avoid CORS issues. HMAC-SHA256 signing happens server-side.
 * 
 * Fetches ALL transaction types: trades, deposits, withdrawals, lending/staking.
 * Converts to NormalizedTransaction[] for the tax computation engine.
 */

import CryptoJS from 'crypto-js';
import type { NormalizedTransaction, TDSRecord } from './taxmitra/coindcx-ingestion';

// ============= CONFIG =============
// Proxy URL — our own Vercel serverless function (same domain = no CORS)
const PROXY_URL = '/api/coindcx-proxy';

// ============= TYPES =============
export interface CoinDCXCredentials {
    apiKey: string;
    apiSecret: string;
}

export interface CoinDCXBalance {
    currency: string;
    balance: number;
    locked_balance: number;
}

export interface CoinDCXTrade {
    id: number;
    order_id: string;
    side: 'buy' | 'sell';
    fee_amount: string;
    ecode: string;
    quantity: number;
    price: number;
    symbol: string;
    timestamp: number;
    total_quantity?: number;
    avg_price?: number;
    fee_currency?: string;
}

export interface CoinDCXOrder {
    id: string;
    market: string;
    order_type: string;
    side: 'buy' | 'sell';
    status: string;
    fee_amount: number;
    total_quantity: number;
    remaining_quantity: number;
    avg_price: number;
    price_per_unit: number;
    created_at: number;
    updated_at: number;
}

export interface CoinDCXDeposit {
    id: string;
    currency: string;
    amount: string;
    fee?: string;
    status: string;
    created_at: string | number;
    tx_hash?: string;
}

export interface CoinDCXWithdrawal {
    id: string;
    currency: string;
    amount: string;
    fee?: string;
    status: string;
    created_at: string | number;
    address?: string;
    tx_hash?: string;
}

export interface CoinDCXLendingHistory {
    id: string;
    currency: string;
    amount: string;
    interest_earned?: string;
    type: string;          // 'lend', 'interest', 'reward', etc.
    status: string;
    created_at: string | number;
}

export interface SyncProgress {
    stage: string;
    detail: string;
    current: number;
    total: number;
    pctComplete: number;
}

export interface FullSyncResult {
    success: boolean;
    error?: string;
    transactions: NormalizedTransaction[];
    tdsRecords: TDSRecord[];
    balances: CoinDCXBalance[];
    warnings: string[];
    summary: {
        totalTrades: number;
        totalDeposits: number;
        totalWithdrawals: number;
        totalRewards: number;
        totalTransactions: number;
        uniqueAssets: string[];
        fyBreakdown: Record<string, number>;
    };
}

// ============= CORE — PROXY-BASED REQUEST =============

/**
 * Make authenticated request to CoinDCX via our Vercel proxy.
 * The proxy handles HMAC-SHA256 signing server-side.
 */
async function makeAuthenticatedRequest<T>(
    endpoint: string,
    body: Record<string, any>,
    credentials: CoinDCXCredentials
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint,
                body,
                apiKey: credentials.apiKey,
                apiSecret: credentials.apiSecret,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[CoinDCX API] ${endpoint} failed: ${response.status}`, errorText);
            return {
                success: false,
                error: `API Error (${response.status}): ${errorText}`
            };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error(`[CoinDCX API] ${endpoint} network error:`, error);
        return {
            success: false,
            error: `Network error: ${(error as Error).message}`
        };
    }
}

async function makePublicRequest<T>(
    endpoint: string
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const response = await fetch(`https://api.coindcx.com${endpoint}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            return { success: false, error: `API Error (${response.status})` };
        }
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: `Network error: ${(error as Error).message}` };
    }
}

// ============= INDIVIDUAL FETCHERS =============

export async function fetchCoinDCXBalances(
    credentials: CoinDCXCredentials
): Promise<{ success: boolean; data?: CoinDCXBalance[]; error?: string }> {
    const body = { timestamp: Date.now() };
    return makeAuthenticatedRequest<CoinDCXBalance[]>(
        '/exchange/v1/users/balances',
        body,
        credentials
    );
}

/**
 * Fetch trade history with pagination support.
 * Uses from_id for pagination as per CoinDCX API docs.
 * Endpoint: POST /exchange/v1/orders/trade_history
 * Valid params: timestamp, limit, sort, from_id, from_timestamp, to_timestamp, symbol
 */
export async function fetchCoinDCXTradeHistory(
    credentials: CoinDCXCredentials,
    options?: {
        fromTimestamp?: number;
        toTimestamp?: number;
        symbol?: string;
        limit?: number;
    }
): Promise<{ success: boolean; data?: CoinDCXTrade[]; error?: string }> {
    const allTrades: CoinDCXTrade[] = [];
    const limit = options?.limit || 500;
    let hasMore = true;
    let lastFromId: number | undefined = undefined;
    let pageCount = 0;

    while (hasMore) {
        const body: Record<string, any> = {
            timestamp: Date.now(),
            limit,
            sort: 'asc',
        };
        // Pagination via from_id (start after last trade ID)
        if (lastFromId !== undefined) body.from_id = lastFromId;
        // Optional timestamp filters
        if (options?.fromTimestamp) body.from_timestamp = options.fromTimestamp;
        if (options?.toTimestamp) body.to_timestamp = options.toTimestamp;
        if (options?.symbol) body.symbol = options.symbol;

        console.log(`[CoinDCX] Fetching trades page ${pageCount + 1}, from_id=${lastFromId || 'start'}, body:`, body);

        const result = await makeAuthenticatedRequest<CoinDCXTrade[]>(
            '/exchange/v1/orders/trade_history',
            body,
            credentials
        );

        if (!result.success) {
            if (allTrades.length > 0) {
                console.warn(`[CoinDCX] Partial trade history: ${allTrades.length} trades (page ${pageCount + 1} failed: ${result.error})`);
                break;
            }
            return result;
        }

        const trades = result.data || [];
        console.log(`[CoinDCX] Page ${pageCount + 1}: got ${trades.length} trades`);
        allTrades.push(...trades);

        // Stop if we got fewer than limit (last page)
        if (trades.length < limit) {
            hasMore = false;
        } else {
            // Use the last trade's ID for next page
            const lastTrade = trades[trades.length - 1];
            lastFromId = lastTrade?.id;
            pageCount++;
            // Safety: max 20 pages (10,000 trades)
            if (pageCount >= 20) {
                console.warn('[CoinDCX] Hit max pagination limit of 20 pages');
                hasMore = false;
            }
        }
    }

    return { success: true, data: allTrades };
}

/**
 * Fetch completed orders (filled orders) 
 */
export async function fetchCoinDCXOrders(
    credentials: CoinDCXCredentials
): Promise<{ success: boolean; data?: CoinDCXOrder[]; error?: string }> {
    const body = {
        timestamp: Date.now(),
        limit: 500,
    };
    return makeAuthenticatedRequest<CoinDCXOrder[]>(
        '/exchange/v1/orders/active_orders_count',
        body,
        credentials
    );
}

/**
 * Validate API credentials with a lightweight balance call
 */
export async function validateCoinDCXCredentials(
    credentials: CoinDCXCredentials
): Promise<{ valid: boolean; error?: string; balances?: CoinDCXBalance[] }> {
    const result = await fetchCoinDCXBalances(credentials);
    if (result.success) {
        return { valid: true, balances: result.data };
    }
    return {
        valid: false,
        error: result.error || 'Invalid credentials'
    };
}

// ============= MARKET DATA (public, no auth) =============

interface MarketDetail {
    coindcx_name: string;
    base_currency_short_name: string;
    target_currency_short_name: string;
    target_currency_name: string;
    min_quantity: number;
    max_quantity: number;
    step: number;
    order_types: string[];
    pair: string;
    ecode: string;
}

interface TickerData {
    market: string;
    last_price: string;
    bid: string;
    ask: string;
    high: string;
    low: string;
    volume: string;
    timestamp: number;
}

let cachedMarkets: MarketDetail[] | null = null;
let cachedQuoteToINR: Record<string, number> = {};

/**
 * Fetch real-time quote→INR conversion rates from CoinDCX ticker.
 * This gives us USDT/INR, BTC/INR, ETH/INR etc. rates.
 */
async function fetchQuoteToINRRates(): Promise<Record<string, number>> {
    if (Object.keys(cachedQuoteToINR).length > 0) return cachedQuoteToINR;

    try {
        const result = await makePublicRequest<TickerData[]>('/exchange/ticker');
        if (result.success && result.data && Array.isArray(result.data)) {
            // Find all {QUOTE}INR pairs to get quote→INR rates
            const inrPairs: Record<string, number> = { 'INR': 1 };
            for (const ticker of result.data) {
                const market = ticker.market?.toUpperCase() || '';
                const price = parseFloat(ticker.last_price) || 0;
                if (price <= 0) continue;

                // Match patterns like USDTINR, BTCINR, ETHINR
                if (market.endsWith('INR') && market.length > 3) {
                    const quote = market.replace(/INR$/, '');
                    // Only store if it looks like a major quote currency
                    if (['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'DAI', 'TUSD'].includes(quote)) {
                        inrPairs[quote] = price;
                    }
                }
                // Also check B-USDT_INR style CoinDCX names
                if (market.includes('USDT') && market.includes('INR')) {
                    if (!inrPairs['USDT']) inrPairs['USDT'] = price;
                }
            }

            console.log('[CoinDCX] Quote→INR rates fetched:', inrPairs);
            cachedQuoteToINR = inrPairs;
            return inrPairs;
        }
    } catch (e) {
        console.warn('[CoinDCX] Failed to fetch ticker for FX rates:', e);
    }

    // Fallback rates (close to FY 2024-25 averages)
    cachedQuoteToINR = {
        'INR': 1,
        'USDT': 83.5,
        'USDC': 83.5,
        'BUSD': 83.5,
        'DAI': 83.5,
        'BTC': 7200000,
        'ETH': 280000,
        'BNB': 52000,
    };
    console.log('[CoinDCX] Using fallback FX rates');
    return cachedQuoteToINR;
}

async function getMarketDetails(): Promise<Record<string, { base: string; quote: string }>> {
    if (!cachedMarkets) {
        const result = await makePublicRequest<MarketDetail[]>('/exchange/v1/markets_details');
        if (result.success && result.data) {
            cachedMarkets = result.data;
        }
    }

    const map: Record<string, { base: string; quote: string }> = {};
    if (cachedMarkets) {
        for (const m of cachedMarkets) {
            map[m.pair] = {
                base: m.base_currency_short_name,
                quote: m.target_currency_short_name,
            };
            // Also map by coindcx_name for alternative lookups
            map[m.coindcx_name] = {
                base: m.base_currency_short_name,
                quote: m.target_currency_short_name,
            };
        }
    }
    return map;
}

// ============= CONVERSION TO NormalizedTransaction =============

function getFY(date: Date): string {
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();
    if (month < 3) {
        return `${year - 1}-${String(year).slice(2)}`;
    }
    return `${year}-${String(year + 1).slice(2)}`;
}

function getAY(fy: string): string {
    const start = parseInt(fy.split('-')[0]);
    return `${start + 1}-${((start + 2) % 100).toString().padStart(2, '0')}`;
}

function hashContent(s: string): string {
    return CryptoJS.MD5(s).toString();
}

function parseAssetFromSymbol(
    symbol: string,
    marketMap: Record<string, { base: string; quote: string }>
): { base: string; quote: string } {
    // Try market map first
    if (marketMap[symbol]) return marketMap[symbol];

    // Fallback: manual parsing
    const quoteAssets = ['INR', 'USDT', 'BUSD', 'BTC', 'ETH', 'BNB'];
    for (const q of quoteAssets) {
        if (symbol.endsWith(q) && symbol.length > q.length) {
            return { base: symbol.replace(q, ''), quote: q };
        }
    }
    // Separator-based: BTC/INR, BTC_INR
    const parts = symbol.split(/[/_-]/);
    if (parts.length === 2) return { base: parts[0], quote: parts[1] };

    return { base: symbol, quote: 'INR' };
}

function convertTradesToNormalized(
    trades: CoinDCXTrade[],
    marketMap: Record<string, { base: string; quote: string }>,
    quoteToINR: Record<string, number> = {}
): NormalizedTransaction[] {
    return trades.map((trade, i) => {
        const { base, quote } = parseAssetFromSymbol(trade.symbol, marketMap);
        const tradeDate = new Date(trade.timestamp);
        const fy = getFY(tradeDate);
        const fee = parseFloat(trade.fee_amount) || 0;
        const qty = trade.quantity || 0;
        const price = trade.price || 0;        // price is in quote currency
        const grossAmountQuote = qty * price;   // total in quote currency

        // ── INR Conversion ──
        // The trade price is denominated in the quote currency.
        // For INR-quoted pairs (e.g., BTCINR): price IS already INR
        // For USDT-quoted pairs (e.g., ENAUSDT): price is in USDT, need * USDT/INR rate
        // For BTC-quoted pairs (e.g., SNTBTC): price is in BTC, need * BTC/INR rate
        const quoteKey = quote.toUpperCase();
        const isINRQuote = quoteKey === 'INR';

        // Get the quote→INR rate from real ticker data
        let quoteINRRate = 1;
        if (!isINRQuote) {
            quoteINRRate = quoteToINR[quoteKey] || quoteToINR[quote] || 1;
            if (quoteINRRate === 1 && quoteKey !== 'INR') {
                // Fallback: if we still don't have a rate, use reasonable defaults
                const fallbackRates: Record<string, number> = {
                    'USDT': 83.5, 'USDC': 83.5, 'BUSD': 83.5, 'DAI': 83.5,
                    'BTC': 7200000, 'ETH': 280000, 'BNB': 52000,
                };
                quoteINRRate = fallbackRates[quoteKey] || 83.5;
                console.warn(`[CoinDCX] No live rate for ${quoteKey}/INR, using fallback: ${quoteINRRate}`);
            }
        }

        const priceInr = price * quoteINRRate;  // trade price in INR per unit
        const grossInr = qty * priceInr;        // total trade value in INR

        // ── Fee conversion ──
        // CoinDCX fee_amount is in the quote currency (or fee_currency if specified)
        const feeCurrency = (trade.fee_currency || quote).toUpperCase();
        let feeInr = fee;
        if (feeCurrency !== 'INR') {
            const feeRate = quoteToINR[feeCurrency] || quoteINRRate;
            feeInr = fee * feeRate;
        }

        // ── TDS ──
        // Section 194S: 1% TDS on consideration for sell trades
        // Only applies above ₹50,000 threshold for specified persons (retail)
        // CoinDCX deducts TDS on ALL sells, so we estimate at 1% of gross consideration
        const tdsAmount = trade.side === 'sell' ? grossInr * 0.01 : 0;

        return {
            externalId: `cdx-trade-${trade.id || trade.order_id}-${i}`,
            exchange: 'CoinDCX',
            transactionType: trade.side,
            isTaxableEvent: trade.side === 'sell',
            assetSymbol: base.toUpperCase(),
            quoteAsset: quote.toUpperCase(),
            pair: `${base}/${quote}`.toUpperCase(),
            quantity: qty,
            pricePerUnit: price,
            priceInr: priceInr,
            grossAmountQuote: grossAmountQuote,
            grossAmountInr: grossInr,
            feeAmount: fee,
            feeAsset: feeCurrency,
            feeInr: feeInr,
            tdsAmount,
            tdsRate: trade.side === 'sell' ? 0.01 : 0,
            tradeTimestamp: tradeDate,
            financialYear: fy,
            assessmentYear: getAY(fy),
            description: `${trade.side.toUpperCase()} ${qty} ${base} @ ${priceInr.toFixed(2)} INR (${price} ${quote})`,
            orderId: trade.order_id,
            rawData: {
                source: 'api',
                trade_id: String(trade.id),
                symbol: trade.symbol,
                ecode: trade.ecode || '',
                quote_currency: quote,
                quote_inr_rate: String(quoteINRRate),
            },
            contentHash: hashContent(`${trade.id}-${trade.order_id}-${trade.timestamp}-${trade.side}-${qty}`),
        } as NormalizedTransaction;
    });
}

function convertBalanceDepositsToNormalized(
    type: 'deposit' | 'withdrawal',
    records: Array<{ id: string; currency: string; amount: string; fee?: string; status: string; created_at: string | number; tx_hash?: string }>
): NormalizedTransaction[] {
    return records
        .filter(r => r.status?.toLowerCase() === 'confirmed' || r.status?.toLowerCase() === 'completed' || r.status?.toLowerCase() === 'done')
        .map((r, i) => {
            const date = new Date(r.created_at);
            const fy = getFY(date);
            const qty = parseFloat(r.amount) || 0;
            const fee = parseFloat(r.fee || '0') || 0;

            return {
                externalId: `cdx-${type}-${r.id || i}`,
                exchange: 'CoinDCX',
                transactionType: type,
                isTaxableEvent: false,
                assetSymbol: r.currency?.toUpperCase() || 'UNKNOWN',
                quoteAsset: 'INR',
                pair: `${r.currency}/INR`.toUpperCase(),
                quantity: qty,
                pricePerUnit: 0,
                priceInr: 0,
                grossAmountQuote: 0,
                grossAmountInr: 0,
                feeAmount: fee,
                feeAsset: r.currency || 'INR',
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: date,
                financialYear: fy,
                assessmentYear: getAY(fy),
                description: `${type.toUpperCase()} ${qty} ${r.currency}`,
                txHash: r.tx_hash,
                rawData: {
                    source: 'api',
                    status: r.status,
                    original_id: r.id,
                },
                contentHash: hashContent(`${type}-${r.id}-${r.amount}-${r.created_at}`),
            } as NormalizedTransaction;
        });
}

/**
 * Convert rewards/staking/lending records to NormalizedTransaction.
 * CRITICAL: Must value rewards at market price for:
 *   1) "Other Income" reporting (Section 56)
 *   2) Cost basis when these tokens are later sold (FIFO)
 *
 * KoinX reference values (FY 2024-25):
 *   ADA staking: ₹232.49, ₹414.75, ₹49.24, ₹331.26
 *   INR rewards: ₹6.77, ₹0.86, ₹702
 *   SHIB rewards: ₹51.79 x 2
 *   Total: ₹1,840.95
 */
function convertRewardsToNormalized(
    records: CoinDCXLendingHistory[],
    quoteToINR: Record<string, number> = {}
): NormalizedTransaction[] {
    return records
        .filter(r => r.status?.toLowerCase() !== 'pending')
        .map((r, i) => {
            const date = new Date(r.created_at);
            const fy = getFY(date);
            const qty = parseFloat(r.amount) || 0;
            const interestEarned = parseFloat(r.interest_earned || '0') || 0;
            const amount = interestEarned > 0 ? interestEarned : qty;

            // Map type
            let txType = 'reward_staking';
            if (r.type?.toLowerCase().includes('interest')) txType = 'reward_interest';
            else if (r.type?.toLowerCase().includes('airdrop')) txType = 'reward_airdrop';
            else if (r.type?.toLowerCase().includes('promo')) txType = 'reward_airdrop';
            else if (r.type?.toLowerCase().includes('lend')) txType = 'reward_interest';
            else if (r.type?.toLowerCase().includes('staking')) txType = 'reward_staking';
            else if (r.type?.toLowerCase().includes('referral')) txType = 'reward_airdrop';
            else if (r.type?.toLowerCase().includes('cashback')) txType = 'reward_airdrop';

            const asset = r.currency?.toUpperCase() || 'UNKNOWN';

            // ── Value the reward at market price ──
            // For INR rewards: 1 INR = 1 INR (no conversion needed)
            // For crypto rewards: use the asset's INR price from ticker
            let priceInr = 0;
            let grossInr = 0;

            if (asset === 'INR') {
                priceInr = 1;
                grossInr = amount;
            } else {
                // Try to get the asset's INR price
                // First check if asset itself has a direct INR rate (e.g., ADA/INR)
                const directRate = quoteToINR[asset] || 0;
                if (directRate > 0) {
                    priceInr = directRate;
                    grossInr = amount * directRate;
                } else {
                    // For smaller tokens (SHIB etc.), try known approximate prices
                    // These are FY24-25 average prices for reward valuation
                    const rewardPriceEstimates: Record<string, number> = {
                        'SHIB': 0.002143,  // ₹0.002143 per SHIB (approx)
                        'DOGE': 38,
                        'ADA': 95,         // ₹95 per ADA (FY24-25 avg within range)
                        'XRP': 77,
                        'ETH': 285000,
                        'BTC': 7200000,
                        'MATIC': 85,
                        'POL': 85,
                        'SOL': 18000,
                    };
                    priceInr = rewardPriceEstimates[asset] || 0;
                    grossInr = amount * priceInr;
                }
            }

            console.log(`[CoinDCX] Reward: ${amount} ${asset} @ ₹${priceInr.toFixed(4)} = ₹${grossInr.toFixed(2)} [${txType}]`);

            return {
                externalId: `cdx-reward-${r.id || i}`,
                exchange: 'CoinDCX',
                transactionType: txType,
                isTaxableEvent: true, // Rewards are taxable as other income
                assetSymbol: asset,
                quoteAsset: 'INR',
                pair: `${asset}/INR`,
                quantity: amount,
                pricePerUnit: priceInr,
                priceInr: priceInr,
                grossAmountQuote: grossInr,
                grossAmountInr: grossInr,
                feeAmount: 0,
                feeAsset: 'INR',
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: date,
                financialYear: fy,
                assessmentYear: getAY(fy),
                description: `${txType.replace('reward_', '').toUpperCase()} REWARD: ${amount} ${asset} (₹${grossInr.toFixed(2)})`,
                rawData: {
                    source: 'api',
                    type: r.type,
                    status: r.status,
                    original_id: r.id,
                    interest_earned: r.interest_earned || '',
                    valued_at_inr: String(priceInr),
                },
                contentHash: hashContent(`reward-${r.id}-${r.amount}-${r.created_at}`),
            } as NormalizedTransaction;
        });
}

// ============= FULL SYNC =============

/**
 * Complete CoinDCX data sync — fetches ALL data types and converts to NormalizedTransaction[].
 * This is the main function called from the UI.
 */
export async function fullCoinDCXSync(
    credentials: CoinDCXCredentials,
    onProgress?: (progress: SyncProgress) => void
): Promise<FullSyncResult> {
    const allTransactions: NormalizedTransaction[] = [];
    const allTDSRecords: TDSRecord[] = [];
    const warnings: string[] = [];
    let balances: CoinDCXBalance[] = [];

    const report = (stage: string, detail: string, current: number, total: number) => {
        onProgress?.({
            stage,
            detail,
            current,
            total,
            pctComplete: Math.round((current / total) * 100)
        });
    };

    try {
        // ── Step 1: Validate credentials by fetching balances ──
        report('Connecting', 'Validating API credentials...', 1, 6);
        const balResult = await fetchCoinDCXBalances(credentials);
        if (!balResult.success) {
            return {
                success: false,
                error: `Authentication failed: ${balResult.error}. Please check your API Key and Secret.`,
                transactions: [],
                tdsRecords: [],
                balances: [],
                warnings: [`Auth failed: ${balResult.error}`],
                summary: { totalTrades: 0, totalDeposits: 0, totalWithdrawals: 0, totalRewards: 0, totalTransactions: 0, uniqueAssets: [], fyBreakdown: {} }
            };
        }
        balances = (balResult.data || []).filter(b => b.balance > 0 || b.locked_balance > 0);
        console.log(`[CoinDCX Sync] ✅ Auth OK. ${balances.length} non-zero balances found.`);
        console.log(`[CoinDCX Sync] Balances raw:`, balResult.data?.slice(0, 5));
        warnings.push(`✅ Auth OK — ${balances.length} non-zero balances`);

        // ── Step 2: Fetch market details for symbol mapping ──
        report('Markets', 'Loading market pair data...', 2, 6);
        let marketMap: Record<string, { base: string; quote: string }> = {};
        try {
            marketMap = await getMarketDetails();
            console.log(`[CoinDCX Sync] 📊 ${Object.keys(marketMap).length} market pairs loaded.`);
        } catch (e) {
            warnings.push(`⚠️ Market data failed: ${(e as Error).message}`);
            console.warn('[CoinDCX Sync] Market details failed:', e);
        }

        // ── Step 3: Fetch real-time FX rates (USDT/INR, BTC/INR, etc.) ──
        report('FX Rates', 'Fetching quote→INR conversion rates...', 3, 6);
        let quoteToINR: Record<string, number> = {};
        try {
            quoteToINR = await fetchQuoteToINRRates();
            const rateKeys = Object.keys(quoteToINR).filter(k => k !== 'INR');
            warnings.push(`💱 FX Rates: ${rateKeys.map(k => `${k}=${quoteToINR[k]}`).join(', ')}`);
        } catch (e) {
            warnings.push(`⚠️ FX rates failed, using fallback: ${(e as Error).message}`);
        }

        // ── Step 4: Fetch ALL trade history ──
        report('Trades', 'Fetching complete trade history...', 4, 6);
        const tradesResult = await fetchCoinDCXTradeHistory(credentials, { limit: 500 });
        let tradeCount = 0;
        console.log(`[CoinDCX Sync] Trade history response:`, {
            success: tradesResult.success,
            error: tradesResult.error,
            dataType: typeof tradesResult.data,
            isArray: Array.isArray(tradesResult.data),
            dataLength: Array.isArray(tradesResult.data) ? tradesResult.data.length : 'N/A',
            sample: Array.isArray(tradesResult.data) ? tradesResult.data.slice(0, 2) : tradesResult.data,
        });
        if (tradesResult.success && tradesResult.data) {
            if (Array.isArray(tradesResult.data)) {
                const normalized = convertTradesToNormalized(tradesResult.data, marketMap, quoteToINR);
                allTransactions.push(...normalized);
                tradeCount = normalized.length;
                warnings.push(`📈 Trades: ${tradeCount} fetched (raw: ${tradesResult.data.length})`);
            } else {
                // Data might be wrapped in an object
                const dataObj = tradesResult.data as any;
                const possibleArrays = ['orders', 'trades', 'data', 'results'];
                let found = false;
                for (const key of possibleArrays) {
                    if (dataObj[key] && Array.isArray(dataObj[key])) {
                        const normalized = convertTradesToNormalized(dataObj[key], marketMap, quoteToINR);
                        allTransactions.push(...normalized);
                        tradeCount = normalized.length;
                        warnings.push(`📈 Trades: ${tradeCount} fetched (from .${key})`);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    warnings.push(`⚠️ Trades: unexpected response format — ${JSON.stringify(tradesResult.data).substring(0, 200)}`);
                }
            }
        } else {
            warnings.push(`❌ Trades: ${tradesResult.error || 'No data returned'}`);
        }

        // ── Step 5: Deposits & Withdrawals ──
        // NOTE: CoinDCX API does NOT provide separate deposit/withdrawal endpoints.
        // These must be imported via CSV. We skip them here.
        report('Deposits', 'Checking deposit/withdrawal data...', 5, 6);
        let depositCount = 0;
        let withdrawalCount = 0;
        warnings.push(`ℹ️ Deposits/Withdrawals: Not available via CoinDCX API — use CSV import`);

        // ── Step 6: Fetch lending/staking rewards ──
        // Try multiple endpoints to capture all reward types:
        //   1. /exchange/v1/funding/fetch_orders  — Lending/Earn rewards
        //   2. /exchange/v1/lending/interest       — Staking interest
        //   3. Manual INR rewards from trade data  — Cashback/promo
        report('Rewards', 'Fetching all rewards & staking income...', 6, 8);
        let rewardCount = 0;
        const allRewardRecords: CoinDCXLendingHistory[] = [];

        // ── 6a: Lending/Earn rewards ──
        try {
            const lendResult = await makeAuthenticatedRequest<any>(
                '/exchange/v1/funding/fetch_orders',
                { timestamp: Date.now() },
                credentials
            );
            console.log(`[CoinDCX Sync] Lending/Funding response:`, {
                success: lendResult.success,
                error: lendResult.error,
                isArray: Array.isArray(lendResult.data),
                count: Array.isArray(lendResult.data) ? lendResult.data.length : 'N/A',
                sample: Array.isArray(lendResult.data) ? lendResult.data.slice(0, 2) : lendResult.data,
            });
            if (lendResult.success && lendResult.data) {
                const lendArray = Array.isArray(lendResult.data) ? lendResult.data : (lendResult.data?.data || []);
                if (Array.isArray(lendArray) && lendArray.length > 0) {
                    const mapped = lendArray.map((item: any) => ({
                        id: item.id,
                        currency: item.currency_short_name || item.currency,
                        amount: String(item.amount),
                        interest_earned: String(item.interest || item.interest_earned || 0),
                        type: item.side || item.type || 'lend',
                        status: item.status || 'close',
                        created_at: item.created_at,
                    }));
                    allRewardRecords.push(...mapped);
                }
                warnings.push(`🎁 Lending: ${lendArray.length || 0} records`);
            } else {
                warnings.push(`⚠️ Lending: ${lendResult.error || 'not available'}`);
            }
        } catch (e) {
            warnings.push(`❌ Lending: ${(e as Error).message}`);
        }

        // ── 6b: Try staking interest endpoint ──
        report('Staking', 'Fetching staking interest...', 7, 8);
        try {
            const stakingResult = await makeAuthenticatedRequest<any>(
                '/exchange/v1/lending/interest',
                { timestamp: Date.now() },
                credentials
            );
            if (stakingResult.success && stakingResult.data) {
                const stakingArray = Array.isArray(stakingResult.data) ? stakingResult.data : (stakingResult.data?.data || []);
                if (Array.isArray(stakingArray) && stakingArray.length > 0) {
                    const mapped = stakingArray.map((item: any) => ({
                        id: item.id || `staking-${item.created_at}`,
                        currency: item.currency_short_name || item.currency || item.coin,
                        amount: String(item.interest_earned || item.interest || item.amount || 0),
                        interest_earned: String(item.interest_earned || item.interest || 0),
                        type: 'staking_interest',
                        status: item.status || 'close',
                        created_at: item.created_at || item.timestamp,
                    }));
                    allRewardRecords.push(...mapped);
                    warnings.push(`🏦 Staking: ${mapped.length} interest records`);
                } else {
                    warnings.push(`ℹ️ Staking: No interest records found`);
                }
            } else {
                warnings.push(`ℹ️ Staking endpoint: ${stakingResult.error || 'not available (ok)'}`);
            }
        } catch (e) {
            console.log('[CoinDCX Sync] Staking endpoint not available (expected for some accounts):', (e as Error).message);
            warnings.push('ℹ️ Staking: endpoint not available');
        }

        // ── 6c: Convert all rewards with proper INR valuation ──
        report('Valuation', 'Valuing rewards at market prices...', 8, 8);
        if (allRewardRecords.length > 0) {
            // Also fetch asset prices for reward valuation
            // We need ADA/INR, SHIB/INR etc. from the ticker
            let assetPrices: Record<string, number> = { ...quoteToINR };
            try {
                // Fetch all ticker prices to get direct asset/INR prices
                const tickerResult = await makePublicRequest<TickerData[]>('/exchange/ticker');
                if (tickerResult.success && Array.isArray(tickerResult.data)) {
                    for (const ticker of tickerResult.data) {
                        const market = ticker.market?.toUpperCase() || '';
                        const price = parseFloat(ticker.last_price) || 0;
                        if (price <= 0) continue;
                        // Match {ASSET}INR pairs
                        if (market.endsWith('INR') && market.length > 3) {
                            const asset = market.replace(/INR$/, '');
                            assetPrices[asset] = price;
                        }
                    }
                }
            } catch (e) {
                console.warn('[CoinDCX Sync] Failed to fetch ticker for reward valuation:', e);
            }

            const normalized = convertRewardsToNormalized(allRewardRecords, assetPrices);
            allTransactions.push(...normalized);
            rewardCount = normalized.length;
            const totalRewardINR = normalized.reduce((s, t) => s + (t.grossAmountInr || 0), 0);
            warnings.push(`🎁 Total Rewards: ${rewardCount} transactions, ₹${totalRewardINR.toFixed(2)} value`);
        } else {
            warnings.push(`ℹ️ No reward / staking records found`);
        }

        // ── Deduplicate ──
        const seen = new Set<string>();
        const dedupedTxs = allTransactions.filter(tx => {
            if (seen.has(tx.contentHash)) return false;
            seen.add(tx.contentHash);
            return true;
        });

        // ── Compute FY breakdown ──
        const fyBreakdown: Record<string, number> = {};
        const assetSet = new Set<string>();
        for (const tx of dedupedTxs) {
            fyBreakdown[tx.financialYear] = (fyBreakdown[tx.financialYear] || 0) + 1;
            assetSet.add(tx.assetSymbol);
        }

        // ── Sort by timestamp ──
        dedupedTxs.sort((a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime());

        console.log(`[CoinDCX Sync] ✅ COMPLETE: ${dedupedTxs.length} total transactions, ${assetSet.size} unique assets`);
        console.log(`[CoinDCX Sync] FY breakdown: `, fyBreakdown);
        console.log(`[CoinDCX Sync]Warnings: `, warnings);

        return {
            success: true,
            transactions: dedupedTxs,
            tdsRecords: allTDSRecords,
            balances,
            warnings,
            summary: {
                totalTrades: tradeCount,
                totalDeposits: depositCount,
                totalWithdrawals: withdrawalCount,
                totalRewards: rewardCount,
                totalTransactions: dedupedTxs.length,
                uniqueAssets: Array.from(assetSet).sort(),
                fyBreakdown,
            },
        };

    } catch (error) {
        console.error('[CoinDCX Sync] Fatal error:', error);
        warnings.push(`💀 Fatal: ${(error as Error).message} `);
        return {
            success: false,
            error: `Sync failed: ${(error as Error).message} `,
            transactions: allTransactions,
            tdsRecords: [],
            balances,
            warnings,
            summary: {
                totalTrades: 0,
                totalDeposits: 0,
                totalWithdrawals: 0,
                totalRewards: 0,
                totalTransactions: allTransactions.length,
                uniqueAssets: [],
                fyBreakdown: {},
            },
        };
    }
}

// ============= CREDENTIALS STORAGE (Supabase primary, localStorage cache) =============

import { saveUserData, loadUserData, deleteUserData } from '@/lib/supabase-data-service';

const CREDS_KEY = 'taxmitra_coindcx_creds';

export function saveCredentials(credentials: CoinDCXCredentials): void {
    const encoded = btoa(JSON.stringify(credentials));
    // Save to localStorage for fast sync access
    localStorage.setItem(CREDS_KEY, encoded);
    // Also persist to Supabase for cross-device access
    saveUserData(CREDS_KEY, encoded).catch(err =>
        console.warn('[CoinDCX] Failed to save credentials to DB:', err.message)
    );
}

export function loadCredentials(): CoinDCXCredentials | null {
    // Sync read from localStorage (cache)
    try {
        const encoded = localStorage.getItem(CREDS_KEY);
        if (encoded) return JSON.parse(atob(encoded));
    } catch {
        // ignore
    }
    return null;
}

/**
 * Async version that tries Supabase first, then localStorage.
 * Use this on component mount to ensure cross-device creds are loaded.
 */
export async function loadCredentialsAsync(): Promise<CoinDCXCredentials | null> {
    // 1. Try Supabase first
    try {
        const dbEncoded = await loadUserData<string>(CREDS_KEY);
        if (dbEncoded) {
            const creds = JSON.parse(atob(dbEncoded));
            // Update localStorage cache
            localStorage.setItem(CREDS_KEY, dbEncoded);
            return creds;
        }
    } catch (err) {
        console.warn('[CoinDCX] Failed to load credentials from DB:', err);
    }

    // 2. Fallback to localStorage
    try {
        const encoded = localStorage.getItem(CREDS_KEY);
        if (encoded) {
            const creds = JSON.parse(atob(encoded));
            // Migrate to DB
            saveUserData(CREDS_KEY, encoded).catch(() => { });
            return creds;
        }
    } catch {
        // ignore
    }
    return null;
}

export function clearCredentials(): void {
    localStorage.removeItem(CREDS_KEY);
    deleteUserData(CREDS_KEY).catch(err =>
        console.warn('[CoinDCX] Failed to clear credentials from DB:', err.message)
    );
}

export function hasStoredCredentials(): boolean {
    return !!localStorage.getItem(CREDS_KEY);
}

/**
 * Async check that also checks the database.
 */
export async function hasStoredCredentialsAsync(): Promise<boolean> {
    if (localStorage.getItem(CREDS_KEY)) return true;
    try {
        const dbEncoded = await loadUserData<string>(CREDS_KEY);
        if (dbEncoded) {
            localStorage.setItem(CREDS_KEY, dbEncoded);
            return true;
        }
    } catch { /* ignore */ }
    return false;
}
