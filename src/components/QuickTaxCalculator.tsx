/**
 * Quick Tax Calculator Component
 * Instant tax estimation for first-time filers
 * Shows estimated tax in real-time as user enters income
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
    Calculator, IndianRupee, TrendingUp, TrendingDown,
    Sparkles, ArrowRight, HelpCircle, Wallet, Building2,
    PiggyBank, Bitcoin, Receipt, ChevronDown, ChevronUp
} from 'lucide-react';
import { calculateTax, compareRegimes, RegimeComparison } from '@/lib/tax-calculation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface QuickTaxCalculatorProps {
    onProceedToFiling?: (data: any) => void;
}

export function QuickTaxCalculator({ onProceedToFiling }: QuickTaxCalculatorProps) {
    const [salary, setSalary] = useState<number>(0);
    const [otherIncome, setOtherIncome] = useState<number>(0);
    const [deductions80C, setDeductions80C] = useState<number>(0);
    const [deductions80D, setDeductions80D] = useState<number>(0);
    const [cryptoGains, setCryptoGains] = useState<number>(0);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Advanced fields
    const [houseProperty, setHouseProperty] = useState<number>(0);
    const [hra, setHra] = useState<number>(0);
    const [nps, setNps] = useState<number>(0);

    const comparison = useMemo(() => {
        return compareRegimes({
            salary,
            houseProperty,
            otherSources: { misc: otherIncome },
            deductions: {
                section80C: deductions80C,
                section80D: deductions80D,
                hra,
                nps80CCD: nps
            },
            vdaGains: cryptoGains,
            assessmentYear: '2025-26'
        });
    }, [salary, otherIncome, deductions80C, deductions80D, cryptoGains, houseProperty, hra, nps]);

    const fmt = (v: number) => {
        if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
        if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
        if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
        return `₹${v.toLocaleString('en-IN')}`;
    };

    const parseInput = (value: string): number => {
        const num = parseFloat(value.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
    };

    const totalIncome = salary + otherIncome + houseProperty + cryptoGains;
    const winningTax = comparison.recommendation === 'old' ? comparison.oldRegime : comparison.newRegime;

    return (
        <div className="space-y-6">
            {/* Calculator Header */}
            <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium">
                    <Calculator className="h-4 w-4" />
                    Instant Tax Calculator
                </div>
                <h2 className="text-2xl font-bold">Know Your Tax in 30 Seconds</h2>
                <p className="text-muted-foreground">Enter your income to see estimated tax liability</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Input Section */}
                <Card className="border-2">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-indigo-600" />
                            Your Income
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Salary */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                                <Receipt className="h-4 w-4 text-slate-500" />
                                Annual Salary (CTC)
                                <HelpCircle className="h-3 w-3 text-slate-400" />
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <Input
                                    type="text"
                                    value={salary > 0 ? salary.toLocaleString('en-IN') : ''}
                                    onChange={(e) => setSalary(parseInput(e.target.value))}
                                    placeholder="e.g. 12,00,000"
                                    className="pl-8 h-12 text-lg font-medium"
                                />
                            </div>
                            <Slider
                                value={[salary]}
                                onValueChange={([v]) => setSalary(v)}
                                max={5000000}
                                step={50000}
                                className="py-2"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>₹0</span>
                                <span>₹50L+</span>
                            </div>
                        </div>

                        {/* Other Income */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                                <PiggyBank className="h-4 w-4 text-slate-500" />
                                Interest & Other Income
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <Input
                                    type="text"
                                    value={otherIncome > 0 ? otherIncome.toLocaleString('en-IN') : ''}
                                    onChange={(e) => setOtherIncome(parseInput(e.target.value))}
                                    placeholder="FD, Savings, Dividends"
                                    className="pl-8 h-11"
                                />
                            </div>
                        </div>

                        {/* 80C Deductions */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                                <TrendingDown className="h-4 w-4 text-emerald-500" />
                                Section 80C (PF, PPF, ELSS, etc.)
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <Input
                                    type="text"
                                    value={deductions80C > 0 ? deductions80C.toLocaleString('en-IN') : ''}
                                    onChange={(e) => setDeductions80C(Math.min(150000, parseInput(e.target.value)))}
                                    placeholder="Max ₹1,50,000"
                                    className="pl-8 h-11"
                                />
                            </div>
                            <div className="flex gap-2">
                                {[50000, 100000, 150000].map(amt => (
                                    <Button
                                        key={amt}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeductions80C(amt)}
                                        className={deductions80C === amt ? 'bg-emerald-50 border-emerald-200' : ''}
                                    >
                                        {fmt(amt)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* 80D */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                                <Building2 className="h-4 w-4 text-slate-500" />
                                Section 80D (Health Insurance)
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <Input
                                    type="text"
                                    value={deductions80D > 0 ? deductions80D.toLocaleString('en-IN') : ''}
                                    onChange={(e) => setDeductions80D(Math.min(75000, parseInput(e.target.value)))}
                                    placeholder="Max ₹75,000"
                                    className="pl-8 h-11"
                                />
                            </div>
                        </div>

                        {/* Crypto */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-medium">
                                <Bitcoin className="h-4 w-4 text-amber-500" />
                                Crypto/VDA Gains
                                <Badge variant="outline" className="text-[10px]">30% Tax</Badge>
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                                <Input
                                    type="text"
                                    value={cryptoGains > 0 ? cryptoGains.toLocaleString('en-IN') : ''}
                                    onChange={(e) => setCryptoGains(parseInput(e.target.value))}
                                    placeholder="Net gains from crypto"
                                    className="pl-8 h-11"
                                />
                            </div>
                        </div>

                        {/* Advanced Section */}
                        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="w-full justify-between text-sm text-muted-foreground">
                                    Advanced Options
                                    {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label className="text-sm">House Property Income/Loss</Label>
                                    <Input
                                        type="text"
                                        value={houseProperty !== 0 ? houseProperty.toLocaleString('en-IN') : ''}
                                        onChange={(e) => setHouseProperty(parseInput(e.target.value))}
                                        placeholder="Rental income or home loan interest"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">HRA Exemption</Label>
                                    <Input
                                        type="text"
                                        value={hra > 0 ? hra.toLocaleString('en-IN') : ''}
                                        onChange={(e) => setHra(parseInput(e.target.value))}
                                        placeholder="HRA claimed"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">NPS Contribution (80CCD)</Label>
                                    <Input
                                        type="text"
                                        value={nps > 0 ? nps.toLocaleString('en-IN') : ''}
                                        onChange={(e) => setNps(Math.min(50000, parseInput(e.target.value)))}
                                        placeholder="Additional ₹50,000"
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </CardContent>
                </Card>

                {/* Result Section */}
                <div className="space-y-4">
                    {/* Tax Result Card */}
                    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
                        <CardContent className="p-6 space-y-6">
                            <div className="text-center">
                                <p className="text-slate-400 text-sm mb-2">Your Estimated Tax ({comparison.recommendation} regime)</p>
                                <p className="text-5xl font-black">
                                    {fmt(winningTax.finalTax)}
                                </p>
                                <p className="text-slate-400 text-xs mt-2">
                                    + ₹{winningTax.cess.toFixed(0)} Cess
                                </p>
                            </div>

                            <Separator className="bg-white/10" />

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-slate-400">Gross Income</p>
                                    <p className="font-bold text-lg">{fmt(totalIncome)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400">Taxable Income</p>
                                    <p className="font-bold text-lg">{fmt(winningTax.taxableIncome)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400">Deductions</p>
                                    <p className="font-bold text-lg text-emerald-400">-{fmt(winningTax.totalDeductions)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400">Effective Rate</p>
                                    <p className="font-bold text-lg">
                                        {totalIncome > 0 ? ((winningTax.finalTax / totalIncome) * 100).toFixed(1) : '0'}%
                                    </p>
                                </div>
                            </div>

                            {cryptoGains > 0 && (
                                <div className="bg-amber-500/20 rounded-xl p-3 text-sm">
                                    <p className="text-amber-300 font-medium flex items-center gap-2">
                                        <Bitcoin className="h-4 w-4" />
                                        Crypto Tax: {fmt(cryptoGains * 0.3)}
                                    </p>
                                    <p className="text-slate-400 text-xs mt-1">@ 30% flat rate under Section 115BBH</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Regime Comparison Mini */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground">Old Regime</p>
                                    <p className={`font-bold ${comparison.recommendation === 'old' ? 'text-emerald-600' : ''}`}>
                                        {fmt(comparison.oldRegime.finalTax)}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <Badge className="bg-violet-100 text-violet-700 font-bold">
                                        Save {fmt(comparison.savings)}
                                    </Badge>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground">New Regime</p>
                                    <p className={`font-bold ${comparison.recommendation === 'new' ? 'text-emerald-600' : ''}`}>
                                        {fmt(comparison.newRegime.finalTax)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CTA */}
                    <Button
                        className="w-full h-14 text-lg font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl shadow-lg shadow-violet-500/25"
                        onClick={() => onProceedToFiling?.({
                            salary, otherIncome, deductions80C, deductions80D, cryptoGains,
                            houseProperty, hra, nps, regime: comparison.recommendation
                        })}
                    >
                        <Sparkles className="h-5 w-5 mr-2" />
                        Start Filing Now
                        <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                        Takes just 10 minutes • 100% Secure • ITR-1/2/3/4 Supported
                    </p>
                </div>
            </div>
        </div>
    );
}

export default QuickTaxCalculator;
