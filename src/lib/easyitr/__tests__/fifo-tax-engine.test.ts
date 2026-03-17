/**
 * EasyITR — FIFO Tax Engine Unit Tests (v6)
 * ============================================
 * Tests the core computeAssetFIFO logic directly via the public
 * computeVdaTaxForFinancialYear function.
 *
 * NOTE: The existing tax-computation-engine.test.ts cannot run due to 
 * a canvas module version mismatch (pre-existing env issue).
 * These tests validate the v6 FIFO logic changes in isolation.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';

// We test the core FIFO logic by directly importing the function
import {
    computeVdaTaxForFinancialYear,
    classifyVdaEvent,
} from '../tax-computation-engine';

import type { NormalizedTransaction } from '../coindcx-ingestion';


// ─── Helper ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<NormalizedTransaction> & { assetSymbol: string }): NormalizedTransaction {
    return {
        externalId: `tx-${Math.random().toString(36).slice(2, 8)}`,
        exchange: 'CoinDCX',
        transactionType: 'buy',
        isTaxableEvent: false,
        assetSymbol: overrides.assetSymbol,
        quoteAsset: 'INR',
        pair: `${overrides.assetSymbol}/INR`,
        quantity: 1,
        pricePerUnit: 1000,
        priceInr: 1000,
        grossAmountQuote: 1000,
        grossAmountInr: 1000,
        feeAmount: 0,
        feeAsset: 'INR',
        feeInr: 0,
        tdsAmount: 0,
        tdsRate: 0,
        tradeTimestamp: new Date('2024-06-15T10:00:00Z'),
        financialYear: '2024-25',
        assessmentYear: '2025-26',
        description: 'test',
        rawData: {},
        contentHash: 'test-hash',
        ...overrides,
    };
}


// ─── Test 1: Buy fee included in cost of acquisition ─────────────────

describe('FIFO v6 — Buy Fee in Cost of Acquisition', () => {
    it('should add INR fee to cost of acquisition', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 3000000,
                grossAmountInr: 30000,
                feeAmount: 50,
                feeAsset: 'INR',
                feeInr: 50,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000,
                grossAmountInr: 40000,
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // Cost basis = 30000 + 50 fee = 30050
        // Gain = 40000 - 30050 = 9950
        expect(result.totalCostOfAcquisitionInr).toBe(30050);
        expect(result.grossCapitalGains).toBe(9950);
    });
});


// ─── Test 2: Sell fee subtracted from proceeds ───────────────────────

describe('FIFO v6 — Sell Fee Reduces Proceeds', () => {
    it('should subtract sell fee from sale consideration', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 3000000,
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000,
                grossAmountInr: 40000,
                feeAmount: 100,
                feeAsset: 'INR',
                feeInr: 100,
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // Proceeds = 40000 - 100 fee = 39900
        // Cost = 30000
        // Gain = 39900 - 30000 = 9900
        expect(result.grossCapitalGains).toBe(9900);
    });
});


// ─── Test 3: 115BBH Loss Rule — per-lot level ───────────────────────

describe('FIFO v6 — 115BBH Per-Lot Loss Rule', () => {
    it('should not offset gain on BTC with loss on ETH', () => {
        const txs: NormalizedTransaction[] = [
            // BTC: buy 30K, sell 40K → 10K profit
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 3000000,
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000,
                grossAmountInr: 40000,
                tradeTimestamp: new Date('2024-06-01T10:00:00Z'),
            }),
            // ETH: buy 50K, sell 30K → 20K loss
            makeTx({
                assetSymbol: 'ETH',
                transactionType: 'buy',
                quantity: 0.1,
                priceInr: 500000,
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
            }),
            makeTx({
                assetSymbol: 'ETH',
                transactionType: 'sell',
                quantity: 0.1,
                priceInr: 300000,
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-06-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // 115BBH: Loss on ETH CANNOT offset gain on BTC
        expect(result.grossCapitalGains).toBe(10000);  // BTC gain only
        expect(result.grossCapitalLosses).toBe(20000); // ETH loss (display only)
        expect(result.taxableCapitalGains).toBe(10000); // Only profit is taxed

        // Tax = 10000 × 30% = 3000 + 4% cess = 3120
        expect(result.taxOnGains30Pct).toBe(3000);
    });
});


// ─── Test 4: FIFO order — oldest lot consumed first ──────────────────

describe('FIFO v6 — Lot Order', () => {
    it('should consume oldest buy lot first', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 2000000,      // Cheap (oldest)
                grossAmountInr: 20000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 5000000,      // Expensive (newer)
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-07-01T10:00:00Z'),
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,         // Sell 1 lot
                priceInr: 4000000,
                grossAmountInr: 40000,
                tradeTimestamp: new Date('2024-09-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // FIFO: Sells the ₹20K lot first → gain = 40K - 20K = 20K
        expect(result.grossCapitalGains).toBe(20000);

        // Remaining: 0.01 BTC @ ₹50L cost basis
        expect(result.activeLots.length).toBe(1);
        expect(result.activeLots[0].costBasisPerUnit).toBe(5000000);
    });
});


// ─── Test 5: Prior-FY cost basis works ───────────────────────────────

describe('FIFO v6 — Prior FY Cost Basis', () => {
    it('should use cost basis from earlier FY buy', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 2000000,
                grossAmountInr: 20000,
                tradeTimestamp: new Date('2023-10-15T10:00:00Z'),
                financialYear: '2023-24',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000,
                grossAmountInr: 40000,
                tradeTimestamp: new Date('2024-08-15T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        expect(result.grossCapitalGains).toBe(20000);
        expect(result.totalCostOfAcquisitionInr).toBe(20000);
    });
});


// ─── Test 6: Partial lot consumption ─────────────────────────────────

describe('FIFO v6 — Partial Lot Consumption', () => {
    it('should correctly split a lot across multiple sells', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'ADA',
                transactionType: 'buy',
                quantity: 1000,
                priceInr: 50,           // ₹50 per ADA
                grossAmountInr: 50000,  // Total: ₹50K
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
            }),
            // Sell 400 ADA
            makeTx({
                assetSymbol: 'ADA',
                transactionType: 'sell',
                quantity: 400,
                priceInr: 80,           // ₹80 per ADA
                grossAmountInr: 32000,
                tradeTimestamp: new Date('2024-07-01T10:00:00Z'),
            }),
            // Sell 300 ADA at a loss
            makeTx({
                assetSymbol: 'ADA',
                transactionType: 'sell',
                quantity: 300,
                priceInr: 40,           // ₹40 per ADA (loss)
                grossAmountInr: 12000,
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // Sell 1: cost = 400 × 50 = 20000, proceeds = 32000, gain = 12000
        // Sell 2: cost = 300 × 50 = 15000, proceeds = 12000, loss = -3000
        expect(result.grossCapitalGains).toBe(12000);  // Only Sell 1 gain
        expect(result.grossCapitalLosses).toBe(3000);   // Sell 2 loss
        expect(result.taxableCapitalGains).toBe(12000); // Losses not deducted

        // Remaining: 300 ADA @ ₹50
        expect(result.activeLots.length).toBe(1);
        expect(result.activeLots[0].remainingQuantity).toBe(300);
    });
});


// ─── Test 7: Combined buy fee + sell fee ─────────────────────────────

describe('FIFO v6 — Combined Fee Handling', () => {
    it('should include buy fee in cost and subtract sell fee from proceeds', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'XRP',
                transactionType: 'buy',
                quantity: 1000,
                priceInr: 50,
                grossAmountInr: 50000,
                feeAmount: 250,           // ₹250 buy fee
                feeAsset: 'INR',
                feeInr: 250,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
            }),
            makeTx({
                assetSymbol: 'XRP',
                transactionType: 'sell',
                quantity: 1000,
                priceInr: 80,
                grossAmountInr: 80000,
                feeAmount: 400,           // ₹400 sell fee
                feeAsset: 'INR',
                feeInr: 400,
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // Cost = 50000 + 250 fee = 50250
        // Proceeds = 80000 - 400 fee = 79600
        // Gain = 79600 - 50250 = 29350
        expect(result.totalCostOfAcquisitionInr).toBe(50250);
        expect(result.grossCapitalGains).toBe(29350);
    });
});


// ─── Test 8: Unmatched lots (sell without buy) ───────────────────────

describe('FIFO v6 — Unmatched Lots', () => {
    it('should treat unmatched sell as 100% taxable gain', () => {
        const txs: NormalizedTransaction[] = [
            // No buy — only a sell
            makeTx({
                assetSymbol: 'DOGE',
                transactionType: 'sell',
                quantity: 10000,
                priceInr: 5,
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        // No cost basis → full proceeds taxable
        expect(result.grossCapitalGains).toBe(50000);
        expect(result.totalCostOfAcquisitionInr).toBe(0);
        expect(result.totalConsiderationInr).toBe(50000);
    });
});


// ─── Test 9: Reward → Other Income ───────────────────────────────────

describe('FIFO v6 — Reward Income', () => {
    it('should track reward as other VDA income', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'SHIB',
                transactionType: 'reward_staking',
                quantity: 100000,
                priceInr: 0.001,
                grossAmountInr: 100,
                tradeTimestamp: new Date('2024-07-01T10:00:00Z'),
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO', { aggregateOrders: false });

        expect(result.otherVDAIncome).toBe(100);
        // Total taxable = 0 cap gains + 100 other income = 100
        expect(result.totalTaxableVDA).toBe(100);
    });
});

