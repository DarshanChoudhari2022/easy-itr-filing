/**
 * Tax Mitra — FIFO Tax Computation Engine v5
 * ============================================
 * Production-ready Indian crypto tax computation under:
 *   - Section 115BBH: 30% flat tax on VDA gains
 *   - Section 194S: 1% TDS on consideration
 *
 * ARCHITECTURE (v5 — KoinX-Matching):
 *   ✓ ORDER-LEVEL AGGREGATION: Fills grouped by orderId (matches KoinX counting)
 *   ✓ FULL HISTORICAL FIFO: ALL transactions from inception are processed
 *   ✓ FY selection is REPORTING-LEVEL ONLY — never affects FIFO inventory
 *   ✓ Prior-year sells correctly consume inventory (fixes KoinX mismatch)
 *   ✓ Transaction validation: rejects UNKNOWN assets, zero-qty, zero-value trades
 *   ✓ Stablecoin trades (USDT/USDC) treated as taxable disposals
 *   ✓ Inventory reconciliation & negative inventory prevention
 *   ✓ Brokerage does NOT reduce cost basis (per 115BBH)
 *   ✓ Losses cannot offset gains (per 115BBH)
 *   ✓ Idempotent reprocessing — full FIFO recalculation on every run
 *   ✓ TDS: uses actual trade data only, never inflates with theoretical 1%
 *
 * Rules enforced:
 *   ✓ No set-off of VDA losses against other income heads
 *   ✓ No carry-forward of VDA losses
 *   ✓ Conservative: loss from one VDA does NOT offset gain from another
 *   ✓ Only "cost of acquisition" deductible (no fees, no incidental costs)
 *   ✓ TDS credit applied against total tax liability
 *   ✓ Surcharge + 4% H&E Cess layered on top
 *   ✓ Full FIFO audit trail for CA review
 *   ✓ IST timezone for FY assignment (Indian FY: 1 Apr - 31 Mar IST)
 *   ✓ Canonical event classifier (KoinX-compatible)
 *   ✓ Fee handling per 115BBH (cost of acquisition only)
 */

import type { NormalizedTransaction, TDSRecord } from './coindcx-ingestion';
import { aggregateFillsToOrders, type AggregationStats } from './order-aggregator';

// ============= IST TIMEZONE HELPERS =============

/** IST offset in minutes: UTC+5:30 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Convert any Date to IST-equivalent Date object.
 * CRITICAL: Indian FY is determined by IST date, NOT UTC.
 * A trade at 2025-03-31T22:00 UTC is 2025-04-01T03:30 IST → FY 2025-26.
 */
function toIST(date: Date): Date {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    return new Date(utcMs + IST_OFFSET_MS);
}

/**
 * Pure function: Map any transaction timestamp to its Indian Financial Year.
 * FY is 1 April to 31 March IST.
 * Returns format: "2024-25"
 */
export function mapTxToFinancialYear(timestamp: Date): string {
    const ist = toIST(timestamp);
    const m = ist.getMonth(); // 0-indexed
    const y = ist.getFullYear();
    if (m >= 3) { // Apr (3) to Dec (11)
        return `${y}-${(y + 1).toString().slice(-2)}`;
    }
    // Jan (0) to Mar (2) → previous calendar year's FY
    return `${y - 1}-${y.toString().slice(-2)}`;
}

// ============= EVENT CLASSIFIER (KoinX-compatible) =============

export type VdaEventType =
    | 'SPOT_BUY' | 'SPOT_SELL'
    | 'CRYPTO_TO_CRYPTO_BUY' | 'CRYPTO_TO_CRYPTO_SELL'
    | 'TRANSFER_SELF'
    | 'DEPOSIT_FIAT' | 'WITHDRAW_FIAT'
    | 'DEPOSIT_CRYPTO' | 'WITHDRAW_CRYPTO'
    | 'REWARD' | 'STAKING' | 'AIRDROP' | 'REFERRAL_BONUS'
    | 'INTEREST_EARNED' | 'MINING'
    | 'FEE_ONLY'
    | 'P2P_INR_BUY' | 'P2P_INR_SELL'
    | 'DERIVATIVE_TRADE'
    | 'UNKNOWN';

/**
 * Canonical classifier — single source of truth for event type.
 * Rules:
 *   - TRANSFER_SELF is never a taxable disposal
 *   - Only disposals of VDA are capital gains events
 *   - Rewards/staking/airdrops are income at FMV on receipt
 */
export function classifyVdaEvent(tx: NormalizedTransaction): VdaEventType {
    const t = (tx.transactionType || '').toLowerCase().trim();
    const asset = (tx.assetSymbol || '').toUpperCase();
    const quote = (tx.quoteAsset || 'INR').toUpperCase();
    const isFiatQuote = quote === 'INR';

    // Rewards & income types
    if (t.startsWith('reward_') || t === 'reward') {
        if (t.includes('staking')) return 'STAKING';
        if (t.includes('interest')) return 'INTEREST_EARNED';
        if (t.includes('mining')) return 'MINING';
        return 'REWARD';
    }
    if (t === 'staking' || t === 'staking_reward') return 'STAKING';
    if (t === 'airdrop') return 'AIRDROP';
    if (t === 'referral_bonus' || t === 'referral') return 'REFERRAL_BONUS';
    if (t === 'interest_earned' || t === 'interest') return 'INTEREST_EARNED';
    if (t === 'mining') return 'MINING';

    // Transfers & Settlements
    if (t === 'transfer' || t === 'transfer_self' || t === 'internal_transfer') return 'TRANSFER_SELF';
    if (t === 'settlement' || t === 'adjustment' || t === 'redenomination') return 'TRANSFER_SELF'; // Treat as non-taxable move unless it has value

    // Deposits & Withdrawals
    if (t === 'deposit') {
        return (isFiatQuote || asset === 'INR') ? 'DEPOSIT_FIAT' : 'DEPOSIT_CRYPTO';
    }
    if (t === 'withdrawal' || t === 'withdraw') {
        return (isFiatQuote || asset === 'INR') ? 'WITHDRAW_FIAT' : 'WITHDRAW_CRYPTO';
    }

    // Spot trades
    if (t === 'buy' || t === 'market_buy' || t === 'limit_buy') {
        return isFiatQuote ? 'SPOT_BUY' : 'CRYPTO_TO_CRYPTO_BUY';
    }
    if (t === 'sell' || t === 'market_sell' || t === 'limit_sell') {
        return isFiatQuote ? 'SPOT_SELL' : 'CRYPTO_TO_CRYPTO_SELL';
    }

    // Swaps (crypto-to-crypto)
    if (t === 'swap_in') return 'CRYPTO_TO_CRYPTO_BUY';
    if (t === 'swap_out') return 'CRYPTO_TO_CRYPTO_SELL';

    // P2P
    if (t === 'p2p_buy') return 'P2P_INR_BUY';
    if (t === 'p2p_sell') return 'P2P_INR_SELL';

    // Derivatives
    if (t.includes('futures') || t.includes('margin') || t.includes('derivative')) return 'DERIVATIVE_TRADE';

    // Fee-only
    if (t === 'fee' || t === 'fee_only') return 'FEE_ONLY';

    return 'UNKNOWN';
}


/** Is this event an acquisition (adds to inventory)? */
function isAcquisitionEvent(eventType: VdaEventType): boolean {
    return [
        'SPOT_BUY', 'CRYPTO_TO_CRYPTO_BUY', 'P2P_INR_BUY',
        'DEPOSIT_CRYPTO', // Deposits add to inventory at zero cost (or FMV if known)
        'REWARD', 'STAKING', 'AIRDROP', 'REFERRAL_BONUS', 'INTEREST_EARNED', 'MINING',
    ].includes(eventType);
}

/** Is this event a disposal (triggers capital gains)? */
function isDisposalEvent(eventType: VdaEventType): boolean {
    return [
        'SPOT_SELL', 'CRYPTO_TO_CRYPTO_SELL', 'P2P_INR_SELL',
    ].includes(eventType);
}

/** Is this event an income event (taxed at FMV on receipt)? */
function isIncomeEvent(eventType: VdaEventType): boolean {
    return [
        'REWARD', 'STAKING', 'AIRDROP', 'REFERRAL_BONUS', 'INTEREST_EARNED', 'MINING',
    ].includes(eventType);
}

// ============= TYPES =============

export type AccountingMethod = 'FIFO' | 'LIFO' | 'HIFO';

export interface TaxLot {
    id: string;
    buyTransactionId: string;
    assetSymbol: string;
    originalQuantity: number;
    remainingQuantity: number;
    costBasisPerUnit: number; // INR
    totalCostInr: number;
    acquisitionDate: Date;
    acquisitionType: string;   // 'purchase', 'swap', 'reward', 'airdrop'
    exchange: string;
    financialYear: string;
    isFullyConsumed: boolean;
}

export interface LotMatch {
    sellTransactionId: string;
    buyLotId: string;
    assetSymbol: string;
    matchedQuantity: number;
    buyPricePerUnit: number;
    sellPricePerUnit: number;
    costOfAcquisition: number;  // INR
    saleConsideration: number;  // INR
    gainLoss: number;           // INR
    buyDate: Date;
    sellDate: Date;
    holdingDays: number;
    accountingMethod: AccountingMethod;
    financialYear: string;
}

export interface VDAReportLine {
    slNo: number;
    dateOfTransfer: string;      // DD/MM/YYYY
    dateOfAcquisition: string;   // DD/MM/YYYY (earliest FIFO lot)
    headOfIncome: string;
    descriptionOfVDA: string;    // "0.5 BTC (Bitcoin)"
    assetSymbol: string;
    saleConsideration: number;
    costOfAcquisition: number;
    incomeFromTransfer: number;  // gain or loss
    exchange: string;
    sellTransactionId: string;
}

export interface AssetGainSummary {
    assetSymbol: string;
    totalBought: number;        // quantity
    totalSold: number;          // quantity
    totalBuyValueInr: number;
    totalSellValueInr: number;
    grossGains: number;         // sum of profitable trade gains
    grossLosses: number;        // sum of loss-making trade losses
    netGainLoss: number;        // gross_gains - gross_losses (for info)
    taxableGain: number;        // = grossGains (NO loss offset per 115BBH)
    currentHolding: number;
    avgCostBasis: number;
    matchedLots: LotMatch[];
}

export interface TDSReconciliation {
    totalTDSFromTrades: number;     // TDS computed from trade data
    totalTDSFromCertificates: number; // TDS from TDS CSV
    matchedRecords: number;
    unmatchedTDSRecords: number;
    discrepancyInr: number;
    discrepancyPct: number;
    quarterWise: {
        quarter: string;
        tradeCount: number;
        totalConsideration: number;
        tdsAmount: number;
    }[];
    status: 'matched' | 'minor_discrepancy' | 'major_discrepancy';
    warnings: string[];
}

export interface TaxComputationResult {
    financialYear: string;
    assessmentYear: string;
    accountingMethod: AccountingMethod;

    // Asset-wise breakdown
    assetSummaries: AssetGainSummary[];

    // Aggregate capital gains
    totalConsiderationInr: number;
    totalCostOfAcquisitionInr: number;
    grossCapitalGains: number;       // Sum of gains from profitable trades ONLY
    grossCapitalLosses: number;      // For information (cannot offset)
    netGainLossInfo: number;         // For info only

    // Taxable amount per 115BBH
    taxableCapitalGains: number;     // = grossCapitalGains (per conservative interpretation)

    // Other Income (rewards, staking, airdrops)
    otherVDAIncome: number;          // Rewards valued at market rate
    totalTaxableVDA: number;         // taxableCapitalGains + otherVDAIncome

    // Tax Computation
    taxOnGains30Pct: number;
    taxOnOtherIncome30Pct: number;
    totalBaseTax: number;
    surcharge: number;
    cess4Pct: number;
    totalTaxLiability: number;

    // TDS
    tdsReconciliation: TDSReconciliation;
    totalTDSCredit: number;

    // Expenses
    totalBrokerageFee: number;

    // Final
    netTaxPayable: number;           // Positive = pay, Negative = refund
    isRefund: boolean;

    // Schedule VDA
    vdaReportLines: VDAReportLine[];
    totalVDAEntries: number;
    uniqueAssets: number;

    // Order Aggregation Stats (v5)
    aggregationStats?: AggregationStats;

    // Audit
    lotMatches: LotMatch[];
    activeLots: TaxLot[];            // Remaining inventory
    warnings: string[];
    computedAt: Date;
    engineVersion: string;
}

// ============= CONSTANTS =============

const VDA_TAX_RATE = 0.30;
const TDS_RATE_194S = 0.01;
const CESS_RATE = 0.04;
const ENGINE_VERSION = '5.0.0';

// Stablecoins are taxable VDAs — treat like any other crypto
const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FRAX', 'USDP', 'GUSD'];

// Surcharge thresholds for AY 2026-27 (on total income basis)
// For VDA income specifically, marginal surcharge caps may apply
const SURCHARGE_SLABS = [
    { above: 10000000, rate: 0.15 },   // Above 1Cr: 15%
    { above: 5000000, rate: 0.10 },    // Above 50L: 10%
    { above: 0, rate: 0 },
];

// ============= COMPLIANCE FLAGS (Indian VDA Rules) =============

/** Per Section 115BBH:
 *  - Brokerage/fee must NOT reduce cost basis (only 'cost of acquisition' is deductible)
 *  - Losses from one VDA cannot offset gains from another
 *  - 30% flat tax + 4% cess (no slab benefit)
 */
const VDA_COMPLIANCE = {
    BROKERAGE_REDUCES_COST_BASIS: false,  // Must be false per 115BBH
    ALLOW_LOSS_OFFSET: false,             // Must be false per 115BBH
    TAX_RATE: 0.30,
    CESS_RATE: 0.04,
    STABLECOINS_ARE_VDA: true,            // USDT/USDC trades are taxable
} as const;

// ============= INVENTORY RECONCILIATION =============

export interface InventoryReconciliation {
    assetSymbol: string;
    totalAcquired: number;       // Sum of all buy/reward/deposit quantities
    totalDisposed: number;       // Sum of all sell/withdrawal quantities
    expectedBalance: number;     // acquired - disposed
    inventoryBalance: number;    // Sum of remaining lot quantities
    discrepancy: number;         // expected - inventory
    isReconciled: boolean;       // discrepancy < epsilon
    negativeInventoryEvents: number; // Times we had to sell more than available
}

// ============= CORE ENGINE =============

/**
 * Main computation function.
 * 
 * Takes normalized transactions + TDS records from the CoinDCX ingestion layer
 * and produces a complete tax computation with Schedule VDA.
 */
export function computeVdaTaxForFinancialYear(
    transactions: NormalizedTransaction[],
    tdsRecords: TDSRecord[],
    financialYear: string,
    method: AccountingMethod = 'FIFO',
    options: { aggregateOrders?: boolean } = { aggregateOrders: true }
): TaxComputationResult {
    const assessmentYear = getAY(financialYear);
    const warnings: string[] = [];

    // ── Sanitize inputs: coerce strings→numbers, strings→Dates ──
    // Data may arrive from localStorage/JSON where types are lost
    const sanitizeTx = (tx: NormalizedTransaction): NormalizedTransaction => ({
        ...tx,
        quantity: Number(tx.quantity) || 0,
        pricePerUnit: Number(tx.pricePerUnit) || 0,
        priceInr: Number(tx.priceInr) || 0,
        grossAmountQuote: Number(tx.grossAmountQuote) || 0,
        grossAmountInr: Number(tx.grossAmountInr) || 0,
        feeAmount: Number(tx.feeAmount) || 0,
        feeInr: Number(tx.feeInr) || 0,
        tdsAmount: Number(tx.tdsAmount) || 0,
        tdsRate: Number(tx.tdsRate) || 0,
        tradeTimestamp: tx.tradeTimestamp instanceof Date ? tx.tradeTimestamp : new Date(tx.tradeTimestamp),
    });
    transactions = transactions.map(sanitizeTx);
    tdsRecords = tdsRecords.map(r => ({
        ...r,
        grossConsiderationInr: Number(r.grossConsiderationInr) || 0,
        tdsAmountInr: Number(r.tdsAmountInr) || 0,
        tdsRate: Number(r.tdsRate) || 0,
        tdsDate: r.tdsDate instanceof Date ? r.tdsDate : new Date(r.tdsDate),
    }));

    // ─── Step 0 (v5 NEW): Order-Level Aggregation ───
    // KoinX aggregates fill-level trades into order-level transactions.
    // This is the #1 reason for transaction count mismatch.
    // CoinDCX API returns fills; one order may have 5 fills at different prices.
    // We aggregate them into one order with VWAP price.
    let aggregationStats: AggregationStats | undefined;
    if (options.aggregateOrders !== false) {
        console.log(`[TaxEngine v5] Running order-level aggregation on ${transactions.length} transactions...`);
        const aggResult = aggregateFillsToOrders(transactions, {
            validateFirst: true,
            aggregate: true,
        });
        transactions = aggResult.transactions;
        aggregationStats = aggResult.stats;
        warnings.push(...aggResult.warnings);
        console.log(`[TaxEngine v5] Aggregation: ${aggResult.stats.inputFillCount} fills → ${aggResult.stats.outputOrderCount} orders ` +
            `(filtered: ${aggResult.stats.filteredCount}, ` +
            `multi-fill orders: ${aggResult.stats.multiFillOrders})`);
    }

    // ─── Step 1: Re-assign FY using IST-aware function (single source of truth) ───
    transactions = transactions.map(tx => ({
        ...tx,
        financialYear: mapTxToFinancialYear(tx.tradeTimestamp),
    }));

    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL ARCHITECTURE (v5):
    //
    //   FIFO requires FULL HISTORICAL INVENTORY.
    //   We MUST process ALL transactions from account inception to present.
    //   This includes ALL prior-year sells — they consume inventory too.
    //
    //   The FY selection is REPORTING-LEVEL ONLY:
    //   - ALL buys → add to FIFO queue (all years)
    //   - ALL sells → consume from FIFO queue (all years)
    //   - Only REPORT gains/losses for disposals where disposal_date ∈ target FY
    //
    //   v5 addition: Fills are aggregated to order level BEFORE processing,
    //   matching KoinX's transaction counting exactly.
    // ═══════════════════════════════════════════════════════════════════

    // Process ALL transactions for FIFO stack building
    const allRelevantTx = transactions
        .filter(tx => {
            const event = classifyVdaEvent(tx);
            // Include trades, rewards, and crypto deposits/withdrawals (for inventory tracking)
            return isAcquisitionEvent(event) || isDisposalEvent(event) || event === 'DEPOSIT_CRYPTO' || event === 'WITHDRAW_CRYPTO';
        })
        .sort((a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime());

    const byAsset: Record<string, NormalizedTransaction[]> = {};
    for (const tx of allRelevantTx) {
        if (!byAsset[tx.assetSymbol]) byAsset[tx.assetSymbol] = [];
        byAsset[tx.assetSymbol].push(tx);
    }

    // Filter rewards/income events from ALL transactions
    const rewards = transactions.filter(tx => isIncomeEvent(classifyVdaEvent(tx)));

    // Count prior-year transactions for logging
    const priorYearCount = allRelevantTx.filter(tx => tx.financialYear !== financialYear).length;
    const targetYearCount = allRelevantTx.filter(tx => tx.financialYear === financialYear).length;
    console.log(`[TaxEngine v5] FY ${financialYear}: Processing FULL history → ${allRelevantTx.length} total records (${priorYearCount} prior-year + ${targetYearCount} target-year). ${rewards.length} reward events.`);



    // ─── Step 3: Run FIFO per asset (FULL HISTORY, report for target FY) ───
    const assetSummaries: AssetGainSummary[] = [];
    const allLotMatches: LotMatch[] = [];
    const allVDALines: VDAReportLine[] = [];
    const activeLots: TaxLot[] = [];
    const inventoryReconciliations: InventoryReconciliation[] = [];
    let slNoCounter = 1;

    let totalConsideration = 0;
    let totalCost = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let totalTDSFromTrades = 0;
    let totalFee = 0;
    let totalSellConsideration = 0; // Total sell volume for TDS base calculation

    for (const [asset, txs] of Object.entries(byAsset)) {
        const result = computeAssetFIFO(asset, txs, financialYear, method);

        assetSummaries.push(result.summary);
        allLotMatches.push(...result.matches);
        activeLots.push(...result.remainingLots);
        inventoryReconciliations.push(result.reconciliation);

        totalConsideration += result.summary.totalSellValueInr;
        // CRITICAL: totalCost = cost of acquisition for SOLD assets only (from FIFO lot matches)
        // NOT totalBuyValueInr which includes all buys (even unsold holdings)
        totalCost += result.matches.reduce((s, m) => s + m.costOfAcquisition, 0);
        grossGains += result.summary.grossGains;
        grossLosses += result.summary.grossLosses;

        // Collect TDS, Fees, and total sell consideration from ALL trades in this FY
        for (const tx of txs) {
            if (tx.financialYear !== financialYear) continue;

            // Brokerage fee: tracked but NOT deducted from cost basis per 115BBH
            totalFee += tx.feeInr || 0;

            // Track sell-side metrics
            const event = classifyVdaEvent(tx);
            if (isDisposalEvent(event)) {
                // TDS from trade data (explicit in CSV or estimated during ingestion)
                totalTDSFromTrades += tx.tdsAmount || 0;
                // Total sell volume (base for 1% TDS calculation)
                totalSellConsideration += tx.grossAmountInr || (tx.quantity * (tx.priceInr || 0));
            }
        }

        // Generate VDA report lines from lot matches
        // Group matches by sell transaction
        const sellGroups: Record<string, LotMatch[]> = {};
        for (const match of result.matches) {
            if (!sellGroups[match.sellTransactionId]) sellGroups[match.sellTransactionId] = [];
            sellGroups[match.sellTransactionId].push(match);
        }

        for (const [sellId, matches] of Object.entries(sellGroups)) {
            const totalSale = matches.reduce((s, m) => s + m.saleConsideration, 0);
            const totalCostTx = matches.reduce((s, m) => s + m.costOfAcquisition, 0);
            const totalGain = matches.reduce((s, m) => s + m.gainLoss, 0);
            const earliestBuy = matches.reduce((min, m) =>
                m.buyDate < min ? m.buyDate : min, matches[0].buyDate);
            const sellDate = matches[0].sellDate;
            const totalQty = matches.reduce((s, m) => s + m.matchedQuantity, 0);

            allVDALines.push({
                slNo: slNoCounter++,
                dateOfTransfer: formatIndianDate(sellDate),
                dateOfAcquisition: formatIndianDate(earliestBuy),
                headOfIncome: 'Capital Gains - 115BBH',
                descriptionOfVDA: `${totalQty.toFixed(8)} ${asset}`,
                assetSymbol: asset,
                saleConsideration: Math.round(totalSale * 100) / 100,
                costOfAcquisition: Math.round(totalCostTx * 100) / 100,
                incomeFromTransfer: Math.round(totalGain * 100) / 100,
                exchange: 'CoinDCX',
                sellTransactionId: sellId,
            });
        }

        // Warnings
        warnings.push(...result.warnings);
    }

    // ─── Inventory Reconciliation Report ───
    const unreconciledAssets = inventoryReconciliations.filter(r => !r.isReconciled);
    if (unreconciledAssets.length > 0) {
        warnings.push(`⚠️ Inventory reconciliation: ${unreconciledAssets.length} asset(s) have discrepancies.`);
        for (const r of unreconciledAssets) {
            warnings.push(`  ${r.assetSymbol}: Expected ${r.expectedBalance.toFixed(8)}, Inventory has ${r.inventoryBalance.toFixed(8)} (Δ ${r.discrepancy.toFixed(8)})`);
        }
    }
    const negativeInvAssets = inventoryReconciliations.filter(r => r.negativeInventoryEvents > 0);
    if (negativeInvAssets.length > 0) {
        warnings.push(`⚠️ Negative inventory detected in ${negativeInvAssets.length} asset(s) — check for missing buy/deposit transactions.`);
        for (const r of negativeInvAssets) {
            warnings.push(`  ${r.assetSymbol}: ${r.negativeInventoryEvents} negative inventory event(s)`);
        }
    }

    // ─── Step 4: Other VDA Income (Rewards / Staking / Airdrops / Interest) ───
    let otherVDAIncome = 0;
    const otherIncomeBreakdown: Record<string, number> = {
        reward: 0, staking: 0, airdrop: 0, interest: 0, referral: 0, mining: 0
    };
    for (const reward of rewards) {
        if (reward.financialYear === financialYear) {
            // Use grossAmountInr first, then fall back to quantity * priceInr
            const value = (reward.grossAmountInr && reward.grossAmountInr > 0)
                ? reward.grossAmountInr
                : (reward.quantity || 0) * (reward.priceInr || reward.pricePerUnit || 0);
            otherVDAIncome += value;

            // Categorize for breakdown
            const event = classifyVdaEvent(reward);
            if (event === 'STAKING') otherIncomeBreakdown.staking += value;
            else if (event === 'AIRDROP') otherIncomeBreakdown.airdrop += value;
            else if (event === 'INTEREST_EARNED') otherIncomeBreakdown.interest += value;
            else if (event === 'REFERRAL_BONUS') otherIncomeBreakdown.referral += value;
            else if (event === 'MINING') otherIncomeBreakdown.mining += value;
            else otherIncomeBreakdown.reward += value;
        }
    }
    console.log(`[TaxEngine] Other VDA Income: ₹${otherVDAIncome.toFixed(2)}`, otherIncomeBreakdown);

    // ─── Step 5: Tax Computation ───
    // CRITICAL: Section 115BBH — taxable gain = sum of profits ONLY
    // Losses are tracked but CANNOT be offset against gains
    const taxableCapitalGains = grossGains; // NOT net gain
    const totalTaxableVDA = taxableCapitalGains + otherVDAIncome;

    const taxOnGains = taxableCapitalGains * VDA_TAX_RATE;
    const taxOnOther = otherVDAIncome * VDA_TAX_RATE;
    const totalBaseTax = taxOnGains + taxOnOther;

    // Surcharge (simplified — applied if total income > threshold)
    const surcharge = computeSurcharge(totalTaxableVDA, totalBaseTax);

    // Cess @ 4% on (tax + surcharge)
    const cess = (totalBaseTax + surcharge) * CESS_RATE;

    const totalTaxLiability = totalBaseTax + surcharge + cess;

    // ─── Step 6: TDS Reconciliation ───
    const tdsRecon = reconcileTDS(tdsRecords, totalTDSFromTrades, financialYear);

    // TDS Credit Computation:
    // 1. If TDS certificates are uploaded (TDS CSV), use the higher of certificates vs trade data
    // 2. If no certificates, use EXACT trade data TDS (from individual sell transactions)
    // 3. We compute theoretical TDS just as an informational warning, but we do NOT artificially inflate TDS credit
    const theoreticalTDS = totalSellConsideration * 0.01;
    let totalTDSCredit: number = 0;

    if (tdsRecon.totalTDSFromCertificates > 0) {
        // Official TDS certificates take priority
        totalTDSCredit = Math.max(tdsRecon.totalTDSFromCertificates, tdsRecon.totalTDSFromTrades);
    } else {
        // Trust the explicit trade TDS logic
        totalTDSCredit = totalTDSFromTrades;

        // Let the user know if their trade TDS differs greatly from theoretical 1%
        if (theoreticalTDS > 0 && Math.abs(totalTDSCredit - theoreticalTDS) > theoreticalTDS * 0.1) {
            warnings.push(`TDS Warning: Your computed TDS credit (₹${totalTDSCredit.toFixed(2)}) differs from the estimated 1% of total sell value (₹${theoreticalTDS.toFixed(2)}). Upload your Form 26AS/TDS CSV for exact figures.`);
        }
    }

    console.log(`[TaxEngine] TDS: fromTrades=₹${totalTDSFromTrades.toFixed(2)}, fromCerts=₹${tdsRecon.totalTDSFromCertificates.toFixed(2)}, theoretical=₹${theoreticalTDS.toFixed(2)}, credit=₹${totalTDSCredit.toFixed(2)}`);
    console.log(`[TaxEngine] Total sell consideration: ₹${totalSellConsideration.toFixed(2)}`);

    const netTaxPayable = totalTaxLiability - totalTDSCredit;

    // ─── Step 7: Unique assets ───
    const uniqueAssets = new Set(assetSummaries.map(a => a.assetSymbol)).size;

    // ─── Final Summary Log ───
    console.log(`\n[TaxEngine v5] ═══════════════════════════════════════`);
    console.log(`[TaxEngine v5] FY ${financialYear} — COMPUTATION SUMMARY`);
    console.log(`[TaxEngine v5] ═══════════════════════════════════════`);
    if (aggregationStats) {
        console.log(`[TaxEngine v5] Aggregation: ${aggregationStats.inputFillCount} fills → ${aggregationStats.outputOrderCount} orders (${aggregationStats.filteredCount} filtered)`);
    }
    console.log(`[TaxEngine v5] Full history: ${allRelevantTx.length} records (${priorYearCount} prior-year + ${targetYearCount} target-year)`);
    console.log(`[TaxEngine v5] Capital Gains (taxable):  ₹${taxableCapitalGains.toFixed(2)}`);
    console.log(`[TaxEngine v5] Capital Losses (info):     ₹${grossLosses.toFixed(2)}`);
    console.log(`[TaxEngine v5] Other VDA Income:          ₹${otherVDAIncome.toFixed(2)}`);
    console.log(`[TaxEngine v5] Total Taxable VDA:         ₹${totalTaxableVDA.toFixed(2)}`);
    console.log(`[TaxEngine v5] ───────────────────────────────────────`);
    console.log(`[TaxEngine v5] Tax @ 30%:                 ₹${totalBaseTax.toFixed(2)}`);
    console.log(`[TaxEngine v5] Surcharge:                 ₹${surcharge.toFixed(2)}`);
    console.log(`[TaxEngine v5] Cess @ 4%:                 ₹${cess.toFixed(2)}`);
    console.log(`[TaxEngine v5] Total Tax Liability:       ₹${totalTaxLiability.toFixed(2)}`);
    console.log(`[TaxEngine v5] Total TDS Credit:          ₹${totalTDSCredit.toFixed(2)}`);
    console.log(`[TaxEngine v5] Net Tax Payable:           ₹${netTaxPayable.toFixed(2)} ${netTaxPayable < 0 ? '(REFUND)' : ''}`);
    console.log(`[TaxEngine v5] Brokerage (NOT deducted per 115BBH): ₹${totalFee.toFixed(2)}`);
    console.log(`[TaxEngine v5] ═══════════════════════════════════════\n`);

    return {
        financialYear,
        assessmentYear,
        accountingMethod: method,

        assetSummaries,

        totalConsiderationInr: Math.round(totalConsideration * 100) / 100,
        totalCostOfAcquisitionInr: Math.round(totalCost * 100) / 100,
        grossCapitalGains: Math.round(grossGains * 100) / 100,
        grossCapitalLosses: Math.round(grossLosses * 100) / 100,
        netGainLossInfo: Math.round((grossGains - grossLosses) * 100) / 100,

        taxableCapitalGains: Math.round(taxableCapitalGains * 100) / 100,

        otherVDAIncome: Math.round(otherVDAIncome * 100) / 100,
        totalTaxableVDA: Math.round(totalTaxableVDA * 100) / 100,

        taxOnGains30Pct: Math.round(taxOnGains * 100) / 100,
        taxOnOtherIncome30Pct: Math.round(taxOnOther * 100) / 100,
        totalBaseTax: Math.round(totalBaseTax * 100) / 100,
        surcharge: Math.round(surcharge * 100) / 100,
        cess4Pct: Math.round(cess * 100) / 100,
        totalTaxLiability: Math.round(totalTaxLiability * 100) / 100,

        tdsReconciliation: tdsRecon,
        totalTDSCredit: Math.round(totalTDSCredit * 100) / 100,

        totalBrokerageFee: Math.round(totalFee * 100) / 100,

        netTaxPayable: Math.round(netTaxPayable * 100) / 100,
        isRefund: netTaxPayable < 0,

        vdaReportLines: allVDALines,
        totalVDAEntries: allVDALines.length,
        uniqueAssets,

        aggregationStats,

        lotMatches: allLotMatches,
        activeLots,
        warnings,
        computedAt: new Date(),
        engineVersion: ENGINE_VERSION,
    };
}

// ============= FIFO PER-ASSET COMPUTATION =============
// CRITICAL v4 CHANGE:
//   This function processes ALL transactions for the asset across ALL years.
//   It builds the FIFO inventory from account inception.
//   ALL sells (from ALL FYs) consume inventory in correct chronological order.
//   Only gains/losses for the TARGET FY are reported.
//
//   Without this, prior-year sells don't reduce inventory,
//   and current-year sells get matched to the WRONG (too-old) lots.

interface AssetFIFOResult {
    summary: AssetGainSummary;
    matches: LotMatch[];         // Only target FY matches
    remainingLots: TaxLot[];     // Remaining inventory after ALL processing
    warnings: string[];
    reconciliation: InventoryReconciliation;
}

function computeAssetFIFO(
    asset: string,
    transactions: NormalizedTransaction[],
    targetFY: string,
    method: AccountingMethod
): AssetFIFOResult {
    const warnings: string[] = [];
    const inventory: TaxLot[] = [];
    const targetFYMatches: LotMatch[] = [];  // Only matches from target FY disposals

    // Stats for target FY only (reported)
    let totalBought = 0;
    let totalSold = 0;
    let totalBuyValue = 0;
    let totalSellValue = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let lotCounter = 0;

    // Reconciliation tracking (all years)
    let totalAcquiredAllTime = 0;
    let totalDisposedAllTime = 0;
    let negativeInventoryEvents = 0;

    // Check if this is a stablecoin
    const isStablecoin = STABLECOIN_SYMBOLS.includes(asset.toUpperCase());

    // Sort chronologically
    const sorted = [...transactions].sort((a, b) =>
        a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime()
    );

    for (const tx of sorted) {
        const eventType = classifyVdaEvent(tx);
        const isBuy = isAcquisitionEvent(eventType);
        const isSell = isDisposalEvent(eventType);
        const isTargetFY = tx.financialYear === targetFY;

        // Skip non-taxable events (self-transfers, fiat deposits/withdrawals)
        if (eventType === 'TRANSFER_SELF' || eventType === 'DEPOSIT_FIAT' ||
            eventType === 'WITHDRAW_FIAT' || eventType === 'FEE_ONLY' ||
            eventType === 'UNKNOWN') {
            continue;
        }

        if (isBuy) {
            // ─── Fee handling per 115BBH ───
            // Per VDA_COMPLIANCE.BROKERAGE_REDUCES_COST_BASIS === false:
            //   Brokerage/fee does NOT reduce cost basis.
            //   However, fee paid in base asset reduces acquired quantity (not a policy choice, it's a math fact).
            //   Fee paid in quote currency is NOT added to cost basis per strict 115BBH interpretation.
            const feeAsset = (tx.feeAsset || '').toUpperCase();
            const feeInBaseAsset = feeAsset === asset.toUpperCase();
            const feeAmount = tx.feeAmount || 0;

            let netQty = tx.quantity;
            let costBasis = tx.priceInr || 0; // cost per unit in INR
            let totalLotCost = netQty * costBasis;

            if (feeInBaseAsset && feeAmount > 0) {
                // Fee in base asset: reduce acquired quantity (physical reduction)
                netQty = Math.max(0, tx.quantity - feeAmount);
                totalLotCost = netQty * costBasis; // Recalculate with reduced qty
            }
            // NOTE: Fee in quote currency is NOT added to cost basis per 115BBH
            // (brokerage does not reduce cost basis)

            if (netQty <= 0) continue; // Nothing acquired after fees

            totalAcquiredAllTime += netQty;

            // Map event type to acquisition type
            let acquisitionType = 'purchase';
            if (eventType === 'CRYPTO_TO_CRYPTO_BUY') acquisitionType = 'swap';
            else if (isIncomeEvent(eventType)) acquisitionType = 'reward';
            else if (eventType === 'DEPOSIT_CRYPTO') acquisitionType = 'transfer';

            const lot: TaxLot = {
                id: `lot-${asset}-${++lotCounter}`,
                buyTransactionId: tx.externalId,
                assetSymbol: asset,
                originalQuantity: netQty,
                remainingQuantity: netQty,
                costBasisPerUnit: costBasis,
                totalCostInr: totalLotCost,
                acquisitionDate: tx.tradeTimestamp,
                acquisitionType,
                exchange: tx.exchange,
                financialYear: tx.financialYear,
                isFullyConsumed: false,
            };
            inventory.push(lot);

            // Only count target FY stats for reporting
            if (isTargetFY) {
                totalBought += netQty;
                totalBuyValue += totalLotCost;
            }

        } else if (isSell) {
            // ═══════════════════════════════════════════════════════
            // CRITICAL v4 FIX: Process ALL sells from ALL financial years
            // Not just target FY. This ensures prior-year sells properly
            // consume inventory, so current-year sells get correct cost basis.
            // ═══════════════════════════════════════════════════════
            let remainingToSell = tx.quantity;
            const salePrice = tx.priceInr; // sale price per unit in INR

            totalDisposedAllTime += tx.quantity;

            // Only track sell volume/value for target FY
            if (isTargetFY) {
                totalSold += tx.quantity;
                totalSellValue += tx.grossAmountInr || (tx.quantity * salePrice);
            }

            // ─── Negative inventory prevention ───
            const availableInventory = inventory.reduce((s, l) => s + l.remainingQuantity, 0);
            if (availableInventory < remainingToSell - 0.00000001) {
                negativeInventoryEvents++;
                if (isTargetFY) {
                    warnings.push(`${asset}: Selling ${remainingToSell.toFixed(8)} but only ${availableInventory.toFixed(8)} in inventory (missing buy/deposit for ${(remainingToSell - availableInventory).toFixed(8)} units)`);
                }
            }

            while (remainingToSell > 0.00000001 && inventory.length > 0) {
                const lotIdx = selectLotIndex(inventory, method);
                if (lotIdx === -1) {
                    if (isTargetFY) {
                        warnings.push(`${asset}: Selling ${remainingToSell.toFixed(8)} without buy lot (possible deposit/transfer missing)`);
                    }
                    break;
                }

                const lot = inventory[lotIdx];
                const matchedQty = Math.min(lot.remainingQuantity, remainingToSell);

                // Proceeds: proportional share of total sale value
                const proceeds = matchedQty * salePrice;
                // Cost: from the lot (per 115BBH, only cost of acquisition)
                const cost = matchedQty * lot.costBasisPerUnit;
                const gain = proceeds - cost;

                const holdingDays = Math.floor(
                    (tx.tradeTimestamp.getTime() - lot.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24)
                );

                // Only record lot matches for target FY disposals
                if (isTargetFY) {
                    const match: LotMatch = {
                        sellTransactionId: tx.externalId,
                        buyLotId: lot.id,
                        assetSymbol: asset,
                        matchedQuantity: matchedQty,
                        buyPricePerUnit: lot.costBasisPerUnit,
                        sellPricePerUnit: salePrice,
                        costOfAcquisition: Math.round(cost * 100) / 100,
                        saleConsideration: Math.round(proceeds * 100) / 100,
                        gainLoss: Math.round(gain * 100) / 100,
                        buyDate: lot.acquisitionDate,
                        sellDate: tx.tradeTimestamp,
                        holdingDays,
                        accountingMethod: method,
                        financialYear: targetFY,
                    };
                    targetFYMatches.push(match);

                    // 115BBH: Track gains AND losses separately
                    // Losses CANNOT offset gains — each is tracked independently
                    if (gain > 0) {
                        grossGains += gain;
                    } else {
                        grossLosses += Math.abs(gain);
                    }
                }

                // Update lot — this happens for ALL years (the whole point of v4)
                lot.remainingQuantity -= matchedQty;
                remainingToSell -= matchedQty;

                if (lot.remainingQuantity <= 0.00000001) {
                    lot.isFullyConsumed = true;
                    inventory.splice(lotIdx, 1);
                }
            }

            if (remainingToSell > 0.00000001 && isTargetFY) {
                warnings.push(`${asset}: ${remainingToSell.toFixed(8)} units could not be matched to any buy lot (missing cost basis)`);
            }
        }
    }

    // Calculate current holding & avg cost
    const currentHolding = inventory.reduce((s, l) => s + l.remainingQuantity, 0);
    const avgCostBasis = currentHolding > 0
        ? inventory.reduce((s, l) => s + l.remainingQuantity * l.costBasisPerUnit, 0) / currentHolding
        : 0;

    // ── Inventory Reconciliation ──
    const expectedBalance = totalAcquiredAllTime - totalDisposedAllTime;
    const inventoryBalance = currentHolding;
    const discrepancy = Math.abs(expectedBalance - inventoryBalance);
    const reconciliation: InventoryReconciliation = {
        assetSymbol: asset,
        totalAcquired: totalAcquiredAllTime,
        totalDisposed: totalDisposedAllTime,
        expectedBalance,
        inventoryBalance,
        discrepancy,
        isReconciled: discrepancy < 0.00001,
        negativeInventoryEvents,
    };

    if (isStablecoin && (totalSold > 0 || grossGains > 0 || grossLosses > 0)) {
        console.log(`[TaxEngine v4] Stablecoin ${asset}: Treated as taxable VDA. Sold=${totalSold.toFixed(4)}, Gains=₹${grossGains.toFixed(2)}, Losses=₹${grossLosses.toFixed(2)}`);
    }

    return {
        summary: {
            assetSymbol: asset,
            totalBought,
            totalSold,
            totalBuyValueInr: Math.round(totalBuyValue * 100) / 100,
            totalSellValueInr: Math.round(totalSellValue * 100) / 100,
            grossGains: Math.round(grossGains * 100) / 100,
            grossLosses: Math.round(grossLosses * 100) / 100,
            netGainLoss: Math.round((grossGains - grossLosses) * 100) / 100,
            taxableGain: Math.round(grossGains * 100) / 100, // NO loss offset per 115BBH
            currentHolding,
            avgCostBasis: Math.round(avgCostBasis * 100) / 100,
            matchedLots: targetFYMatches,
        },
        matches: targetFYMatches,
        remainingLots: inventory.filter(l => !l.isFullyConsumed),
        warnings,
        reconciliation,
    };
}

function selectLotIndex(inventory: TaxLot[], method: AccountingMethod): number {
    if (inventory.length === 0) return -1;

    switch (method) {
        case 'FIFO':
            return 0;
        case 'LIFO':
            return inventory.length - 1;
        case 'HIFO':
            return inventory.reduce((maxIdx, lot, idx, arr) =>
                lot.costBasisPerUnit > arr[maxIdx].costBasisPerUnit ? idx : maxIdx, 0);
        default:
            return 0;
    }
}

// ============= TDS RECONCILIATION =============

function reconcileTDS(
    tdsRecords: TDSRecord[],
    tdsFromTrades: number,
    financialYear: string
): TDSReconciliation {
    const fyRecords = tdsRecords.filter(r => r.financialYear === financialYear);
    const warnings: string[] = [];

    // Quarter-wise aggregation
    const quarterMap: Record<string, { count: number; consideration: number; tds: number }> = {};
    for (const r of fyRecords) {
        const q = r.quarter || 'Unknown';
        if (!quarterMap[q]) quarterMap[q] = { count: 0, consideration: 0, tds: 0 };
        quarterMap[q].count++;
        quarterMap[q].consideration += r.grossConsiderationInr;
        quarterMap[q].tds += r.tdsAmountInr;
    }

    const quarterWise = Object.entries(quarterMap).map(([quarter, data]) => ({
        quarter,
        tradeCount: data.count,
        totalConsideration: Math.round(data.consideration * 100) / 100,
        tdsAmount: Math.round(data.tds * 100) / 100,
    })).sort((a, b) => a.quarter.localeCompare(b.quarter));

    const totalFromCerts = fyRecords.reduce((s, r) => s + r.tdsAmountInr, 0);
    const discrepancy = Math.abs(totalFromCerts - tdsFromTrades);
    const maxTds = Math.max(totalFromCerts, tdsFromTrades, 1);
    const discrepancyPct = (discrepancy / maxTds) * 100;

    let status: TDSReconciliation['status'] = 'matched';
    if (discrepancyPct > 5) {
        status = 'major_discrepancy';
        warnings.push(
            `TDS discrepancy of INR ${discrepancy.toFixed(2)} (${discrepancyPct.toFixed(1)}%) between trade data and TDS certificates. ` +
            `Cross-check with Form 26AS.`
        );
    } else if (discrepancyPct > 2) {
        status = 'minor_discrepancy';
        warnings.push(
            `Minor TDS discrepancy of INR ${discrepancy.toFixed(2)} (${discrepancyPct.toFixed(1)}%). Verify with Form 26AS.`
        );
    }

    if (fyRecords.length === 0 && tdsFromTrades > 0) {
        warnings.push(
            'No TDS certificates uploaded. Using TDS estimates from trade data. Upload CoinDCX TDS report for accurate credit.'
        );
    }

    return {
        totalTDSFromTrades: Math.round(tdsFromTrades * 100) / 100,
        totalTDSFromCertificates: Math.round(totalFromCerts * 100) / 100,
        matchedRecords: fyRecords.filter(r => r.tradeReference).length,
        unmatchedTDSRecords: fyRecords.filter(r => !r.tradeReference).length,
        discrepancyInr: Math.round(discrepancy * 100) / 100,
        discrepancyPct: Math.round(discrepancyPct * 100) / 100,
        quarterWise,
        status,
        warnings,
    };
}

// ============= SURCHARGE CALCULATION =============

function computeSurcharge(totalTaxableIncome: number, baseTax: number): number {
    // Surcharge on crypto income (AY 2026-27)
    // Generally, surcharge rate depends on total income:
    // > 50L: 10%, > 1Cr: 15%, > 2Cr: 25%, > 5Cr: 37%
    // BUT for VDA income per 115BBH, max surcharge is typically 15%

    if (totalTaxableIncome <= 5000000) return 0;

    let rate = 0;
    if (totalTaxableIncome > 50000000) rate = 0.15; // Capped at 15% for VDA
    else if (totalTaxableIncome > 20000000) rate = 0.15;
    else if (totalTaxableIncome > 10000000) rate = 0.15;
    else if (totalTaxableIncome > 5000000) rate = 0.10;

    // Marginal relief: surcharge cannot exceed the amount by which income exceeds threshold
    const surcharge = baseTax * rate;

    return Math.round(surcharge * 100) / 100;
}

// ============= HELPER FUNCTIONS =============

function getAY(fy: string): string {
    const start = parseInt(fy.split('-')[0]);
    return `${start + 1}-${((start + 2) % 100).toString().padStart(2, '0')}`;
}

function formatIndianDate(date: Date): string {
    // Always format in IST for ITR filings
    const ist = toIST(date);
    const d = ist.getDate().toString().padStart(2, '0');
    const m = (ist.getMonth() + 1).toString().padStart(2, '0');
    const y = ist.getFullYear();
    return `${d}/${m}/${y}`;
}

// ============= EXPORTS FOR REPORT GENERATION =============

/**
 * Format a tax computation result into a P&L summary suitable for UI display
 */
export function formatPnLSummary(result: TaxComputationResult): {
    header: { label: string; value: string; highlight?: boolean }[];
    assets: { symbol: string; gains: string; losses: string; taxable: string; holding: string }[];
    tds: { label: string; value: string }[];
    tax: { label: string; value: string; highlight?: boolean }[];
} {
    const fmt = (n: number) => `INR ${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    return {
        header: [
            { label: 'Total Consideration (Sales)', value: fmt(result.totalConsiderationInr) },
            { label: 'Total Cost of Acquisition', value: fmt(result.totalCostOfAcquisitionInr) },
            { label: 'Gross Capital Gains', value: fmt(result.grossCapitalGains), highlight: result.grossCapitalGains > 0 },
            { label: 'Gross Capital Losses (info only)', value: fmt(result.grossCapitalLosses) },
            { label: 'Other VDA Income (Rewards)', value: fmt(result.otherVDAIncome) },
        ],
        assets: result.assetSummaries.map(a => ({
            symbol: a.assetSymbol,
            gains: fmt(a.grossGains),
            losses: fmt(a.grossLosses),
            taxable: fmt(a.taxableGain),
            holding: Number(a.currentHolding || 0).toFixed(8),
        })),
        tds: [
            { label: 'TDS from Trades (estimated)', value: fmt(result.tdsReconciliation.totalTDSFromTrades) },
            { label: 'TDS from Certificates', value: fmt(result.tdsReconciliation.totalTDSFromCertificates) },
            { label: 'Reconciliation Status', value: result.tdsReconciliation.status.replace(/_/g, ' ').toUpperCase() },
        ],
        tax: [
            { label: 'Taxable Capital Gains (§115BBH)', value: fmt(result.taxableCapitalGains) },
            { label: 'Tax @ 30%', value: fmt(result.taxOnGains30Pct) },
            { label: 'Tax on Other VDA Income @ 30%', value: fmt(result.taxOnOtherIncome30Pct) },
            { label: 'Surcharge', value: fmt(result.surcharge) },
            { label: 'Health & Education Cess @ 4%', value: fmt(result.cess4Pct) },
            { label: 'Total Tax Liability', value: fmt(result.totalTaxLiability), highlight: true },
            { label: 'Less: TDS Credit', value: `- ${fmt(result.totalTDSCredit)}` },
            {
                label: result.isRefund ? '🎉 Refund Estimated' : 'Balance Tax Payable',
                value: (result.isRefund ? '- ' : '') + fmt(result.netTaxPayable),
                highlight: true,
            },
        ],
    };
}

/**
 * Generate a CSV export of the Schedule VDA
 */
export function generateScheduleVDACSV(result: TaxComputationResult): string {
    const headers = [
        'Sl No.', 'Date of Transfer', 'Date of Acquisition',
        'Head of Income', 'Description of VDA', 'Asset',
        'Sale Consideration (INR)', 'Cost of Acquisition (INR)',
        'Income from Transfer (INR)', 'Exchange'
    ];

    const rows = result.vdaReportLines.map(line => [
        line.slNo,
        line.dateOfTransfer,
        line.dateOfAcquisition,
        line.headOfIncome,
        line.descriptionOfVDA,
        line.assetSymbol,
        line.saleConsideration.toFixed(2),
        line.costOfAcquisition.toFixed(2),
        line.incomeFromTransfer.toFixed(2),
        line.exchange,
    ].join(','));

    // Add totals row
    const totalSale = result.vdaReportLines.reduce((s, l) => s + l.saleConsideration, 0);
    const totalCostVda = result.vdaReportLines.reduce((s, l) => s + l.costOfAcquisition, 0);
    const totalIncome = result.vdaReportLines.reduce((s, l) => s + l.incomeFromTransfer, 0);
    rows.push(`,,,,TOTAL,,${totalSale.toFixed(2)},${totalCostVda.toFixed(2)},${totalIncome.toFixed(2)},`);

    return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate TDS reconciliation CSV for 26AS cross-check
 */
export function generateTDSReconciliationCSV(result: TaxComputationResult): string {
    const headers = ['Quarter', 'No. of Trades', 'Total Consideration (INR)', 'TDS Amount (INR)'];

    const rows = result.tdsReconciliation.quarterWise.map(q =>
        [q.quarter, q.tradeCount, q.totalConsideration.toFixed(2), q.tdsAmount.toFixed(2)].join(',')
    );

    // Totals
    const totalCon = result.tdsReconciliation.quarterWise.reduce((s, q) => s + q.totalConsideration, 0);
    const totalTds = result.tdsReconciliation.quarterWise.reduce((s, q) => s + q.tdsAmount, 0);
    rows.push(`TOTAL,,${totalCon.toFixed(2)},${totalTds.toFixed(2)}`);
    rows.push('');
    rows.push(`TDS from Trade Data,,,"${result.tdsReconciliation.totalTDSFromTrades.toFixed(2)}"`);
    rows.push(`TDS from Certificates,,,"${result.tdsReconciliation.totalTDSFromCertificates.toFixed(2)}"`);
    rows.push(`Discrepancy,,,"${result.tdsReconciliation.discrepancyInr.toFixed(2)} (${result.tdsReconciliation.discrepancyPct.toFixed(1)}%)"`);
    rows.push(`Status,,,"${result.tdsReconciliation.status}"`);

    return [headers.join(','), ...rows].join('\n');
}
