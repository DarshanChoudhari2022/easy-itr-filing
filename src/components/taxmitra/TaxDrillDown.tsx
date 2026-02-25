/**
 * TaxMitra — Tax Drill-Down Component (Light Theme)
 * ===================================================
 * Per-asset and per-trade breakdown with FIFO lot matching details.
 * Shows expandable asset cards with individual trade rows.
 */

import React, { useState, useMemo } from 'react';
import {
    ChevronDown, ChevronRight, TrendingUp, TrendingDown,
    Coins, ArrowRight, BarChart3, DollarSign
} from 'lucide-react';

import type { TaxComputationResult, AssetGainSummary, LotMatch } from '@/lib/taxmitra/tax-computation-engine';

// ============= PROPS =============

interface TaxDrillDownProps {
    taxResult: TaxComputationResult;
    className?: string;
}

// ============= COMPONENT =============

export function TaxDrillDown({ taxResult, className = '' }: TaxDrillDownProps) {
    const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

    const sortedAssets = useMemo(() => {
        if (!taxResult.assetSummaries) return [];
        return [...taxResult.assetSummaries].sort((a, b) => {
            const absA = Math.abs(a.netGainLoss || 0);
            const absB = Math.abs(b.netGainLoss || 0);
            return absB - absA;
        });
    }, [taxResult.assetSummaries]);

    const totalGain = sortedAssets.reduce((s, a) => s + (a.netGainLoss || 0), 0);
    const totalCost = sortedAssets.reduce((s, a) => s + (a.totalBuyValueInr || 0), 0);
    const totalSale = sortedAssets.reduce((s, a) => s + (a.totalSellValueInr || 0), 0);

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Summary Row */}
            <div className="grid grid-cols-3 gap-3">
                <MiniStat
                    label="Total Sale Consideration"
                    value={`₹${formatCurrency(totalSale)}`}
                    icon={<DollarSign className="w-4 h-4 text-blue-500" />}
                />
                <MiniStat
                    label="Total Cost of Acquisition"
                    value={`₹${formatCurrency(totalCost)}`}
                    icon={<Coins className="w-4 h-4 text-purple-500" />}
                />
                <MiniStat
                    label="Net Capital Gain/Loss"
                    value={`₹${formatCurrency(totalGain)}`}
                    icon={totalGain >= 0
                        ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                        : <TrendingDown className="w-4 h-4 text-red-500" />}
                    valueColor={totalGain >= 0 ? 'text-emerald-600' : 'text-red-600'}
                />
            </div>

            {/* Per-Asset Cards */}
            <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Per-Asset Breakdown ({sortedAssets.length} assets)
                </h4>

                {sortedAssets.map(asset => (
                    <AssetCard
                        key={asset.assetSymbol}
                        asset={asset}
                        lotMatches={taxResult.lotMatches?.filter(m => m.assetSymbol === asset.assetSymbol) || []}
                        isExpanded={expandedAsset === asset.assetSymbol}
                        onToggle={() => setExpandedAsset(
                            expandedAsset === asset.assetSymbol ? null : asset.assetSymbol
                        )}
                    />
                ))}

                {sortedAssets.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        No disposal transactions found for this FY.
                    </div>
                )}
            </div>
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

function AssetCard({
    asset,
    lotMatches,
    isExpanded,
    onToggle,
}: {
    asset: AssetGainSummary;
    lotMatches: LotMatch[];
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const gain = asset.netGainLoss || 0;
    const isProfit = gain >= 0;
    const tradeCount = asset.matchedLots?.length || lotMatches.length || 0;

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Asset Header (clickable) */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 transition-colors"
            >
                <div className="flex-shrink-0">
                    {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{asset.assetSymbol}</span>
                        <span className="text-xs text-slate-400">[{tradeCount} trade{tradeCount !== 1 ? 's' : ''}]</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase">Cost</div>
                        <div className="text-xs font-mono text-slate-600">
                            ₹{formatCurrency(asset.totalBuyValueInr || 0)}
                        </div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                    <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase">Sale</div>
                        <div className="text-xs font-mono text-slate-600">
                            ₹{formatCurrency(asset.totalSellValueInr || 0)}
                        </div>
                    </div>
                    <div className="text-right min-w-[80px]">
                        <div className="text-[10px] text-slate-400 uppercase">Gain/Loss</div>
                        <div className={`text-xs font-mono font-bold ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                            {isProfit ? '+' : ''}₹{formatCurrency(gain)}
                        </div>
                    </div>
                </div>
            </button>

            {/* Expanded: Per-Trade Table */}
            {isExpanded && lotMatches.length > 0 && (
                <div className="border-t border-slate-200 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500">
                                <th className="text-left px-3 py-2 font-medium">#</th>
                                <th className="text-left px-3 py-2 font-medium">Sell Date</th>
                                <th className="text-right px-3 py-2 font-medium">Qty</th>
                                <th className="text-right px-3 py-2 font-medium">Buy Price</th>
                                <th className="text-right px-3 py-2 font-medium">Sell Price</th>
                                <th className="text-right px-3 py-2 font-medium">Cost (₹)</th>
                                <th className="text-right px-3 py-2 font-medium">Sale (₹)</th>
                                <th className="text-right px-3 py-2 font-medium">Gain/Loss (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lotMatches.map((match, idx) => {
                                const matchGain = match.gainLoss || ((match.saleConsideration || 0) - (match.costOfAcquisition || 0));
                                const isMatchProfit = matchGain >= 0;

                                return (
                                    <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                                        <td className="px-3 py-2 text-slate-700 font-mono">
                                            {formatDate(match.sellDate)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-mono">
                                            {(match.matchedQuantity || 0).toFixed(6)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500 font-mono">
                                            ₹{formatCurrency(match.buyPricePerUnit || 0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500 font-mono">
                                            ₹{formatCurrency(match.sellPricePerUnit || 0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-mono">
                                            ₹{formatCurrency(match.costOfAcquisition || 0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-mono">
                                            ₹{formatCurrency(match.saleConsideration || 0)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${isMatchProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {isMatchProfit ? '+' : ''}₹{formatCurrency(matchGain)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-300 bg-slate-50">
                                <td colSpan={5} className="px-3 py-2 text-slate-500 font-medium text-right">TOTAL:</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                                    ₹{formatCurrency(asset.totalBuyValueInr || 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                                    ₹{formatCurrency(asset.totalSellValueInr || 0)}
                                </td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {isProfit ? '+' : ''}₹{formatCurrency(gain)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {isExpanded && lotMatches.length === 0 && (
                <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-400">
                    Detailed lot matching data not available for this asset.
                </div>
            )}
        </div>
    );
}

// ============= HELPERS =============

function formatCurrency(value: number): string {
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
