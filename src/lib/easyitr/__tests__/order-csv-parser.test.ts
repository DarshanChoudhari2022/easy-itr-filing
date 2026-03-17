/**
 * EasyITR — Order CSV Parser Tests
 * ===================================
 * Tests for CoinDCX Order History CSV parsing logic.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
    parseOrderHistoryCSV,
    computeFinancialYear,
} from '../order-csv-parser';


// ─── Financial Year Computation ──────────────────────────────────────

describe('computeFinancialYear', () => {
    it('should return FY2024-25 for June 2024', () => {
        expect(computeFinancialYear(new Date('2024-06-15'))).toBe('FY2024-25');
    });

    it('should return FY2024-25 for January 2025', () => {
        expect(computeFinancialYear(new Date('2025-01-20'))).toBe('FY2024-25');
    });

    it('should return FY2025-26 for April 2025', () => {
        expect(computeFinancialYear(new Date('2025-04-01'))).toBe('FY2025-26');
    });

    it('should return FY2024-25 for March 2025', () => {
        expect(computeFinancialYear(new Date('2025-03-31'))).toBe('FY2024-25');
    });

    it('should return FY2023-24 for April 2023', () => {
        expect(computeFinancialYear(new Date('2023-04-01'))).toBe('FY2023-24');
    });
});


// ─── CSV Parsing: Happy Path ────────────────────────────────────────

describe('parseOrderHistoryCSV', () => {
    it('should parse a valid CoinDCX order history CSV', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,2024-06-15T10:30:00Z,BTCINR,buy,0.005,5500000,27500,55,filled',
            'ORD002,2024-07-20T14:00:00Z,ETHINR,sell,1.5,280000,420000,840,completed',
            'ORD003,2024-08-01T09:00:00Z,DOGEINR,buy,10000,8.5,85000,170,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(3);

        // First row: BTC BUY
        expect(result.rows[0].source_id).toBe('ORD001');
        expect(result.rows[0].source).toBe('ORDER_CSV');
        expect(result.rows[0].txn_type).toBe('BUY');
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[0].quote_currency).toBe('INR');
        expect(result.rows[0].quantity).toBe(0.005);
        expect(result.rows[0].price_inr).toBe(5500000);
        expect(result.rows[0].total_inr).toBe(27500);
        expect(result.rows[0].fee_inr).toBe(55);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
        expect(result.rows[0].pair).toBe('BTCINR');

        // Second row: ETH SELL
        expect(result.rows[1].txn_type).toBe('SELL');
        expect(result.rows[1].asset).toBe('ETH');
        expect(result.rows[1].total_inr).toBe(420000);

        // Summary
        expect(result.summary.total_buys).toBe(2);
        expect(result.summary.total_sells).toBe(1);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
    });


    // ─── CoinDCX Simple Format (Date,Market,Type,Price,Amount,Total,Fee) ──

    it('should parse CoinDCX simple order history format (no order_id, no status)', () => {
        const csv = [
            'Date,Market,Type,Price,Amount,Total,Fee',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
            '2024-11-16,ADAINR,buy,98.50,500,49250,246.25',
            '2024-06-15,DOGEUSDT,sell,0.12,10000,1200,6',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(3);

        // XRP SELL
        expect(result.rows[0].asset).toBe('XRP');
        expect(result.rows[0].quote_currency).toBe('INR');
        expect(result.rows[0].txn_type).toBe('SELL');
        expect(result.rows[0].price_inr).toBe(76.80);
        expect(result.rows[0].quantity).toBe(1491.07);
        expect(result.rows[0].total_inr).toBe(114483.77);
        expect(result.rows[0].fee_inr).toBe(572.42);
        expect(result.rows[0].tds_inr).toBe(0); // TDS comes from TDS CSV
        expect(result.rows[0].financial_year).toBe('FY2024-25');

        // ADA BUY
        expect(result.rows[1].asset).toBe('ADA');
        expect(result.rows[1].quote_currency).toBe('INR');
        expect(result.rows[1].txn_type).toBe('BUY');
        expect(result.rows[1].quantity).toBe(500);
        expect(result.rows[1].total_inr).toBe(49250);

        // DOGE SELL (USDT pair)
        expect(result.rows[2].asset).toBe('DOGE');
        expect(result.rows[2].quote_currency).toBe('USDT');
    });


    it('should generate synthetic source_id when order_id column is missing', () => {
        const csv = [
            'Date,Market,Type,Price,Amount,Total,Fee',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        // Synthetic ID should be deterministic
        expect(result.rows[0].source_id).toContain('ORD-');
        expect(result.rows[0].source_id).toContain('XRPINR');
        expect(result.rows[0].source).toBe('ORDER_CSV');
    });


    it('should deduplicate rows with same synthetic ID on re-parse', () => {
        const csv = [
            'Date,Market,Type,Price,Amount,Total,Fee',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        // Second row should be deduplicated within the parse
        expect(result.rows).toHaveLength(1);
    });


    // ─── Asset Extraction ──

    it('should extract assets from various pair formats', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'O1,2024-05-01T10:00:00Z,BTCINR,buy,1,100,100,0,filled',
            'O2,2024-05-01T10:00:00Z,BTC/INR,buy,1,100,100,0,filled',
            'O3,2024-05-01T10:00:00Z,ETH-INR,buy,1,100,100,0,filled',
            'O4,2024-05-01T10:00:00Z,I-SHIBINR,buy,1,100,100,0,filled',
            'O5,2024-05-01T10:00:00Z,ACAINR,buy,1,100,100,0,filled',
            'O6,2024-05-01T10:00:00Z,COTIINR,sell,1,100,100,0,filled',
            'O7,2024-05-01T10:00:00Z,DOGEUSDT,sell,1,100,100,0,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(7);
        expect(result.rows[0].asset).toBe('BTC');
        expect(result.rows[0].quote_currency).toBe('INR');
        expect(result.rows[1].asset).toBe('BTC');
        expect(result.rows[1].quote_currency).toBe('INR');
        expect(result.rows[2].asset).toBe('ETH');
        expect(result.rows[2].quote_currency).toBe('INR');
        expect(result.rows[3].asset).toBe('SHIB');
        expect(result.rows[3].quote_currency).toBe('INR');
        expect(result.rows[4].asset).toBe('ACA');
        expect(result.rows[4].quote_currency).toBe('INR');
        expect(result.rows[5].asset).toBe('COTI');
        expect(result.rows[5].quote_currency).toBe('INR');
        expect(result.rows[6].asset).toBe('DOGE');
        expect(result.rows[6].quote_currency).toBe('USDT');
    });


    // ─── Multi-FY import ──

    it('should import orders from ALL financial years (not filter)', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'O1,2023-06-15T10:00:00Z,BTCINR,buy,0.01,5000000,50000,100,filled',   // FY2023-24
            'O2,2024-06-15T10:00:00Z,BTCINR,sell,0.01,6000000,60000,120,filled',   // FY2024-25
            'O3,2022-12-01T10:00:00Z,ETHINR,buy,1,200000,200000,400,filled',       // FY2022-23
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].financial_year).toBe('FY2023-24');
        expect(result.rows[1].financial_year).toBe('FY2024-25');
        expect(result.rows[2].financial_year).toBe('FY2022-23');
        expect(result.summary.financial_years).toEqual(['FY2022-23', 'FY2023-24', 'FY2024-25']);
    });


    it('should handle alternative column names', () => {
        const csv = [
            'id,timestamp,pair,Type,Quantity,Price,Total,Fee,Status',
            'T001,2024-12-01T12:00:00Z,SHIBINR,BUY,500000,0.002,1000,2,FILLED',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('T001');
        expect(result.rows[0].asset).toBe('SHIB');
        expect(result.rows[0].txn_type).toBe('BUY');
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    it('should handle Order ID column variant', () => {
        const csv = [
            'Order ID,Date,Market,Type,Quantity,Price,Total,Fee,Status',
            'ABC123,2025-01-15T09:00:00Z,MATICUSDT,SELL,1000,1.2,1200,2.4,Success',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('ABC123');
        expect(result.rows[0].asset).toBe('MATIC');
        expect(result.rows[0].quote_currency).toBe('USDT');
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    // ─── Status Filtering ──

    it('should skip non-filled orders when status column exists', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,2024-06-15T10:00:00Z,BTCINR,buy,0.01,5500000,55000,110,filled',
            'ORD002,2024-06-15T11:00:00Z,BTCINR,buy,0.02,5500000,110000,220,cancelled',
            'ORD003,2024-06-15T12:00:00Z,BTCINR,buy,0.03,5500000,165000,330,pending',
            'ORD004,2024-06-15T13:00:00Z,BTCINR,sell,0.01,5600000,56000,112,completed',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        // Only ORD001 (filled) and ORD004 (completed) should pass
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].source_id).toBe('ORD001');
        expect(result.rows[1].source_id).toBe('ORD004');
    });


    it('should accept all rows when no status column exists', () => {
        const csv = [
            'Date,Market,Type,Price,Amount,Total,Fee',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
            '2024-11-16,ADAINR,buy,98.50,500,49250,246.25',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);
        expect(result.rows).toHaveLength(2);
    });


    // ─── Total Computation ──

    it('should compute total_inr = qty × price when total column is missing', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,fee,status',
            'ORD001,2024-06-15T10:00:00Z,BTCINR,buy,0.5,6000000,0,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].total_inr).toBe(3000000); // 0.5 × 6000000
    });


    // ─── Date Parsing Variants ──

    it('should handle Unix timestamp (milliseconds)', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,1718438400000,BTCINR,buy,1,100,100,0,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);
        expect(result.rows).toHaveLength(1);
    });

    it('should handle DD/MM/YYYY date format', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,15/06/2024 10:30:00,BTCINR,buy,1,100,100,0,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].financial_year).toBe('FY2024-25');
    });


    // ─── Error Handling ──

    it('should report error for missing required columns', () => {
        const csv = [
            'name,value,description',
            'BTC,100,test',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].reason).toContain('Could not detect required column');
    });


    it('should handle empty CSV', () => {
        const result = parseOrderHistoryCSV('');
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });


    it('should handle CSV with only header', () => {
        const csv = 'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status';
        const result = parseOrderHistoryCSV(csv);
        expect(result.rows).toHaveLength(0);
    });


    it('should report invalid rows and continue parsing valid ones', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,2024-06-15T10:00:00Z,BTCINR,buy,0.01,5500000,55000,110,filled',
            'ORD002,INVALID_DATE,BTCINR,buy,0.02,5500000,110000,220,filled',
            'ORD003,2024-06-15T12:00:00Z,BTCINR,sell,0.01,5600000,56000,112,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(2); // ORD001 + ORD003
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].row).toBe(3); // ORD002 is row 3 (1-indexed)
        expect(result.errors[0].reason).toContain('Invalid date');
    });


    // ─── Quoted Fields ──

    it('should handle quoted fields with commas inside', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            '"ORD,001",2024-06-15T10:00:00Z,BTCINR,buy,0.01,"5,500,000","55,000",110,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].source_id).toBe('ORD,001');
        expect(result.rows[0].price_inr).toBe(5500000);
        expect(result.rows[0].total_inr).toBe(55000);
    });


    // ─── TDS is always 0 for ORDER_CSV ──

    it('should always set tds_inr to 0 (TDS comes from TDS CSV)', () => {
        const csv = [
            'order_id,created_at,market,side,total_quantity,avg_price,total,fee,status',
            'ORD001,2024-06-15T10:00:00Z,BTCINR,sell,0.01,5500000,55000,110,filled',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);
        expect(result.rows[0].tds_inr).toBe(0);
    });


    // ─── Summary ──

    it('should provide correct summary statistics', () => {
        const rows = [];
        rows.push('order_id,created_at,market,side,total_quantity,avg_price,total,fee,status');
        const months = ['04', '05', '06', '07', '08', '09'];
        for (let i = 0; i < 15; i++) {
            const side = i % 3 === 0 ? 'sell' : 'buy';
            const asset = ['BTC', 'ETH', 'DOGE'][i % 3];
            const month = months[i % months.length];
            rows.push(`ORD${i},2024-${month}-15T10:00:00Z,${asset}INR,${side},1,100,100,0,filled`);
        }
        const csv = rows.join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(15);
        expect(result.summary.total_buys).toBe(10);
        expect(result.summary.total_sells).toBe(5);
        expect(result.summary.assets).toEqual(['BTC', 'DOGE', 'ETH']);
        expect(result.summary.financial_years).toEqual(['FY2024-25']);
    });


    // ─── INR value calculation ──

    it('should use Total column directly for INR pairs', () => {
        const csv = [
            'Date,Market,Type,Price,Amount,Total,Fee',
            '2024-11-16,XRPINR,sell,76.80,1491.07,114483.77,572.42',
        ].join('\n');

        const result = parseOrderHistoryCSV(csv);

        expect(result.rows).toHaveLength(1);
        // price_per_unit = Price column
        expect(result.rows[0].price_inr).toBe(76.80);
        // quantity = Amount column
        expect(result.rows[0].quantity).toBe(1491.07);
        // value_inr = Total column directly (not recomputed)
        expect(result.rows[0].total_inr).toBe(114483.77);
        // fee_inr = Fee column
        expect(result.rows[0].fee_inr).toBe(572.42);
    });
});

