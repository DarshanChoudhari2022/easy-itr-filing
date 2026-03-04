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
 *   Rule 1: taxable_gain per lot = MAX(gain, 0) — losses cannot offset gains
 *   Rule 2: Losses shown separately for disclosure, NOT subtracted
 *   Rule 3: Only cost_of_acquisition is deductible
 *   Tax: 30% flat + 4% cess = 31.2% effective
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// §115BBH constants
const TAX_RATE = 0.30;
const CESS_RATE = 0.04;

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
        const { data: allBuys, error: e1 } = await dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, price_per_unit, value_inr, fee_inr, trade_date, financial_year')
            .eq('user_id', userId)
            .eq('type', 'buy')
            .order('trade_date', { ascending: true }); // FIFO = oldest first

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
        const { data: sells, error: e2 } = await dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, price_per_unit, value_inr, fee_inr, tds_inr, trade_date')
            .eq('user_id', userId)
            .eq('type', 'sell')
            .eq('financial_year', financial_year)
            .order('trade_date', { ascending: true });

        if (e2) return res.status(500).json({ success: false, error: e2.message });

        // ═══════════════════════════════════════════════════════════════
        // STEP 2.5: CONSUME BUY LOTS WITH PRIOR-YEAR SELLS
        // A 2023 ACA sell must consume the 2023 ACA buy, otherwise
        // the 2024 ACA sell will incorrectly match against the 2023 buy.
        // ═══════════════════════════════════════════════════════════════
        const { data: priorSells, error: e3 } = await dbClient
            .from('crypto_trades')
            .select('id, asset, quantity, trade_date')
            .eq('user_id', userId)
            .eq('type', 'sell')
            .lt('financial_year', financial_year)
            .order('trade_date', { ascending: true });

        if (!e3 && priorSells && priorSells.length > 0) {
            console.log(`[Compute Tax] Consuming ${priorSells.length} prior-year sells from buy lots`);
            for (const ps of priorSells) {
                const queue = queues[ps.asset] || [];
                let qtyLeft = Number(ps.quantity);
                while (qtyLeft > 1e-8 && queue.length > 0) {
                    const lot = queue[0];
                    const matched = Math.min(lot._qty_remaining, qtyLeft);
                    lot._qty_remaining -= matched;
                    qtyLeft -= matched;
                    if (lot._qty_remaining < 1e-8) queue.shift();
                }
            }
        }

        if (!sells || sells.length === 0) {
            // No sells — still save a zero summary
            const emptySummary = buildSummary(userId, financial_year, assessmentYear, 0, 0, 0, 0, 0, 0, 0, 0, 0);

            // Check for income events
            const { data: incomeRows } = await dbClient
                .from('crypto_income_events')
                .select('income_type, value_inr')
                .eq('user_id', userId)
                .eq('financial_year', financial_year);

            const stakingIncome = sumIncome(incomeRows, 'staking');
            const rewardsIncome = sumIncome(incomeRows, 'reward') + sumIncome(incomeRows, 'airdrop');
            const totalOtherIncome = stakingIncome + rewardsIncome;

            if (totalOtherIncome > 0) {
                const totalTaxable = totalOtherIncome;
                const grossTax = totalTaxable * TAX_RATE;
                const cess = grossTax * CESS_RATE;
                const totalTaxLiability = grossTax + cess;

                const summary = buildSummary(
                    userId, financial_year, assessmentYear,
                    0, 0, 0, 0, 0, 0,
                    stakingIncome, rewardsIncome, 0
                );

                await upsertSummary(dbClient, summary);
                return res.status(200).json({ success: true, summary, unmatched_sells: [], data_quality: 'clean' });
            }

            return res.status(200).json({
                success: true,
                message: 'No sell trades found for this financial year.',
                financial_year,
                summary: emptySummary,
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: FIFO matching
        // ═══════════════════════════════════════════════════════════════
        const taxLots: any[] = [];
        const unmatchedSells: any[] = [];
        let totSale = 0, totCost = 0, totTaxable = 0, totLosses = 0, totTDS = 0;

        for (const sell of sells) {
            const queue = queues[sell.asset] || [];
            let qtyLeft = Number(sell.quantity);
            const sellQtyFull = Number(sell.quantity);
            const sellValFull = Number(sell.value_inr);
            const sellFeeFull = Number(sell.fee_inr || 0);
            totTDS += Number(sell.tds_inr || 0);

            while (qtyLeft > 1e-8 && queue.length > 0) {
                const lot = queue[0];
                const matched = Math.min(lot._qty_remaining, qtyLeft);

                // Proportional cost (using total value, not price × qty, for precision)
                const lotFrac = matched / lot.quantity;
                const costInr = lotFrac * (lot.value_inr + lot.fee_inr);

                // Proportional proceeds (fee subtracted; TDS is NOT — it's a credit)
                const sellFrac = matched / sellQtyFull;
                const proceedsInr = sellFrac * (sellValFull - sellFeeFull);

                const gainInr = proceedsInr - costInr;
                const taxableGainInr = Math.max(gainInr, 0); // §115BBH: losses = ₹0

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
            if (qtyLeft > 1e-4) {
                // Unmatched sold qty — cost basis is ₹0
                const sellFrac = qtyLeft / sellQtyFull;
                const proceedsInr = sellFrac * (sellValFull - sellFeeFull);

                taxLots.push({
                    user_id: userId,
                    financial_year,
                    asset: sell.asset,
                    sell_trade_id: sell.id,
                    buy_trade_id: null,
                    qty_matched: parseFloat(qtyLeft.toFixed(10)),
                    buy_date: null,
                    sell_date: sell.trade_date,
                    cost_inr: 0,
                    proceeds_inr: round2(proceedsInr),
                    gain_inr: round2(proceedsInr),
                    taxable_gain_inr: round2(Math.max(proceedsInr, 0)),
                });

                totSale += proceedsInr;
                totTaxable += Math.max(proceedsInr, 0);

                unmatchedSells.push({
                    asset: sell.asset,
                    sell_date: sell.trade_date,
                    unmatched_qty: parseFloat(qtyLeft.toFixed(6)),
                    note: `No buy lot found for ${qtyLeft.toFixed(6)} ${sell.asset}. Upload All-Time Order History CSV to fix.`,
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Fetch other income for this FY
        // ═══════════════════════════════════════════════════════════════
        const { data: incomeRows } = await dbClient
            .from('crypto_income_events')
            .select('income_type, value_inr')
            .eq('user_id', userId)
            .eq('financial_year', financial_year);

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
        await dbClient.from('crypto_tax_lots').delete().match({ user_id: userId, financial_year });

        // Insert new tax lots in batches
        if (taxLots.length > 0) {
            const BATCH = 500;
            for (let i = 0; i < taxLots.length; i += BATCH) {
                const batch = taxLots.slice(i, i + BATCH);
                const { error: lotErr } = await dbClient.from('crypto_tax_lots').insert(batch);
                if (lotErr) {
                    console.error('[Compute Tax] Tax lot insert error:', lotErr);
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
    const { error } = await supabase
        .from('crypto_tax_summary')
        .upsert(summary, { onConflict: 'user_id,financial_year' });
    if (error) {
        console.error('[Compute Tax] Summary upsert error:', error);
    }
}
