// @ts-nocheck
// NOTE: TypeScript errors are expected until the Supabase Database types are regenerated.
// After running the migration (20260212_crypto_tax_engine.sql), run:
//   npx supabase gen types typescript --project-id <your-project-id> > src/integrations/supabase/types.ts
// This will add the new crypto_* table types and resolve all type errors below.

/**
 * Tax Mitra — Supabase Persistence Service
 * ==========================================
 * Handles all database operations for the crypto tax engine:
 *   - Import session CRUD
 *   - Transaction upsert with dedup
 *   - TDS record upsert
 *   - Tax lot & match persistence
 *   - Summary computation & caching
 *   - FX rate lookups
 *
 * Designed to work with Supabase (Postgres) with RLS.
 */

import { supabase } from '../../integrations/supabase/client';
import type {
    NormalizedTransaction,
    TDSRecord,
    FileParseResult,
    ImportSessionResult,
} from './coindcx-ingestion';
import {
    processImportSession,
    computeContentHash,
} from './coindcx-ingestion';
import {
    computeVdaTaxForFinancialYear,
    generateScheduleVDACSV,
    generateTDSReconciliationCSV,
    formatPnLSummary,
} from './tax-computation-engine';
import type {
    TaxComputationResult,
    AccountingMethod,
} from './tax-computation-engine';

// ============= TYPES =============

export interface PersistenceResult<T = void> {
    success: boolean;
    data?: T;
    error?: string;
    warnings?: string[];
}

export interface ImportProgress {
    sessionId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    totalFiles: number;
    processedFiles: number;
    totalRows: number;
    parsedRows: number;
    duplicatesSkipped: number;
    errors: { line: number; message: string }[];
}

// ============= FX RATE SERVICE =============

/**
 * Get INR rate for a given asset on a given date.
 * Falls back to nearest available rate, then to default.
 */
export async function getINRRate(asset: string, date: Date): Promise<number> {
    const dateStr = date.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('crypto_fx_rates')
        .select('rate_inr')
        .eq('asset_symbol', asset.toUpperCase())
        .lte('rate_date', dateStr)
        .order('rate_date', { ascending: false })
        .limit(1)
        .single();

    if (data?.rate_inr) return data.rate_inr;

    // Default fallback rates
    const defaults: Record<string, number> = {
        'USDT': 84, 'USDC': 84, 'BUSD': 84,
        'BTC': 7500000, 'ETH': 250000,
    };
    return defaults[asset.toUpperCase()] || 84;
}

/**
 * Create an FX rate lookup function that caches results
 */
export function createFxRateLookup(): (asset: string, date: Date) => number {
    const cache: Record<string, number> = {};

    return (asset: string, date: Date): number => {
        const key = `${asset}-${date.toISOString().split('T')[0]}`;
        if (cache[key] !== undefined) return cache[key];

        // Synchronous fallback with defaults
        const defaults: Record<string, number> = {
            'USDT': 84, 'USDC': 84, 'BUSD': 84,
            'BTC': 7500000, 'ETH': 250000,
        };
        const rate = defaults[asset.toUpperCase()] || 84;
        cache[key] = rate;
        return rate;
    };
}

// ============= IMPORT SESSION MANAGEMENT =============

/**
 * Create a new import session
 */
export async function createImportSession(
    financialYear: string,
    exchange: string = 'CoinDCX'
): Promise<PersistenceResult<{ sessionId: string }>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('crypto_import_sessions')
        .insert({
            user_id: user.id,
            exchange,
            financial_year: financialYear,
            status: 'pending',
            started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { sessionId: data.id } };
}

/**
 * Complete multi-file import pipeline:
 * 1. Create import session
 * 2. Parse each CSV file
 * 3. Deduplicate against existing data
 * 4. Insert transactions + TDS records
 * 5. Update session status
 */
export async function runFullImport(
    financialYear: string,
    files: { name: string; content: string; type?: 'trades' | 'deposits' | 'withdrawals' | 'tds' | 'rewards' }[],
    onProgress?: (progress: ImportProgress) => void
): Promise<PersistenceResult<ImportSessionResult>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const warnings: string[] = [];

    // 1. Create session
    const sessionResult = await createImportSession(financialYear);
    if (!sessionResult.success || !sessionResult.data) {
        return { success: false, error: sessionResult.error };
    }
    const sessionId = sessionResult.data.sessionId;

    const progress: ImportProgress = {
        sessionId,
        status: 'processing',
        totalFiles: files.length,
        processedFiles: 0,
        totalRows: 0,
        parsedRows: 0,
        duplicatesSkipped: 0,
        errors: [],
    };

    // Update session status
    await supabase
        .from('crypto_import_sessions')
        .update({ status: 'processing' })
        .eq('id', sessionId);

    try {
        // 2. Parse all files
        const fxLookup = createFxRateLookup();
        const importResult = await processImportSession(
            sessionId,
            financialYear,
            files.map(f => ({ ...f })),
            fxLookup
        );

        progress.totalRows = importResult.files.reduce((s, f) => s + f.totalRows, 0);

        // 3. For each file, check for content-hash duplicates and persist
        for (const fileResult of importResult.files) {
            // Check if this file was already uploaded
            const { data: existingFile } = await supabase
                .from('crypto_raw_files')
                .select('id')
                .eq('user_id', user.id)
                .eq('content_hash', fileResult.contentHash)
                .single();

            if (existingFile) {
                warnings.push(`File "${fileResult.fileName}" was already imported (same content hash). Skipping.`);
                progress.processedFiles++;
                progress.duplicatesSkipped += fileResult.totalRows;
                onProgress?.(progress);
                continue;
            }

            // Insert raw file record
            const { data: rawFile, error: rawFileError } = await supabase
                .from('crypto_raw_files')
                .insert({
                    session_id: sessionId,
                    user_id: user.id,
                    file_name: fileResult.fileName,
                    file_type: fileResult.fileType,
                    row_count: fileResult.totalRows,
                    parsed_count: fileResult.successCount,
                    error_count: fileResult.errorCount,
                    content_hash: fileResult.contentHash,
                    parse_errors: fileResult.errors,
                    status: 'completed',
                })
                .select('id')
                .single();

            if (rawFileError) {
                if (rawFileError.code === '23505') {
                    // Unique constraint violation — file already exists
                    warnings.push(`File "${fileResult.fileName}" already imported.`);
                    progress.processedFiles++;
                    onProgress?.(progress);
                    continue;
                }
                throw new Error(`Failed to save file record: ${rawFileError.message}`);
            }

            // Insert transactions in batches
            if (fileResult.transactions.length > 0) {
                const txBatch = fileResult.transactions.map(tx => ({
                    user_id: user.id,
                    import_session_id: sessionId,
                    raw_file_id: rawFile?.id,
                    external_id: tx.externalId,
                    exchange: tx.exchange,
                    transaction_type: tx.transactionType,
                    is_taxable_event: tx.isTaxableEvent,
                    category: tx.transactionType.startsWith('reward_') ? 'reward' :
                        tx.transactionType === 'deposit' || tx.transactionType === 'withdrawal' ? 'transfer' : 'trade',
                    asset_symbol: tx.assetSymbol,
                    quote_asset: tx.quoteAsset,
                    pair: tx.pair,
                    quantity: tx.quantity,
                    price_per_unit: tx.pricePerUnit,
                    price_inr: tx.priceInr,
                    gross_amount_quote: tx.grossAmountQuote,
                    gross_amount_inr: tx.grossAmountInr,
                    fee_amount: tx.feeAmount,
                    fee_asset: tx.feeAsset,
                    fee_inr: tx.feeInr,
                    tds_amount: tx.tdsAmount,
                    tds_rate: tx.tdsRate,
                    counter_asset: tx.counterAsset,
                    counter_quantity: tx.counterQuantity,
                    trade_timestamp: tx.tradeTimestamp.toISOString(),
                    financial_year: tx.financialYear,
                    assessment_year: tx.assessmentYear,
                    description: tx.description,
                    tx_hash: tx.txHash,
                    order_id: tx.orderId,
                    raw_data: tx.rawData,
                    content_hash: tx.contentHash,
                }));

                // Batch insert with ON CONFLICT DO NOTHING for idempotency
                const BATCH_SIZE = 100;
                for (let i = 0; i < txBatch.length; i += BATCH_SIZE) {
                    const batch = txBatch.slice(i, i + BATCH_SIZE);
                    const { error: insertError, count } = await supabase
                        .from('crypto_transactions')
                        .upsert(batch, {
                            onConflict: 'user_id,external_id,exchange,trade_timestamp,asset_symbol,transaction_type',
                            ignoreDuplicates: true,
                        });

                    if (insertError) {
                        warnings.push(`Batch insert error: ${insertError.message}`);
                    }

                    progress.parsedRows += batch.length;
                    onProgress?.(progress);
                }
            }

            // Insert TDS records
            if (fileResult.tdsRecords.length > 0) {
                const tdsBatch = fileResult.tdsRecords.map(r => ({
                    user_id: user.id,
                    import_session_id: sessionId,
                    tds_date: r.tdsDate.toISOString(),
                    section: r.section,
                    exchange: r.exchange,
                    gross_consideration_inr: r.grossConsiderationInr,
                    tds_rate: r.tdsRate,
                    tds_amount_inr: r.tdsAmountInr,
                    trade_reference: r.tradeReference,
                    certificate_number: r.certificateNumber,
                    tan_of_deductor: r.tanOfDeductor,
                    quarter: r.quarter,
                    financial_year: r.financialYear,
                    raw_data: r.rawData,
                }));

                const { error: tdsError } = await supabase
                    .from('crypto_tds_records')
                    .upsert(tdsBatch, {
                        onConflict: 'user_id,trade_reference,tds_date,exchange',
                        ignoreDuplicates: true,
                    });

                if (tdsError) {
                    warnings.push(`TDS insert error: ${tdsError.message}`);
                }
            }

            progress.processedFiles++;
            progress.errors.push(...fileResult.errors);
            onProgress?.(progress);
        }

        // 4. Update session as completed
        await supabase
            .from('crypto_import_sessions')
            .update({
                status: 'completed',
                total_files: files.length,
                total_rows_parsed: progress.totalRows,
                total_transactions_created: importResult.totalTransactions,
                total_duplicates_skipped: importResult.totalDuplicates,
                completed_at: new Date().toISOString(),
            })
            .eq('id', sessionId);

        progress.status = 'completed';
        onProgress?.(progress);

        return {
            success: true,
            data: importResult,
            warnings: [...warnings, ...importResult.warnings],
        };

    } catch (error) {
        // Update session as failed
        await supabase
            .from('crypto_import_sessions')
            .update({
                status: 'failed',
                error_message: (error as Error).message,
            })
            .eq('id', sessionId);

        progress.status = 'failed';
        onProgress?.(progress);

        return {
            success: false,
            error: `Import failed: ${(error as Error).message}`,
            warnings,
        };
    }
}

// ============= TAX COMPUTATION =============

/**
 * Load all transactions from DB and run the tax computation engine
 */
export async function computeTaxForFY(
    financialYear: string,
    method: AccountingMethod = 'FIFO'
): Promise<PersistenceResult<TaxComputationResult>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // 1. Fetch ALL transactions (including prior FY for cost basis)
    const { data: dbTransactions, error: txError } = await supabase
        .from('crypto_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('trade_timestamp', { ascending: true });

    if (txError) return { success: false, error: txError.message };
    if (!dbTransactions?.length) {
        return { success: false, error: 'No transactions found. Import your CoinDCX data first.' };
    }

    // Convert DB rows to NormalizedTransaction
    const transactions: NormalizedTransaction[] = dbTransactions.map(row => ({
        externalId: row.external_id || row.id,
        exchange: row.exchange,
        transactionType: row.transaction_type,
        isTaxableEvent: row.is_taxable_event,
        assetSymbol: row.asset_symbol,
        quoteAsset: row.quote_asset || 'INR',
        pair: row.pair || `${row.asset_symbol}/INR`,
        quantity: parseFloat(row.quantity) || 0,
        pricePerUnit: parseFloat(row.price_per_unit) || 0,
        priceInr: parseFloat(row.price_inr) || 0,
        grossAmountQuote: parseFloat(row.gross_amount_quote) || 0,
        grossAmountInr: parseFloat(row.gross_amount_inr) || 0,
        feeAmount: parseFloat(row.fee_amount) || 0,
        feeAsset: row.fee_asset || 'INR',
        feeInr: parseFloat(row.fee_inr) || 0,
        tdsAmount: parseFloat(row.tds_amount) || 0,
        tdsRate: parseFloat(row.tds_rate) || 0.01,
        counterAsset: row.counter_asset,
        counterQuantity: row.counter_quantity ? parseFloat(row.counter_quantity) : undefined,
        tradeTimestamp: new Date(row.trade_timestamp),
        financialYear: row.financial_year,
        assessmentYear: row.assessment_year,
        description: row.description || '',
        txHash: row.tx_hash,
        orderId: row.order_id,
        rawData: row.raw_data || {},
        contentHash: row.content_hash || '',
    }));

    // 2. Fetch TDS records
    const { data: dbTds } = await supabase
        .from('crypto_tds_records')
        .select('*')
        .eq('user_id', user.id);

    const tdsRecords: TDSRecord[] = (dbTds || []).map(row => ({
        tdsDate: new Date(row.tds_date),
        section: row.section,
        exchange: row.exchange,
        grossConsiderationInr: parseFloat(row.gross_consideration_inr) || 0,
        tdsRate: parseFloat(row.tds_rate) || 0.01,
        tdsAmountInr: parseFloat(row.tds_amount_inr) || 0,
        tradeReference: row.trade_reference || '',
        certificateNumber: row.certificate_number || '',
        tanOfDeductor: row.tan_of_deductor || '',
        quarter: row.quarter || '',
        financialYear: row.financial_year,
        rawData: row.raw_data || {},
    }));

    // 3. Run computation engine
    const result = computeVdaTaxForFinancialYear(
        transactions,
        tdsRecords,
        financialYear,
        method
    );

    // 4. Persist the summary
    await persistTaxSummary(user.id, result);

    return { success: true, data: result };
}

/**
 * Persist tax computation summary to DB
 */
async function persistTaxSummary(
    userId: string,
    result: TaxComputationResult
): Promise<void> {
    const summaryData = {
        user_id: userId,
        financial_year: result.financialYear,
        assessment_year: result.assessmentYear,
        total_buy_volume: result.assetSummaries.reduce((s, a) => s + (a.totalBought > 0 ? 1 : 0), 0),
        total_sell_volume: result.assetSummaries.reduce((s, a) => s + (a.totalSold > 0 ? 1 : 0), 0),
        total_consideration_inr: result.totalConsiderationInr,
        total_cost_of_acquisition_inr: result.totalCostOfAcquisitionInr,
        gross_gains_inr: result.grossCapitalGains,
        gross_losses_inr: result.grossCapitalLosses,
        net_gain_loss_inr: result.netGainLossInfo,
        taxable_capital_gains: result.taxableCapitalGains,
        other_income_inr: result.otherVDAIncome,
        tax_on_gains_30pct: result.taxOnGains30Pct,
        tax_on_other_30pct: result.taxOnOtherIncome30Pct,
        surcharge: result.surcharge,
        cess_4pct: result.cess4Pct,
        total_tax_liability: result.totalTaxLiability,
        total_tds_paid: result.totalTDSCredit,
        tds_reconciliation_status: result.tdsReconciliation.status,
        tds_discrepancy_pct: result.tdsReconciliation.discrepancyPct,
        net_tax_payable: result.netTaxPayable,
        total_vda_entries: result.totalVDAEntries,
        unique_assets_traded: result.uniqueAssets,
        accounting_method: result.accountingMethod,
        computed_at: result.computedAt.toISOString(),
        engine_version: result.engineVersion,
        updated_at: new Date().toISOString(),
    };

    await supabase
        .from('crypto_tax_summaries')
        .upsert(summaryData, {
            onConflict: 'user_id,financial_year',
        });

    // Also persist VDA report lines
    // First delete old ones for this FY
    await supabase
        .from('crypto_vda_report_lines')
        .delete()
        .eq('user_id', userId)
        .eq('financial_year', result.financialYear);

    if (result.vdaReportLines.length > 0) {
        const vdaRows = result.vdaReportLines.map(line => ({
            user_id: userId,
            financial_year: result.financialYear,
            sl_no: line.slNo,
            date_of_transfer: line.dateOfTransfer.split('/').reverse().join('-'), // to YYYY-MM-DD
            date_of_acquisition: line.dateOfAcquisition.split('/').reverse().join('-'),
            head_of_income: line.headOfIncome,
            description_of_vda: line.descriptionOfVDA,
            asset_symbol: line.assetSymbol,
            sale_consideration: line.saleConsideration,
            cost_of_acquisition: line.costOfAcquisition,
            income_from_transfer: line.incomeFromTransfer,
            exchange: line.exchange,
        }));

        await supabase
            .from('crypto_vda_report_lines')
            .insert(vdaRows);
    }
}

// ============= DATA FETCHING =============

/**
 * Get the cached tax summary for a FY
 */
export async function getCachedTaxSummary(
    financialYear: string
): Promise<PersistenceResult<Record<string, any>>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('crypto_tax_summaries')
        .select('*')
        .eq('user_id', user.id)
        .eq('financial_year', financialYear)
        .single();

    if (error) return { success: false, error: 'No tax computation found. Run calculation first.' };
    return { success: true, data };
}

/**
 * Get all import sessions for the user
 */
export async function getImportSessions(): Promise<PersistenceResult<any[]>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('crypto_import_sessions')
        .select('*, crypto_raw_files(id, file_name, file_type, row_count, parsed_count, error_count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
}

/**
 * Get transaction count by FY
 */
export async function getTransactionStats(
    financialYear?: string
): Promise<PersistenceResult<{
    total: number;
    buys: number;
    sells: number;
    rewards: number;
    deposits: number;
    withdrawals: number;
    uniqueAssets: number;
}>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    let query = supabase
        .from('crypto_transactions')
        .select('transaction_type, asset_symbol')
        .eq('user_id', user.id);

    if (financialYear) {
        query = query.eq('financial_year', financialYear);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = data || [];
    const assets = new Set(rows.map(r => r.asset_symbol));

    return {
        success: true,
        data: {
            total: rows.length,
            buys: rows.filter(r => r.transaction_type === 'buy').length,
            sells: rows.filter(r => r.transaction_type === 'sell').length,
            rewards: rows.filter(r => r.transaction_type.startsWith('reward_')).length,
            deposits: rows.filter(r => r.transaction_type === 'deposit').length,
            withdrawals: rows.filter(r => r.transaction_type === 'withdrawal').length,
            uniqueAssets: assets.size,
        }
    };
}

/**
 * Get VDA Schedule report lines for a FY
 */
export async function getVDAReportLines(
    financialYear: string
): Promise<PersistenceResult<any[]>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
        .from('crypto_vda_report_lines')
        .select('*')
        .eq('user_id', user.id)
        .eq('financial_year', financialYear)
        .order('sl_no', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
}

/**
 * Delete all data for an import session (rollback)
 */
export async function rollbackImportSession(
    sessionId: string
): Promise<PersistenceResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Delete transactions
    await supabase
        .from('crypto_transactions')
        .delete()
        .eq('import_session_id', sessionId)
        .eq('user_id', user.id);

    // Delete TDS records
    await supabase
        .from('crypto_tds_records')
        .delete()
        .eq('import_session_id', sessionId)
        .eq('user_id', user.id);

    // Delete raw files
    await supabase
        .from('crypto_raw_files')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

    // Delete session
    await supabase
        .from('crypto_import_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);

    return { success: true };
}

// ============= REPORT EXPORTS =============

/**
 * Export Schedule VDA as downloadable CSV
 */
export async function exportScheduleVDA(
    financialYear: string
): Promise<PersistenceResult<{ csv: string; filename: string }>> {
    const result = await computeTaxForFY(financialYear);
    if (!result.success || !result.data) {
        return { success: false, error: result.error };
    }

    const csv = generateScheduleVDACSV(result.data);
    const filename = `EasyITR_ScheduleVDA_${financialYear}_${new Date().toISOString().split('T')[0]}.csv`;

    return { success: true, data: { csv, filename } };
}

/**
 * Export TDS Reconciliation as downloadable CSV
 */
export async function exportTDSReconciliation(
    financialYear: string
): Promise<PersistenceResult<{ csv: string; filename: string }>> {
    const result = await computeTaxForFY(financialYear);
    if (!result.success || !result.data) {
        return { success: false, error: result.error };
    }

    const csv = generateTDSReconciliationCSV(result.data);
    const filename = `EasyITR_TDSReconciliation_${financialYear}_${new Date().toISOString().split('T')[0]}.csv`;

    return { success: true, data: { csv, filename } };
}

/**
 * Get full P&L summary formatted for UI display
 */
export async function getPnLSummary(
    financialYear: string
): Promise<PersistenceResult<ReturnType<typeof formatPnLSummary>>> {
    const result = await computeTaxForFY(financialYear);
    if (!result.success || !result.data) {
        return { success: false, error: result.error };
    }

    return { success: true, data: formatPnLSummary(result.data) };
}

