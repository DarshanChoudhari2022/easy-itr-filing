/**
 * Vercel Serverless Function — FIFO Tax Computation Engine
 *
 * POST /api/crypto/compute-tax
 *   Body: { financial_year: "FY2024-25" }
 *   Auth: Bearer JWT
 *
 * Self-contained FIFO engine. No imports from src/.
 * 
 * §115BBH Rules enforced:
 *   Rule 1: taxable_gain per disposal = MAX(proceeds - acquisition costs, 0)
 *   Rule 2: Losses shown separately for disclosure, NOT subtracted
 *   Rule 3: Only cost_of_acquisition is deductible
 *   Tax: 30% flat + 4% cess = 31.2% effective
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// §115BBH constants
const TAX_RATE = 0.30;
const CESS_RATE = 0.04;

async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
        const result = await page(from, from + 999);
        if (result.error) return { data: null, error: result.error };
        rows.push(...(result.data || []));
        if (!result.data || result.data.length < 1000) return { data: rows, error: null };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // ── Auth ──
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }
        const token = authHeader.slice(7);

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // User-scoped client for RLS compliance
        const dbClient = supabaseServiceKey
            ? supabase
            : createClient(supabaseUrl, supabaseAnonKey, {
                global: { headers: { Authorization: `Bearer ${token}` } },
            });

        // ── Validate body ──
        const { financial_year } = req.body || {};
        if (!financial_year || !/^FY\d{4}-\d{2}$/.test(financial_year)) {
            return res.status(400).json({
                success: false,
                error: 'financial_year must be in format FY2024-25',
            });
        }

        const userId = user.id;

        // Derive Assessment Year
        const startYr = parseInt(financial_year.replace('FY', '').split('-')[0]);
        const assessmentYear = `AY ${startYr + 1}-${String(startYr + 2).slice(-2)}`;

        console.log(`[Compute Tax] Starting for user ${userId}, ${financial_year}`);
        const t0 = Date.now();

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Load ALL buy lots for this user (ALL years)
        // A 2021 ADA buy is needed to price a 2024 ADA sell.
        // ═══════════════════════════════════════════════════════════════
        const { data: allBuys, error: e1 } = await readAllRows((from, to) => dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, price_per_unit, value_inr, fee_inr, trade_date, financial_year')
            .eq('user_id', userId)
            .eq('type', 'buy')
            .order('trade_date', { ascending: true }).order('id', { ascending: true }).range(from, to));

        if (e1) return res.status(500).json({ success: false, error: e1.message });

        // Build per-asset queues of buy lots with mutable qty_remaining
        const queues: Record<string, {
            id: string;
            asset: string;
            quantity: number;
            price_per_unit: number;
            value_inr: number;
            fee_inr: number;
            trade_date: string;
            _qty_remaining: number;
        }[]> = {};

        for (const lot of (allBuys || [])) {
            const asset = lot.asset;
            if (!queues[asset]) queues[asset] = [];
            queues[asset].push({
                id: lot.id,
                asset,
                quantity: Number(lot.quantity),
                price_per_unit: Number(lot.price_per_unit),
                value_inr: Number(lot.value_inr),
                fee_inr: Number(lot.fee_inr || 0),
                trade_date: lot.trade_date,
                _qty_remaining: Number(lot.quantity),
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Load sell events for the requested FY only
        // ═══════════════════════════════════════════════════════════════
        const { data: sells, error: e2 } = await readAllRows((from, to) => dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, price_per_unit, value_inr, fee_inr, tds_inr, trade_date')
            .eq('user_id', userId)
            .eq('type', 'sell')
            .eq('financial_year', financial_year)
            .order('trade_date', { ascending: true }).order('id', { ascending: true }).range(from, to));

        if (e2) return res.status(500).json({ success: false, error: e2.message });

        // ═══════════════════════════════════════════════════════════════
        // STEP 2.5: CONSUME BUY LOTS WITH PRIOR-YEAR SELLS
        // A 2023 ACA sell must consume the 2023 ACA buy, otherwise
        // the 2024 ACA sell will incorrectly match against the 2023 buy.
        // ═══════════════════════════════════════════════════════════════
        const { data: priorSells, error: e3 } = await readAllRows((from, to) => dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, trade_date')
            .eq('user_id', userId)
            .eq('type', 'sell')
            .lt('financial_year', financial_year)
            .order('trade_date', { ascending: true }).order('id', { ascending: true }).range(from, to));

        if (e3) return res.status(500).json({ success: false, error: 'Could not load prior-year disposals. Retry before computing tax.' });
        const historyGaps: { asset: string; date: string; quantity: number; period: string }[] = [];
        if (priorSells && priorSells.length > 0) {
            console.log(`[Compute Tax] Consuming ${priorSells.length} prior-year sells from buy lots`);
            for (const ps of priorSells) {
                const queue = queues[ps.asset] || [];
                let qtyLeft = Number(ps.quantity);
                while (qtyLeft > 1e-8 && queue.length > 0) {
                    const lot = queue[0];
                    if (new Date(lot.trade_date).getTime() > new Date(ps.trade_date).getTime()) break;
                    const matched = Math.min(lot._qty_remaining, qtyLeft);
                    lot._qty_remaining -= matched;
                    qtyLeft -= matched;
                    if (lot._qty_remaining < 1e-8) queue.shift();
                }
                if (qtyLeft > 1e-8) historyGaps.push({ asset: ps.asset, date: ps.trade_date, quantity: qtyLeft, period: 'earlier year' });
            }
        }

        if (!sells || sells.length === 0) {
            return res.status(422).json({ success: false, error: 'No disposals found for ' + financial_year + '. Check the selected year and import history before generating a report.' });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: FIFO matching
        // ═══════════════════════════════════════════════════════════════
        const taxLots: any[] = [];
        const unmatchedSells: any[] = [];
        let totSale = 0, totCost = 0, totTaxable = 0, totLosses = 0, totTDS = 0;

        for (const sell of sells) {
            const firstLot = taxLots.length;
            const queue = queues[sell.asset] || [];
            let qtyLeft = Number(sell.quantity);
            const sellQtyFull = Number(sell.quantity);
            const sellValFull = Number(sell.value_inr);
            const sellFeeFull = Number(sell.fee_inr || 0);
            totTDS += Number(sell.tds_inr || 0);

            while (qtyLeft > 1e-8 && queue.length > 0) {
                const lot = queue[0];
                if (new Date(lot.trade_date).getTime() > new Date(sell.trade_date).getTime()) break;
                const matched = Math.min(lot._qty_remaining, qtyLeft);

                // Proportional cost (using total value, not price × qty, for precision)
                const lotFrac = matched / lot.quantity;
                const costInr = lotFrac * lot.value_inr;

                // Exchange charges do not reduce VDA sale consideration.
                const sellFrac = matched / sellQtyFull;
                const proceedsInr = sellFrac * sellValFull;

                const gainInr = proceedsInr - costInr;
                const taxableGainInr = Math.max(gainInr, 0); // Allocated across the disposal below.

                taxLots.push({
                    user_id: userId,
                    financial_year,
                    asset: sell.asset,
                    sell_trade_id: sell.id,
                    buy_trade_id: lot.id,
                    qty_matched: parseFloat(matched.toFixed(10)),
                    buy_date: lot.trade_date,
                    sell_date: sell.trade_date,
                    cost_inr: round2(costInr),
                    proceeds_inr: round2(proceedsInr),
                    gain_inr: round2(gainInr),
                    taxable_gain_inr: round2(taxableGainInr),
                });

                totSale += proceedsInr;
                totCost += costInr;
                totTaxable += taxableGainInr;
                if (gainInr < 0) totLosses += Math.abs(gainInr);

                lot._qty_remaining -= matched;
                qtyLeft -= matched;
                if (lot._qty_remaining < 1e-8) queue.shift();
            }

            // Track unmatched quantity
            if (qtyLeft > 1e-8) {
                historyGaps.push({ asset: sell.asset, date: sell.trade_date, quantity: qtyLeft, period: financial_year });
            }
            // The loss floor applies to the disposal, not individual acquisition slices.
            const saleLots = taxLots.slice(firstLot);
            const gain = saleLots.reduce((sum, lot) => sum + lot.gain_inr, 0);
            const positive = saleLots.reduce((sum, lot) => sum + Math.max(lot.gain_inr, 0), 0);
            totTaxable -= positive;
            totLosses -= saleLots.reduce((sum, lot) => sum + Math.max(-lot.gain_inr, 0), 0);
            totTaxable += Math.max(gain, 0);
            totLosses += Math.max(-gain, 0);
            let allocated = 0;
            const taxable = round2(Math.max(gain, 0));
            const profitable = saleLots.filter(lot => lot.gain_inr > 0);
            saleLots.forEach(lot => { lot.taxable_gain_inr = 0; });
            profitable.forEach((lot, i) => {
                lot.taxable_gain_inr = i === profitable.length - 1 ? round2(taxable - allocated) : round2(taxable * lot.gain_inr / positive);
                allocated += lot.taxable_gain_inr;
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Fetch other income for this FY
        // ═══════════════════════════════════════════════════════════════
        if (historyGaps.length) return res.status(422).json({ success: false, gaps: historyGaps,
            error: 'Missing acquisition history: ' + historyGaps.map(g => g.quantity.toPrecision(8) + ' ' + g.asset + ' (' + g.date.slice(0, 10) + ')').join('; ') + '. Import purchase, deposit and conversion records; costs cannot be assumed.' });
        const { data: incomeRows, error: incomeError } = await dbClient
            .from('crypto_income_events')
            .select('income_type, value_inr')
            .eq('user_id', userId)
            .eq('financial_year', financial_year);

        if (incomeError) throw new Error('Could not load other crypto income: ' + incomeError.message);
        if (incomeRows?.length) return res.status(422).json({ success: false, error: 'Reward/staking receipts require income classification and acquisition-basis review before a filing report can be generated.' });
        const { data: tdsRows, error: tdsError } = await readAllRows((from, to) => dbClient
            .from('tds_records').select('tds_amount_inr').eq('user_id', userId)
            .eq('financial_year', financial_year).eq('source', 'tds_csv')
            .order('id', { ascending: true }).range(from, to));
        if (tdsError) throw new Error('Could not load TDS evidence: ' + tdsError.message);
        if (tdsRows?.length) {
            const certificateTotal = tdsRows.reduce((sum, row) => sum + Number(row.tds_amount_inr), 0);
            if (Math.abs(certificateTotal - totTDS) > 1) return res.status(422).json({ success: false,
                error: 'TDS reconciliation required: certificate INR ' + round2(certificateTotal) + ', trades INR ' + round2(totTDS) + '. Review missing or duplicate transactions.' });
            totTDS = certificateTotal;
        }
        const stakingIncome = sumIncome(incomeRows, 'staking');
        const rewardsIncome = sumIncome(incomeRows, 'reward') + sumIncome(incomeRows, 'airdrop');
        const totalOtherIncome = stakingIncome + rewardsIncome;

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Tax computation (§115BBH)
        // ═══════════════════════════════════════════════════════════════
        const totalTaxable = totTaxable + totalOtherIncome;
        const grossTax = totalTaxable * TAX_RATE;
        const cess = grossTax * CESS_RATE;
        const totalTaxLiability = grossTax + cess;
        const netPayable = Math.max(totalTaxLiability - totTDS, 0);
        const refundEligible = Math.max(totTDS - totalTaxLiability, 0);

        // ═══════════════════════════════════════════════════════════════
        // STEP 6: Persist results
        // ═══════════════════════════════════════════════════════════════

        // Clear old tax lots for this user + FY
        const { error: deleteError } = await dbClient.from('crypto_tax_lots').delete().match({ user_id: userId, financial_year });
        if (deleteError) throw new Error('Could not replace previous tax lots: ' + deleteError.message);

        // Insert new tax lots in batches
        if (taxLots.length > 0) {
            const BATCH = 500;
            for (let i = 0; i < taxLots.length; i += BATCH) {
                const batch = taxLots.slice(i, i + BATCH);
                const { error: lotErr } = await dbClient.from('crypto_tax_lots').insert(batch);
                if (lotErr) {
                    throw new Error('Could not save tax lots: ' + lotErr.message);
                }
            }
        }

        // Upsert summary
        const summary = {
            user_id: userId,
            financial_year,
            assessment_year: assessmentYear,
            num_sell_events: sells.length,
            num_fifo_lots: taxLots.length,
            sale_consideration: round2(totSale),
            cost_of_acquisition: round2(totCost),
            taxable_capital_gains: round2(totTaxable),
            gross_losses: round2(totLosses),
            staking_income: round2(stakingIncome),
            rewards_income: round2(rewardsIncome),
            total_other_income: round2(totalOtherIncome),
            tds_credit: round2(totTDS),
            total_taxable: round2(totalTaxable),
            gross_tax: round2(grossTax),
            cess: round2(cess),
            total_tax_liability: round2(totalTaxLiability),
            net_tax_payable: round2(netPayable),
            refund_eligible: round2(refundEligible),
            computed_at: new Date().toISOString(),
        };

        await upsertSummary(dbClient, summary);

        const elapsed = Date.now() - t0;
        console.log(`[Compute Tax] Done in ${elapsed}ms. ${taxLots.length} lots, tax ₹${round2(totalTaxLiability)}`);

        return res.status(200).json({
            success: true,
            summary,
            unmatched_sells: unmatchedSells,
            data_quality: unmatchedSells.length === 0 ? 'clean' : 'incomplete — see unmatched_sells',
        });
    } catch (err) {
        console.error('[Compute Tax] Unhandled error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: (err as Error).message,
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function sumIncome(rows: any[] | null, type: string): number {
    return (rows || [])
        .filter(r => r.income_type === type)
        .reduce((s, r) => s + (Number(r.value_inr) || 0), 0);
}

function buildSummary(
    userId: string, fy: string, ay: string,
    numSells: number, numLots: number,
    sale: number, cost: number, taxableGains: number, losses: number,
    staking: number, rewards: number, tds: number,
) {
    const totalOther = staking + rewards;
    const totalTaxable = taxableGains + totalOther;
    const grossTax = totalTaxable * TAX_RATE;
    const cess = grossTax * CESS_RATE;
    const totalTax = grossTax + cess;
    const netPayable = Math.max(totalTax - tds, 0);
    const refund = Math.max(tds - totalTax, 0);

    return {
        user_id: userId, financial_year: fy, assessment_year: ay,
        num_sell_events: numSells, num_fifo_lots: numLots,
        sale_consideration: round2(sale), cost_of_acquisition: round2(cost),
        taxable_capital_gains: round2(taxableGains), gross_losses: round2(losses),
        staking_income: round2(staking), rewards_income: round2(rewards),
        total_other_income: round2(totalOther), tds_credit: round2(tds),
        total_taxable: round2(totalTaxable), gross_tax: round2(grossTax),
        cess: round2(cess), total_tax_liability: round2(totalTax),
        net_tax_payable: round2(netPayable), refund_eligible: round2(refund),
        computed_at: new Date().toISOString(),
    };
}

async function upsertSummary(supabase: SupabaseClient, summary: any) {
    // Delete existing summary for this FY to avoid unique constraint issues
    await supabase
        .from('crypto_tax_summary')
        .delete()
        .match({ user_id: summary.user_id, financial_year: summary.financial_year });

    const { error } = await supabase
        .from('crypto_tax_summary')
        .insert(summary);

    if (error) {
        console.error('[Compute Tax] Summary insert error:', error);
        throw new Error(`Failed to save computed tax: ${error.message}`);
    }
}
