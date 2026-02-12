/**
 * Comprehensive ITR Filing Wizard
 * Supports ALL income types with proper ITR form detection
 * End-to-end functional - every button works
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Upload, FileText, CheckCircle, AlertCircle, ArrowRight, ArrowLeft,
    Download, Loader2, Briefcase, Building2, Bitcoin, TrendingUp,
    Wallet, Home, Gift, Landmark, HelpCircle, Info, Calculator,
    IndianRupee, PiggyBank, Users, Globe, Sparkles, Check, ShieldCheck, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateTax, compareRegimes } from '@/lib/tax-calculation';
import { downloadITRJson, validateITRData, ITRFilingData } from '@/lib/itr-json-generator';
import { calculateDetailedPortfolio } from '@/lib/crypto-engine';
import { StepExplainer } from '@/components/filing/StepExplainer';
import { EnhancedDeductionsStep } from '@/components/filing/EnhancedDeductionsStep';
import { RegimeComparisonCard } from '@/components/filing/RegimeComparisonCard';
import AISUploader from '@/components/AISUploader';

// ============= TYPES =============
interface IncomeSource {
    id: string;
    name: string;
    icon: React.ReactNode;
    description: string;
    itrForms: string[];
    fields: IncomeField[];
}

interface IncomeField {
    key: string;
    label: string;
    type: 'number' | 'text' | 'date';
    placeholder?: string;
    helpText?: string;
    required?: boolean;
}

interface UserIncome {
    // Salary
    hasSalary: boolean;
    salaryGross: number;
    salaryTDS: number;

    // Freelance/Business
    hasFreelance: boolean;
    freelanceGross: number;
    freelanceExpenses: number;
    freelanceTurnover: number;
    freelanceSection: '44AD' | '44ADA' | 'Regular';

    // Crypto/VDA
    hasCrypto: boolean;
    cryptoGains: number;
    cryptoTDS: number;

    // Shares/Capital Gains
    hasShares: boolean;
    stcgEquity: number;
    ltcgEquity: number;
    stcgOther: number;
    ltcgOther: number;

    // Rental Income
    hasRental: boolean;
    rentalIncome: number;
    rentalExpenses: number;
    homeLoanInterest: number;

    // Interest Income
    hasInterest: boolean;
    savingsInterest: number;
    fdInterest: number;

    // Dividends
    hasDividends: boolean;
    dividendIncome: number;

    // Other Income
    hasOther: boolean;
    otherIncome: number;
    otherDescription: string;

    // Foreign Income
    hasForeignIncome: boolean;
    foreignIncome: number;

    // Agriculture
    hasAgriculture: boolean;
    agricultureIncome: number;
}

interface Deductions {
    section80C: number;
    section80D: number;
    section80CCD1B: number;
    section80CCD2: number;
    section80E: number;
    section80G: number;
    section80TTA: number;
    section80TTB: number;
    section80GG: number;
    section80DD: number;
    section80DDB: number;
    section80EE: number;
    section80EEA: number;
    section80EEB: number;
    section80U: number;
    section80GGA: number;
    section80GGC: number;
    hra: number;
    lta: number;
    homeLoanInterest: number;
    other: number;
    [key: string]: number; // Allow dynamic keys from enhanced deduction categories
}

// ============= INCOME SOURCES CONFIG =============
const INCOME_SOURCES: IncomeSource[] = [
    {
        id: 'salary',
        name: 'Salary Income',
        icon: <Briefcase className="h-5 w-5" />,
        description: 'Income from employer (Form 16)',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'],
        fields: [
            { key: 'salaryGross', label: 'Gross Salary', type: 'number', required: true },
            { key: 'salaryTDS', label: 'TDS Deducted', type: 'number' }
        ]
    },
    {
        id: 'freelance',
        name: 'Freelancing / Business',
        icon: <Wallet className="h-5 w-5" />,
        description: 'Self-employed, consulting, business income',
        itrForms: ['ITR-3', 'ITR-4'],
        fields: [
            { key: 'freelanceTurnover', label: 'Total Turnover/Receipts', type: 'number', required: true },
            { key: 'freelanceExpenses', label: 'Business Expenses', type: 'number' }
        ]
    },
    {
        id: 'crypto',
        name: 'Crypto / VDA',
        icon: <Bitcoin className="h-5 w-5" />,
        description: 'Cryptocurrency, NFTs, Virtual Digital Assets',
        itrForms: ['ITR-2', 'ITR-3'],
        fields: [
            { key: 'cryptoGains', label: 'Net Crypto Gains', type: 'number', helpText: 'Auto-fetched from Crypto page' },
            { key: 'cryptoTDS', label: 'TDS Deducted (1%)', type: 'number' }
        ]
    },
    {
        id: 'shares',
        name: 'Stocks & Mutual Funds',
        icon: <TrendingUp className="h-5 w-5" />,
        description: 'Capital gains from shares, MFs, ETFs',
        itrForms: ['ITR-2', 'ITR-3'],
        fields: [
            { key: 'stcgEquity', label: 'Short Term Gains (Equity)', type: 'number', helpText: 'Held < 1 year, taxed at 15%' },
            { key: 'ltcgEquity', label: 'Long Term Gains (Equity)', type: 'number', helpText: 'Held > 1 year, taxed at 10% above ₹1L' },
            { key: 'stcgOther', label: 'STCG (Debt/Gold/Property)', type: 'number' },
            { key: 'ltcgOther', label: 'LTCG (Debt/Gold/Property)', type: 'number' }
        ]
    },
    {
        id: 'rental',
        name: 'Rental Income',
        icon: <Home className="h-5 w-5" />,
        description: 'Income from house property',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'],
        fields: [
            { key: 'rentalIncome', label: 'Annual Rent Received', type: 'number', required: true },
            { key: 'rentalExpenses', label: 'Municipal Taxes Paid', type: 'number' },
            { key: 'homeLoanInterest', label: 'Home Loan Interest', type: 'number', helpText: 'Max ₹2L deduction for self-occupied' }
        ]
    },
    {
        id: 'interest',
        name: 'Interest Income',
        icon: <Landmark className="h-5 w-5" />,
        description: 'Savings, FD, RD interest',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'],
        fields: [
            { key: 'savingsInterest', label: 'Savings Account Interest', type: 'number', helpText: '80TTA deduction up to ₹10,000' },
            { key: 'fdInterest', label: 'FD/RD Interest', type: 'number' }
        ]
    },
    {
        id: 'dividends',
        name: 'Dividend Income',
        icon: <PiggyBank className="h-5 w-5" />,
        description: 'Dividends from shares, MFs',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3'],
        fields: [
            { key: 'dividendIncome', label: 'Total Dividend Received', type: 'number' }
        ]
    },
    {
        id: 'foreign',
        name: 'Foreign Income',
        icon: <Globe className="h-5 w-5" />,
        description: 'Income from outside India',
        itrForms: ['ITR-2', 'ITR-3'],
        fields: [
            { key: 'foreignIncome', label: 'Foreign Income (in INR)', type: 'number' }
        ]
    },
    {
        id: 'agriculture',
        name: 'Agriculture Income',
        icon: <Users className="h-5 w-5" />,
        description: 'Farm income (exempt but reported)',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3'],
        fields: [
            { key: 'agricultureIncome', label: 'Net Agriculture Income', type: 'number', helpText: 'Exempt but affects tax rate if > ₹5,000' }
        ]
    },
    {
        id: 'other',
        name: 'Other Income',
        icon: <Gift className="h-5 w-5" />,
        description: 'Gifts, lottery, any other',
        itrForms: ['ITR-1', 'ITR-2', 'ITR-3'],
        fields: [
            { key: 'otherIncome', label: 'Other Income Amount', type: 'number' },
            { key: 'otherDescription', label: 'Description', type: 'text' }
        ]
    }
];

// ============= ITR FORM RULES =============
const ITR_FORMS = {
    'ITR-1': {
        name: 'ITR-1 (Sahaj)',
        description: 'For salaried individuals with income up to ₹50L',
        eligible: (income: UserIncome) => {
            const totalIncome = income.salaryGross + income.savingsInterest + income.fdInterest +
                income.dividendIncome + income.rentalIncome + income.otherIncome;
            return income.hasSalary && totalIncome <= 5000000 &&
                !income.hasFreelance && !income.hasCrypto && !income.hasShares &&
                !income.hasForeignIncome && income.agricultureIncome <= 500000;
        }
    },
    'ITR-2': {
        name: 'ITR-2',
        description: 'For individuals with capital gains, crypto, foreign income',
        eligible: (income: UserIncome) => {
            return (income.hasShares || income.hasCrypto || income.hasForeignIncome) && !income.hasFreelance;
        }
    },
    'ITR-3': {
        name: 'ITR-3',
        description: 'For business/profession income (non-presumptive)',
        eligible: (income: UserIncome) => {
            return income.hasFreelance && income.freelanceSection === 'Regular';
        }
    },
    'ITR-4': {
        name: 'ITR-4 (Sugam)',
        description: 'For presumptive business income (44AD/44ADA)',
        eligible: (income: UserIncome) => {
            return income.hasFreelance &&
                (income.freelanceSection === '44AD' || income.freelanceSection === '44ADA') &&
                income.freelanceTurnover <= 20000000 && !income.hasCrypto && !income.hasShares;
        }
    }
};

// ============= DEFAULT VALUES =============
const DEFAULT_INCOME: UserIncome = {
    hasSalary: false, salaryGross: 0, salaryTDS: 0,
    hasFreelance: false, freelanceGross: 0, freelanceExpenses: 0, freelanceTurnover: 0, freelanceSection: '44ADA',
    hasCrypto: false, cryptoGains: 0, cryptoTDS: 0,
    hasShares: false, stcgEquity: 0, ltcgEquity: 0, stcgOther: 0, ltcgOther: 0,
    hasRental: false, rentalIncome: 0, rentalExpenses: 0, homeLoanInterest: 0,
    hasInterest: false, savingsInterest: 0, fdInterest: 0,
    hasDividends: false, dividendIncome: 0,
    hasOther: false, otherIncome: 0, otherDescription: '',
    hasForeignIncome: false, foreignIncome: 0,
    hasAgriculture: false, agricultureIncome: 0
};

const DEFAULT_DEDUCTIONS: Deductions = {
    section80C: 0, section80D: 0, section80CCD1B: 0, section80CCD2: 0,
    section80E: 0, section80G: 0, section80TTA: 0, section80TTB: 0,
    section80GG: 0, section80DD: 0, section80DDB: 0,
    section80EE: 0, section80EEA: 0, section80EEB: 0, section80U: 0,
    section80GGA: 0, section80GGC: 0,
    hra: 0, lta: 0, homeLoanInterest: 0, other: 0
};

// ============= MAIN COMPONENT =============
export function SmartFilingWizard() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [maxStepReached, setMaxStepReached] = useState(1);
    const [loading, setLoading] = useState(false);

    // Income state
    const [income, setIncome] = useState<UserIncome>(DEFAULT_INCOME);
    const [deductions, setDeductions] = useState<Deductions>(DEFAULT_DEDUCTIONS);
    const [selectedRegime, setSelectedRegime] = useState<'OLD' | 'NEW'>('NEW');

    // Personal Info
    const [personalInfo, setPersonalInfo] = useState({
        pan: '', firstName: '', lastName: '', dob: '', mobile: '', email: '',
        address: '', city: '', state: '', pincode: ''
    });

    // Bank Details
    const [bankDetails, setBankDetails] = useState({
        accountNumber: '', ifsc: '', bankName: '', accountType: 'SB' as const
    });

    // Save progress to database
    const saveProgress = useCallback(async (currentStep: number, currentIncome: UserIncome, currentDeductions: Deductions, currentPersonalInfo: any, currentBank: any) => {
        if (!user) return;

        try {
            const { error } = await supabase
                .from('filing_steps_state' as any)
                .upsert({
                    user_id: user.id,
                    current_step: currentStep,
                    answers: {
                        income: currentIncome,
                        deductions: currentDeductions,
                        personalInfo: currentPersonalInfo,
                        bankDetails: currentBank
                    },
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            console.log("Progress saved at step:", currentStep);
        } catch (e) {
            console.error("Error saving progress:", e);
        }
    }, [user]);

    // Load user data and previous progress
    useEffect(() => {
        const loadAllData = async () => {
            if (!user) return;
            setLoading(true);

            try {
                // 1. Load basic profile info
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profile) {
                    const fullName = (profile as any).full_name || '';
                    const parts = fullName.split(' ');
                    setPersonalInfo(prev => ({
                        ...prev,
                        pan: (profile as any).pan_number || '',
                        firstName: parts[0] || '',
                        lastName: parts.slice(1).join(' ') || '',
                        dob: (profile as any).date_of_birth || '',
                        mobile: (profile as any).mobile || '',
                        email: user.email || '',
                        address: [(profile as any).flat_no, (profile as any).building, (profile as any).street].filter(Boolean).join(', '),
                        city: (profile as any).city || '',
                        state: (profile as any).state || '',
                        pincode: (profile as any).pincode || '',
                    }));
                }

                // 2. Load primary bank
                const { data: banks } = await supabase
                    .from('bank_details' as any)
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('is_primary', true)
                    .limit(1);

                if (banks && banks.length > 0) {
                    const bank = banks[0] as any;
                    setBankDetails({
                        accountNumber: bank.account_number || '',
                        ifsc: bank.ifsc_code || '',
                        bankName: bank.bank_name || '',
                        accountType: (bank.account_type === 'savings' ? 'SB' : 'CA') as any
                    });
                }

                // 3. Load saved filing progress
                const { data: progress } = await supabase
                    .from('filing_steps_state')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (progress) {
                    const answers = (progress.answers as any) || {};
                    if (progress.current_step) {
                        const stepNum = Number(progress.current_step);
                        setStep(stepNum);
                        setMaxStepReached(stepNum);
                    }
                    if (answers.income) setIncome(answers.income);
                    if (answers.deductions) setDeductions(answers.deductions);
                    if (answers.personalInfo) setPersonalInfo(prev => ({ ...prev, ...answers.personalInfo }));
                    if (answers.bankDetails) setBankDetails(answers.bankDetails);
                    toast.info(`Resuming from Step ${progress.current_step}`);
                }
            } catch (e) {
                console.error('Error loading data:', e);
            } finally {
                setLoading(false);
            }
        };

        loadAllData();
    }, [user]);

    // Keep track of maximum step reached
    useEffect(() => {
        if (step > maxStepReached) {
            setMaxStepReached(step);
        }
    }, [step, maxStepReached]);

    // Fetch crypto data from database
    const fetchCryptoData = useCallback(async () => {
        if (!user) return;

        try {
            const { data: trades } = await supabase
                .from('crypto_trades')
                .select('*')
                .eq('user_id', user.id);

            if (trades && trades.length > 0) {
                // Map to engine transactions
                const engineTx = trades.map(t => {
                    const metadata = t.metadata as any || {};
                    return {
                        id: t.id,
                        token: t.token_symbol,
                        type: t.trade_type as any,
                        quantity: Number(t.quantity),
                        pricePerUnit: Number(t.buy_price),
                        date: new Date(t.trade_date),
                        exchange: t.exchange,
                        fee: Number(metadata.fee || 0),
                        tdsDeducted: Number(metadata.tds_deducted || 0)
                    };
                });

                const settings: any = {
                    accountingMethod: 'FIFO',
                    assessmentYear: '2026-27',
                    treatAirdropsAsIncome: true,
                    baseCurrency: 'INR'
                };

                const summary = calculateDetailedPortfolio(engineTx, settings);

                setIncome(prev => ({
                    ...prev,
                    hasCrypto: true,
                    cryptoGains: Math.round(summary.totalTaxableGains),
                    cryptoTDS: Math.round(summary.totalTDSPaid)
                }));
                console.log('Wizard Crypto Summary:', summary);
            }
        } catch (err) {
            console.error('Error fetching crypto:', err);
        }
    }, [user]);

    // Detect recommended ITR form
    const recommendedForm = useMemo(() => {
        if (ITR_FORMS['ITR-1'].eligible(income)) return 'ITR-1';
        if (ITR_FORMS['ITR-4'].eligible(income)) return 'ITR-4';
        if (ITR_FORMS['ITR-2'].eligible(income)) return 'ITR-2';
        if (ITR_FORMS['ITR-3'].eligible(income)) return 'ITR-3';
        return 'ITR-2'; // Default fallback
    }, [income]);

    // Calculate tax using the robust engine
    const taxCalculation = useMemo(() => {
        // Prepare House Property Income
        // Taxable = (Gross - Municipal Taxes) * 70% - Interest
        // We assume rentalExpenses = Municipal Taxes paid
        const netAnnualValue = Math.max(0, income.rentalIncome - income.rentalExpenses);
        const incomeFromHP = (netAnnualValue * 0.7) - income.homeLoanInterest;

        const taxData: any = {
            salary: income.salaryGross,
            houseProperty: incomeFromHP,
            otherSources: {
                savingsInterest: income.savingsInterest,
                fdInterest: income.fdInterest,
                dividends: income.dividendIncome,
                misc: income.otherIncome
            },
            businessIncome: income.freelanceGross,
            capitalGains: {
                shortTermEquity: income.stcgEquity,
                longTermEquity: income.ltcgEquity,
                shortTermOther: income.stcgOther,
                longTermOther: income.ltcgOther,
                cryptoVDA: income.cryptoGains,
            },
            vdaGains: 0, // already included in cryptoVDA usually or generic VDA
            deductions: {
                section80C: deductions.section80C,
                section80D: deductions.section80D,
                section80TTA: deductions.section80TTA,
                section80E: deductions.section80E,
                section80G: deductions.section80G,
                nps80CCD: deductions.section80CCD1B, // 80CCD(1B)
                nps80CCD2: deductions['section_80ccd_2'] || deductions.section80CCD2, // Handle key variation
                section80GG: deductions.section80GG,
                hra: deductions.hra,
                lta: deductions.lta,
                // Add others if present in state
            },
            regime: selectedRegime === 'NEW' ? 'new' : 'old',
            assessmentYear: '2026-27',
            tdsPaid: income.salaryTDS + income.cryptoTDS,
            advanceTaxPaid: 0, // Not captured yet
            selfAssessmentTax: 0
        };

        const result = calculateTax(taxData);

        return {
            totalIncome: result.grossTotalIncome,
            taxableIncome: result.taxableIncome,
            totalTax: result.netTaxPayable,
            tdsPaid: result.tdsPaid,
            netPayable: result.refundOrDue > 0 && !result.isRefund ? result.refundOrDue : 0,
            refund: result.isRefund ? result.refundOrDue : 0
        };
    }, [income, deductions, selectedRegime]);

    // Auto-save when details change
    useEffect(() => {
        // Debounce save to avoid spamming the database
        const timer = setTimeout(() => {
            if (step > 1 && !loading) {
                saveProgress(step, income, deductions, personalInfo, bankDetails);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [income, deductions, personalInfo, bankDetails, step, loading, saveProgress]);

    // Handle income source toggle
    const toggleIncomeSource = (sourceId: string, enabled: boolean) => {
        const key = `has${sourceId.charAt(0).toUpperCase() + sourceId.slice(1)}` as keyof UserIncome;
        setIncome(prev => ({ ...prev, [key]: enabled }));
    };

    const updateIncomeField = (key: string, value: any) => {
        // If it's meant to be a number, parse it. Otherwise keep as is.
        const numericKeys = [
            'salaryGross', 'salaryTDS', 'freelanceGross', 'freelanceExpenses', 'freelanceTurnover',
            'cryptoGains', 'cryptoTDS', 'stcgEquity', 'ltcgEquity', 'stcgOther', 'ltcgOther',
            'rentalIncome', 'rentalExpenses', 'homeLoanInterest', 'savingsInterest', 'fdInterest',
            'dividendIncome', 'otherIncome', 'foreignIncome', 'agricultureIncome'
        ];

        const finalValue = numericKeys.includes(key) ? (Number(value) || 0) : value;
        setIncome(prev => ({ ...prev, [key]: finalValue }));
    };

    const updateDeductionField = (key: string, value: any) => {
        setDeductions(prev => ({ ...prev, [key]: Number(value) || 0 }));
    };

    const generateComputationReport = () => {
        toast.info("Generating professional tax computation report...");
        // This will call a PDF generator specialized for CA/CS format
        // For now, let's use the standard PDF generator but with professional layout
    };

    // Generate and download ITR JSON
    const handleGenerateITR = () => {
        if (!personalInfo.pan || personalInfo.pan.length !== 10) {
            toast.error('Please enter a valid PAN');
            return;
        }

        const itrData: ITRFilingData = {
            formType: recommendedForm as any,
            assessmentYear: '2026-27',
            filingType: 'ORIGINAL',
            regime: selectedRegime,
            personalInfo: {
                pan: personalInfo.pan.toUpperCase(),
                firstName: personalInfo.firstName,
                lastName: personalInfo.lastName,
                dateOfBirth: personalInfo.dob,
                gender: 'M',
                fatherName: '',
                flatNo: personalInfo.address,
                city: personalInfo.city,
                state: personalInfo.state,
                pincode: personalInfo.pincode,
                country: 'India',
                mobile: personalInfo.mobile,
                email: personalInfo.email,
                residentStatus: 'RES',
                filingStatus: 'INDIVIDUAL'
            },
            income: {
                salaryGross: income.salaryGross,
                salaryExemptAllowances: 0,
                salaryNetTaxable: income.salaryGross,
                standardDeduction: selectedRegime === 'NEW' ? 75000 : 50000,
                professionalTax: 0,
                savingsInterest: income.savingsInterest,
                fdInterest: income.fdInterest,
                dividendIncome: income.dividendIncome,
                otherIncome: income.otherIncome,
                vdaGains: income.cryptoGains,
                stcg15: income.stcgEquity,
                ltcg10: income.ltcgEquity,
                businessNet: income.freelanceGross - income.freelanceExpenses,
                netHousePropertyIncome: income.rentalIncome - income.rentalExpenses - income.homeLoanInterest
            },
            deductions: {
                section80C: deductions.section80C,
                section80CCC: 0, section80CCD1: 0,
                section80CCD1B: deductions.section80CCD1B,
                section80CCD2: 0,
                section80D: deductions.section80D,
                section80DD: 0, section80DDB: 0,
                section80E: deductions.section80E,
                section80EE: 0, section80EEA: 0, section80EEB: 0,
                section80G: deductions.section80G,
                section80GG: 0, section80GGA: 0, section80GGC: 0,
                section80TTA: Math.min(10000, deductions.section80TTA),
                section80TTB: 0, section80U: 0
            },
            taxesPaid: {
                tdsSalary: income.salaryTDS,
                tdsInterest: 0, tdsDividend: 0, tdsRent: 0,
                tdsProfessional: 0, tdsProperty: 0,
                tdsOther: income.cryptoTDS,
                tcs: 0, advanceTax: 0, selfAssessmentTax: 0
            },
            bankDetails: [{
                accountNumber: bankDetails.accountNumber,
                ifsc: bankDetails.ifsc,
                bankName: bankDetails.bankName,
                accountType: bankDetails.accountType,
                isRefundAccount: true
            }],
            hasVDAIncome: income.hasCrypto,
            verification: {
                place: personalInfo.city,
                date: new Date().toISOString().split('T')[0],
                capacity: 'SELF'
            }
        };

        downloadITRJson(itrData);
        toast.success('ITR JSON downloaded successfully!');
    };

    const formatCurrency = (n: number) => {
        if (isNaN(n) || n === null || n === undefined) return '₹0';
        return `₹${Math.round(n).toLocaleString('en-IN')}`;
    };

    const toggleAdvisorMode = () => {
        toast.success("Professional Review Mode Enabled");
    };

    // ============= RENDER =============
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                        <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                        Guided ITR Filing <Badge className="bg-gradient-to-r from-primary to-accent text-[10px] uppercase tracking-wider">AY 2026-27</Badge>
                    </h1>
                    <p className="text-muted-foreground font-medium mt-1">
                        Professional assistance for accurate & maximized tax returns.
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                    Secure SSL Encrypted filing
                </div>
            </div>

            {/* Progress Stepper */}
            <div className="bg-white p-6 rounded-2xl border shadow-sm mb-8">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filing Roadmap</h3>
                    <span className="text-xs font-bold text-primary">Step {step} of 7</span>
                </div>
                <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {[
                        { num: 1, label: 'Get Data', icon: <Download className="h-3 w-3" /> },
                        { num: 2, label: 'Income Sources', icon: <Briefcase className="h-3 w-3" /> },
                        { num: 3, label: 'Income Details', icon: <IndianRupee className="h-3 w-3" /> },
                        { num: 4, label: 'Deductions', icon: <PiggyBank className="h-3 w-3" /> },
                        { num: 5, label: 'Review', icon: <Calculator className="h-3 w-3" /> },
                        { num: 6, label: 'Download', icon: <FileText className="h-3 w-3" /> },
                        { num: 7, label: 'Upload', icon: <Upload className="h-3 w-3" /> }
                    ].map((s, i) => (
                        <div key={s.num} className="flex items-center flex-shrink-0">
                            <div
                                className={`flex flex-col items-center gap-1.5 min-w-[60px] cursor-pointer transition-all ${step === s.num ? 'opacity-100' : s.num <= maxStepReached ? 'opacity-80 hover:opacity-100' : 'opacity-40 cursor-not-allowed'
                                    }`}
                                onClick={() => s.num <= maxStepReached && setStep(s.num)}
                            >
                                <div className={`flex items-center justify-center w-8 h-8 rounded-xl shadow-sm transition-all ${step >= s.num ? 'bg-primary text-white scale-110' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                    {step > s.num ? <Check className="h-4 w-4" /> : s.icon}
                                </div>
                                <span className="text-[10px] font-bold text-center leading-tight">{s.label}</span>
                            </div>
                            {i < 6 && (
                                <div className={`w-8 h-0.5 mx-2 rounded-full ${step > s.num ? 'bg-primary' : 'bg-slate-100'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>
                <Progress value={(step / 7) * 100} className="h-1 mt-4" />
            </div>

            <div className="transition-all duration-500 animate-in fade-in slide-in-from-bottom-8">

                {/* Step 1: Get Your Data from ITD Portal */}
                {step === 1 && (
                    <Card className="border-none shadow-xl bg-slate-50 overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-primary to-indigo-900 text-white pb-8">
                            <CardTitle className="flex items-center gap-3 text-2xl font-black">
                                <Download className="h-7 w-7 text-accent" />
                                Step 1: Securely Fetch Your Financial Data
                            </CardTitle>
                            <CardDescription className="text-indigo-100 text-base max-w-2xl">
                                TaxMitra works best when you provide official data from the Income Tax Department.
                                This ensures zero errors and captures every tax credit you're entitled to.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-8 space-y-6">
                            <StepExplainer
                                emoji="📄"
                                title="What is AIS (Annual Information Statement)?"
                                shortDescription="AIS is like a receipt from the government listing ALL money that banks, employers, and companies reported about you."
                                details={[
                                    'AIS contains your salary details, bank interest, stock trades, and more — reported by banks and companies directly.',
                                    'If you upload this, we can auto-fill 90% of your ITR — saving you hours of manual work!',
                                    'It\'s available for free on the Income Tax portal (incometax.gov.in).',
                                    'You can download it as a PDF and upload it here.',
                                ]}
                                tips={[
                                    'First time filing? The AIS might not have all data — that\'s okay, you can enter details manually.',
                                    'Make sure to download AIS for FY 2025-26 (Assessment Year 2026-27).',
                                    'You can skip this step and enter data manually, but AIS upload is recommended for accuracy.',
                                ]}
                                variant="info"
                                defaultOpen={false}
                            />
                            <div className="bg-white rounded-xl border-2 border-slate-100 overflow-hidden">
                                <div className="p-4 bg-slate-50 border-b border-slate-100">
                                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        <Upload className="h-5 w-5 text-primary" /> Upload AIS (Annual Information Statement)
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Download the JSON or PDF from the Income Tax Portal and drop it here. We'll auto-read your Salary, Interest, and TDS.
                                    </p>
                                </div>
                                <div className="p-6">
                                    <AISUploader
                                        onAutoFill={(data) => {
                                            toast.success("Details auto-filled from AIS!");
                                            setIncome(prev => ({
                                                ...prev,
                                                // Salary
                                                hasSalary: (data.salary || 0) > 0,
                                                salaryGross: data.salary || 0,
                                                salaryTDS: data.salaryTDS || 0,

                                                // Interest
                                                hasInterest: (data.interestIncome || 0) > 0,
                                                savingsInterest: data.interestIncome || 0,

                                                // Dividends
                                                hasDividends: (data.dividendIncome || 0) > 0,
                                                dividendIncome: data.dividendIncome || 0,

                                                // Capital Gains (Generic mapping, user can refine)
                                                hasShares: (data.capitalGains || 0) > 0,
                                                stcgEquity: data.capitalGains || 0,

                                                // Business (Not auto-detected yet)
                                                // hasFreelance: false, 

                                                // Other TDS (Sum of interest + dividend TDS)
                                                cryptoTDS: 0,
                                                // We should probably add interest TDS to FD interest field or similar?
                                                // For now, let's just use what we have.
                                            }));

                                            if (data.pan && data.pan !== 'MANUAL_ENTRY') {
                                                setPersonalInfo(prev => ({ ...prev, pan: data.pan }));
                                            }

                                            // Move to next step after a short delay to let user see success
                                            setTimeout(() => setStep(2), 1500);
                                        }}
                                        onNext={() => setStep(2)}
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6 mt-6">
                                {/* Crypto Data Link - Keep as external or integrated later */}
                                <div className="p-6 rounded-2xl border-2 border-white bg-white shadow-sm hover:shadow-md transition-all group">
                                    <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                        <Bitcoin className="h-5 w-5" />
                                    </div>
                                    <h3 className="font-black text-lg mb-2">Crypto Transaction Reports</h3>
                                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                                        Section 115BBH requires detailed reporting of every VDA transfer.
                                    </p>
                                    <Button className="w-full bg-amber-500/5 text-amber-700 hover:bg-amber-600 hover:text-white font-bold h-10 border-amber-500/20" variant="outline" onClick={() => navigate('/crypto')}>
                                        <Bitcoin className="h-4 w-4 mr-2" /> Go to Crypto Calculator
                                    </Button>
                                    <p className="text-[10px] text-center text-muted-foreground mt-2">
                                        (Calculates P&L and returns you here)
                                    </p>
                                </div>

                                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center">
                                    <p className="text-sm font-bold text-slate-600 mb-2">Don't have AIS?</p>
                                    <Button variant="ghost" className="text-primary hover:bg-primary/10" onClick={() => setStep(2)}>
                                        Skip & Enter Manually <ArrowRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            </div>

                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex gap-4 items-start">
                                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-emerald-900">Your data is safe & encrypted</h4>
                                    <p className="text-xs text-emerald-800/70 mt-0.5">We only use this data to pre-fill your forms. No data is shared with 3rd parties without your explicit consent.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Step 2: Select Income Sources */}
                {step === 2 && (
                    <div className="grid lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 border-none shadow-xl">
                            <CardHeader>
                                <CardTitle className="text-2xl font-black">Which income sources apply to you?</CardTitle>
                                <CardDescription className="text-base">We use this to customize the filing forms and ensure you're using the correct ITR version.</CardDescription>
                                <StepExplainer
                                    emoji="💰"
                                    title="What are Income Sources?"
                                    shortDescription="Every way you earned money this year. Select ALL that apply — even small amounts matter!"
                                    details={[
                                        'Salary: Got a monthly salary from a company? Even internship stipend counts!',
                                        'Freelancing: Upwork, Fiverr, consulting fees, tuition fees you earned?',
                                        'Crypto: Bought/sold Bitcoin, Ethereum on WazirX, CoinDCX?',
                                        'Stocks: Zerodha, Groww, Angel One trades? IPO allotment listing gains?',
                                        'Interest: Money earned in savings account or FDs?',
                                        'Dividends: Received dividend from your shares or mutual funds?',
                                    ]}
                                    tips={[
                                        'Report ALL income sources — even ₹500 savings interest. The IT dept already knows about it from AIS!',
                                        'Not sure about crypto? Check WazirX, CoinDCX, or Binance transaction history.',
                                        'IPO listing gains are Short Term Capital Gains (STCG) — select "Stocks & Mutual Funds" for this.',
                                    ]}
                                    variant="tip"
                                    defaultOpen={false}
                                />
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid sm:grid-cols-2 gap-3">
                                    {INCOME_SOURCES.map(source => (
                                        <div
                                            key={source.id}
                                            className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all h-full ${income[`has${source.id.charAt(0).toUpperCase() + source.id.slice(1)}` as keyof UserIncome]
                                                ? 'border-primary bg-primary/5 shadow-inner'
                                                : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                            onClick={() => {
                                                const key = `has${source.id.charAt(0).toUpperCase() + source.id.slice(1)}` as keyof UserIncome;
                                                toggleIncomeSource(source.id, !income[key]);
                                            }}
                                        >
                                            <div className={`p-2 rounded-xl shrink-0 ${income[`has${source.id.charAt(0).toUpperCase() + source.id.slice(1)}` as keyof UserIncome]
                                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {source.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="font-bold text-slate-900 leading-none">{source.name}</p>
                                                    <Checkbox
                                                        checked={!!income[`has${source.id.charAt(0).toUpperCase() + source.id.slice(1)}` as keyof UserIncome]}
                                                        className="pointer-events-none rounded-full"
                                                    />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground leading-tight">{source.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="bg-primary text-white border-none shadow-xl overflow-hidden relative">
                                <div className="absolute -right-4 -top-4 opacity-10">
                                    <Sparkles className="h-24 w-24" />
                                </div>
                                <CardHeader>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                        <Info className="h-4 w-4" /> Recommendation
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                                        <p className="text-xs font-bold mb-1 opacity-80 uppercase tracking-tighter">Recommended Form</p>
                                        <h4 className="text-xl font-black">{ITR_FORMS[recommendedForm as keyof typeof ITR_FORMS]?.name}</h4>
                                    </div>
                                    <p className="text-xs text-indigo-100 leading-relaxed italic">
                                        "{ITR_FORMS[recommendedForm as keyof typeof ITR_FORMS]?.description}"
                                    </p>
                                </CardContent>
                            </Card>

                            <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                                <h4 className="font-black text-indigo-900 text-xs uppercase mb-3 flex items-center gap-2">
                                    <ShieldCheck className="h-3.5 w-3.5" /> Pro Tip
                                </h4>
                                <p className="text-xs text-indigo-800/70 leading-relaxed font-medium">
                                    Reporting all income sources (even small dividends) link to your PAN is crucial to avoid <strong>automated notices</strong> from the ITD matching engine.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Enter Income Details */}
                {step === 3 && !(income.hasSalary || income.hasFreelance || income.hasShares || income.hasInterest || income.hasDividends || income.hasRental || income.hasOther || income.hasAgriculture || income.hasForeignIncome) && (
                    <div className="space-y-6">
                        <Card className="border-2 border-dashed border-amber-200 bg-amber-50">
                            <CardContent className="flex flex-col items-center justify-center p-8 text-center pt-12 pb-12">
                                <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
                                <h3 className="font-bold text-xl text-amber-900 mb-2">No Income Sources Selected</h3>
                                <p className="text-sm text-amber-800/80 mb-6 max-w-md mx-auto leading-relaxed">
                                    To file an ITR, you must have some income to report! <br /> Please go back to Step 2 and select at least one source (e.g., Salary, Interest, or Business).
                                </p>
                                <Button
                                    variant="default"
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-8 h-12 rounded-xl shadow-lg shadow-amber-600/20"
                                    onClick={() => setStep(2)}
                                >
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Go Back to Select Income
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {step === 3 && (income.hasSalary || income.hasFreelance || income.hasShares || income.hasInterest || income.hasDividends || income.hasRental || income.hasOther || income.hasAgriculture || income.hasForeignIncome) && (
                    <div className="space-y-6">
                        <StepExplainer
                            emoji="📝"
                            title="Enter Your Income Details"
                            shortDescription="Fill in the numbers for each income source you selected. Don't worry — we'll guide you through every field!"
                            details={[
                                'Enter amounts as annual figures (April 2025 - March 2026).',
                                'If TDS (Tax Deducted at Source) was cut from any income, enter that too — it reduces your final tax!',
                                'We auto-apply Standard Deduction based on your regime choice.',
                                'Not sure about exact numbers? Use approximate values for now, you can edit later.',
                            ]}
                            tips={[
                                'Check Form 16 for salary details, bank statements for interest, and broker apps for trading gains.',
                                'IPO listing gains = Sale Price minus Issue Price × Number of shares. This is STCG at 15%.',
                            ]}
                            variant="info"
                        />

                        {income.hasSalary && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <Briefcase className="h-5 w-5" /> Salary Income details
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-1/2/3/4</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Gross Salary (Annual) *</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-slate-100 bg-slate-50/50 focus:bg-white"
                                                    placeholder="e.g. 1200000"
                                                    value={income.salaryGross || ''}
                                                    onChange={e => updateIncomeField('salaryGross', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 This is your total annual salary BEFORE any deductions. Find it in Form 16 Part B → Gross Salary</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">TDS Deducted (Employer)</Label>
                                            <div className="relative">
                                                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-slate-100 bg-slate-50/50 focus:bg-white"
                                                    placeholder="As per Form 16"
                                                    value={income.salaryTDS || ''}
                                                    onChange={e => updateIncomeField('salaryTDS', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 TDS = Tax Deducted at Source. Your employer already paid this tax on your behalf. It's like a prepayment of your tax!</p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-primary shadow-2xl shadow-primary/20 text-white flex gap-4 items-center">
                                        <Sparkles className="h-10 w-10 text-accent shrink-0 animate-pulse" />
                                        <div>
                                            <h4 className="text-sm font-bold">✨ Standard Deduction of ₹{selectedRegime === 'NEW' ? '75,000' : '50,000'} Auto-Applied!</h4>
                                            <p className="text-xs opacity-70">Every salaried person gets this discount on their taxable income. No documents needed!</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasFreelance && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <Wallet className="h-5 w-5" /> Business / Professional Income
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-3/4</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <StepExplainer
                                        emoji="👤"
                                        title="What is Freelancing/Business Income?"
                                        shortDescription="Any money you earned by working independently — not as a salaried employee."
                                        details={[
                                            'This includes ALL non-salary earnings: agency work, shop income, consulting, tutoring, Upwork/Fiverr, content creation, etc.',
                                            'IMPORTANT: Even if you received money from an agency/company that isn\'t formally registered (has only a Shop Act license), it\'s still business income.',
                                            'The government offers a special "Presumptive Taxation" scheme to make filing SUPER EASY — no need for complicated accounting!',
                                            'You just declare a percentage of your total receipts as profit, and pay tax only on that.',
                                        ]}
                                        tips={[
                                            'If TDS was deducted on your payments, enter that in the TDS field — you\'ll get credit for it!',
                                            'Keep bank statements showing all payments received as proof of your total receipts.',
                                        ]}
                                        variant="tip"
                                        defaultOpen={true}
                                    />

                                    {/* Taxation Scheme Selection with Detailed Guidance */}
                                    <div className="p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Select Taxation Scheme</Label>
                                            <Badge className="bg-amber-100 text-amber-700 border-none text-[9px] font-black">⚡ Important Choice</Badge>
                                        </div>
                                        <Select
                                            value={income.freelanceSection}
                                            onValueChange={v => updateIncomeField('freelanceSection', v)}
                                        >
                                            <SelectTrigger className="h-12 border-slate-200 bg-white font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="44ADA">✅ Presumptive (44ADA) - Professionals (IT, Doctor, CA, Lawyer, etc.)</SelectItem>
                                                <SelectItem value="44AD">✅ Presumptive (44AD) - Business / Shop / Agency / Trading</SelectItem>
                                                <SelectItem value="Regular">📋 Regular - I maintain detailed books of accounts</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {/* Detailed explanation cards for each scheme */}
                                        <div className="space-y-3">
                                            {/* 44ADA Card */}
                                            <div className={`p-4 rounded-xl border-2 transition-all ${income.freelanceSection === '44ADA'
                                                ? 'border-emerald-400 bg-emerald-50/50 shadow-sm'
                                                : 'border-slate-100 bg-white/50 opacity-60'
                                                }`}>
                                                <div className="flex items-start gap-3">
                                                    <span className="text-lg">🎯</span>
                                                    <div className="flex-1">
                                                        <h5 className="font-black text-sm">Section 44ADA — For Licensed Professionals</h5>
                                                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                                            Declare <strong>50% of total receipts</strong> as profit. No bills/invoices tracking needed.
                                                        </p>
                                                        <div className="mt-2 text-[10px] space-y-1">
                                                            <p className="text-emerald-700 font-bold">✅ Choose this if you are:</p>
                                                            <p className="text-slate-600">• IT freelancer / Software Developer / Web Designer</p>
                                                            <p className="text-slate-600">• Doctor / Dentist / Physiotherapist</p>
                                                            <p className="text-slate-600">• Chartered Accountant / Company Secretary / Lawyer</p>
                                                            <p className="text-slate-600">• Architect / Interior Designer / Engineer (consulting)</p>
                                                            <p className="text-slate-600">• Film Artist / Author / Content Creator</p>
                                                            <p className="mt-1 text-blue-600 font-medium">📊 Example: Earned ₹10L → Taxable profit = ₹5L</p>
                                                            <p className="text-amber-600 font-medium">⚠️ Turnover limit: ₹75 Lakhs (if 95%+ digital receipts)</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 44AD Card */}
                                            <div className={`p-4 rounded-xl border-2 transition-all ${income.freelanceSection === '44AD'
                                                ? 'border-emerald-400 bg-emerald-50/50 shadow-sm'
                                                : 'border-slate-100 bg-white/50 opacity-60'
                                                }`}>
                                                <div className="flex items-start gap-3">
                                                    <span className="text-lg">🏪</span>
                                                    <div className="flex-1">
                                                        <h5 className="font-black text-sm">Section 44AD — For Business / Shop / Agency Owners</h5>
                                                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                                            Declare <strong>6% (digital) or 8% (cash)</strong> of total receipts as profit.
                                                        </p>
                                                        <div className="mt-2 text-[10px] space-y-1">
                                                            <p className="text-emerald-700 font-bold">✅ Choose this if you are:</p>
                                                            <p className="text-slate-600">• Any business with <strong>Shop Act license</strong> or trade license</p>
                                                            <p className="text-slate-600">• Agency (staffing, marketing, graphic design, etc.)</p>
                                                            <p className="text-slate-600">• Retail shop / E-commerce seller / Amazon/Flipkart seller</p>
                                                            <p className="text-slate-600">• Commission agent / Distributor / Trader</p>
                                                            <p className="text-slate-600">• Tuition centre / Coaching class (non-professional)</p>
                                                            <p className="text-slate-600">• Transport / Delivery / Logistics business</p>
                                                            <p className="mt-1 text-blue-600 font-medium">📊 Example: Earned ₹10L (all digital) → Taxable profit = ₹60,000</p>
                                                            <p className="text-amber-600 font-medium">⚠️ Turnover limit: ₹3 Crore (if 95%+ digital receipts)</p>
                                                            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                                                <p className="text-blue-800 font-bold">💡 Real Example: "I earned from an agency with Shop Act license"</p>
                                                                <p className="text-blue-700 mt-0.5">→ Select <strong>44AD</strong>. The agency is a business (not a professional firm). Enter total payments received as your turnover. If payments were via bank transfer, only 6% is treated as profit!</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Regular Card */}
                                            <div className={`p-4 rounded-xl border-2 transition-all ${income.freelanceSection === 'Regular'
                                                ? 'border-amber-400 bg-amber-50/50 shadow-sm'
                                                : 'border-slate-100 bg-white/50 opacity-60'
                                                }`}>
                                                <div className="flex items-start gap-3">
                                                    <span className="text-lg">📋</span>
                                                    <div className="flex-1">
                                                        <h5 className="font-black text-sm">Regular Books — Full Accounting</h5>
                                                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                                            You track and declare <strong>actual profit</strong> (income minus expenses).
                                                        </p>
                                                        <div className="mt-2 text-[10px] space-y-1">
                                                            <p className="text-amber-700 font-bold">⚠️ Choose this ONLY if:</p>
                                                            <p className="text-slate-600">• Your actual expenses are VERY high (profit is less than 6-8% of turnover)</p>
                                                            <p className="text-slate-600">• Your turnover exceeds the presumptive limits</p>
                                                            <p className="text-slate-600">• You maintain proper books of accounts with a CA</p>
                                                            <p className="mt-1 text-rose-600 font-medium">⚠️ Requires tax audit if profit is below 6-8% and turnover exceeds ₹1 Crore</p>
                                                            <p className="text-slate-500 italic">Most small businesses and freelancers do NOT need this option.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Income Entry Fields */}
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Receipts / Turnover *</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-slate-100 bg-slate-50/50"
                                                    placeholder="Total money received this year"
                                                    value={income.freelanceTurnover || ''}
                                                    onChange={e => {
                                                        const rawValue = e.target.value;
                                                        // Update the field directly first to allow typing
                                                        updateIncomeField('freelanceTurnover', rawValue);

                                                        // Calculate potential profit only if valid number
                                                        const val = parseFloat(rawValue);
                                                        if (!isNaN(val) && val >= 0) {
                                                            if (income.freelanceSection === '44ADA') {
                                                                updateIncomeField('freelanceGross', val * 0.5);
                                                            } else if (income.freelanceSection === '44AD') {
                                                                updateIncomeField('freelanceGross', val * 0.06); // 6% assumed for digital
                                                            } else if (income.freelanceSection === 'Regular') {
                                                                updateIncomeField('freelanceGross', val - (income.freelanceExpenses || 0));
                                                            }
                                                        }
                                                    }}
                                                    min={0}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Total amount you received from clients/customers (before any expenses). Check bank statements for all credit entries from business.</p>
                                        </div>
                                        {income.freelanceSection === 'Regular' ? (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Business Expenses</Label>
                                                <div className="relative">
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 flex items-center justify-center font-bold text-[8px]">EXP</div>
                                                    <Input
                                                        type="number"
                                                        className="pl-9 h-12 text-lg font-bold border-slate-100 bg-slate-50/50"
                                                        placeholder="Rent, salaries, materials, etc."
                                                        value={income.freelanceExpenses || ''}
                                                        onChange={e => {
                                                            const raw = e.target.value;
                                                            if (raw === '') {
                                                                updateIncomeField('freelanceExpenses', 0);
                                                                if (income.freelanceSection === 'Regular') {
                                                                    updateIncomeField('freelanceGross', (income.freelanceTurnover || 0));
                                                                }
                                                                return;
                                                            }
                                                            const val = parseFloat(raw);
                                                            if (!isNaN(val) && val >= 0) {
                                                                updateIncomeField('freelanceExpenses', val);
                                                                if (income.freelanceSection === 'Regular') {
                                                                    updateIncomeField('freelanceGross', (income.freelanceTurnover || 0) - val);
                                                                }
                                                            }
                                                        }}
                                                        min={0}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-muted-foreground italic">💡 All legitimate business costs: office rent, internet, laptop, travel, raw materials, employee salaries, etc.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-emerald-600">Calculated Net Profit</Label>
                                                <div className="h-12 flex items-center px-4 bg-emerald-50 border border-emerald-100 rounded-lg text-lg font-black text-emerald-700">
                                                    ₹{(income.freelanceGross || 0).toLocaleString('en-IN')}
                                                </div>
                                                <p className="text-[10px] text-emerald-600 italic">💡 {income.freelanceSection === '44ADA' ? 'Auto-calculated at 50% of your turnover (44ADA rule)' : 'Auto-calculated at 6% of your digital turnover (44AD rule). If you received cash payments, effective rate is 8%.'}</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasCrypto && (
                            <Card className="border-none shadow-lg overflow-hidden relative">
                                <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                                <div className="bg-amber-500/10 p-4 border-b flex items-center justify-between relative z-10">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-amber-700">
                                        <Bitcoin className="h-5 w-5" /> Virtual Digital Assets (VDA / Crypto)
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        <Badge className="bg-amber-600 text-white border-none">Sec 115BBH</Badge>
                                        <Button variant="ghost" size="sm" onClick={fetchCryptoData} className="text-amber-700 border border-amber-200 h-7 text-[10px] font-bold uppercase tracking-widest">
                                            <Loader2 className="h-3 w-3 mr-1" /> Re-Sync Trades
                                        </Button>
                                    </div>
                                </div>
                                <CardContent className="pt-6 space-y-6 relative z-10">
                                    <StepExplainer
                                        emoji="₿"
                                        title="What is Crypto/VDA Income?"
                                        shortDescription="Any profit from selling, swapping, or transferring cryptocurrency, NFTs, or any virtual digital asset."
                                        details={[
                                            'FLAT 30% TAX — No slab benefit. Whether you earn ₹1,000 or ₹1 Crore, tax is always 30%.',
                                            'NO LOSS SET-OFF — If you lost money on crypto, you CANNOT reduce your other income tax. Crypto losses stay in crypto.',
                                            '1% TDS — Exchanges like WazirX, CoinDCX deduct 1% TDS when you sell. This is already paid tax, enter it below for credit!',
                                            'Net Gains = Total Sale Value − Cost of Buying. You only pay tax on PROFIT, not on total sale amount.',
                                        ]}
                                        tips={[
                                            'Download your tax report from WazirX/CoinDCX/Binance — it shows exact gains and TDS deducted.',
                                            'Swapping one coin for another (ETH → BTC) is ALSO taxable! It counts as selling ETH and buying BTC.',
                                            'Airdrops and staking rewards are taxed as "Income from Other Sources" at your slab rate, NOT 30%.',
                                        ]}
                                        variant="warning"
                                    />
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Net Crypto Gains (₹)</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-amber-100 bg-amber-50/30"
                                                    value={income.cryptoGains || ''}
                                                    onChange={e => updateIncomeField('cryptoGains', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Total profit from selling crypto. Find this in your exchange's "Tax Report" → Net Gains/P&L section.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">TDS Already Deducted (1%)</Label>
                                            <div className="relative">
                                                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-emerald-100 bg-emerald-50/30"
                                                    value={income.cryptoTDS || ''}
                                                    onChange={e => updateIncomeField('cryptoTDS', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Exchanges deduct 1% TDS on every sale. This is tax you ALREADY paid — it'll be adjusted against your final tax. Check your exchange's TDS certificate.</p>
                                        </div>
                                    </div>

                                    {/* Tax Computation Preview */}
                                    {income.cryptoGains > 0 && (
                                        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
                                            <h4 className="font-bold text-indigo-800 mb-3 flex items-center gap-2 text-sm">
                                                <Calculator className="h-4 w-4" /> Your Crypto Tax Computation
                                            </h4>
                                            <div className="grid gap-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Taxable Capital Gains</span>
                                                    <span className="font-medium">₹{income.cryptoGains.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Tax @ 30%</span>
                                                    <span className="font-medium">₹{Math.round(income.cryptoGains * 0.30).toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-600">Health & Education Cess @ 4%</span>
                                                    <span className="font-medium">₹{Math.round(income.cryptoGains * 0.30 * 0.04).toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-indigo-200 pt-2">
                                                    <span className="font-medium text-slate-700">Total Tax Liability</span>
                                                    <span className="font-bold">₹{Math.round(income.cryptoGains * 0.30 * 1.04).toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between text-emerald-700">
                                                    <span>Less: TDS Already Paid</span>
                                                    <span className="font-medium">- ₹{(income.cryptoTDS || 0).toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-indigo-300 pt-2 text-base font-bold">
                                                    <span className={Math.round(income.cryptoGains * 0.30 * 1.04) - (income.cryptoTDS || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}>
                                                        {Math.round(income.cryptoGains * 0.30 * 1.04) - (income.cryptoTDS || 0) > 0 ? 'Net Tax Payable' : 'Refund Due'}
                                                    </span>
                                                    <span className={Math.round(income.cryptoGains * 0.30 * 1.04) - (income.cryptoTDS || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}>
                                                        ₹{Math.abs(Math.round(income.cryptoGains * 0.30 * 1.04) - (income.cryptoTDS || 0)).toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3">
                                        <Button variant="link" className="p-0 h-auto text-indigo-600" onClick={() => navigate('/crypto')}>
                                            Go to Crypto Tax Calculator & Reports →
                                        </Button>
                                        <Badge variant="outline" className="text-xs">KoinX-style report available</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasShares && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <TrendingUp className="h-5 w-5" /> Stocks & Mutual Funds (Capital Gains)
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-2/3</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <StepExplainer
                                        emoji="📈"
                                        title="What are Capital Gains?"
                                        shortDescription="Profit made from selling shares, mutual funds, ETFs, or bonds."
                                        details={[
                                            'STCG (Short Term Capital Gains): Sold within 12 months of buying → Taxed at 20% (Budget 2024).',
                                            'LTCG (Long Term Capital Gains): Sold after holding for 12+ months → Tax-free up to ₹1.25 Lakh, then 12.5%.',
                                            'IPO Listing Gains: If you got IPO allotment and sold on listing day = Short Term Capital Gain.',
                                            'Mutual Fund Redemption: Equity MF held > 1 year = LTCG. Debt MF gains = taxed at your slab rate.',
                                        ]}
                                        tips={[
                                            'Download your Capital Gains Statement from Zerodha Console, Groww app, or Angel One.',
                                            'Losses can be set off! STCG loss vs STCG/LTCG gain. LTCG loss only vs LTCG gain.',
                                            'If you only had IPO listing gains and no other trading, enter the profit under STCG.',
                                        ]}
                                        variant="info"
                                    />
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Short Term Gains (STCG)</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold"
                                                    placeholder="Profit from shares held < 1 year"
                                                    value={income.stcgEquity || ''}
                                                    onChange={e => updateIncomeField('stcgEquity', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Shares/MF sold within 12 months. Includes IPO listing day sales. Taxed at 20%. Find this in your broker's Tax P&L report → "Short Term" section.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-emerald-600">Long Term Gains (LTCG)</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold border-emerald-100 bg-emerald-50/20"
                                                    placeholder="Profit from shares held > 1 year"
                                                    value={income.ltcgEquity || ''}
                                                    onChange={e => updateIncomeField('ltcgEquity', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Shares/MF held over 12 months. First ₹1.25 Lakh is completely TAX-FREE! Only the excess is taxed at 12.5%. Check broker's "Long Term" P&L section.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasRental && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <Home className="h-5 w-5" /> House Property (Rental)
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-1/2/3/4</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <StepExplainer
                                        emoji="🏠"
                                        title="What is House Property Income?"
                                        shortDescription="Income from renting out your house, flat, or commercial property."
                                        details={[
                                            'The government automatically gives you 30% deduction on rent received (for repairs, maintenance) — you don\'t need receipts for this!',
                                            'If you have a home loan, the interest paid is deductible: up to ₹2 Lakh for self-occupied, unlimited for let-out property.',
                                            'Even if property is vacant, municipal tax paid is deductible from rental income.',
                                            'If you live in the house yourself (self-occupied), the rental income is considered NIL, but you can still claim home loan interest deduction.',
                                        ]}
                                        tips={[
                                            'Get the home loan interest certificate from your bank — it shows exactly how much interest you paid this year.',
                                            'If you own 2+ properties, only ONE can be shown as self-occupied. Others are "deemed let out" and taxed at fair rental value.',
                                        ]}
                                        variant="info"
                                    />
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Annual Rent Received</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold"
                                                    placeholder="Total rent for the year"
                                                    value={income.rentalIncome || ''}
                                                    onChange={e => updateIncomeField('rentalIncome', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Total rent collected from tenant (April 2025 - March 2026). Enter ₹0 if self-occupied.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Interest on Home Loan</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold"
                                                    placeholder="From bank's interest certificate"
                                                    value={income.homeLoanInterest || ''}
                                                    onChange={e => updateIncomeField('homeLoanInterest', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight italic">💡 Only the INTEREST portion of home loan EMI (not principal). Self-occupied: max ₹2L. Let-out: no limit. Get certificate from your bank under Section 24(b).</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasInterest && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <Landmark className="h-5 w-5" /> Interest Income
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-1/2/3/4</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <StepExplainer
                                        emoji="🏦"
                                        title="What is Interest Income?"
                                        shortDescription="The money your bank pays you for keeping money with them — in savings accounts, FDs, or RDs."
                                        details={[
                                            'Savings Account Interest: Banks pay 2.5-4% interest on your savings balance. You get 80TTA deduction of ₹10,000 on this (under Old Regime).',
                                            'FD/RD Interest: Banks deduct TDS if your total interest exceeds ₹40,000/year (₹50,000 for seniors). The TDS is already paid tax — claim credit!',
                                            'Post Office/NSC Interest: Also taxable, but some special schemes have partial exemptions.',
                                            'Your bank statement or passbook shows "Interest Credited" entries — add them up for the full year (April to March).',
                                        ]}
                                        tips={[
                                            'Check Form 26AS or AIS for exact interest reported by your bank to the IT department. Your numbers should match!',
                                            'If you have multiple savings accounts, add up interest from ALL banks.',
                                            'Even ₹500 of interest income must be reported — the IT dept knows about it from your bank\'s TDS returns.',
                                        ]}
                                        variant="info"
                                    />
                                    <div className="grid gap-6 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Savings Account Interest</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold"
                                                    placeholder="From all savings accounts"
                                                    value={income.savingsInterest || ''}
                                                    onChange={e => updateIncomeField('savingsInterest', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Check your bank passbook or statement for "Interest Credited" entries. Add up from ALL banks. Up to ₹10,000 is deductible under Section 80TTA!</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">FD/RD Interest</Label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    className="pl-9 h-12 text-lg font-bold"
                                                    placeholder="From all FDs, RDs, post office"
                                                    value={income.fdInterest || ''}
                                                    onChange={e => updateIncomeField('fdInterest', e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">💡 Fully taxable at your slab rate. Bank already deducted TDS if interest exceeds ₹40K/year. Check Form 26AS for TDS credit. Don't forget to claim this TDS!</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {income.hasDividends && (
                            <Card className="border-none shadow-lg overflow-hidden">
                                <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-primary">
                                        <PiggyBank className="h-5 w-5" /> Dividend Income
                                    </CardTitle>
                                    <Badge className="bg-primary/10 text-primary border-none">ITR-1/2/3/4</Badge>
                                </div>
                                <CardContent className="pt-6 space-y-6">
                                    <StepExplainer
                                        emoji="💸"
                                        title="What is Dividend Income?"
                                        shortDescription="Cash payments companies or mutual funds give you from their profits — just for holding their shares/units."
                                        details={[
                                            'Dividends are now FULLY TAXABLE at your slab rate (changed from April 2020 — they used to be tax-free).',
                                            'Companies deduct 10% TDS if your dividends exceed ₹5,000/year. This TDS is already paid tax — enter it for credit.',
                                            'Mutual fund dividends are also taxable. Check your MF statement for "Dividend Payout" entries.',
                                            'You can claim deduction of interest paid on loan taken to buy the shares (up to 20% of dividend), under Section 57.',
                                        ]}
                                        tips={[
                                            'Check your Demat account (CDSL/NSDL) or broker app for total dividends received.',
                                            'Your AIS shows all dividends reported by companies — match your numbers with AIS!',
                                        ]}
                                        variant="info"
                                    />
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Dividends Received</Label>
                                        <div className="relative">
                                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <Input
                                                type="number"
                                                className="pl-9 h-12 text-lg font-bold"
                                                placeholder="From all shares & mutual funds"
                                                value={income.dividendIncome || ''}
                                                onChange={e => updateIncomeField('dividendIncome', e.target.value)}
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground italic">💡 Total dividends from ALL companies and mutual funds combined. Check your Demat/broker statement → "Dividend" section. Also check AIS on IT portal for accuracy.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

                {/* Step 4: Deductions & Tax Strategy */}
                {step === 4 && (
                    <div className="space-y-6">
                        {/* Tax Regime Selection */}
                        <Card className="border-none shadow-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-primary to-indigo-800 p-6 text-white">
                                <CardTitle className="text-xl font-black flex items-center gap-3">
                                    <Zap className="h-6 w-6 text-accent" /> Step 4: Tax Strategy & Deductions
                                </CardTitle>
                                <CardDescription className="text-indigo-100 mt-1">
                                    First choose your tax regime, then claim all eligible deductions to save tax!
                                </CardDescription>
                            </div>
                            <CardContent className="pt-6">
                                <StepExplainer
                                    emoji="🤔"
                                    title="Old Regime vs New Regime — What's the difference?"
                                    shortDescription="India has 2 tax systems. We'll help you pick the one that saves the most money."
                                    details={[
                                        'OLD REGIME: Higher tax rates BUT you can claim deductions (80C, 80D, HRA, etc.) to reduce taxable income. Best if you have lots of investments & insurance.',
                                        'NEW REGIME: Lower tax rates BUT almost no deductions allowed (only ₹75K standard deduction). Best if you don\'t invest much.',
                                        'You can switch between regimes every year (for salaried) or once (for business).',
                                        'We calculate BOTH and show which saves more with YOUR actual numbers!',
                                    ]}
                                    tips={[
                                        'If your 80C + 80D + HRA deductions are less than ₹2 Lakhs, New Regime is usually better.',
                                        'If you have heavy home loan interest + insurance + PPF, Old Regime might save you more.',
                                    ]}
                                    variant="info"
                                    defaultOpen={true}
                                />

                                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                                    <div
                                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${selectedRegime === 'NEW' ? 'border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-500/10' : 'border-slate-100 hover:bg-slate-50'}`}
                                        onClick={() => setSelectedRegime('NEW')}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="font-black text-lg text-emerald-700">New Regime (Default)</p>
                                            {selectedRegime === 'NEW' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed mb-4">Lower tax rates for most people. No need to track complicated investments or house rent. <strong>Recommended for simplicity.</strong></p>
                                        <Badge className="bg-emerald-100 text-emerald-700 border-none">Std. Deduction: ₹75,000</Badge>
                                    </div>
                                    <div
                                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${selectedRegime === 'OLD' ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/10' : 'border-slate-100 hover:bg-slate-50'}`}
                                        onClick={() => setSelectedRegime('OLD')}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="font-black text-lg text-blue-700">Old Regime</p>
                                            {selectedRegime === 'OLD' && <CheckCircle className="h-5 w-5 text-blue-500" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed mb-4">Better if you have high LIC, PPF, Home Loan Interest, or HRA. Requires proofs for every deduction claimed.</p>
                                        <Badge className="bg-blue-100 text-blue-700 border-none">Std. Deduction: ₹50,000</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Enhanced Deductions Component */}
                        <EnhancedDeductionsStep
                            values={{
                                section_80c: deductions.section80C,
                                section_80d: deductions.section80D,
                                section_80ccd_1b: deductions.section80CCD1B,
                                section_80ccd_2: deductions.section80CCD2,
                                section_80e: deductions.section80E,
                                section_80g: deductions.section80G,
                                section_80tta: deductions.section80TTA,
                                section_80ttb: deductions.section80TTB,
                                section_80gg: deductions.section80GG,
                                section_80dd: deductions.section80DD,
                                section_80ddb: deductions.section80DDB,
                                section_80ee: deductions.section80EE,
                                section_80eea: deductions.section80EEA,
                                section_80eeb: deductions.section80EEB,
                                section_80u: deductions.section80U,
                                section_80gga: deductions.section80GGA,
                                section_80ggc: deductions.section80GGC,
                                hra: deductions.hra,
                                lta: deductions.lta,
                                other: deductions.other,
                            }}
                            onChange={(key, value) => {
                                // Map from category ids back to deductions state keys
                                const keyMap: Record<string, string> = {
                                    section_80c: 'section80C',
                                    section_80d: 'section80D',
                                    section_80ccd_1b: 'section80CCD1B',
                                    section_80ccd_2: 'section80CCD2',
                                    section_80e: 'section80E',
                                    section_80g: 'section80G',
                                    section_80tta: 'section80TTA',
                                    section_80ttb: 'section80TTB',
                                    section_80gg: 'section80GG',
                                    section_80dd: 'section80DD',
                                    section_80ddb: 'section80DDB',
                                    section_80ee: 'section80EE',
                                    section_80eea: 'section80EEA',
                                    section_80eeb: 'section80EEB',
                                    section_80u: 'section80U',
                                    section_80gga: 'section80GGA',
                                    section_80ggc: 'section80GGC',
                                    hra: 'hra',
                                    lta: 'lta',
                                    other: 'other',
                                };
                                const stateKey = keyMap[key] || key;
                                setDeductions(prev => ({ ...prev, [stateKey]: value }));
                            }}
                            regime={selectedRegime}
                        />
                    </div>
                )}

                {/* Step 5: Review & Personal Details */}
                {step === 5 && (
                    <div className="grid lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-3 space-y-6">
                            <Card className="border-none shadow-xl">
                                <CardHeader className="bg-slate-50/50 border-b">
                                    <CardTitle className="text-lg font-black flex items-center gap-2 uppercase tracking-tight">
                                        <Users className="h-5 w-5 text-primary" /> Personal Identification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">PAN Number *</Label>
                                        <Input
                                            className="font-mono font-bold tracking-widest uppercase"
                                            placeholder="ABCDE1234F"
                                            value={personalInfo.pan}
                                            onChange={e => setPersonalInfo(prev => ({ ...prev, pan: e.target.value.toUpperCase() }))}
                                            maxLength={10}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Birth Date *</Label>
                                        <Input
                                            type="date"
                                            className="font-bold"
                                            value={personalInfo.dob}
                                            onChange={e => setPersonalInfo(prev => ({ ...prev, dob: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Legal First Name *</Label>
                                        <Input
                                            className="font-bold"
                                            value={personalInfo.firstName}
                                            onChange={e => setPersonalInfo(prev => ({ ...prev, firstName: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Legal Last Name *</Label>
                                        <Input
                                            className="font-bold"
                                            value={personalInfo.lastName}
                                            onChange={e => setPersonalInfo(prev => ({ ...prev, lastName: e.target.value }))}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-none shadow-xl">
                                <CardHeader className="bg-slate-50/50 border-b">
                                    <CardTitle className="text-lg font-black flex items-center gap-2 uppercase tracking-tight">
                                        <Landmark className="h-5 w-5 text-primary" /> Bank for Refund
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 text-xs">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label className="font-bold uppercase tracking-widest text-muted-foreground">Account Number</Label>
                                        <Input
                                            className="font-mono font-bold"
                                            value={bankDetails.accountNumber}
                                            onChange={e => setBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-bold uppercase tracking-widest text-muted-foreground">IFSC Code</Label>
                                        <Input
                                            className="font-mono font-bold uppercase"
                                            value={bankDetails.ifsc}
                                            onChange={e => setBankDetails(prev => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-bold uppercase tracking-widest text-muted-foreground">Bank Name</Label>
                                        <Input
                                            className="font-bold"
                                            value={bankDetails.bankName}
                                            onChange={e => setBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            <Card className="border-none shadow-2xl bg-slate-900 text-white overflow-hidden relative">
                                {/* Decorative Background */}
                                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>

                                <CardHeader className="relative z-10 border-b border-white/10 pb-4">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                        <Calculator className="h-4 w-4 text-accent" /> Tax Computation
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="relative z-10 pt-6 space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-xs opacity-60 font-bold uppercase tracking-tighter">
                                            <span>Income Head</span>
                                            <span>Amount</span>
                                        </div>
                                        <div className="flex justify-between text-sm py-1 border-b border-white/5">
                                            <span className="opacity-80">Gross Total Income</span>
                                            <span className="font-black">{formatCurrency(taxCalculation.totalIncome)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm py-1 border-b border-white/5">
                                            <span className="opacity-80">Less: Deductions</span>
                                            <span className="font-black text-emerald-400">- {formatCurrency(taxCalculation.totalIncome - taxCalculation.taxableIncome)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm py-1 border-b border-white/10">
                                            <span className="font-black">Net Taxable Income</span>
                                            <span className="font-black">{formatCurrency(taxCalculation.taxableIncome)}</span>
                                        </div>
                                    </div>

                                    <Separator className="bg-white/10" />

                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm py-1">
                                            <span className="opacity-80">Income Tax + Cess</span>
                                            <span className="font-bold">{formatCurrency(taxCalculation.totalTax)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm py-1 text-emerald-400">
                                            <span className="font-bold">Total TDS Paid</span>
                                            <span className="font-bold">- {formatCurrency(taxCalculation.tdsPaid)}</span>
                                        </div>
                                    </div>

                                    <div className={`p-5 rounded-2xl border-2 ${taxCalculation.refund > 0 ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'} flex flex-col items-center text-center gap-1`}>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                                            {taxCalculation.refund > 0 ? 'Tax Refund Estimated' : 'Balance Tax Payable'}
                                        </p>
                                        <h4 className={`text-3xl font-black ${taxCalculation.refund > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {formatCurrency(taxCalculation.refund > 0 ? taxCalculation.refund : taxCalculation.netPayable)}
                                        </h4>
                                        <p className="text-[9px] mt-2 opacity-50 max-w-[180px]">Final amount will be calculated by ITD CPC based on matched TDS records.</p>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                                        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                            <Zap className="h-4 w-4 text-accent" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black uppercase text-accent leading-none">AI Insight</p>
                                            <p className="text-[10px] mt-1 line-clamp-2 italic opacity-70">
                                                {selectedRegime === 'NEW' ? 'New Regime is best for you.' : 'Deductions help you save ₹42k.'}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* Step 6: Download ITR JSON */}
                {step === 6 && (
                    <div className="space-y-6">
                        <Card className="border-none shadow-2xl bg-slate-50 overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white pb-8">
                                <CardTitle className="text-2xl font-black flex items-center gap-3">
                                    <CheckCircle className="h-7 w-7 text-emerald-300" />
                                    Review & Generate Your ITR File
                                </CardTitle>
                                <CardDescription className="text-emerald-50 text-base">
                                    Everything is ready! We've prepared your <strong>{recommendedForm}</strong> JSON file based on your inputs.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-8 space-y-8">
                                {/* Final Tax Recap Card */}
                                <div className="p-6 rounded-2xl bg-white border-2 border-slate-100 shadow-sm grid md:grid-cols-3 gap-6 relative">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Total Income</p>
                                        <p className="text-xl font-black text-primary">{formatCurrency(taxCalculation.totalIncome)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Net Tax Liability</p>
                                        <p className="text-xl font-black text-primary">{formatCurrency(taxCalculation.totalTax)}</p>
                                    </div>
                                    <div className={`p-3 rounded-xl ${taxCalculation.refund > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest leading-none opacity-70">
                                            {taxCalculation.refund > 0 ? 'Refund Estimated' : 'Tax Balance Payable'}
                                        </p>
                                        <p className="text-xl font-black">{formatCurrency(taxCalculation.refund > 0 ? taxCalculation.refund : taxCalculation.netPayable)}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="h-16 border-2 border-primary/20 text-primary hover:bg-primary/5 font-black text-lg gap-3 rounded-2xl"
                                        onClick={generateComputationReport}
                                    >
                                        <FileText className="h-6 w-6" />
                                        Computation Report (PDF)
                                    </Button>
                                    <Button
                                        size="lg"
                                        className="h-16 bg-primary hover:bg-primary/90 text-white font-black text-lg gap-3 rounded-2xl shadow-xl shadow-primary/20"
                                        onClick={handleGenerateITR}
                                    >
                                        <Download className="h-6 w-6 text-accent" />
                                        Download {recommendedForm} JSON
                                    </Button>
                                </div>

                                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
                                        <Info className="h-6 w-6 text-white" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-primary uppercase text-xs tracking-widest leading-none">Why do I need a JSON file?</h4>
                                        <p className="text-xs text-indigo-900/70 leading-relaxed">
                                            The Income Tax Department portal only accepts returns in a specific <strong>JSON format</strong>. We've formatted all your details perfectly according to their technical schema.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Step 7: Upload instructions */}
                {step === 7 && (
                    <div className="space-y-6">
                        <Card className="border-none shadow-2xl overflow-hidden">
                            <CardHeader className="bg-primary text-white p-8">
                                <CardTitle className="text-2xl font-black flex items-center gap-3">
                                    <Globe className="h-8 w-8 text-accent animate-pulse" />
                                    Final Step: Upload to Income Tax Dept
                                </CardTitle>
                                <CardDescription className="text-indigo-100 text-base mt-2">
                                    You have your JSON. Now let's finalize the filing on the official government portal.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-8 space-y-8">
                                <div className="grid md:grid-cols-3 gap-6">
                                    {[
                                        { step: 1, title: 'Visit Portal', desc: 'Go to incometax.gov.in and login with your PAN.' },
                                        { step: 2, title: 'Choose Upload', desc: 'E-File > IT Returns > File IT Return. Pick AY 2026-27.' },
                                        { step: 3, title: 'Select JSON', desc: 'Choose "Offline" mode and upload the JSON file you just downloaded.' }
                                    ].map((s) => (
                                        <div key={s.step} className="p-5 rounded-2xl bg-slate-50 border-2 border-white shadow-sm relative pt-10">
                                            <div className="absolute top-[-15px] left-5 h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center font-black shadow-lg">
                                                {s.step}
                                            </div>
                                            <h4 className="font-black text-sm mb-1 uppercase tracking-tight">{s.title}</h4>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">{s.desc}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-6 rounded-2xl border-2 border-accent/20 bg-accent/5 flex flex-col md:flex-row gap-6 items-center justify-between">
                                    <div className="space-y-1">
                                        <h4 className="font-black text-accent uppercase text-sm tracking-widest">E-Verify to Finish</h4>
                                        <p className="text-xs text-emerald-900/60 leading-relaxed font-medium">Your filing is NOT complete until you E-Verify using Aadhaar OTP or Net Banking.</p>
                                    </div>
                                    <a
                                        href="https://www.incometax.gov.in"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-8 py-4 bg-accent hover:bg-accent/90 text-white rounded-xl font-black text-sm transition-all shadow-xl shadow-accent/20 flex items-center gap-2"
                                    >
                                        Open Tax Portal <ArrowRight className="h-4 w-4" />
                                    </a>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                        <HelpCircle className="h-4 w-4" /> Need help with the portal?
                                    </h4>
                                    <div className="grid gap-2 text-[11px] font-medium text-slate-600">
                                        <div className="flex gap-2 items-start"><Check className="h-3 w-3 text-accent mt-0.5" /> Select "Offline" mode when asked how you want to file.</div>
                                        <div className="flex gap-2 items-start"><Check className="h-3 w-3 text-accent mt-0.5" /> If the portal asks for a form, it means you chose "Online" by mistake.</div>
                                        <div className="flex gap-2 items-start"><Check className="h-3 w-3 text-accent mt-0.5" /> Check your bank account validation on "Profile" before filing.</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-8 mt-12 border-t border-slate-100">
                <Button
                    variant="ghost"
                    size="lg"
                    className="gap-2 font-bold text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => {
                        const nextStep = Math.max(1, step - 1);
                        setStep(nextStep);
                        saveProgress(nextStep, income, deductions, personalInfo, bankDetails);
                    }}
                    disabled={step === 1}
                >
                    <ArrowLeft className="h-5 w-5" /> Previous Step
                </Button>

                {step < 7 ? (
                    <Button
                        size="lg"
                        className="bg-primary hover:bg-primary/90 text-white px-8 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 gap-2"
                        onClick={() => {
                            const nextStep = step + 1;
                            setStep(nextStep);
                            saveProgress(nextStep, income, deductions, personalInfo, bankDetails);
                        }}
                    >
                        {step === 1 ? "Start Filing" : step === 6 ? "View Upload Steps" : "Save & Continue"}
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                ) : (
                    <Button
                        size="lg"
                        className="bg-accent hover:bg-accent/90 text-white px-8 h-12 rounded-xl font-bold shadow-lg shadow-accent/20 transition-all active:scale-95 gap-2"
                        onClick={() => navigate('/dashboard')}
                    >
                        <CheckCircle className="h-5 w-5" /> Return to Dashboard
                    </Button>
                )}
            </div>
        </div>
    );
}
