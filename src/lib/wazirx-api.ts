/**
 * WazirX API Integration Service
 * 
 * WazirX uses simple API key + secret authentication
 * Provides read-only access to trade history and balances
 */

import CryptoJS from 'crypto-js';

const WAZIRX_API_BASE = 'https://api.wazirx.com';

export interface WazirXCredentials {
    apiKey: string;
    apiSecret: string;
}

export interface WazirXBalance {
    asset: string;
    free: string;
    locked: string;
}

export interface WazirXTrade {
    id: number;
    orderId: number;
    symbol: string;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
    quoteQty: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
    fee: string;
    feeAsset: string;
}

export interface WazirXSyncResult {
    success: boolean;
    balances?: WazirXBalance[];
    trades?: WazirXTrade[];
    error?: string;
    tradesCount?: number;
}

/**
 * Generate signature for WazirX API
 */
function generateWazirXSignature(params: string, secret: string): string {
    return CryptoJS.HmacSHA256(params, secret).toString(CryptoJS.enc.Hex);
}

/**
 * Make authenticated request to WazirX API
 */
async function wazirxRequest<T>(
    endpoint: string,
    credentials: WazirXCredentials,
    params: Record<string, string | number> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const timestamp = Date.now();
        const queryParams = new URLSearchParams({
            ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
            timestamp: String(timestamp),
            recvWindow: '10000'
        });

        const signature = generateWazirXSignature(queryParams.toString(), credentials.apiSecret);
        queryParams.append('signature', signature);

        const response = await fetch(`${WAZIRX_API_BASE}${endpoint}?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'X-Api-Key': credentials.apiKey,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `API Error (${response.status}): ${errorText}` };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: `Network error: ${(error as Error).message}` };
    }
}

/**
 * Fetch account balances from WazirX
 */
export async function fetchWazirXBalances(
    credentials: WazirXCredentials
): Promise<{ success: boolean; data?: WazirXBalance[]; error?: string }> {
    const result = await wazirxRequest<{ balances: WazirXBalance[] }>(
        '/sapi/v1/funds',
        credentials
    );

    if (result.success && result.data) {
        return { success: true, data: result.data.balances };
    }
    return result as any;
}

/**
 * Fetch trade history from WazirX
 */
export async function fetchWazirXTradeHistory(
    credentials: WazirXCredentials,
    symbol?: string,
    limit: number = 500
): Promise<{ success: boolean; data?: WazirXTrade[]; error?: string }> {
    const params: Record<string, string | number> = { limit };
    if (symbol) params.symbol = symbol;

    return wazirxRequest<WazirXTrade[]>(
        '/sapi/v1/myTrades',
        credentials,
        params
    );
}

/**
 * Sync all data from WazirX account
 */
export async function syncWazirXAccount(
    credentials: WazirXCredentials,
    financialYear: '2024-25' | '2025-26' = '2025-26'
): Promise<WazirXSyncResult> {
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

        // Fetch balances
        const balancesResult = await fetchWazirXBalances(credentials);
        if (!balancesResult.success) {
            return { success: false, error: balancesResult.error };
        }

        // Fetch trade history
        const tradesResult = await fetchWazirXTradeHistory(credentials);
        if (!tradesResult.success) {
            return { success: false, error: tradesResult.error };
        }

        // Filter trades by FY
        const fyTrades = tradesResult.data?.filter(t =>
            t.time >= range.from && t.time <= range.to
        ) || [];

        return {
            success: true,
            balances: balancesResult.data,
            trades: fyTrades,
            tradesCount: fyTrades.length,
        };
    } catch (error) {
        return {
            success: false,
            error: `Sync failed: ${(error as Error).message}`,
        };
    }
}

/**
 * Convert WazirX trades to our internal format
 */
export function convertWazirXTradesToTransactions(
    trades: WazirXTrade[],
    userId: string
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
        // Extract token from symbol (e.g., btcinr -> BTC)
        let token = trade.symbol.toUpperCase();
        if (token.endsWith('INR')) {
            token = token.replace('INR', '');
        } else if (token.endsWith('USDT')) {
            token = token.replace('USDT', '');
        }

        return {
            token_symbol: token,
            trade_type: trade.side,
            quantity: parseFloat(trade.qty),
            buy_price: parseFloat(trade.price),
            trade_date: new Date(trade.time).toISOString().split('T')[0],
            exchange: 'WazirX',
            metadata: {
                original_id: trade.id,
                order_id: trade.orderId,
                fee: parseFloat(trade.fee),
                fee_asset: trade.feeAsset,
                original_symbol: trade.symbol,
                quote_qty: parseFloat(trade.quoteQty),
            },
        };
    });
}

/**
 * Validate WazirX API credentials
 */
export async function validateWazirXCredentials(
    credentials: WazirXCredentials
): Promise<{ valid: boolean; error?: string }> {
    const result = await fetchWazirXBalances(credentials);

    if (result.success) {
        return { valid: true };
    }

    return { valid: false, error: result.error || 'Invalid credentials' };
}
