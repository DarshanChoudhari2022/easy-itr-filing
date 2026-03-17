/**
 * EasyITR — Tax Drill-Down + Schedule VDA Component
 * ====================================================
 * Tab 1: Capital Gains Drill-Down — per-asset P&L table with expandable FIFO lots
 * Tab 2: Schedule VDA — ITR-ready lot-level rows for filing
 *
 * Matches KoinX report layout and provides the full audit trail
 * a CA or ITR filer needs.
 */

import React, { useState, useMemo } from 'react';
import {
    ChevronDown, ChevronRight, TrendingUp, TrendingDown,
    Coins, ArrowRight, BarChart3, DollarSign, FileSpreadsheet,
    AlertTriangle, Info, Download, Target
} from 'lucide-react';

import type { TaxComputationResult, AssetGainSummary, LotMatch } from '@/lib/easyitr/tax-computation-engine';

// ============= PROPS =============

interface TaxDrillDownProps {
    taxResult: TaxComputationResult;
    className?: string;
    selectedFY?: string;
}

// ============= MAIN COMPONENT =============

export function TaxDrillDown({ taxResult, className = '', selectedFY = '2024-25' }: TaxDrillDownProps) {
    const [activeSubTab, setActiveSubTab] = useState<'drilldown' | 'schedule-vda'>('drilldown');
    const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

    // ── Per-Asset Aggregation ──
    const sortedAssets = useMemo(() => {
        if (!taxResult.assetSummaries) return [];
        return [...taxResult.assetSummaries].sort((a, b) => {
            // Sort by taxable gain (net_taxable) desc — profits first
            const taxA = a.taxableGain ?? Math.max(a.netGainLoss || 0, 0);
            const taxB = b.taxableGain ?? Math.max(b.netGainLoss || 0, 0);
            return taxB - taxA;
        });
    }, [taxResult.assetSummaries]);

    // ── Totals ──
    const totals = useMemo(() => {
        let grossProfit = 0;
        let grossLoss = 0;
        let netTaxable = 0;
        let totalCost = 0;
        let totalSale = 0;

        for (const a of sortedAssets) {
            const gain = a.netGainLoss || 0;
            // Per-asset: sum positive gains and negative losses separately
            const assetProfit = a.taxableGain ?? Math.max(gain, 0);
            const assetLoss = a.grossLosses ?? (gain < 0 ? Math.abs(gain) : 0);

            grossProfit += assetProfit;
            grossLoss += assetLoss;
            netTaxable += assetProfit; // 115BBH: only profits are taxable
            totalCost += a.totalBuyValueInr || 0;
            totalSale += a.totalSellValueInr || 0;
        }

        return { grossProfit, grossLoss, netTaxable, totalCost, totalSale };
    }, [sortedAssets]);

    // ── All lot matches for Schedule VDA ──
    const allLotMatches = useMemo(() => {
        return taxResult.lotMatches || [];
    }, [taxResult.lotMatches]);

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Sub-Tab Selector */}
            <div className="flex gap-1 border-b border-slate-200">
                <button
                    onClick={() => setActiveSubTab('drilldown')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'drilldown'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <BarChart3 className="h-4 w-4" />
                    Capital Gains P&L
                </button>
                <button
                    onClick={() => setActiveSubTab('schedule-vda')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'schedule-vda'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <FileSpreadsheet className="h-4 w-4" />
                    Schedule VDA
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                        {allLotMatches.length}
                    </span>
                </button>
            </div>

            {/* ═══ TAB A: CAPITAL GAINS DRILL-DOWN ═══ */}
            {activeSubTab === 'drilldown' && (
                <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <MiniStat
                            label="Sale Consideration"
                            value={`₹${fmtINR(totals.totalSale)}`}
                            icon={<DollarSign className="w-4 h-4 text-blue-500" />}
                        />
                        <MiniStat
                            label="Cost of Acquisition"
                            value={`₹${fmtINR(totals.totalCost)}`}
                            icon={<Coins className="w-4 h-4 text-purple-500" />}
                        />
                        <MiniStat
                            label="Net Taxable Gain"
                            value={`₹${fmtINR(totals.netTaxable)}`}
                            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                            valueColor="text-emerald-600"
                        />
                    </div>

                    {/* Asset-wise P&L Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700 w-8"></th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-700">Asset</th>
                                        <th className="text-right px-4 py-3 font-semibold text-emerald-700">
                                            Gross Profit
                                        </th>
                                        <th className="text-right px-4 py-3 font-semibold text-red-700 group relative">
                                            Gross Loss
                                            <span className="ml-1 cursor-help" title="Cannot be set off under §115BBH">
                                                <Info className="inline w-3 h-3 text-red-400" />
                                            </span>
                                        </th>
                                        <th className="text-right px-4 py-3 font-semibold text-indigo-700">
                                            Net Taxable
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedAssets.map(asset => {
                                        const gain = asset.netGainLoss || 0;
                                        const profit = asset.taxableGain ?? Math.max(gain, 0);
                                        const loss = asset.grossLosses ?? (gain < 0 ? Math.abs(gain) : 0);
                                        const isExpanded = expandedAsset === asset.assetSymbol;
                                        const lotMatches = taxResult.lotMatches?.filter(
                                            m => m.assetSymbol === asset.assetSymbol
                                        ) || [];

                                        return (
                                            <React.Fragment key={asset.assetSymbol}>
                                                <tr
                                                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                                                    onClick={() => setExpandedAsset(
                                                        isExpanded ? null : asset.assetSymbol
                                                    )}
                                                >
                                                    <td className="px-4 py-3 text-slate-400">
                                                        {isExpanded
                                                            ? <ChevronDown className="w-4 h-4" />
                                                            : <ChevronRight className="w-4 h-4" />
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-900">
                                                                {asset.assetSymbol}
                                                            </span>
                                                            <span className="text-xs text-slate-400">
                                                                {asset.matchedLots?.length || lotMatches.length} trades
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {profit > 0 ? (
                                                            <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                                                ₹{fmtINR(profit)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {loss > 0 ? (
                                                            <span className="font-mono text-red-700 bg-red-50 px-2 py-0.5 rounded">
                                                                ₹{fmtINR(loss)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="font-mono font-bold text-indigo-700">
                                                            ₹{fmtINR(profit)}
                                                        </span>
                                                    </td>
                                                </tr>

                                                {/* Expanded: FIFO Lot Details */}
                                                {isExpanded && lotMatches.length > 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="p-0">
                                                            <div className="bg-slate-50 border-y border-slate-200 px-6 py-3">
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="text-slate-500">
                                                                            <th className="text-left px-2 py-1.5 font-medium">#</th>
                                                                            <th className="text-left px-2 py-1.5 font-medium">Buy Date</th>
                                                                            <th className="text-left px-2 py-1.5 font-medium">Sell Date</th>
                                                                            <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                                                                            <th className="text-right px-2 py-1.5 font-medium">Cost (₹)</th>
                                                                            <th className="text-right px-2 py-1.5 font-medium">Proceeds (₹)</th>
                                                                            <th className="text-right px-2 py-1.5 font-medium">Gain/Loss</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {lotMatches.map((match, idx) => {
                                                                            const g = match.gainLoss ||
                                                                                ((match.saleConsideration || 0) - (match.costOfAcquisition || 0));
                                                                            return (
                                                                                <tr key={idx} className="border-t border-slate-200 hover:bg-white transition-colors">
                                                                                    <td className="px-2 py-1.5 text-slate-400">{idx + 1}</td>
                                                                                    <td className="px-2 py-1.5 font-mono text-slate-600">
                                                                                        {formatDate(match.buyDate)}
                                                                                    </td>
                                                                                    <td className="px-2 py-1.5 font-mono text-slate-600">
                                                                                        {formatDate(match.sellDate)}
                                                                                    </td>
                                                                                    <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                                                                                        {(match.matchedQuantity || 0).toFixed(6)}
                                                                                    </td>
                                                                                    <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                                                                                        ₹{fmtINR(match.costOfAcquisition || 0)}
                                                                                    </td>
                                                                                    <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                                                                                        ₹{fmtINR(match.saleConsideration || 0)}
                                                                                    </td>
                                                                                    <td className={`px-2 py-1.5 text-right font-mono font-bold ${g >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                                        {g >= 0 ? '+' : ''}₹{fmtINR(g)}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {isExpanded && lotMatches.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="px-6 py-3 text-center text-xs text-slate-400 bg-slate-50">
                                                            Detailed lot matching data not available for this asset.
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                                        <td className="px-4 py-3"></td>
                                        <td className="px-4 py-3 text-slate-900">TOTAL</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-mono text-emerald-700">
                                                ₹{fmtINR(totals.grossProfit)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-mono text-red-700">
                                                ₹{fmtINR(totals.grossLoss)}
                                            </span>
                                            {totals.grossLoss > 0 && (
                                                <span className="block text-[10px] text-red-400 font-normal mt-0.5">
                                                    non-deductible
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-mono text-indigo-700">
                                                ₹{fmtINR(totals.netTaxable)}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Other Income Section */}
                    {(taxResult.otherVDAIncome || 0) > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                                <Coins className="h-4 w-4 text-purple-600" />
                                <h4 className="text-sm font-semibold text-purple-800">
                                    Other VDA Income (Taxable @ 30%)
                                </h4>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {taxResult.otherIncomeBreakdown && Object.entries(taxResult.otherIncomeBreakdown).map(
                                    ([type, amount]: [string, number]) => amount > 0 && (
                                        <div key={type} className="flex items-center justify-between px-4 py-3">
                                            <span className="text-sm text-slate-600 capitalize">
                                                {type === 'staking' ? '🥩 Staking Income' :
                                                    type === 'reward' ? '🎁 Rewards Received' :
                                                        type === 'airdrop' ? '🪂 Airdrop Income' :
                                                            type === 'interest' ? '💰 Interest Income' :
                                                                type === 'mining' ? '⛏️ Mining Income' :
                                                                    type === 'referral' ? '🔗 Referral Income' :
                                                                        `📦 ${type}`}
                                            </span>
                                            <span className="font-mono font-semibold text-purple-700">
                                                ₹{fmtINR(amount)}
                                            </span>
                                        </div>
                                    )
                                )}
                                <div className="flex items-center justify-between px-4 py-3 bg-purple-50">
                                    <span className="text-sm font-semibold text-purple-800">Total Other Income</span>
                                    <span className="font-mono font-bold text-purple-900">
                                        ₹{fmtINR(taxResult.otherVDAIncome || 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ TAB B: SCHEDULE VDA ═══ */}
            {activeSubTab === 'schedule-vda' && (
                <div className="space-y-4">
                    {/* Info Banner */}
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-blue-800">
                                ITR Schedule VDA — FY {selectedFY}
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                                {allLotMatches.length} lot-level entries ready for ITR filing.
                                Each row represents one sell↔buy lot match from FIFO computation.
                            </p>
                        </div>
                    </div>

                    {/* Schedule VDA Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                        <th className="text-left px-3 py-2.5 font-semibold w-12">Sl.No</th>
                                        <th className="text-left px-3 py-2.5 font-semibold">Particulars</th>
                                        <th className="text-left px-3 py-2.5 font-semibold">Acquisition</th>
                                        <th className="text-left px-3 py-2.5 font-semibold">Transfer</th>
                                        <th className="text-left px-3 py-2.5 font-semibold">Head</th>
                                        <th className="text-right px-3 py-2.5 font-semibold">
                                            Cost of Acquisition
                                        </th>
                                        <th className="text-right px-3 py-2.5 font-semibold">
                                            Consideration
                                        </th>
                                        <th className="text-right px-3 py-2.5 font-semibold">
                                            Income from VDA
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allLotMatches.map((match, idx) => {
                                        const cost = match.costOfAcquisition || 0;
                                        const sale = match.saleConsideration || 0;
                                        const income = match.gainLoss || (sale - cost);
                                        const isLoss = income < 0;

                                        return (
                                            <tr
                                                key={idx}
                                                className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isLoss ? 'bg-red-50/30' : ''
                                                    }`}
                                            >
                                                <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                                                <td className="px-3 py-2">
                                                    <span className="font-semibold text-slate-900">
                                                        {match.assetSymbol}
                                                    </span>
                                                    <span className="text-slate-400 ml-1">
                                                        ({(match.matchedQuantity || 0).toFixed(4)})
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-600">
                                                    {formatDate(match.buyDate)}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-600">
                                                    {formatDate(match.sellDate)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-500 text-[10px]">
                                                    Capital Gains
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-700">
                                                    ₹{fmtINR(cost)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-700">
                                                    ₹{fmtINR(sale)}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-mono font-bold ${isLoss ? 'text-red-600' : 'text-emerald-600'
                                                    }`}>
                                                    {income >= 0 ? '' : '-'}₹{fmtINR(Math.abs(income))}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-sm">
                                        <td colSpan={5} className="px-3 py-3 text-right text-slate-700">
                                            TOTAL ({allLotMatches.length} entries)
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-800">
                                            ₹{fmtINR(allLotMatches.reduce((s, m) => s + (m.costOfAcquisition || 0), 0))}
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-800">
                                            ₹{fmtINR(allLotMatches.reduce((s, m) => s + (m.saleConsideration || 0), 0))}
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono text-indigo-700">
                                            ₹{fmtINR(allLotMatches.reduce((s, m) => s + (m.gainLoss || ((m.saleConsideration || 0) - (m.costOfAcquisition || 0))), 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {allLotMatches.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            No Schedule VDA entries found. Run tax computation first.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============= SUB-COMPONENTS =============

function MiniStat({
    label,
    value,
    icon,
    valueColor = 'text-slate-900',
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    valueColor?: string;
}) {
    return (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-sm font-bold font-mono ${valueColor}`}>{value}</div>
        </div>
    );
}


// ============= HELPERS =============

function fmtINR(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
    }).format(Math.abs(value));
}

function formatDate(d: Date | string | undefined): string {
    if (!d) return '—';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default TaxDrillDown;

