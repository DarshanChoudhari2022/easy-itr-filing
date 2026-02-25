/**
 * TaxMitra — Gap Detector
 * ========================
 * Detects date range gaps, truncated CSVs, and missing data periods
 * within imported transaction data for a given Financial Year.
 */

import type { NormalizedTransaction } from './coindcx-ingestion';
import { getFYDateRange } from './coverage-tracker';

// ============= TYPES =============

export type GapType =
    | 'MISSING_DATE_RANGE'
    | 'TRUNCATED_CSV'
    | 'FY_START_GAP'
    | 'FY_END_GAP'
    | 'NO_DATA_FOR_FY'
    | 'SUSPICIOUS_ROUND_COUNT';

export type GapSeverity = 'blocker' | 'critical' | 'warning' | 'info';

export interface DataGap {
    type: GapType;
    severity: GapSeverity;
    title: string;
    description: string;
    actionRequired: string;
    startDate?: Date;
    endDate?: Date;
    durationDays?: number;
    affectedAssets?: string[];
    metadata?: Record<string, any>;
}

export interface GapDetectionResult {
    gaps: DataGap[];
    dateRangeCoverage: {
        fyStart: Date;
        fyEnd: Date;
        dataStart: Date | null;
        dataEnd: Date | null;
        coversPct: number;  // 0-100 how much of FY is covered
    };
    monthlyActivity: MonthActivity[];
    totalTransactions: number;
}

export interface MonthActivity {
    month: string;          // 'Apr 2024'
    year: number;
    monthIndex: number;     // 0-11
    transactionCount: number;
    hasActivity: boolean;
}

// ============= CONSTANTS =============

const MAX_GAP_DAYS_DEFAULT = 14;

// ============= CORE FUNCTIONS =============

/**
 * Run full gap detection on transactions for a given FY.
 */
export function detectGaps(
    transactions: NormalizedTransaction[],
    financialYear: string,
    options: { maxGapDays?: number } = {}
): GapDetectionResult {
    const maxGapDays = options.maxGapDays ?? MAX_GAP_DAYS_DEFAULT;
    const { start: fyStart, end: fyEnd } = getFYDateRange(financialYear);
    const gaps: DataGap[] = [];

    // Filter to FY transactions only
    const fyTxs = transactions
        .filter(tx => {
            const ts = tx.tradeTimestamp instanceof Date ? tx.tradeTimestamp : new Date(tx.tradeTimestamp);
            return ts >= fyStart && ts <= fyEnd;
        })
        .sort((a, b) => {
            const aTime = a.tradeTimestamp instanceof Date ? a.tradeTimestamp.getTime() : new Date(a.tradeTimestamp).getTime();
            const bTime = b.tradeTimestamp instanceof Date ? b.tradeTimestamp.getTime() : new Date(b.tradeTimestamp).getTime();
            return aTime - bTime;
        });

    // Calculate monthly activity
    const monthlyActivity = computeMonthlyActivity(fyTxs, financialYear);

    // No data at all
    if (fyTxs.length === 0) {
        gaps.push({
            type: 'NO_DATA_FOR_FY',
            severity: 'blocker',
            title: 'No transactions found for this FY',
            description: `No transactions found between ${formatDate(fyStart)} and ${formatDate(fyEnd)}. Upload your Order History CSV from CoinDCX.`,
            actionRequired: 'Upload Order History CSV covering the full financial year.',
        });

        return {
            gaps,
            dateRangeCoverage: {
                fyStart, fyEnd,
                dataStart: null, dataEnd: null,
                coversPct: 0,
            },
            monthlyActivity,
            totalTransactions: 0,
        };
    }

    const firstTxDate = getTimestamp(fyTxs[0]);
    const lastTxDate = getTimestamp(fyTxs[fyTxs.length - 1]);

    // 1. Check gap at start of FY
    const startGapDays = daysBetween(fyStart, firstTxDate);
    if (startGapDays > maxGapDays) {
        gaps.push({
            type: 'FY_START_GAP',
            severity: startGapDays > 60 ? 'critical' : 'warning',
            title: `No trades from start of FY to ${formatDate(firstTxDate)}`,
            description: `${startGapDays}-day gap at the beginning of the financial year. First trade found on ${formatDate(firstTxDate)}.`,
            actionRequired: startGapDays > 60
                ? 'Verify your CSV date range starts from 1 April. Re-download if needed.'
                : 'This may be normal if you started trading later. Verify with CoinDCX.',
            startDate: fyStart,
            endDate: firstTxDate,
            durationDays: startGapDays,
        });
    }

    // 2. Check inter-transaction gaps
    for (let i = 1; i < fyTxs.length; i++) {
        const prevDate = getTimestamp(fyTxs[i - 1]);
        const currDate = getTimestamp(fyTxs[i]);
        const gapDays = daysBetween(prevDate, currDate);

        if (gapDays > maxGapDays * 3) { // Only flag very large gaps (>42 days)
            gaps.push({
                type: 'MISSING_DATE_RANGE',
                severity: gapDays > 60 ? 'warning' : 'info',
                title: `${gapDays}-day gap detected`,
                description: `No trades between ${formatDate(prevDate)} and ${formatDate(currDate)} (${gapDays} days).`,
                actionRequired: 'This could be normal inactivity. If you traded during this period, your CSV may be incomplete.',
                startDate: prevDate,
                endDate: currDate,
                durationDays: gapDays,
            });
        }
    }

    // 3. Check gap at end of FY
    const endGapDays = daysBetween(lastTxDate, fyEnd);
    if (endGapDays > maxGapDays) {
        gaps.push({
            type: 'FY_END_GAP',
            severity: endGapDays > 60 ? 'warning' : 'info',
            title: `No trades after ${formatDate(lastTxDate)} until FY end`,
            description: `${endGapDays}-day gap at the end of the financial year. Last trade on ${formatDate(lastTxDate)}.`,
            actionRequired: 'Verify your CSV date range extends to 31 March.',
            startDate: lastTxDate,
            endDate: fyEnd,
            durationDays: endGapDays,
        });
    }

    // 4. Check for truncated CSV (suspiciously round row counts)
    const totalRows = fyTxs.length;
    if (totalRows > 0 && (totalRows % 500 === 0 || totalRows % 1000 === 0)) {
        gaps.push({
            type: 'SUSPICIOUS_ROUND_COUNT',
            severity: 'warning',
            title: `CSV has exactly ${totalRows} rows — possible truncation`,
            description: `The imported data contains exactly ${totalRows} rows, which is a common pagination limit. Your data may be truncated.`,
            actionRequired: 'Re-download the CSV with the full date range, or check CoinDCX for additional pages.',
            metadata: { rowCount: totalRows },
        });
    }

    // Calculate coverage percentage
    const fyDurationMs = fyEnd.getTime() - fyStart.getTime();
    const dataDurationMs = lastTxDate.getTime() - firstTxDate.getTime();
    const coversPct = fyDurationMs > 0 ? Math.round((dataDurationMs / fyDurationMs) * 100) : 0;

    return {
        gaps,
        dateRangeCoverage: {
            fyStart, fyEnd,
            dataStart: firstTxDate,
            dataEnd: lastTxDate,
            coversPct: Math.min(100, coversPct),
        },
        monthlyActivity,
        totalTransactions: fyTxs.length,
    };
}

// ============= HELPERS =============

function computeMonthlyActivity(
    txs: NormalizedTransaction[],
    financialYear: string
): MonthActivity[] {
    const startYear = parseInt(financialYear.split('-')[0]);
    const months: MonthActivity[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // FY: April of startYear to March of startYear+1
    for (let m = 3; m < 15; m++) { // 3=April to 14=March next year
        const actualMonth = m % 12;
        const actualYear = m < 12 ? startYear : startYear + 1;
        const monthLabel = `${monthNames[actualMonth]} ${actualYear}`;

        const count = txs.filter(tx => {
            const d = getTimestamp(tx);
            return d.getMonth() === actualMonth && d.getFullYear() === actualYear;
        }).length;

        months.push({
            month: monthLabel,
            year: actualYear,
            monthIndex: actualMonth,
            transactionCount: count,
            hasActivity: count > 0,
        });
    }

    return months;
}

function getTimestamp(tx: NormalizedTransaction): Date {
    return tx.tradeTimestamp instanceof Date ? tx.tradeTimestamp : new Date(tx.tradeTimestamp);
}

function daysBetween(a: Date, b: Date): number {
    return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
