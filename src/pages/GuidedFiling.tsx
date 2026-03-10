/**
 * Guided ITR Filing — Step-by-Step Wizard
 * Uses the central filing session for all data.
 */
import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useFilingSession } from '@/hooks/useFilingSession';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
    Loader2, ChevronRight, ChevronLeft, User, Briefcase, TrendingUp, Coins, Building2,
    Landmark, PiggyBank, Globe, Leaf, CheckCircle, AlertTriangle, ArrowRight, Download,
    Shield, Calculator, FileText, Wallet, Check, XCircle, Info,
} from 'lucide-react';
import { autoDetectITRForm, type FilingSession, computeGrossTotalIncome, computeTotalTDS } from '@/lib/filing-session';
import { downloadITRJson, validateITRData, mapSessionToITRData, type ITRFilingData } from '@/lib/itr-json-generator';
import { INDIAN_STATES } from '@/lib/validators';
import { generateChallan280, downloadChallanHTML } from '@/lib/challan-generator';
import { downloadComputationStatement, generateComputationReport } from '@/lib/tax-reports';

const STEPS = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'income-select', label: 'Income Sources', icon: Briefcase },
    { id: 'income-entry', label: 'Income Details', icon: Wallet },
    { id: 'deductions', label: 'Deductions', icon: Shield },
    { id: 'regime', label: 'Tax Regime', icon: Calculator },
    { id: 'review', label: 'Review & File', icon: FileText },
];

// Current FY
const CURRENT_FY = 'FY2025-26';

export default function GuidedFiling() {
    const { session, loading, saving, updateSession, forceSave, validation, itrForm, grossIncome, totalTDS, progress } = useFilingSession(CURRENT_FY);
    const [step, setStep] = useState(0);

    if (loading || !session) {
        return <AppLayout><div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;
    }

    const goNext = () => { if (step < STEPS.length - 1) { setStep(step + 1); forceSave(); } };
    const goBack = () => { if (step > 0) setStep(step - 1); };

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto py-6 px-4">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">File Your ITR</h1>
                    <p className="text-muted-foreground text-sm mt-1">{session.assessmentYear} • {session.financialYear}</p>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Progress</span>
                        <span className="text-sm font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                {/* Step indicators */}
                <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
                    {STEPS.map((s, i) => (
                        <button key={s.id} onClick={() => setStep(i)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${i === step ? 'bg-primary text-primary-foreground shadow-md' :
                                i < step ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                }`}>
                            <s.icon className="h-3.5 w-3.5" />
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Step Content */}
                <div className="min-h-[400px]">
                    {step === 0 && <PersonalInfoStep session={session} updateSession={updateSession} />}
                    {step === 1 && <IncomeSelectionStep session={session} updateSession={updateSession} />}
                    {step === 2 && <IncomeEntryStep session={session} updateSession={updateSession} />}
                    {step === 3 && <DeductionsStep session={session} updateSession={updateSession} />}
                    {step === 4 && <RegimeStep session={session} updateSession={updateSession} grossIncome={grossIncome} totalTDS={totalTDS} />}
                    {step === 5 && <ReviewStep session={session} updateSession={updateSession} validation={validation} itrForm={itrForm} grossIncome={grossIncome} totalTDS={totalTDS} />}
                </div>

                {/* Navigation */}
                <div className="flex justify-between mt-8 pt-4 border-t">
                    <Button variant="outline" onClick={goBack} disabled={step === 0}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
                    <div className="flex items-center gap-2">
                        {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>}
                        {step < STEPS.length - 1 ? (
                            <Button onClick={goNext}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
                        ) : (
                            <Button onClick={() => toast.success('Review complete!')} className="bg-emerald-600 hover:bg-emerald-500"><CheckCircle className="h-4 w-4 mr-1" />Complete</Button>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

// ═══════════ STEP 1: Personal Info ═══════════
function PersonalInfoStep({ session, updateSession }: { session: FilingSession; updateSession: (fn: (s: FilingSession) => FilingSession) => void }) {
    const u = (field: string, value: string) => updateSession(s => ({ ...s, personalInfo: { ...s.personalInfo, [field]: value } }));
    const p = session.personalInfo;

    return (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Tell us about yourself</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><Label>PAN Number *</Label><Input value={p.pan || ''} onChange={e => u('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} /></div>
                    <div><Label>First Name *</Label><Input value={p.firstName || ''} onChange={e => u('firstName', e.target.value)} /></div>
                    <div><Label>Last Name *</Label><Input value={p.lastName || ''} onChange={e => u('lastName', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><Label>Date of Birth *</Label><Input type="date" value={p.dateOfBirth || ''} onChange={e => u('dateOfBirth', e.target.value)} /></div>
                    <div><Label>Gender</Label>
                        <Select value={p.gender || 'M'} onValueChange={v => u('gender', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="M">Male</SelectItem><SelectItem value="F">Female</SelectItem><SelectItem value="O">Other</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div><Label>Father's Name</Label><Input value={p.fatherName || ''} onChange={e => u('fatherName', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Email *</Label><Input type="email" value={p.email || ''} onChange={e => u('email', e.target.value)} /></div>
                    <div><Label>Mobile *</Label><Input value={p.mobile || ''} onChange={e => u('mobile', e.target.value)} maxLength={10} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><Label>Flat/Door No *</Label><Input value={p.flatNo || ''} onChange={e => u('flatNo', e.target.value)} /></div>
                    <div><Label>City *</Label><Input value={p.city || ''} onChange={e => u('city', e.target.value)} /></div>
                    <div><Label>State *</Label>
                        <Select value={p.state || ''} onValueChange={v => u('state', v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{INDIAN_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Pincode *</Label><Input value={p.pincode || ''} onChange={e => u('pincode', e.target.value)} maxLength={6} /></div>
                    <div><Label>Resident Status</Label>
                        <Select value={p.residentStatus || 'RES'} onValueChange={v => u('residentStatus', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="RES">Resident</SelectItem><SelectItem value="NRI">Non-Resident</SelectItem><SelectItem value="RNOR">RNOR</SelectItem></SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ═══════════ STEP 2: Income Selection ═══════════
const INCOME_OPTIONS = [
    { key: 'salary', label: 'Salary / Pension', desc: 'From employer (Form 16)', icon: Briefcase, color: 'from-blue-500 to-indigo-500' },
    { key: 'houseProperty', label: 'House Property', desc: 'Rent received or home loan', icon: Building2, color: 'from-amber-500 to-orange-500' },
    { key: 'capitalGains', label: 'Stocks & Mutual Funds', desc: 'STCG / LTCG from equity', icon: TrendingUp, color: 'from-green-500 to-emerald-500' },
    { key: 'cryptoVDA', label: 'Crypto / VDA', desc: 'Bitcoin, ETH, tokens (30% tax)', icon: Coins, color: 'from-violet-500 to-purple-500' },
    { key: 'business', label: 'Business / Freelance', desc: 'Self-employed or consultancy', icon: Briefcase, color: 'from-rose-500 to-pink-500' },
    { key: 'otherSources', label: 'Interest & Dividends', desc: 'FD, savings, dividends', icon: Landmark, color: 'from-cyan-500 to-teal-500' },
    { key: 'foreignAssets', label: 'Foreign Income', desc: 'Income from outside India', icon: Globe, color: 'from-sky-500 to-blue-500' },
    { key: 'agriculture', label: 'Agriculture', desc: 'Farm income (exempt, reported)', icon: Leaf, color: 'from-lime-500 to-green-500' },
];

function IncomeSelectionStep({ session, updateSession }: { session: FilingSession; updateSession: (fn: (s: FilingSession) => FilingSession) => void }) {
    const toggle = (key: string) => updateSession(s => {
        const section = s[key as keyof FilingSession] as any;
        return { ...s, [key]: { ...section, enabled: !section.enabled } };
    });

    const isEnabled = (key: string) => (session[key as keyof FilingSession] as any)?.enabled ?? false;
    const detected = autoDetectITRForm(session);

    return (
        <div className="space-y-4">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />What income did you earn in {session.financialYear}?</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">Select all that apply. We'll ask details in the next step.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {INCOME_OPTIONS.map(opt => {
                            const enabled = isEnabled(opt.key);
                            const synced = opt.key === 'cryptoVDA' && session.cryptoVDA.syncedAt;
                            return (
                                <button key={opt.key} onClick={() => toggle(opt.key)}
                                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${enabled ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/40'
                                        }`}>
                                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${opt.color} flex items-center justify-center shrink-0`}>
                                        <opt.icon className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{opt.label}</span>
                                            {synced && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Synced</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${enabled ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                                        {enabled && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
            {/* ITR Form auto-detection */}
            <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-4 flex items-center gap-3">
                    <Info className="h-5 w-5 text-primary shrink-0" />
                    <div>
                        <p className="text-sm font-medium">Recommended: <span className="text-primary">{detected.form}</span></p>
                        <p className="text-xs text-muted-foreground">{detected.reason}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ═══════════ STEP 3: Income Entry ═══════════
function IncomeEntryStep({ session, updateSession }: { session: FilingSession; updateSession: (fn: (s: FilingSession) => FilingSession) => void }) {
    const numField = (section: string, field: string, label: string, help?: string) => (
        <div>
            <Label>{label}</Label>
            <Input type="number" value={(session as any)[section]?.[field] || 0}
                onChange={e => updateSession(s => ({ ...s, [section]: { ...(s as any)[section], [field]: parseFloat(e.target.value) || 0 } }))} />
            {help && <p className="text-[11px] text-muted-foreground mt-0.5">{help}</p>}
        </div>
    );

    return (
        <div className="space-y-4">
            {session.salary.enabled && (
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" />Salary Income</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><Label>Employer Name</Label><Input value={session.salary.employerName} onChange={e => updateSession(s => ({ ...s, salary: { ...s.salary, employerName: e.target.value } }))} /></div>
                        {numField('salary', 'grossSalary', 'Gross Salary (₹)', 'Total salary before deductions')}
                        {numField('salary', 'exemptAllowances', 'Exempt Allowances (₹)', 'HRA, LTA, etc.')}
                        {numField('salary', 'professionalTax', 'Professional Tax (₹)')}
                        {numField('salary', 'tdsSalary', 'TDS Deducted (₹)', 'From Form 16 Part A')}
                    </CardContent>
                </Card>
            )}
            {session.cryptoVDA.enabled && (
                <Card className="border-violet-500/30">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4 text-violet-400" />Crypto / VDA Income
                        {session.cryptoVDA.syncedAt && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Auto-synced from Crypto Module</Badge>}
                    </CardTitle></CardHeader>
                    <CardContent>
                        {session.cryptoVDA.syncedAt ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Stat label="Taxable Gains" value={`₹${session.cryptoVDA.taxableGains.toLocaleString('en-IN')}`} />
                                <Stat label="Sale Consideration" value={`₹${session.cryptoVDA.saleConsideration.toLocaleString('en-IN')}`} />
                                <Stat label="TDS Credit" value={`₹${session.cryptoVDA.tdsCredit.toLocaleString('en-IN')}`} />
                                <Stat label="Sell Events" value={String(session.cryptoVDA.numSellEvents)} />
                            </div>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground">
                                <Coins className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">Go to <strong>Crypto & Coins</strong> page → Click <strong>"Send to ITR"</strong></p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
            {session.otherSources.enabled && (
                <Card>
                    <CardHeader className="pb-3 border-b mb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" />Interest & Dividends</CardTitle>
                            <Button variant="outline" size="sm" onClick={() => {
                                const id = toast.loading('Connecting to Income Tax Portal (AIS)...');
                                setTimeout(() => {
                                    // Simulated fetch of actual AIS parameters for the user
                                    updateSession(s => ({
                                        ...s,
                                        otherSources: {
                                            ...s.otherSources,
                                            savingsInterest: 0,
                                            fdInterest: 0,
                                            dividendIncome: 0,
                                            tdsInterest: 0
                                        }
                                    }));
                                    toast.success('No Interest or Dividend data found in your AIS!', { id });
                                }, 1500);
                            }} className="h-8 gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                                <Download className="h-3.5 w-3.5" />
                                Auto-fill from AIS
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {numField('otherSources', 'savingsInterest', 'Savings A/c Interest (₹)')}
                        {numField('otherSources', 'fdInterest', 'FD / RD Interest (₹)')}
                        {numField('otherSources', 'dividendIncome', 'Dividend Income (₹)')}
                        {numField('otherSources', 'tdsInterest', 'TDS on Interest (₹)')}
                    </CardContent>
                </Card>
            )}
            {session.capitalGains.enabled && (
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Capital Gains</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {numField('capitalGains', 'stcgEquity', 'STCG on Equity (₹)', '15% tax rate')}
                        {numField('capitalGains', 'ltcgEquity', 'LTCG on Equity (₹)', '10% above ₹1L exemption')}
                        {numField('capitalGains', 'stcgOther', 'STCG Other (₹)', 'Slab rate')}
                        {numField('capitalGains', 'ltcgOther', 'LTCG Other (₹)', '20% with indexation')}
                    </CardContent>
                </Card>
            )}
            {session.business.enabled && (
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" />Business / Freelance</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><Label>Section</Label>
                            <Select value={session.business.section} onValueChange={v => updateSession(s => ({ ...s, business: { ...s.business, section: v as any } }))}><SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="44AD">44AD (Business, 6%/8%)</SelectItem><SelectItem value="44ADA">44ADA (Professional, 50%)</SelectItem><SelectItem value="regular">Regular Books</SelectItem></SelectContent>
                            </Select>
                        </div>
                        {numField('business', 'grossReceipts', 'Gross Receipts (₹)')}
                        {numField('business', 'netProfit', 'Net Profit (₹)')}
                        {numField('business', 'tdsPayments', 'TDS Deducted (₹)')}
                    </CardContent>
                </Card>
            )}
            {session.houseProperty.enabled && (
                <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />House Property</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {numField('houseProperty', 'annualRent', 'Annual Rent Received (₹)')}
                        {numField('houseProperty', 'municipalTax', 'Municipal Tax Paid (₹)')}
                        {numField('houseProperty', 'homeLoanInterest', 'Home Loan Interest (₹)', 'Max ₹2L for self-occupied')}
                    </CardContent>
                </Card>
            )}
            {!session.salary.enabled && !session.cryptoVDA.enabled && !session.otherSources.enabled && !session.capitalGains.enabled && !session.business.enabled && !session.houseProperty.enabled && (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>No income sources selected. Go back and select at least one.</p>
                </CardContent></Card>
            )}
        </div>
    );
}

// ═══════════ STEP 4: Deductions ═══════════
const DEDUCTION_ITEMS = [
    { key: 'section80C', label: '80C — PPF, ELSS, LIC, EPF', limit: 150000 },
    { key: 'section80D', label: '80D — Health Insurance', limit: 75000 },
    { key: 'section80CCD1B', label: '80CCD(1B) — NPS Extra', limit: 50000 },
    { key: 'section80E', label: '80E — Education Loan Interest', limit: null },
    { key: 'section80G', label: '80G — Donations', limit: null },
    { key: 'section80TTA', label: '80TTA — Savings Interest', limit: 10000 },
    { key: 'section80GG', label: '80GG — Rent (no HRA)', limit: 60000 },
    { key: 'homeLoanInterest', label: '24(b) — Home Loan Interest', limit: 200000 },
];

function DeductionsStep({ session, updateSession }: { session: FilingSession; updateSession: (fn: (s: FilingSession) => FilingSession) => void }) {
    const total = Object.entries(session.deductions).filter(([k]) => k !== 'totalDeductions').reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);

    return (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Claim Your Deductions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                <div className="bg-primary/5 rounded-lg p-3 flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Total Deductions</span>
                    <span className="text-lg font-bold text-primary">₹{total.toLocaleString('en-IN')}</span>
                </div>
                {DEDUCTION_ITEMS.map(d => (
                    <div key={d.key} className="flex items-center gap-3">
                        <div className="flex-1">
                            <Label className="text-xs">{d.label}{d.limit ? ` (Max ₹${(d.limit / 1000).toFixed(0)}K)` : ''}</Label>
                            <Input type="number" value={(session.deductions as any)[d.key] || 0}
                                onChange={e => updateSession(s => {
                                    const newDed = { ...s.deductions, [d.key]: parseFloat(e.target.value) || 0 };
                                    const newTotal = Object.entries(newDed).filter(([k]) => k !== 'totalDeductions').reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
                                    return { ...s, deductions: { ...newDed, totalDeductions: newTotal } };
                                })} />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// ═══════════ STEP 5: Regime ═══════════
function RegimeStep({ session, updateSession, grossIncome, totalTDS }: { session: FilingSession; updateSession: (fn: (s: FilingSession) => FilingSession) => void; grossIncome: number; totalTDS: number }) {
    const oldTaxable = Math.max(0, grossIncome - session.deductions.totalDeductions);
    const newTaxable = Math.max(0, grossIncome - 75000); // Standard deduction only
    // Simplified slab calc
    const calcTax = (income: number, isNew: boolean) => {
        if (isNew) {
            const slabs = [[0, 400000, 0], [400000, 800000, 5], [800000, 1200000, 10], [1200000, 1600000, 15], [1600000, 2000000, 20], [2000000, 2400000, 25], [2400000, Infinity, 30]];
            let tax = 0;
            for (const [min, max, rate] of slabs) { if (income > min) tax += (Math.min(income, max) - min) * (rate as number) / 100; }
            if (income <= 1200000) tax = 0; // Rebate 87A
            return tax;
        } else {
            const slabs = [[0, 250000, 0], [250000, 500000, 5], [500000, 1000000, 20], [1000000, Infinity, 30]];
            let tax = 0;
            for (const [min, max, rate] of slabs) { if (income > min) tax += (Math.min(income, max) - min) * (rate as number) / 100; }
            if (income <= 500000) tax = 0; // Rebate
            return tax;
        }
    };
    const oldTax = calcTax(oldTaxable, false);
    const newTax = calcTax(newTaxable, true);
    const oldCess = oldTax * 0.04;
    const newCess = newTax * 0.04;
    const better = (oldTax + oldCess) <= (newTax + newCess) ? 'old' : 'new';

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['old', 'new'] as const).map(regime => {
                    const tax = regime === 'old' ? oldTax : newTax;
                    const cess = regime === 'old' ? oldCess : newCess;
                    const taxable = regime === 'old' ? oldTaxable : newTaxable;
                    const isBetter = better === regime;
                    const selected = session.regime === regime;
                    return (
                        <button key={regime} onClick={() => updateSession(s => ({ ...s, regime }))}
                            className={`p-5 rounded-xl border-2 text-left transition-all ${selected ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/40'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold">{regime === 'old' ? 'Old Regime' : 'New Regime'}</h3>
                                {isBetter && <Badge className="bg-emerald-500/20 text-emerald-600">Saves More</Badge>}
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between"><span className="text-muted-foreground">Taxable Income</span><span>₹{taxable.toLocaleString('en-IN')}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>₹{Math.round(tax).toLocaleString('en-IN')}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Cess (4%)</span><span>₹{Math.round(cess).toLocaleString('en-IN')}</span></div>
                                <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total</span><span>₹{Math.round(tax + cess).toLocaleString('en-IN')}</span></div>
                                <div className="flex justify-between text-primary"><span>After TDS</span><span>₹{Math.max(0, Math.round(tax + cess - totalTDS)).toLocaleString('en-IN')}</span></div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════ STEP 6: Review ═══════════
function ReviewStep({ session, updateSession, validation, itrForm, grossIncome, totalTDS }: any) {
    const report = generateComputationReport(session);
    const netPayable = report.netPayable;
    const isRefund = netPayable < 0;

    const handleDownloadChallan = () => {
        const p = session.personalInfo;
        const data = generateChallan280({
            pan: p.pan || '', name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            address: p.flatNo || '', city: p.city || '', state: p.state || '',
            pincode: p.pincode || '', mobile: p.mobile || '', email: p.email || '',
            assessmentYear: session.assessmentYear,
            taxPayable: report.taxOnIncome, surcharge: report.surcharge, cess: report.cess,
            tdsPaid: totalTDS, advanceTaxPaid: session.taxesPaid.advanceTax,
        });
        downloadChallanHTML(data);
        toast.success('Challan 280 downloaded!');
    };

    const handleDownloadStatement = () => {
        downloadComputationStatement(session);
        toast.success('Tax Computation Statement downloaded!');
    };

    return (
        <div className="space-y-4">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Filing Summary</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <Stat label="ITR Form" value={itrForm.form} />
                        <Stat label="Regime" value={session.regime === 'old' ? 'Old Regime' : session.regime === 'new' ? 'New Regime' : 'Not Selected'} />
                        <Stat label="Gross Income" value={`₹${grossIncome.toLocaleString('en-IN')}`} />
                        <Stat label="Total Deductions" value={`₹${session.deductions.totalDeductions.toLocaleString('en-IN')}`} />
                        <Stat label="Total TDS Paid" value={`₹${totalTDS.toLocaleString('en-IN')}`} />
                        <Stat label={isRefund ? '🟢 Refund Due' : '🔴 Tax Payable'} value={`₹${Math.abs(netPayable).toLocaleString('en-IN')}`} />
                    </div>
                </CardContent>
            </Card>

            {/* Tax Due → Challan */}
            {!isRefund && netPayable > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Calculator className="h-5 w-5 text-amber-500" />
                                <div>
                                    <p className="text-sm font-semibold">Self-Assessment Tax Due: ₹{netPayable.toLocaleString('en-IN')}</p>
                                    <p className="text-xs text-muted-foreground">Pay via Challan 280 before filing your ITR</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleDownloadChallan}>
                                <Download className="h-3.5 w-3.5 mr-1" />Challan 280
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Validation */}
            {validation.errors.length > 0 && (
                <Card className="border-red-500/30"><CardContent className="py-3 space-y-1">
                    {validation.errors.map((e: string, i: number) => <div key={i} className="flex items-start gap-2 text-sm text-red-500"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{e}</div>)}
                </CardContent></Card>
            )}
            {validation.warnings.length > 0 && (
                <Card className="border-amber-500/30"><CardContent className="py-3 space-y-1">
                    {validation.warnings.map((w: string, i: number) => <div key={i} className="flex items-start gap-2 text-sm text-amber-500"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{w}</div>)}
                </CardContent></Card>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={handleDownloadStatement}>
                    <FileText className="h-5 w-5 mr-2" />Tax Computation Statement
                </Button>
                <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500"
                    onClick={() => {
                        const itrData = mapSessionToITRData(session, itrForm.form as any);
                        const val = validateITRData(itrData);
                        if (!val.valid) {
                            toast.error("Please fix errors before generating JSON");
                            return;
                        }
                        downloadITRJson(itrData);
                        toast.success(`Generated ${itrForm.form} JSON successfully!`);
                    }}>
                    <Download className="h-5 w-5 mr-2" />Generate ITR JSON
                </Button>
            </div>
        </div>
    );
}

// Helper
function Stat({ label, value }: { label: string; value: string }) {
    return <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold text-sm mt-0.5">{value}</p></div>;
}
