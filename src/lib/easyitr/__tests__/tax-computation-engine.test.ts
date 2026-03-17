/**
 * Unit Tests — Tax Computation Engine v3
 * =======================================
 * Tests the FIFO tax computation engine for KoinX-compatible behavior.
 * Covers: FY Detection (IST), Event Classification, FIFO Lot Matching,
 *         Fee Handling, Reward Income, Crypto-to-Crypto, TDS Credit.
 */

import {
    mapTxToFinancialYear,
    classifyVdaEvent,
    computeVdaTaxForFinancialYear,
} from '../tax-computation-engine';
import type { NormalizedTransaction, TDSRecord } from '../coindcx-ingestion';

// ============= HELPER: Create minimal NormalizedTransaction =============

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

// ============= TEST 1: IST-Aware FY Detection =============

describe('mapTxToFinancialYear', () => {
    test('simple date in middle of FY → correct FY', () => {
        // 15 June 2024 → FY 2024-25
        expect(mapTxToFinancialYear(new Date('2024-06-15T10:00:00Z'))).toBe('2024-25');
    });

    test('January date → previous FY', () => {
        // 15 Jan 2025 → FY 2024-25
        expect(mapTxToFinancialYear(new Date('2025-01-15T10:00:00Z'))).toBe('2024-25');
    });

    test('March 31 late UTC → FY 2024-25 (still March in IST if before 18:30 UTC)', () => {
        // 31 March 2025 at 15:00 UTC = 31 March 2025 at 20:30 IST → still FY 2024-25
        expect(mapTxToFinancialYear(new Date('2025-03-31T15:00:00Z'))).toBe('2024-25');
    });

    test('March 31 very late UTC → FY 2025-26 (April 1 in IST)', () => {
        // 31 March 2025 at 20:00 UTC = 1 April 2025 at 01:30 IST → FY 2025-26
        expect(mapTxToFinancialYear(new Date('2025-03-31T20:00:00Z'))).toBe('2025-26');
    });

    test('April 1 early UTC → FY 2025-26', () => {
        // 1 April 2025 at 00:00 UTC = 1 April 2025 at 05:30 IST → FY 2025-26
        expect(mapTxToFinancialYear(new Date('2025-04-01T00:00:00Z'))).toBe('2025-26');
    });

    test('boundary: March 31 at 18:29 UTC → FY 2024-25 (March 31 23:59 IST)', () => {
        expect(mapTxToFinancialYear(new Date('2025-03-31T18:29:00Z'))).toBe('2024-25');
    });

    test('boundary: March 31 at 18:30 UTC → FY 2025-26 (April 1 00:00 IST)', () => {
        expect(mapTxToFinancialYear(new Date('2025-03-31T18:30:00Z'))).toBe('2025-26');
    });
});

// ============= TEST 2: Event Classifier =============

describe('classifyVdaEvent', () => {
    test('buy with INR → SPOT_BUY', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'buy', quoteAsset: 'INR' });
        expect(classifyVdaEvent(tx)).toBe('SPOT_BUY');
    });

    test('sell with INR → SPOT_SELL', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'sell', quoteAsset: 'INR' });
        expect(classifyVdaEvent(tx)).toBe('SPOT_SELL');
    });

    test('buy with USDT → CRYPTO_TO_CRYPTO_BUY', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'buy', quoteAsset: 'USDT' });
        expect(classifyVdaEvent(tx)).toBe('CRYPTO_TO_CRYPTO_BUY');
    });

    test('sell with USDT → CRYPTO_TO_CRYPTO_SELL', () => {
        const tx = makeTx({ assetSymbol: 'ETH', transactionType: 'sell', quoteAsset: 'USDT' });
        expect(classifyVdaEvent(tx)).toBe('CRYPTO_TO_CRYPTO_SELL');
    });

    test('deposit crypto → DEPOSIT_CRYPTO', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'deposit', quoteAsset: 'BTC' });
        expect(classifyVdaEvent(tx)).toBe('DEPOSIT_CRYPTO');
    });

    test('withdrawal crypto → WITHDRAW_CRYPTO', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'withdrawal', quoteAsset: 'BTC' });
        expect(classifyVdaEvent(tx)).toBe('WITHDRAW_CRYPTO');
    });

    test('reward → REWARD', () => {
        const tx = makeTx({ assetSymbol: 'SHIB', transactionType: 'reward_staking' });
        expect(classifyVdaEvent(tx)).toBe('REWARD');
    });

    test('staking → STAKING', () => {
        const tx = makeTx({ assetSymbol: 'ETH', transactionType: 'staking' });
        expect(classifyVdaEvent(tx)).toBe('STAKING');
    });

    test('airdrop → AIRDROP', () => {
        const tx = makeTx({ assetSymbol: 'TOKEN', transactionType: 'airdrop' });
        expect(classifyVdaEvent(tx)).toBe('AIRDROP');
    });

    test('transfer → TRANSFER_SELF (not taxable)', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'transfer' });
        expect(classifyVdaEvent(tx)).toBe('TRANSFER_SELF');
    });

    test('swap_in → CRYPTO_TO_CRYPTO_BUY', () => {
        const tx = makeTx({ assetSymbol: 'BTC', transactionType: 'swap_in' });
        expect(classifyVdaEvent(tx)).toBe('CRYPTO_TO_CRYPTO_BUY');
    });

    test('swap_out → CRYPTO_TO_CRYPTO_SELL', () => {
        const tx = makeTx({ assetSymbol: 'ETH', transactionType: 'swap_out' });
        expect(classifyVdaEvent(tx)).toBe('CRYPTO_TO_CRYPTO_SELL');
    });
});

// ============= TEST 3: Simple Buy/Sell FIFO =============

describe('computeVdaTaxForFinancialYear — Simple Buy/Sell', () => {
    test('buy then sell at profit → correct gain', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 3000000, // ₹30L per BTC
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-05-15T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000, // ₹40L per BTC
                grossAmountInr: 40000,
                tdsAmount: 400, // 1% of 40000
                tradeTimestamp: new Date('2024-08-15T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        expect(result.grossCapitalGains).toBe(10000); // 40K - 30K = 10K profit
        expect(result.grossCapitalLosses).toBe(0);
        expect(result.taxableCapitalGains).toBe(10000); // = gross gains (115BBH)
        expect(result.totalConsiderationInr).toBe(40000);
        expect(result.totalCostOfAcquisitionInr).toBe(30000);
    });

    test('buy then sell at loss → gain=0, loss tracked separately', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 5000000,
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-05-15T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 3000000,
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-08-15T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        expect(result.grossCapitalGains).toBe(0);
        expect(result.grossCapitalLosses).toBe(20000); // 50K - 30K = 20K loss
        expect(result.taxableCapitalGains).toBe(0); // No gain to tax
        expect(result.totalTaxLiability).toBe(0);
    });
});

// ============= TEST 4: 115BBH — No Loss Offset =============

describe('computeVdaTaxForFinancialYear — 115BBH No Loss Offset', () => {
    test('profit on BTC + loss on ETH → tax on BTC profit only', () => {
        const txs: NormalizedTransaction[] = [
            // BTC: buy at 30K, sell at 40K → 10K profit
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
                tradeTimestamp: new Date('2024-06-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            // ETH: buy at 50K, sell at 30K → 20K loss
            makeTx({
                assetSymbol: 'ETH',
                transactionType: 'buy',
                quantity: 0.1,
                priceInr: 500000,
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'ETH',
                transactionType: 'sell',
                quantity: 0.1,
                priceInr: 300000,
                grossAmountInr: 30000,
                tradeTimestamp: new Date('2024-06-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        // 115BBH: Loss on ETH CANNOT offset gain on BTC
        expect(result.grossCapitalGains).toBe(10000); // BTC gain only
        expect(result.grossCapitalLosses).toBe(20000); // ETH loss
        expect(result.taxableCapitalGains).toBe(10000); // Only profit is taxed
        expect(result.netGainLossInfo).toBe(-10000); // Net P&L for info only
    });
});

// ============= TEST 5: Reward → Income + Later Sale =============

describe('computeVdaTaxForFinancialYear — Rewards', () => {
    test('reward income is tracked as otherVDAIncome', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'SHIB',
                transactionType: 'reward_staking',
                quantity: 100000,
                priceInr: 0.001, // ₹0.001 per SHIB
                grossAmountInr: 100, // Total value ₹100
                tradeTimestamp: new Date('2024-07-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        expect(result.otherVDAIncome).toBe(100);
        expect(result.totalTaxableVDA).toBe(100);
    });
});

// ============= TEST 6: Transfer Self → Not Taxable =============

describe('computeVdaTaxForFinancialYear — Self Transfers', () => {
    test('transfer between own wallets is NOT a taxable event', () => {
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
                transactionType: 'transfer',
                quantity: 0.01,
                priceInr: 3500000,
                grossAmountInr: 35000,
                tradeTimestamp: new Date('2024-06-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        expect(result.grossCapitalGains).toBe(0); // No sales occurred
        expect(result.totalConsiderationInr).toBe(0);
    });
});

// ============= TEST 7: TDS Credit Logic =============

describe('computeVdaTaxForFinancialYear — TDS', () => {
    test('TDS from trades aggregated and used as credit', () => {
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
                priceInr: 5000000,
                grossAmountInr: 50000,
                tdsAmount: 500, // 1% of 50K
                tradeTimestamp: new Date('2024-08-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        expect(result.grossCapitalGains).toBe(20000);
        expect(result.totalTDSCredit).toBe(500);
        // Tax on 20K @ 30% = 6000 + cess 4% = 6240
        expect(result.taxOnGains30Pct).toBe(6000);
        expect(result.netTaxPayable).toBeLessThan(result.totalTaxLiability); // TDS reduces payable
    });
});

// ============= TEST 8: Fee Handling =============

describe('computeVdaTaxForFinancialYear — Fee Handling', () => {
    test('fee in quote asset (INR) added to cost of acquisition', () => {
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

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        // Cost basis = 30000 + 50 fee = 30050
        // Gain = 40000 - 30050 = 9950
        expect(result.grossCapitalGains).toBe(9950);
        expect(result.totalCostOfAcquisitionInr).toBe(30050);
    });
});

// ============= TEST 9: Prior-FY Cost Basis =============

describe('computeVdaTaxForFinancialYear — Prior FY Cost Basis', () => {
    test('buy in FY 2023-24, sell in FY 2024-25 → uses old cost basis', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 2000000, // ₹20L per BTC (bought in previous FY)
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

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        // Gain = 40K sell - 20K cost = 20K
        expect(result.grossCapitalGains).toBe(20000);
        expect(result.totalCostOfAcquisitionInr).toBe(20000);
    });
});

// ============= TEST 10: FIFO Order =============

describe('computeVdaTaxForFinancialYear — FIFO Order', () => {
    test('multiple buys at different prices → FIFO uses oldest first', () => {
        const txs: NormalizedTransaction[] = [
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 2000000, // ₹20L (cheapest, oldest)
                grossAmountInr: 20000,
                tradeTimestamp: new Date('2024-05-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'buy',
                quantity: 0.01,
                priceInr: 5000000, // ₹50L (expensive, newer)
                grossAmountInr: 50000,
                tradeTimestamp: new Date('2024-07-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
            makeTx({
                assetSymbol: 'BTC',
                transactionType: 'sell',
                quantity: 0.01,
                priceInr: 4000000, // ₹40L per BTC
                grossAmountInr: 40000,
                tradeTimestamp: new Date('2024-09-01T10:00:00Z'),
                financialYear: '2024-25',
            }),
        ];

        const result = computeVdaTaxForFinancialYear(txs, [], '2024-25', 'FIFO');

        // FIFO: Sells the ₹20L lot first
        // Gain = 40K - 20K = 20K
        expect(result.grossCapitalGains).toBe(20000);

        // Remaining lot: 0.01 BTC at ₹50L cost
        expect(result.activeLots.length).toBe(1);
        expect(result.activeLots[0].costBasisPerUnit).toBe(5000000);
    });
});
