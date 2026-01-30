/**
 * Smart Filing Wizard
 * Automated ITR filing with Form 16 parsing, AIS import, and smart recommendations
 * 3-step process: Import → Review → Generate
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
    Upload, FileText, CheckCircle, AlertCircle, AlertTriangle, Sparkles,
    ArrowRight, ArrowLeft, Download, Loader2, Shield, Eye, EyeOff,
    Zap, RefreshCw, FileCheck, Crown, TrendingUp, TrendingDown,
    Calculator, IndianRupee, Building2, Wallet, Bitcoin, PiggyBank,
    ChevronRight, Check, X, Info, HelpCircle, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { parseForm16, Form16Data, convertForm16ToFilingData } from '@/lib/form16-parser';
import { parseAISJson, reconcileWithITR, getAutoFillSuggestions, AISData } from '@/lib/ais-parser';
import { detectITRForm, ITRFormType, getFormComplexity, getFormTips } from '@/lib/itr-form-detector';
import { calculateTax, compareRegimes, RegimeComparison } from '@/lib/tax-calculation';
import { generateITRJson, downloadITRJson, validateITRData, ITRFilingData } from '@/lib/itr-json-generator';
import { useAuth } from '@/hooks/useAuth';

interface SmartFilingWizardProps {
    initialData?: Partial<ITRFilingData>;
    onComplete?: (data: ITRFilingData) => void;
}

type WizardStep = 'import' | 'review' | 'verify' | 'generate';

export function SmartFilingWizard({ initialData, onComplete }: SmartFilingWizardProps) {
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState<WizardStep>('import');
    const [loading, setLoading] = useState(false);

    // Data states
    const [form16Data, setForm16Data] = useState<Form16Data | null>(null);
    const [aisData, setAisData] = useState<AISData | null>(null);
    const [manualEntry, setManualEntry] = useState(false);

    // Filing data
    const [filingData, setFilingData] = useState<Partial<ITRFilingData>>({
        assessmentYear: '2025-26',
        filingType: 'ORIGINAL',
        regime: 'NEW',
        personalInfo: {
            pan: user?.user_metadata?.pan || '',
            firstName: user?.user_metadata?.full_name?.split(' ')[0] || '',
            lastName: user?.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
            mobile: user?.phone || '',
            email: user?.email || '',
            ...initialData?.personalInfo
        },
        income: {
            salaryGross: 0,
            salaryExemptAllowances: 0,
            salaryNetTaxable: 0,
            standardDeduction: 50000,
            professionalTax: 0,
            savingsInterest: 0,
            fdInterest: 0,
            dividendIncome: 0,
            otherIncome: 0,
            vdaGains: 0,
            ...initialData?.income
        },
        deductions: {
            section80C: 0,
            section80CCC: 0,
            section80CCD1: 0,
            section80CCD1B: 0,
            section80CCD2: 0,
            section80D: 0,
            section80DD: 0,
            section80DDB: 0,
            section80E: 0,
            section80EE: 0,
            section80EEA: 0,
            section80EEB: 0,
            section80G: 0,
            section80GG: 0,
            section80GGA: 0,
            section80GGC: 0,
            section80TTA: 0,
            section80TTB: 0,
            section80U: 0,
            ...initialData?.deductions
        },
        taxesPaid: {
            tdsSalary: 0,
            tdsInterest: 0,
            tdsDividend: 0,
            tdsRent: 0,
            tdsProfessional: 0,
            tdsProperty: 0,
            tdsOther: 0,
            tcs: 0,
            advanceTax: 0,
            selfAssessmentTax: 0,
            ...initialData?.taxesPaid
        },
        bankDetails: initialData?.bankDetails || [],
        hasVDAIncome: false,
        verification: {
            place: '',
            date: new Date().toISOString().split('T')[0],
            capacity: 'SELF'
        },
        ...initialData
    });

    // Computed values
    const detectedForm = useMemo(() => {
        const income = filingData.income!;
        return detectITRForm({
            hasSalary: income.salaryGross! > 0,
            salaryAmount: income.salaryGross!,
            hasHouseProperty: (income.netHousePropertyIncome || 0) !== 0,
            housePropertyCount: income.netHousePropertyIncome ? 1 : 0,
            hasCapitalGainsEquity: (income.stcg15 || 0) > 0 || (income.ltcg10 || 0) > 0,
            hasCapitalGainsProperty: (income.ltcg20 || 0) > 0,
            hasCryptoVDA: income.vdaGains! > 0,
            hasBusinessIncome: (income.businessNet || 0) > 0,
            isProfessionalIncome: false,
            hasPresumptiveIncome: income.isPresumptive || false,
            hasForeignAssets: filingData.hasForeignAssets || false,
            hasForeignIncome: false,
            hasAgricultureIncome: (income.agriIncome || 0) > 0,
            agricultureAmount: income.agriIncome || 0,
            hasLotteryIncome: false,
            hasOtherSources: income.otherIncome! > 0,
            totalIncome: income.salaryGross! + income.savingsInterest! + income.fdInterest! + income.dividendIncome! + income.otherIncome!,
            isDirector: false,
            hasUnlistedShares: false
        });
    }, [filingData]);

    const regimeComparison = useMemo(() => {
        const income = filingData.income!;
        const deductions = filingData.deductions!;
        return compareRegimes({
            salary: income.salaryGross,
            houseProperty: income.netHousePropertyIncome,
            otherSources: {
                savingsInterest: income.savingsInterest,
                fdInterest: income.fdInterest,
                dividends: income.dividendIncome,
                misc: income.otherIncome
            },
            deductions: {
                section80C: deductions.section80C,
                section80D: deductions.section80D,
                section80TTA: deductions.section80TTA,
                section80E: deductions.section80E,
                nps80CCD: deductions.section80CCD1B
            },
            vdaGains: income.vdaGains,
            assessmentYear: '2025-26'
        });
    }, [filingData]);

    // File handlers
    const handleForm16Upload = useCallback(async (file: File) => {
        setLoading(true);
        try {
            // For PDF files, we'd need pdf.js to extract text
            // For now, we'll assume it's a text file or show demo data
            const text = await file.text();
            const parsed = parseForm16(text);
            setForm16Data(parsed);

            // Auto-fill data
            const converted = convertForm16ToFilingData(parsed);
            setFilingData(prev => ({
                ...prev,
                personalInfo: {
                    ...prev.personalInfo!,
                    pan: converted.personalInfo.pan || prev.personalInfo!.pan,
                    firstName: converted.personalInfo.name?.split(' ')[0] || prev.personalInfo!.firstName
                },
                income: {
                    ...prev.income!,
                    salaryGross: converted.income.salary,
                    salaryNetTaxable: converted.income.netSalary,
                    standardDeduction: converted.income.standardDeduction,
                    professionalTax: converted.income.professionalTax
                },
                deductions: {
                    ...prev.deductions!,
                    section80C: converted.deductions.section80C,
                    section80D: converted.deductions.section80D,
                    section80CCD1B: converted.deductions.section80CCD1B,
                    section80E: converted.deductions.section80E,
                    section80TTA: converted.deductions.section80TTA
                },
                taxesPaid: {
                    ...prev.taxesPaid!,
                    tdsSalary: converted.tds.salary
                }
            }));

            toast.success(`Form 16 parsed! Confidence: ${parsed.parseConfidence}%`);
            if (parsed.warnings.length > 0) {
                toast.warning(`${parsed.warnings.length} fields need review`);
            }
        } catch (error) {
            toast.error('Failed to parse Form 16');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAISUpload = useCallback(async (file: File) => {
        setLoading(true);
        try {
            const content = await file.text();
            const json = JSON.parse(content);
            const parsed = parseAISJson(json);
            setAisData(parsed);

            // Auto-fill suggestions
            const suggestions = getAutoFillSuggestions(parsed);
            setFilingData(prev => ({
                ...prev,
                income: {
                    ...prev.income!,
                    salaryGross: suggestions.salary || prev.income!.salaryGross,
                    savingsInterest: suggestions.interestIncome || prev.income!.savingsInterest,
                    dividendIncome: suggestions.dividendIncome || prev.income!.dividendIncome
                },
                taxesPaid: {
                    ...prev.taxesPaid!,
                    tdsSalary: suggestions.salaryTDS || prev.taxesPaid!.tdsSalary,
                    tdsInterest: suggestions.interestTDS || prev.taxesPaid!.tdsInterest,
                    tdsDividend: suggestions.dividendTDS || prev.taxesPaid!.tdsDividend
                },
                hasVDAIncome: suggestions.hasCryptoTransactions,
                hasForeignAssets: suggestions.hasForeignRemittances
            }));

            toast.success('AIS imported successfully!');
        } catch (error) {
            toast.error('Failed to parse AIS data');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleGenerateJson = useCallback(() => {
        const fullData: ITRFilingData = {
            formType: detectedForm.recommendedForm,
            ...filingData as ITRFilingData
        };

        const validation = validateITRData(fullData);

        if (!validation.valid) {
            validation.errors.forEach(e => toast.error(e));
            return;
        }

        if (validation.warnings.length > 0) {
            validation.warnings.forEach(w => toast.warning(w));
        }

        downloadITRJson(fullData);
        toast.success('ITR JSON downloaded! Upload to income tax portal.');
        onComplete?.(fullData);
    }, [filingData, detectedForm, onComplete]);

    const steps = [
        { id: 'import', label: 'Import Data', icon: Upload },
        { id: 'review', label: 'Review Income', icon: Eye },
        { id: 'verify', label: 'Verify & Choose Regime', icon: Shield },
        { id: 'generate', label: 'Generate ITR', icon: FileCheck }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    const fmt = (v: number) => `₹${v.toLocaleString('en-IN')}`;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Progress Header */}
            <Card className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 border-0 text-white">
                <CardContent className="py-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <Zap className="h-6 w-6" /> Smart ITR Filing
                            </h2>
                            <p className="text-white/70 text-sm">Auto-fill • AI Recommendations • One-Click Generation</p>
                        </div>
                        <Badge className="bg-white/20 text-white border-0 text-sm">
                            {detectedForm.recommendedForm}
                        </Badge>
                    </div>

                    {/* Step Progress */}
                    <div className="flex items-center justify-between">
                        {steps.map((step, index) => (
                            <React.Fragment key={step.id}>
                                <div className="flex flex-col items-center">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${index <= currentStepIndex
                                            ? 'bg-white text-violet-600'
                                            : 'bg-white/20 text-white/60'
                                        }`}>
                                        {index < currentStepIndex ? (
                                            <Check className="h-5 w-5" />
                                        ) : (
                                            <step.icon className="h-5 w-5" />
                                        )}
                                    </div>
                                    <span className={`text-xs mt-2 ${index <= currentStepIndex ? 'text-white' : 'text-white/60'}`}>
                                        {step.label}
                                    </span>
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`flex-1 h-1 mx-2 rounded ${index < currentStepIndex ? 'bg-white' : 'bg-white/20'
                                        }`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Step Content */}
            {currentStep === 'import' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5 text-violet-600" />
                            Import Your Tax Data
                        </CardTitle>
                        <CardDescription>
                            Upload Form 16 and AIS for automatic data extraction, or enter manually
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Form 16 Upload */}
                            <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-violet-500 transition-colors">
                                <input
                                    type="file"
                                    id="form16"
                                    className="hidden"
                                    accept=".pdf,.txt"
                                    onChange={(e) => e.target.files?.[0] && handleForm16Upload(e.target.files[0])}
                                />
                                <label htmlFor="form16" className="cursor-pointer">
                                    <FileText className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                                    <p className="font-medium">Upload Form 16</p>
                                    <p className="text-sm text-muted-foreground">PDF or Text file</p>
                                    {form16Data && (
                                        <Badge className="mt-3 bg-emerald-100 text-emerald-700">
                                            <Check className="h-3 w-3 mr-1" /> Uploaded
                                        </Badge>
                                    )}
                                </label>
                            </div>

                            {/* AIS Upload */}
                            <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-violet-500 transition-colors">
                                <input
                                    type="file"
                                    id="ais"
                                    className="hidden"
                                    accept=".json"
                                    onChange={(e) => e.target.files?.[0] && handleAISUpload(e.target.files[0])}
                                />
                                <label htmlFor="ais" className="cursor-pointer">
                                    <Shield className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                                    <p className="font-medium">Upload AIS JSON</p>
                                    <p className="text-sm text-muted-foreground">From Income Tax Portal</p>
                                    {aisData && (
                                        <Badge className="mt-3 bg-emerald-100 text-emerald-700">
                                            <Check className="h-3 w-3 mr-1" /> Imported
                                        </Badge>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* How to get AIS */}
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>How to download AIS?</AlertTitle>
                            <AlertDescription className="text-sm">
                                Login to <a href="https://www.incometax.gov.in" target="_blank" className="text-violet-600 underline">incometax.gov.in</a> →
                                e-File → Income Tax Returns → AIS → Download JSON
                            </AlertDescription>
                        </Alert>

                        {/* Manual Entry Toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <p className="font-medium">Enter data manually instead</p>
                                <p className="text-sm text-muted-foreground">Skip document upload</p>
                            </div>
                            <Switch checked={manualEntry} onCheckedChange={setManualEntry} />
                        </div>

                        {form16Data && (
                            <Alert className="bg-emerald-50 border-emerald-200">
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                                <AlertTitle className="text-emerald-800">Form 16 Parsed Successfully</AlertTitle>
                                <AlertDescription className="text-emerald-700">
                                    Employer: {form16Data.employerName} • Gross Salary: {fmt(form16Data.grossSalary)} • TDS: {fmt(form16Data.totalTDSDeducted)}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="justify-end">
                        <Button onClick={() => setCurrentStep('review')} className="bg-violet-600 hover:bg-violet-700">
                            Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {currentStep === 'review' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5 text-violet-600" />
                            Review Your Income
                        </CardTitle>
                        <CardDescription>
                            Verify the extracted data and add any missing income sources
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Income Summary */}
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                                <Wallet className="h-5 w-5 text-emerald-600 mb-2" />
                                <p className="text-xs text-muted-foreground">Salary Income</p>
                                <p className="text-xl font-bold">{fmt(filingData.income!.salaryGross!)}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                                <PiggyBank className="h-5 w-5 text-blue-600 mb-2" />
                                <p className="text-xs text-muted-foreground">Other Sources</p>
                                <p className="text-xl font-bold">{fmt(filingData.income!.savingsInterest! + filingData.income!.fdInterest! + filingData.income!.dividendIncome!)}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                                <Bitcoin className="h-5 w-5 text-amber-600 mb-2" />
                                <p className="text-xs text-muted-foreground">VDA/Crypto</p>
                                <p className="text-xl font-bold">{fmt(filingData.income!.vdaGains!)}</p>
                            </div>
                        </div>

                        {/* Editable Fields */}
                        <div className="space-y-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <IndianRupee className="h-4 w-4" /> Income Details
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Gross Salary</Label>
                                    <Input
                                        type="number"
                                        value={filingData.income!.salaryGross}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            income: { ...prev.income!, salaryGross: parseFloat(e.target.value) || 0 }
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>TDS on Salary</Label>
                                    <Input
                                        type="number"
                                        value={filingData.taxesPaid!.tdsSalary}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            taxesPaid: { ...prev.taxesPaid!, tdsSalary: parseFloat(e.target.value) || 0 }
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>FD Interest</Label>
                                    <Input
                                        type="number"
                                        value={filingData.income!.fdInterest}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            income: { ...prev.income!, fdInterest: parseFloat(e.target.value) || 0 }
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Savings Interest</Label>
                                    <Input
                                        type="number"
                                        value={filingData.income!.savingsInterest}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            income: { ...prev.income!, savingsInterest: parseFloat(e.target.value) || 0 }
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Crypto/VDA Gains</Label>
                                    <Input
                                        type="number"
                                        value={filingData.income!.vdaGains}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            income: { ...prev.income!, vdaGains: parseFloat(e.target.value) || 0 },
                                            hasVDAIncome: parseFloat(e.target.value) > 0
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Section 80C Investments</Label>
                                    <Input
                                        type="number"
                                        value={filingData.deductions!.section80C}
                                        onChange={(e) => setFilingData(prev => ({
                                            ...prev,
                                            deductions: { ...prev.deductions!, section80C: Math.min(150000, parseFloat(e.target.value) || 0) }
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="outline" onClick={() => setCurrentStep('import')}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button onClick={() => setCurrentStep('verify')} className="bg-violet-600 hover:bg-violet-700">
                            Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {currentStep === 'verify' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-violet-600" />
                            Verify & Choose Tax Regime
                        </CardTitle>
                        <CardDescription>
                            AI recommends the best regime based on your income and deductions
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* ITR Form Recommendation */}
                        <Alert className="bg-violet-50 border-violet-200">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <AlertTitle className="text-violet-800 flex items-center gap-2">
                                Recommended: {detectedForm.recommendedForm}
                                <Badge variant="outline">{getFormComplexity(detectedForm.recommendedForm).estimatedTime}</Badge>
                            </AlertTitle>
                            <AlertDescription className="text-violet-700">
                                {detectedForm.reasons.join(' • ')}
                            </AlertDescription>
                        </Alert>

                        {/* Regime Comparison */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <div
                                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${filingData.regime === 'OLD' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                onClick={() => setFilingData(prev => ({ ...prev, regime: 'OLD' }))}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold">Old Regime</h3>
                                    {regimeComparison.recommendation === 'old' && (
                                        <Badge className="bg-emerald-500"><Crown className="h-3 w-3 mr-1" /> Best</Badge>
                                    )}
                                </div>
                                <p className="text-3xl font-black">{fmt(regimeComparison.oldRegime.finalTax)}</p>
                                <p className="text-sm text-muted-foreground">With deductions of {fmt(regimeComparison.oldRegime.totalDeductions)}</p>
                            </div>

                            <div
                                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${filingData.regime === 'NEW' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                onClick={() => setFilingData(prev => ({ ...prev, regime: 'NEW' }))}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold">New Regime</h3>
                                    {regimeComparison.recommendation === 'new' && (
                                        <Badge className="bg-emerald-500"><Crown className="h-3 w-3 mr-1" /> Best</Badge>
                                    )}
                                </div>
                                <p className="text-3xl font-black">{fmt(regimeComparison.newRegime.finalTax)}</p>
                                <p className="text-sm text-muted-foreground">Lower rates, no deductions</p>
                            </div>
                        </div>

                        {/* Savings */}
                        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                            <p className="text-sm opacity-80">You save by choosing {regimeComparison.recommendation} regime</p>
                            <p className="text-2xl font-black">{fmt(regimeComparison.savings)}</p>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="outline" onClick={() => setCurrentStep('review')}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button onClick={() => setCurrentStep('generate')} className="bg-violet-600 hover:bg-violet-700">
                            Continue <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {currentStep === 'generate' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileCheck className="h-5 w-5 text-violet-600" />
                            Generate ITR JSON
                        </CardTitle>
                        <CardDescription>
                            Download the JSON file and upload to income tax portal
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Final Summary */}
                        <div className="p-6 rounded-2xl bg-slate-900 text-white">
                            <div className="grid md:grid-cols-3 gap-6 text-center">
                                <div>
                                    <p className="text-slate-400 text-sm">Gross Income</p>
                                    <p className="text-2xl font-bold">{fmt(regimeComparison[filingData.regime === 'OLD' ? 'oldRegime' : 'newRegime'].grossTotalIncome)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-sm">Tax Payable</p>
                                    <p className="text-2xl font-bold text-amber-400">{fmt(regimeComparison[filingData.regime === 'OLD' ? 'oldRegime' : 'newRegime'].finalTax)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-sm">TDS Credit</p>
                                    <p className="text-2xl font-bold text-emerald-400">{fmt(filingData.taxesPaid!.tdsSalary! + filingData.taxesPaid!.tdsInterest! + filingData.taxesPaid!.tdsDividend!)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div className="space-y-4">
                            <Label>Bank Account for Refund</Label>
                            <div className="grid md:grid-cols-2 gap-4">
                                <Input
                                    placeholder="Account Number"
                                    onChange={(e) => setFilingData(prev => ({
                                        ...prev,
                                        bankDetails: [{ ...prev.bankDetails?.[0], accountNumber: e.target.value, isRefundAccount: true }]
                                    }))}
                                />
                                <Input
                                    placeholder="IFSC Code"
                                    onChange={(e) => setFilingData(prev => ({
                                        ...prev,
                                        bankDetails: [{ ...prev.bankDetails?.[0], ifsc: e.target.value }]
                                    }))}
                                />
                            </div>
                        </div>

                        {/* Verification */}
                        <div className="space-y-4">
                            <Label>Verification</Label>
                            <Input
                                placeholder="City/Place"
                                value={filingData.verification?.place}
                                onChange={(e) => setFilingData(prev => ({
                                    ...prev,
                                    verification: { ...prev.verification!, place: e.target.value }
                                }))}
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="outline" onClick={() => setCurrentStep('verify')}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                        <Button onClick={handleGenerateJson} className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                            <Download className="h-4 w-4 mr-2" /> Download ITR JSON
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}

export default SmartFilingWizard;
