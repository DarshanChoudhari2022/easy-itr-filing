/**
 * TaxMitra â€” CSV Upload Service (Client-Side)
 * =============================================
 * Handles file â†’ parse â†’ deduplicate â†’ insert into Supabase.
 *
 * Usage:
 *   import { uploadOrderHistoryCSV, uploadTDSSummaryCSV }
 *     from '@/lib/taxmitra/csv-upload-service';
 *   const result = await uploadOrderHistoryCSV(file, 'FY2024-25');
 *   const tdsResult = await uploadTDSSummaryCSV(file, 'FY2024-25');
 *
 * This runs entirely in the browser using the Supabase JS client.
 * No custom API endpoint needed â€” leverages RLS (Row Level Security)
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
    type InstaParseError,
    type InstaCSVParseResult,
} from './insta-csv-parser';


// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface UploadResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: ParseError[];
    summary: OrderCSVParseResult['summary'];
    preview: ParsedOrderRow[];
}

// â”€â”€â”€ Main Upload Function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parse and upload a CoinDCX Order History CSV file.
 *
 * @param file             The CSV file from an <input type="file"> element
 * @param financialYear    The FY this upload relates to (e.g. 'FY2024-25')
 * @returns                Upload result with imported/skipped counts
 */
export async function uploadOrderHistoryCSV(
    file: File,
    financialYear: string,
): Promise<UploadResult> {
    // â”€â”€ 1. Auth check â”€â”€
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // â”€â”€ 2. Read file â”€â”€
    const csvText = await file.text();

    // â”€â”€ 3. Parse â”€â”€
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

    // â”€â”€ 4. Optionally filter to requested FY â”€â”€
    // If user specified a FY, only import rows from that FY.
    // But we still keep rows from other FYs in the preview and let them know.
    let rowsToInsert = parseResult.rows;
    if (financialYear) {
        const fyRows = parseResult.rows.filter(r => r.financial_year === financialYear);
        const otherFYRows = parseResult.rows.filter(r => r.financial_year !== financialYear);

        if (otherFYRows.length > 0) {
            // Include a warning that some rows are from other FYs
            parseResult.errors.push({
                row: 0,
                reason: `${otherFYRows.length} row(s) belong to other FY(s): ${[...new Set(otherFYRows.map(r => r.financial_year))].join(', ')}. Only ${financialYear} rows will be imported.`,
            });
        }

        rowsToInsert = fyRows;
    }

    if (rowsToInsert.length === 0) {
        return {
            success: false,
            imported: 0,
            skipped: 0,
            errors: [{
                row: 0,
                reason: `No rows found for ${financialYear}. All ${parseResult.rows.length} rows belong to other financial year(s).`,
            }],
            summary: parseResult.summary,
            preview: parseResult.rows.slice(0, 10),
        };
    }

    // â”€â”€ 5. Batch insert with ON CONFLICT DO NOTHING â”€â”€
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

    // Supabase upsert with ignoreDuplicates = true â†’ ON CONFLICT DO NOTHING
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

    // â”€â”€ 6. Update crypto_data_coverage â”€â”€
    await updateDataCoverage(user.id, financialYear, 'order', imported);

    // â”€â”€ 7. Build response â”€â”€
    return {
        success: imported > 0 || skipped > 0,
        imported,
        skipped,
        errors: parseResult.errors,
        summary: parseResult.summary,
        preview: parseResult.rows.slice(0, 10),
    };
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TDS SUMMARY CSV UPLOAD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
    // â”€â”€ 1. Auth â”€â”€
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // â”€â”€ 2. Read + Parse â”€â”€
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

    // â”€â”€ 3. Filter to requested FY â”€â”€
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

    // â”€â”€ 4. Process: match to orders + insert standalone TDS records â”€â”€
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
                // No match found â€” insert as standalone TDS record
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

    // â”€â”€ 5. Update coverage â”€â”€
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DATA COVERAGE UPDATER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    } catch (err) {
    }
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INSTA HISTORY CSV UPLOAD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface InstaUploadResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: InstaParseError[];
    summary: InstaCSVParseResult['summary'];
    preview: ParsedInstaRow[];
}

/**
 * Parse and upload a CoinDCX Insta History CSV file.
 * Insta = instant buy/sell (OTC-style trades).
 * This is OPTIONAL â€” user may skip it.
 */
export async function uploadInstaHistoryCSV(
    file: File,
    financialYear: string,
): Promise<InstaUploadResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const csvText = await file.text();
    const parseResult = parseInstaHistoryCSV(csvText);

    if (parseResult.rows.length === 0) {
        return {
            success: false,
            imported: 0,
            skipped: 0,
            errors: parseResult.errors.length > 0
                ? parseResult.errors
                : [{ row: 0, reason: 'No valid Insta rows found in CSV' }],
            summary: parseResult.summary,
            preview: [],
        };
    }

    // Filter to FY
    let rowsToInsert = parseResult.rows;
    if (financialYear) {
        const fyRows = parseResult.rows.filter(r => r.financial_year === financialYear);
        const otherFYRows = parseResult.rows.filter(r => r.financial_year !== financialYear);
        if (otherFYRows.length > 0) {
            parseResult.errors.push({
                row: 0,
                reason: `${otherFYRows.length} Insta row(s) from other FY(s) skipped: ${[...new Set(otherFYRows.map(r => r.financial_year))].join(', ')}`,
            });
        }
        rowsToInsert = fyRows;
    }

    if (rowsToInsert.length === 0) {
        return {
            success: false,
            imported: 0,
            skipped: 0,
            errors: [{ row: 0, reason: `No Insta rows found for ${financialYear}.` }],
            summary: parseResult.summary,
            preview: parseResult.rows.slice(0, 10),
        };
    }

    // Batch insert
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
            console.error('[Insta Upload] Batch insert error:', error);
            parseResult.errors.push({ row: i + 1, reason: `DB error: ${error.message}` });
        } else {
            const count = inserted?.length ?? 0;
            imported += count;
            skipped += batch.length - count;
        }
    }

    await updateDataCoverage(user.id, financialYear, 'insta', imported);

    return {
        success: imported > 0 || skipped > 0,
        imported,
        skipped,
        errors: parseResult.errors,
        summary: parseResult.summary,
        preview: parseResult.rows.slice(0, 10),
    };
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PREVIEW (DRY-RUN) FUNCTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
