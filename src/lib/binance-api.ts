/**
 * Binance API Integration Service
 * 
 * Binance uses HMAC-SHA256 signature authentication
 * Provides read-only access to trade history and balances
 */

import CryptoJS from 'crypto-js';

const BINANCE_API_BASE = 'https://api.binance.com';

export interface BinanceCredentials {
    apiKey: string;
    apiSecret: string;
}

export interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
}

export interface BinanceTrade {
    id: number;
    orderId: number;
    symbol: string;
    side: string;
    price: string;
    qty: string;
    quoteQty: string;
    commission: string;
    commissionAsset: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
    isBestMatch: boolean;
}

export interface BinanceSyncResult {
    success: boolean;
    balances?: BinanceBalance[];
    trades?: BinanceTrade[];
    error?: string;
    tradesCount?: number;
}

/**
 * Generate HMAC-SHA256 signature for Binance API
 */
function generateBinanceSignature(queryString: string, secret: string): string {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
}

/**
 * Make authenticated GET request to Binance API
 */
async function binanceRequest<T>(
    endpoint: string,
    credentials: BinanceCredentials,
    params: Record<string, string | number> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const timestamp = Date.now();
        const queryParams = new URLSearchParams({
            ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
            timestamp: String(timestamp),
            recvWindow: '10000'
        });

        const signature = generateBinanceSignature(queryParams.toString(), credentials.apiSecret);
        queryParams.append('signature', signature);

        const response = await fetch(`${BINANCE_API_BASE}${endpoint}?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'X-MBX-APIKEY': credentials.apiKey,
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ msg: 'Unknown error' }));
            return {
                success: false,
                error: `API Error (${response.status}): ${errorData.msg || JSON.stringify(errorData)}`
            };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: `Network error: ${(error as Error).message}` };
    }
}

/**
 * Fetch account info and balances from Binance
 */
export async function fetchBinanceBalances(
    credentials: BinanceCredentials
): Promise<{ success: boolean; data?: BinanceBalance[]; error?: string }> {
    const result = await binanceRequest<{ balances: BinanceBalance[] }>(
        '/api/v3/account',
        credentials
    );

    if (result.success && result.data) {
        // Filter non-zero balances
        const nonZeroBalances = result.data.balances.filter(
            b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
        return { success: true, data: nonZeroBalances };
    }
    return result as any;
}

/**
 * Fetch trade history for a specific symbol from Binance
 */
export async function fetchBinanceTradeHistory(
    credentials: BinanceCredentials,
    symbol: string,
    startTime?: number,
    endTime?: number,
    limit: number = 1000
): Promise<{ success: boolean; data?: BinanceTrade[]; error?: string }> {
    const params: Record<string, string | number> = {
        symbol,
        limit
    };

    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    return binanceRequest<BinanceTrade[]>(
        '/api/v3/myTrades',
        credentials,
        params
    );
}

/**
 * Get all trading symbols the user has traded
 */
async function getUserTradingSymbols(
    credentials: BinanceCredentials
): Promise<string[]> {
    // Common INR and USDT pairs for Indian traders
    const commonSymbols = [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
        'DOGEUSDT', 'SOLUSDT', 'DOTUSDT', 'MATICUSDT', 'SHIBUSDT',
        'LTCUSDT', 'AVAXUSDT', 'LINKUSDT', 'UNIUSDT', 'ATOMUSDT',
        'BTCBUSD', 'ETHBUSD', 'BNBBUSD'
    ];
    return commonSymbols;
}

/**
 * Sync all data from Binance account
 */
export async function syncBinanceAccount(
    credentials: BinanceCredentials,
    financialYear: '2024-25' | '2025-26' = '2025-26'
): Promise<BinanceSyncResult> {
    try {
        const fyRanges = {
            '2024-25': {
                from: new Date('2024-04-01').getTime(),
                to: new Date('2025-03-31 23:59:59').getTime(),
            },
            '2025-26': {
                from: new Date('2025-04-01').getTime(),
                to: new Date('2026-03-31 23:59:59').getTime(),
            },
        };

        const range = fyRanges[financialYear];

        // Fetch balances first (this also validates credentials)
        const balancesResult = await fetchBinanceBalances(credentials);
        if (!balancesResult.success) {
            return { success: false, error: balancesResult.error };
        }

        // Get trading symbols
        const symbols = await getUserTradingSymbols(credentials);

        // Fetch trades for each symbol
        const allTrades: BinanceTrade[] = [];

        for (const symbol of symbols) {
            try {
                const tradesResult = await fetchBinanceTradeHistory(
                    credentials,
                    symbol,
                    range.from,
                    range.to
                );

                if (tradesResult.success && tradesResult.data) {
                    allTrades.push(...tradesResult.data);
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                // Continue with other symbols if one fails
                console.warn(`Failed to fetch trades for ${symbol}:`, err);
            }
        }

        // Sort by time
        allTrades.sort((a, b) => a.time - b.time);

        return {
            success: true,
            balances: balancesResult.data,
            trades: allTrades,
            tradesCount: allTrades.length,
        };
    } catch (error) {
        return {
            success: false,
            error: `Sync failed: ${(error as Error).message}`,
        };
    }
}

/**
 * Convert Binance trades to our internal format
 * Note: Binance prices are in USDT, we need to convert to INR
 */
export function convertBinanceTradesToTransactions(
    trades: BinanceTrade[],
    userId: string,
    usdtToInrRate: number = 83 // Current approximate rate
): {
    token_symbol: string;
    trade_type: string;
    quantity: number;
    buy_price: number;
    trade_date: string;
    exchange: string;
    metadata: Record<string, any>;
}[] {
    return trades.map(trade => {
        // Extract token from symbol
        let token = trade.symbol;
        let quoteAsset = 'USDT';

        if (token.endsWith('USDT')) {
            token = token.replace('USDT', '');
        } else if (token.endsWith('BUSD')) {
            token = token.replace('BUSD', '');
            quoteAsset = 'BUSD';
        } else if (token.endsWith('BTC')) {
            token = token.replace('BTC', '');
            quoteAsset = 'BTC';
        }

        // Convert price to INR
        const priceUSD = parseFloat(trade.price);
        const priceINR = priceUSD * usdtToInrRate;

        return {
            token_symbol: token,
            trade_type: trade.isBuyer ? 'buy' : 'sell',
            quantity: parseFloat(trade.qty),
            buy_price: priceINR,
            trade_date: new Date(trade.time).toISOString().split('T')[0],
            exchange: 'Binance',
            metadata: {
                original_id: trade.id,
                order_id: trade.orderId,
                commission: parseFloat(trade.commission),
                commission_asset: trade.commissionAsset,
                original_symbol: trade.symbol,
                original_price_usd: priceUSD,
                quote_asset: quoteAsset,
                usdt_to_inr_rate: usdtToInrRate,
            },
        };
    });
}

/**
 * Validate Binance API credentials
 */
export async function validateBinanceCredentials(
    credentials: BinanceCredentials
): Promise<{ valid: boolean; error?: string }> {
    const result = await fetchBinanceBalances(credentials);

    if (result.success) {
        return { valid: true };
    }

    return { valid: false, error: result.error || 'Invalid credentials' };
}

/**
 * Get current USDT/INR rate from Binance P2P or external source
 */
export async function getUSDTINRRate(): Promise<number> {
    try {
        // Try to get from a price API
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr');
        if (response.ok) {
            const data = await response.json();
            return data.tether?.inr || 83;
        }
    } catch {
        // Fallback to approximate rate
    }
    return 83; // Default fallback
}
