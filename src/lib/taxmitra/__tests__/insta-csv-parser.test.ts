/**
 * TaxMitra — Insta History CSV Parser Tests
 * ==========================================
 * Tests for CoinDCX Insta History CSV parsing logic,
 * including BUY/SELL trades AND staking/reward income events.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { parseInstaHistoryCSV } from '../insta-csv-parser';


// ─── BUY / SELL Trades ───────────────────────────────────────────────

describe('parseInstaHistoryCSV — trades', () => {
    it('should parse BUY and SELL Insta trades', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value,Remarks',
            '2024-12-03T14:30:00Z,buy,ACA,10000,316184,Instant buy',
            '2024-12-10T11:00:00Z,sell,ADA,500,45000,Instant sell',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(2);
        expect(result.incomeRows).toHaveLength(0);

        // ACA BUY
        expect(result.rows[0].txn_type).toBe('BUY');
        expect(result.rows[0].asset).toBe('ACA');
        expect(result.rows[0].quantity).toBe(10000);
        expect(result.rows[0].total_inr).toBe(316184);
        expect(result.rows[0].price_inr).toBeCloseTo(31.6184, 2);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
        expect(result.rows[0].source).toBe('INSTA_CSV');

        // ADA SELL
        expect(result.rows[1].txn_type).toBe('SELL');
        expect(result.rows[1].asset).toBe('ADA');
        expect(result.rows[1].total_inr).toBe(45000);
    });


    it('should generate synthetic source_id when no ID column', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value',
            '2024-12-03T14:30:00Z,buy,ACA,10000,316184',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toContain('INSTA-');
        // Same data → same ID (deterministic)
        const result2 = parseInstaHistoryCSV(csv);
        expect(result2.rows[0].source_id).toBe(result.rows[0].source_id);
    });


    it('should deduplicate identical rows within same parse', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value',
            '2024-12-03T14:30:00Z,buy,ACA,10000,316184',
            '2024-12-03T14:30:00Z,buy,ACA,10000,316184',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);
        expect(result.rows).toHaveLength(1);
    });


    it('should handle ID column when present', () => {
        const csv = [
            'id,Timestamp,Type,Currency,Amount,INR_Value',
            'TX001,2024-12-03T14:30:00Z,buy,ACA,10000,316184',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('TX001');
    });


    it('should import BUY orders from all FYs for FIFO cost basis', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value',
            '2022-06-15T10:00:00Z,buy,BTC,0.01,20000',
            '2023-08-01T10:00:00Z,buy,BTC,0.02,50000',
            '2024-12-01T10:00:00Z,sell,BTC,0.015,45000',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].financial_year).toBe('FY2022-23');
        expect(result.rows[1].financial_year).toBe('FY2023-24');
        expect(result.rows[2].financial_year).toBe('FY2024-25');
    });
});


// ─── Staking / Reward Income Events ─────────────────────────────────

describe('parseInstaHistoryCSV — income events', () => {
    it('should parse staking_interest as income event', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value,Remarks',
            '2024-12-11T00:00:00Z,staking_interest,ADA,10.5,115.50,Weekly staking reward',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(0);
        expect(result.incomeRows).toHaveLength(1);

        const inc = result.incomeRows[0];
        expect(inc.income_type).toBe('staking');
        expect(inc.asset).toBe('ADA');
        expect(inc.quantity).toBe(10.5);
        expect(inc.value_inr).toBe(115.50);
        expect(inc.financial_year).toBe('FY2024-25');
        expect(inc.source).toBe('coindcx_insta');
        expect(inc.source_id).toContain('INSTA-');
        expect(inc.remarks).toBe('Weekly staking reward');
    });


    it('should parse reward as income event', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value,Remarks',
            '2024-12-15T10:00:00Z,reward,INR,0,709.63,Cashback reward',
            '2024-12-20T10:00:00Z,reward,SHIB,50000,103.58,Trading reward',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(0);
        expect(result.incomeRows).toHaveLength(2);

        // INR reward
        expect(result.incomeRows[0].income_type).toBe('reward');
        expect(result.incomeRows[0].asset).toBe('INR');
        expect(result.incomeRows[0].value_inr).toBe(709.63);

        // SHIB reward
        expect(result.incomeRows[1].income_type).toBe('reward');
        expect(result.incomeRows[1].asset).toBe('SHIB');
        expect(result.incomeRows[1].value_inr).toBe(103.58);
        expect(result.incomeRows[1].quantity).toBe(50000);
    });


    it('should handle multiple staking events per year (no 409 conflict)', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value,Remarks',
            '2024-12-11T00:00:00Z,staking_interest,ADA,10,100,Week 1',
            '2024-12-23T00:00:00Z,staking_interest,ADA,15,165,Week 2',
            '2025-01-17T00:00:00Z,staking_interest,ADA,12,132,Week 3',
            '2025-02-14T00:00:00Z,staking_interest,ADA,20,220,Week 4',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        // All 4 events should be separate income rows (not collapsed into 1)
        expect(result.incomeRows).toHaveLength(4);

        // All should be FY2024-25
        result.incomeRows.forEach(inc => {
            expect(inc.financial_year).toBe('FY2024-25');
            expect(inc.income_type).toBe('staking');
        });

        // Each has unique source_id for per-event dedup
        const sourceIds = result.incomeRows.map(r => r.source_id);
        const uniqueIds = new Set(sourceIds);
        expect(uniqueIds.size).toBe(4);

        // Total: 100 + 165 + 132 + 220 = 617
        const totalInr = result.incomeRows.reduce((s, r) => s + r.value_inr, 0);
        expect(totalInr).toBe(617);
    });
});


// ─── Mixed CSV (Trades + Income) ────────────────────────────────────

describe('parseInstaHistoryCSV — mixed', () => {
    it('should parse CSV with both trades and income events', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value,Remarks',
            '2024-12-03T14:30:00Z,buy,ACA,10000,316184,Instant buy',
            '2024-12-10T11:00:00Z,sell,ADA,500,45000,Instant sell',
            '2024-12-11T00:00:00Z,staking_interest,ADA,10.5,115.50,Staking',
            '2024-12-15T10:00:00Z,reward,INR,0,709.63,Cashback',
            '2024-12-20T10:00:00Z,reward,SHIB,50000,103.58,Reward',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(2);        // 1 buy + 1 sell
        expect(result.incomeRows).toHaveLength(3);   // 1 staking + 2 rewards

        // Summary should cover both
        expect(result.summary.total_buys).toBe(1);
        expect(result.summary.total_sells).toBe(1);
        expect(result.summary.total_income_events).toBe(3);
        expect(result.summary.total_income_inr).toBeCloseTo(928.71, 2);
        expect(result.summary.assets).toContain('ACA');
        expect(result.summary.assets).toContain('ADA');
        expect(result.summary.assets).toContain('INR');
        expect(result.summary.assets).toContain('SHIB');
    });


    it('should skip unknown transaction types', () => {
        const csv = [
            'Timestamp,Type,Currency,Amount,INR_Value',
            '2024-12-03T14:30:00Z,buy,BTC,1,100',
            '2024-12-04T14:30:00Z,transfer,BTC,1,100',
            '2024-12-05T14:30:00Z,withdrawal,BTC,1,100',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        // Only buy is valid
        expect(result.rows).toHaveLength(1);
        expect(result.incomeRows).toHaveLength(0);
        // transfer and withdrawal should generate errors
        expect(result.errors.some(e => e.reason.includes('Unknown transaction type'))).toBe(true);
    });
});


// ─── Column Detection ────────────────────────────────────────────────

describe('parseInstaHistoryCSV — column detection', () => {
    it('should handle alternative column names', () => {
        const csv = [
            'created_at,Side,Coin,Quantity,INR_Value,Fee,Remarks',
            '2024-12-03T14:30:00Z,BUY,ACA,10000,316184,500,test',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        // Debug: if test fails, log errors
        if (result.rows.length === 0) {
            console.error('Alt column test errors:', result.errors);
        }

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].asset).toBe('ACA');
        expect(result.rows[0].fee_inr).toBe(500);
    });


    it('should detect required columns and report missing', () => {
        const csv = [
            'Name,Value,Description',
            'Test,123,Blah',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].reason).toContain('Could not detect required column');
    });


    it('should handle empty CSV', () => {
        const result = parseInstaHistoryCSV('');
        expect(result.rows).toHaveLength(0);
        expect(result.incomeRows).toHaveLength(0);
    });
});
