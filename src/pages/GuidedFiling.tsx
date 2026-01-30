import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    Info,
    Building,
    User,
    Bitcoin,
    Globe,
    Wallet,
    TrendingUp,
    FileJson,
    PieChart,
    IndianRupee,
    Zap,
    FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { askTaxGuru } from "@/lib/ai-service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateTax, TaxResult } from "@/lib/tax-calculation";
import { Separator } from "@/components/ui/separator";

type Step = {
    id: string;
    title: string;
    description: string;
}

const STEPS: Step[] = [
    { id: "profile", title: "Personal Profile", description: "Basic details & residency" },
    { id: "income", title: "Income Sources", description: "Salary, Interest, Capital Gains" },
    { id: "deductions", title: "Tax Savings", description: "Chapter VI-A Investments" },
    { id: "credits", title: "Tax Credits", description: "TDS, TCS & Advance Tax" },
    { id: "review", title: "Review & Compute", description: "Final Tax Computation" },
];

interface FilingFormData {
    residency?: string;
    pan?: string;
    sources?: string[];
    salary?: number;
    savingsInterest?: number;
    fdInterest?: number;
    dividends?: number;
    vdaGains?: number;
    section80C?: number;
    section80D?: number;
    houseProperty?: number;
    businessIncome?: number;
    otherSourcesAmount?: number;
    tdsPaid?: number;
    advanceTax?: number;
    regime?: "old" | "new";
    [key: string]: unknown;
}

export default function GuidedFiling() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [formData, setFormData] = useState<FilingFormData>({});
    const [loading, setLoading] = useState(true);
    const [dynamicTip, setDynamicTip] = useState("");
    const [loadingTip, setLoadingTip] = useState(false);

    useEffect(() => {
        if (user) {
            fetchSavedState();
        }
    }, [user]);

    useEffect(() => {
        fetchDynamicTip();
    }, [currentStepIndex]);

    const fetchDynamicTip = async () => {
        setLoadingTip(true);
        const prompt = `As a tax expert, give a 1-sentence pro-tip for the step "${STEPS[currentStepIndex].title}" in an Indian ITR filing process.`;
        const result = await askTaxGuru(prompt);
        setDynamicTip(result.answer);
        setLoadingTip(false);
    };

    const fetchSavedState = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("filing_steps_state")
            .select("*")
            .eq("user_id", user!.id)
            .maybeSingle();

        if (data) {
            const stepIndex = STEPS.findIndex(s => s.id === data.current_step);
            if (stepIndex !== -1) setCurrentStepIndex(stepIndex);
            setFormData((data.answers as FilingFormData) || {});
        }
        setLoading(false);
    };

    const currentStep = STEPS[currentStepIndex];
    const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

    const nextStep = async () => {
        if (currentStepIndex < STEPS.length - 1) {
            const nextIdx = currentStepIndex + 1;
            const nextStepId = STEPS[nextIdx].id;

            // Save state to Supabase
            const { error } = await supabase
                .from("filing_steps_state")
                .upsert({
                    user_id: user!.id,
                    current_step: nextStepId,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    answers: formData as any,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                toast.error("Failed to save progress");
            } else {
                setCurrentStepIndex(nextIdx);
            }
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    if (loading) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse font-medium">Restoring your tax session...</p>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Progress Header */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Systematic Filing Wizard</h1>
                            <p className="text-muted-foreground">Relax, we'll guide you through every regulation.</p>
                        </div>
                        <span className="text-sm font-medium text-primary">Step {currentStepIndex + 1} of {STEPS.length}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                <div className="grid lg:grid-cols-4 gap-8">
                    {/* Stepper Sidebar */}
                    <div className="hidden lg:block space-y-4">
                        {STEPS.map((step, idx) => (
                            <div
                                key={step.id}
                                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${idx === currentStepIndex ? 'bg-primary/10 text-primary font-bold' :
                                    idx < currentStepIndex ? 'text-accent' : 'text-muted-foreground'
                                    }`}
                            >
                                {idx < currentStepIndex ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                ) : (
                                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs ${idx === currentStepIndex ? 'border-primary' : 'border-muted-foreground'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                )}
                                <span className="text-sm">{step.title}</span>
                            </div>
                        ))}
                    </div>

                    {/* Wizard Content */}
                    <div className="lg:col-span-3">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <Card className="border-2 border-primary/5 shadow-xl">
                                    <CardHeader className="bg-muted/30">
                                        <div className="flex items-center gap-2 text-primary mb-2">
                                            <Sparkles className="h-4 w-4" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">TaxMitra Intelligent Guide</span>
                                        </div>
                                        <CardTitle className="text-2xl">{currentStep.title}</CardTitle>
                                        <CardDescription>{currentStep.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="min-h-[300px] py-8">
                                        {/* Dynamic Step Rendering */}
                                        {currentStep.id === "profile" && <ProfileStep data={formData} update={setFormData} />}
                                        {currentStep.id === "income" && <IncomeStep data={formData} update={setFormData} />}
                                        {currentStep.id === "deductions" && <DeductionStep data={formData} update={setFormData} />}
                                        {currentStep.id === "credits" && <CreditsStep data={formData} update={setFormData} />}
                                        {currentStep.id === "review" && <ReviewStep data={formData} />}
                                    </CardContent>
                                    <CardFooter className="flex justify-between border-t bg-muted/10 p-6">
                                        <Button variant="ghost" onClick={prevStep} disabled={currentStepIndex === 0}>
                                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                                        </Button>
                                        <Button size="lg" className="px-8" onClick={nextStep}>
                                            {currentStepIndex === STEPS.length - 1 ? (
                                                <Link to="/efile" className="flex items-center">Proceed to E-File <CheckCircle2 className="ml-2 h-4 w-4" /></Link>
                                            ) : (
                                                <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>
                                            )}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                        </AnimatePresence>

                        {/* Contextual AI Help */}
                        <div className="mt-6 p-4 rounded-xl bg-accent/5 border border-accent/20 flex gap-4 min-h-[60px] items-center">
                            <Info className="h-5 w-5 text-accent shrink-0" />
                            <div className="text-sm text-muted-foreground italic">
                                <strong>Tax Explorer AI:</strong> {loadingTip ? (
                                    <span className="animate-pulse">Analyzing regulations...</span>
                                ) : (
                                    <span>{dynamicTip || getTipForStep(currentStepIndex)}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

// --- Sub-components for Steps ---

interface StepProps {
    data: FilingFormData;
    update: (data: FilingFormData) => void;
}

const ProfileStep = ({ data, update }: StepProps) => {
    const profiles = [
        { id: 'resident', title: 'Resident Individual', desc: 'Living in India for >182 days' },
        { id: 'nri', title: 'Non-Resident (NRI)', desc: 'Living outside India' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4">
                <div className="space-y-2">
                    <Label htmlFor="pan">Permanent Account Number (PAN)</Label>
                    <Input
                        id="pan"
                        placeholder="ABCDE1234F"
                        value={data.pan || ""}
                        onChange={(e) => update({ ...data, pan: e.target.value.toUpperCase() })}
                        className="font-mono text-lg tracking-wider"
                    />
                </div>

                <h3 className="text-lg font-bold text-slate-900 mt-4">Residency Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profiles.map(p => (
                        <div
                            key={p.id}
                            onClick={() => update({ ...data, residency: p.id })}
                            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer ${data.residency === p.id
                                ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-50'
                                : 'border-slate-100 bg-white hover:border-slate-200'
                                }`}
                        >
                            <h4 className="font-bold mb-1">{p.title}</h4>
                            <p className="text-xs text-slate-500 font-medium">{p.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const IncomeStep = ({ data, update }: StepProps) => {
    const sources = [
        { id: 'salary', label: 'Salary / Pension', icon: <Wallet className="h-4 w-4" />, desc: 'Income fixed by employer' },
        { id: 'business', label: 'Freelancer / Consultant', icon: <User className="h-4 w-4" />, desc: 'Professional or Business income' },
        { id: 'interest', label: 'Interest & Dividends', icon: <IndianRupee className="h-4 w-4" />, desc: 'Savings, FD & Stock dividends' },
        { id: 'crypto', label: 'Crypto / VDAs', icon: <Bitcoin className="h-4 w-4" />, desc: 'Bitcoin, NFTs, Trading gains' },
        { id: 'house_property', label: 'House Property', icon: <Building className="h-4 w-4" />, desc: 'Rental income from owned property' },
        { id: 'other', label: 'Other Sources', icon: <Sparkles className="h-4 w-4" />, desc: 'Commission, lottery, etc.' },
    ];

    const toggleSource = (id: string) => {
        const current = data.sources || [];
        const next = current.includes(id)
            ? current.filter((s: string) => s !== id)
            : [...current, id];
        update({ ...data, sources: next });
    };

    const currentSources = data.sources || [];

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Select Income Sources</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {sources.map(s => (
                        <div
                            key={s.id}
                            onClick={() => toggleSource(s.id)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all text-center ${currentSources.includes(s.id)
                                ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                                : 'border-slate-100 hover:border-slate-200 bg-white'
                                }`}
                        >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center mx-auto mb-2 ${currentSources.includes(s.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {s.icon}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-tighter">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />

            <div className="space-y-6">
                {currentSources.includes('salary') && (
                    <div className="space-y-2 animate-in slide-in-from-left duration-300">
                        <Label className="text-sm font-bold">Annual Gross Salary (Before Deductions)</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                            <Input
                                type="number"
                                className="pl-8 h-12 text-lg font-black"
                                value={data.salary || ""}
                                onChange={(e) => update({ ...data, salary: Number(e.target.value) })}
                                placeholder="12,00,000"
                            />
                        </div>
                    </div>
                )}

                {currentSources.includes('business') && (
                    <div className="space-y-2 animate-in slide-in-from-left duration-300">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <User className="h-4 w-4 text-indigo-500" /> Professional / Freelance Income (Net Taxable)
                        </Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                            <Input
                                type="number"
                                className="pl-8 h-12 text-lg font-black border-indigo-200"
                                value={data.businessIncome || ""}
                                onChange={(e) => update({ ...data, businessIncome: Number(e.target.value) })}
                                placeholder="Example: 50% of gross receipts (Sec 44ADA)"
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground italic">Enter your net profit after expenses. Professionals can claim 50% of receipts as profit.</p>
                    </div>
                )}

                {currentSources.includes('interest') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-right duration-300">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold">Savings Account Interest</Label>
                            <Input
                                type="number"
                                className="h-10 font-bold"
                                value={data.savingsInterest || ""}
                                onChange={(e) => update({ ...data, savingsInterest: Number(e.target.value) })}
                                placeholder="5,000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold">Fixed Deposit Interest</Label>
                            <Input
                                type="number"
                                className="h-10 font-bold"
                                value={data.fdInterest || ""}
                                onChange={(e) => update({ ...data, fdInterest: Number(e.target.value) })}
                                placeholder="25,000"
                            />
                        </div>
                    </div>
                )}

                {currentSources.includes('crypto') && (
                    <div className="space-y-2 border-l-4 border-indigo-500 pl-4 py-2 animate-in slide-in-from-bottom duration-300">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <Bitcoin className="h-4 w-4 text-indigo-500" /> VDA Gains (Section 115BBH)
                        </Label>
                        <Input
                            type="number"
                            className="h-12 text-lg font-black bg-indigo-50/30 border-indigo-200"
                            value={data.vdaGains || ""}
                            onChange={(e) => update({ ...data, vdaGains: Number(e.target.value) })}
                            placeholder="Gains from Crypto Trading"
                        />
                        <p className="text-[10px] text-muted-foreground italic">Taxed at a flat 30% plus 4% cess. Losses cannot be set off.</p>
                    </div>
                )}

                {currentSources.includes('house_property') && (
                    <div className="space-y-2 animate-in slide-in-from-right duration-300">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <Building className="h-4 w-4 text-indigo-500" /> Rental Income (Net of 30% Deduction)
                        </Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                            <Input
                                type="number"
                                className="pl-8 h-10 font-bold"
                                value={data.houseProperty || ""}
                                onChange={(e) => update({ ...data, houseProperty: Number(e.target.value) })}
                                placeholder="Total annual rent minus 30%"
                            />
                        </div>
                    </div>
                )}

                {currentSources.includes('other') && (
                    <div className="space-y-2 animate-in slide-in-from-bottom duration-300">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-indigo-500" /> Other Income (Commission, Gifts, etc.)
                        </Label>
                        <Input
                            type="number"
                            className="h-10 font-bold"
                            value={data.otherSourcesAmount || ""}
                            onChange={(e) => update({ ...data, otherSourcesAmount: Number(e.target.value) })}
                            placeholder="Amount received"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

const DeductionStep = ({ data, update }: StepProps) => {
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl">
                <div>
                    <h4 className="font-black text-slate-900 uppercase tracking-tighter italic">Tax Regime Selection</h4>
                    <p className="text-[10px] text-muted-foreground">New Regime is now default as per Finance Act 2024.</p>
                </div>
                <div className="flex bg-white p-1 rounded-xl shadow-inner">
                    <button
                        onClick={() => update({ ...data, regime: 'new' })}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${data.regime !== 'old' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        NEW
                    </button>
                    <button
                        onClick={() => update({ ...data, regime: 'old' })}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${data.regime === 'old' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        OLD
                    </button>
                </div>
            </div>

            {data.regime !== 'old' ? (
                <div className="p-8 border-2 border-dashed border-indigo-200 rounded-3xl bg-indigo-50/20 text-center space-y-4">
                    <Zap className="h-10 w-10 text-indigo-500 mx-auto animate-pulse" />
                    <div>
                        <h4 className="font-bold text-indigo-900">New Regime Optimization Active</h4>
                        <p className="text-xs text-indigo-800/70 max-w-sm mx-auto leading-relaxed mt-2">
                            Chapter VI-A deductions (80C, 80D, etc.) are **not available** in the New Regime. However, you get a higher standard deduction of **₹75,000** and lower tax slabs.
                        </p>
                    </div>
                    <Badge className="bg-indigo-600">Standard Deduction: ₹75,000 applied</Badge>
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Section 80C Investments</Label>
                            <Input
                                type="number"
                                className="h-10 font-bold"
                                value={data.section80C || ""}
                                onChange={(e) => update({ ...data, section80C: Number(e.target.value) })}
                                placeholder="ELSS, LIC, PPF, etc."
                            />
                            <p className="text-[10px] text-muted-foreground italic">Capped at ₹1.5 Lakhs</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Section 80D (Health Insurance)</Label>
                            <Input
                                type="number"
                                className="h-10 font-bold"
                                value={data.section80D || ""}
                                onChange={(e) => update({ ...data, section80D: Number(e.target.value) })}
                                placeholder="Premium for self/family"
                            />
                        </div>
                    </div>
                    <Badge className="bg-emerald-500">Standard Deduction: ₹50,000 applied</Badge>
                </div>
            )}
        </div>
    );
};

const CreditsStep = ({ data, update }: StepProps) => {
    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold">Taxes Already Paid</h3>
            <p className="text-xs text-muted-foreground -mt-4">Ensure these match your AIS/Form 26AS to avoid notices.</p>

            <div className="grid gap-6">
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-6">
                    <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <Label className="font-bold">Total TDS (Tax Deducted at Source)</Label>
                        <Input
                            type="number"
                            className="bg-white font-black"
                            value={data.tdsPaid || ""}
                            onChange={(e) => update({ ...data, tdsPaid: Number(e.target.value) })}
                            placeholder="Check Form 16 / 26AS"
                        />
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-6">
                    <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                        <Zap className="h-6 w-6" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <Label className="font-bold">Advance Tax / Self-Assessment Tax</Label>
                        <Input
                            type="number"
                            className="bg-white font-black"
                            value={data.advanceTax || ""}
                            onChange={(e) => update({ ...data, advanceTax: Number(e.target.value) })}
                            placeholder="Tax paid via challan"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ReviewStep = ({ data }: { data: FilingFormData }) => {
    const result: TaxResult = calculateTax({
        salary: Number(data.salary) || 0,
        houseProperty: Number(data.houseProperty) || 0,
        businessIncome: Number(data.businessIncome) || 0,
        otherSources: {
            savingsInterest: Number(data.savingsInterest) || 0,
            fdInterest: Number(data.fdInterest) || 0,
            dividends: Number(data.dividends) || 0,
            misc: Number(data.otherSourcesAmount) || 0
        },
        deductions: {
            section80C: Number(data.section80C) || 0,
            section80D: Number(data.section80D) || 0
        },
        vdaGains: Number(data.vdaGains) || 0,
        regime: data.regime || "new"
    });

    const taxCredits = (Number(data.tdsPaid) || 0) + (Number(data.advanceTax) || 0);
    const netPayable = Math.max(0, result.finalTax - taxCredits);
    const refund = Math.max(0, taxCredits - result.finalTax);

    return (
        <div className="space-y-8 animate-in zoom-in duration-500">
            <div className="text-center">
                <h2 className="text-3xl font-black tracking-tighter text-slate-900">Tax Computation FY 2025-26</h2>
                <p className="text-sm font-medium text-slate-500">Assessment Year 2026-27 • {data.regime === 'old' ? 'Old Regime' : 'New Regime'}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Result Summary */}
                <Card className={`overflow-hidden border-none shadow-2xl ${refund > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest opacity-70">
                            {refund > 0 ? <TrendingUp className="h-4 w-4" /> : <PieChart className="h-4 w-4" />}
                            {refund > 0 ? 'Net Refund Due' : 'Net Tax Payable'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-8">
                        <div className="text-6xl font-black tracking-tighter mb-2">
                            ₹{Math.round(refund > 0 ? refund : netPayable).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-white/20 text-white hover:bg-white/30 border-none">
                                {refund > 0 ? 'To be credited to Bank' : 'Pay via Challan 280'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Computation Breakdown */}
                <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Detailed Breakdown</h4>
                    <div className="space-y-3">
                        {Number(data.salary) > 0 && <BreakdownRow label="Salary Income (Net)" value={Number(data.salary) - (data.regime === 'old' ? 50000 : 75000)} faded />}
                        {Number(data.businessIncome) > 0 && <BreakdownRow label="Freelance / Business Profit" value={Number(data.businessIncome)} faded />}
                        {Number(data.houseProperty) > 0 && <BreakdownRow label="House Property (Net)" value={Number(data.houseProperty)} faded />}
                        {Number(result.grossTotalIncome - (Number(data.salary) || 0) - (Number(data.businessIncome) || 0) - (Number(data.houseProperty) || 0) + (data.regime === 'old' ? 50000 : 75000)) > 0 &&
                            <BreakdownRow label="Other Sources (Interest, etc.)" value={result.grossTotalIncome - (Number(data.salary) || 0) - (Number(data.businessIncome) || 0) - (Number(data.houseProperty) || 0) + (data.regime === 'old' ? 50000 : 75000)} faded />
                        }
                        <BreakdownRow label="Gross Total Income" value={result.grossTotalIncome} bold />
                        <BreakdownRow label="Deductions Claimed" value={result.totalDeductions} faded />
                        <BreakdownRow label="Taxable Income" value={result.taxableIncome} bold highlight />
                        <BreakdownRow label="Tax on Income" value={result.taxPayable} />
                        {result.vdaTax > 0 && <BreakdownRow label="VDA Tax (30%)" value={result.vdaTax} highlight />}
                        <BreakdownRow label="Health & Edu Cess (4%)" value={result.cess} />
                        <Separator />
                        <BreakdownRow label="Total Tax Liability" value={result.finalTax} bold />
                        <BreakdownRow label="Tax Credits (TDS/Paid)" value={taxCredits} color="text-emerald-500" />
                    </div>
                </div>
            </div>

            <div className="p-6 border-2 border-indigo-100 bg-indigo-50/30 rounded-3xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                        <FileJson className="h-6 w-6" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-900">Next Step: e-File Submission</h4>
                        <p className="text-xs text-muted-foreground">Ready to generate your ITR-1 JSON for upload to IT Portal.</p>
                    </div>
                </div>
                <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 font-black shadow-xl shadow-indigo-100">
                    GENERATE ITR JSON
                </Button>
            </div>
        </div>
    );
};

const BreakdownRow = ({ label, value, bold, faded, highlight, color }: { label: string, value: number, bold?: boolean, faded?: boolean, highlight?: boolean, color?: string }) => (
    <div className={`flex justify-between items-center ${faded ? 'opacity-50' : ''} ${highlight ? 'bg-indigo-50 p-2 rounded-lg' : ''}`}>
        <span className={`text-xs ${bold ? 'font-bold text-slate-900' : 'text-slate-600 font-medium'}`}>{label}</span>
        <span className={`text-sm ${bold ? 'font-black text-slate-900' : 'font-bold text-slate-700'} ${color || ''}`}>₹{Math.round(value).toLocaleString()}</span>
    </div>
);

// --- Helpers ---

interface OptionCardProps {
    icon: React.ReactNode;
    title: string;
    desc: string;
}

const OptionCard = ({ icon, title, desc }: OptionCardProps) => (
    <div className="p-6 rounded-xl border-2 hover:border-primary/50 cursor-pointer bg-background transition-all hover:shadow-lg group">
        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <h4 className="font-bold mb-1">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
);

interface SelectionItemProps {
    icon: React.ReactNode;
    label: string;
}

const SelectionItem = ({ icon, label }: SelectionItemProps) => (
    <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
        <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">{icon}</div>
            <span className="font-medium">{label}</span>
        </div>
        <input type="checkbox" className="h-5 w-5 rounded border-primary" />
    </div>
);

interface BadgeProps {
    children: React.ReactNode;
    className: string;
}

const Badge = ({ children, className }: BadgeProps) => (
    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${className}`}>
        {children}
    </span>
);

const getTipForStep = (idx: number) => {
    const tips = [
        "Your PAN is essential to fetch pre-filled data from the IT Portal via AI-Link.",
        "Dividends from Indian companies are taxable in your hands at slab rates.",
        "Under Section 80D, you can claim up to ₹25,000 for self/family and another ₹25,000 for parents.",
        "Always verify TDS with Form 26AS to avoid errors and mismatch notices.",
        "The New Regime is now the default regime unless you explicitly opt out."
    ];
    return tips[idx] || "";
}
