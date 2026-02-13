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

let cachedMarkets: MarketDetail[] | null = null;

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
    marketMap: Record<string, { base: string; quote: string }>
): NormalizedTransaction[] {
    return trades.map((trade, i) => {
        const { base, quote } = parseAssetFromSymbol(trade.symbol, marketMap);
        const tradeDate = new Date(trade.timestamp);
        const fy = getFY(tradeDate);
        const fee = parseFloat(trade.fee_amount) || 0;
        const qty = trade.quantity || 0;
        const price = trade.price || 0;
        const grossAmount = qty * price;
        const isINRQuote = quote === 'INR';
        const priceInr = isINRQuote ? price : price * 90; // Approximate USDT → INR
        const grossInr = qty * priceInr;
        const feeInr = fee; // CoinDCX fees are typically in quote currency

        // TDS: 1% of consideration for sells (Section 194S)
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
            grossAmountQuote: grossAmount,
            grossAmountInr: grossInr,
            feeAmount: fee,
            feeAsset: quote,
            feeInr: feeInr,
            tdsAmount,
            tdsRate: trade.side === 'sell' ? 0.01 : 0,
            tradeTimestamp: tradeDate,
            financialYear: fy,
            assessmentYear: getAY(fy),
            description: `${trade.side.toUpperCase()} ${qty} ${base} @ ${price} ${quote}`,
            orderId: trade.order_id,
            rawData: {
                source: 'api',
                trade_id: String(trade.id),
                symbol: trade.symbol,
                ecode: trade.ecode || '',
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

function convertRewardsToNormalized(
    records: CoinDCXLendingHistory[]
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

            return {
                externalId: `cdx-reward-${r.id || i}`,
                exchange: 'CoinDCX',
                transactionType: txType,
                isTaxableEvent: true, // Rewards are taxable as other income
                assetSymbol: r.currency?.toUpperCase() || 'UNKNOWN',
                quoteAsset: 'INR',
                pair: `${r.currency}/INR`.toUpperCase(),
                quantity: amount,
                pricePerUnit: 0, // Will need market price lookup
                priceInr: 0,
                grossAmountQuote: 0,
                grossAmountInr: 0,
                feeAmount: 0,
                feeAsset: 'INR',
                feeInr: 0,
                tdsAmount: 0,
                tdsRate: 0,
                tradeTimestamp: date,
                financialYear: fy,
                assessmentYear: getAY(fy),
                description: `${txType.replace('reward_', '').toUpperCase()} REWARD: ${amount} ${r.currency}`,
                rawData: {
                    source: 'api',
                    type: r.type,
                    status: r.status,
                    original_id: r.id,
                    interest_earned: r.interest_earned || '',
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
        report('Connecting', 'Validating API credentials...', 1, 5);
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
        report('Markets', 'Loading market pair data...', 2, 5);
        let marketMap: Record<string, { base: string; quote: string }> = {};
        try {
            marketMap = await getMarketDetails();
            console.log(`[CoinDCX Sync] 📊 ${Object.keys(marketMap).length} market pairs loaded.`);
        } catch (e) {
            warnings.push(`⚠️ Market data failed: ${(e as Error).message}`);
            console.warn('[CoinDCX Sync] Market details failed:', e);
        }

        // ── Step 3: Fetch ALL trade history ──
        report('Trades', 'Fetching complete trade history...', 3, 5);
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
                const normalized = convertTradesToNormalized(tradesResult.data, marketMap);
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
                        const normalized = convertTradesToNormalized(dataObj[key], marketMap);
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

        // ── Step 4: Deposits & Withdrawals ──
        // NOTE: CoinDCX API does NOT provide separate deposit/withdrawal endpoints.
        // These must be imported via CSV. We skip them here.
        report('Deposits', 'Checking deposit/withdrawal data...', 4, 5);
        let depositCount = 0;
        let withdrawalCount = 0;
        warnings.push(`ℹ️ Deposits/Withdrawals: Not available via CoinDCX API — use CSV import`);

        // ── Step 5: Fetch lending/staking rewards ──
        // Correct endpoint: POST /exchange/v1/funding/fetch_orders
        report('Rewards', 'Fetching lending & staking rewards...', 5, 5);
        let rewardCount = 0;
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
                    // CoinDCX funding response has: currency_short_name, amount, interest, side, status, created_at
                    const mapped = lendArray.map((item: any) => ({
                        id: item.id,
                        currency: item.currency_short_name || item.currency,
                        amount: String(item.amount),
                        interest_earned: String(item.interest || 0),
                        type: item.side || 'lend',
                        status: item.status || 'close',
                        created_at: item.created_at,
                    }));
                    const normalized = convertRewardsToNormalized(mapped);
                    allTransactions.push(...normalized);
                    rewardCount = normalized.length;
                }
                warnings.push(`🎁 Lending/Staking: ${rewardCount} (raw: ${lendArray.length || 0})`);
            } else {
                warnings.push(`⚠️ Lending: ${lendResult.error || 'not available'}`);
            }
        } catch (e) {
            warnings.push(`❌ Lending: ${(e as Error).message}`);
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
        console.log(`[CoinDCX Sync] FY breakdown:`, fyBreakdown);
        console.log(`[CoinDCX Sync] Warnings:`, warnings);

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
        warnings.push(`💀 Fatal: ${(error as Error).message}`);
        return {
            success: false,
            error: `Sync failed: ${(error as Error).message}`,
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

// ============= CREDENTIALS STORAGE (localStorage, base64 encoded) =============

const CREDS_KEY = 'taxmitra_coindcx_creds';

export function saveCredentials(credentials: CoinDCXCredentials): void {
    const encoded = btoa(JSON.stringify(credentials));
    localStorage.setItem(CREDS_KEY, encoded);
}

export function loadCredentials(): CoinDCXCredentials | null {
    try {
        const encoded = localStorage.getItem(CREDS_KEY);
        if (!encoded) return null;
        return JSON.parse(atob(encoded));
    } catch {
        return null;
    }
}

export function clearCredentials(): void {
    localStorage.removeItem(CREDS_KEY);
}

export function hasStoredCredentials(): boolean {
    return !!localStorage.getItem(CREDS_KEY);
}
