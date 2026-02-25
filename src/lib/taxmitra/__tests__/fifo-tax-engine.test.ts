/**
 * TaxMitra — FIFO Tax Engine Tests
 * ==================================
 * Tests the FIFO capital gains computation logic.
 * Uses a mock Supabase client to simulate database interactions.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeCryptoTax, type TaxComputationResult } from '../fifo-tax-engine';

// ─── Mock Supabase Client ────────────────────────────────────────────

/**
 * Creates a mock Supabase client that simulates the query builder pattern.
 * Data is stored in-memory tables that the engine operates on.
 */
function createMockSupabase(initialData: {
    crypto_transactions?: any[];
    crypto_tax_lots?: any[];
    crypto_tax_computations?: any[];
}) {
    // In-memory tables
    const tables: Record<string, any[]> = {
        crypto_transactions: [...(initialData.crypto_transactions || [])],
        crypto_tax_lots: [...(initialData.crypto_tax_lots || [])],
        crypto_tax_computations: [...(initialData.crypto_tax_computations || [])],
    };

    let idCounter = 1000;

    function createQueryBuilder(tableName: string) {
        let filters: Array<{ type: string; args: any[] }> = [];
        let selectedFields: string[] | null = null;
        let orderField: string | null = null;
        let orderAsc = true;
        let pendingInsertData: any[] | null = null;
        let pendingUpdateData: any | null = null;
        let isDelete = false;

        const applyFilters = (rows: any[]): any[] => {
            let result = [...rows];
            for (const f of filters) {
                switch (f.type) {
                    case 'eq':
                        result = result.filter(r => String(r[f.args[0]]) === String(f.args[1]));
                        break;
                    case 'in':
                        result = result.filter(r => f.args[1].includes(r[f.args[0]]));
                        break;
                    case 'gt':
                        result = result.filter(r => Number(r[f.args[0]]) > Number(f.args[1]));
                        break;
                    case 'gte':
                        result = result.filter(r => r[f.args[0]] >= f.args[1]);
                        break;
                    case 'lte':
                        result = result.filter(r => r[f.args[0]] <= f.args[1]);
                        break;
                }
            }
            return result;
        };

        const builder: any = {
            select: (fields?: string) => {
                if (fields && fields !== '*') selectedFields = fields.split(',').map(f => f.trim());
                // If this is a pending insert, return results
                if (pendingInsertData !== null) {
                    const inserted = pendingInsertData.map(row => ({
                        id: `mock-${idCounter++}`,
                        ...row,
                    }));
                    tables[tableName].push(...inserted);
                    pendingInsertData = null;
                    return Promise.resolve({ data: inserted, error: null });
                }
                return builder;
            },
            eq: (col: string, val: any) => { filters.push({ type: 'eq', args: [col, val] }); return builder; },
            in: (col: string, vals: any[]) => { filters.push({ type: 'in', args: [col, vals] }); return builder; },
            gt: (col: string, val: any) => { filters.push({ type: 'gt', args: [col, val] }); return builder; },
            gte: (col: string, val: any) => { filters.push({ type: 'gte', args: [col, val] }); return builder; },
            lte: (col: string, val: any) => { filters.push({ type: 'lte', args: [col, val] }); return builder; },
            order: (col: string, opts?: { ascending?: boolean }) => {
                orderField = col;
                orderAsc = opts?.ascending !== false;
                return builder;
            },
            insert: (data: any | any[]) => {
                const rows = Array.isArray(data) ? data : [data];
                const inserted = rows.map(row => ({
                    id: `mock-${idCounter++}`,
                    ...row,
                }));
                tables[tableName].push(...inserted);
                return Promise.resolve({ data: inserted, error: null });
            },
            update: (data: any) => {
                pendingUpdateData = data;
                return builder;
            },
            delete: () => {
                isDelete = true;
                return builder;
            },
            upsert: (data: any | any[], _opts?: any) => {
                const rows = Array.isArray(data) ? data : [data];
                const inserted = rows.map(row => ({
                    id: `mock-${idCounter++}`,
                    ...row,
                }));
                tables[tableName].push(...inserted);
                return { data: inserted, error: null, select: () => Promise.resolve({ data: inserted, error: null }) };
            },
            then: (resolve: Function, reject?: Function) => {
                try {
                    let result: any;

                    if (isDelete) {
                        const before = tables[tableName].length;
                        const toDelete = applyFilters(tables[tableName]);
                        tables[tableName] = tables[tableName].filter(r => !toDelete.includes(r));
                        result = { data: null, error: null, count: before - tables[tableName].length };
                    } else if (pendingUpdateData !== null) {
                        const matching = applyFilters(tables[tableName]);
                        for (const row of matching) {
                            Object.assign(row, pendingUpdateData);
                        }
                        result = { data: matching, error: null };
                    } else {
                        let rows = applyFilters(tables[tableName]);
                        if (orderField) {
                            rows.sort((a, b) => {
                                const va = a[orderField!];
                                const vb = b[orderField!];
                                const cmp = va < vb ? -1 : va > vb ? 1 : 0;
                                return orderAsc ? cmp : -cmp;
                            });
                        }
                        if (selectedFields) {
                            rows = rows.map(r => {
                                const obj: any = {};
                                for (const f of selectedFields!) {
                                    obj[f] = r[f];
                                }
                                return obj;
                            });
                        }
                        result = { data: rows, error: null };
                    }

                    resolve(result);
                } catch (err) {
                    if (reject) reject(err);
                    else resolve({ data: null, error: err });
                }
            },
        };

        return builder;
    }

    return {
        from: (table: string) => createQueryBuilder(table),
        auth: { getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null }) },
        _tables: tables, // expose for assertions
    };
}


// ─── Test Helpers ────────────────────────────────────────────────────

function makeBuy(id: string, asset: string, qty: number, totalInr: number, fee: number, timestamp: string, fy: string) {
    return {
        id, user_id: 'test-user', source: 'ORDER_CSV', source_id: id,
        txn_type: 'BUY', asset, quantity: qty, price_inr: totalInr / qty,
        total_inr: totalInr, fee_inr: fee, tds_inr: 0,
        timestamp, financial_year: fy, pair: `${asset}INR`, status: 'CONFIRMED',
    };
}

function makeSell(id: string, asset: string, qty: number, totalInr: number, fee: number, tds: number, timestamp: string, fy: string) {
    return {
        id, user_id: 'test-user', source: 'ORDER_CSV', source_id: id,
        txn_type: 'SELL', asset, quantity: qty, price_inr: totalInr / qty,
        total_inr: totalInr, fee_inr: fee, tds_inr: tds,
        timestamp, financial_year: fy, pair: `${asset}INR`, status: 'CONFIRMED',
    };
}


// ─── Tests ───────────────────────────────────────────────────────────

describe('computeCryptoTax', () => {

    it('should handle empty transaction set', async () => {
        const supabase = createMockSupabase({ crypto_transactions: [] });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.success).toBe(true);
        expect(result.capital_gain_trades).toBe(0);
        expect(result.total_sale_consideration).toBe(0);
        expect(result.total_cost_of_acquisition).toBe(0);
        expect(result.gross_capital_gain).toBe(0);
        expect(result.taxable_gain).toBe(0);
        expect(result.total_tax).toBe(0);
        expect(result.net_payable).toBe(0);
        expect(result.tds_refund_eligible).toBe(0);
    });


    it('should compute FIFO capital gains for single buy + sell', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 6000000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.success).toBe(true);
        expect(result.lots_created).toBe(1);
        expect(result.sells_processed).toBe(1);
        expect(result.capital_gain_trades).toBe(1);
        expect(result.total_sale_consideration).toBe(6000000);
        expect(result.total_cost_of_acquisition).toBe(5000000);
        expect(result.gross_capital_gain).toBe(1000000);
        expect(result.taxable_gain).toBe(1000000);
        // 30% of 1000000 = 300000; 4% cess = 12000; total = 312000
        expect(result.gross_tax).toBe(300000);
        expect(result.cess).toBe(12000);
        expect(result.total_tax).toBe(312000);
        expect(result.unknown_lots_count).toBe(0);
    });


    it('should include fee in cost of acquisition (deductible per 115BBH)', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 10000, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 6000000, 5000, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        // Cost = 5000000 + 10000 (fee) = 5010000
        // Sale = 6000000 - 5000 (fee reduces sale consideration) = 5995000
        // Gain = 5995000 - 5010000 = 985000
        expect(result.total_cost_of_acquisition).toBe(5010000);
        expect(result.total_sale_consideration).toBe(5995000);
        expect(result.gross_capital_gain).toBe(985000);
    });


    it('should handle FIFO across multiple lots', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 0.5, 2500000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeBuy('B2', 'BTC', 0.5, 3000000, 0, '2024-06-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 0.8, 4800000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.lots_created).toBe(2);
        expect(result.sells_processed).toBe(1);
        // Sell 0.8 BTC should consume:
        //   0.5 from B1 (cost 5000000/unit) then 0.3 from B2 (cost 6000000/unit)
        // = 2 computation records
        expect(result.capital_gain_trades).toBe(2);
        expect(result.unknown_lots_count).toBe(0);

        // Cost = 0.5 * 5000000 + 0.3 * 6000000 = 2500000 + 1800000 = 4300000
        expect(result.total_cost_of_acquisition).toBe(4300000);
        // Sale = 0.8 * 6000000 = 4800000
        expect(result.total_sale_consideration).toBe(4800000);
        // Gain = 4800000 - 4300000 = 500000
        expect(result.gross_capital_gain).toBe(500000);
    });


    it('should create unknown lot when no matching buy exists', async () => {
        const txns = [
            // No BUY transactions, only a SELL
            makeSell('S1', 'BTC', 1, 6000000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.success).toBe(true);
        expect(result.unknown_lots_count).toBe(1);
        expect(result.has_data_gaps).toBe(true);
        // Cost = 0 (no known purchase)
        expect(result.total_cost_of_acquisition).toBe(0);
        // Sale consideration = 6000000
        expect(result.total_sale_consideration).toBe(6000000);
        // Gain = 6000000 (conservative — user owes max tax)
        expect(result.gross_capital_gain).toBe(6000000);
    });


    it('should NOT offset losses (Section 115BBH)', async () => {
        const txns = [
            // Loss trade: bought at 5M, sold at 3M
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 3000000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.gross_capital_gain).toBe(-2000000); // Loss
        expect(result.taxable_gain).toBe(0);               // Losses NOT deductible
        expect(result.gross_tax).toBe(0);
        expect(result.cess).toBe(0);
        expect(result.total_tax).toBe(0);
    });


    it('should calculate TDS credit and net payable', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 6000000, 0, 60000, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        // Gain = 1M, Tax = 300000 + 12000 = 312000
        expect(result.total_tax).toBe(312000);
        expect(result.total_tds_credit).toBe(60000);
        expect(result.net_payable).toBe(252000); // 312000 - 60000
        expect(result.tds_refund_eligible).toBe(0);
    });


    it('should calculate TDS refund when TDS > tax', async () => {
        const txns = [
            // Small gain, big TDS
            makeBuy('B1', 'BTC', 1, 5900000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 6000000, 0, 60000, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        // Gain = 100000, Tax = 30000 + 1200 = 31200
        expect(result.gross_capital_gain).toBe(100000);
        expect(result.total_tax).toBe(31200);
        expect(result.total_tds_credit).toBe(60000);
        expect(result.net_payable).toBe(0);
        expect(result.tds_refund_eligible).toBe(28800); // 60000 - 31200
    });


    it('should handle loss with TDS → full TDS refund', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 3000000, 0, 30000, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.gross_capital_gain).toBe(-2000000);
        expect(result.taxable_gain).toBe(0);
        expect(result.total_tax).toBe(0);
        expect(result.total_tds_credit).toBe(30000);
        expect(result.net_payable).toBe(0);
        expect(result.tds_refund_eligible).toBe(30000); // Full TDS refund
    });


    it('should handle multiple assets independently', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeBuy('B2', 'ETH', 10, 2000000, 0, '2024-05-15T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 0.5, 3000000, 0, 0, '2024-08-01T10:00:00Z', 'FY2024-25'),
            makeSell('S2', 'ETH', 5, 1200000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.lots_created).toBe(2);
        expect(result.sells_processed).toBe(2);
        expect(result.capital_gain_trades).toBe(2);

        // BTC: cost = 0.5 * 5000000 = 2500000, sale = 3000000, gain = 500000
        // ETH: cost = 5 * 200000 = 1000000, sale = 1200000, gain = 200000
        // Total gain = 700000
        expect(result.gross_capital_gain).toBe(700000);
        expect(result.taxable_gain).toBe(700000);
    });


    it('should handle partial lot exhaustion correctly', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 0.3, 1800000, 0, 0, '2024-08-01T10:00:00Z', 'FY2024-25'),
            makeSell('S2', 'BTC', 0.3, 1800000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.sells_processed).toBe(2);
        expect(result.capital_gain_trades).toBe(2);

        // Both sells consume from lot B1
        // S1: 0.3 * 5000000 = 1500000 cost, 1800000 sale → 300000 gain
        // S2: 0.3 * 5000000 = 1500000 cost, 1800000 sale → 300000 gain
        // Total gain = 600000
        expect(result.total_cost_of_acquisition).toBe(3000000);
        expect(result.total_sale_consideration).toBe(3600000);
        expect(result.gross_capital_gain).toBe(600000);

        // Lot should have 0.4 remaining
        const lots = (supabase._tables as any).crypto_tax_lots;
        const btcLots = lots.filter((l: any) => l.asset === 'BTC' && !l.is_exhausted);
        expect(btcLots.length).toBe(1);
        expect(Number(btcLots[0].remaining_qty)).toBeCloseTo(0.4, 5);
    });


    it('should use buys from previous FYs (cross-FY FIFO)', async () => {
        const txns = [
            // Bought in FY2023-24
            makeBuy('B1', 'BTC', 1, 4000000, 0, '2024-01-15T10:00:00Z', 'FY2023-24'),
            // Sold in FY2024-25
            makeSell('S1', 'BTC', 1, 6000000, 0, 0, '2024-06-15T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.lots_created).toBe(1); // From FY2023-24
        expect(result.sells_processed).toBe(1);
        expect(result.unknown_lots_count).toBe(0); // Should find the cross-FY lot
        expect(result.gross_capital_gain).toBe(2000000); // 6M - 4M
    });


    it('should handle only buys (no sells)', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeBuy('B2', 'ETH', 10, 2000000, 0, '2024-06-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        expect(result.lots_created).toBe(2);
        expect(result.sells_processed).toBe(0);
        expect(result.capital_gain_trades).toBe(0);
        expect(result.gross_capital_gain).toBe(0);
        expect(result.total_tax).toBe(0);
    });


    it('should reject invalid FY format', async () => {
        const supabase = createMockSupabase({ crypto_transactions: [] });
        const result = await computeCryptoTax(supabase as any, 'test-user', 'INVALID');

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Invalid financial year');
    });


    it('should recompute cleanly (idempotent)', async () => {
        const txns = [
            makeBuy('B1', 'BTC', 1, 5000000, 0, '2024-05-01T10:00:00Z', 'FY2024-25'),
            makeSell('S1', 'BTC', 1, 6000000, 0, 0, '2024-09-01T10:00:00Z', 'FY2024-25'),
        ];

        const supabase = createMockSupabase({ crypto_transactions: txns });

        // Run twice
        const result1 = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');
        const result2 = await computeCryptoTax(supabase as any, 'test-user', 'FY2024-25');

        // Same results both times
        expect(result1.gross_capital_gain).toBe(result2.gross_capital_gain);
        expect(result1.total_tax).toBe(result2.total_tax);
        expect(result2.capital_gain_trades).toBe(1);
    });
});
