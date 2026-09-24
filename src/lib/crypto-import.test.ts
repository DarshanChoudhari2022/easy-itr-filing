import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import orderHandler from '../../api/crypto/upload/order-history';
import instaHandler from '../../api/crypto/upload/insta-history';
import tdsHandler from '../../api/crypto/upload/tds-summary';
import computeHandler from '../../api/crypto/compute-tax';

const store = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]>, failWrites: false }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'fixture' } }, error: null }) },
  from: (table: string) => {
    const filters: ((r: Record<string, any>) => boolean)[] = [];
    const sorts: string[] = [];
    let action = 'read', payload: Record<string, any>[] = [], bounds = [0, Infinity];
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return query; },
      lt: (k: string, v: string) => { filters.push(r => r[k] < v); return query; },
      match: (v: Record<string, unknown>) => { Object.entries(v).forEach(([k, val]) => filters.push(r => r[k] === val)); return query; },
      order: (k: string) => { sorts.push(k); return query; },
      range: (a: number, b: number) => { bounds = [a, b]; return query; },
      insert: (v: Record<string, any>[] | Record<string, any>) => { action = 'insert'; payload = Array.isArray(v) ? v : [v]; return query; },
      upsert: (v: Record<string, any>[]) => { action = 'upsert'; payload = v; return query; },
      update: (v: Record<string, any>) => { action = 'update'; payload = [v]; return query; },
      delete: () => { action = 'delete'; return query; },
      then: (resolve: (v: unknown) => unknown) => {
        const rows = store.tables[table] ||= [];
        if (action !== 'read' && store.failWrites) return Promise.resolve({ data: null, error: { message: 'Write failed' } }).then(resolve);
        if (action === 'insert' || action === 'upsert') {
          for (const item of payload) {
            const previous = rows.find(r => item.content_hash ? r.content_hash === item.content_hash : item.external_id && r.external_id === item.external_id && r.csv_source === item.csv_source);
            if (previous) Object.assign(previous, item);
            else rows.push({ id: `${table}-${rows.length}`, ...item });
          }
        }
        let data = rows.filter(r => filters.every(f => f(r)));
        if (action === 'update') data.forEach(r => Object.assign(r, payload[0]));
        if (action === 'delete') store.tables[table] = rows.filter(r => !data.includes(r));
        data = [...data].sort((a, b) => { for (const k of sorts) { if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1; } return 0; }).slice(bounds[0], bounds[1] + 1);
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  },
}) }));

async function invoke(handler: typeof orderHandler, body: Record<string, unknown>) {
  const response = { code: 200, body: {} as any, setHeader: vi.fn(), status(n: number) { this.code = n; return this; }, json(v: unknown) { this.body = v; return this; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer fixture' }, body } as VercelRequest, response as unknown as VercelResponse);
  return response;
}

beforeEach(() => { store.tables = {}; store.failWrites = false; });
const header = 'Order ID,Pair,Total Quantity,Remaining Quantity,Price Per Unit,Avg Price,Fee Amount,Total Tds INR,Side,Status,Created At,Updated At';
it('uses executed average price instead of limit price', async () => {
  await invoke(orderHandler, { csv: `${header}\n1,I-ADA_INR,2,0,100,90,0,0,buy,filled,2025-04-02 00:00:00 UTC,2025-04-02 00:00:00 UTC` });
  expect(store.tables.crypto_trades[0].value_inr).toBe(180);
});
it('does not mark failed imports as successful', async () => {
  store.failWrites = true;
  const r = await invoke(orderHandler, { csv: `${header}\n1,I-ADA_INR,2,0,100,100,0,0,buy,filled,2025-04-02 00:00:00 UTC,2025-04-02 00:00:00 UTC` });
  expect(r.body.success).toBe(false);
});

it('rejects ambiguous cancelled quantities without importing a partial file', async () => {
  const r = await invoke(orderHandler, { csv: header + '\n1,I-ADA_INR,100,0,90,90,0,1,sell,partially_cancelled,2025-04-02 00:00:00 UTC,2025-04-02 00:00:00 UTC' });
  expect(r.code).toBe(422);
  expect(store.tables.crypto_trades).toBeUndefined();
});

const certificate = 'Created At,Order Type,Side,Crypto Pair / Token name,Order Value,TDS deducted,TDS (In INR)\n2025-05-01 10:00:00 +0530,Spot,Sell,ADAINR,100 INR,1 INR,1\n,,,,,Total,1';
it('ignores the total footer and preserves certificate evidence on repeat uploads', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await invoke(tdsHandler, { csv: certificate, financial_year: 'FY2025-26' });
    expect(r.body.total_tds_credit).toBe(1);
    expect(r.body.tds_records).toBe(1);
  }
  expect(store.tables.tds_records).toHaveLength(1);
  expect(store.tables.tds_records[0].asset_symbol).toBe('ADA');
});
it('rejects a certificate for a different selected year before writing', async () => {
  expect((await invoke(tdsHandler, { csv: certificate, financial_year: 'FY2024-25' })).code).toBe(422);
  expect(store.tables.tds_records).toBeUndefined();
});
it('computes FIFO across years and floors the loss once per disposal', async () => {
  store.tables.crypto_trades = [
    { id: 'b1', user_id: 'fixture', type: 'buy', asset: 'ADA', quantity: 1, value_inr: 50, trade_date: '2024-01-01T00:00:00Z', financial_year: 'FY2023-24' },
    { id: 'b2', user_id: 'fixture', type: 'buy', asset: 'ADA', quantity: 1, value_inr: 150, trade_date: '2025-01-01T00:00:00Z', financial_year: 'FY2024-25' },
    { id: 's1', user_id: 'fixture', type: 'sell', asset: 'ADA', quantity: 2, value_inr: 240, tds_inr: 2.4, trade_date: '2025-05-01T00:00:00Z', financial_year: 'FY2025-26' },
  ];
  const r = await invoke(computeHandler, { financial_year: 'FY2025-26' });
  expect(r.code).toBe(200);
  expect(r.body.summary.taxable_capital_gains).toBe(40);
  expect(r.body.summary.total_tax_liability).toBe(12.48);
  expect(r.body.summary.net_tax_payable).toBe(10.08);
});

it.runIf(Boolean(process.env.CRYPTO_AUDIT_DIR))('audits private CSVs locally through production handlers', async () => {
  const dir = process.env.CRYPTO_AUDIT_DIR!;
  for (const [name, handler] of [['Order_history.csv', orderHandler], ['Insta_history.csv', instaHandler], ['TDS_SUMMARY-1-4-2025-TO-31-3-2026.csv', tdsHandler]] as const) {
    const r = await invoke(handler, { csv: readFileSync(join(dir, name), 'utf8'), financial_year: 'FY2025-26' });
    console.log('CSV AUDIT', name, JSON.stringify(r.body));
  }
  const result = await invoke(computeHandler, { financial_year: 'FY2025-26' });
  console.log('COMPUTATION AUDIT', result.code, JSON.stringify(result.body));
  expect([200, 422]).toContain(result.code);
});
