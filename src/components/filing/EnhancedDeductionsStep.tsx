/**
 * EnhancedDeductionsStep — Complete deductions UI for the filing wizard
 * Groups all deductions with educational content and baby-step instructions
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
    ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Info,
    PiggyBank, Sparkles, FileText, HelpCircle
} from 'lucide-react';
import { StepExplainer } from './StepExplainer';
import {
    ALL_DEDUCTIONS, DEDUCTION_GROUPS, DeductionCategoryConfig,
    getDeductionsByGroup, getCommonDeductions, validateDeduction
} from './DeductionCategories';

interface DeductionValues {
    [key: string]: number;
}

interface EnhancedDeductionsStepProps {
    values: DeductionValues;
    onChange: (key: string, value: number) => void;
    regime: 'OLD' | 'NEW';
}

export function EnhancedDeductionsStep({ values, onChange, regime }: EnhancedDeductionsStepProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['investments', 'health']));
    const [showAll, setShowAll] = useState(false);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const groupedDeductions = getDeductionsByGroup();

    const totalDeductions = Object.values(values).reduce((sum, v) => sum + (v || 0), 0);

    // Only show common deductions by default
    const commonIds = new Set(getCommonDeductions().map(d => d.id));

    if (regime === 'NEW') {
        return (
            <div className="space-y-6">
                <StepExplainer
                    emoji="💡"
                    title="What are Deductions?"
                    shortDescription="Deductions reduce your taxable income — like discounts on your tax bill!"
                    details={[
                        'In the New Tax Regime, most deductions are NOT available.',
                        'Only Standard Deduction (₹75,000) and Employer NPS (80CCD2) are allowed.',
                        'The New Regime compensates with LOWER tax slab rates instead.',
                        'If you have significant investments/insurance, consider switching to Old Regime.',
                    ]}
                    tips={[
                        'New Regime is great for people with simple income and few investments.',
                        'You can switch between regimes every year at the time of filing.',
                    ]}
                    variant="info"
                    defaultOpen={true}
                />

                <Card className="border-2 border-blue-200 bg-blue-50/50">
                    <CardContent className="py-6 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                            <Info className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-bold text-blue-900">Deductions are disabled in New Regime</h4>
                            <p className="text-sm text-blue-800/70 mt-1">
                                The New Tax Regime offers lower tax rates instead of deductions.
                                Standard Deduction of <strong>₹75,000</strong> is automatically applied.
                            </p>
                            <p className="text-xs text-blue-700/60 mt-2 italic">
                                💡 Want to claim 80C, 80D, HRA, etc.? Switch to Old Regime in the previous step.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Only show NPS Employer if applicable */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Badge className="bg-emerald-100 text-emerald-700 border-none text-xs">Available in New Regime</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DeductionInput
                            config={ALL_DEDUCTIONS.find(d => d.id === 'section_80ccd_2')!}
                            value={values['section_80ccd_2'] || 0}
                            onChange={(v) => onChange('section_80ccd_2', v)}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Baby Explanation */}
            <StepExplainer
                emoji="🎯"
                title="What are Deductions?"
                shortDescription="Deductions are like DISCOUNTS on your tax bill — invest smartly and pay less tax!"
                details={[
                    'When you invest in certain instruments (PPF, ELSS, LIC) or pay for health insurance, the government rewards you by reducing your taxable income.',
                    'Example: You earned ₹10L. If you invested ₹1.5L in PPF (80C), you only pay tax on ₹8.5L — saving about ₹45,000!',
                    'Each section has a maximum limit. We\'ll show you how much you can still claim.',
                    'Keep receipts and documents as proof — the tax department may ask for verification.',
                ]}
                tips={[
                    'Section 80C (₹1.5L) + 80D (₹25K health insurance) are the most popular. Start here!',
                    'NPS gives you an EXTRA ₹50K deduction above 80C limit under 80CCD(1B).',
                    'If you pay rent but don\'t get HRA, claim under Section 80GG.',
                ]}
                variant="success"
                defaultOpen={true}
            />

            {/* Total Summary */}
            <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                                <PiggyBank className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Total Deductions Claimed</p>
                                <p className="text-2xl font-black text-emerald-700">
                                    ₹{totalDeductions.toLocaleString('en-IN')}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-emerald-600">Estimated Tax Savings</p>
                            <p className="text-lg font-bold text-emerald-600">
                                ~₹{Math.round(totalDeductions * 0.3).toLocaleString('en-IN')}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Deduction Groups */}
            {DEDUCTION_GROUPS.map(group => {
                const deductions = groupedDeductions[group.id] || [];
                const displayDeductions = showAll
                    ? deductions
                    : deductions.filter(d => commonIds.has(d.id) || (values[d.id] || 0) > 0);

                if (displayDeductions.length === 0 && !showAll) return null;

                const isExpanded = expandedGroups.has(group.id);
                const groupTotal = deductions.reduce((sum, d) => sum + (values[d.id] || 0), 0);
                const hasValues = groupTotal > 0;

                return (
                    <Card key={group.id} className={`overflow-hidden transition-all ${hasValues ? 'border-emerald-200' : ''}`}>
                        <button
                            className="w-full p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                            onClick={() => toggleGroup(group.id)}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{group.emoji}</span>
                                <div className="text-left">
                                    <h3 className="font-bold text-sm">{group.title}</h3>
                                    <p className="text-[10px] text-muted-foreground">{group.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {hasValues && (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold">
                                        ₹{groupTotal.toLocaleString('en-IN')}
                                    </Badge>
                                )}
                                {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                        </button>

                        {isExpanded && (
                            <CardContent className="border-t pt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                                {(showAll ? deductions : displayDeductions).map(config => (
                                    <DeductionInput
                                        key={config.id}
                                        config={config}
                                        value={values[config.id] || 0}
                                        onChange={(v) => onChange(config.id, v)}
                                    />
                                ))}

                                {!showAll && deductions.length > displayDeductions.length && (
                                    <button
                                        className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAll(true);
                                        }}
                                    >
                                        + Show {deductions.length - displayDeductions.length} more deductions in this category
                                    </button>
                                )}
                            </CardContent>
                        )}
                    </Card>
                );
            })}

            {/* Show All Toggle */}
            {!showAll && (
                <Button
                    variant="outline"
                    className="w-full h-12 border-dashed border-2 text-muted-foreground hover:text-primary hover:border-primary"
                    onClick={() => setShowAll(true)}
                >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Show ALL deduction sections (including rare ones)
                </Button>
            )}
        </div>
    );
}

/**
 * Individual Deduction Input with tooltip and validation
 */
function DeductionInput({
    config,
    value,
    onChange,
}: {
    config: DeductionCategoryConfig;
    value: number;
    onChange: (value: number) => void;
}) {
    const [showHelp, setShowHelp] = useState(false);
    const validation = validateDeduction(config.id, value);
    const hasValue = value > 0;

    return (
        <div className={`p-4 rounded-xl border transition-all ${hasValue ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white'
            }`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{config.emoji}</span>
                        <Label className="text-xs font-bold uppercase tracking-wider cursor-pointer">{config.section}</Label>
                        {config.limit && (
                            <span className="text-[9px] font-bold text-slate-400">
                                Limit: ₹{config.limit.toLocaleString('en-IN')}
                            </span>
                        )}
                        {!config.limit && config.section !== 'Other' && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-none text-[8px]">
                                ✨ No Limit
                            </Badge>
                        )}
                        {hasValue && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-3">{config.description}</p>

                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">₹</span>
                        <Input
                            type="number"
                            placeholder="0"
                            className={`pl-7 h-10 font-bold text-sm ${hasValue ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100'
                                }`}
                            value={value || ''}
                            onChange={(e) => onChange(Number(e.target.value) || 0)}
                        />
                    </div>

                    {/* Limit Progress Bar */}
                    {config.limit && value > 0 && (
                        <div className="mt-2 space-y-1">
                            <Progress
                                value={Math.min((value / config.limit) * 100, 100)}
                                className={`h-1.5 ${value > config.limit ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`}
                            />
                            <div className="flex justify-between text-[9px]">
                                {value > config.limit ? (
                                    <span className="text-amber-600 font-bold flex items-center gap-1">
                                        <AlertCircle className="h-2.5 w-2.5" />
                                        Exceeds limit! Only ₹{config.limit.toLocaleString('en-IN')} will be considered
                                    </span>
                                ) : (
                                    <span className="text-emerald-600">
                                        ₹{(config.limit - value).toLocaleString('en-IN')} remaining
                                    </span>
                                )}
                                <span className="text-slate-400">{Math.round((value / config.limit) * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Help Toggle */}
                <button
                    className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${showHelp ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400 hover:bg-primary/10 hover:text-primary'
                        }`}
                    onClick={() => setShowHelp(!showHelp)}
                    title="What is this?"
                >
                    <HelpCircle className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Expandable Help */}
            {showHelp && (
                <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-blue-800 leading-relaxed mb-2">{config.babyExplanation}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Examples: </span>
                        <span className="text-[10px] text-blue-700/70">{config.examples}</span>
                    </div>
                    {config.documentsNeeded.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-blue-100">
                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                                <FileText className="h-2.5 w-2.5" /> Documents Needed:
                            </span>
                            <ul className="mt-1 space-y-0.5">
                                {config.documentsNeeded.map((doc, i) => (
                                    <li key={i} className="text-[10px] text-blue-700/70 flex items-center gap-1">
                                        <span className="text-blue-400">•</span> {doc}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
