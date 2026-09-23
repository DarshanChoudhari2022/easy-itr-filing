import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/crypto/compute-tax';

const db = vi.hoisted(() => ({ buys: [] as Record<string, unknown>[], sells: [] as Record<string, unknown>[], priorError: false, writes: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) },
    from: () => {
        let type = '', prior = false;
        const query = {
            select: () => query,
            eq: (key: string, value: string) => { if (key === 'type') type = value; return query; },
            lt: () => { prior = true; return query; },
            order: () => query,
            range: async (from: number, to: number) => ({ data: (type === 'buy' ? db.buys : prior ? [] : db.sells).slice(from, to + 1), error: prior && db.priorError ? { message: 'History unavailable' } : null }),
            upsert: db.writes, insert: db.writes, delete: db.writes,
        };
        return query;
    },
}) }));

describe('server FIFO filing safeguards', () => {
    beforeEach(() => { db.buys = []; db.sells = [{ id: 'sell', asset: 'USDT', quantity: 1, value_inr: 100, trade_date: '2025-06-01T00:00:00Z' }]; db.priorError = false; db.writes.mockClear(); });
    async function run() {
        const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
        await handler({ method: 'POST', headers: { authorization: 'Bearer fixture-token' }, body: { financial_year: 'FY2025-26' } } as VercelRequest, response as unknown as VercelResponse);
        return response;
    }
    it('does not invent stablecoin acquisition costs', async () => {
        const r = await run();
        expect(r.status).toHaveBeenCalledWith(422);
        expect(db.writes).not.toHaveBeenCalled();
    });
    it('never matches a sale to a future purchase', async () => {
        db.buys = [{ id: 'buy', asset: 'USDT', quantity: 1, value_inr: 80, trade_date: '2025-07-01T00:00:00Z' }];
        expect((await run()).status).toHaveBeenCalledWith(422);
        expect(db.writes).not.toHaveBeenCalled();
    });
    it('refuses to compute when prior-year disposals could not be loaded', async () => {
        db.priorError = true;
        expect((await run()).status).toHaveBeenCalledWith(500);
        expect(db.writes).not.toHaveBeenCalled();
    });
});
