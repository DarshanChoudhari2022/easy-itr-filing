/**
 * EasyITR — Filing Gate Modal
 * =============================
 * Override confirmation modal for users who want to proceed
 * despite soft blockers. Requires:
 *   1. All risk checkboxes checked
 *   2. Typed "I ACCEPT THE RISK" confirmation
 */

import React, { useState, useMemo } from 'react';
import { ShieldAlert, AlertTriangle, XCircle, CheckCircle, Lock } from 'lucide-react';

import type { FilingBlocker, FilingGateResult } from '@/lib/easyitr/filing-gate';
import { validateOverride, createOverrideRecord, saveOverride } from '@/lib/easyitr/filing-gate';

// ============= PROPS =============

interface FilingGateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOverrideSuccess: () => void;
    gateResult: FilingGateResult;
    financialYear: string;
}

// ============= COMPONENT =============

export function FilingGateModal({
    isOpen,
    onClose,
    onOverrideSuccess,
    gateResult,
    financialYear,
}: FilingGateModalProps) {
    const [checkboxes, setCheckboxes] = useState<boolean[]>([false, false, false]);
    const [typedText, setTypedText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const softBlockers = useMemo(() =>
        gateResult.blockers.filter(b => b.severity === 'soft'),
        [gateResult.blockers]
    );

    const hardBlockers = useMemo(() =>
        gateResult.blockers.filter(b => b.severity === 'hard'),
        [gateResult.blockers]
    );

    const hasHardBlockers = hardBlockers.length > 0;

    if (!isOpen) return null;

    const handleCheckboxChange = (index: number) => {
        const updated = [...checkboxes];
        updated[index] = !updated[index];
        setCheckboxes(updated);
        setError(null);
    };

    const handleOverride = () => {
        const result = validateOverride(typedText, checkboxes, 3);
        if (!result.valid) {
            setError(result.error || 'Validation failed');
            return;
        }

        // Create and save override record
        const overrideRecord = createOverrideRecord(
            financialYear,
            gateResult.blockers,
            gateResult.coverageScore,
            typedText
        );
        saveOverride(overrideRecord);
        onOverrideSuccess();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="w-7 h-7 text-orange-400" />
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {hasHardBlockers ? 'Filing Blocked' : 'Data Incomplete — Override Required'}
                            </h2>
                            <p className="text-sm text-gray-400">FY {financialYear}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Hard Blockers (cannot override) */}
                    {hardBlockers.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
                                <Lock className="w-4 h-4" />
                                Cannot Proceed — Hard Blockers
                            </h3>
                            {hardBlockers.map((blocker, i) => (
                                <div key={i} className="flex gap-3 p-3 bg-red-900/20 rounded-lg border border-red-800/50">
                                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-200">{blocker.message}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Soft Blockers (overridable) */}
                    {softBlockers.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Data Gaps Detected
                            </h3>
                            {softBlockers.map((blocker, i) => (
                                <div key={i} className="p-3 bg-yellow-900/15 rounded-lg border border-yellow-800/50">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-yellow-200">{blocker.message}</p>
                                            {blocker.riskDescription && (
                                                <p className="text-xs text-yellow-300/70 mt-1">
                                                    <strong>Risk:</strong> {blocker.riskDescription}
                                                </p>
                                            )}
                                            {blocker.impactEstimate && (
                                                <p className="text-xs text-orange-300/70 mt-0.5">
                                                    <strong>Impact:</strong> {blocker.impactEstimate}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Override Section (only if no hard blockers) */}
                    {!hasHardBlockers && softBlockers.length > 0 && (
                        <div className="border-t border-gray-700 pt-5 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-300">
                                To proceed despite incomplete data:
                            </h3>

                            {/* Checkboxes */}
                            <div className="space-y-3">
                                {[
                                    'I understand my tax computation may be inaccurate',
                                    'I accept responsibility for any discrepancies with Form 26AS',
                                    'I acknowledge IT Department may flag differences in my return',
                                ].map((label, i) => (
                                    <label key={i} className="flex items-start gap-3 cursor-pointer group">
                                        <div
                                            className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${checkboxes[i]
                                                    ? 'bg-indigo-600 border-indigo-500'
                                                    : 'border-gray-600 group-hover:border-gray-400'
                                                }`}
                                            onClick={() => handleCheckboxChange(i)}
                                        >
                                            {checkboxes[i] && <CheckCircle className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm text-gray-300">{label}</span>
                                    </label>
                                ))}
                            </div>

                            {/* Type confirmation */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">
                                    Type <span className="font-mono font-bold text-white bg-gray-700 px-1.5 py-0.5 rounded">I ACCEPT THE RISK</span> to proceed:
                                </label>
                                <input
                                    type="text"
                                    value={typedText}
                                    onChange={(e) => {
                                        setTypedText(e.target.value);
                                        setError(null);
                                    }}
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="Type here..."
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-400 flex items-center gap-1">
                                    <XCircle className="w-4 h-4" /> {error}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        {hasHardBlockers ? 'Go Back to Upload' : 'Cancel — Go Back to Upload'}
                    </button>

                    {!hasHardBlockers && softBlockers.length > 0 && (
                        <button
                            onClick={handleOverride}
                            disabled={!checkboxes.every(Boolean) || typedText.trim() !== 'I ACCEPT THE RISK'}
                            className="px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                        >
                            Proceed with Override
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default FilingGateModal;

