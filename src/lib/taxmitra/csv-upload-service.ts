/**
 * TaxMitra — CSV Upload Service (Client-Side)
 * =============================================
 * Handles file → parse → deduplicate → insert into Supabase.
 *
 * Usage:
 *   import { uploadOrderHistoryCSV, uploadTDSSummaryCSV }
 *     from '@/lib/taxmitra/csv-upload-service';
 *   const result = await uploadOrderHistoryCSV(file, 'FY2024-25');
 *   const tdsResult = await uploadTDSSummaryCSV(file, 'FY2024-25');
 *
 * This runs entirely in the browser using the Supabase JS client.
 * No custom API endpoint needed — leverages RLS (Row Level Security)
 * so the user can only insert rows for themselves.
 */

import { supabase } from '@/integrations/supabase/client';
import {
    parseOrderHistoryCSV,
    type ParsedOrderRow,
    type ParseError,
    type OrderCSVParseResult,
} from './order-csv-parser';
import {
    parseTDSSummaryCSV,
    type ParsedTDSRow,
    type TDSParseError,
    type TDSCSVParseResult,
} from './tds-csv-parser';
import {
    parseInstaHistoryCSV,
    type ParsedInstaRow,
    type ParsedInstaIncomeRow,
    type InstaParseError,
    type InstaCSVParseResult,
} from './insta-csv-parser';


// ─── Types ───────────────────────────────────────────────────────────

export interface UploadResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: ParseError[];
    summary: OrderCSVParseResult['summary'];
    preview: ParsedOrderRow[];
}

// ─── Main Upload Function ────────────────────────────────────────────

/**
 * Parse and upload a CoinDCX Order History CSV file.
 *
 * IMPORTANT: Imports ALL rows from ALL financial years.
 * BUY orders from older FYs are essential cost lots for FIFO
 * capital gains calculation. Each row gets its FY computed from
 * the transaction date.
 *
 * Deduplication: UNIQUE(user_id, source, source_id) constraint
 * ensures re-uploading the same CSV results in imported=0, skipped=N.
 *
 * @param file             The CSV file from an <input type="file"> element
 * @param financialYear    The primary FY (used for coverage tracking)
 * @returns                Upload result with imported/skipped counts
 */
export async function uploadOrderHistoryCSV(
    file: File,
    financialYear: string,
): Promise<UploadResult> {
    // ── 1. Auth check ──
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // ── 2. Read file ──
    const csvText = await file.text();

    // ── 3. Parse ──
    const parseResult = parseOrderHistoryCSV(csvText);

    if (parseResult.rows.length === 0) {
        return {
            success: false,
            imported: 0,
            skipped: 0,
            errors: parseResult.errors.length > 0
                ? parseResult.errors
                : [{ row: 0, reason: 'No valid rows found in CSV' }],
            summary: parseResult.summary,
            preview: [],
        };
    }

    // ── 4. Import ALL rows (all FYs — do NOT filter) ──
    // BUY orders from older FYs are critical for FIFO cost lot matching.
    // Each row already has its financial_year computed from its date.
    const rowsToInsert = parseResult.rows;
    const distinctFYs = [...new Set(rowsToInsert.map(r => r.financial_year))];

    if (distinctFYs.length > 1) {
        // Informational: let the user know we imported across multiple FYs
        console.log(`[CSV Upload] Importing orders across ${distinctFYs.length} financial years: ${distinctFYs.join(', ')}`);
    }

    // ── 5. Batch insert with ON CONFLICT DO NOTHING ──
    const dbRows = rowsToInsert.map(row => ({
        user_id: user.id,
        source: row.source,
        source_id: row.source_id,
        txn_type: row.txn_type,
        asset: row.asset,
        quantity: row.quantity,
        price_inr: row.price_inr,
        total_inr: row.total_inr,
        fee_inr: row.fee_inr,
        tds_inr: row.tds_inr,
        timestamp: row.timestamp,
        financial_year: row.financial_year,
        pair: row.pair,
        status: row.status,
        raw_data: row.raw_data,
    }));

    // Supabase upsert with ignoreDuplicates = true → ON CONFLICT DO NOTHING
    // Insert in batches of 500 to avoid payload limits
    let imported = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
        const batch = dbRows.slice(i, i + BATCH_SIZE);

        const { data: inserted, error } = await (supabase
            .from('crypto_transactions' as any)
            .upsert(batch, {
                onConflict: 'user_id,source,source_id',
                ignoreDuplicates: true,
            })
            .select('id') as any);

        if (error) {
            console.error('[CSV Upload] Batch insert error:', error);
            parseResult.errors.push({
                row: i + 1,
                reason: `Database insert error: ${error.message}`,
            });
        } else {
            const insertedCount = inserted?.length ?? 0;
            imported += insertedCount;
            skipped += batch.length - insertedCount;
        }
    }

    // ── 6. Update crypto_data_coverage for each FY ──
    for (const fy of distinctFYs) {
        const fyRowCount = rowsToInsert.filter(r => r.financial_year === fy).length;
        await updateDataCoverage(user.id, fy, 'order', fyRowCount);
    }

    // ── 7. Build response ──
    return {
        success: imported > 0 || skipped > 0,
        imported,
        skipped,
        errors: parseResult.errors,
        summary: parseResult.summary,
        preview: parseResult.rows.slice(0, 10),
    };
}


// ═════════════════════════════════════════════════════════════════════
// TDS SUMMARY CSV UPLOAD
// ═════════════════════════════════════════════════════════════════════

export interface TDSUploadResult {
    success: boolean;
    imported: number;
    matched_to_orders: number;
    skipped: number;
    total_tds_inr: number;
    errors: TDSParseError[];
    summary: TDSCSVParseResult['summary'];
}

/**
 * Parse and upload a CoinDCX TDS Summary CSV file.
 *
 * For rows with an order_id:
 *   - Try to UPDATE the matching ORDER_CSV crypto_transaction's tds_inr
 *   - If no match found, insert as a standalone TDS record
 *
 * For rows without order_id:
 *   - Insert as standalone TDS record with hash-based source_id
 */
export async function uploadTDSSummaryCSV(
    file: File,
    financialYear: string,
): Promise<TDSUploadResult> {
    // ── 1. Auth ──
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // ── 2. Read + Parse ──
    const csvText = await file.text();
    const parseResult = parseTDSSummaryCSV(csvText);

    if (parseResult.rows.length === 0) {
        return {
            success: false,
            imported: 0,
            matched_to_orders: 0,
            skipped: 0,
            total_tds_inr: 0,
            errors: parseResult.errors.length > 0
                ? parseResult.errors
                : [{ row: 0, reason: 'No valid TDS rows found in CSV' }],
            summary: parseResult.summary,
        };
    }

    // ── 3. Filter to requested FY ──
    let rowsToProcess = parseResult.rows;
    if (financialYear) {
        const fyRows = parseResult.rows.filter(r => r.financial_year === financialYear);
        const otherFYRows = parseResult.rows.filter(r => r.financial_year !== financialYear);
        if (otherFYRows.length > 0) {
            parseResult.errors.push({
                row: 0,
                reason: `${otherFYRows.length} TDS row(s) from other FY(s) skipped: ${[...new Set(otherFYRows.map(r => r.financial_year))].join(', ')}`,
            });
        }
        rowsToProcess = fyRows;
    }

    if (rowsToProcess.length === 0) {
        return {
            success: false,
            imported: 0,
            matched_to_orders: 0,
            skipped: 0,
            total_tds_inr: 0,
            errors: [{
                row: 0,
                reason: `No TDS rows found for ${financialYear}.`,
            }],
            summary: parseResult.summary,
        };
    }

    // ── 4. Process: match to orders + insert standalone TDS records ──
    let matchedToOrders = 0;
    let imported = 0;
    let skipped = 0;
    let totalTdsInr = 0;

    // 4a. Try to match rows with order_id to existing ORDER_CSV records
    const rowsWithOrderId = rowsToProcess.filter(r => r.has_order_id);
    const rowsWithoutOrderId = rowsToProcess.filter(r => !r.has_order_id);

    for (const row of rowsWithOrderId) {
        try {
            // Try to update the matching ORDER_CSV transaction's tds_inr
            const { data: updated, error: updateErr } = await (supabase
                .from('crypto_transactions' as any)
                .update({ tds_inr: row.tds_inr })
                .eq('user_id', user.id)
                .eq('source', 'ORDER_CSV')
                .eq('source_id', row.order_id)
                .select('id') as any);

            if (!updateErr && updated && updated.length > 0) {
                matchedToOrders++;
                totalTdsInr += row.tds_inr;
            } else {
                // No match found — insert as standalone TDS record
                rowsWithoutOrderId.push(row);
            }
        } catch {
            // Fallback: insert as standalone
            rowsWithoutOrderId.push(row);
        }
    }

    // 4b. Insert standalone TDS records (rows without order_id + unmatched)
    if (rowsWithoutOrderId.length > 0) {
        const dbRows = rowsWithoutOrderId.map(row => ({
            user_id: user.id,
            source: row.source,
            source_id: row.source_id,
            txn_type: row.txn_type,
            asset: row.asset,
            quantity: row.quantity,
            price_inr: row.price_inr,
            total_inr: row.total_inr,
            fee_inr: row.fee_inr,
            tds_inr: row.tds_inr,
            timestamp: row.timestamp,
            financial_year: row.financial_year,
            pair: row.pair,
            status: row.status,
            raw_data: row.raw_data,
        }));

        const BATCH_SIZE = 500;
        for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
            const batch = dbRows.slice(i, i + BATCH_SIZE);

            const { data: inserted, error } = await (supabase
                .from('crypto_transactions' as any)
                .upsert(batch, {
                    onConflict: 'user_id,source,source_id',
                    ignoreDuplicates: true,
                })
                .select('id') as any);

            if (error) {
                console.error('[TDS Upload] Batch insert error:', error);
                parseResult.errors.push({
                    row: i + 1,
                    reason: `DB insert error: ${error.message}`,
                });
            } else {
                const count = inserted?.length ?? 0;
                imported += count;
                skipped += batch.length - count;
                totalTdsInr += batch.slice(0, count).reduce((s: number, r: any) => s + (r.tds_inr || 0), 0);
            }
        }
    }

    // ── 5. Update coverage ──
    await updateDataCoverage(user.id, financialYear, 'tds', imported + matchedToOrders);

    return {
        success: imported > 0 || matchedToOrders > 0 || skipped > 0,
        imported,
        matched_to_orders: matchedToOrders,
        skipped,
        total_tds_inr: Math.round(totalTdsInr * 100) / 100,
        errors: parseResult.errors,
        summary: parseResult.summary,
    };
}


// ═════════════════════════════════════════════════════════════════════
// DATA COVERAGE UPDATER
// ═════════════════════════════════════════════════════════════════════

/**
 * Update crypto_data_coverage for a user + FY + CSV type.
 * @param csvType  'order' | 'tds' | 'insta'
 */
async function updateDataCoverage(
    userId: string,
    financialYear: string,
    csvType: 'order' | 'tds' | 'insta',
    rowCount: number,
): Promise<void> {
    try {
        const statusField = `${csvType}_csv_status`;
        const rowsField = `${csvType}_csv_rows`;

        // Upsert with partial field update
        const upsertData: any = {
            user_id: userId,
            financial_year: financialYear,
            [statusField]: 'UPLOADED',
            [rowsField]: rowCount,
            last_updated: new Date().toISOString(),
        };

        await (supabase
            .from('crypto_data_coverage' as any)
            .upsert(upsertData, { onConflict: 'user_id,financial_year' }) as any);

        console.log(`[CSV Upload] ✅ Updated data coverage: ${financialYear}, ${rowsField}=${rowCount}`);
    } catch (err) {
        console.warn('[CSV Upload] Failed to update data coverage:', err);
    }
}


// ═════════════════════════════════════════════════════════════════════
// INSTA HISTORY CSV UPLOAD
// ═════════════════════════════════════════════════════════════════════

export interface InstaUploadResult {
    success: boolean;
    imported: number;
    imported_income: number;
    skipped: number;
    errors: InstaParseError[];
    summary: InstaCSVParseResult['summary'];
    preview: ParsedInstaRow[];
}

/**
 * Parse and upload a CoinDCX Insta History CSV file.
 *
 * Insta = instant buy/sell (OTC-style trades) + staking/reward income.
 *
 * BUY/SELL trades → crypto_transactions table
 * Staking/reward/airdrop income → crypto_income table
 *
 * IMPORTANT: Imports ALL rows from ALL financial years.
 * BUY orders from older FYs are essential cost lots for FIFO.
 *
 * Deduplication: UNIQUE(user_id, source, source_id) on both tables
 * ensures re-uploading the same CSV results in imported=0, skipped=N.
 */
export async function uploadInstaHistoryCSV(
    file: File,
    financialYear: string,
): Promise<InstaUploadResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const csvText = await file.text();
    const parseResult = parseInstaHistoryCSV(csvText);

    const hasTrades = parseResult.rows.length > 0;
    const hasIncome = parseResult.incomeRows.length > 0;

    if (!hasTrades && !hasIncome) {
        return {
            success: false,
            imported: 0,
            imported_income: 0,
            skipped: 0,
            errors: parseResult.errors.length > 0
                ? parseResult.errors
                : [{ row: 0, reason: 'No valid Insta rows found in CSV (no trades or income events)' }],
            summary: parseResult.summary,
            preview: [],
        };
    }

    // ── 1. Import ALL trade rows (all FYs — do NOT filter) ──
    let importedTrades = 0;
    let skippedTrades = 0;

    if (hasTrades) {
        const dbRows = parseResult.rows.map(row => ({
            user_id: user.id,
            source: row.source,
            source_id: row.source_id,
            txn_type: row.txn_type,
            asset: row.asset,
            quantity: row.quantity,
            price_inr: row.price_inr,
            total_inr: row.total_inr,
            fee_inr: row.fee_inr,
            tds_inr: row.tds_inr,
            timestamp: row.timestamp,
            financial_year: row.financial_year,
            pair: row.pair,
            status: row.status,
            raw_data: row.raw_data,
        }));

        const BATCH_SIZE = 500;
        for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
            const batch = dbRows.slice(i, i + BATCH_SIZE);

            const { data: inserted, error } = await (supabase
                .from('crypto_transactions' as any)
                .upsert(batch, {
                    onConflict: 'user_id,source,source_id',
                    ignoreDuplicates: true,
                })
                .select('id') as any);

            if (error) {
                console.error('[Insta Upload] Trade batch insert error:', error);
                parseResult.errors.push({ row: i + 1, reason: `DB error (trades): ${error.message}` });
            } else {
                const count = inserted?.length ?? 0;
                importedTrades += count;
                skippedTrades += batch.length - count;
            }
        }
        console.log(`[Insta Upload] Trades: ${importedTrades} imported, ${skippedTrades} skipped (dedup)`);
    }

    // ── 2. Import income events into crypto_income table ──
    let importedIncome = 0;
    let skippedIncome = 0;

    if (hasIncome) {
        const incomeDbRows = parseResult.incomeRows.map(row => ({
            user_id: user.id,
            income_type: row.income_type,
            asset: row.asset,
            quantity: row.quantity,
            value_inr: row.value_inr,
            transaction_date: row.transaction_date,
            financial_year: row.financial_year,
            source: row.source,
            source_id: row.source_id,
            remarks: row.remarks,
        }));

        const BATCH_SIZE = 500;
        for (let i = 0; i < incomeDbRows.length; i += BATCH_SIZE) {
            const batch = incomeDbRows.slice(i, i + BATCH_SIZE);

            const { data: inserted, error } = await (supabase
                .from('crypto_income' as any)
                .upsert(batch, {
                    onConflict: 'user_id,source,source_id',
                    ignoreDuplicates: true,
                })
                .select('id') as any);

            if (error) {
                console.error('[Insta Upload] Income batch insert error:', error);
                parseResult.errors.push({ row: i + 1, reason: `DB error (income): ${error.message}` });
            } else {
                const count = inserted?.length ?? 0;
                importedIncome += count;
                skippedIncome += batch.length - count;
            }
        }
        console.log(`[Insta Upload] Income: ${importedIncome} imported, ${skippedIncome} skipped (dedup)`);
    }

    // ── 3. Update coverage for each FY ──
    const allFYs = [...new Set([
        ...parseResult.rows.map(r => r.financial_year),
        ...parseResult.incomeRows.map(r => r.financial_year),
    ])];
    for (const fy of allFYs) {
        const fyCount = parseResult.rows.filter(r => r.financial_year === fy).length
            + parseResult.incomeRows.filter(r => r.financial_year === fy).length;
        await updateDataCoverage(user.id, fy, 'insta', fyCount);
    }

    return {
        success: importedTrades > 0 || importedIncome > 0 || skippedTrades > 0 || skippedIncome > 0,
        imported: importedTrades,
        imported_income: importedIncome,
        skipped: skippedTrades + skippedIncome,
        errors: parseResult.errors,
        summary: parseResult.summary,
        preview: parseResult.rows.slice(0, 10),
    };
}


// ═════════════════════════════════════════════════════════════════════
// PREVIEW (DRY-RUN) FUNCTIONS
// ═════════════════════════════════════════════════════════════════════

/**
 * Parse an Order History CSV without inserting into the database.
 */
export async function previewOrderHistoryCSV(file: File): Promise<OrderCSVParseResult> {
    const csvText = await file.text();
    return parseOrderHistoryCSV(csvText);
}

/**
 * Parse a TDS Summary CSV without inserting into the database.
 */
export async function previewTDSSummaryCSV(file: File): Promise<TDSCSVParseResult> {
    const csvText = await file.text();
    return parseTDSSummaryCSV(csvText);
}

/**
 * Parse an Insta History CSV without inserting into the database.
 */
export async function previewInstaHistoryCSV(file: File): Promise<InstaCSVParseResult> {
    const csvText = await file.text();
    return parseInstaHistoryCSV(csvText);
}
