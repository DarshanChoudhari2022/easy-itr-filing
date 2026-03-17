/**
 * EasyITR — KoinX Reconciliation Engine
 * =======================================
 * 
 * Compares EasyITR's computed output against KoinX reference data.
 * Generates a detailed reconciliation report highlighting any discrepancies.
 * 
 * Usage:
 *   Import in the Crypto.tsx page to show a reconciliation dashboard.
 *   Can also be used standalone for debugging.
 * 
 * @version 1.0.0
 */

import type { TaxComputationResult, LotMatch } from './tax-computation-engine';

// ============= TYPES =============

export interface KoinXReference {
    financialYear: string;
    totalTransactions: number;           // KoinX transaction count
    totalCapitalGains: number;           // Total taxable gains (₹)
    totalSaleConsideration: number;      // Total sale value (₹)
    totalCostOfAcquisition: number;      // Total cost basis (₹)
    totalCapitalLosses?: number;         // Total losses (₹)
    tdsCredit: number;                   // TDS credit from KoinX (₹)
    otherIncome: number;                 // Staking/Rewards income (₹)
    totalBrokerage?: number;             // Total fees (₹)
    /** Per-asset breakdown from KoinX (optional, for detailed reconciliation) */
    assetBreakdown?: KoinXAssetBreakdown[];
}

export interface KoinXAssetBreakdown {
    assetSymbol: string;
    transactionCount: number;
    totalGains: number;
    totalLosses: number;
    saleConsideration: number;
    costOfAcquisition: number;
}

export interface ReconciliationResult {
    financialYear: string;
    overallStatus: 'MATCHED' | 'MINOR_DISCREPANCY' | 'MAJOR_DISCREPANCY';
    checks: ReconciliationCheck[];
    assetChecks: AssetReconciliation[];
    summary: string;
    detailedReport: string;
}

export interface ReconciliationCheck {
    metric: string;
    easyITRValue: number;
    koinxValue: number;
    discrepancy: number;
    discrepancyPct: number;
    status: 'MATCH' | 'MINOR' | 'MAJOR' | 'CRITICAL';
    notes: string;
}

export interface AssetReconciliation {
    assetSymbol: string;
    easyITRGains: number;
    koinxGains: number;
    discrepancy: number;
    status: 'MATCH' | 'MINOR' | 'MAJOR' | 'CRITICAL';
}

// ============= RECONCILIATION ENGINE =============

/**
 * Compare EasyITR computation result against KoinX reference data.
 * Returns a detailed reconciliation report.
 */
export function reconcileWithKoinX(
    easyITRResult: TaxComputationResult,
    koinxRef: KoinXReference,
    toleranceInr: number = 500 // Default tolerance: ₹500
): ReconciliationResult {
    const checks: ReconciliationCheck[] = [];

    // 1. Transaction Count
    const txCount = easyITRResult.totalVDAEntries;
    checks.push(makeCheck(
        'Transaction Count',
        txCount,
        koinxRef.totalTransactions,
        0, // Zero tolerance for count
        'Number of sell transactions (Schedule VDA entries)'
    ));

    // 2. Total Taxable Capital Gains
    checks.push(makeCheck(
        'Taxable Capital Gains',
        easyITRResult.taxableCapitalGains,
        koinxRef.totalCapitalGains,
        toleranceInr,
        'Sum of profitable trade gains only (no loss offset per 115BBH)'
    ));

    // 3. Total Sale Consideration
    checks.push(makeCheck(
        'Total Sale Consideration',
        easyITRResult.totalConsiderationInr,
        koinxRef.totalSaleConsideration,
        toleranceInr * 2,
        'Total value of all disposals in the FY'
    ));

    // 4. Total Cost of Acquisition
    checks.push(makeCheck(
        'Cost of Acquisition',
        easyITRResult.totalCostOfAcquisitionInr,
        koinxRef.totalCostOfAcquisition,
        toleranceInr * 2,
        'Total FIFO cost basis for disposed assets'
    ));

    // 5. TDS Credit
    checks.push(makeCheck(
        'TDS Credit',
        easyITRResult.totalTDSCredit,
        koinxRef.tdsCredit,
        50, // Tight tolerance for TDS (₹50)
        'TDS deducted under Section 194S'
    ));

    // 6. Other Income
    checks.push(makeCheck(
        'Other VDA Income',
        easyITRResult.otherVDAIncome,
        koinxRef.otherIncome,
        100, // ₹100 tolerance
        'Staking rewards, interest, airdrops valued at FMV'
    ));

    // 7. Capital Losses (informational)
    if (koinxRef.totalCapitalLosses !== undefined) {
        checks.push(makeCheck(
            'Capital Losses (Info)',
            easyITRResult.grossCapitalLosses,
            koinxRef.totalCapitalLosses,
            toleranceInr,
            'Sum of loss-making trades (cannot offset gains per 115BBH)'
        ));
    }

    // Asset-level reconciliation
    const assetChecks: AssetReconciliation[] = [];
    if (koinxRef.assetBreakdown) {
        for (const koinxAsset of koinxRef.assetBreakdown) {
            const tmAsset = easyITRResult.assetSummaries.find(
                a => a.assetSymbol.toUpperCase() === koinxAsset.assetSymbol.toUpperCase()
            );

            assetChecks.push({
                assetSymbol: koinxAsset.assetSymbol,
                easyITRGains: tmAsset?.taxableGain || 0,
                koinxGains: koinxAsset.totalGains,
                discrepancy: Math.abs((tmAsset?.taxableGain || 0) - koinxAsset.totalGains),
                status: getStatus(
                    Math.abs((tmAsset?.taxableGain || 0) - koinxAsset.totalGains),
                    Math.max(koinxAsset.totalGains, 1),
                    toleranceInr
                ),
            });
        }
    }

    // Overall status
    const criticalCount = checks.filter(c => c.status === 'CRITICAL').length;
    const majorCount = checks.filter(c => c.status === 'MAJOR').length;
    const overallStatus = criticalCount > 0 ? 'MAJOR_DISCREPANCY'
        : majorCount > 0 ? 'MINOR_DISCREPANCY'
            : 'MATCHED';

    // Generate reports
    const summary = generateSummary(checks, overallStatus);
    const detailedReport = generateDetailedReport(checks, assetChecks, easyITRResult);

    return {
        financialYear: easyITRResult.financialYear,
        overallStatus,
        checks,
        assetChecks,
        summary,
        detailedReport,
    };
}

// ============= HELPERS =============

function makeCheck(
    metric: string,
    easyITRValue: number,
    koinxValue: number,
    toleranceInr: number,
    notes: string
): ReconciliationCheck {
    const discrepancy = Math.abs(easyITRValue - koinxValue);
    const base = Math.max(Math.abs(koinxValue), 1);
    const discrepancyPct = (discrepancy / base) * 100;

    return {
        metric,
        easyITRValue: Math.round(easyITRValue * 100) / 100,
        koinxValue: Math.round(koinxValue * 100) / 100,
        discrepancy: Math.round(discrepancy * 100) / 100,
        discrepancyPct: Math.round(discrepancyPct * 100) / 100,
        status: getStatus(discrepancy, base, toleranceInr),
        notes,
    };
}

function getStatus(
    discrepancy: number,
    base: number,
    toleranceInr: number
): ReconciliationCheck['status'] {
    if (discrepancy < 1) return 'MATCH';
    if (discrepancy <= toleranceInr) return 'MINOR';
    if (discrepancy <= toleranceInr * 5) return 'MAJOR';
    return 'CRITICAL';
}

function generateSummary(checks: ReconciliationCheck[], status: string): string {
    const matched = checks.filter(c => c.status === 'MATCH').length;
    const total = checks.length;

    let summary = `## KoinX Reconciliation: ${status}\n\n`;
    summary += `**${matched}/${total}** metrics matched within tolerance.\n\n`;

    for (const check of checks) {
        const icon = check.status === 'MATCH' ? '✅' :
            check.status === 'MINOR' ? '🟡' :
                check.status === 'MAJOR' ? '🟠' : '🔴';
        summary += `${icon} **${check.metric}**: EasyITR ₹${check.easyITRValue.toLocaleString('en-IN')} vs KoinX ₹${check.koinxValue.toLocaleString('en-IN')}`;
        if (check.discrepancy > 0) {
            summary += ` (Δ ₹${check.discrepancy.toLocaleString('en-IN')}, ${check.discrepancyPct}%)`;
        }
        summary += '\n';
    }

    return summary;
}

function generateDetailedReport(
    checks: ReconciliationCheck[],
    assetChecks: AssetReconciliation[],
    result: TaxComputationResult
): string {
    let report = `# EasyITR vs KoinX — Detailed Reconciliation Report\n`;
    report += `**FY:** ${result.financialYear} | **Engine:** v${result.engineVersion} | **Computed:** ${result.computedAt.toISOString()}\n\n`;

    report += `## Metric Comparison\n\n`;
    report += `| Metric | EasyITR | KoinX | Δ | Δ% | Status |\n`;
    report += `|--------|----------|-------|---|----|---------|\n`;
    for (const c of checks) {
        report += `| ${c.metric} | ₹${c.easyITRValue.toLocaleString('en-IN')} | ₹${c.koinxValue.toLocaleString('en-IN')} | ₹${c.discrepancy.toLocaleString('en-IN')} | ${c.discrepancyPct}% | ${c.status} |\n`;
    }

    if (assetChecks.length > 0) {
        report += `\n## Per-Asset Comparison\n\n`;
        report += `| Asset | EasyITR Gains | KoinX Gains | Δ | Status |\n`;
        report += `|-------|----------------|-------------|---|--------|\n`;
        for (const a of assetChecks) {
            report += `| ${a.assetSymbol} | ₹${a.easyITRGains.toLocaleString('en-IN')} | ₹${a.koinxGains.toLocaleString('en-IN')} | ₹${a.discrepancy.toLocaleString('en-IN')} | ${a.status} |\n`;
        }
    }

    if (result.aggregationStats) {
        report += `\n## Order Aggregation Stats\n\n`;
        report += `- **Input fills:** ${result.aggregationStats.inputFillCount}\n`;
        report += `- **Output orders:** ${result.aggregationStats.outputOrderCount}\n`;
        report += `- **Multi-fill orders:** ${result.aggregationStats.multiFillOrders}\n`;
        report += `- **Filtered transactions:** ${result.aggregationStats.filteredCount}\n`;
        if (Object.keys(result.aggregationStats.filterReasons).length > 0) {
            report += `- **Filter reasons:**\n`;
            for (const [reason, count] of Object.entries(result.aggregationStats.filterReasons)) {
                report += `  - ${reason}: ${count}\n`;
            }
        }
    }

    report += `\n## Warnings (${result.warnings.length})\n\n`;
    for (const w of result.warnings.slice(0, 50)) {
        report += `- ${w}\n`;
    }
    if (result.warnings.length > 50) {
        report += `- ... and ${result.warnings.length - 50} more\n`;
    }

    return report;
}

// ============= OPTIONAL REFERENCE DATA (for cross-validation only) =============

/**
 * Optional KoinX reference data for cross-validation.
 * 
 * IMPORTANT: These values are NOT used by the tax engine.
 * The engine is self-sufficient and computes everything from trade data.
 * These references are ONLY used by the reconciliation dashboard
 * to help you visually verify your engine output against a known benchmark.
 * 
 * Update these values from your KoinX/Form 26AS screenshots if you want
 * to run a side-by-side comparison.
 */
export const KOINX_REFERENCE_FY2024_25: KoinXReference = {
    financialYear: '2024-25',
    totalTransactions: 71,
    totalCapitalGains: 164000,        // ₹1.64L — from KoinX FY 2024-25
    totalSaleConsideration: 0,         // Optional: fill from KoinX screenshot
    totalCostOfAcquisition: 0,         // Optional: fill from KoinX screenshot
    totalCapitalLosses: 0,             // Optional
    tdsCredit: 28770.38,               // ₹28,770.38 — from KoinX
    otherIncome: 1840.95,              // ₹1,840.95 — staking/rewards from KoinX
};

export const KOINX_REFERENCE_FY2025_26: KoinXReference = {
    financialYear: '2025-26',
    totalTransactions: 280,
    totalCapitalGains: 0,              // Optional: fill from KoinX screenshot
    totalSaleConsideration: 0,         // Optional
    totalCostOfAcquisition: 0,         // Optional
    tdsCredit: 0,                      // Optional
    otherIncome: 0,                    // Optional
};

/**
 * Get KoinX reference data for a given financial year.
 * Returns null if no reference is configured — the engine still works fine without it.
 */
export function getKoinXReference(fy: string): KoinXReference | null {
    switch (fy) {
        case '2024-25': return KOINX_REFERENCE_FY2024_25;
        case '2025-26': return KOINX_REFERENCE_FY2025_26;
        default: return null;
    }
}


