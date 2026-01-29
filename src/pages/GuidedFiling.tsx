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
    TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { askTaxGuru } from "@/lib/ai-service";

type Step = {
    id: string;
    title: string;
    description: string;
}

const STEPS: Step[] = [
    { id: "profile", title: "Personal Profile", description: "Who are you filing for?" },
    { id: "income", title: "Income Sources", description: "Where did you earn money?" },
    { id: "deductions", title: "Tax Savings", description: "Claim your investments (80C, 80D)" },
    { id: "foreign", title: "Global Assets", description: "Do you have US stocks or foreign accounts?" },
    { id: "review", title: "Review & Compute", description: "See your final tax liability" },
];

export default function GuidedFiling() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [formData, setFormData] = useState<any>({});
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
            setFormData(data.answers || {});
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
                    answers: formData,
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
                                        {currentStep.id === "foreign" && <ForeignStep data={formData} update={setFormData} />}
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

const ProfileStep = ({ data, update }: any) => {
    const profiles = [
        { id: 'resident', title: 'Resident Individual', desc: 'Living in India for >182 days' },
        { id: 'nri', title: 'Non-Resident (NRI)', desc: 'Living outside India' },
    ];

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">What is your residency status?</h3>
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
    );
};

const IncomeStep = ({ data, update }: any) => {
    const sources = [
        { id: 'salary', label: 'Salary / Pension', icon: <Wallet className="h-4 w-4" />, desc: 'Income from employer or government pension' },
        { id: 'house_1', label: 'Single House Property', icon: <Building className="h-4 w-4" />, desc: 'Rent from one property you own' },
        { id: 'house_multi', label: 'Multiple House Properties', icon: <Building className="h-4 w-4" />, desc: 'Rent from 2+ properties' },
        { id: 'business', label: 'Freelancing / Consultancy', icon: <Building className="h-4 w-4" />, desc: 'Self-employed income, invoiced clients' },
        { id: 'self_employed', label: 'Self-Employed / Professional', icon: <Wallet className="h-4 w-4" />, desc: 'Doctor, Lawyer, CA, Architect, etc.' },
        { id: 'crypto', label: 'Crypto / VDAs (Section 115BBH)', icon: <Bitcoin className="h-4 w-4" />, desc: 'Bitcoin, Ethereum, NFTs, etc.' },
        { id: 'capital_gains', label: 'Stock Market / Mutual Funds', icon: <TrendingUp className="h-4 w-4" />, desc: 'LTCG, STCG from equity/debt funds' },
        { id: 'foreign', label: 'Foreign Income / US Shares', icon: <Globe className="h-4 w-4" />, desc: 'RSUs, ESOPs, Dividends from US stocks' },
        { id: 'interest', label: 'Interest Income (FD/Savings)', icon: <Wallet className="h-4 w-4" />, desc: 'Bank FDs, RDs, Savings account interest' },
        { id: 'dividend', label: 'Dividend Income', icon: <TrendingUp className="h-4 w-4" />, desc: 'Dividends from Indian/Foreign stocks' },
        { id: 'agriculture', label: 'Agricultural Income', icon: <Building className="h-4 w-4" />, desc: 'Income from farming (exempt but reportable)' },
        { id: 'lottery', label: 'Lottery / Game Show Winnings', icon: <Wallet className="h-4 w-4" />, desc: 'Taxed at 30% flat under Section 115BB' },
        { id: 'zero_income', label: 'No Taxable Income / Zero Filing', icon: <Wallet className="h-4 w-4" />, desc: 'Filing for refund or compliance only' },
        { id: 'other', label: 'Other Income', icon: <Wallet className="h-4 w-4" />, desc: 'Commission, gifts, family pension, etc.' },
    ];

    const toggleSource = (id: string) => {
        const current = data.sources || [];
        const next = current.includes(id)
            ? current.filter((s: string) => s !== id)
            : [...current, id];
        update({ ...data, sources: next });
    };

    const determineITR = () => {
        const s = data.sources || [];
        if (s.length === 0 || (s.length === 1 && s.includes('zero_income'))) return "ITR-1 (Sahaj) - Zero Filing";
        if (s.includes('business') || s.includes('self_employed')) return "ITR-3 (or ITR-4 for Presumptive)";
        if (s.includes('crypto') || s.includes('capital_gains') || s.includes('house_multi') || s.includes('foreign') || s.includes('lottery')) return "ITR-2";
        if (s.length > 0) return "ITR-1 (Sahaj)";
        return "Not determined";
    };

    const suggestedITR = determineITR();

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Where did you earn money? (Select all that apply)</h3>
            <p className="text-sm text-slate-500 -mt-4">Select all income sources you had during FY 2025-26 (April 2025 - March 2026)</p>
            <div className="grid gap-3 max-h-[450px] overflow-y-auto pr-2">
                {sources.map(s => (
                    <div
                        key={s.id}
                        onClick={() => toggleSource(s.id)}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${(data.sources || []).includes(s.id)
                            ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                            }`}
                    >
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${(data.sources || []).includes(s.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {s.icon}
                        </div>
                        <div className="flex-1">
                            <span className="font-bold text-slate-700 block">{s.label}</span>
                            <span className="text-xs text-slate-400">{s.desc}</span>
                        </div>
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${(data.sources || []).includes(s.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'
                            }`}>
                            {(data.sources || []).includes(s.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </div>
                    </div>
                ))}
            </div>

            {(data.sources || []).length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-xl animate-in zoom-in duration-300">
                    <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Intelligent AI Suggestion</p>
                        <h4 className="text-xl font-black mt-1">File <span className="text-indigo-400">{suggestedITR}</span></h4>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center">
                        <Sparkles className="h-6 w-6 text-white" />
                    </div>
                </div>
            )}
        </div>
    );
};

const DeductionStep = ({ data, update }: any) => (
    <div className="space-y-6">
        <h3 className="text-lg font-semibold">Max out your savings</h3>
        <p className="text-sm text-muted-foreground">We'll check old vs new regime automatically for you.</p>
        <div className="grid gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                <div>
                    <p className="font-bold">Standard Deduction</p>
                    <p className="text-xs text-muted-foreground">₹75,000 (New Regime) Applied Automatically</p>
                </div>
                <Badge className="bg-accent">Applied</Badge>
            </div>
        </div>
    </div>
);

const ForeignStep = ({ data, update }: any) => (
    <div className="space-y-6">
        <h3 className="text-lg font-semibold">International Compliance (Schedule FA)</h3>
        <div className="p-4 rounded-lg border-2 border-warning/20 bg-warning/5">
            <div className="flex gap-3">
                <Globe className="h-6 w-6 text-warning" />
                <div>
                    <p className="font-bold">Do you hold US stocks or foreign accounts?</p>
                    <p className="text-sm text-muted-foreground mt-1">If you have RSUs from a US parent company (like Google, Amazon), you <strong>MUST</strong> declare them in Schedule FA.</p>
                </div>
            </div>
            <div className="mt-4 flex gap-4">
                <Button size="sm">Yes, I hold foreign assets</Button>
                <Button size="sm" variant="ghost">No</Button>
            </div>
        </div>
    </div>
);

const ReviewStep = ({ data }: any) => (
    <div className="text-center space-y-6 py-10">
        <div className="h-20 w-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto text-accent mb-4">
            <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="text-3xl font-bold">Calculation Complete!</h2>
        <div className="max-w-xs mx-auto p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
            <p className="text-sm text-muted-foreground font-medium">Estimated Tax Refund</p>
            <p className="text-4xl font-black text-primary">₹12,450</p>
        </div>
        <p className="text-sm text-muted-foreground">We found ₹4,500 extra savings via Section 80D.</p>
    </div>
);

// --- Helpers ---

const OptionCard = ({ icon, title, desc }: any) => (
    <div className="p-6 rounded-xl border-2 hover:border-primary/50 cursor-pointer bg-background transition-all hover:shadow-lg group">
        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <h4 className="font-bold mb-1">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
);

const SelectionItem = ({ icon, label }: any) => (
    <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
        <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">{icon}</div>
            <span className="font-medium">{label}</span>
        </div>
        <input type="checkbox" className="h-5 w-5 rounded border-primary" />
    </div>
);

const Badge = ({ children, className }: any) => (
    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${className}`}>
        {children}
    </span>
);

const getTipForStep = (idx: number) => {
    const tips = [
        "Most salaried Indians qualify for ITR-1. If you trade stocks, you'll need ITR-2.",
        "Did you know? Even ₹10,000 in dividends must be reported to avoid income tax notices.",
        "Section 80C allows deductions up to ₹1.5L. Don't forget your EPF contributions!",
        "Failure to report a foreign bank account can lead to a ₹10 Lakh penalty under the Black Money Act. Be safe!",
        "Review your regime comparison carefully. The new regime is often better if you lack major investments."
    ];
    return tips[idx] || "";
}
