/**
 * Phase 2 — Smart Wizard
 *
 * A baby-step onboarding wizard that asks simple yes/no questions
 * to determine the user's tax situation, then pre-fills and launches
 * the Guided Filing flow.
 *
 * Designed for total newbies.
 * "Like a CA sitting next to you."
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Briefcase, TrendingUp, Coins, Building2, Landmark, Globe, Leaf,
    ChevronRight, ChevronLeft, Sparkles, GraduationCap, ArrowRight,
    Shield, BadgeCheck, Calculator, Check, AlertTriangle, HelpCircle,
    MapPin, Bitcoin, Home, Receipt, Wallet, CircleDollarSign, FileText,
    Banknote, PiggyBank, Users, Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { AppLayout } from '@/components/layout/AppLayout';
import { toast } from 'sonner';
import { computeTax, getConfig, type TaxInput } from '@/lib/taxEngine';

// ═══════════ TYPES ═══════════
interface WizardAnswers {
    // Step 1: Who are you
    userType: 'salaried' | 'freelancer' | 'business_owner' | 'student' | 'retired' | 'homemaker' | null;
    // Step 2: Income sources (yes/no)
    hasSalary: boolean;
    salaryApprox: number;
    hasFreelance: boolean;
    hasBusinessIncome: boolean;
    hasCryptoTrading: boolean;
    hasStocksMF: boolean;
    hasRentalIncome: boolean;
    hasFDInterest: boolean;
    hasForeignIncome: boolean;
    hasAgriculture: boolean;
    // Step 3: Quick numbers
    roughSalary: number;
    roughFreelanceIncome: number;
    roughCryptoGains: number;
    roughStockGains: number;
    // Step 4: Deductions awareness
    has80C: boolean;
    has80D: boolean;
    hasHomeLoan: boolean;
    hasNPS: boolean;
    approx80C: number;
    approx80D: number;
    // Step 5: Result shown, user chooses
}

const DEFAULT_ANSWERS: WizardAnswers = {
    userType: null,
    hasSalary: false, salaryApprox: 0,
    hasFreelance: false, hasBusinessIncome: false,
    hasCryptoTrading: false, hasStocksMF: false,
    hasRentalIncome: false, hasFDInterest: false,
    hasForeignIncome: false, hasAgriculture: false,
    roughSalary: 0, roughFreelanceIncome: 0,
    roughCryptoGains: 0, roughStockGains: 0,
    has80C: false, has80D: false, hasHomeLoan: false, hasNPS: false,
    approx80C: 0, approx80D: 0,
};

// ═══════════ USER TYPE OPTIONS ═══════════
const USER_TYPES = [
    { key: 'salaried', label: 'I work at a company', desc: 'I get monthly salary with Form 16', icon: Briefcase, gradient: 'from-blue-500 to-indigo-500' },
    { key: 'freelancer', label: 'I freelance / consult', desc: 'I invoice clients for my services', icon: GraduationCap, gradient: 'from-violet-500 to-purple-500' },
    { key: 'business_owner', label: 'I run a business', desc: 'Sole proprietor, partnership, etc.', icon: Building2, gradient: 'from-amber-500 to-orange-500' },
    { key: 'student', label: 'Student / Just started earning', desc: 'Internships, part-time, or first job', icon: GraduationCap, gradient: 'from-emerald-500 to-teal-500' },
    { key: 'retired', label: 'Retired / Pensioner', desc: 'Pension income, FDs, etc.', icon: PiggyBank, gradient: 'from-rose-500 to-pink-500' },
    { key: 'homemaker', label: 'Homemaker with investments', desc: 'FDs, stocks, rental income', icon: Home, gradient: 'from-cyan-500 to-sky-500' },
] as const;

// ═══════════ INCOME SOURCE CARDS ═══════════
const INCOME_QUESTIONS = [
    { key: 'hasSalary', label: 'Salary / Pension', desc: 'Monthly salary from an employer', icon: Briefcase, gradient: 'from-blue-500 to-indigo-500', autoFor: ['salaried', 'student'] },
    { key: 'hasFreelance', label: 'Freelance / Consulting', desc: 'You invoice clients / receive professional fees', icon: Receipt, gradient: 'from-violet-500 to-purple-500', autoFor: ['freelancer'] },
    { key: 'hasBusinessIncome', label: 'Business Profits', desc: 'Shop, e-commerce, trading firm', icon: Building2, gradient: 'from-amber-500 to-orange-500', autoFor: ['business_owner'] },
    { key: 'hasCryptoTrading', label: 'Crypto / NFTs', desc: 'Bitcoin, ETH, Solana, NFTs, meme coins', icon: Bitcoin, gradient: 'from-orange-500 to-red-500', autoFor: [] },
    { key: 'hasStocksMF', label: 'Stocks & Mutual Funds', desc: 'Sold shares, redeemed SIP, traded options', icon: TrendingUp, gradient: 'from-green-500 to-emerald-500', autoFor: [] },
    { key: 'hasRentalIncome', label: 'Rent from Property', desc: 'You own a house/flat you rent out', icon: Home, gradient: 'from-teal-500 to-cyan-500', autoFor: [] },
    { key: 'hasFDInterest', label: 'FD / Savings Interest', desc: 'Bank FD, RD, savings interest, dividends', icon: Landmark, gradient: 'from-sky-500 to-blue-500', autoFor: ['retired'] },
    { key: 'hasForeignIncome', label: 'Foreign Income', desc: 'Income from outside India', icon: Globe, gradient: 'from-pink-500 to-rose-500', autoFor: [] },
    { key: 'hasAgriculture', label: 'Agriculture Income', desc: 'Farm income (exempt but reported)', icon: Leaf, gradient: 'from-lime-500 to-green-500', autoFor: [] },
] as const;

const STEPS = [
    { id: 'who', label: 'About You' },
    { id: 'income', label: 'Income Sources' },
    { id: 'numbers', label: 'Quick Numbers' },
    { id: 'deductions', label: 'Tax Savings' },
    { id: 'result', label: 'Your Report' },
];

export default function SmartWizard() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<WizardAnswers>(DEFAULT_ANSWERS);
    const [showReview, setShowReview] = useState(false);

    const update = <K extends keyof WizardAnswers>(key: K, val: WizardAnswers[K]) =>
        setAnswers(prev => ({ ...prev, [key]: val }));

    const progress = Math.round(((step + 1) / STEPS.length) * 100);

    // Auto-detect ITR form based on answers
    const detectedForm = useMemo(() => {
        if (answers.hasBusinessIncome && !answers.hasFreelance) return { form: 'ITR-3', reason: 'You have business income' };
        if (answers.hasFreelance) return { form: 'ITR-4', reason: 'Freelance income → presumptive taxation (44ADA)' };
        if (answers.hasForeignIncome || answers.hasCryptoTrading || answers.hasStocksMF) return { form: 'ITR-2', reason: 'Capital gains / crypto / foreign income requires ITR-2' };
        if (answers.hasRentalIncome && !answers.hasSalary) return { form: 'ITR-2', reason: 'Rental income without salary' };
        return { form: 'ITR-1', reason: 'Simple salary/pension/interest → Sahaj' };
    }, [answers]);

    // Tax estimate from the unified engine
    const taxEstimate = useMemo(() => {
        const input: TaxInput = {
            regime: 'new',
            salary: answers.hasSalary ? { gross: answers.roughSalary, exemptAllowances: 0, professionalTax: 0 } : undefined,
            business: answers.hasFreelance ? { section: '44ADA', grossReceipts: answers.roughFreelanceIncome, expenses: 0, netProfit: answers.roughFreelanceIncome * 0.5 } :
                answers.hasBusinessIncome ? { section: '44AD', grossReceipts: answers.roughFreelanceIncome || 500000, expenses: 0, netProfit: 0 } : undefined,
            capitalGains: answers.hasStocksMF ? { stcgEquity: answers.roughStockGains * 0.4, stcgOther: 0, ltcgEquity: answers.roughStockGains * 0.6, ltcgOther: 0 } : undefined,
            cryptoVDA: answers.hasCryptoTrading ? { totalGains: answers.roughCryptoGains } : undefined,
            otherSources: answers.hasFDInterest ? { savingsInterest: 30000, fdInterest: 50000, dividendIncome: 0, otherIncome: 0 } : undefined,
            deductions: {
                section80C: answers.has80C ? answers.approx80C || 150000 : 0,
                section80D: answers.has80D ? answers.approx80D || 25000 : 0,
                section80CCD1B: answers.hasNPS ? 50000 : 0,
                homeLoanInterest: answers.hasHomeLoan ? 200000 : 0,
            },
        };
        const resultNew = computeTax({ ...input, regime: 'new' });
        const resultOld = computeTax({ ...input, regime: 'old' });
        return { new: resultNew, old: resultOld, better: resultNew.totalTaxLiability <= resultOld.totalTaxLiability ? 'new' as const : 'old' as const };
    }, [answers]);

    // When user selects their type, auto-select common income sources
    const selectUserType = (type: typeof USER_TYPES[number]['key']) => {
        const newAnswers = { ...answers, userType: type as WizardAnswers['userType'] };
        // Reset all income sources
        INCOME_QUESTIONS.forEach(q => { (newAnswers as any)[q.key] = false; });
        // Auto-select based on user type
        INCOME_QUESTIONS.forEach(q => {
            if ((q.autoFor as readonly string[]).includes(type)) (newAnswers as any)[q.key] = true;
        });
        setAnswers(newAnswers);
    };

    // Review & Confirm before proceeding
    const handleNext = () => {
        if (step < STEPS.length - 1) {
            if (step === 0 && !answers.userType) {
                toast.error('Please tell us what best describes you');
                return;
            }
            if (step === 1 && !INCOME_QUESTIONS.some(q => (answers as any)[q.key])) {
                toast.error('Please select at least one income source');
                return;
            }
            setShowReview(true);
        }
    };
    const confirmAndProceed = () => { setShowReview(false); setStep(step + 1); };
    const editCurrent = () => { setShowReview(false); };
    const goBack = () => { if (step > 0) { setShowReview(false); setStep(step - 1); } };

    // Launch guided filing with pre-filled data
    const launchGuidedFiling = () => {
        // Store answers in sessionStorage for GuidedFiling to pick up
        const prefill = {
            salary: { enabled: answers.hasSalary, grossSalary: answers.roughSalary },
            business: { enabled: answers.hasFreelance || answers.hasBusinessIncome, section: answers.hasFreelance ? '44ADA' : '44AD', grossReceipts: answers.roughFreelanceIncome },
            capitalGains: { enabled: answers.hasStocksMF },
            cryptoVDA: { enabled: answers.hasCryptoTrading, taxableGains: answers.roughCryptoGains },
            otherSources: { enabled: answers.hasFDInterest },
            houseProperty: { enabled: answers.hasRentalIncome },
            foreignAssets: { enabled: answers.hasForeignIncome },
            agriculture: { enabled: answers.hasAgriculture },
            deductions: {
                section80C: answers.has80C ? answers.approx80C || 150000 : 0,
                section80D: answers.has80D ? answers.approx80D || 25000 : 0,
                section80CCD1B: answers.hasNPS ? 50000 : 0,
                homeLoanInterest: answers.hasHomeLoan ? 200000 : 0,
            },
            regime: taxEstimate.better,
        };
        sessionStorage.setItem('smartWizardPrefill', JSON.stringify(prefill));
        toast.success('Smart setup complete! Let\'s file your ITR 🚀');
        navigate('/guided');
    };

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

    return (
        <AppLayout>
            <div className="max-w-3xl mx-auto py-6 px-4">
                {/* Header */}
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-3">
                        <Sparkles className="h-4 w-4" />
                        Smart Setup • {STEPS[step].label}
                    </div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
                        {step === 0 && "Let's understand your tax situation"}
                        {step === 1 && "Where did your money come from?"}
                        {step === 2 && "Roughly how much did you earn?"}
                        {step === 3 && "Are you saving on taxes?"}
                        {step === 4 && "Here's your tax picture 🎯"}
                    </h1>
                    <p className="text-muted-foreground text-sm mt-2">
                        {step === 0 && "We'll ask a few simple questions — no tax jargon, promise!"}
                        {step === 1 && "Tap all that apply. Don't worry about exact numbers yet."}
                        {step === 2 && "Ballpark figures are fine — we'll refine in the filing wizard."}
                        {step === 3 && "These reduce your tax. Select what you've invested in."}
                        {step === 4 && "Based on your answers, here's what we recommend."}
                    </p>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        {STEPS.map((s, i) => (
                            <div key={s.id} className={`flex items-center gap-1 text-xs font-medium ${i <= step ? 'text-primary' : 'text-muted-foreground'}`}>
                                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] ${i < step ? 'bg-primary text-primary-foreground' :
                                    i === step ? 'bg-primary/20 text-primary ring-2 ring-primary/30' :
                                        'bg-muted text-muted-foreground'
                                    }`}>
                                    {i < step ? <Check className="h-3 w-3" /> : i + 1}
                                </div>
                                <span className="hidden sm:inline">{s.label}</span>
                            </div>
                        ))}
                    </div>
                    <Progress value={progress} className="h-1.5" />
                </div>

                {/* Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={showReview ? `review-${step}` : `step-${step}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.25 }}
                        className="min-h-[420px]"
                    >
                        {showReview ? (
                            <StepReview step={step} answers={answers} detectedForm={detectedForm} taxEstimate={taxEstimate} fmt={fmt} onEdit={editCurrent} onConfirm={confirmAndProceed} />
                        ) : (
                            <>
                                {step === 0 && <Step1_WhoAreYou answers={answers} onSelect={selectUserType} />}
                                {step === 1 && <Step2_IncomeSources answers={answers} update={update} />}
                                {step === 2 && <Step3_QuickNumbers answers={answers} update={update} fmt={fmt} />}
                                {step === 3 && <Step4_Deductions answers={answers} update={update} />}
                                {step === 4 && <Step5_Result answers={answers} detectedForm={detectedForm} taxEstimate={taxEstimate} fmt={fmt} onLaunch={launchGuidedFiling} />}
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Navigation */}
                {!showReview && step < 4 && (
                    <div className="flex justify-between mt-8 pt-4 border-t">
                        <Button variant="outline" onClick={goBack} disabled={step === 0}>
                            <ChevronLeft className="h-4 w-4 mr-1" />Back
                        </Button>
                        <Button onClick={handleNext} className="gap-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md">
                            Continue<ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                {step === 4 && !showReview && (
                    <div className="flex justify-between mt-8 pt-4 border-t">
                        <Button variant="outline" onClick={goBack}>
                            <ChevronLeft className="h-4 w-4 mr-1" />Back
                        </Button>
                        <Button onClick={launchGuidedFiling} className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg h-12 px-6 text-base">
                            Start Filing<ArrowRight className="h-5 w-5" />
                        </Button>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}


// ═══════════ STEP 1: Who Are You ═══════════
function Step1_WhoAreYou({ answers, onSelect }: { answers: WizardAnswers; onSelect: (type: any) => void }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {USER_TYPES.map(t => {
                const selected = answers.userType === t.key;
                return (
                    <button key={t.key} onClick={() => onSelect(t.key)}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${selected ? 'border-primary bg-primary/5 shadow-md scale-[1.02]' : 'border-border hover:border-primary/40 hover:shadow-sm'
                            }`}>
                        <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shrink-0`}>
                            <t.icon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{t.label}</span>
                                {selected && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}


// ═══════════ STEP 2: Income Sources ═══════════
function Step2_IncomeSources({ answers, update }: { answers: WizardAnswers; update: <K extends keyof WizardAnswers>(k: K, v: WizardAnswers[K]) => void }) {
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-2">Select everything that applies. We auto-selected based on your profile — adjust if needed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {INCOME_QUESTIONS.map(q => {
                    const enabled = (answers as any)[q.key] as boolean;
                    return (
                        <button key={q.key} onClick={() => update(q.key as any, !enabled)}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${enabled ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'
                                }`}>
                            <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${q.gradient} flex items-center justify-center shrink-0`}>
                                <q.icon className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="font-medium text-sm">{q.label}</span>
                                <p className="text-[11px] text-muted-foreground leading-tight">{q.desc}</p>
                            </div>
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${enabled ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                }`}>
                                {enabled && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                        </button>
                    );
                })}
            </div>
            <Card className="bg-primary/5 border-primary/20 mt-4">
                <CardContent className="py-3 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div>
                        <p className="text-sm font-medium">We'll recommend the right ITR form automatically</p>
                        <p className="text-xs text-muted-foreground">Based on your income sources — no guesswork needed</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}


// ═══════════ STEP 3: Quick Numbers ═══════════
function Step3_QuickNumbers({ answers, update, fmt }: { answers: WizardAnswers; update: <K extends keyof WizardAnswers>(k: K, v: WizardAnswers[K]) => void; fmt: (n: number) => string }) {
    const numField = (key: keyof WizardAnswers, label: string, hint: string) => (
        <div>
            <Label className="text-sm">{label}</Label>
            <Input
                type="number"
                value={(answers[key] as number) || ''}
                onChange={e => update(key, parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
        </div>
    );

    const activeFields: { key: keyof WizardAnswers; label: string; hint: string }[] = [];
    if (answers.hasSalary) activeFields.push({ key: 'roughSalary', label: '💼 Annual Salary (before tax)', hint: 'CTC or gross salary — Form 16 has this' });
    if (answers.hasFreelance) activeFields.push({ key: 'roughFreelanceIncome', label: '📋 Freelance / Consulting Income', hint: 'Total invoices in FY 2025-26' });
    if (answers.hasBusinessIncome) activeFields.push({ key: 'roughFreelanceIncome', label: '🏪 Business Gross Receipts', hint: 'Total turnover / sales' });
    if (answers.hasCryptoTrading) activeFields.push({ key: 'roughCryptoGains', label: '₿ Crypto Net Gains (profit)', hint: 'Total profit (not volume). Losses can\'t offset.' });
    if (answers.hasStocksMF) activeFields.push({ key: 'roughStockGains', label: '📈 Stock / MF Capital Gains', hint: 'Net profit from selling. LTCG + STCG combined.' });

    if (activeFields.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                    <Calculator className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">You haven't selected income sources that need amounts</p>
                    <p className="text-sm mt-1">Go back and select your income types</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card className="bg-sky-500/5 border-sky-500/20">
                <CardContent className="py-3 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-sky-500 shrink-0" />
                    <p className="text-sm text-sky-700">Ballpark numbers are fine! We'll ask for exact amounts in the filing wizard.</p>
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeFields.map(f => (
                    <div key={f.key}>
                        {numField(f.key, f.label, f.hint)}
                    </div>
                ))}
            </div>
        </div>
    );
}


// ═══════════ STEP 4: Deductions ═══════════
function Step4_Deductions({ answers, update }: { answers: WizardAnswers; update: <K extends keyof WizardAnswers>(k: K, v: WizardAnswers[K]) => void }) {
    const deductions = [
        { key: 'has80C' as const, label: '80C — PPF, ELSS, LIC, EPF', desc: 'Max ₹1.5L deduction', icon: Shield, limit: 150000, approxKey: 'approx80C' as const },
        { key: 'has80D' as const, label: '80D — Health Insurance', desc: 'Self & parents premium', icon: BadgeCheck, limit: 75000, approxKey: 'approx80D' as const },
        { key: 'hasNPS' as const, label: '80CCD(1B) — NPS', desc: 'Additional ₹50K for NPS', icon: PiggyBank, limit: 50000 },
        { key: 'hasHomeLoan' as const, label: 'Home Loan Interest', desc: 'Section 24(b) — Max ₹2L', icon: Home, limit: 200000 },
    ];

    return (
        <div className="space-y-4">
            <Card className="bg-emerald-500/5 border-emerald-500/20">
                <CardContent className="py-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-emerald-700">These deductions reduce your taxable income in the <strong>Old Regime</strong>. New Regime has limited deductions but lower slabs.</p>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {deductions.map(d => {
                    const active = (answers as any)[d.key] as boolean;
                    return (
                        <div key={d.key} className={`rounded-xl border-2 transition-all ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
                            <button onClick={() => update(d.key, !active)} className="w-full flex items-center gap-3 p-4 text-left">
                                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <d.icon className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div className="flex-1">
                                    <span className="font-medium text-sm">{d.label}</span>
                                    <p className="text-xs text-muted-foreground">{d.desc}</p>
                                </div>
                                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                    }`}>
                                    {active && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                            </button>
                            {active && 'approxKey' in d && (
                                <div className="px-4 pb-4">
                                    <Input
                                        type="number"
                                        value={(answers as any)[d.approxKey!] || ''}
                                        onChange={e => update(d.approxKey! as any, parseFloat(e.target.value) || 0)}
                                        placeholder={`Up to ₹${(d.limit / 100000).toFixed(1)}L`}
                                        className="text-sm"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


// ═══════════ STEP 5: Result ═══════════
function Step5_Result({ answers, detectedForm, taxEstimate, fmt, onLaunch }: {
    answers: WizardAnswers;
    detectedForm: { form: string; reason: string };
    taxEstimate: { new: ReturnType<typeof computeTax>; old: ReturnType<typeof computeTax>; better: 'old' | 'new' };
    fmt: (n: number) => string;
    onLaunch: () => void;
}) {
    const savings = Math.abs(taxEstimate.old.totalTaxLiability - taxEstimate.new.totalTaxLiability);
    const selectedSources = INCOME_QUESTIONS.filter(q => (answers as any)[q.key]);

    return (
        <div className="space-y-4">
            {/* Tax Estimate Card */}
            <Card className="border-2 border-primary/20 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 text-white">
                    <p className="text-sm opacity-80">Estimated Tax Liability (AY 2026-27)</p>
                    <p className="text-4xl font-bold mt-1">{fmt(taxEstimate[taxEstimate.better].totalTaxLiability)}</p>
                    <p className="text-sm opacity-80 mt-1">under {taxEstimate.better === 'new' ? 'New' : 'Old'} Regime</p>
                </div>
                <CardContent className="p-4 space-y-3">
                    {/* Regime comparison */}
                    <div className="grid grid-cols-2 gap-3">
                        {(['old', 'new'] as const).map(r => (
                            <div key={r} className={`p-3 rounded-lg border ${taxEstimate.better === r ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                                <div className="flex items-center gap-1 mb-1">
                                    <span className="text-xs font-medium">{r === 'old' ? 'Old' : 'New'} Regime</span>
                                    {taxEstimate.better === r && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-600 px-1 py-0">Best</Badge>}
                                </div>
                                <p className="text-lg font-bold">{fmt(taxEstimate[r].totalTaxLiability)}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    On {fmt(taxEstimate[r].taxableIncome)} taxable
                                </p>
                            </div>
                        ))}
                    </div>
                    {savings > 0 && (
                        <p className="text-sm text-center text-emerald-600 font-medium">
                            💡 {taxEstimate.better === 'new' ? 'New' : 'Old'} Regime saves you {fmt(savings)}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ITR Form */}
            <Card>
                <CardContent className="py-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Recommended: {detectedForm.form}</p>
                        <p className="text-xs text-muted-foreground">{detectedForm.reason}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Income Sources Summary */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Your Income Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                    {selectedSources.map(s => (
                        <div key={s.key} className="flex items-center gap-2 text-sm">
                            <div className={`h-6 w-6 rounded bg-gradient-to-br ${s.gradient} flex items-center justify-center`}>
                                <s.icon className="h-3 w-3 text-white" />
                            </div>
                            <span>{s.label}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Disclaimer */}
            <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="py-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">This is an <strong>estimate</strong> based on approximate values. Exact tax will be calculated in the filing wizard with your actual numbers.</p>
                </CardContent>
            </Card>
        </div>
    );
}


// ═══════════ STEP REVIEW INTERSTITIAL ═══════════
function StepReview({ step, answers, detectedForm, taxEstimate, fmt, onEdit, onConfirm }: {
    step: number;
    answers: WizardAnswers;
    detectedForm: { form: string; reason: string };
    taxEstimate: { new: ReturnType<typeof computeTax>; old: ReturnType<typeof computeTax>; better: 'old' | 'new' };
    fmt: (n: number) => string;
    onEdit: () => void;
    onConfirm: () => void;
}) {
    const items: { label: string; value: string; anomaly?: string }[] = [];

    switch (step) {
        case 0:
            items.push({ label: 'You are', value: USER_TYPES.find(t => t.key === answers.userType)?.label || '—', anomaly: !answers.userType ? 'Please select who you are' : undefined });
            break;
        case 1: {
            const selected = INCOME_QUESTIONS.filter(q => (answers as any)[q.key]);
            if (selected.length === 0) {
                items.push({ label: 'Income Sources', value: 'None selected', anomaly: 'You must select at least one income source' });
            } else {
                selected.forEach(s => items.push({ label: s.label, value: s.desc }));
            }
            items.push({ label: 'Detected ITR Form', value: `${detectedForm.form} — ${detectedForm.reason}` });
            break;
        }
        case 2:
            if (answers.hasSalary) items.push({ label: 'Salary', value: fmt(answers.roughSalary), anomaly: answers.roughSalary === 0 ? 'Salary is ₹0 — did you forget to enter?' : undefined });
            if (answers.hasFreelance || answers.hasBusinessIncome) items.push({ label: 'Freelance / Business', value: fmt(answers.roughFreelanceIncome), anomaly: answers.roughFreelanceIncome === 0 ? 'Business income is ₹0 — is this correct?' : undefined });
            if (answers.hasCryptoTrading) items.push({ label: 'Crypto Gains', value: fmt(answers.roughCryptoGains) });
            if (answers.hasStocksMF) items.push({ label: 'Stock / MF Gains', value: fmt(answers.roughStockGains) });
            if (items.length === 0) items.push({ label: 'No amounts entered', value: '—', anomaly: 'You haven\'t entered any income amounts' });
            break;
        case 3: {
            const deds: string[] = [];
            if (answers.has80C) deds.push(`80C: ${fmt(answers.approx80C || 150000)}`);
            if (answers.has80D) deds.push(`80D: ${fmt(answers.approx80D || 25000)}`);
            if (answers.hasNPS) deds.push('NPS: ₹50,000');
            if (answers.hasHomeLoan) deds.push('Home Loan: ₹2,00,000');
            if (deds.length === 0) items.push({ label: 'Deductions', value: 'None claimed' });
            else deds.forEach(d => items.push({ label: 'Deduction', value: d }));
            items.push({ label: 'Estimated Tax', value: `${fmt(taxEstimate[taxEstimate.better].totalTaxLiability)} (${taxEstimate.better === 'new' ? 'New' : 'Old'} Regime)` });
            break;
        }
    }

    const hasAnomalies = items.some(i => i.anomaly);

    return (
        <div className="space-y-4">
            <Card className="border-2 border-primary/20 shadow-lg">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Eye className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Review & Confirm</CardTitle>
                            <p className="text-sm text-muted-foreground">Verify before continuing</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {items.map((item, i) => (
                        <div key={i} className={`flex items-start justify-between p-3 rounded-lg ${item.anomaly ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-muted/40'}`}>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{item.label}</p>
                                <p className="text-sm text-muted-foreground">{item.value}</p>
                            </div>
                            {item.anomaly && (
                                <div className="flex items-start gap-1.5 ml-3 shrink-0 max-w-[200px]">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                    <p className="text-xs text-amber-600">{item.anomaly}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            {hasAnomalies && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="py-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-sm text-amber-700">Some fields need attention. Fix or proceed if intentional.</p>
                    </CardContent>
                </Card>
            )}

            <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-12 gap-2" onClick={onEdit}>
                    Edit something
                </Button>
                <Button className="flex-1 h-12 gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg" onClick={onConfirm}>
                    Looks correct<ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
