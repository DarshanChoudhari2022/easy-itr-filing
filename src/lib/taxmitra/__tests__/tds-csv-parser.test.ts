/**
 * TaxMitra — TDS CSV Parser Tests
 * =================================
 * Tests for CoinDCX TDS Summary CSV parsing logic.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { parseTDSSummaryCSV } from '../tds-csv-parser';
import { computeFinancialYear } from '../order-csv-parser';


// ─── Basic Parsing ───────────────────────────────────────────────────

describe('parseTDSSummaryCSV', () => {
    it('should parse a valid TDS summary CSV', () => {
        const csv = [
            'date,asset,tds_amount,sale_amount,order_id',
            '2024-06-15,BTC,550.00,55000.00,ORD001',
            '2024-07-20,ETH,840.00,84000.00,ORD002',
            '2024-08-01,DOGE,1.70,170.00,ORD003',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(3);

        // First row
        expect(result.rows[0].source).toBe('TDS_CSV');
        expect(result.rows[0].txn_type).toBe('TDS');
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[0].tds_inr).toBe(550);
        expect(result.rows[0].total_inr).toBe(55000);
        expect(result.rows[0].has_order_id).toBe(true);
        expect(result.rows[0].order_id).toBe('ORD001');
        expect(result.rows[0].source_id).toBe('TDS-ORD001');
        expect(result.rows[0].financial_year).toBe('FY2024-25');
        expect(result.rows[0].status).toBe('CONFIRMED');
        expect(result.rows[0].quantity).toBe(0);
        expect(result.rows[0].fee_inr).toBe(0);

        // Summary
        expect(result.summary.total_rows).toBe(3);
        expect(result.summary.rows_with_order_id).toBe(3);
        expect(result.summary.total_tds_inr).toBe(1391.70);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
    });


    // ─── Column Name Variants ──

    it('should handle "TDS Deducted" and "Sale Value" column names', () => {
        const csv = [
            'Date,Coin,TDS Deducted,Sale Value',
            '2024-09-15,SHIB,0.50,50.00',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].asset).toBe('SHIB');
        expect(result.rows[0].tds_inr).toBe(0.50);
        expect(result.rows[0].total_inr).toBe(50);
    });


    it('should handle "transaction_date" and "tds_deducted" columns', () => {
        const csv = [
            'transaction_date,currency,tds_deducted,gross_amount,reference',
            '2024-10-01,MATIC,12.50,1250.00,REF123',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].asset).toBe('MATIC');
        expect(result.rows[0].tds_inr).toBe(12.50);
        expect(result.rows[0].order_id).toBe('REF123');
        expect(result.rows[0].has_order_id).toBe(true);
    });


    // ─── Missing Order ID ──

    it('should generate hash-based source_id when order_id is missing', () => {
        const csv = [
            'date,asset,tds_amount,sale_amount',
            '2024-06-15,BTC,550.00,55000.00',
            '2024-06-16,BTC,600.00,60000.00',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].has_order_id).toBe(false);
        expect(result.rows[0].order_id).toBe('');
        expect(result.rows[0].source_id).toMatch(/^TDS-/);
        // Different rows should have different hashes
        expect(result.rows[0].source_id).not.toBe(result.rows[1].source_id);

        expect(result.summary.rows_with_order_id).toBe(0);
        expect(result.summary.rows_without_order_id).toBe(2);
    });


    // ─── Deterministic Hash ──

    it('should generate deterministic source_id for same data', () => {
        const csv = [
            'date,asset,tds_amount',
            '2024-06-15,BTC,550.00',
        ].join('\n');

        const result1 = parseTDSSummaryCSV(csv);
        const result2 = parseTDSSummaryCSV(csv);

        expect(result1.rows[0].source_id).toBe(result2.rows[0].source_id);
    });


    // ─── Asset Extraction Variants ──

    it('should extract assets from various formats', () => {
        const csv = [
            'date,asset,tds_amount',
            '2024-06-15,BTC,10',
            '2024-06-15,BTCINR,20',
            '2024-06-15,ETH/INR,30',
            '2024-06-15,Bitcoin (BTC),40',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(4);
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[1].asset).toBe('BTC');
        expect(result.rows[2].asset).toBe('ETH');
        expect(result.rows[3].asset).toBe('BTC');
    });


    // ─── Rows with No Asset Column ──

    it('should use UNKNOWN when asset column is missing', () => {
        const csv = [
            'date,tds_amount,sale_amount',
            '2024-06-15,550.00,55000.00',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].asset).toBe('UNKNOWN');
    });


    // ─── Zero/Invalid TDS Amount ──

    it('should skip rows with zero or negative TDS amount', () => {
        const csv = [
            'date,asset,tds_amount',
            '2024-06-15,BTC,550.00',
            '2024-06-16,ETH,0',
            '2024-06-17,DOGE,-5.00',
            '2024-06-18,SHIB,100.00',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(2); // Only BTC and SHIB
        expect(result.errors).toHaveLength(2); // ETH and DOGE errors
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[1].asset).toBe('SHIB');
    });


    // ─── Date Format Variants ──

    it('should handle DD/MM/YYYY date format', () => {
        const csv = [
            'date,asset,tds_amount',
            '15/06/2024,BTC,100',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    it('should handle ISO date format', () => {
        const csv = [
            'date,asset,tds_amount',
            '2025-01-15T14:30:00Z,BTC,200',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    // ─── Financial Year Boundaries ──

    it('should compute FY correctly at boundaries', () => {
        const csv = [
            'date,asset,tds_amount',
            '2025-03-31,BTC,100',
            '2025-04-01,BTC,200',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].financial_year).toBe('FY2024-25'); // March 31 → FY2024-25
        expect(result.rows[1].financial_year).toBe('FY2025-26'); // April 1 → FY2025-26
    });


    // ─── Error Handling ──

    it('should report error for missing required columns', () => {
        const csv = [
            'name,value,description',
            'BTC,100,test',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].reason).toContain('Could not detect required column');
    });


    it('should handle empty CSV', () => {
        const result = parseTDSSummaryCSV('');
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });


    it('should handle invalid dates and continue parsing', () => {
        const csv = [
            'date,asset,tds_amount',
            '2024-06-15,BTC,100',
            'INVALID_DATE,ETH,200',
            '2024-06-17,DOGE,300',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(2); // BTC and DOGE
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3); // ETH row
        expect(result.errors[0].reason).toContain('Invalid date');
    });


    // ─── Quoted Fields ──

    it('should handle quoted fields with commas', () => {
        const csv = [
            'date,asset,tds_amount,sale_amount',
            '2024-06-15,BTC,"1,550.00","155,000.00"',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].tds_inr).toBe(1550);
        expect(result.rows[0].total_inr).toBe(155000);
    });


    // ─── Summary Statistics ──

    it('should calculate correct summary', () => {
        const csv = [
            'date,asset,tds_amount,sale_amount,order_id',
            '2024-06-15,BTC,550.00,55000.00,ORD001',
            '2024-07-20,ETH,840.00,84000.00,ORD002',
            '2024-08-01,BTC,100.00,10000.00,',
            '2024-09-15,DOGE,1.70,170.00,',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.summary.total_rows).toBe(4);
        expect(result.summary.rows_with_order_id).toBe(2);
        expect(result.summary.rows_without_order_id).toBe(2);
        expect(result.summary.total_tds_inr).toBe(1491.70);
        expect(result.summary.total_sale_inr).toBe(149170);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
        expect(result.summary.financial_years).toEqual(['FY2024-25']);
        expect(result.summary.date_range.from).toBe('2024-06-15');
    });


    // ─── Raw Data Audit Trail ──

    it('should include raw_data for audit trail', () => {
        const csv = [
            'date,asset,tds_amount,extra_col',
            '2024-06-15,BTC,550.00,some_info',
        ].join('\n');

        const result = parseTDSSummaryCSV(csv);

        expect(result.rows[0].raw_data).toBeDefined();
        expect(result.rows[0].raw_data['date']).toBe('2024-06-15');
        expect(result.rows[0].raw_data['asset']).toBe('BTC');
        expect(result.rows[0].raw_data['extra_col']).toBe('some_info');
    });
});
