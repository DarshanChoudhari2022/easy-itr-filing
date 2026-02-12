/**
 * RegimeComparisonCard — Side-by-side Old vs New regime comparison
 * Shows actual tax calculations based on user's income and deductions
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingDown, ArrowRight, Sparkles, Info, CheckCircle } from 'lucide-react';

interface RegimeData {
    grossIncome: number;
    deductions: number;
    standardDeduction: number;
    taxableIncome: number;
    tax: number;
    cess: number;
    totalTax: number;
    tdsPaid: number;
    netPayable: number;
    refund: number;
}

interface RegimeComparisonProps {
    oldRegime: RegimeData;
    newRegime: RegimeData;
    selectedRegime: 'OLD' | 'NEW';
    onSelect: (regime: 'OLD' | 'NEW') => void;
}

export function RegimeComparisonCard({ oldRegime, newRegime, selectedRegime, onSelect }: RegimeComparisonProps) {
    const savings = Math.abs(oldRegime.totalTax - newRegime.totalTax);
    const betterRegime = oldRegime.totalTax <= newRegime.totalTax ? 'OLD' : 'NEW';

    const fmt = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

    return (
        <div className="space-y-4">
            {/* Winner Banner */}
            <div className={`p-4 rounded-2xl border-2 flex items-center gap-4 ${betterRegime === 'NEW'
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-blue-50 border-blue-200'
                }`}>
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${betterRegime === 'NEW' ? 'bg-emerald-500' : 'bg-blue-500'
                    } text-white shadow-lg`}>
                    <Trophy className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-xs font-black uppercase tracking-widest opacity-60">
                        🏆 Recommended for You
                    </p>
                    <h3 className={`text-lg font-black ${betterRegime === 'NEW' ? 'text-emerald-800' : 'text-blue-800'
                        }`}>
                        {betterRegime === 'NEW' ? 'New Regime' : 'Old Regime'} saves you {fmt(savings)}!
                    </h3>
                </div>
            </div>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-2 gap-4">
                {/* Old Regime Card */}
                <div
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${selectedRegime === 'OLD'
                            ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/10'
                            : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    onClick={() => onSelect('OLD')}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="font-black text-sm uppercase tracking-tight">Old Regime</h4>
                            <p className="text-[10px] text-muted-foreground">Higher rates + Deductions</p>
                        </div>
                        {selectedRegime === 'OLD' && <CheckCircle className="h-5 w-5 text-blue-500" />}
                        {betterRegime === 'OLD' && (
                            <Badge className="bg-blue-100 text-blue-700 border-none text-[9px]">
                                <Trophy className="h-2.5 w-2.5 mr-0.5" /> BETTER
                            </Badge>
                        )}
                    </div>

                    <div className="space-y-2 text-xs">
                        <Row label="Gross Income" value={fmt(oldRegime.grossIncome)} />
                        <Row label="Std Deduction" value={`-${fmt(oldRegime.standardDeduction)}`} color="green" />
                        <Row label="80C, 80D, etc." value={`-${fmt(oldRegime.deductions)}`} color="green" />
                        <div className="border-t pt-2">
                            <Row label="Taxable Income" value={fmt(oldRegime.taxableIncome)} bold />
                        </div>
                        <Row label="Tax" value={fmt(oldRegime.tax)} />
                        <Row label="Cess (4%)" value={fmt(oldRegime.cess)} />
                        <div className="border-t pt-2">
                            <Row label="Total Tax" value={fmt(oldRegime.totalTax)} bold color="red" />
                        </div>
                        <Row label="TDS Paid" value={`-${fmt(oldRegime.tdsPaid)}`} color="green" />
                        <div className="border-t pt-2 mt-2">
                            {oldRegime.refund > 0 ? (
                                <Row label="Refund" value={fmt(oldRegime.refund)} bold color="green" />
                            ) : (
                                <Row label="Payable" value={fmt(oldRegime.netPayable)} bold color="red" />
                            )}
                        </div>
                    </div>
                </div>

                {/* New Regime Card */}
                <div
                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${selectedRegime === 'NEW'
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-500/10'
                            : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    onClick={() => onSelect('NEW')}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="font-black text-sm uppercase tracking-tight">New Regime</h4>
                            <p className="text-[10px] text-muted-foreground">Lower rates, fewer deductions</p>
                        </div>
                        {selectedRegime === 'NEW' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                        {betterRegime === 'NEW' && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-none text-[9px]">
                                <Trophy className="h-2.5 w-2.5 mr-0.5" /> BETTER
                            </Badge>
                        )}
                    </div>

                    <div className="space-y-2 text-xs">
                        <Row label="Gross Income" value={fmt(newRegime.grossIncome)} />
                        <Row label="Std Deduction" value={`-${fmt(newRegime.standardDeduction)}`} color="green" />
                        <Row label="No other deductions" value="₹0" color="muted" />
                        <div className="border-t pt-2">
                            <Row label="Taxable Income" value={fmt(newRegime.taxableIncome)} bold />
                        </div>
                        <Row label="Tax" value={fmt(newRegime.tax)} />
                        <Row label="Cess (4%)" value={fmt(newRegime.cess)} />
                        <div className="border-t pt-2">
                            <Row label="Total Tax" value={fmt(newRegime.totalTax)} bold color="red" />
                        </div>
                        <Row label="TDS Paid" value={`-${fmt(newRegime.tdsPaid)}`} color="green" />
                        <div className="border-t pt-2 mt-2">
                            {newRegime.refund > 0 ? (
                                <Row label="Refund" value={fmt(newRegime.refund)} bold color="green" />
                            ) : (
                                <Row label="Payable" value={fmt(newRegime.netPayable)} bold color="red" />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Explanation */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-700">How to decide?</p>
                    <p>• If you have <strong>high investments</strong> (PPF, ELSS, LIC) + <strong>health insurance</strong> + <strong>HRA</strong> → Old Regime may be better</p>
                    <p>• If you have <strong>simple income</strong> with <strong>few investments</strong> → New Regime is usually better</p>
                    <p>• You can switch between regimes every year (for salaried) or once (for business)</p>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
    const colorClass = color === 'green' ? 'text-emerald-600' :
        color === 'red' ? 'text-rose-600' :
            color === 'muted' ? 'text-slate-400' : '';

    return (
        <div className={`flex justify-between ${bold ? 'font-black' : ''}`}>
            <span className={color === 'muted' ? 'text-slate-400 italic' : 'opacity-80'}>{label}</span>
            <span className={`${colorClass} ${bold ? 'text-sm' : ''}`}>{value}</span>
        </div>
    );
}
