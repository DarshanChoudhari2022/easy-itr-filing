/**
 * StepExplainer — Reusable educational component for each filing step
 * Shows baby-step instructions in a friendly, collapsible card
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, HelpCircle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StepExplainerProps {
    emoji: string;
    title: string;
    shortDescription: string;
    details: string[];
    tips?: string[];
    variant?: 'info' | 'warning' | 'success' | 'tip';
    defaultOpen?: boolean;
}

const variantStyles = {
    info: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        titleColor: 'text-blue-900',
        textColor: 'text-blue-800/80',
        badgeClass: 'bg-blue-100 text-blue-700 border-none',
    },
    warning: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        titleColor: 'text-amber-900',
        textColor: 'text-amber-800/80',
        badgeClass: 'bg-amber-100 text-amber-700 border-none',
    },
    success: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        titleColor: 'text-emerald-900',
        textColor: 'text-emerald-800/80',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-none',
    },
    tip: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
        titleColor: 'text-purple-900',
        textColor: 'text-purple-800/80',
        badgeClass: 'bg-purple-100 text-purple-700 border-none',
    },
};

export function StepExplainer({
    emoji,
    title,
    shortDescription,
    details,
    tips,
    variant = 'info',
    defaultOpen = false,
}: StepExplainerProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const styles = variantStyles[variant];

    return (
        <div className={`rounded-2xl border ${styles.border} ${styles.bg} overflow-hidden transition-all duration-300`}>
            <button
                className="w-full p-4 flex items-start gap-4 text-left hover:bg-white/30 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={`h-10 w-10 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0 text-xl`}>
                    {emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className={`font-bold text-sm ${styles.titleColor}`}>{title}</h4>
                        <Badge className={`${styles.badgeClass} text-[9px]`}>
                            <HelpCircle className="h-2.5 w-2.5 mr-0.5" />
                            Baby Guide
                        </Badge>
                    </div>
                    <p className={`text-xs ${styles.textColor} leading-relaxed`}>{shortDescription}</p>
                </div>
                <div className={`${styles.iconColor} shrink-0 mt-1`}>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
            </button>

            {isOpen && (
                <div className="px-4 pb-4 pt-0 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="pl-14 space-y-2">
                        {details.map((detail, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className={`text-[10px] font-bold ${styles.iconColor} mt-0.5`}>•</span>
                                <p className={`text-xs ${styles.textColor} leading-relaxed`}>{detail}</p>
                            </div>
                        ))}
                    </div>

                    {tips && tips.length > 0 && (
                        <div className="pl-14 pt-2 border-t border-white/50">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Lightbulb className={`h-3 w-3 ${styles.iconColor}`} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${styles.iconColor}`}>Pro Tips</span>
                            </div>
                            {tips.map((tip, i) => (
                                <div key={i} className="flex items-start gap-2 mb-1.5">
                                    <span className="text-xs">💡</span>
                                    <p className={`text-[11px] ${styles.textColor} leading-relaxed font-medium italic`}>{tip}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface FieldTooltipProps {
    label: string;
    explanation: string;
    example?: string;
}

export function FieldTooltip({ label, explanation, example }: FieldTooltipProps) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative inline-flex items-center gap-1">
            <span>{label}</span>
            <button
                className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-slate-100 hover:bg-primary/10 transition-colors"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                onClick={() => setShow(!show)}
            >
                <Info className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
            {show && (
                <div className="absolute z-50 top-full left-0 mt-1 w-64 p-3 bg-white rounded-xl shadow-xl border text-xs animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-slate-700 leading-relaxed">{explanation}</p>
                    {example && (
                        <p className="mt-2 text-slate-500 italic border-t pt-2">Example: {example}</p>
                    )}
                </div>
            )}
        </div>
    );
}

export function SaveIndicator({ saving, lastSaved }: { saving: boolean; lastSaved?: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            {saving ? (
                <>
                    <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-600 font-medium">Saving...</span>
                </>
            ) : lastSaved ? (
                <>
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-emerald-600 font-medium">All changes saved ✓</span>
                </>
            ) : null}
        </div>
    );
}
