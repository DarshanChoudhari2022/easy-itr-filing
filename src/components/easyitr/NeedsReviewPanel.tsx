/**
 * EasyITR — Needs Review Panel (Light Theme)
 * =============================================
 * UI for reviewing unclassified or suspicious transactions.
 * Filing is blocked until all blocker-level items are resolved.
 */

import React, { useState } from 'react';
import {
    AlertTriangle, CheckCircle, XCircle, HelpCircle,
    ChevronDown, ChevronRight, Eye, Trash2, Edit3, Tag
} from 'lucide-react';

import type { NeedsReviewItem, SuggestedAction } from '@/lib/easyitr/needs-review-service';
import { resolveReviewItem } from '@/lib/easyitr/needs-review-service';

// ============= PROPS =============

interface NeedsReviewPanelProps {
    items: NeedsReviewItem[];
    onResolve: (updatedItems: NeedsReviewItem[]) => void;
    className?: string;
}

// ============= COMPONENT =============

export function NeedsReviewPanel({
    items,
    onResolve,
    className = '',
}: NeedsReviewPanelProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const pendingBlockers = items.filter(i => i.severity === 'blocker' && i.status === 'pending');
    const pendingWarnings = items.filter(i => i.severity === 'warning' && i.status === 'pending');
    const resolvedItems = items.filter(i => i.status !== 'pending');

    if (items.length === 0) {
        return (
            <div className={`bg-emerald-50 border border-emerald-200 rounded-xl p-5 ${className}`}>
                <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                    <div>
                        <p className="text-sm font-medium text-emerald-700">All transactions classified</p>
                        <p className="text-xs text-emerald-600/70">No transactions need manual review</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleAction = (itemId: string, action: string, notes?: string) => {
        const updated = resolveReviewItem(items, itemId, { action, notes });
        onResolve(updated);
        setExpandedId(null);
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Summary Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h3 className="text-sm font-semibold text-slate-800">
                        Needs Review ({pendingBlockers.length + pendingWarnings.length} pending)
                    </h3>
                </div>
                {pendingBlockers.length > 0 && (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">
                        {pendingBlockers.length} blocker(s) — filing blocked
                    </span>
                )}
            </div>

            {/* Blocker Items */}
            {pendingBlockers.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                        ⛔ Must Resolve (Blocks Filing)
                    </h4>
                    {pendingBlockers.map(item => (
                        <ReviewItemCard
                            key={item.id}
                            item={item}
                            isExpanded={expandedId === item.id}
                            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            onAction={(action, notes) => handleAction(item.id, action, notes)}
                        />
                    ))}
                </div>
            )}

            {/* Warning Items */}
            {pendingWarnings.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                        ⚠️ Recommended Review
                    </h4>
                    {pendingWarnings.map(item => (
                        <ReviewItemCard
                            key={item.id}
                            item={item}
                            isExpanded={expandedId === item.id}
                            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            onAction={(action, notes) => handleAction(item.id, action, notes)}
                        />
                    ))}
                </div>
            )}

            {/* Resolved Items */}
            {resolvedItems.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        ✅ Resolved ({resolvedItems.length})
                    </h4>
                    {resolvedItems.map(item => (
                        <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg opacity-60"
                        >
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-slate-500 flex-1 truncate">
                                {item.description}
                            </span>
                            <span className="text-xs text-emerald-600 font-medium">
                                {item.status === 'excluded' ? 'Excluded' : `→ ${item.userClassification}`}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============= SUB-COMPONENTS =============

function ReviewItemCard({
    item,
    isExpanded,
    onToggle,
    onAction,
}: {
    item: NeedsReviewItem;
    isExpanded: boolean;
    onToggle: () => void;
    onAction: (action: string, notes?: string) => void;
}) {
    const severityConfig = item.severity === 'blocker'
        ? { bg: 'bg-red-50', border: 'border-red-200', icon: <XCircle className="w-5 h-5 text-red-500" /> }
        : { bg: 'bg-amber-50', border: 'border-amber-200', icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> };

    const tx = item.transaction;

    return (
        <div className={`rounded-lg border ${severityConfig.border} ${severityConfig.bg} overflow-hidden`}>
            {/* Header (clickable) */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/50 transition-colors"
            >
                {severityConfig.icon}
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {tx.assetSymbol} | {tx.transactionType} | {formatDate(tx.tradeTimestamp)}
                        {tx.grossAmountInr > 0 && ` | ₹${formatCurrency(tx.grossAmountInr)}`}
                    </p>
                </div>
                {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                }
            </button>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="border-t border-slate-200 p-4 space-y-4 bg-white">
                    {/* Transaction Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <Detail label="Asset" value={tx.assetSymbol} />
                        <Detail label="Pair" value={tx.pair} />
                        <Detail label="Type" value={tx.transactionType} />
                        <Detail label="Date" value={formatDate(tx.tradeTimestamp)} />
                        <Detail label="Quantity" value={tx.quantity?.toString()} />
                        <Detail label="Price INR" value={tx.priceInr > 0 ? `₹${formatCurrency(tx.priceInr)}` : '—'} />
                        <Detail label="Gross Amount" value={tx.grossAmountInr > 0 ? `₹${formatCurrency(tx.grossAmountInr)}` : '—'} />
                        <Detail label="Source" value={tx.rawData?.source || 'Unknown'} />
                    </div>

                    {/* Actions */}
                    <div>
                        <p className="text-xs text-slate-500 mb-2 font-medium">Choose classification:</p>
                        <div className="flex flex-wrap gap-2">
                            {item.suggestedActions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => onAction(action.value)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${action.value === 'exclude'
                                            ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                        }`}
                                    title={action.description}
                                >
                                    {action.value === 'exclude' && <Trash2 className="w-3 h-3 inline mr-1" />}
                                    {action.value === 'edit' && <Edit3 className="w-3 h-3 inline mr-1" />}
                                    {!['exclude', 'edit'].includes(action.value) && <Tag className="w-3 h-3 inline mr-1" />}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string }) {
    return (
        <div>
            <span className="text-slate-400">{label}: </span>
            <span className="text-slate-700 font-mono">{value || '—'}</span>
        </div>
    );
}

// ============= HELPERS =============

function formatDate(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
}

export default NeedsReviewPanel;

