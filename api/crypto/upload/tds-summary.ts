import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { authenticate, setCORS } from '../_shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    try {
        const auth = await authenticate(req, res);
        if (!auth) return;
        const csv = typeof req.body === 'string' ? req.body : req.body?.csv;
        if (typeof csv !== 'string') return res.status(400).json({ success: false, error: 'CSV is required.' });
        const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        const header = parseCSVRow(lines[0] || '').map(h => h.toLowerCase());
        const columns = ['created at', 'order type', 'side', 'crypto pair / token name', 'order value', 'tds (in inr)'];
        if (columns.some(c => !header.includes(c))) return res.status(400).json({ success: false, error: 'Use the CoinDCX TDS Summary CSV with INR amounts.' });
        const records: Record<string, unknown>[] = [];
        const { error: staleError } = await auth.supabase.from('crypto_tax_summary').delete().eq('user_id', auth.userId);
        if (staleError) throw new Error('Could not invalidate the previous report: ' + staleError.message);
        const errors: { row: number; issue: string }[] = [];
        const occurrences = new Map<string, number>();
        for (let i = 1; i < lines.length; i++) {
            const cells = parseCSVRow(lines[i]);
            const get = (name: string) => cells[header.indexOf(name)] || '';
            // The total footer is not another deduction.
            if (!get('created at') && cells.some(c => c.toLowerCase() === 'total')) continue;
            const date = new Date(get('created at'));
            const tds = Number(get('tds (in inr)').replace(/,/g, ''));
            const consideration = get('order value').match(/^([\d.,]+)\s+(\w+)$/);
            const pair = get('crypto pair / token name').toUpperCase();
            if (!Number.isFinite(date.getTime()) || !Number.isFinite(tds) || tds < 0 || !pair || !consideration) {
                errors.push({ row: i + 1, issue: 'Invalid date, INR deduction, asset or order value.' });
                continue;
            }
            const india = new Date(date.getTime() + 330 * 60000);
            const start = india.getUTCFullYear() - (india.getUTCMonth() < 3 ? 1 : 0);
            const fy = 'FY' + start + '-' + String(start + 1).slice(-2);
            if (req.body?.financial_year && req.body.financial_year !== fy) {
                errors.push({ row: i + 1, issue: 'Certificate contains ' + fy + ', but ' + req.body.financial_year + ' is selected.' });
                continue;
            }
            const raw = Object.fromEntries(header.map((h, index) => [h, cells[index] || '']));
            const canonical = JSON.stringify(raw);
            const ordinal = (occurrences.get(canonical) || 0) + 1;
            occurrences.set(canonical, ordinal);
            const hash = createHash('sha256').update(canonical + ':' + ordinal).digest('hex');
            records.push({
                user_id: auth.userId, tds_date: date.toISOString(), financial_year: fy,
                section: '194S', exchange: 'CoinDCX', source: 'tds_csv',
                asset_symbol: get('order type').toLowerCase() === 'insta' ? pair : pair.replace(/(?:USDT|USDC|INR|BTC|ETH)$/, ''),
                order_type: get('order type'), tds_amount_inr: tds,
                gross_consideration: consideration[2] === 'INR' ? Number(consideration[1].replace(/,/g, '')) : 0,
                content_hash: hash, raw_data: raw,
            });
        }
        if (errors.length || !records.length) return res.status(422).json({ success: false, errors, message: errors[0]?.issue || 'No deduction records found.' });
        const { error } = await auth.supabase.from('tds_records').upsert(records, { onConflict: 'user_id,content_hash' });
        if (error) throw new Error('Could not save TDS evidence: ' + error.message);
        const total = records.reduce((sum, r) => sum + Number(r.tds_amount_inr), 0);
        return res.status(200).json({ success: true, errors: [], tds_records: records.length,
            total_tds_credit: Math.round(total * 100) / 100,
            message: records.length + ' TDS entries saved. Reconcile with Form 26AS before claiming credit.' });
    } catch (e) {
        return res.status(500).json({ success: false, error: (e as Error).message });
    }
}

function parseCSVRow(line: string): string[] {
    const cells: string[] = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
            else quoted = !quoted;
        } else if (line[i] === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
        else cell += line[i];
    }
    cells.push(cell.trim());
    return cells;
}
