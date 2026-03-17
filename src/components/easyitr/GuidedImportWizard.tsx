/**
 * EasyITR — Guided Import Wizard (v2)
 * =====================================
 * Professional step-by-step wizard for importing crypto data.
 * - FY-aware download instructions with direct CoinDCX links
 * - Immediate transaction display after each upload
 * - Reset button to clear all data and start fresh
 * - Synced with Data Coverage tab
 * - No KoinX references
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    CheckCircle2, Circle, Upload, Zap, FileSpreadsheet, Eye, EyeOff,
    RefreshCw, ArrowRight, ArrowLeft, ChevronRight, ChevronDown,
    Download, Trash2, Info, Clock, FileCheck, Receipt,
    ExternalLink, Filter, RotateCcw, FileText, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

import type { NormalizedTransaction, TDSRecord } from '@/lib/easyitr';
import type { FYChecklist, DataSourceType } from '@/lib/easyitr/coverage-tracker';
import type { SyncProgress, FullSyncResult } from '@/lib/coindcx-api';

// ============= TYPES =============

interface WizardStep {
    id: string;
    label: string;
    description: string;
    source: DataSourceType | null;
    isRequired: boolean;
    icon: React.ReactNode;
}

interface GuidedImportWizardProps {
    parsedTransactions: NormalizedTransaction[];
    parsedTDSRecords: TDSRecord[];
    checklist: FYChecklist | null;
    selectedFY: string;

    apiKey: string;
    apiSecret: string;
    apiConnected: boolean;
    apiSyncing: boolean;
    apiSyncProgress: SyncProgress | null;
    apiSyncResult: FullSyncResult | null;

    setApiKey: (v: string) => void;
    setApiSecret: (v: string) => void;

    onApiConnect: () => Promise<void>;
    onApiResync: () => Promise<void>;
    onCsvUpload: (files: FileList, fileType?: string) => Promise<void>;
    onDisconnect: () => void;
    onReset?: () => void;

    formatCurrency: (v: number | string | undefined | null) => string;
}

// ============= FY HELPERS =============

function getFYDates(fy: string): { start: string; end: string; label: string } {
    // Parse "2024-25" -> April 1, 2024 to March 31, 2025
    const match = fy.match(/(\d{4})/);
    const startYear = match ? parseInt(match[1]) : 2024;
    const endYear = startYear + 1;
    return {
        start: `1 April ${startYear}`,
        end: `31 March ${endYear}`,
        label: `FY ${startYear}-${String(endYear).slice(2)}`,
    };
}

// ============= WIZARD STEPS =============

const WIZARD_STEPS: WizardStep[] = [
    {
        id: 'api',
        label: 'CoinDCX API Sync',
        description: 'Connect your CoinDCX API to auto-fetch all spot trades, deposits & withdrawals.',
        source: 'api_sync',
        isRequired: false,
        icon: <Zap className="h-5 w-5" />,
    },
    {
        id: 'order_csv',
        label: 'Order History CSV',
        description: 'Upload filled orders from CoinDCX. This is the primary source for buy/sell trades.',
        source: 'order_history_csv',
        isRequired: true,
        icon: <FileSpreadsheet className="h-5 w-5" />,
    },
    {
        id: 'tds_csv',
        label: 'TDS Summary CSV',
        description: 'Upload TDS Summary — captures ALL sell events including Insta & P2P trades with accurate TDS amounts.',
        source: 'tds_summary_csv',
        isRequired: true,
        icon: <Receipt className="h-5 w-5" />,
    },
    {
        id: 'insta_csv',
        label: 'Insta History CSV',
        description: 'Upload Insta/P2P trade history for accurate cost basis on Instant Buy/Sell transactions.',
        source: 'insta_history_csv',
        isRequired: false,
        icon: <Clock className="h-5 w-5" />,
    },
    {
        id: 'rewards',
        label: 'Rewards & Other',
        description: 'Upload staking rewards, airdrops, interest CSV or add manually via "Add Trade".',
        source: 'rewards_csv',
        isRequired: false,
        icon: <FileCheck className="h-5 w-5" />,
    },
    {
        id: 'review',
        label: 'Review & Export',
        description: 'Review all imported transactions. Download combined CSV or generate tax report.',
        source: null,
        isRequired: false,
        icon: <FileText className="h-5 w-5" />,
    },
];

// ============= MAIN COMPONENT =============

export function GuidedImportWizard({
    parsedTransactions,
    parsedTDSRecords,
    checklist,
    selectedFY,
    apiKey,
    apiSecret,
    apiConnected,
    apiSyncing,
    apiSyncProgress,
    apiSyncResult,
    setApiKey,
    setApiSecret,
    onApiConnect,
    onApiResync,
    onCsvUpload,
    onDisconnect,
    onReset,
    formatCurrency,
}: GuidedImportWizardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);
    const [expandedInstructions, setExpandedInstructions] = useState<string | null>(null);
    const [filterSource, setFilterSource] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fyDates = useMemo(() => getFYDates(selectedFY), [selectedFY]);

    // Step completion status
    const getStepStatus = useCallback((stepId: string): 'pending' | 'done' | 'skipped' => {
        if (!checklist) return 'pending';
        const step = WIZARD_STEPS.find(s => s.id === stepId);
        if (!step?.source) return stepId === 'review' ? (parsedTransactions.length > 0 ? 'done' : 'pending') : 'pending';
        const item = checklist.items.find(i => i.source === step.source);
        if (!item) return 'pending';
        if (item.status === 'uploaded') return 'done';
        if (item.status === 'not_applicable' || item.status === 'acknowledged_missing') return 'skipped';
        return 'pending';
    }, [checklist, parsedTransactions.length]);

    const completedSteps = useMemo(() =>
        WIZARD_STEPS.filter(s => getStepStatus(s.id) === 'done').length,
        [getStepStatus]
    );

    // Source breakdown
    const sourceBreakdown = useMemo(() => {
        const bd: Record<string, number> = {};
        for (const tx of parsedTransactions) {
            const src = tx.rawData?.source === 'api' ? 'API Sync' :
                (tx.rawData?.fileType || tx.rawData?.file_type) === 'trades' ? 'Order CSV' :
                    (tx.rawData?.fileType || tx.rawData?.file_type) === 'tds' ? 'TDS CSV' :
                        (tx.rawData?.fileType || tx.rawData?.file_type) === 'insta' ? 'Insta CSV' :
                            (tx.rawData?.fileType || tx.rawData?.file_type) === 'rewards' ? 'Rewards' :
                                tx.description?.includes('Manual') ? 'Manual' : 'Other';
            bd[src] = (bd[src] || 0) + 1;
        }
        return bd;
    }, [parsedTransactions]);

    // Filtered transactions
    const filteredTransactions = useMemo(() => {
        let txs = [...parsedTransactions];
        if (filterSource !== 'all') {
            txs = txs.filter(tx => {
                const src = tx.rawData?.source === 'api' ? 'api' :
                    (tx.rawData?.fileType || tx.rawData?.file_type || 'other');
                return src === filterSource;
            });
        }
        if (filterType !== 'all') {
            txs = txs.filter(tx => tx.transactionType === filterType);
        }
        txs.sort((a, b) => new Date(b.tradeTimestamp).getTime() - new Date(a.tradeTimestamp).getTime());
        return txs;
    }, [parsedTransactions, filterSource, filterType]);

    // Source & type badges
    const getSourceBadge = (tx: NormalizedTransaction) => {
        if (tx.rawData?.source === 'api') return { label: 'API', color: 'bg-amber-100 text-amber-700 border-amber-200' };
        const ft = tx.rawData?.fileType || tx.rawData?.file_type;
        if (ft === 'trades') return { label: 'Order CSV', color: 'bg-blue-100 text-blue-700 border-blue-200' };
        if (ft === 'tds') return { label: 'TDS CSV', color: 'bg-purple-100 text-purple-700 border-purple-200' };
        if (ft === 'insta') return { label: 'Insta CSV', color: 'bg-teal-100 text-teal-700 border-teal-200' };
        if (ft === 'rewards') return { label: 'Rewards', color: 'bg-pink-100 text-pink-700 border-pink-200' };
        if (tx.description?.includes('Manual')) return { label: 'Manual', color: 'bg-slate-100 text-slate-700 border-slate-200' };
        return { label: 'Other', color: 'bg-slate-100 text-slate-500 border-slate-200' };
    };

    const getTypeBadge = (type: string) => {
        if (type === 'buy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (type === 'sell') return 'bg-red-50 text-red-700 border-red-200';
        if (type.includes('reward') || type === 'airdrop' || type === 'staking_reward') return 'bg-purple-50 text-purple-700 border-purple-200';
        if (type === 'deposit') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (type === 'withdrawal') return 'bg-orange-50 text-orange-700 border-orange-200';
        return 'bg-slate-50 text-slate-600 border-slate-200';
    };

    // Upload handler
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await onCsvUpload(e.target.files);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Download combined CSV
    const downloadCombinedCSV = () => {
        if (parsedTransactions.length === 0) {
            toast.error('No transactions to export');
            return;
        }
        const headers = ['Date', 'Type', 'Asset', 'Quantity', 'Price (INR)', 'Value (INR)', 'Fee (INR)', 'TDS (INR)', 'Exchange', 'Source', 'FY', 'Order ID'];
        const rows = parsedTransactions
            .sort((a, b) => new Date(a.tradeTimestamp).getTime() - new Date(b.tradeTimestamp).getTime())
            .map(tx => {
                const source = tx.rawData?.source === 'api' ? 'API_Sync' :
                    (tx.rawData?.fileType || tx.rawData?.file_type || 'Other');
                return [
                    new Date(tx.tradeTimestamp).toISOString(),
                    tx.transactionType,
                    tx.assetSymbol,
                    tx.quantity.toFixed(8),
                    (tx.priceInr || 0).toFixed(2),
                    (tx.grossAmountInr || 0).toFixed(2),
                    (tx.feeInr || 0).toFixed(2),
                    (tx.tdsAmount || 0).toFixed(2),
                    tx.exchange || '',
                    source,
                    tx.financialYear,
                    tx.orderId || '',
                ].join(',');
            });
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EasyITR_Transactions_${selectedFY}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${parsedTransactions.length} transactions`);
    };

    // FY-specific download instructions
    const getInstructions = (stepId: string) => {
        const fy = fyDates;
        switch (stepId) {
            case 'order_csv':
                return {
                    title: `Download Order History for ${fy.label}`,
                    link: 'https://coindcx.com/orders',
                    steps: [
                        `Go to CoinDCX → Orders → Order History`,
                        `Click "FILLED ORDERS" tab`,
                        `Set date range: ${fy.start} to ${fy.end}`,
                        `Click "Download CSV"`,
                        `Upload the downloaded file below`,
                    ],
                };
            case 'tds_csv':
                return {
                    title: `Download TDS Summary for ${fy.label}`,
                    link: 'https://coindcx.com/profile/reports',
                    steps: [
                        `Go to CoinDCX → Profile → Reports`,
                        `Select "TDS Summary"`,
                        `Choose Financial Year: ${fy.label}`,
                        `Click "Export CSV"`,
                        `Upload the downloaded file below`,
                    ],
                };
            case 'insta_csv':
                return {
                    title: `Download Insta History for ${fy.label}`,
                    link: 'https://coindcx.com/orders',
                    steps: [
                        `Go to CoinDCX → Orders → Insta History`,
                        `Set date range: ${fy.start} to ${fy.end}`,
                        `Click "Download" or "Export CSV"`,
                        `Upload the downloaded file below`,
                    ],
                };
            case 'rewards':
                return {
                    title: 'Rewards & Staking Data',
                    link: null,
                    steps: [
                        'CoinDCX does NOT provide a rewards CSV download',
                        'Check your email for "CoinDCX reward credited" notifications',
                        'Use "+ Add Trade" → select "Staking Reward" or "Airdrop"',
                        'Enter the asset, quantity, date, and value from each email',
                        'Or check CoinDCX App → "Earn" section for staking details',
                    ],
                };
            default:
                return null;
        }
    };

    // Recent transactions for current step source
    const getStepTransactions = (stepId: string) => {
        const sourceMap: Record<string, string> = {
            api: 'api',
            order_csv: 'trades',
            tds_csv: 'tds',
            insta_csv: 'insta',
            rewards: 'rewards',
        };
        const src = sourceMap[stepId];
        if (!src) return [];
        return parsedTransactions.filter(tx => {
            if (src === 'api') return tx.rawData?.source === 'api';
            return (tx.rawData?.fileType || tx.rawData?.file_type) === src;
        }).sort((a, b) => new Date(b.tradeTimestamp).getTime() - new Date(a.tradeTimestamp).getTime());
    };

    // Handle reset
    const handleReset = () => {
        if (onReset) {
            onReset();
            setCurrentStep(0);
            setShowResetConfirm(false);
            toast.success('All data cleared. Start fresh!');
        }
    };

    const activeStep = WIZARD_STEPS[currentStep];
    const stepTxs = getStepTransactions(activeStep.id);

    return (
        <div className="space-y-6">
            {/* ========== HEADER: Progress + Reset ========== */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50">
                <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">
                                Import Data for {fyDates.label}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {fyDates.start} → {fyDates.end} · Follow each step for accurate tax calculation
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-sm px-3 py-1 bg-white font-semibold">
                                {completedSteps}/{WIZARD_STEPS.length} Done
                            </Badge>
                            {onReset && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowResetConfirm(true)}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Reset Confirmation */}
                    {showResetConfirm && (
                        <Alert className="mb-4 border-red-200 bg-red-50">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <AlertDescription className="text-red-700 text-sm flex items-center justify-between">
                                <span>This will clear ALL imported data. Are you sure?</span>
                                <div className="flex gap-2 ml-4">
                                    <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
                                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReset}>
                                        Yes, Reset Everything
                                    </Button>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Step Progress Bar */}
                    <div className="flex items-center gap-1">
                        {WIZARD_STEPS.map((step, i) => {
                            const status = getStepStatus(step.id);
                            const isActive = i === currentStep;
                            return (
                                <React.Fragment key={step.id}>
                                    <button
                                        onClick={() => setCurrentStep(i)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive
                                            ? 'bg-indigo-600 text-white shadow-md scale-105'
                                            : status === 'done'
                                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                : status === 'skipped'
                                                    ? 'bg-slate-100 text-slate-400'
                                                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                                            }`}
                                    >
                                        {status === 'done' ? (
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                        ) : (
                                            <Circle className="h-3.5 w-3.5" />
                                        )}
                                        <span className="hidden sm:inline">{step.label}</span>
                                        <span className="sm:hidden">{i + 1}</span>
                                    </button>
                                    {i < WIZARD_STEPS.length - 1 && (
                                        <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Live Transaction Count */}
                    {parsedTransactions.length > 0 && (
                        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                                {parsedTransactions.length} transactions loaded
                            </span>
                            {Object.entries(sourceBreakdown).map(([src, count]) => (
                                <span key={src}>{src}: {count}</span>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ========== STEP CONTENT ========== */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${getStepStatus(activeStep.id) === 'done'
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-indigo-100 text-indigo-600'
                            }`}>
                            {activeStep.icon}
                        </div>
                        <div>
                            <CardTitle className="text-base">
                                Step {currentStep + 1}: {activeStep.label}
                                {activeStep.isRequired && (
                                    <Badge className="ml-2 bg-red-100 text-red-700 border-red-200 text-[10px]">REQUIRED</Badge>
                                )}
                                {getStepStatus(activeStep.id) === 'done' && (
                                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">✅ DONE</Badge>
                                )}
                            </CardTitle>
                            <CardDescription>{activeStep.description}</CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* ===== STEP 1: API SYNC ===== */}
                    {currentStep === 0 && (
                        <div className="space-y-4">
                            {!apiConnected ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>API Key</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? 'text' : 'password'}
                                                    placeholder="Paste your CoinDCX API key"
                                                    value={apiKey}
                                                    onChange={e => setApiKey(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>API Secret</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiSecret ? 'text' : 'password'}
                                                    placeholder="Paste your CoinDCX API secret"
                                                    value={apiSecret}
                                                    onChange={e => setApiSecret(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowApiSecret(!showApiSecret)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <Alert className="bg-indigo-50 border-indigo-200">
                                        <Info className="h-4 w-4 text-indigo-500" />
                                        <AlertDescription className="text-indigo-700 text-xs">
                                            <strong>How to get your API key:</strong>{' '}
                                            <a href="https://coindcx.com/api-dashboard" target="_blank" rel="noopener noreferrer"
                                                className="underline hover:text-indigo-900 inline-flex items-center gap-1">
                                                coindcx.com → API Dashboard <ExternalLink className="h-3 w-3" />
                                            </a>
                                            {' '}→ Create New Key. Your keys stay in your browser and are encrypted.
                                        </AlertDescription>
                                    </Alert>

                                    <Button
                                        onClick={onApiConnect}
                                        disabled={apiSyncing || !apiKey || !apiSecret}
                                        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                                    >
                                        {apiSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                                        {apiSyncing ? 'Connecting & Syncing...' : `Connect & Fetch All Data for ${fyDates.label}`}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                        <div>
                                            <p className="font-semibold text-emerald-800">CoinDCX Connected</p>
                                            {apiSyncResult && (
                                                <p className="text-sm text-emerald-600">
                                                    {apiSyncResult.summary.totalTransactions} transactions fetched
                                                    {apiSyncResult.summary.uniqueAssets.length > 0 && ` · ${apiSyncResult.summary.uniqueAssets.length} assets`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button onClick={onApiResync} disabled={apiSyncing} variant="outline" size="sm">
                                            <RefreshCw className={`h-4 w-4 mr-2 ${apiSyncing ? 'animate-spin' : ''}`} />
                                            Resync
                                        </Button>
                                        <Button onClick={onDisconnect} variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Disconnect
                                        </Button>
                                    </div>
                                    {/* Show sync diagnostic details */}
                                    {apiSyncResult && apiSyncResult.warnings && apiSyncResult.warnings.length > 0 && (
                                        <details className="mt-3">
                                            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                                                Show sync details ({apiSyncResult.warnings.length} messages)
                                            </summary>
                                            <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs font-mono space-y-1">
                                                {apiSyncResult.warnings.map((w: string, i: number) => (
                                                    <div key={i} className={`${w.includes('❌') || w.includes('Fatal') ? 'text-red-600' : w.includes('⚠️') ? 'text-amber-600' : 'text-slate-600'}`}>
                                                        {w}
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}

                            {/* Sync Progress */}
                            {apiSyncProgress && (
                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="font-medium text-slate-700">{apiSyncProgress.stage}</span>
                                        <span className="text-slate-500">{apiSyncProgress.pctComplete}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                            style={{ width: `${apiSyncProgress.pctComplete}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{apiSyncProgress.detail}</p>
                                </div>
                            )}

                            {/* Show API transactions immediately */}
                            {stepTxs.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-sm font-semibold text-slate-700 mb-2">
                                        ✅ {stepTxs.length} transactions fetched via API
                                    </p>
                                    {renderMiniTable(stepTxs.slice(0, 10), formatCurrency, getSourceBadge, getTypeBadge)}
                                    {stepTxs.length > 10 && (
                                        <p className="text-xs text-slate-400 mt-1 text-center">
                                            + {stepTxs.length - 10} more (visible in Review step)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== STEPS 2-5: CSV UPLOAD ===== */}
                    {currentStep >= 1 && currentStep <= 4 && (
                        <div className="space-y-4">
                            {/* CSV Upload Area */}
                            <div
                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-700">
                                    Click to upload your {activeStep.label}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Accepts .csv files · Date range: {fyDates.start} to {fyDates.end}
                                </p>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="hidden"
                                multiple
                            />

                            {/* FY-specific Download Instructions */}
                            {(() => {
                                const instr = getInstructions(activeStep.id);
                                if (!instr) return null;
                                const isExpanded = expandedInstructions === activeStep.id;
                                return (
                                    <div className="rounded-xl border border-indigo-100 overflow-hidden bg-indigo-50/50">
                                        <button
                                            onClick={() => setExpandedInstructions(isExpanded ? null : activeStep.id)}
                                            className="w-full flex items-center justify-between p-4 text-left hover:bg-indigo-50 transition-colors"
                                        >
                                            <span className="text-sm font-medium text-indigo-700 flex items-center gap-2">
                                                <Info className="h-4 w-4" />
                                                {instr.title}
                                            </span>
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4 text-indigo-400" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4 text-indigo-400" />
                                            )}
                                        </button>

                                        {isExpanded && (
                                            <div className="px-4 pb-4 space-y-2">
                                                {instr.steps.map((step, i) => (
                                                    <div key={i} className="flex items-start gap-3 text-sm">
                                                        <span className="h-6 w-6 rounded-full bg-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                                            {i + 1}
                                                        </span>
                                                        <span className="text-slate-700">{step}</span>
                                                    </div>
                                                ))}
                                                {instr.link && (
                                                    <a
                                                        href={instr.link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        Open CoinDCX
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Status */}
                            {getStepStatus(activeStep.id) === 'done' && (
                                <Alert className="bg-emerald-50 border-emerald-200">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    <AlertDescription className="text-emerald-700 text-sm">
                                        ✅ Uploaded successfully — {stepTxs.length} transactions parsed. You can re-upload to replace.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!activeStep.isRequired && getStepStatus(activeStep.id) === 'pending' && (
                                <Alert className="bg-slate-50 border-slate-200">
                                    <Info className="h-4 w-4 text-slate-500" />
                                    <AlertDescription className="text-slate-600 text-sm">
                                        This step is <strong>optional</strong>. Skip if not applicable.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Show parsed transactions immediately */}
                            {stepTxs.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-sm font-semibold text-slate-700 mb-2">
                                        ✅ {stepTxs.length} transactions from {activeStep.label}
                                    </p>
                                    {renderMiniTable(stepTxs.slice(0, 10), formatCurrency, getSourceBadge, getTypeBadge)}
                                    {stepTxs.length > 10 && (
                                        <p className="text-xs text-slate-400 mt-1 text-center">
                                            + {stepTxs.length - 10} more (visible in Review step)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== STEP 6: REVIEW & EXPORT ===== */}
                    {currentStep === 5 && (
                        <div className="space-y-5">
                            {/* Source Breakdown */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                <Card className="border border-slate-200 shadow-none">
                                    <CardContent className="p-3 text-center">
                                        <p className="text-2xl font-bold text-slate-900">{parsedTransactions.length}</p>
                                        <p className="text-[10px] text-slate-500 font-medium">TOTAL</p>
                                    </CardContent>
                                </Card>
                                {Object.entries(sourceBreakdown).map(([source, count]) => (
                                    <Card key={source} className="border border-slate-200 shadow-none">
                                        <CardContent className="p-3 text-center">
                                            <p className="text-2xl font-bold text-indigo-600">{count}</p>
                                            <p className="text-[10px] text-slate-500 font-medium truncate">{source.toUpperCase()}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Export Buttons */}
                            <div className="flex flex-wrap gap-3">
                                <Button onClick={downloadCombinedCSV} size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={parsedTransactions.length === 0}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download Combined CSV
                                </Button>
                            </div>

                            {/* Filters */}
                            <div className="flex flex-wrap gap-3 items-center">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-slate-400" />
                                    <span className="text-xs text-slate-500 font-medium">Filter:</span>
                                </div>
                                <Select value={filterSource} onValueChange={setFilterSource}>
                                    <SelectTrigger className="w-[140px] h-8 text-xs">
                                        <SelectValue placeholder="Source" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Sources</SelectItem>
                                        <SelectItem value="api">API Sync</SelectItem>
                                        <SelectItem value="trades">Order CSV</SelectItem>
                                        <SelectItem value="tds">TDS CSV</SelectItem>
                                        <SelectItem value="insta">Insta CSV</SelectItem>
                                        <SelectItem value="rewards">Rewards</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-[120px] h-8 text-xs">
                                        <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="buy">Buy</SelectItem>
                                        <SelectItem value="sell">Sell</SelectItem>
                                        <SelectItem value="deposit">Deposit</SelectItem>
                                        <SelectItem value="withdrawal">Withdrawal</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Badge variant="outline" className="text-xs">
                                    {filteredTransactions.length} transactions
                                </Badge>
                            </div>

                            {/* Full Transaction Table */}
                            {filteredTransactions.length > 0 ? (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="text-xs">Date</TableHead>
                                                <TableHead className="text-xs">Source</TableHead>
                                                <TableHead className="text-xs">Type</TableHead>
                                                <TableHead className="text-xs">Asset</TableHead>
                                                <TableHead className="text-xs text-right">Qty</TableHead>
                                                <TableHead className="text-xs text-right">Price (₹)</TableHead>
                                                <TableHead className="text-xs text-right">Value (₹)</TableHead>
                                                <TableHead className="text-xs text-right">TDS (₹)</TableHead>
                                                <TableHead className="text-xs">FY</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTransactions.slice(0, 200).map((tx, i) => {
                                                const srcBadge = getSourceBadge(tx);
                                                return (
                                                    <TableRow key={tx.externalId || i} className="text-xs">
                                                        <TableCell className="text-slate-600 whitespace-nowrap">
                                                            {new Date(tx.tradeTimestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={`text-[10px] ${srcBadge.color}`}>
                                                                {srcBadge.label}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={`text-[10px] ${getTypeBadge(tx.transactionType)}`}>
                                                                {tx.transactionType.toUpperCase()}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-medium text-slate-900">{tx.assetSymbol}</TableCell>
                                                        <TableCell className="text-right text-slate-600 font-mono">
                                                            {tx.quantity < 0.001 ? tx.quantity.toFixed(8) : tx.quantity.toFixed(4)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-slate-600">
                                                            {formatCurrency(tx.priceInr)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium text-slate-900">
                                                            {formatCurrency(tx.grossAmountInr)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-purple-600">
                                                            {tx.tdsAmount > 0 ? formatCurrency(tx.tdsAmount) : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-slate-500">{tx.financialYear}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    {filteredTransactions.length > 200 && (
                                        <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border-t">
                                            Showing 200 of {filteredTransactions.length}. Download CSV for full data.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <Upload className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                                    <p className="font-medium">No transactions imported yet</p>
                                    <p className="text-sm mt-1">Complete steps 1–5 to see your transactions here</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ========== NAVIGATION ========== */}
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                    disabled={currentStep === 0}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Previous
                </Button>

                <div className="text-xs text-slate-500">
                    Step {currentStep + 1} of {WIZARD_STEPS.length}
                </div>

                {currentStep < WIZARD_STEPS.length - 1 ? (
                    <Button
                        onClick={() => setCurrentStep(currentStep + 1)}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {!activeStep.isRequired && getStepStatus(activeStep.id) === 'pending'
                            ? 'Skip & '
                            : ''
                        }
                        Next Step
                        <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                ) : (
                    <Button
                        onClick={downloadCombinedCSV}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={parsedTransactions.length === 0}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export All Transactions
                    </Button>
                )}
            </div>
        </div>
    );
}

// ============= MINI TRANSACTION TABLE (shown after each upload) =============

function renderMiniTable(
    txs: NormalizedTransaction[],
    formatCurrency: (v: number | string | undefined | null) => string,
    getSourceBadge: (tx: NormalizedTransaction) => { label: string; color: string },
    getTypeBadge: (type: string) => string
) {
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50">
                        <TableHead className="text-[10px] py-1.5">Date</TableHead>
                        <TableHead className="text-[10px] py-1.5">Type</TableHead>
                        <TableHead className="text-[10px] py-1.5">Asset</TableHead>
                        <TableHead className="text-[10px] py-1.5 text-right">Qty</TableHead>
                        <TableHead className="text-[10px] py-1.5 text-right">Value (₹)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {txs.map((tx, i) => (
                        <TableRow key={tx.externalId || i} className="text-xs">
                            <TableCell className="text-slate-600 py-1.5 whitespace-nowrap">
                                {new Date(tx.tradeTimestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </TableCell>
                            <TableCell className="py-1.5">
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${getTypeBadge(tx.transactionType)}`}>
                                    {tx.transactionType.toUpperCase()}
                                </Badge>
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 py-1.5">{tx.assetSymbol}</TableCell>
                            <TableCell className="text-right text-slate-600 font-mono py-1.5">
                                {tx.quantity < 0.01 ? tx.quantity.toFixed(6) : tx.quantity.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-900 py-1.5">
                                {formatCurrency(tx.grossAmountInr)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

