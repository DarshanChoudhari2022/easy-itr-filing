/**
 * TaxMitra — FIFO Capital Gains Tax Engine
 * ==========================================
 * Implements Indian crypto tax calculation per Section 115BBH.
 *
 * Key rules:
 *   - 30% flat tax on VDA (crypto) gains
 *   - Losses CANNOT offset gains or other income
 *   - Losses CANNOT be carried forward
 *   - Only deduction: Cost of Acquisition (purchase price + fee)
 *   - TDS deducted under Sec 194S → credit against tax payable
 *   - FIFO: First In, First Out lot matching
 *
 * This module is a pure computation engine. It accepts a Supabase client
 * and user context, then runs the 4-step computation pipeline.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────

/** Financial year date range */
interface FYDateRange {
    start: string;  // ISO date: e.g. '2024-04-01T00:00:00+05:30'
    end: string;    // ISO date: e.g. '2025-03-31T23:59:59+05:30'
}

/** A BUY transaction from crypto_transactions */
interface BuyTransaction {
    id: string;
    asset: string;
    quantity: number;
    total_inr: number;
    fee_inr: number;
    timestamp: string;
    financial_year: string;
}

/** A SELL transaction from crypto_transactions */
interface SellTransaction {
    id: string;
    asset: string;
    quantity: number;
    total_inr: number;
    fee_inr: number;
    tds_inr: number;
    timestamp: string;
    financial_year: string;
}

/** A FIFO lot (buy-side inventory) */
interface TaxLot {
    id: string;
    txn_id: string;
    asset: string;
    original_qty: number;
    remaining_qty: number;
    cost_per_unit: number;
    purchase_date: string;
    financial_year: string;
    is_exhausted: boolean;
}

/** A sell↔lot computation match */
interface TaxComputation {
    user_id: string;
    sell_txn_id: string;
    lot_id: string | null;
    qty_matched: number;
    cost_of_acquisition: number;
    sale_consideration: number;
    capital_gain: number;
    tds_attributed: number;
    financial_year: string;
    gross_tax: number;
    cess: number;
    total_tax: number;
    is_unknown_lot: boolean;
}

/** Final tax summary result */
export interface TaxComputationResult {
    success: boolean;
    financial_year: string;
    capital_gain_trades: number;
    total_sale_consideration: number;
    total_cost_of_acquisition: number;
    gross_capital_gain: number;
    taxable_gain: number;
    gross_tax: number;
    cess: number;
    total_tax: number;
    total_tds_credit: number;
    net_payable: number;
    tds_refund_eligible: number;
    unknown_lots_count: number;
    has_data_gaps: boolean;
    // Detailed breakdown
    lots_created: number;
    sells_processed: number;
    computations_created: number;
    errors: string[];
}

// ─── Constants ───────────────────────────────────────────────────────

const TAX_RATE = 0.30;        // 30% flat tax on VDA gains
const CESS_RATE = 0.04;       // 4% Health & Education Cess
const BATCH_SIZE = 500;

// ─── Main Entry Point ────────────────────────────────────────────────

/**
 * Run the full FIFO tax computation for a user + financial year.
 *
 * Steps:
 *   1. Clear previous computation
 *   2. Create tax lots from BUY transactions
 *   3. Process SELL transactions with FIFO matching
 *   4. Compute tax summary
 */
export async function computeCryptoTax(
    supabase: SupabaseClient,
    userId: string,
    financialYear: string,
): Promise<TaxComputationResult> {
    const errors: string[] = [];

    // Derive FY date range
    const fyRange = parseFYDateRange(financialYear);
    if (!fyRange) {
        return errorResult(financialYear, [`Invalid financial year format: ${financialYear}`]);
    }

    console.log(`[FIFO] Starting computation for ${financialYear} (${fyRange.start} → ${fyRange.end})`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Clear previous computation
    // ═══════════════════════════════════════════════════════════════════
    console.log('[FIFO] Step 1: Clearing previous computation...');

    const { error: delCompErr } = await supabase
        .from('crypto_tax_computations')
        .delete()
        .eq('user_id', userId)
        .eq('financial_year', financialYear);

    if (delCompErr) {
        errors.push(`Failed to clear computations: ${delCompErr.message}`);
    }

    const { error: delLotsErr } = await supabase
        .from('crypto_tax_lots')
        .delete()
        .eq('user_id', userId);
    // Delete ALL lots for user (not just FY), since lots from older FYs
    // need to be rebuilt to properly track remaining_qty

    if (delLotsErr) {
        errors.push(`Failed to clear lots: ${delLotsErr.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Create tax lots from ALL BUY transactions
    // ═══════════════════════════════════════════════════════════════════
    console.log('[FIFO] Step 2: Creating tax lots from BUY transactions...');

    // Fetch ALL BUY transactions for this user (across ALL FYs)
    // because we need the full purchase history for FIFO matching.
    // A BTC bought in FY2023-24 might be sold in FY2024-25.
    const { data: buyTxns, error: buyErr } = await supabase
        .from('crypto_transactions')
        .select('id, asset, quantity, total_inr, fee_inr, timestamp, financial_year')
        .eq('user_id', userId)
        .eq('txn_type', 'BUY')
        .order('timestamp', { ascending: true });

    if (buyErr) {
        return errorResult(financialYear, [`Failed to fetch BUY transactions: ${buyErr.message}`]);
    }

    const buys: BuyTransaction[] = (buyTxns || []).map(t => ({
        ...t,
        quantity: Number(t.quantity),
        total_inr: Number(t.total_inr),
        fee_inr: Number(t.fee_inr),
    }));

    // Create lots in batches
    let lotsCreated = 0;
    const lotRecords = buys.map(buy => ({
        user_id: userId,
        txn_id: buy.id,
        asset: buy.asset,
        original_qty: buy.quantity,
        remaining_qty: buy.quantity,
        cost_per_unit: buy.quantity > 0
            ? (buy.total_inr + buy.fee_inr) / buy.quantity    // Fee = part of cost of acquisition
            : 0,
        purchase_date: buy.timestamp,
        financial_year: buy.financial_year,
        is_exhausted: false,
    }));

    for (let i = 0; i < lotRecords.length; i += BATCH_SIZE) {
        const batch = lotRecords.slice(i, i + BATCH_SIZE);
        const { error: lotErr } = await supabase
            .from('crypto_tax_lots')
            .insert(batch);

        if (lotErr) {
            errors.push(`Lot insert error (batch ${i}): ${lotErr.message}`);
        } else {
            lotsCreated += batch.length;
        }
    }

    console.log(`[FIFO] Created ${lotsCreated} tax lots from ${buys.length} BUY transactions`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Process SELL transactions with FIFO
    // ═══════════════════════════════════════════════════════════════════
    console.log('[FIFO] Step 3: Processing SELL transactions with FIFO...');

    // Fetch SELL transactions within the target FY date range
    const { data: sellTxns, error: sellErr } = await supabase
        .from('crypto_transactions')
        .select('id, asset, quantity, total_inr, fee_inr, tds_inr, timestamp, financial_year')
        .eq('user_id', userId)
        .eq('txn_type', 'SELL')
        .eq('financial_year', financialYear)
        .order('timestamp', { ascending: true });

    if (sellErr) {
        return errorResult(financialYear, [`Failed to fetch SELL transactions: ${sellErr.message}`]);
    }

    const sells: SellTransaction[] = (sellTxns || []).map(t => ({
        ...t,
        quantity: Number(t.quantity),
        total_inr: Number(t.total_inr),
        fee_inr: Number(t.fee_inr),
        tds_inr: Number(t.tds_inr),
    }));

    let computationsCreated = 0;
    let unknownLotsCount = 0;

    for (const sell of sells) {
        let sellQtyRemaining = sell.quantity;

        // Sale consideration per unit = (total_inr - fee_inr) / quantity
        // Fee reduces sale consideration (not deductible separately for crypto)
        const sellPricePerUnit = sell.quantity > 0
            ? (sell.total_inr - sell.fee_inr) / sell.quantity
            : 0;

        // TDS for this sell (from the sell record itself + any TDS_CSV matches)
        const tdsForSell = await getTDSForSell(supabase, userId, sell);

        // Fetch available lots for this asset, FIFO order (oldest first)
        const { data: availableLots, error: lotFetchErr } = await supabase
            .from('crypto_tax_lots')
            .select('*')
            .eq('user_id', userId)
            .eq('asset', sell.asset)
            .eq('is_exhausted', false)
            .gt('remaining_qty', 0)
            .order('purchase_date', { ascending: true });

        if (lotFetchErr) {
            errors.push(`Lot fetch error for ${sell.asset}: ${lotFetchErr.message}`);
            continue;
        }

        const lots: TaxLot[] = (availableLots || []).map(l => ({
            ...l,
            original_qty: Number(l.original_qty),
            remaining_qty: Number(l.remaining_qty),
            cost_per_unit: Number(l.cost_per_unit),
        }));

        // FIFO matching loop
        for (const lot of lots) {
            if (sellQtyRemaining <= 0) break;

            const matchQty = Math.min(lot.remaining_qty, sellQtyRemaining);
            const costOfAcquisition = round4(matchQty * lot.cost_per_unit);
            const saleConsideration = round4(matchQty * sellPricePerUnit);
            const capitalGain = round4(saleConsideration - costOfAcquisition);

            // TDS attribution: proportional share
            const tdsAttributed = round4(tdsForSell * (matchQty / sell.quantity));

            // Per-match tax (for individual computation rows)
            const matchGrossTax = capitalGain > 0 ? round4(capitalGain * TAX_RATE) : 0;
            const matchCess = round4(matchGrossTax * CESS_RATE);
            const matchTotalTax = round4(matchGrossTax + matchCess);

            // Insert computation record
            const { error: compErr } = await supabase
                .from('crypto_tax_computations')
                .insert({
                    user_id: userId,
                    sell_txn_id: sell.id,
                    lot_id: lot.id,
                    qty_matched: matchQty,
                    cost_of_acquisition: costOfAcquisition,
                    sale_consideration: saleConsideration,
                    capital_gain: capitalGain,
                    tds_attributed: tdsAttributed,
                    financial_year: financialYear,
                    gross_tax: matchGrossTax,
                    cess: matchCess,
                    total_tax: matchTotalTax,
                    is_unknown_lot: false,
                });

            if (compErr) {
                errors.push(`Computation insert error: ${compErr.message}`);
            } else {
                computationsCreated++;
            }

            // Update lot
            const newRemaining = round10(lot.remaining_qty - matchQty);
            const isExhausted = newRemaining <= 0.0000000001; // epsilon for floating point

            const { error: lotUpdateErr } = await supabase
                .from('crypto_tax_lots')
                .update({
                    remaining_qty: isExhausted ? 0 : newRemaining,
                    is_exhausted: isExhausted,
                })
                .eq('id', lot.id);

            if (lotUpdateErr) {
                errors.push(`Lot update error: ${lotUpdateErr.message}`);
            }

            // Update in-memory lot too (in case same lot is reused for another sell
            // within the same process — though we re-fetch per sell)
            lot.remaining_qty = isExhausted ? 0 : newRemaining;
            lot.is_exhausted = isExhausted;

            sellQtyRemaining = round10(sellQtyRemaining - matchQty);
        }

        // If sell_qty_remaining > 0: unknown lot (no purchase history)
        if (sellQtyRemaining > 0.0000000001) {
            unknownLotsCount++;

            const saleConsideration = round4(sellQtyRemaining * sellPricePerUnit);
            const capitalGain = saleConsideration; // cost = 0 (conservative)
            const tdsAttributed = round4(tdsForSell * (sellQtyRemaining / sell.quantity));
            const matchGrossTax = capitalGain > 0 ? round4(capitalGain * TAX_RATE) : 0;
            const matchCess = round4(matchGrossTax * CESS_RATE);
            const matchTotalTax = round4(matchGrossTax + matchCess);

            const { error: unknownErr } = await supabase
                .from('crypto_tax_computations')
                .insert({
                    user_id: userId,
                    sell_txn_id: sell.id,
                    lot_id: null,
                    qty_matched: sellQtyRemaining,
                    cost_of_acquisition: 0,
                    sale_consideration: saleConsideration,
                    capital_gain: capitalGain,
                    tds_attributed: tdsAttributed,
                    financial_year: financialYear,
                    gross_tax: matchGrossTax,
                    cess: matchCess,
                    total_tax: matchTotalTax,
                    is_unknown_lot: true,
                });

            if (unknownErr) {
                errors.push(`Unknown lot computation error: ${unknownErr.message}`);
            } else {
                computationsCreated++;
            }
        }
    }

    console.log(`[FIFO] Processed ${sells.length} sells → ${computationsCreated} computation records (${unknownLotsCount} unknown lots)`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Compute tax summary
    // ═══════════════════════════════════════════════════════════════════
    console.log('[FIFO] Step 4: Computing tax summary...');

    const { data: computations, error: compFetchErr } = await supabase
        .from('crypto_tax_computations')
        .select('sale_consideration, cost_of_acquisition, capital_gain, tds_attributed, is_unknown_lot')
        .eq('user_id', userId)
        .eq('financial_year', financialYear);

    if (compFetchErr) {
        return errorResult(financialYear, [`Failed to fetch computations: ${compFetchErr.message}`, ...errors]);
    }

    const comps = computations || [];

    const totalSaleConsideration = round2(
        comps.reduce((s, c) => s + Number(c.sale_consideration), 0)
    );
    const totalCostOfAcquisition = round2(
        comps.reduce((s, c) => s + Number(c.cost_of_acquisition), 0)
    );
    const grossCapitalGain = round2(totalSaleConsideration - totalCostOfAcquisition);

    // Section 115BBH: Losses NOT deductible — taxable gain = max(gain, 0)
    const taxableGain = Math.max(grossCapitalGain, 0);
    const grossTax = round2(taxableGain * TAX_RATE);
    const cess = round2(grossTax * CESS_RATE);
    const totalTax = round2(grossTax + cess);

    // TDS credit: sum from all TDS and SELL transactions in this FY
    const { data: tdsTxns, error: tdsErr } = await supabase
        .from('crypto_transactions')
        .select('tds_inr')
        .eq('user_id', userId)
        .eq('financial_year', financialYear)
        .in('txn_type', ['TDS', 'SELL'])
        .gt('tds_inr', 0);

    let totalTdsCredit = 0;
    if (!tdsErr && tdsTxns) {
        totalTdsCredit = round2(tdsTxns.reduce((s, t) => s + Number(t.tds_inr), 0));
    }

    const netPayable = round2(Math.max(totalTax - totalTdsCredit, 0));
    const tdsRefundEligible = round2(Math.max(totalTdsCredit - totalTax, 0));

    const result: TaxComputationResult = {
        success: true,
        financial_year: financialYear,
        capital_gain_trades: comps.length,
        total_sale_consideration: totalSaleConsideration,
        total_cost_of_acquisition: totalCostOfAcquisition,
        gross_capital_gain: grossCapitalGain,
        taxable_gain: taxableGain,
        gross_tax: grossTax,
        cess,
        total_tax: totalTax,
        total_tds_credit: totalTdsCredit,
        net_payable: netPayable,
        tds_refund_eligible: tdsRefundEligible,
        unknown_lots_count: unknownLotsCount,
        has_data_gaps: unknownLotsCount > 0,
        lots_created: lotsCreated,
        sells_processed: sells.length,
        computations_created: computationsCreated,
        errors,
    };

    console.log(`[FIFO] ✅ Computation complete:`, {
        grossCapitalGain,
        taxableGain,
        totalTax,
        totalTdsCredit,
        netPayable,
        tdsRefundEligible,
    });

    return result;
}


// ─── TDS Attribution ─────────────────────────────────────────────────

/**
 * Get total TDS for a sell transaction.
 * Sources:
 *   1. tds_inr directly on the SELL record (from ORDER_CSV → TDS_CSV match)
 *   2. TDS_CSV standalone records matching the sell's date + asset
 */
async function getTDSForSell(
    supabase: SupabaseClient,
    userId: string,
    sell: SellTransaction,
): Promise<number> {
    // 1. Direct TDS on the sell record
    let totalTds = sell.tds_inr || 0;

    // 2. TDS_CSV standalone records that match this sell
    // Match criteria: same asset, same date (±1 day for timing differences)
    const sellDate = new Date(sell.timestamp);
    const dayBefore = new Date(sellDate.getTime() - 86400000).toISOString();
    const dayAfter = new Date(sellDate.getTime() + 86400000).toISOString();

    const { data: tdsRecords } = await supabase
        .from('crypto_transactions')
        .select('tds_inr')
        .eq('user_id', userId)
        .eq('source', 'TDS_CSV')
        .eq('txn_type', 'TDS')
        .eq('asset', sell.asset)
        .gte('timestamp', dayBefore)
        .lte('timestamp', dayAfter);

    if (tdsRecords && tdsRecords.length > 0) {
        totalTds += tdsRecords.reduce((s, t) => s + Number(t.tds_inr), 0);
    }

    return totalTds;
}


// ─── FY Utilities ────────────────────────────────────────────────────

/**
 * Parse 'FY2024-25' → date range { start, end }
 * FY2024-25 = April 1, 2024 → March 31, 2025
 */
function parseFYDateRange(fy: string): FYDateRange | null {
    const match = fy.match(/^FY(\d{4})-(\d{2})$/);
    if (!match) return null;

    const startYear = parseInt(match[1]);

    return {
        start: `${startYear}-04-01T00:00:00+05:30`,
        end: `${startYear + 1}-03-31T23:59:59+05:30`,
    };
}


// ─── Rounding Helpers ────────────────────────────────────────────────

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}

function round10(n: number): number {
    return Math.round(n * 10000000000) / 10000000000;
}


// ─── Error Result Helper ─────────────────────────────────────────────

function errorResult(fy: string, errors: string[]): TaxComputationResult {
    return {
        success: false,
        financial_year: fy,
        capital_gain_trades: 0,
        total_sale_consideration: 0,
        total_cost_of_acquisition: 0,
        gross_capital_gain: 0,
        taxable_gain: 0,
        gross_tax: 0,
        cess: 0,
        total_tax: 0,
        total_tds_credit: 0,
        net_payable: 0,
        tds_refund_eligible: 0,
        unknown_lots_count: 0,
        has_data_gaps: false,
        lots_created: 0,
        sells_processed: 0,
        computations_created: 0,
        errors,
    };
}
