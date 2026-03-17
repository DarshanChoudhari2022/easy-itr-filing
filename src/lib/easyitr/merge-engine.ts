/**
 * EasyITR — Merge & Deduplication Engine
 * =======================================
 * Responsible for merging data from multiple sources (API, CSV, Manual)
 * and ensuring no duplicate transactions exist in the normalized layer.
 */

import { NormalizedTransaction } from './coindcx-ingestion';
import { supabase } from '../../integrations/supabase/client';

export interface MergeResult {
    added: number;
    skipped: number;
    duplicates: number; // For UI consistency
    updated: number;
    errors: string[];
    mergedTransactions: NormalizedTransaction[];
}

/**
 * Compute a fingerprint for a transaction that doesn't have a reliable external ID.
 * Used as a fallback for deduplication.
 */
export function computeTxFingerprint(tx: Partial<NormalizedTransaction>): string {
    const date = tx.tradeTimestamp instanceof Date
        ? tx.tradeTimestamp.toISOString()
        : new Date(tx.tradeTimestamp || '').toISOString();

    // Canonical string: Date | Asset | Qty | Type | Price
    // We use fixed precision for numbers to avoid floating point mismatches during hashing
    const parts = [
        date,
        (tx.assetSymbol || '').toUpperCase(),
        Number(tx.quantity || 0).toFixed(10),
        (tx.transactionType || '').toLowerCase(),
        Number(tx.priceInr || 0).toFixed(6),
        (tx.exchange || 'CoinDCX').toLowerCase()
    ];

    return parts.join('|');
}

/**
 * Merge new transactions into the database, handling duplicates safely.
 * Strategy:
 * 1. Check for existing content_hash (Exact match)
 * 2. If no hash match, check for (external_id + exchange)
 * 3. Priority: API > CSV > Manual
 */
export async function mergeTransactions(
    userId: string,
    transactions: NormalizedTransaction[],
    sourceType: 'api' | 'csv' | 'manual' = 'api'
): Promise<MergeResult> {
    const result: MergeResult = {
        added: 0,
        skipped: 0,
        duplicates: 0,
        updated: 0,
        errors: [],
        mergedTransactions: []
    };

    if (!transactions.length) {
        // Even if input is empty, fetch existing for UI consistency
        const { data: allExisting } = await supabase
            .from('normalized_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('trade_timestamp', { ascending: true });

        result.mergedTransactions = (allExisting || []).map((dbTx: any) => mapDbToNormalized(dbTx));
        return result;
    }

    // 1. Get existing hashes for this user to do quick local filtering
    const { data: existing, error: fetchError } = await supabase
        .from('normalized_transactions')
        .select('content_hash, external_id')
        .eq('user_id', userId);

    if (fetchError) {
        result.errors.push(`Failed to fetch existing transactions: ${fetchError.message}`);
        return result;
    }

    const existingHashes = new Set(existing?.map(tx => tx.content_hash) || []);
    const existingExternalIds = new Set(existing?.map(tx => tx.external_id).filter(Boolean) || []);

    const toInsert: any[] = [];

    for (const tx of transactions) {
        // Determine content hash if not present
        const hash = tx.contentHash || computeTxFingerprint(tx);

        // Skip if hash already exists
        if (existingHashes.has(hash)) {
            result.skipped++;
            result.duplicates++;
            continue;
        }

        // Skip if external ID already exists (prevents API/CSV overlap)
        if (tx.externalId && existingExternalIds.has(tx.externalId)) {
            result.skipped++;
            result.duplicates++;
            continue;
        }

        // Map to db schema (v5)
        toInsert.push({
            user_id: userId,
            external_id: tx.externalId || `man-${Math.random().toString(36).substr(2, 9)}`,
            exchange: tx.exchange || 'CoinDCX',
            transaction_type: tx.transactionType,
            event_class: tx.event_class || 'UNKNOWN', // Should be classified before merge
            is_taxable_event: !!tx.isTaxableEvent,
            asset_symbol: tx.assetSymbol,
            quote_asset: tx.quoteAsset || 'INR',
            pair: tx.pair,
            quantity: tx.quantity,
            price_per_unit: tx.pricePerUnit,
            price_inr: tx.priceInr,
            gross_amount_quote: tx.grossAmountQuote,
            gross_amount_inr: tx.grossAmountInr,
            fee_amount: tx.feeAmount || 0,
            fee_asset: tx.feeAsset || 'INR',
            fee_inr: tx.feeInr || 0,
            tds_amount: tx.tdsAmount || 0,
            tds_rate: tx.tdsRate || 0,
            trade_timestamp: tx.tradeTimestamp,
            financial_year: tx.financialYear,
            assessment_year: tx.assessmentYear,
            source: sourceType,
            source_priority: sourceType === 'api' ? 1 : sourceType === 'csv' ? 2 : 3,
            content_hash: hash,
            description: tx.description,
            order_id: tx.orderId,
            tx_hash: tx.txHash,
            metadata: tx.rawData || {}
        });
    }

    if (toInsert.length > 0) {
        // Insert in batches of 500
        const batchSize = 500;
        for (let i = 0; i < toInsert.length; i += batchSize) {
            const batch = toInsert.slice(i, i + batchSize);
            const { error: insertError } = await supabase
                .from('normalized_transactions')
                .insert(batch);

            if (insertError) {
                result.errors.push(`Insert error at batch ${Math.floor(i / batchSize)}: ${insertError.message}`);
            } else {
                result.added += batch.length;
            }
        }
    }

    // 3. Fetch COMPLETE history for UI (merged view)
    const { data: finalHistory } = await supabase
        .from('normalized_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('trade_timestamp', { ascending: true });

    result.mergedTransactions = (finalHistory || []).map((dbTx: any) => mapDbToNormalized(dbTx));

    return result;
}

/** Helper to map DB record back to NormalizedTransaction */
function mapDbToNormalized(db: any): NormalizedTransaction {
    return {
        externalId: db.external_id,
        exchange: db.exchange,
        transactionType: db.transaction_type,
        event_class: db.event_class,
        isTaxableEvent: db.is_taxable_event,
        assetSymbol: db.asset_symbol,
        quoteAsset: db.quote_asset,
        pair: db.pair,
        quantity: db.quantity,
        pricePerUnit: db.price_per_unit,
        priceInr: db.price_inr,
        grossAmountQuote: db.gross_amount_quote,
        grossAmountInr: db.gross_amount_inr,
        feeAmount: db.fee_amount,
        feeAsset: db.fee_asset,
        feeInr: db.fee_inr,
        tdsAmount: db.tds_amount,
        tdsRate: db.tds_rate,
        tradeTimestamp: new Date(db.trade_timestamp),
        financialYear: db.financial_year,
        assessmentYear: db.assessment_year,
        description: db.description,
        orderId: db.order_id,
        txHash: db.tx_hash,
        contentHash: db.content_hash,
        rawData: db.metadata || {}
    };
}

