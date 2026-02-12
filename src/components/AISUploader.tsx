import { useState, useCallback } from 'react';
import {
    Upload, FileText, CheckCircle2, AlertTriangle, Loader2,
    RefreshCw, XCircle, ArrowRight, FileCheck, Shield, Eye, Lock, Globe
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { useToast } from '../hooks/use-toast';
import { extractTextFromPDF, detectDocumentType } from '../lib/pdf-extractor';
import {
    parseAISJson, reconcileWithITR,
    AISData, ReconciliationResult, getAutoFillSuggestions
} from '../lib/ais-parser';
import { formatINR } from '../lib/validators';
import { DEMO_AIS_DATA } from '../lib/ais-mock-data';

interface AISUploaderProps {
    /** User-entered ITR data for reconciliation */
    itrData?: {
        salary?: number;
        interest?: number;
        dividend?: number;
        rentalIncome?: number;
        capitalGains?: number;
        businessIncome?: number;
        otherSources?: number;
        tdsSalary?: number;
        tdsInterest?: number;
        tdsDividend?: number;
        tdsOther?: number;
    };
    onAutoFill?: (suggestions: ReturnType<typeof getAutoFillSuggestions>) => void;
}

type UploadStatus = 'idle' | 'processing' | 'parsed' | 'reconciled' | 'error';

export default function AISUploader({ itrData, onAutoFill }: AISUploaderProps) {
    const { toast } = useToast();
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [aisData, setAisData] = useState<AISData | null>(null);
    const [reconciliation, setReconciliation] = useState<ReconciliationResult[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [uploadType, setUploadType] = useState<'json' | 'pdf'>('json');

    // Password Handling State
    const [passwordRequired, setPasswordRequired] = useState(false);
    const [pdfPassword, setPdfPassword] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        setStatus('processing');

        try {
            let parsedAIS: AISData;

            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                // JSON file from IT portal
                setUploadType('json');
                const text = await file.text();
                let jsonData;
                try {
                    jsonData = JSON.parse(text);
                } catch (e) {
                    throw new Error('This JSON file is encrypted for the Income Tax Utility. Please download and upload the "AIS PDF" or "TIS PDF" instead—I have updated my tool to read those formats accurately.');
                }

                // Handle potential wrapper structures found in some downloads
                if (!jsonData.pan && jsonData.AnnualInformationStatement) {
                    jsonData = jsonData.AnnualInformationStatement;
                }

                parsedAIS = parseAISJson(jsonData);
            } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                // PDF file — extract and attempt to parse
                setUploadType('pdf');

                // If password was already provided (retry), use it
                const currentPassword = (file === pendingFile) ? pdfPassword : undefined;

                const pdfResult = await extractTextFromPDF(file, currentPassword);
                const docType = detectDocumentType(pdfResult.text);

                if (docType === 'form16') {
                    setError('This appears to be a Form 16, not AIS. Please use the Form 16 uploader.');
                    setStatus('error');
                    return;
                }

                // Try to extract structured data from PDF text
                // AIS PDFs have structured tables that we can parse
                const extractedData = extractAISFromPDFText(pdfResult.text);
                parsedAIS = parseAISJson(extractedData);
                if (pdfResult.isImageBased) {
                    parsedAIS.warnings.push('PDF appears to be scanned. For best results, download the JSON from the IT portal.');
                }
            } else {
                setError('Please upload a JSON or PDF file from the Income Tax portal.');
                setStatus('error');
                return;
            }

            setAisData(parsedAIS);
            setStatus('parsed');

            // Auto-reconcile if ITR data is provided
            if (itrData && Object.values(itrData).some(v => (v || 0) > 0)) {
                const results = reconcileWithITR(parsedAIS, itrData);
                setReconciliation(results);
                setStatus('reconciled');
            }

            toast({
                title: '✅ AIS Data Imported',
                description: `${parsedAIS.records.length} records found | TDS: ${formatINR(parsedAIS.totalTDSCredited)}`,
            });

        } catch (err: any) {
            if (err.message === 'PASSWORD_REQUIRED') {
                setPasswordRequired(true);
                setPendingFile(file);
                setStatus('idle'); // Keep UI interactive but show password prompt
                return;
            }

            setStatus('error');
            setError(err.message || 'Failed to parse AIS data.');

            // Clear password state on error
            setPasswordRequired(false);
            setPdfPassword('');
            setPendingFile(null);
        }
    }, [itrData, toast, pendingFile, pdfPassword]);

    const handlePasswordSubmit = () => {
        if (pendingFile && pdfPassword) {
            setPasswordRequired(false);
            handleFile(pendingFile);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDemoLoad = () => {
        setStatus('processing');
        setTimeout(() => {
            setAisData(DEMO_AIS_DATA);
            setStatus('parsed');

            if (itrData && Object.values(itrData).some(v => (v || 0) > 0)) {
                const results = reconcileWithITR(DEMO_AIS_DATA, itrData);
                setReconciliation(results);
                setStatus('reconciled');
            }

            toast({
                title: '🧪 Demo Mode',
                description: 'Loaded sample AIS data for testing.',
            });
        }, 800);
    };

    const handleAutoFill = () => {
        if (aisData && onAutoFill) {
            const suggestions = getAutoFillSuggestions(aisData);
            onAutoFill(suggestions);
            toast({
                title: '✅ Auto-Fill Applied',
                description: 'Income and TDS values from AIS have been populated in your ITR.',
            });
        }
    };

    const runReconciliation = () => {
        if (aisData && itrData) {
            const results = reconcileWithITR(aisData, itrData);
            setReconciliation(results);
            setStatus('reconciled');
        }
    };

    const reset = () => {
        setStatus('idle');
        setError(null);
        setAisData(null);
        setReconciliation([]);
        setPasswordRequired(false);
        setPdfPassword('');
        setPendingFile(null);
    };

    return (
        <div className="space-y-4">
            <Card className="border-2 border-dashed border-gray-200 hover:border-blue-200 transition-colors">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Shield className="h-5 w-5 text-blue-600" />
                        AIS / TIS Reconciliation
                    </CardTitle>
                    <CardDescription>
                        Upload your Annual Information Statement (AIS) from the Income Tax portal to auto-verify income and TDS
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Upload Area */}
                    {status === 'idle' && !passwordRequired && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center text-xs text-gray-500 mb-3">
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <FileText className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                                    <p className="font-medium text-blue-700">JSON (Recommended)</p>
                                    <p>Download from e-Filing portal → AIS tab</p>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-100 transition-colors" onClick={() => window.open('https://eportal.incometax.gov.in/iec/foservices/#/login', '_blank')}>
                                    <Globe className="h-5 w-5 text-purple-600 mx-auto mb-1" />
                                    <p className="font-medium text-purple-700">Live Fetch (Portal)</p>
                                    <p>Login to IT Portal to auto-download</p>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <FileText className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                                    <p className="font-medium text-gray-700">PDF</p>
                                    <p>Password-protected AIS or 26AS</p>
                                </div>
                            </div>

                            <div
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                    }`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => document.getElementById('ais-file-input')?.click()}
                            >
                                <Upload className={`h-10 w-10 mx-auto mb-2 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
                                <p className="text-sm font-medium text-gray-700">Drop your AIS file here</p>
                                <p className="text-xs text-gray-400 mt-1">JSON or PDF • Downloaded from IT Portal</p>
                                <input
                                    id="ais-file-input"
                                    type="file"
                                    accept=".json,.pdf,application/json,application/pdf"
                                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                                    className="hidden"
                                />
                            </div>

                            <div className="mt-2 text-center">
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={handleDemoLoad}
                                    className="text-xs text-indigo-400 hover:text-indigo-600 h-auto p-0"
                                >
                                    Don't have a file? Use Sample Data
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Password Prompt */}
                    {passwordRequired && (
                        <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-center animate-in fade-in zoom-in duration-300">
                            <div className="h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <Lock className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900">Password Required</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    The uploaded PDF is password protected. <br />
                                    Usually, passing is your PAN (lowercase) + DOB (DDMMYYYY).
                                </p>
                            </div>
                            <div className="flex gap-2 max-w-xs mx-auto">
                                <input
                                    type="password"
                                    placeholder="Enter PDF Password"
                                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={pdfPassword}
                                    onChange={(e) => setPdfPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                                    autoFocus
                                />
                                <Button onClick={handlePasswordSubmit} disabled={!pdfPassword}>
                                    Unlock
                                </Button>
                            </div>
                            <Button variant="link" size="sm" onClick={reset} className="text-slate-500">
                                Cancel Upload
                            </Button>
                        </div>
                    )}

                    {/* Processing */}
                    {status === 'processing' && (
                        <div className="flex items-center gap-3 py-6 justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                            <span className="text-sm font-medium text-gray-700">Parsing {uploadType.toUpperCase()} data...</span>
                        </div>
                    )}

                    {/* Error */}
                    {status === 'error' && (
                        <div className="space-y-3">
                            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-lg">
                                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-red-800">{error}</p>
                                    <p className="text-xs text-red-600 mt-1">
                                        Download AIS from: incometax.gov.in → e-File → Income Tax Returns → AIS
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                                <RefreshCw className="h-4 w-4" /> Try Again
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* AIS Summary */}
            {aisData && (status === 'parsed' || status === 'reconciled') && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <FileCheck className="h-4 w-4 text-blue-600" />
                                AIS Summary — AY {aisData.assessmentYear}
                            </CardTitle>
                            <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                                {aisData.records.length} Records
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Income Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <SummaryBox label="Salary" value={aisData.incomeDetails.salary} />
                            <SummaryBox label="Interest" value={aisData.incomeDetails.interest} />
                            <SummaryBox label="Dividend" value={aisData.incomeDetails.dividend} />
                            <SummaryBox label="Capital Gains" value={aisData.incomeDetails.capitalGains} />
                            <SummaryBox label="Total TDS" value={aisData.totalTDSCredited} highlight />
                            <SummaryBox label="Total Income" value={aisData.totalIncome} highlight />
                        </div>

                        {/* SFT Summary */}
                        {(aisData.sftTransactions.savingsDeposits > 0 ||
                            aisData.sftTransactions.mutualFundPurchases > 0 ||
                            aisData.sftTransactions.shareTransactions > 0) && (
                                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                                    <h4 className="text-xs font-semibold text-amber-800 mb-2">Specified Financial Transactions (SFT)</h4>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        {aisData.sftTransactions.savingsDeposits > 0 && (
                                            <div><span className="text-amber-600">Savings:</span> {formatINR(aisData.sftTransactions.savingsDeposits)}</div>
                                        )}
                                        {aisData.sftTransactions.mutualFundPurchases > 0 && (
                                            <div><span className="text-amber-600">MF:</span> {formatINR(aisData.sftTransactions.mutualFundPurchases)}</div>
                                        )}
                                        {aisData.sftTransactions.shareTransactions > 0 && (
                                            <div><span className="text-amber-600">Shares:</span> {formatINR(aisData.sftTransactions.shareTransactions)}</div>
                                        )}
                                    </div>
                                </div>
                            )}

                        {/* Warnings */}
                        {aisData.warnings.length > 0 && (
                            <div className="space-y-1">
                                {aisData.warnings.map((w, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2 border border-amber-100">
                                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                        {w}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                            {onAutoFill && (
                                <Button size="sm" onClick={handleAutoFill} className="bg-blue-600 hover:bg-blue-700 gap-1">
                                    <ArrowRight className="h-4 w-4" /> Auto-Fill ITR from AIS
                                </Button>
                            )}
                            {itrData && status !== 'reconciled' && (
                                <Button variant="outline" size="sm" onClick={runReconciliation} className="gap-1">
                                    <Eye className="h-4 w-4" /> Run Reconciliation
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                                <RefreshCw className="h-4 w-4" /> Upload New
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Reconciliation Results */}
            {status === 'reconciled' && reconciliation.length > 0 && (
                <Card className="border-l-4 border-l-indigo-600">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Shield className="h-4 w-4 text-indigo-600" />
                            Reconciliation Report
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Comparing AIS data with your ITR entries
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {reconciliation.map((item, i) => (
                                <ReconciliationRow key={i} item={item} />
                            ))}
                        </div>

                        {/* Summary */}
                        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
                            <div>
                                <p className="text-2xl font-bold text-emerald-600">
                                    {reconciliation.filter(r => r.status === 'matched').length}
                                </p>
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Matched</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-600">
                                    {reconciliation.filter(r => r.status === 'discrepancy').length}
                                </p>
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Discrepancies</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-red-600">
                                    {reconciliation.filter(r => r.status.startsWith('missing')).length}
                                </p>
                                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Missing</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function SummaryBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
    return (
        <div className={`rounded-lg p-3 ${highlight ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'} border text-center`}>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-base font-bold mt-1 ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
                {formatINR(value)}
            </p>
        </div>
    );
}

function ReconciliationRow({ item }: { item: ReconciliationResult }) {
    const statusColors: Record<string, string> = {
        matched: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        discrepancy: 'bg-amber-50 border-amber-200 text-amber-700',
        missing_in_itr: 'bg-red-50 border-red-200 text-red-700',
        missing_in_ais: 'bg-blue-50 border-blue-200 text-blue-700',
    };

    const statusIcons: Record<string, React.ReactNode> = {
        matched: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
        discrepancy: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        missing_in_itr: <XCircle className="h-4 w-4 text-red-500" />,
        missing_in_ais: <AlertTriangle className="h-4 w-4 text-blue-500" />,
    };

    const statusLabels: Record<string, string> = {
        matched: 'Matched',
        discrepancy: 'Discrepancy',
        missing_in_itr: 'Missing in ITR',
        missing_in_ais: 'Not in AIS',
    };

    return (
        <div className={`p-3 rounded-lg border ${statusColors[item.status] || 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    {statusIcons[item.status]}
                    <span className="text-sm font-medium">{item.category}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                    {statusLabels[item.status] || item.status}
                </Badge>
            </div>
            <div className="flex justify-between text-xs mt-2">
                <span>AIS: {formatINR(item.aisValue)}</span>
                <span>ITR: {formatINR(item.itrValue)}</span>
                {item.difference > 0 && <span className="font-medium">Diff: {formatINR(item.difference)}</span>}
            </div>
            {item.status !== 'matched' && (
                <p className="text-xs mt-2 opacity-80">{item.recommendation}</p>
            )}
        </div>
    );
}

/**
 * Parse an Indian-format number like "5,30,123" or "1,08,016" or "10740" or "96,617"
 * Returns 0 if not a valid number.
 */
function parseIndianNumber(raw: string): number {
    if (!raw) return 0;
    // Remove all spaces, then remove commas
    const cleaned = raw.replace(/\s/g, '').replace(/,/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
}

/**
 * Extract ALL numbers from a text string, handling Indian number formats.
 * Returns an array of { value, index } objects.
 */
function extractAllNumbers(text: string): { value: number; raw: string }[] {
    // Match Indian-style numbers: optional commas, at least one digit
    // Patterns: 5,30,123  |  1,08,016  |  10740  |  96,617  |  10  |  0
    const regex = /(?<!\d)(\d{1,3}(?:,\d{2,3})*(?:,\d{3})*|\d+)(?:\.\d+)?(?!\d)/g;
    const results: { value: number; raw: string }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const val = parseIndianNumber(match[0]);
        results.push({ value: val, raw: match[0] });
    }
    return results;
}

/**
 * Extract structured data from AIS PDF text
 * Handles the tabular format of AIS PDFs from the Income Tax portal.
 *
 * Strategy:
 * 1. Extract PAN and Assessment Year from header
 * 2. Detect section headers (e.g. "TDS 194S", "TDS 192", "194A") to determine context
 * 3. For each section header row, extract the AMOUNT (last large number on the line)
 * 4. Parse individual transaction sub-rows (dates, amounts, TDS deducted/deposited)
 * 5. Aggregate totals per section
 */
function extractAISFromPDFText(text: string): Record<string, any> {
    const data: Record<string, any> = {
        tdsSalary: [],
        tdsInterest: [],
        tdsDividend: [],
        vdaTransactions: [],
        mutualFundTransactions: [],
        sftShares: [],
        propertyTransactions: [],
        pan: '',
        assessmentYear: '',
        financialYear: '',
    };

    console.log('[AIS Parser] Raw text length:', text.length);
    console.log('[AIS Parser] First 500 chars:', text.substring(0, 500));

    // 1. Extract identity info
    const panMatch = text.match(/(?:Permanent Account Number|PAN)[^A-Z]*([A-Z]{5}\d{4}[A-Z])/i);
    if (panMatch) data.pan = panMatch[1];

    const ayMatch = text.match(/Assessment\s*Year\s*(\d{4}-\d{2,4})/i);
    if (ayMatch) data.assessmentYear = ayMatch[1];

    const fyMatch = text.match(/Financial\s*Year\s*(\d{4}-\d{2,4})/i);
    if (fyMatch) data.financialYear = fyMatch[1];

    // 2. Split into lines and process
    const lines = text.split('\n');
    let currentSection = ''; // Tracks what TDS section we are in
    let sectionTotalAmount = 0;
    let sectionTotalTDS = 0;
    let transactionRows: any[] = [];

    // Helper: determine if a line is a section header
    // AIS section headers typically contain "TDS 194S", "TDS 192", etc.
    const detectSection = (line: string): string | null => {
        const upper = line.toUpperCase();
        // Order matters — check more specific patterns first
        if (upper.includes('194S') && (upper.includes('VIRTUAL DIGITAL') || upper.includes('TDS') || upper.includes('TRANSFER'))) return 'VDA';
        if (upper.includes('TDS 194S') || (upper.includes('194S') && !upper.includes('194' + 'A'))) return 'VDA';
        if (upper.includes('192') && (upper.includes('SALARY') || upper.includes('TDS'))) return 'SALARY';
        if (upper.includes('TDS 192') || upper.includes('SECTION 192') || upper.includes('SEC 192')) return 'SALARY';
        if (upper.includes('194A') && (upper.includes('INTEREST') || upper.includes('TDS'))) return 'INTEREST';
        if (upper.includes('194K') && upper.includes('DIVIDEND')) return 'DIVIDEND';
        if (upper.includes('194') && upper.includes('DIVIDEND')) return 'DIVIDEND';
        if (upper.includes('MUTUAL FUND') || upper.includes('UNITS OF MF')) return 'MF';
        if (/SFT.?0?17|SFT.?0?18|SALE OF SECURITIES/i.test(line)) return 'SHARES';
        if (upper.includes('PROPERTY') && (upper.includes('PURCHASE') || upper.includes('SALE'))) return 'PROPERTY';
        return null;
    };

    // Helper: determine if a line looks like a transaction detail row
    // Transaction rows have dates like DD/MM/YYYY and multiple numbers
    const isTransactionRow = (line: string): boolean => {
        const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(line);
        const hasQuarter = /Q[1-4]/i.test(line);
        const numbers = extractAllNumbers(line);
        // A transaction row has a date + at least 2 numbers (amount + TDS)
        return (hasDate || hasQuarter) && numbers.length >= 2;
    };

    // Process line by line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length < 3) continue;

        // Check for section header
        const section = detectSection(line);
        if (section) {
            // Before switching sections, flush any pending data from previous section
            if (currentSection && (sectionTotalAmount > 0 || transactionRows.length > 0)) {
                flushSection(data, currentSection, sectionTotalAmount, sectionTotalTDS, transactionRows);
            }

            currentSection = section;
            sectionTotalAmount = 0;
            sectionTotalTDS = 0;
            transactionRows = [];

            // Try to extract the summary amount from the section header line
            // The header line often ends with COUNT and AMOUNT, e.g.: "... 10    5,30,123"
            const numbers = extractAllNumbers(line);
            // Filter out years (2024, 2025, 2026) and serial numbers (single digits)
            const meaningfulNumbers = numbers.filter(n =>
                n.value > 50 &&
                !(n.value >= 2020 && n.value <= 2030) &&
                !(n.value >= 190 && n.value <= 200) // Exclude section numbers like 192, 194
            );
            if (meaningfulNumbers.length > 0) {
                // The last meaningful number is typically the total AMOUNT
                sectionTotalAmount = meaningfulNumbers[meaningfulNumbers.length - 1].value;
                // If there's more than one, the second-to-last might be COUNT
            }

            console.log(`[AIS Parser] Section detected: ${section}, line: "${line.substring(0, 80)}", amount: ${sectionTotalAmount}`);
            continue;
        }

        // If we're in a section, check for transaction detail rows
        if (currentSection && isTransactionRow(line)) {
            const numbers = extractAllNumbers(line);
            // Filter out years, section numbers and SR NO
            const amounts = numbers.filter(n =>
                n.value > 50 &&
                !(n.value >= 2020 && n.value <= 2030)
            );

            if (amounts.length >= 1) {
                // For VDA/Crypto rows: AMOUNT PAID/CREDITED, TDS DEDUCTED, TDS DEPOSITED
                // The first meaningful amount is usually the transaction amount
                // TDS values follow
                const txn: any = {
                    amount: amounts[0]?.value || 0,
                    tdsDeducted: amounts.length >= 2 ? amounts[1].value : 0,
                    tdsDeposited: amounts.length >= 3 ? amounts[2].value : 0,
                    date: '',
                    status: 'Active',
                };

                // Extract date
                const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (dateMatch) txn.date = dateMatch[1];

                // Extract quarter
                const quarterMatch = line.match(/Q([1-4])\s*\(/i);
                if (quarterMatch) txn.quarter = `Q${quarterMatch[1]}`;

                // Check status
                if (/inactive/i.test(line)) txn.status = 'Inactive';

                transactionRows.push(txn);
            }
            continue;
        }

        // Even outside a detected section, look at the line for section-level data
        // This catches cases when the section header detection missed it
        // e.g. lines like "Amount received on transfer of virtual digital asset"
        const upper = line.toUpperCase();
        if (!currentSection) {
            if (upper.includes('VIRTUAL DIGITAL ASSET') || upper.includes('194S')) {
                currentSection = 'VDA';
                const numbers = extractAllNumbers(line);
                const meaningful = numbers.filter(n => n.value > 100 && !(n.value >= 2020 && n.value <= 2030));
                if (meaningful.length > 0) sectionTotalAmount = meaningful[meaningful.length - 1].value;
                console.log(`[AIS Parser] Late section detect: VDA, amount: ${sectionTotalAmount}`);
            }
        }
    }

    // Flush the last section
    if (currentSection && (sectionTotalAmount > 0 || transactionRows.length > 0)) {
        flushSection(data, currentSection, sectionTotalAmount, sectionTotalTDS, transactionRows);
    }

    // If we still couldn't parse sections, try a last-resort global scan
    if (data.tdsSalary.length === 0 && data.tdsInterest.length === 0 &&
        data.vdaTransactions.length === 0 && data.tdsDividend.length === 0) {
        console.log('[AIS Parser] Section-based parsing found nothing, trying global scan...');
        globalScanFallback(text, data);
    }

    console.log('[AIS Parser] Final parsed data:', JSON.stringify(data, null, 2));
    return data;
}

/**
 * Flush accumulated section data into the result object
 */
function flushSection(
    data: Record<string, any>,
    section: string,
    totalAmount: number,
    totalTDS: number,
    rows: any[]
) {
    // Calculate totals from individual rows if we have them
    const rowTotal = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
    const rowTDS = rows.reduce((sum, r) => sum + (r.tdsDeducted || 0), 0);

    // Use whichever is larger — section header total or sum of rows
    const bestAmount = Math.max(totalAmount, rowTotal);
    const bestTDS = Math.max(totalTDS, rowTDS);

    // Determine the source name from rows if available
    const sourceName = rows[0]?.sourceName || 'From AIS';

    console.log(`[AIS Parser] Flushing section ${section}: amount=${bestAmount}, tds=${bestTDS}, rows=${rows.length}`);

    switch (section) {
        case 'SALARY':
            data.tdsSalary.push({
                grossSalary: bestAmount,
                deductorName: 'Employer (from AIS)',
                tdsAmount: bestTDS
            });
            break;
        case 'INTEREST':
            data.tdsInterest.push({
                grossAmount: bestAmount,
                deductorName: 'Bank (from AIS)',
                tdsAmount: bestTDS
            });
            break;
        case 'DIVIDEND':
            data.tdsDividend.push({
                income: bestAmount,
                companyName: 'Company (from AIS)',
                tdsAmount: bestTDS
            });
            break;
        case 'VDA':
            data.vdaTransactions.push({
                saleValue: bestAmount,
                tokenName: 'Crypto/VDA (from AIS)',
                tdsAmount: bestTDS,
                transactionCount: rows.length || 1,
                transactions: rows
            });
            break;
        case 'MF':
            data.mutualFundTransactions.push({
                amount: bestAmount,
                fundName: 'Mutual Fund (from AIS)'
            });
            break;
        case 'SHARES':
            data.sftShares.push({
                saleValue: bestAmount,
                stockName: 'Share Transaction (from AIS)'
            });
            break;
        case 'PROPERTY':
            data.propertyTransactions.push({
                saleValue: bestAmount,
                description: 'Property (from AIS)'
            });
            break;
    }
}

/**
 * Global fallback scan: if section-based parsing failed, look for key patterns anywhere in the text
 */
function globalScanFallback(text: string, data: Record<string, any>) {
    const upper = text.toUpperCase();

    // Look for VDA / Crypto
    // Pattern: "194S" followed eventually by a large number
    const vdaMatch = text.match(/194S[\s\S]{0,500}?(?:AMOUNT|COUNT)\s*[\s\S]{0,100}?([\d,]+(?:\.\d+)?)\s*$/m);
    if (vdaMatch) {
        const val = parseIndianNumber(vdaMatch[1]);
        if (val > 0) {
            data.vdaTransactions.push({ saleValue: val, tokenName: 'Crypto/VDA (from AIS)' });
            console.log(`[AIS Parser] Global fallback VDA: ${val}`);
        }
    }

    // Look for any line mentioning 194S with a large number at the end
    const lines = text.split('\n');
    for (const line of lines) {
        if (/194S/i.test(line) && !/SR\.\s*NO|QUARTER|DATE/i.test(line)) {
            const nums = extractAllNumbers(line).filter(n =>
                n.value > 100 && !(n.value >= 2020 && n.value <= 2030) && !(n.value >= 190 && n.value <= 200)
            );
            if (nums.length > 0 && data.vdaTransactions.length === 0) {
                data.vdaTransactions.push({
                    saleValue: nums[nums.length - 1].value,
                    tokenName: 'Crypto/VDA (from AIS)'
                });
                console.log(`[AIS Parser] Global fallback VDA from line: ${nums[nums.length - 1].value}`);
            }
        }

        // Look for salary (192)
        if (/(?:TDS\s*)?192\b/i.test(line) && /SALARY/i.test(line)) {
            const nums = extractAllNumbers(line).filter(n =>
                n.value > 1000 && !(n.value >= 2020 && n.value <= 2030)
            );
            if (nums.length > 0 && data.tdsSalary.length === 0) {
                data.tdsSalary.push({
                    grossSalary: nums[nums.length - 1].value,
                    deductorName: 'Employer (from AIS)',
                    tdsAmount: 0
                });
                console.log(`[AIS Parser] Global fallback Salary: ${nums[nums.length - 1].value}`);
            }
        }

        // Look for interest (194A)
        if (/194A/i.test(line) && /INTEREST/i.test(line)) {
            const nums = extractAllNumbers(line).filter(n =>
                n.value > 100 && !(n.value >= 2020 && n.value <= 2030)
            );
            if (nums.length > 0 && data.tdsInterest.length === 0) {
                data.tdsInterest.push({
                    grossAmount: nums[nums.length - 1].value,
                    deductorName: 'Bank (from AIS)',
                    tdsAmount: 0
                });
                console.log(`[AIS Parser] Global fallback Interest: ${nums[nums.length - 1].value}`);
            }
        }
    }
}
