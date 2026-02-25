/**
 * TaxMitra — Insta CSV Parser Tests
 * ====================================
 * Tests for CoinDCX Insta History CSV parsing logic.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { parseInstaHistoryCSV } from '../insta-csv-parser';


describe('parseInstaHistoryCSV', () => {

    // ─── Basic Parsing ──

    it('should parse a valid Insta history CSV', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount,fee',
            'INSTA001,2024-06-15T10:30:00Z,buy,BTC,0.005,27500,55',
            'INSTA002,2024-07-20T14:00:00Z,sell,ETH,1.5,420000,840',
            'INSTA003,2024-08-01T09:00:00Z,buy,DOGE,10000,85000,170',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(3);

        // First row: BTC BUY
        expect(result.rows[0].source_id).toBe('INSTA001');
        expect(result.rows[0].source).toBe('INSTA_CSV');
        expect(result.rows[0].txn_type).toBe('BUY');
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[0].quantity).toBe(0.005);
        expect(result.rows[0].total_inr).toBe(27500);
        expect(result.rows[0].price_inr).toBe(5500000); // 27500 / 0.005
        expect(result.rows[0].fee_inr).toBe(55);
        expect(result.rows[0].tds_inr).toBe(0);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
        expect(result.rows[0].pair).toBe('BTCINR');
        expect(result.rows[0].status).toBe('COMPLETED');

        // Second row: ETH SELL
        expect(result.rows[1].txn_type).toBe('SELL');
        expect(result.rows[1].asset).toBe('ETH');
        expect(result.rows[1].price_inr).toBe(280000); // 420000 / 1.5

        // Summary
        expect(result.summary.total_buys).toBe(2);
        expect(result.summary.total_sells).toBe(1);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
    });


    // ─── Column Name Variants ──

    it('should handle alternative column names', () => {
        const csv = [
            'transaction_id,date,side,asset,crypto_amount,amount,charges',
            'TX001,2024-12-01T12:00:00Z,BUY,SHIB,500000,1000,2',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('TX001');
        expect(result.rows[0].asset).toBe('SHIB');
        expect(result.rows[0].txn_type).toBe('BUY');
        expect(result.rows[0].quantity).toBe(500000);
        expect(result.rows[0].total_inr).toBe(1000);
    });


    it('should handle Order ID / Date / Type column names', () => {
        const csv = [
            'ID,Date,Type,Coin,Quantity,INR Amount,Fee',
            'ABC123,2025-01-15T09:00:00Z,SELL,MATIC,1000,120000,240',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('ABC123');
        expect(result.rows[0].asset).toBe('MATIC');
        expect(result.rows[0].txn_type).toBe('SELL');
    });


    // ─── Price Computation ──

    it('should compute price_inr = total_inr / quantity', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,60000',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].price_inr).toBe(6000000); // 60000 / 0.01
    });


    it('should set price_inr to 0 if quantity is 0', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0,60000',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        // quantity=0 but inr_amount > 0, so it should still parse
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].price_inr).toBe(0);
        expect(result.rows[0].total_inr).toBe(60000);
    });


    // ─── Fee Defaults to 0 ──

    it('should default fee to 0 when fee column missing', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,60000',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows[0].fee_inr).toBe(0);
    });


    // ─── Asset Extraction ──

    it('should extract assets from various formats', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,1,100',
            'T2,2024-06-15T10:00:00Z,buy,Bitcoin (BTC),1,100',
            'T3,2024-06-15T10:00:00Z,sell,ETHINR,1,100',
            'T4,2024-06-15T10:00:00Z,sell,SHIB/INR,1,100',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(4);
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[1].asset).toBe('BTC');
        expect(result.rows[2].asset).toBe('ETH');
        expect(result.rows[3].asset).toBe('SHIB');
    });


    // ─── Financial Year ──

    it('should compute FY correctly', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2025-03-15T10:00:00Z,buy,BTC,1,100',
            'T2,2025-04-15T10:00:00Z,buy,BTC,1,100',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
        expect(result.rows[1].financial_year).toBe('FY2025-26');
    });


    // ─── Date Formats ──

    it('should handle DD/MM/YYYY date format', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,15/06/2024 10:30:00,buy,BTC,1,100',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    it('should handle Unix timestamps', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,1718438400000,buy,BTC,1,100',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);
        expect(result.rows).toHaveLength(1);
    });


    // ─── Error Handling ──

    it('should report error for missing columns', () => {
        const csv = [
            'name,value,description',
            'BTC,100,test',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].reason).toContain('Could not detect required column');
    });


    it('should handle empty CSV', () => {
        const result = parseInstaHistoryCSV('');
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });


    it('should skip invalid rows and continue', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,60000',
            'T2,INVALID_DATE,buy,ETH,1,100',
            'T3,2024-06-17T10:00:00Z,sell,DOGE,1000,500',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3);
    });


    it('should skip rows where both quantity and amount are zero', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0,0',
            'T2,2024-06-15T10:00:00Z,buy,ETH,1,500',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].asset).toBe('ETH');
    });


    // ─── Quoted Fields ──

    it('should handle quoted fields with commas', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,"60,000"',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].total_inr).toBe(60000);
    });


    // ─── Summary Statistics ──

    it('should compute correct summary', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,60000',
            'T2,2024-06-16T10:00:00Z,sell,BTC,0.005,30000',
            'T3,2024-07-01T10:00:00Z,buy,ETH,2,500000',
            'T4,2024-07-15T10:00:00Z,buy,DOGE,10000,800',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.summary.total_buys).toBe(3);
        expect(result.summary.total_sells).toBe(1);
        expect(result.summary.total_inr_volume).toBe(590800);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
        expect(result.summary.financial_years).toEqual(['FY2024-25']);
    });


    // ─── Pair is always <ASSET>INR ──

    it('should set pair to <ASSET>INR for all insta trades', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount',
            'T1,2024-06-15T10:00:00Z,buy,SHIB,1000000,500',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows[0].pair).toBe('SHIBINR');
    });


    // ─── Raw Data ──

    it('should include raw_data for audit trail', () => {
        const csv = [
            'id,created_at,type,coin,quantity,inr_amount,extra',
            'T1,2024-06-15T10:00:00Z,buy,BTC,0.01,60000,bonus_info',
        ].join('\n');

        const result = parseInstaHistoryCSV(csv);

        expect(result.rows[0].raw_data).toBeDefined();
        expect(result.rows[0].raw_data['id']).toBe('T1');
        expect(result.rows[0].raw_data['extra']).toBe('bonus_info');
    });
});
