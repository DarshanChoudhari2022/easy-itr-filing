import { describe, expect, it } from 'vitest';
import { calculateTokenGains, DEFAULT_TAX_SETTINGS, type Transaction } from './crypto-engine';

const trade = (id: string, type: Transaction['type'], price: number, fee = 0): Transaction => ({
    id, type, token: 'BTC', quantity: 1, pricePerUnit: price, fee,
    date: new Date(type === 'buy' ? '2025-04-02T00:00:00Z' : '2025-04-03T00:00:00Z'),
});

describe('VDA acquisition and disposal safeguards', () => {
    it('does not deduct exchange fees from VDA transfer income', () => {
        const result = calculateTokenGains([trade('b', 'buy', 100, 5), trade('s', 'sell', 200, 10)], DEFAULT_TAX_SETTINGS);
        expect(result.taxableGain).toBe(100);
    });
    it('rejects missing acquisition history rather than silently omitting a sale', () => {
        expect(() => calculateTokenGains([trade('s', 'sell', 200)], DEFAULT_TAX_SETTINGS)).toThrow(/acquisition history/i);
    });
    it('does not invent TDS when no deduction evidence was imported', () => {
        expect(calculateTokenGains([trade('b', 'buy', 100), trade('s', 'sell', 200)], DEFAULT_TAX_SETTINGS).taxAt1Percent).toBe(0);
    });
});
