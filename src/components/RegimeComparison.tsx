/**
 * Regime Comparison Component
 * Side-by-side Old vs New Tax Regime Analysis
 * Unique feature for first-time filers to make informed decisions
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
    TrendingUp, TrendingDown, CheckCircle, XCircle, Sparkles,
    ChevronRight, IndianRupee, Calculator, Crown, AlertTriangle,
    PiggyBank, Banknote, Shield, Info
} from 'lucide-react';
import { calculateTax, legacyCompareRegimes as compareRegimes, type LegacyTaxResult as TaxResult } from '@/lib/taxEngine';

interface RegimeComparisonProps {
    salary?: number;
    houseProperty?: number;
    otherSources?: {
        savingsInterest?: number;
        fdInterest?: number;
        dividends?: number;
        misc?: number;
    };
    deductions?: {
        section80C?: number;
        section80D?: number;
        section80TTA?: number;
        section80E?: number;
        section80G?: number;
        nps80CCD?: number;
        hra?: number;
        lta?: number;
    };
    businessIncome?: number;
    vdaGains?: number;
    onSelectRegime?: (regime: 'old' | 'new') => void;
}

export function RegimeComparisonWidget({
    salary = 0,
    houseProperty = 0,
    otherSources = {},
    deductions = {},
    businessIncome = 0,
    vdaGains = 0,
    onSelectRegime
}: RegimeComparisonProps) {
    const [selectedRegime, setSelectedRegime] = useState<'old' | 'new' | null>(null);

    const comparison = useMemo(() => {
        return compareRegimes({
            salary,
            houseProperty,
            otherSources,
            deductions,
            businessIncome,
            vdaGains,
            assessmentYear: '2025-26'
        });
    }, [salary, houseProperty, otherSources, deductions, businessIncome, vdaGains]);

    const fmt = (v: number) => {
        if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
        if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
        return `₹${v.toLocaleString('en-IN')}`;
    };

    const handleSelect = (regime: 'old' | 'new') => {
        setSelectedRegime(regime);
        onSelectRegime?.(regime);
    };

    const winningRegime = comparison.recommendation;
    const savings = comparison.savings;

    return (
        <div className="space-y-6">
            {/* Header with Recommendation */}
            <Card className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 border-0 text-white overflow-hidden relative">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <CardContent className="p-6 relative">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Crown className="h-5 w-5 text-amber-300" />
                                <Badge className="bg-white/20 text-white border-0">AI Recommendation</Badge>
                            </div>
                            <h3 className="text-2xl font-bold mb-2">
                                {winningRegime === 'new' ? 'New Tax Regime' : 'Old Tax Regime'} saves you more!
                            </h3>
                            <p className="text-white/80 text-sm">
                                You can save <span className="text-amber-300 font-bold">{fmt(savings)}</span> by choosing the {winningRegime} regime
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black text-amber-300">{fmt(savings)}</div>
                            <p className="text-white/60 text-xs">Extra Savings</p>
                        </div>
                    </div>

                    {comparison.reasons.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {comparison.reasons.map((reason, i) => (
                                <Badge key={i} className="bg-white/10 text-white border-0 font-normal">
                                    <Sparkles className="h-3 w-3 mr-1" /> {reason}
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Side by Side Comparison */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* Old Regime Card */}
                <Card
                    className={`relative overflow-hidden transition-all cursor-pointer ${winningRegime === 'old'
                        ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-200 hover:border-slate-300'
                        } ${selectedRegime === 'old' ? 'ring-2 ring-emerald-500' : ''}`}
                    onClick={() => handleSelect('old')}
                >
                    {winningRegime === 'old' && (
                        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                            <Crown className="h-3 w-3" /> RECOMMENDED
                        </div>
                    )}
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                <PiggyBank className="h-5 w-5 text-amber-600" />
                            </div>
                            Old Tax Regime
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">With Deductions & Exemptions</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Gross Income</span>
                                <span className="font-medium">{fmt(comparison.oldRegime.grossTotalIncome)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-600 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" /> Deductions
                                </span>
                                <span className="font-medium text-emerald-600">-{fmt(comparison.oldRegime.totalDeductions)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Taxable Income</span>
                                <span className="font-medium">{fmt(comparison.oldRegime.taxableIncome)}</span>
                            </div>
                            {comparison.oldRegime.rebate87A > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-emerald-600">87A Rebate</span>
                                    <span className="font-medium text-emerald-600">-{fmt(comparison.oldRegime.rebate87A)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Cess (4%)</span>
                                <span className="font-medium">{fmt(comparison.oldRegime.cess)}</span>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4">
                            <div className="flex justify-between items-center">
                                <span className="font-bold">Total Tax</span>
                                <span className="text-2xl font-black text-slate-900">{fmt(comparison.oldRegime.finalTax)}</span>
                            </div>
                        </div>

                        <Button
                            className={`w-full ${selectedRegime === 'old' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            onClick={(e) => { e.stopPropagation(); handleSelect('old'); }}
                        >
                            {selectedRegime === 'old' ? <><CheckCircle className="h-4 w-4 mr-2" /> Selected</> : 'Choose Old Regime'}
                        </Button>
                    </CardContent>
                </Card>

                {/* New Regime Card */}
                <Card
                    className={`relative overflow-hidden transition-all cursor-pointer ${winningRegime === 'new'
                        ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                        : 'border-slate-200 hover:border-slate-300'
                        } ${selectedRegime === 'new' ? 'ring-2 ring-emerald-500' : ''}`}
                    onClick={() => handleSelect('new')}
                >
                    {winningRegime === 'new' && (
                        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                            <Crown className="h-3 w-3" /> RECOMMENDED
                        </div>
                    )}
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                                <Banknote className="h-5 w-5 text-violet-600" />
                            </div>
                            New Tax Regime
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">Lower rates, No deductions</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Gross Income</span>
                                <span className="font-medium">{fmt(comparison.newRegime.grossTotalIncome)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400 flex items-center gap-1">
                                    <XCircle className="h-3 w-3" /> Deductions
                                </span>
                                <span className="font-medium text-slate-400">Not Allowed</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Taxable Income</span>
                                <span className="font-medium">{fmt(comparison.newRegime.taxableIncome)}</span>
                            </div>
                            {comparison.newRegime.rebate87A > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-emerald-600">87A Rebate (up to ₹7L)</span>
                                    <span className="font-medium text-emerald-600">-{fmt(comparison.newRegime.rebate87A)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Cess (4%)</span>
                                <span className="font-medium">{fmt(comparison.newRegime.cess)}</span>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4">
                            <div className="flex justify-between items-center">
                                <span className="font-bold">Total Tax</span>
                                <span className="text-2xl font-black text-slate-900">{fmt(comparison.newRegime.finalTax)}</span>
                            </div>
                        </div>

                        <Button
                            className={`w-full ${selectedRegime === 'new' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            onClick={(e) => { e.stopPropagation(); handleSelect('new'); }}
                        >
                            {selectedRegime === 'new' ? <><CheckCircle className="h-4 w-4 mr-2" /> Selected</> : 'Choose New Regime'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Tax Slabs Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-indigo-600" /> Slab-wise Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Old Regime Slabs</h4>
                            <div className="space-y-2">
                                {comparison.oldRegime.slabs.map((slab, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Badge variant="outline" className="w-14 justify-center">{slab.rate}</Badge>
                                        <div className="flex-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">{fmt(slab.amount)}</span>
                                                <span className="font-medium">{fmt(slab.tax)}</span>
                                            </div>
                                            <Progress value={slab.amount / comparison.oldRegime.taxableIncome * 100} className="h-1 mt-1" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">New Regime Slabs</h4>
                            <div className="space-y-2">
                                {comparison.newRegime.slabs.map((slab, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Badge variant="outline" className="w-14 justify-center">{slab.rate}</Badge>
                                        <div className="flex-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">{fmt(slab.amount)}</span>
                                                <span className="font-medium">{fmt(slab.tax)}</span>
                                            </div>
                                            <Progress value={slab.amount / comparison.newRegime.taxableIncome * 100} className="h-1 mt-1" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900">
                            <p className="font-medium mb-1">Important Notes:</p>
                            <ul className="list-disc list-inside space-y-1 text-blue-800">
                                <li>New regime is default from FY 2023-24 onwards</li>
                                <li>You can switch between regimes each year</li>
                                <li>Business income requires Form 10IE for regime change</li>
                                <li>Crypto/VDA is taxed at 30% under both regimes</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default RegimeComparisonWidget;
