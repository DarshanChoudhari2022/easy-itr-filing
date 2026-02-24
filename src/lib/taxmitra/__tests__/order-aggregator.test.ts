/**
 * @vitest-environment node
 */

/**
 * Tests for Order Aggregation Engine
 * ===================================
 * Verifies that fill-level transactions are correctly aggregated
 * into order-level transactions (matching KoinX behavior).
 */

import { describe, it, expect } from 'vitest';
import {
    aggregateFillsToOrders,
    isValidTrade,
    deduplicateTransactions,
} from '../order-aggregator';
import type { NormalizedTransaction } from '../coindcx-ingestion';

// Helper to create a mock NormalizedTransaction
function makeTx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
    return {
        externalId: `fill-${Math.random().toString(36).substring(2, 8)}`,
        exchange: 'CoinDCX',
        transactionType: 'buy',
        isTaxableEvent: false,
        assetSymbol: 'BTC',
        quoteAsset: 'INR',
        pair: 'BTC/INR',
        quantity: 0.1,
        pricePerUnit: 5000000,
        priceInr: 5000000,
        grossAmountQuote: 500000,
        grossAmountInr: 500000,
        feeAmount: 250,
        feeAsset: 'INR',
        feeInr: 250,
        tdsAmount: 0,
        tdsRate: 0.01,
        tradeTimestamp: new Date('2024-06-15T10:30:00Z'),
        financialYear: '2024-25',
        assessmentYear: '2025-26',
        description: 'BUY 0.1 BTC @ ₹5000000 on CoinDCX',
        orderId: 'order-ABC',
        rawData: {},
        contentHash: `hash-${Math.random().toString(36).substring(2, 8)}`,
        ...overrides,
    };
}

// ============= VALIDATION TESTS =============

describe('isValidTrade', () => {
    it('should accept valid buy trade', () => {
        const tx = makeTx();
        expect(isValidTrade(tx).valid).toBe(true);
    });

    it('should reject UNKNOWN asset', () => {
        const tx = makeTx({ assetSymbol: 'UNKNOWN' });
        const result = isValidTrade(tx);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('UNKNOWN_ASSET');
    });

    it('should reject empty asset symbol', () => {
        const tx = makeTx({ assetSymbol: '' });
        expect(isValidTrade(tx).valid).toBe(false);
    });

    it('should reject zero quantity', () => {
        const tx = makeTx({ quantity: 0 });
        const result = isValidTrade(tx);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('ZERO_QUANTITY');
    });

    it('should reject zero-value trade with no gross amount', () => {
        const tx = makeTx({ priceInr: 0, pricePerUnit: 0, grossAmountInr: 0 });
        const result = isValidTrade(tx);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('ZERO_VALUE');
    });

    it('should accept deposit with zero price (not a trade)', () => {
        const tx = makeTx({
            transactionType: 'deposit',
            priceInr: 0,
            pricePerUnit: 0,
            grossAmountInr: 0,
        });
        expect(isValidTrade(tx).valid).toBe(true);
    });

    it('should reject INR as base asset (fiat)', () => {
        const tx = makeTx({ assetSymbol: 'INR' });
        const result = isValidTrade(tx);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('FIAT_ASSET');
    });

    it('should reject test data', () => {
        const tx = makeTx({ externalId: 'trial-12345' });
        const result = isValidTrade(tx);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('TEST_DATA');
    });
});

// ============= ORDER AGGREGATION TESTS =============

describe('aggregateFillsToOrders', () => {
    it('should aggregate multiple fills of the same order', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-1', quantity: 0.1, pricePerUnit: 50000, priceInr: 50000, grossAmountInr: 5000, feeAmount: 25, feeInr: 25, tdsAmount: 0 }),
            makeTx({ orderId: 'order-1', quantity: 0.2, pricePerUnit: 50100, priceInr: 50100, grossAmountInr: 10020, feeAmount: 50, feeInr: 50, tdsAmount: 0 }),
            makeTx({ orderId: 'order-1', quantity: 0.2, pricePerUnit: 50200, priceInr: 50200, grossAmountInr: 10040, feeAmount: 50, feeInr: 50, tdsAmount: 0 }),
        ];

        const result = aggregateFillsToOrders(fills);

        // Should produce 1 order-level transaction
        expect(result.transactions.length).toBe(1);
        expect(result.stats.multiFillOrders).toBe(1);
        expect(result.stats.fillsAggregated).toBe(3);

        const order = result.transactions[0];
        expect(order.quantity).toBeCloseTo(0.5, 8);  // 0.1 + 0.2 + 0.2 = 0.5

        // VWAP = (0.1×50000 + 0.2×50100 + 0.2×50200) / 0.5 = 50120
        expect(order.pricePerUnit).toBeCloseTo(50120, 0);

        // Total gross = 5000 + 10020 + 10040 = 25060
        expect(order.grossAmountInr).toBeCloseTo(25060, 2);

        // Total fee = 25 + 50 + 50 = 125
        expect(order.feeAmount).toBeCloseTo(125, 2);
    });

    it('should keep single-fill orders unchanged', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-A', quantity: 1.0 }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.transactions.length).toBe(1);
        expect(result.stats.singleFillOrders).toBe(1);
        expect(result.stats.multiFillOrders).toBe(0);
    });

    it('should keep transactions without orderId as-is', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: '', quantity: 0.5 }),
            makeTx({ orderId: undefined as any, quantity: 0.3 }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.transactions.length).toBe(2);
        expect(result.stats.noOrderIdCount).toBe(2);
    });

    it('should not aggregate fills from different orders', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-A', quantity: 0.1, transactionType: 'buy' }),
            makeTx({ orderId: 'order-B', quantity: 0.2, transactionType: 'sell' }),
            makeTx({ orderId: 'order-C', quantity: 0.3, transactionType: 'buy' }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.transactions.length).toBe(3);
        expect(result.stats.singleFillOrders).toBe(3);
    });

    it('should filter invalid transactions before aggregating', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-1', quantity: 0.1 }),
            makeTx({ orderId: 'order-1', quantity: 0.2 }),
            makeTx({ assetSymbol: 'UNKNOWN', orderId: 'order-NOISE' }),
            makeTx({ quantity: 0, orderId: 'order-ZERO' }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.stats.filteredCount).toBe(2);
        expect(result.transactions.length).toBe(1); // Only the aggregated order
    });

    it('should use earliest timestamp from fills as order timestamp', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-1', tradeTimestamp: new Date('2024-07-15T12:00:00Z') }),
            makeTx({ orderId: 'order-1', tradeTimestamp: new Date('2024-07-15T10:00:00Z') }),
            makeTx({ orderId: 'order-1', tradeTimestamp: new Date('2024-07-15T11:00:00Z') }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.transactions[0].tradeTimestamp.toISOString()).toBe('2024-07-15T10:00:00.000Z');
    });

    it('should sum TDS across fills', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-1', transactionType: 'sell', tdsAmount: 10 }),
            makeTx({ orderId: 'order-1', transactionType: 'sell', tdsAmount: 20 }),
            makeTx({ orderId: 'order-1', transactionType: 'sell', tdsAmount: 15 }),
        ];

        const result = aggregateFillsToOrders(fills);
        expect(result.transactions[0].tdsAmount).toBeCloseTo(45, 2);
    });

    it('should handle mixed buy and sell orders for same asset', () => {
        const fills: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-BUY', transactionType: 'buy', quantity: 1.0 }),
            makeTx({ orderId: 'order-BUY', transactionType: 'buy', quantity: 0.5 }),
            makeTx({ orderId: 'order-SELL', transactionType: 'sell', quantity: 0.3 }),
            makeTx({ orderId: 'order-SELL', transactionType: 'sell', quantity: 0.7 }),
        ];

        const result = aggregateFillsToOrders(fills);
        // 2 orders: 1 buy (2 fills), 1 sell (2 fills)
        expect(result.transactions.length).toBe(2);
        expect(result.stats.multiFillOrders).toBe(2);

        const buyOrder = result.transactions.find(t => t.transactionType === 'buy');
        const sellOrder = result.transactions.find(t => t.transactionType === 'sell');
        expect(buyOrder?.quantity).toBeCloseTo(1.5, 8);
        expect(sellOrder?.quantity).toBeCloseTo(1.0, 8);
    });

    it('should handle real-world scenario: 210 fills → ~71 orders', () => {
        // Simulate the actual discrepancy scenario
        const fills: NormalizedTransaction[] = [];
        const orderCount = 71;
        let fillCount = 0;

        for (let i = 0; i < orderCount; i++) {
            // Each order has 1-5 fills
            const fillsPerOrder = 1 + Math.floor(Math.random() * 5);
            for (let j = 0; j < fillsPerOrder; j++) {
                fills.push(makeTx({
                    orderId: `order-${i}`,
                    quantity: 0.001 + Math.random() * 0.01,
                    pricePerUnit: 3000000 + Math.random() * 200000,
                    priceInr: 3000000 + Math.random() * 200000,
                    transactionType: i % 3 === 0 ? 'sell' : 'buy',
                    assetSymbol: ['BTC', 'ETH', 'SOL', 'ADA'][i % 4],
                }));
                fillCount++;
            }
        }

        const result = aggregateFillsToOrders(fills);

        // Should aggregate to exactly 71 orders
        expect(result.transactions.length).toBe(orderCount);
        expect(result.stats.inputFillCount).toBe(fillCount);
        expect(result.stats.outputOrderCount).toBe(orderCount);
    });
});

// ============= DEDUPLICATION TESTS =============

describe('deduplicateTransactions', () => {
    it('should remove transactions with duplicate content hashes', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({ contentHash: 'hash-AAA', orderId: 'order-1' }),
            makeTx({ contentHash: 'hash-BBB', orderId: 'order-2' }),
            makeTx({ contentHash: 'hash-AAA', orderId: 'order-1' }), // duplicate
        ];

        const result = deduplicateTransactions(txs);
        expect(result.unique.length).toBe(2);
        expect(result.duplicateCount).toBe(1);
    });

    it('should deduplicate by orderId across sources', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-123', contentHash: 'api-hash' }),
            makeTx({ orderId: 'order-123', contentHash: 'csv-hash' }), // duplicate via orderId
        ];

        const result = deduplicateTransactions(txs);
        expect(result.unique.length).toBe(1);
        expect(result.duplicateCount).toBe(1);
    });

    it('should keep different orders', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({ orderId: 'order-A', contentHash: 'hash-1' }),
            makeTx({ orderId: 'order-B', contentHash: 'hash-2' }),
        ];

        const result = deduplicateTransactions(txs);
        expect(result.unique.length).toBe(2);
        expect(result.duplicateCount).toBe(0);
    });
});
