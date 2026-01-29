import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Zap,
    TrendingDown,
    ArrowRight,
    CheckCircle2,
    ShieldCheck,
    AlertCircle,
    BarChart,
    Target,
    Calculator
} from "lucide-react";
import { motion } from "framer-motion";

export default function IncomeOptimizer() {
    const [activeRegime, setActiveRegime] = useState<'new' | 'old'>('new');

    const oldRegime = {
        income: 1840000,
        deductions: 350000, // 80C, 80D, HRA
        taxable: 1490000,
        tax: 259500
    };

    const newRegime = {
        income: 1840000,
        deductions: 75000, // Standard Deduction
        taxable: 1765000,
        tax: 185200
    };

    const savings = oldRegime.tax - newRegime.tax;

    return (
        <AppLayout>
            <div className="space-y-8 animate-in fade-in duration-700">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <Calculator className="h-8 w-8 text-indigo-600" />
                            Tax Regime Battleground
                        </h1>
                        <p className="text-muted-foreground font-medium">AI-powered comparison for guaranteed maximum refund.</p>
                    </div>
                    <Badge className="bg-emerald-500 text-white px-4 py-2 text-sm">₹{savings.toLocaleString()} SAVED WITH NEW REGIME</Badge>
                </div>

                {/* The Battle Cards */}
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Old Regime Card */}
                    <motion.div whileHover={{ y: -5 }}>
                        <Card className={`relative border-2 ${activeRegime === 'old' ? 'border-amber-200' : 'border-slate-100 opacity-80'}`}>
                            <CardHeader className="bg-slate-50/50">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-xl font-bold">Old Tax Regime</CardTitle>
                                    {activeRegime === 'old' && <Badge className="bg-amber-500">SELECTED</Badge>}
                                </div>
                                <CardDescription>Major deductions allowed (80C, 80D, HRA)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 py-6">
                                <StatRow label="Gross Income" value={oldRegime.income} />
                                <StatRow label="Applied Deductions" value={-oldRegime.deductions} color="text-rose-500" />
                                <div className="h-px bg-slate-100"></div>
                                <StatRow label="Taxable Income" value={oldRegime.taxable} bold />
                                <div className="p-4 rounded-xl bg-slate-900 text-white">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Final Tax Liability</p>
                                    <p className="text-3xl font-black mt-1">₹{oldRegime.tax.toLocaleString()}</p>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => setActiveRegime('old')}>
                                    Switch to Old Regime
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>

                    {/* New Regime Card (Recommended) */}
                    <motion.div whileHover={{ y: -5 }}>
                        <Card className={`relative border-2 ${activeRegime === 'new' ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-2xl shadow-indigo-100' : 'border-slate-100'}`}>
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                <Badge className="bg-indigo-600 text-white px-6 py-1 font-black animate-bounce">RECOMMENDED</Badge>
                            </div>
                            <CardHeader className="bg-indigo-50/30">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-xl font-bold text-indigo-900">New Tax Regime</CardTitle>
                                    {activeRegime === 'new' && <CheckCircle2 className="h-6 w-6 text-indigo-600" />}
                                </div>
                                <CardDescription>Lower rates, fewer deductions (Maxed out for 2026)</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 py-6">
                                <StatRow label="Gross Income" value={newRegime.income} />
                                <StatRow label="Standard Deduction" value={-newRegime.deductions} color="text-rose-500" />
                                <div className="h-px bg-slate-100"></div>
                                <StatRow label="Taxable Income" value={newRegime.taxable} bold />
                                <div className="p-4 rounded-xl bg-indigo-600 text-white shadow-xl shadow-indigo-200">
                                    <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Final Tax Liability</p>
                                    <p className="text-3xl font-black mt-1">₹{newRegime.tax.toLocaleString()}</p>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full h-12 rounded-xl bg-indigo-600" onClick={() => setActiveRegime('new')}>
                                    Keep New Regime
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>
                </div>

                {/* Wealth Optimization Insights */}
                <div className="space-y-6 pt-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Zap className="h-6 w-6 text-amber-500 fill-amber-500" />
                        Wealth Insights for AY 2026-27
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <InsightCard
                            icon={<Target className="text-rose-500" />}
                            title="80D Opportunity"
                            desc="Invest ₹25,000 more in Health Insurance to save an extra ₹7,500 in the Old Regime."
                        />
                        <InsightCard
                            icon={<TrendingDown className="text-indigo-500" />}
                            title="Loss Harvesting"
                            desc="You have ₹12,000 in unrealized Short-Term Losses. Selling before March 31 could lower your business tax."
                        />
                        <InsightCard
                            icon={<BarChart className="text-emerald-500" />}
                            title="HRA Optimization"
                            desc="Moving to a rented accommodation in a Metro could save ₹45,000 more."
                        />
                    </div>
                </div>

                {/* Shield Guarantee */}
                <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex items-center gap-8 border border-white/10 shadow-2xl">
                    <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-10 w-10 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">TaxMitra Maximum Refund Guarantee</h3>
                        <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                            Our algorithm processes 40,000+ permutations of your data to ensure you pay the absolute minimum tax required by law.
                            If you find a lower liability elsewhere, we'll refund our service fee.
                        </p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

function StatRow({ label, value, color, bold }: any) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            <span className={`font-mono ${bold ? 'font-black text-lg' : 'font-bold'} ${color || 'text-slate-900'}`}>
                ₹{Math.abs(value).toLocaleString()}
            </span>
        </div>
    );
}

function InsightCard({ icon, title, desc }: any) {
    return (
        <div className="p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center mb-4">{icon}</div>
            <h4 className="font-bold text-slate-900 text-base">{title}</h4>
            <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">{desc}</p>
        </div>
    );
}
