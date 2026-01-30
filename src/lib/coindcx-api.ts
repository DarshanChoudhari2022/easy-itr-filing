/**
 * CoinDCX API Integration Service
 * 
 * Provides read-only access to CoinDCX account data for tax calculation
 * Uses HMAC-SHA256 signature authentication
 */

import CryptoJS from 'crypto-js';

// API Base URL
const COINDCX_API_BASE = 'https://api.coindcx.com';

// Types
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
}

export interface CoinDCXSyncResult {
    success: boolean;
    balances?: CoinDCXBalance[];
    trades?: CoinDCXTrade[];
    error?: string;
    tradesCount?: number;
}

/**
 * Generate HMAC-SHA256 signature for CoinDCX API request
 */
function generateSignature(body: Record<string, any>, secret: string): string {
    const payload = JSON.stringify(body);
    return CryptoJS.HmacSHA256(payload, secret).toString(CryptoJS.enc.Hex);
}

/**
 * Make authenticated request to CoinDCX API
 */
async function makeAuthenticatedRequest<T>(
    endpoint: string,
    body: Record<string, any>,
    credentials: CoinDCXCredentials
): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
        const signature = generateSignature(body, credentials.apiSecret);

        const response = await fetch(`${COINDCX_API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AUTH-APIKEY': credentials.apiKey,
                'X-AUTH-SIGNATURE': signature,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `API Error (${response.status}): ${errorText}`
            };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return {
            success: false,
            error: `Network error: ${(error as Error).message}`
        };
    }
}

/**
 * Fetch current account balances from CoinDCX
 */
export async function fetchCoinDCXBalances(
    credentials: CoinDCXCredentials
): Promise<{ success: boolean; data?: CoinDCXBalance[]; error?: string }> {
    const timestamp = Date.now();
    const body = { timestamp };

    return makeAuthenticatedRequest<CoinDCXBalance[]>(
        '/exchange/v1/users/balances',
        body,
        credentials
    );
}

/**
 * Fetch trade history from CoinDCX
 * 
 * @param credentials API credentials
 * @param options Optional filters (from_timestamp, to_timestamp, symbol)
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
    const timestamp = Date.now();

    const body: Record<string, any> = {
        timestamp,
        limit: options?.limit || 500,
        sort: 'desc',
    };

    if (options?.fromTimestamp) {
        body.from_timestamp = options.fromTimestamp;
    }

    if (options?.toTimestamp) {
        body.to_timestamp = options.toTimestamp;
    }

    if (options?.symbol) {
        body.symbol = options.symbol;
    }

    return makeAuthenticatedRequest<CoinDCXTrade[]>(
        '/exchange/v1/orders/trade_history',
        body,
        credentials
    );
}

/**
 * Sync all data from CoinDCX account
 * Fetches both balances and trade history
 */
export async function syncCoinDCXAccount(
    credentials: CoinDCXCredentials,
    financialYear: '2024-25' | '2025-26' = '2025-26'
): Promise<CoinDCXSyncResult> {
    try {
        // Define financial year date range
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
        const balancesResult = await fetchCoinDCXBalances(credentials);
        if (!balancesResult.success) {
            return { success: false, error: balancesResult.error };
        }

        // Fetch trade history for the financial year
        const tradesResult = await fetchCoinDCXTradeHistory(credentials, {
            fromTimestamp: range.from,
            toTimestamp: range.to,
            limit: 1000,
        });

        if (!tradesResult.success) {
            return { success: false, error: tradesResult.error };
        }

        return {
            success: true,
            balances: balancesResult.data,
            trades: tradesResult.data,
            tradesCount: tradesResult.data?.length || 0,
        };
    } catch (error) {
        return {
            success: false,
            error: `Sync failed: ${(error as Error).message}`,
        };
    }
}

/**
 * Convert CoinDCX trades to our internal Transaction format
 */
export function convertCoinDCXTradesToTransactions(
    trades: CoinDCXTrade[],
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
        // Extract token from symbol (e.g., BTCINR -> BTC)
        let token = trade.symbol;
        if (token.endsWith('INR')) {
            token = token.replace('INR', '');
        } else if (token.endsWith('USDT')) {
            token = token.replace('USDT', '');
        } else if (token.endsWith('BTC')) {
            token = token.replace('BTC', '');
        }

        // Calculate price in INR
        // For INR pairs, price is already in INR
        // For BTC/USDT pairs, would need conversion (simplified here)
        const priceInINR = trade.symbol.endsWith('INR')
            ? trade.price
            : trade.price * 90; // Approximate USDT to INR

        return {
            token_symbol: token.toUpperCase(),
            trade_type: trade.side,
            quantity: trade.quantity,
            buy_price: priceInINR,
            trade_date: new Date(trade.timestamp).toISOString().split('T')[0],
            exchange: 'CoinDCX',
            metadata: {
                original_id: trade.id,
                order_id: trade.order_id,
                fee: parseFloat(trade.fee_amount),
                original_symbol: trade.symbol,
                original_price: trade.price,
            },
        };
    });
}

/**
 * Validate CoinDCX API credentials
 * Makes a simple balance request to verify credentials work
 */
export async function validateCoinDCXCredentials(
    credentials: CoinDCXCredentials
): Promise<{ valid: boolean; error?: string }> {
    const result = await fetchCoinDCXBalances(credentials);

    if (result.success) {
        return { valid: true };
    }

    return {
        valid: false,
        error: result.error || 'Invalid credentials'
    };
}
