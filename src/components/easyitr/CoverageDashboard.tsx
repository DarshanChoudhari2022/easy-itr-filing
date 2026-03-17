/**
 * EasyITR — Coverage Dashboard Component
 * =========================================
 * Shows the complete data coverage status for a Financial Year:
 *   - Overall status (🔴/🟠/🟡/✅)
 *   - Per-source upload checklist
 *   - Reconciliation check results
 *   - Monthly activity heatmap
 *   - Tax preview state notice
 * 
 * LIGHT THEME — matches the Crypto page's slate-50/white card design.
 */

import React, { useMemo } from 'react';
import {
    CheckCircle, XCircle, AlertTriangle, Clock, Upload,
    ChevronRight, Info, Shield, ShieldAlert, ShieldCheck, ShieldX,
    Calendar, FileSpreadsheet, Zap, TrendingUp, HelpCircle,
    ExternalLink, BarChart3
} from 'lucide-react';

import type { FYChecklist, ChecklistItem, TaxPreviewState } from '@/lib/easyitr/coverage-tracker';
import type { ReconciliationCheck, FullReconciliationResult } from '@/lib/easyitr/reconciliation-engine-v2';
import type { MonthActivity } from '@/lib/easyitr/gap-detector';

// ============= PROPS =============

interface CoverageDashboardProps {
    checklist: FYChecklist;
    reconciliation?: FullReconciliationResult | null;
    onUploadFile: (source: string) => void;
    onMarkNotApplicable: (source: string) => void;
    onShowInstructions: (source: string) => void;
    className?: string;
}

// ============= MAIN COMPONENT =============

export function CoverageDashboard({
    checklist,
    reconciliation,
    onUploadFile,
    onMarkNotApplicable,
    onShowInstructions,
    className = '',
}: CoverageDashboardProps) {
    const overallStatusConfig = useMemo(() => getStatusConfig(checklist), [checklist]);

    return (
        <div className={`space-y-5 ${className}`}>
            {/* Overall Status Banner */}
            <div className={`rounded-xl border-2 ${overallStatusConfig.borderClass} ${overallStatusConfig.bgClass} p-5 shadow-sm`}>
                <div className="flex items-center gap-3 mb-3">
                    {overallStatusConfig.icon}
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">
                            DATA COVERAGE — FY {checklist.financialYear}
                        </h3>
                        <p className={`text-sm font-semibold ${overallStatusConfig.textClass}`}>
                            {overallStatusConfig.label}
                        </p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Coverage Score</span>
                        <span className="font-mono font-bold text-slate-700">{checklist.coverageScore}%</span>
                    </div>
                    <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${overallStatusConfig.barClass}`}
                            style={{ width: `${checklist.coverageScore}%` }}
                        />
                    </div>
                </div>

                {checklist.blockerCount > 0 && (
                    <p className="mt-2 text-sm text-red-600 font-medium">
                        ⛔ {checklist.blockerCount} blocker(s) must be resolved before tax computation
                    </p>
                )}
                {checklist.needsReviewCount > 0 && (
                    <p className="mt-1 text-sm text-amber-600">
                        ⚠️ {checklist.needsReviewCount} transaction(s) need your review
                    </p>
                )}
            </div>

            {/* Data Sources Checklist */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                    Data Sources
                </h4>

                <div className="space-y-2">
                    {checklist.items.map(item => (
                        <ChecklistRow
                            key={item.id}
                            item={item}
                            onUpload={() => onUploadFile(item.source)}
                            onMarkNA={() => onMarkNotApplicable(item.source)}
                            onShowHelp={() => onShowInstructions(item.source)}
                        />
                    ))}
                </div>
            </div>

            {/* Reconciliation Results */}
            {reconciliation && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-500" />
                        Reconciliation Results
                    </h4>

                    <div className="space-y-1">
                        {reconciliation.checks.map(check => (
                            <ReconciliationRow key={check.id} check={check} />
                        ))}
                    </div>

                    <div className="mt-4 flex gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
                        <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-500" /> {reconciliation.passCount} passed
                        </span>
                        <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-500" /> {reconciliation.warningCount} warnings
                        </span>
                        <span className="flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-red-500" /> {reconciliation.failCount} failed
                        </span>
                    </div>
                </div>
            )}

            {/* Monthly Activity Heatmap */}
            {reconciliation?.gapResult?.monthlyActivity && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-500" />
                        Monthly Activity
                    </h4>

                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {reconciliation.gapResult.monthlyActivity.map((m, idx) => (
                            <MonthCell key={idx} month={m} />
                        ))}
                    </div>

                    {reconciliation.gapResult.monthlyActivity.every(m => m.hasActivity) && (
                        <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            All months have trade activity — no suspicious gaps
                        </p>
                    )}
                </div>
            )}

            {/* Tax Preview State Notice */}
            <TaxPreviewNotice state={checklist.taxPreviewState} />
        </div>
    );
}

// ============= SUB-COMPONENTS =============

function ChecklistRow({
    item,
    onUpload,
    onMarkNA,
    onShowHelp,
}: {
    item: ChecklistItem;
    onUpload: () => void;
    onMarkNA: () => void;
    onShowHelp: () => void;
}) {
    const statusConfig = getItemStatusConfig(item);
    const isEffectivelyRequired = item.isRequired || item.isConditionallyRequired;

    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg ${statusConfig.rowBg} transition-all`}>
            <div className="flex-shrink-0">{statusConfig.icon}</div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">{item.label}</span>
                    {isEffectivelyRequired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold uppercase">
                            Required
                        </span>
                    )}
                    {item.isConditionallyRequired && !item.isRequired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold uppercase">
                            Detected
                        </span>
                    )}
                </div>

                {item.status === 'uploaded' && item.fileName && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                        📄 {item.fileName}
                        {item.recordCount !== undefined && ` (${item.recordCount} records)`}
                    </p>
                )}
                {item.status === 'uploaded' && item.dateRangeCovered && (
                    <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(item.dateRangeCovered.start)} — {formatDate(item.dateRangeCovered.end)}
                    </p>
                )}
                {item.validationResult?.status === 'errors' && (
                    <p className="text-xs text-red-600 mt-0.5">
                        ⚠️ {item.validationResult.errors[0]}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
                {item.status === 'pending' && (
                    <>
                        <button
                            onClick={onUpload}
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                        >
                            <Upload className="w-3 h-3" />
                            Upload
                        </button>
                        {!item.isRequired && (
                            <button
                                onClick={onMarkNA}
                                className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Mark as Not Applicable"
                            >
                                N/A
                            </button>
                        )}
                    </>
                )}
                <button
                    onClick={onShowHelp}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    title="How to download this file"
                >
                    <HelpCircle className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function ReconciliationRow({ check }: { check: ReconciliationCheck }) {
    const statusConfig = {
        pass: { icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, textClass: 'text-slate-600' },
        warning: { icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, textClass: 'text-amber-700' },
        fail: { icon: <XCircle className="w-4 h-4 text-red-500" />, textClass: 'text-red-700' },
        skipped: { icon: <Clock className="w-4 h-4 text-slate-400" />, textClass: 'text-slate-400' },
    }[check.status];

    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
            {statusConfig.icon}
            <span className="text-sm text-slate-700 flex-1">{check.name}</span>
            <span className={`text-xs ${statusConfig.textClass} text-right max-w-[50%] truncate`}>
                {check.detail}
            </span>
        </div>
    );
}

function MonthCell({ month }: { month: MonthActivity }) {
    const intensity = month.transactionCount === 0 ? 0 :
        month.transactionCount < 5 ? 1 :
            month.transactionCount < 20 ? 2 : 3;

    const bgClasses = [
        'bg-slate-100',
        'bg-emerald-100',
        'bg-emerald-200',
        'bg-emerald-300',
    ];

    const textClasses = [
        'text-slate-400',
        'text-emerald-700',
        'text-emerald-800',
        'text-emerald-900',
    ];

    return (
        <div
            className={`${bgClasses[intensity]} rounded-lg p-2 text-center transition-all hover:scale-105 border border-slate-100`}
            title={`${month.month}: ${month.transactionCount} transaction(s)`}
        >
            <div className="text-[10px] text-slate-500 font-medium">
                {month.month.split(' ')[0]}
            </div>
            <div className={`text-xs font-mono font-bold ${month.hasActivity ? textClasses[intensity] : 'text-slate-300'}`}>
                {month.transactionCount}
            </div>
        </div>
    );
}

function TaxPreviewNotice({ state }: { state: TaxPreviewState }) {
    const configs: Record<TaxPreviewState, { icon: React.ReactNode; bg: string; border: string; text: string; message: string }> = {
        LOCKED: {
            icon: <ShieldX className="w-5 h-5 text-red-500" />,
            bg: 'bg-red-50',
            border: 'border-red-200',
            text: 'text-red-700',
            message: 'Tax computation is DISABLED. Upload all required files to enable tax preview.',
        },
        INCOMPLETE: {
            icon: <ShieldAlert className="w-5 h-5 text-orange-500" />,
            bg: 'bg-orange-50',
            border: 'border-orange-200',
            text: 'text-orange-700',
            message: 'Tax preview shows ESTIMATED numbers based on partial data. Do NOT use for filing.',
        },
        WARNING: {
            icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            text: 'text-amber-700',
            message: 'Minor data gaps detected. Review warnings before filing.',
        },
        READY: {
            icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
            bg: 'bg-emerald-50',
            border: 'border-emerald-200',
            text: 'text-emerald-700',
            message: 'All data sources verified. Tax computation is ready for filing.',
        },
    };

    const config = configs[state];

    return (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${config.border} ${config.bg}`}>
            {config.icon}
            <p className={`text-sm font-medium ${config.text}`}>{config.message}</p>
        </div>
    );
}

// ============= HELPERS =============

function getStatusConfig(checklist: FYChecklist) {
    const state = checklist.taxPreviewState;
    const configs = {
        LOCKED: {
            icon: <ShieldX className="w-7 h-7 text-red-500" />,
            label: '🔴 DATA INCOMPLETE — DO NOT FILE',
            borderClass: 'border-red-300',
            bgClass: 'bg-red-50',
            textClass: 'text-red-600',
            barClass: 'bg-red-500',
        },
        INCOMPLETE: {
            icon: <ShieldAlert className="w-7 h-7 text-orange-500" />,
            label: '🟠 PARTIAL DATA — TAX PREVIEW UNRELIABLE',
            borderClass: 'border-orange-300',
            bgClass: 'bg-orange-50',
            textClass: 'text-orange-600',
            barClass: 'bg-orange-500',
        },
        WARNING: {
            icon: <AlertTriangle className="w-7 h-7 text-amber-500" />,
            label: '⚠️ MOSTLY COMPLETE — REVIEW WARNINGS',
            borderClass: 'border-amber-300',
            bgClass: 'bg-amber-50',
            textClass: 'text-amber-600',
            barClass: 'bg-amber-500',
        },
        READY: {
            icon: <ShieldCheck className="w-7 h-7 text-emerald-500" />,
            label: '✅ SAFE TO FILE',
            borderClass: 'border-emerald-300',
            bgClass: 'bg-emerald-50',
            textClass: 'text-emerald-600',
            barClass: 'bg-emerald-500',
        },
    };
    return configs[state];
}

function getItemStatusConfig(item: ChecklistItem) {
    const isEffectivelyRequired = item.isRequired || item.isConditionallyRequired;

    switch (item.status) {
        case 'uploaded':
            return {
                icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
                rowBg: 'bg-emerald-50/50',
            };
        case 'not_applicable':
            return {
                icon: <span className="text-slate-400 text-sm">➖</span>,
                rowBg: 'bg-slate-50',
            };
        case 'acknowledged_missing':
            return {
                icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
                rowBg: 'bg-amber-50/50',
            };
        case 'pending':
        default:
            return {
                icon: isEffectivelyRequired
                    ? <XCircle className="w-5 h-5 text-red-500" />
                    : <Clock className="w-5 h-5 text-slate-400" />,
                rowBg: isEffectivelyRequired ? 'bg-red-50/50' : 'bg-slate-50/50',
            };
    }
}

function formatDate(d: Date): string {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '—';
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export default CoverageDashboard;

