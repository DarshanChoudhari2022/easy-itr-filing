/**
 * EasyITR Crypto Engine - Production Ready
 * Full compliance engine for Section 115BBH (Indian Income Tax)
 * 
 * Features:
 * - FIFO/LIFO/HIFO accounting methods
 * - TDS tracking (1% under Section 194S)
 * - Airdrop, Staking, Gift handling
 * - Audit trail generation
 * - CSV parsing for major exchanges
 * - Error handling & validation
 */

// ============= TYPE DEFINITIONS =============

export type TransactionType =
    | 'buy'
    | 'sell'
    | 'airdrop'
    | 'staking'
    | 'mining'
    | 'gift_received'
    | 'gift_sent'
    | 'hard_fork'
    | 'transfer_in'
    | 'transfer_out'
    | 'swap_in'
    | 'swap_out'
    | 'derivative_gain'
    | 'derivative_loss'
    | 'nft_sale'
    | 'nft_purchase'
    | 'interest_earned';

export type AccountingMethod = 'FIFO' | 'LIFO' | 'HIFO';

export interface Transaction {
    id: string;
    type: TransactionType;
    token: string;
    quantity: number;
    pricePerUnit: number; // In INR
    date: Date;
    exchange?: string;
    description?: string;
    fee?: number; // Transaction fee in INR
    feeCurrency?: string;
    tdsDeducted?: number; // 1% TDS under Section 194S
    txHash?: string; // Blockchain transaction hash
    counterpartyToken?: string; // For swaps
    counterpartyQuantity?: number; // For swaps
    assessmentYear?: string;
}

export interface InventoryLot {
    id: string;
    buyTxId: string;
    quantity: number;
    costBasis: number; // Per unit cost in INR
    date: Date;
    exchange?: string;
}

export interface MatchedLot {
    buyId: string;
    sellId: string;
    token: string;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
    buyDate: Date;
    sellDate: Date;
    gainLoss: number;
    holdingPeriod: number; // Days
    isShortTerm: boolean; // < 365 days = short term (though not relevant for VDA)
}

export interface GainResult {
    token: string;
    totalGain: number;
    totalLoss: number;
    taxableGain: number; // For India, this equals totalGain (no loss set-off)
    taxAt30Percent: number;
    taxAt1Percent: number; // TDS
    netTaxDue: number;
    matchedLots: MatchedLot[];
    currentHolding: number;
    averageCostBasis: number;
    totalInvested: number;
    totalReceived: number;
}

export interface TaxSettings {
    accountingMethod: AccountingMethod;
    treatAirdropsAsIncome: boolean;
    treatRewardsAsIncome: boolean;
    treatStakingAsIncome: boolean;
    treatInterestAsIncome: boolean;
    treatMiningAsIncome: boolean;
    baseCurrency: string;
    country: string;
    assessmentYear: string;
}

export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

export interface AuditLogEntry {
    timestamp: Date;
    action: string;
    details: string;
    data?: Record<string, any>;
}

export interface PortfolioSummary {
    breakdown: GainResult[];
    totalTaxableGains: number;
    totalLosses: number;
    totalOtherIncome: number;
    totalTaxAt30: number;
    totalTDSPaid: number;
    netTaxDue: number;
    monthlyArray: { name: string; gain: number; loss: number }[];
    tokenWise: { name: string; gain: number; loss: number; holding: number }[];
    auditTrail: AuditLogEntry[];
    warnings: ValidationError[];
}

// ============= CONSTANTS =============

const VDA_TAX_RATE = 0.30; // 30% flat tax on VDA gains
const TDS_RATE = 0.01; // 1% TDS under Section 194S
// Note: Surcharge (10-15% above 50L/1Cr) and 4% Cess can be added for complete tax calculation

// Income-like transaction types (taxed as other income)
const INCOME_TYPES: TransactionType[] = ['airdrop', 'staking', 'mining', 'gift_received', 'hard_fork', 'interest_earned'];

// Inflow types (add to inventory)
const INFLOW_TYPES: TransactionType[] = ['buy', 'swap_in', 'transfer_in', 'nft_purchase', ...INCOME_TYPES];

// Outflow types (remove from inventory)
const OUTFLOW_TYPES: TransactionType[] = ['sell', 'swap_out', 'transfer_out', 'gift_sent', 'nft_sale'];

// ============= VALIDATION FUNCTIONS =============

export function validateTransaction(tx: Transaction): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!tx.id || tx.id.trim() === '') {
        errors.push({ field: 'id', message: 'Transaction ID is required', severity: 'error' });
    }

    if (!tx.token || tx.token.trim() === '') {
        errors.push({ field: 'token', message: 'Token symbol is required', severity: 'error' });
    }

    if (!tx.type) {
        errors.push({ field: 'type', message: 'Transaction type is required', severity: 'error' });
    }

    if (typeof tx.quantity !== 'number' || tx.quantity <= 0) {
        errors.push({ field: 'quantity', message: 'Quantity must be a positive number', severity: 'error' });
    }

    if (typeof tx.pricePerUnit !== 'number' || tx.pricePerUnit < 0) {
        errors.push({ field: 'pricePerUnit', message: 'Price must be a non-negative number', severity: 'error' });
    }

    if (!tx.date || !(tx.date instanceof Date) || isNaN(tx.date.getTime())) {
        errors.push({ field: 'date', message: 'Valid date is required', severity: 'error' });
    }

    // Future date warning
    if (tx.date && tx.date > new Date()) {
        errors.push({ field: 'date', message: 'Transaction date is in the future', severity: 'warning' });
    }

    // Sell without buy warning (checked separately during calculation)
    if (tx.type === 'sell' && tx.pricePerUnit === 0) {
        errors.push({ field: 'pricePerUnit', message: 'Sell price is zero', severity: 'warning' });
    }

    // Swap validation
    if ((tx.type === 'swap_in' || tx.type === 'swap_out') && !tx.counterpartyToken) {
        errors.push({ field: 'counterpartyToken', message: 'Swap requires counterparty token', severity: 'warning' });
    }

    return errors;
}

export function validateTransactions(transactions: Transaction[]): {
    valid: Transaction[];
    invalid: { tx: Transaction; errors: ValidationError[] }[];
    warnings: ValidationError[];
} {
    const valid: Transaction[] = [];
    const invalid: { tx: Transaction; errors: ValidationError[] }[] = [];
    const warnings: ValidationError[] = [];

    for (const tx of transactions) {
        const errors = validateTransaction(tx);
        const criticalErrors = errors.filter(e => e.severity === 'error');
        const warnErrors = errors.filter(e => e.severity === 'warning');

        if (criticalErrors.length > 0) {
            invalid.push({ tx, errors: criticalErrors });
        } else {
            valid.push(tx);
        }

        warnings.push(...warnErrors);
    }

    return { valid, invalid, warnings };
}

// ============= CORE CALCULATION ENGINE =============

/**
 * Calculate gains for a single token using specified accounting method
 * Implements Section 115BBH rules:
 * - 30% flat tax on gains
 * - No set-off of losses allowed
 * - No deduction except cost of acquisition
 */
export function calculateTokenGains(
    transactions: Transaction[],
    settings: TaxSettings
): GainResult {
    const auditLog: AuditLogEntry[] = [];
    const token = transactions[0]?.token || 'UNKNOWN';

    // Sort by date
    const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    auditLog.push({
        timestamp: new Date(),
        action: 'START_CALCULATION',
        details: `Starting ${settings.accountingMethod} calculation for ${token} with ${sorted.length} transactions`
    });

    // Inventory tracking
    const inventory: InventoryLot[] = [];
    const matchedLots: MatchedLot[] = [];

    let totalGain = 0;
    let totalLoss = 0;
    let currentHolding = 0;
    let totalInvested = 0;
    let totalReceived = 0;
    let totalTDSPaid = 0;

    for (const tx of sorted) {
        if (INFLOW_TYPES.includes(tx.type)) {
            // ===== INFLOW: Add to inventory =====
            let costBasis = tx.pricePerUnit;

            // For income types (airdrops, staking), the cost basis is the FMV at receipt
            // This is already treated as income separately
            if (INCOME_TYPES.includes(tx.type)) {
                costBasis = tx.pricePerUnit;
            }

            // Keep exchange fees separate from the asset purchase consideration.

            inventory.push({
                id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                buyTxId: tx.id,
                quantity: tx.quantity,
                costBasis,
                date: tx.date,
                exchange: tx.exchange
            });

            currentHolding += tx.quantity;
            totalInvested += tx.quantity * costBasis;

            auditLog.push({
                timestamp: new Date(),
                action: 'INFLOW',
                details: `Added ${tx.quantity} ${token} @ ₹${costBasis.toFixed(2)} per unit (${tx.type})`,
                data: { txId: tx.id, quantity: tx.quantity, costBasis }
            });

        } else if (OUTFLOW_TYPES.includes(tx.type)) {
            // ===== OUTFLOW: Remove from inventory and calculate gains =====
            let remainingToSell = tx.quantity;
            const salePrice = tx.pricePerUnit;

            while (remainingToSell > 0 && inventory.length > 0) {
                // Select lot based on accounting method
                let lotIndex = selectLotIndex(inventory, settings.accountingMethod);

                if (lotIndex === -1) {
                    auditLog.push({
                        timestamp: new Date(),
                        action: 'WARNING',
                        details: `Selling ${remainingToSell} ${token} without matching buy lot (possible transfer-in missing)`
                    });
                    break;
                }

                const lot = inventory[lotIndex];
                const matchedQty = Math.min(lot.quantity, remainingToSell);

                // Calculate gain/loss for this matched lot
                const proceeds = matchedQty * salePrice;
                const cost = matchedQty * lot.costBasis;
                const gain = proceeds - cost;

                // Section 115BBH does not allow disposal expenses to reduce income.
                const netGain = gain;

                // Calculate holding period
                const holdingPeriod = Math.floor((tx.date.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24));

                matchedLots.push({
                    buyId: lot.buyTxId,
                    sellId: tx.id,
                    token,
                    quantity: matchedQty,
                    buyPrice: lot.costBasis,
                    sellPrice: salePrice,
                    buyDate: lot.date,
                    sellDate: tx.date,
                    gainLoss: netGain,
                    holdingPeriod,
                    isShortTerm: holdingPeriod < 365
                });

                if (netGain > 0) {
                    totalGain += netGain;
                } else {
                    totalLoss += Math.abs(netGain);
                }

                totalReceived += proceeds;

                // Track TDS if provided
                if (tx.tdsDeducted) {
                    totalTDSPaid += (tx.tdsDeducted * (matchedQty / tx.quantity));
                }

                auditLog.push({
                    timestamp: new Date(),
                    action: 'LOT_MATCHED',
                    details: `Matched ${matchedQty} ${token}: Buy @ ₹${lot.costBasis.toFixed(2)} → Sell @ ₹${salePrice.toFixed(2)} = ₹${netGain.toFixed(2)} (${holdingPeriod} days)`,
                    data: { matchedQty, buyPrice: lot.costBasis, sellPrice: salePrice, gain: netGain }
                });

                // Update or remove lot
                if (lot.quantity <= remainingToSell) {
                    remainingToSell -= lot.quantity;
                    inventory.splice(lotIndex, 1);
                } else {
                    lot.quantity -= remainingToSell;
                    remainingToSell = 0;
                }
            }

            currentHolding -= (tx.quantity - remainingToSell);

            if (remainingToSell > Math.max(1e-12, tx.quantity * 1e-10)) {
                throw new Error(`Missing acquisition history for ${remainingToSell} ${token}. Import opening purchases before calculating.`);
            }
        }
    }

    // Calculate average cost basis
    const averageCostBasis = inventory.length > 0
        ? inventory.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0) / inventory.reduce((sum, lot) => sum + lot.quantity, 0)
        : 0;

    // Section 115BBH: Taxable gain = Total Gain (no loss set-off)
    const taxableGain = totalGain;
    const taxAt30Percent = taxableGain * VDA_TAX_RATE;
    const taxAt1Percent = totalTDSPaid; // TDS already deducted

    auditLog.push({
        timestamp: new Date(),
        action: 'CALCULATION_COMPLETE',
        details: `${token}: Total Gain ₹${totalGain.toFixed(2)}, Total Loss ₹${totalLoss.toFixed(2)}, Taxable ₹${taxableGain.toFixed(2)}, Tax @ 30% ₹${taxAt30Percent.toFixed(2)}`
    });

    return {
        token,
        totalGain,
        totalLoss,
        taxableGain,
        taxAt30Percent,
        taxAt1Percent,
        netTaxDue: taxAt30Percent - taxAt1Percent,
        matchedLots,
        currentHolding,
        averageCostBasis,
        totalInvested,
        totalReceived
    };
}

/**
 * Select lot index based on accounting method
 */
function selectLotIndex(inventory: InventoryLot[], method: AccountingMethod): number {
    if (inventory.length === 0) return -1;

    switch (method) {
        case 'FIFO':
            // First In, First Out - oldest first
            return 0;

        case 'LIFO':
            // Last In, First Out - newest first
            return inventory.length - 1;

        case 'HIFO':
            // Highest In, First Out - highest cost first (minimizes current gain)
            return inventory.reduce((maxIdx, lot, idx, arr) =>
                lot.costBasis > arr[maxIdx].costBasis ? idx : maxIdx, 0);

        default:
            return 0;
    }
}

// ============= PORTFOLIO SUMMARY =============

/**
 * Calculate complete portfolio summary with all tokens
 */
export function calculateDetailedPortfolio(
    trades: Transaction[],
    settings: TaxSettings
): PortfolioSummary {
    const auditTrail: AuditLogEntry[] = [];
    const warnings: ValidationError[] = [];

    // Validate all transactions first
    const validation = validateTransactions(trades);
    warnings.push(...validation.warnings);

    if (validation.invalid.length > 0) {
        validation.invalid.forEach(({ tx, errors }) => {
            auditTrail.push({
                timestamp: new Date(),
                action: 'VALIDATION_ERROR',
                details: `Transaction ${tx.id} has errors: ${errors.map(e => e.message).join(', ')}`
            });
        });
    }

    // Group by token
    const tradesByToken: Record<string, Transaction[]> = {};
    validation.valid.forEach(t => {
        if (!tradesByToken[t.token]) tradesByToken[t.token] = [];
        tradesByToken[t.token].push(t);
    });

    // Calculate gains per token
    const breakdown: GainResult[] = [];
    let totalTaxableGains = 0;
    let totalLosses = 0;
    let totalOtherIncome = 0;
    let totalTDSPaid = 0;

    for (const token in tradesByToken) {
        const result = calculateTokenGains(tradesByToken[token], settings);
        breakdown.push(result);
        totalTaxableGains += result.taxableGain;
        totalLosses += result.totalLoss;
        totalTDSPaid += result.taxAt1Percent;
    }

    // Calculate "Other Income" from airdrops, staking, etc.
    if (settings.treatAirdropsAsIncome || settings.treatStakingAsIncome || settings.treatMiningAsIncome) {
        validation.valid.forEach(t => {
            if (t.type === 'airdrop' && settings.treatAirdropsAsIncome) {
                totalOtherIncome += t.quantity * t.pricePerUnit;
            }
            if (t.type === 'staking' && settings.treatStakingAsIncome) {
                totalOtherIncome += t.quantity * t.pricePerUnit;
            }
            if (t.type === 'mining' && settings.treatMiningAsIncome) {
                totalOtherIncome += t.quantity * t.pricePerUnit;
            }
            if (t.type === 'interest_earned' && settings.treatInterestAsIncome) {
                totalOtherIncome += t.quantity * t.pricePerUnit;
            }
        });
    }

    // Monthly breakdown
    const monthlyData: Record<string, { gain: number; loss: number }> = {};
    breakdown.forEach(result => {
        result.matchedLots.forEach(lot => {
            const month = lot.sellDate.toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!monthlyData[month]) monthlyData[month] = { gain: 0, loss: 0 };
            if (lot.gainLoss > 0) {
                monthlyData[month].gain += lot.gainLoss;
            } else {
                monthlyData[month].loss += Math.abs(lot.gainLoss);
            }
        });
    });

    const monthlyArray = Object.entries(monthlyData)
        .map(([name, data]) => ({ name, gain: data.gain, loss: data.loss }))
        .sort((a, b) => {
            // Sort chronologically
            const parseMonth = (str: string) => {
                const [mon, yr] = str.split(' ');
                const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                return new Date(2000 + parseInt(yr), months[mon] || 0);
            };
            return parseMonth(a.name).getTime() - parseMonth(b.name).getTime();
        });

    // Token-wise summary
    const tokenWise = breakdown.map(b => ({
        name: b.token,
        gain: b.totalGain,
        loss: b.totalLoss,
        holding: b.currentHolding
    }));

    // Calculate final tax
    const totalTaxAt30 = totalTaxableGains * VDA_TAX_RATE;
    const netTaxDue = totalTaxAt30 - totalTDSPaid;

    auditTrail.push({
        timestamp: new Date(),
        action: 'PORTFOLIO_SUMMARY',
        details: `Total Taxable: ₹${totalTaxableGains.toFixed(2)}, Tax @30%: ₹${totalTaxAt30.toFixed(2)}, TDS Paid: ₹${totalTDSPaid.toFixed(2)}, Net Due: ₹${netTaxDue.toFixed(2)}`
    });

    return {
        breakdown,
        totalTaxableGains,
        totalLosses,
        totalOtherIncome,
        totalTaxAt30,
        totalTDSPaid,
        netTaxDue,
        monthlyArray,
        tokenWise,
        auditTrail,
        warnings
    };
}

// ============= CSV PARSING =============

export interface CSVParseResult {
    transactions: Transaction[];
    errors: { line: number; message: string }[];
    exchange: string;
}

/**
 * Parse WazirX CSV export format
 */
/**
 * Helper to safely parse dates from various CSV formats
 * Handles: Unix timestamps, ISO, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
 */
function safeParseDate(dateStr: string): Date {
    if (!dateStr) {
        console.warn('[safeParseDate] Empty date string, using current date');
        return new Date();
    }

    const trimmed = dateStr.trim();
    console.log('[safeParseDate] Parsing:', trimmed);

    // 1. Try Unix timestamp (milliseconds - 13 digits)
    if (/^\d{13}$/.test(trimmed)) {
        const date = new Date(parseInt(trimmed));
        if (!isNaN(date.getTime())) {
            console.log('[safeParseDate] Parsed as Unix ms:', date);
            return date;
        }
    }

    // 2. Try Unix timestamp (seconds - 10 digits)
    if (/^\d{10}$/.test(trimmed)) {
        const date = new Date(parseInt(trimmed) * 1000);
        if (!isNaN(date.getTime())) {
            console.log('[safeParseDate] Parsed as Unix sec:', date);
            return date;
        }
    }

    // 3. Try ISO format directly (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            console.log('[safeParseDate] Parsed as ISO:', date);
            return date;
        }
    }

    // 4. Try DD-MM-YYYY or DD/MM/YYYY (Indian format)
    const dmyPattern = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
    const dmyMatch = trimmed.match(dmyPattern);
    if (dmyMatch) {
        const [, day, month, year, hours, minutes, seconds] = dmyMatch;
        const d = parseInt(day), m = parseInt(month);
        // If day > 12, it's definitely DD-MM format
        if (d <= 31 && m <= 12) {
            const date = new Date(
                parseInt(year),
                m - 1,
                d,
                hours ? parseInt(hours) : 0,
                minutes ? parseInt(minutes) : 0,
                seconds ? parseInt(seconds) : 0
            );
            if (!isNaN(date.getTime())) {
                console.log('[safeParseDate] Parsed as DD-MM-YYYY:', date);
                return date;
            }
        }
    }

    // 5. Try MM-DD-YYYY (US format) if first number > 12
    const mdyPattern = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
    const mdyMatch = trimmed.match(mdyPattern);
    if (mdyMatch) {
        const [, month, day, year, hours, minutes, seconds] = mdyMatch;
        const d = parseInt(day), m = parseInt(month);
        if (m <= 12 && d <= 31) {
            const date = new Date(
                parseInt(year),
                m - 1,
                d,
                hours ? parseInt(hours) : 0,
                minutes ? parseInt(minutes) : 0,
                seconds ? parseInt(seconds) : 0
            );
            if (!isNaN(date.getTime())) {
                console.log('[safeParseDate] Parsed as MM-DD-YYYY:', date);
                return date;
            }
        }
    }

    // 6. Handle "Jan 15, 2024" or "15 Jan 2024" format
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const namedMonthPattern = /(\d{1,2})\s+(\w{3})\s+(\d{4})|(\w{3})\s+(\d{1,2}),?\s+(\d{4})/i;
    const namedMatch = trimmed.match(namedMonthPattern);
    if (namedMatch) {
        let day: number, monthIdx: number, year: number;
        if (namedMatch[1]) {
            day = parseInt(namedMatch[1]);
            monthIdx = monthNames.indexOf(namedMatch[2].toLowerCase());
            year = parseInt(namedMatch[3]);
        } else {
            monthIdx = monthNames.indexOf(namedMatch[4].toLowerCase());
            day = parseInt(namedMatch[5]);
            year = parseInt(namedMatch[6]);
        }
        if (monthIdx >= 0) {
            const date = new Date(year, monthIdx, day);
            if (!isNaN(date.getTime())) {
                console.log('[safeParseDate] Parsed as named month:', date);
                return date;
            }
        }
    }

    // 7. Last resort - try native parser
    const lastTry = new Date(trimmed);
    if (!isNaN(lastTry.getTime())) {
        console.log('[safeParseDate] Parsed natively:', lastTry);
        return lastTry;
    }

    console.error('[safeParseDate] FAILED to parse:', trimmed);
    return new Date(NaN); // Return invalid date
}

/**
 * Parse WazirX CSV export format
 */
export function parseWazirXCSV(csvContent: string, userId: string): CSVParseResult {
    const transactions: Transaction[] = [];
    const errors: { line: number; message: string }[] = [];
    const lines = csvContent.split('\n').filter(l => l.trim());

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        try {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 5) continue;

            // WazirX format: Date, Market, Type, Volume, Price, Total, Fee, Fee Currency
            const [date, market, type, volume, price, total, fee, feeCurrency] = cols;

            // Parse market to get token (e.g., "BTC/INR" -> "BTC")
            const token = market.split('/')[0]?.toUpperCase() || 'UNKNOWN';

            transactions.push({
                id: `wazirx-${i}-${Date.now()}`,
                type: type.toLowerCase() === 'buy' ? 'buy' : 'sell',
                token,
                quantity: parseFloat(volume) || 0,
                pricePerUnit: parseFloat(price) || 0,
                date: safeParseDate(date),
                exchange: 'WazirX',
                fee: parseFloat(fee) || 0,
                feeCurrency: feeCurrency || 'INR',
                assessmentYear: '2025-26'
            });
        } catch (err) {
            errors.push({ line: i + 1, message: `Failed to parse line: ${(err as Error).message}` });
        }
    }

    return { transactions, errors, exchange: 'WazirX' };
}

/**
 * Parse CoinDCX CSV export format
 * Auto-detects column headers for flexibility
 */
export function parseCoinDCXCSV(csvContent: string, userId: string): CSVParseResult {
    const transactions: Transaction[] = [];
    const errors: { line: number; message: string }[] = [];
    const lines = csvContent.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
        errors.push({ line: 1, message: 'CSV file is empty or has no data' });
        return { transactions, errors, exchange: 'CoinDCX' };
    }

    // Parse header to detect column indices
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));

    console.log('[CoinDCX Parser] Headers detected:', headers);

    // Map column indices - CoinDCX uses various column names
    const indices = {
        date: headers.findIndex(h => h.includes('time') || h.includes('date') || h.includes('created')),
        pair: headers.findIndex(h => h.includes('pair') || h.includes('market') || h.includes('symbol') || h.includes('coin')),
        side: headers.findIndex(h => h.includes('side') || h.includes('type') || h.includes('order_type') || h === 'buy/sell'),
        quantity: headers.findIndex(h => h.includes('quantity') || h.includes('amount') || h.includes('volume') || h.includes('qty')),
        price: headers.findIndex(h => h.includes('price') || h.includes('rate')),
        fee: headers.findIndex(h => h.includes('fee') || h.includes('commission')),
        total: headers.findIndex(h => h.includes('total') || h.includes('value'))
    };

    console.log('[CoinDCX Parser] Detected indices:', indices);

    // Check if we have minimum required columns
    if (indices.date === -1 || indices.quantity === -1) {
        // Try fully generic parsing
        console.log('[CoinDCX Parser] Using positional parsing');
        indices.date = 0;
        indices.pair = 1;
        indices.side = 2;
        indices.quantity = 3;
        indices.price = 4;
        indices.fee = 5;
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
        try {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 4) {
                errors.push({ line: i + 1, message: 'Insufficient columns' });
                continue;
            }

            const dateStr = cols[indices.date] || '';
            const pairStr = cols[indices.pair] || '';
            const sideStr = cols[indices.side] || 'buy';
            const qtyStr = cols[indices.quantity] || '0';
            const priceStr = cols[indices.price >= 0 ? indices.price : 4] || '0';
            const feeStr = cols[indices.fee >= 0 ? indices.fee : 5] || '0';

            console.log(`[CoinDCX Parser] Row ${i}: date=${dateStr}, pair=${pairStr}, side=${sideStr}, qty=${qtyStr}`);

            // Extract token from pair (e.g., "BTCINR" -> "BTC", "BTC/INR" -> "BTC")
            let token = pairStr.replace(/[/_]?(INR|USDT|BUSD|BTC)$/i, '').toUpperCase();
            if (!token) token = 'UNKNOWN';

            const parsedDate = safeParseDate(dateStr);

            // Skip if date is invalid
            if (isNaN(parsedDate.getTime())) {
                errors.push({ line: i + 1, message: `Invalid date: ${dateStr}` });
                continue;
            }

            const sideNormalized = sideStr.toLowerCase();
            const isBuy = sideNormalized.includes('buy') || sideNormalized === 'b';

            transactions.push({
                id: `coindcx-${i}-${Date.now()}`,
                type: isBuy ? 'buy' : 'sell',
                token,
                quantity: parseFloat(qtyStr) || 0,
                pricePerUnit: parseFloat(priceStr) || 0,
                date: parsedDate,
                exchange: 'CoinDCX',
                fee: parseFloat(feeStr) || 0,
                assessmentYear: '2025-26'
            });
        } catch (err) {
            errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
        }
    }

    console.log(`[CoinDCX Parser] Parsed ${transactions.length} transactions, ${errors.length} errors`);
    return { transactions, errors, exchange: 'CoinDCX' };
}

/**
 * Parse Binance CSV export format
 */
export function parseBinanceCSV(csvContent: string, userId: string): CSVParseResult {
    const transactions: Transaction[] = [];
    const errors: { line: number; message: string }[] = [];
    const lines = csvContent.split('\n').filter(l => l.trim());

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        try {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 6) continue;

            // Binance format: Date(UTC), Pair, Side, Price, Executed, Amount, Fee
            const [dateStr, pair, side, price, executed, amount, fee] = cols;

            // Extract token from pair
            let token = 'UNKNOWN';
            const pairs = ['USDT', 'INR', 'BUSD', 'BTC', 'ETH'];
            for (const p of pairs) {
                if (pair.endsWith(p)) {
                    token = pair.slice(0, -p.length);
                    break;
                }
            }

            transactions.push({
                id: `binance-${i}-${Date.now()}`,
                type: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
                token,
                quantity: parseFloat(executed) || 0,
                pricePerUnit: parseFloat(price) || 0,
                date: safeParseDate(dateStr),
                exchange: 'Binance',
                fee: parseFloat(fee) || 0,
                assessmentYear: '2025-26'
            });
        } catch (err) {
            errors.push({ line: i + 1, message: `Failed to parse line: ${(err as Error).message}` });
        }
    }

    return { transactions, errors, exchange: 'Binance' };
}

/**
 * Auto-detect exchange format and parse
 */
export function parseExchangeCSV(csvContent: string, userId: string, exchangeHint?: string): CSVParseResult {
    const firstLine = csvContent.split('\n')[0]?.toLowerCase() || '';
    const hint = exchangeHint?.toLowerCase() || '';

    // Detect based on hint or header
    if (hint.includes('wazirx') || firstLine.includes('market') && firstLine.includes('volume')) {
        return parseWazirXCSV(csvContent, userId);
    } else if (hint.includes('coindcx') || hint.includes('coindcx') || firstLine.includes('pair') || firstLine.includes('side')) {
        return parseCoinDCXCSV(csvContent, userId);
    } else if (hint.includes('binance') || firstLine.includes('executed') || firstLine.includes('symbol')) {
        return parseBinanceCSV(csvContent, userId);
    } else if (hint.includes('zebpay')) {
        // ZebPay uses similar format to CoinDCX
        return parseCoinDCXCSV(csvContent, userId);
    }

    // Try generic CSV parsing as fallback
    return parseGenericCSV(csvContent, userId);
}

/**
 * Generic CSV parser - tries to detect columns by name
 */
function parseGenericCSV(csvContent: string, userId: string): CSVParseResult {
    const transactions: Transaction[] = [];
    const errors: { line: number; message: string }[] = [];
    const lines = csvContent.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
        return { transactions: [], errors: [{ line: 0, message: 'CSV file is empty or has no data rows' }], exchange: 'Unknown' };
    }

    // Parse header to find column indices
    const header = lines[0].toLowerCase().split(',').map(c => c.trim().replace(/"/g, ''));
    const indices = {
        date: header.findIndex(h => h.includes('date') || h.includes('time') || h.includes('timestamp')),
        type: header.findIndex(h => h.includes('type') || h.includes('side') || h.includes('action')),
        token: header.findIndex(h => h.includes('coin') || h.includes('asset') || h.includes('pair') || h.includes('symbol') || h.includes('currency')),
        quantity: header.findIndex(h => h.includes('quantity') || h.includes('amount') || h.includes('vol') || h.includes('size')),
        price: header.findIndex(h => h.includes('price') || h.includes('rate') || h.includes('value')),
        fee: header.findIndex(h => h.includes('fee') || h.includes('commission'))
    };

    // If essential columns not found
    if (indices.token === -1 || indices.quantity === -1) {
        return {
            transactions: [],
            errors: [{ line: 0, message: 'Could not detect required columns (token/quantity). Please ensure CSV has proper headers.' }],
            exchange: 'Unknown'
        };
    }

    for (let i = 1; i < lines.length; i++) {
        try {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));

            let token = indices.token >= 0 ? cols[indices.token]?.toUpperCase() : 'UNKNOWN';
            // Clean token name (remove INR, USDT suffix)
            token = token.replace(/INR|USDT|USD|BUSD/gi, '').trim();

            const typeRaw = indices.type >= 0 ? cols[indices.type].toLowerCase() : 'buy';
            const type = typeRaw.includes('buy') || typeRaw.includes('deposit') ? 'buy' :
                typeRaw.includes('sell') || typeRaw.includes('withdraw') ? 'sell' : 'buy';

            const quantity = parseFloat(cols[indices.quantity]) || 0;
            const price = indices.price >= 0 ? parseFloat(cols[indices.price]) || 0 : 0;
            const fee = indices.fee >= 0 ? parseFloat(cols[indices.fee]) || 0 : 0;

            let date = new Date();
            if (indices.date >= 0) {
                date = safeParseDate(cols[indices.date]);
            }

            if (quantity > 0 && token) {
                transactions.push({
                    id: `generic-${i}-${Date.now()}`,
                    type: type as TransactionType,
                    token,
                    quantity,
                    pricePerUnit: price,
                    date,
                    exchange: 'CSV Import',
                    fee,
                    assessmentYear: '2025-26'
                });
            }
        } catch (err) {
            errors.push({ line: i + 1, message: `Parse error: ${(err as Error).message}` });
        }
    }

    return { transactions, errors, exchange: 'Generic' };
}

// ============= REPORT GENERATION =============

export interface ScheduleVDAData {
    assessmentYear: string;
    panNumber: string;
    totalVDAGains: number;
    totalVDALosses: number;
    taxableVDAGains: number;
    taxAt30Percent: number;
    tdsPaid: number;
    netTaxPayable: number;
    tokenWiseDetails: {
        token: string;
        saleValue: number;
        costOfAcquisition: number;
        gain: number;
        loss: number;
    }[];
}

/**
 * Generate Schedule VDA data for ITR filing
 */
export function generateScheduleVDA(
    portfolio: PortfolioSummary,
    panNumber: string,
    assessmentYear: string
): ScheduleVDAData {
    const tokenWiseDetails = portfolio.breakdown.map(b => ({
        token: b.token,
        saleValue: b.totalReceived,
        costOfAcquisition: b.totalInvested,
        gain: b.totalGain,
        loss: b.totalLoss
    }));

    return {
        assessmentYear,
        panNumber,
        totalVDAGains: portfolio.totalTaxableGains,
        totalVDALosses: portfolio.totalLosses,
        taxableVDAGains: portfolio.totalTaxableGains,
        taxAt30Percent: portfolio.totalTaxAt30,
        tdsPaid: portfolio.totalTDSPaid,
        netTaxPayable: portfolio.netTaxDue,
        tokenWiseDetails
    };
}

// ============= HELPER FUNCTIONS =============

/**
 * Get financial year for a date (Indian FY: Apr-Mar)
 */
export function getFinancialYear(date: Date): string {
    const month = date.getMonth();
    const year = date.getFullYear();

    if (month >= 3) { // April onwards
        return `${year}-${(year + 1).toString().slice(-2)}`;
    } else {
        return `${year - 1}-${year.toString().slice(-2)}`;
    }
}

/**
 * Get assessment year for a financial year
 */
export function getAssessmentYear(financialYear: string): string {
    const [startYear] = financialYear.split('-');
    const start = parseInt(startYear);
    return `${start + 1}-${(start + 2).toString().slice(-2)}`;
}

/**
 * Format currency for display
 */
export function formatINR(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * Calculate TDS amount (1% under Section 194S)
 */
export function calculateTDS(saleValue: number): number {
    return saleValue * TDS_RATE;
}

// ============= DEFAULT SETTINGS =============

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
    accountingMethod: 'FIFO',
    treatAirdropsAsIncome: true,
    treatRewardsAsIncome: true,
    treatStakingAsIncome: true,
    treatInterestAsIncome: true,
    treatMiningAsIncome: true,
    baseCurrency: 'INR',
    country: 'India',
    assessmentYear: '2026-27'
};

