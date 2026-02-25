/**
 * TaxMitra — Guided Import Wizard
 * ================================
 * Step-by-step wizard for importing crypto data from CoinDCX.
 * Guides users through the correct sequence:
 *   Step 1: Connect CoinDCX API & Sync
 *   Step 2: Upload Order History CSV
 *   Step 3: Upload TDS Summary CSV
 *   Step 4: Upload Insta History CSV (if applicable)
 *   Step 5: Upload Rewards/Other CSVs
 *   Step 6: Review Combined Data + KoinX Comparison
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
    RefreshCw, AlertTriangle, ArrowRight, ArrowLeft, ChevronRight,
    Download, Trash2, Info, Shield, Clock, FileCheck, Receipt,
    ExternalLink, Search, Filter
} from 'lucide-react';
import { toast } from 'sonner';

import type { NormalizedTransaction, TDSRecord } from '@/lib/taxmitra';
import type { FYChecklist, DataSourceType } from '@/lib/taxmitra/coverage-tracker';
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
    // Data
    parsedTransactions: NormalizedTransaction[];
    parsedTDSRecords: TDSRecord[];
    checklist: FYChecklist | null;
    selectedFY: string;

    // CoinDCX API state
    apiKey: string;
    apiSecret: string;
    apiConnected: boolean;
    apiSyncing: boolean;
    apiSyncProgress: SyncProgress | null;
    apiSyncResult: FullSyncResult | null;

    // Setters
    setApiKey: (v: string) => void;
    setApiSecret: (v: string) => void;

    // Handlers
    onApiConnect: () => Promise<void>;
    onApiResync: () => Promise<void>;
    onCsvUpload: (files: FileList, fileType?: string) => Promise<void>;
    onDisconnect: () => void;

    // Formatting
    formatCurrency: (v: number | string | undefined | null) => string;
}

// ============= WIZARD STEPS =============

const WIZARD_STEPS: WizardStep[] = [
    {
        id: 'api',
        label: 'CoinDCX API Sync',
        description: 'Connect your CoinDCX API to fetch all spot trades, deposits, and withdrawals automatically.',
        source: 'api_sync',
        isRequired: false,
        icon: <Zap className="h-5 w-5" />,
    },
    {
        id: 'order_csv',
        label: 'Order History CSV',
        description: 'Upload your CoinDCX order history (filled orders). This is the PRIMARY source for buy/sell trades.',
        source: 'order_history_csv',
        isRequired: true,
        icon: <FileSpreadsheet className="h-5 w-5" />,
    },
    {
        id: 'tds_csv',
        label: 'TDS Summary CSV',
        description: 'Upload TDS Summary — this captures ALL sell events including Insta and P2P trades with accurate TDS amounts.',
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
        description: 'Upload staking rewards, airdrops, interest CSV. Or add manually using "+ Add Trade".',
        source: 'rewards_csv',
        isRequired: false,
        icon: <FileCheck className="h-5 w-5" />,
    },
    {
        id: 'review',
        label: 'Review & Compare',
        description: 'Review all imported transactions side by side with source labels for KoinX comparison.',
        source: null,
        isRequired: false,
        icon: <Search className="h-5 w-5" />,
    },
];

// ============= HELPER: How to download instructions =============

const DOWNLOAD_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
    order_csv: {
        title: 'How to download Order History CSV from CoinDCX',
        steps: [
            'Go to coindcx.com → Login',
            'Click "Orders" in the top menu',
            'Select "Order History" tab',
            'Click "FILLED ORDERS" filter',
            'Set date range: 1 April 2024 → 31 March 2025 (or your FY)',
            'Click "Download CSV" button',
            'Upload the downloaded file here',
        ],
    },
    tds_csv: {
        title: 'How to download TDS Summary CSV from CoinDCX',
        steps: [
            'Go to coindcx.com → Login',
            'Click your Profile icon → "Reports"',
            'Select "TDS Summary"',
            'Choose your Financial Year (e.g. FY 2024-25)',
            'Click "Export CSV"',
            'Upload the downloaded file here',
        ],
    },
    insta_csv: {
        title: 'How to download Insta History CSV from CoinDCX',
        steps: [
            'Go to coindcx.com → Login',
            'Click "Orders" → "Insta History"',
            'Set date range for your FY',
            'Click "Download" or "Export CSV"',
            'Upload the downloaded file here',
        ],
    },
    rewards: {
        title: 'How to find your Rewards & Staking data',
        steps: [
            'CoinDCX does NOT provide a rewards CSV download',
            'Check your email for "CoinDCX reward credited" notifications',
            'Use "+ Add Trade" → select "Staking Reward" or "Airdrop"',
            'Enter the asset, quantity, date, and value from each email',
            'Or check CoinDCX App → "Earn" section for staking details',
        ],
    },
};

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
    formatCurrency,
}: GuidedImportWizardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);
    const [showInstructions, setShowInstructions] = useState<string | null>(null);
    const [filterSource, setFilterSource] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get step completion status from checklist
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

    // Count completed steps
    const completedSteps = useMemo(() =>
        WIZARD_STEPS.filter(s => getStepStatus(s.id) === 'done').length,
        [getStepStatus]
    );

    // Transaction source breakdown
    const sourceBreakdown = useMemo(() => {
        const breakdown: Record<string, number> = {};
        for (const tx of parsedTransactions) {
            const src = tx.rawData?.source === 'api' ? 'API Sync' :
                tx.rawData?.fileType === 'trades' || tx.rawData?.file_type === 'trades' ? 'Order History CSV' :
                    tx.rawData?.fileType === 'tds' || tx.rawData?.file_type === 'tds' ? 'TDS Summary CSV' :
                        tx.rawData?.fileType === 'insta' || tx.rawData?.file_type === 'insta' ? 'Insta History CSV' :
                            tx.rawData?.fileType === 'rewards' || tx.rawData?.file_type === 'rewards' ? 'Rewards CSV' :
                                tx.description?.includes('Manual') ? 'Manual' :
                                    'Other';
            breakdown[src] = (breakdown[src] || 0) + 1;
        }
        return breakdown;
    }, [parsedTransactions]);

    // Filtered transactions for the review step
    const filteredTransactions = useMemo(() => {
        let txs = [...parsedTransactions];

        // Filter by source
        if (filterSource !== 'all') {
            txs = txs.filter(tx => {
                const src = tx.rawData?.source === 'api' ? 'api' :
                    (tx.rawData?.fileType || tx.rawData?.file_type || 'other');
                return src === filterSource;
            });
        }

        // Filter by type
        if (filterType !== 'all') {
            txs = txs.filter(tx => tx.transactionType === filterType);
        }

        // Sort by date descending
        txs.sort((a, b) => new Date(b.tradeTimestamp).getTime() - new Date(a.tradeTimestamp).getTime());

        return txs;
    }, [parsedTransactions, filterSource, filterType]);

    // Get source badge for a transaction
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
        if (type.startsWith('reward') || type === 'airdrop' || type === 'staking_reward') return 'bg-purple-50 text-purple-700 border-purple-200';
        if (type === 'deposit') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (type === 'withdrawal') return 'bg-orange-50 text-orange-700 border-orange-200';
        return 'bg-slate-50 text-slate-600 border-slate-200';
    };

    // CSV upload handler for a specific step
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await onCsvUpload(e.target.files);
        }
        // Reset the input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Download combined CSV for KoinX comparison
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
        a.download = `TaxMitra_Combined_Transactions_FY${selectedFY}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${parsedTransactions.length} transactions to CSV`);
    };

    return (
        <div className="space-y-6">
            {/* Progress Header */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-purple-50">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Import Data — Step by Step</h2>
                            <p className="text-sm text-slate-500">Follow each step to ensure complete & accurate tax calculation</p>
                        </div>
                        <Badge variant="outline" className="text-sm px-3 py-1 bg-white">
                            {completedSteps}/{WIZARD_STEPS.length} Complete
                        </Badge>
                    </div>

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
                </CardContent>
            </Card>

            {/* Current Step Content */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${getStepStatus(WIZARD_STEPS[currentStep].id) === 'done'
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-indigo-100 text-indigo-600'
                            }`}>
                            {WIZARD_STEPS[currentStep].icon}
                        </div>
                        <div>
                            <CardTitle className="text-base">
                                Step {currentStep + 1}: {WIZARD_STEPS[currentStep].label}
                                {WIZARD_STEPS[currentStep].isRequired && (
                                    <Badge className="ml-2 bg-red-100 text-red-700 border-red-200 text-[10px]">REQUIRED</Badge>
                                )}
                                {getStepStatus(WIZARD_STEPS[currentStep].id) === 'done' && (
                                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">✅ DONE</Badge>
                                )}
                            </CardTitle>
                            <CardDescription>{WIZARD_STEPS[currentStep].description}</CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Step 1: API Sync */}
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
                                            <strong>How to get your API key:</strong> coindcx.com → API Dashboard → Create New Key.
                                            Your keys stay in your browser — we never send them to our servers.
                                        </AlertDescription>
                                    </Alert>

                                    <Button
                                        onClick={onApiConnect}
                                        disabled={apiSyncing || !apiKey || !apiSecret}
                                        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                                    >
                                        {apiSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                                        {apiSyncing ? 'Connecting & Syncing...' : 'Connect & Fetch All Data'}
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
                        </div>
                    )}

                    {/* Steps 2-5: CSV Upload */}
                    {currentStep >= 1 && currentStep <= 4 && (
                        <div className="space-y-4">
                            {/* CSV Upload Area */}
                            <div
                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-700">
                                    Click to upload or drag & drop your CSV file
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Accepts .csv files from CoinDCX
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

                            {/* How-to Instructions */}
                            {DOWNLOAD_INSTRUCTIONS[WIZARD_STEPS[currentStep].id] && (
                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={() => setShowInstructions(
                                            showInstructions === WIZARD_STEPS[currentStep].id ? null : WIZARD_STEPS[currentStep].id
                                        )}
                                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-indigo-600 flex items-center gap-2">
                                            <Info className="h-4 w-4" />
                                            {DOWNLOAD_INSTRUCTIONS[WIZARD_STEPS[currentStep].id].title}
                                        </span>
                                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showInstructions === WIZARD_STEPS[currentStep].id ? 'rotate-90' : ''
                                            }`} />
                                    </button>

                                    {showInstructions === WIZARD_STEPS[currentStep].id && (
                                        <div className="px-4 pb-4 space-y-2">
                                            {DOWNLOAD_INSTRUCTIONS[WIZARD_STEPS[currentStep].id].steps.map((step, i) => (
                                                <div key={i} className="flex items-start gap-3 text-sm">
                                                    <span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                                        {i + 1}
                                                    </span>
                                                    <span className="text-slate-600">{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Status */}
                            {getStepStatus(WIZARD_STEPS[currentStep].id) === 'done' && (
                                <Alert className="bg-emerald-50 border-emerald-200">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    <AlertDescription className="text-emerald-700 text-sm">
                                        ✅ This data source has been uploaded successfully. You can re-upload to replace.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!WIZARD_STEPS[currentStep].isRequired && getStepStatus(WIZARD_STEPS[currentStep].id) === 'pending' && (
                                <Alert className="bg-slate-50 border-slate-200">
                                    <Info className="h-4 w-4 text-slate-500" />
                                    <AlertDescription className="text-slate-600 text-sm">
                                        This step is <strong>optional</strong>. Skip it if you don't have this data or it's not applicable.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Step 6: Review & Compare */}
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

                            {/* Download Combined CSV */}
                            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                                <div>
                                    <p className="text-sm font-semibold text-indigo-900">Download Combined Transaction File</p>
                                    <p className="text-xs text-indigo-600">Export all {parsedTransactions.length} transactions as CSV for comparison with KoinX</p>
                                </div>
                                <Button onClick={downloadCombinedCSV} size="sm" className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
                                    <Download className="h-4 w-4 mr-2" />
                                    Download CSV
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

                            {/* Combined Transaction Table */}
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
                                            Showing 200 of {filteredTransactions.length} transactions. Download CSV for full list.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-500">
                                    <Search className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                                    <p>No transactions imported yet. Complete steps 1-5 first.</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Navigation */}
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
                        {!WIZARD_STEPS[currentStep].isRequired && getStepStatus(WIZARD_STEPS[currentStep].id) === 'pending'
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
                        Export for KoinX Compare
                    </Button>
                )}
            </div>
        </div>
    );
}
