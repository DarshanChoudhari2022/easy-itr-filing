/**
 * Crypto → ITR Bridge
 * 
 * Syncs crypto tax data from the Crypto module into the central
 * filing session. This is the pipeline that sends Schedule VDA,
 * taxable gains, and TDS credit into the ITR.
 */

import {
    FilingSession, CryptoVDAIncome, ScheduleVDAEntry,
    saveFilingSession, getOrCreateSession
} from '@/lib/filing-session';
import {
    fetchOverview, fetchScheduleVDA, checkDataQuality,
    type TaxSummary, type ScheduleVDAResponse
} from '@/lib/easyitr/api-client';

export interface CryptoSyncResult {
    success: boolean;
    message: string;
    taxableGains: number;
    tdsCredit: number;
    numEntries: number;
    warnings: string[];
}

/**
 * Sync crypto data from the Crypto module into the filing session.
 * Call this when user clicks "Send to ITR" on the Crypto page.
 */
export async function syncCryptoToFiling(
    userId: string,
    financialYear: string,
): Promise<CryptoSyncResult> {
    const warnings: string[] = [];

    try {
        // 1. Fetch latest computed tax data
        const [overview, scheduleVDA, quality] = await Promise.all([
            fetchOverview(financialYear),
            fetchScheduleVDA(financialYear).catch(() => null),
            checkDataQuality(financialYear).catch(() => null),
        ]);

        // Check if tax has been computed
        if (overview.not_computed) {
            return {
                success: false,
                message: 'No tax computation found. Click "Refresh" on the Crypto page first to compute your tax.',
                taxableGains: 0,
                tdsCredit: 0,
                numEntries: 0,
                warnings: [],
            };
        }

        const summary = overview as TaxSummary;

        // 2. Build Schedule VDA entries
        const vdaEntries: ScheduleVDAEntry[] = [];
        if (scheduleVDA?.rows) {
            for (const row of scheduleVDA.rows) {
                vdaEntries.push({
                    slNo: row.sl_no,
                    asset: row.asset,
                    description: row.description || `Transfer of ${row.asset}`,
                    dateOfAcquisition: row.date_of_acquisition,
                    dateOfTransfer: row.date_of_transfer,
                    costOfAcquisition: row.cost_of_acquisition,
                    saleConsideration: row.sale_consideration,
                    incomeFromTransfer: row.income_from_transfer,
                    taxableIncome: row.taxable_income,
                });
            }
        }

        // 3. Data quality warnings
        if (quality?.warnings) {
            for (const w of quality.warnings) {
                warnings.push(`[${w.severity.toUpperCase()}] ${w.message}`);
            }
        }

        // 4. Get or create filing session
        const session = await getOrCreateSession(userId, financialYear);

        // 5. Update crypto section
        const cryptoData: CryptoVDAIncome = {
            enabled: true,
            taxableGains: summary.taxable_capital_gains,
            saleConsideration: summary.sale_consideration,
            costOfAcquisition: summary.cost_of_acquisition,
            grossLosses: summary.gross_losses,
            otherIncome: summary.total_other_income,
            tdsCredit: summary.tds_credit,
            numSellEvents: summary.num_sell_events,
            numFifoLots: summary.num_fifo_lots,
            financialYear: financialYear,
            scheduleVDA: vdaEntries,
            syncedAt: new Date().toISOString(),
        };

        session.cryptoVDA = cryptoData;

        // 6. Update TDS
        session.taxesPaid.tdsCrypto = summary.tds_credit;

        // 7. Save
        await saveFilingSession(session);

        return {
            success: true,
            message: `Crypto data synced! ${summary.num_sell_events} sell trades, ₹${summary.taxable_capital_gains.toLocaleString('en-IN')} taxable gains, ₹${summary.tds_credit.toLocaleString('en-IN')} TDS credit.`,
            taxableGains: summary.taxable_capital_gains,
            tdsCredit: summary.tds_credit,
            numEntries: vdaEntries.length,
            warnings,
        };
    } catch (e) {
        return {
            success: false,
            message: `Failed to sync crypto data: ${(e as Error).message}`,
            taxableGains: 0,
            tdsCredit: 0,
            numEntries: 0,
            warnings,
        };
    }
}

/**
 * Check if crypto data has been synced for this FY.
 */
export async function isCryptoSynced(userId: string, fy: string): Promise<boolean> {
    try {
        const session = await getOrCreateSession(userId, fy);
        return session.cryptoVDA.enabled && !!session.cryptoVDA.syncedAt;
    } catch {
        return false;
    }
}

