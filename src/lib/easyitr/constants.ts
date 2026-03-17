/**
 * Section 115BBH Tax Rules — Indian Crypto Tax Constants
 * 
 * These are defined by law. Only these values should be "hardcoded".
 * Everything else must be computed dynamically from the database.
 */

export const TAX_RULES = {
    /** 30% flat rate — Section 115BBH(1)(ii) */
    TAX_RATE: 0.30,

    /** 4% Health & Education Cess */
    CESS_RATE: 0.04,

    /** Effective rate: (1 + cess) × rate = 0.312 */
    EFFECTIVE_RATE: 0.312,

    /** §115BBH: losses on one VDA CANNOT offset gains from another VDA */
    LOSSES_CAN_OFFSET: false,

    /** §115BBH: losses on VDA CANNOT be carried forward to future years */
    LOSSES_CARRY_FORWARD: false,

    /** Staking, rewards, airdrop income — taxed at 30% as "income from other sources" */
    STAKING_IS_INCOME: true,

    /** Crypto-to-crypto trades (e.g. BTC → ETH) are taxable events */
    CRYPTO_TO_CRYPTO_TAXABLE: true,

    /** TDS on crypto sell consideration — Section 194S, rate 1% */
    TDS_SECTION: '194S',
    TDS_RATE: 0.01,
} as const;


/**
 * Known quote currencies for parsing market pairs.
 * Order matters — check longer strings first to avoid partial matches.
 */
export const QUOTE_CURRENCIES = ['USDT', 'USDC', 'BUSD', 'INR', 'BTC', 'ETH', 'BNB', 'DAI'] as const;


/**
 * Compute Indian Financial Year from any date.
 * FY runs April 1 → March 31.
 * 
 * @example getFinancialYear('2024-04-15') → 'FY2024-25'
 * @example getFinancialYear('2024-01-15') → 'FY2023-24'
 * @example getFinancialYear('2025-03-31') → 'FY2024-25'
 */
export function getFinancialYear(date: Date | string): string {
    const d = new Date(date);
    const month = d.getMonth() + 1; // getMonth() is 0-indexed
    const year = d.getFullYear();
    const start = month >= 4 ? year : year - 1;
    return `FY${start}-${String(start + 1).slice(-2)}`;
}


/**
 * Derive Assessment Year from Financial Year.
 * FY2024-25 → AY 2025-26
 */
export function getAssessmentYear(fy: string): string {
    const startYr = parseInt(fy.replace('FY', '').split('-')[0]);
    return `AY ${startYr + 1}-${String(startYr + 2).slice(-2)}`;
}


/**
 * Extract base asset and quote currency from a market pair string.
 * 
 * @example parseMarketPair('XRPINR')  → { asset: 'XRP', quote: 'INR' }
 * @example parseMarketPair('DOGEUSDT') → { asset: 'DOGE', quote: 'USDT' }
 * @example parseMarketPair('I-ADA/INR') → { asset: 'ADA', quote: 'INR' }
 */
export function parseMarketPair(market: string): { asset: string; quote: string } {
    let m = market.toUpperCase().trim();

    // Handle "I-ADA/INR" format (CoinDCX Insta)
    m = m.replace(/^I-/, '');
    if (m.includes('/')) {
        const [a, q] = m.split('/');
        return { asset: a, quote: q || 'INR' };
    }
    if (m.includes('-')) {
        const [a, q] = m.split('-');
        return { asset: a, quote: q || 'INR' };
    }
    if (m.includes('_')) {
        const [a, q] = m.split('_');
        return { asset: a, quote: q || 'INR' };
    }

    // Try suffix matching
    for (const q of QUOTE_CURRENCIES) {
        if (m.endsWith(q) && m.length > q.length) {
            return { asset: m.slice(0, -q.length), quote: q };
        }
    }

    return { asset: m, quote: 'INR' }; // fallback
}


/**
 * Indian number formatter — handles any amount dynamically.
 * Uses the Indian lakh/crore number system.
 * 
 * @example formatINR(2500)       → '₹2.5K'
 * @example formatINR(250000)     → '₹2.50L'
 * @example formatINR(25000000)   → '₹2.50Cr'
 * @example formatINR(-1500)      → '-₹1.5K'
 */
export function formatINR(n: number | null | undefined): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
    return `${sign}₹${abs.toFixed(0)}`;
}

/**
 * Full INR formatter with commas (Indian numbering system).
 * @example formatINRFull(282437) → '₹2,82,437'
 */
export function formatINRFull(n: number | null | undefined): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const parts = abs.toFixed(2).split('.');
    const intPart = parts[0];
    const decPart = parts[1];

    // Indian comma grouping: last 3 digits, then groups of 2
    let result = '';
    const len = intPart.length;
    if (len <= 3) {
        result = intPart;
    } else {
        result = intPart.slice(-3);
        let remaining = intPart.slice(0, -3);
        while (remaining.length > 2) {
            result = remaining.slice(-2) + ',' + result;
            remaining = remaining.slice(0, -2);
        }
        if (remaining.length > 0) {
            result = remaining + ',' + result;
        }
    }

    return `${sign}₹${result}.${decPart}`;
}
