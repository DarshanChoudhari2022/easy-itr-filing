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
 * Extract structured data from AIS PDF text
 * Handles the tabular format of AIS PDFs from the Income Tax portal
 */
function extractAISFromPDFText(text: string): Record<string, any> {
    const data: Record<string, any> = {
        tdsSalary: [],
        tdsInterest: [],
        tdsDividend: [],
        vdaTransactions: [],
        mutualFundTransactions: [],
        sftShares: [],
        propertyTransactions: []
    };

    // Try to find PAN
    const panMatch = text.match(/PAN.*?\b([A-Z]{5}\d{4}[A-Z])\b/i);
    if (panMatch) data.pan = panMatch[1];

    // Try to find Assessment Year
    const ayMatch = text.match(/Assessment\s+Year\s*[:\-]\s*(\d{4}-\d{2,4})/i) || text.match(/A\.Y\.?\s*[:\-]?\s*(\d{4}-\d{2,4})/i);
    if (ayMatch) data.assessmentYear = ayMatch[1];

    // Scan lines for transaction data
    // We look for lines that contain keywords AND amounts
    const lines = text.split('\n');

    for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.length < 10) continue;

        // Strict boundary-aware regex to avoid merging adjacent numbers (like Year + Amount)
        const matches = cleanLine.match(/\b[\d,]{3,}\b/g);
        if (!matches) continue;

        let maxAmount = 0;
        for (const match of matches) {
            const val = parseFloat(match.replace(/,/g, ''));

            // Ignore common tax years (2020-2030) to prevent miscalculation
            if (val >= 2020 && val <= 2030) continue;

            if (!isNaN(val) && val > maxAmount) maxAmount = val;
        }

        if (maxAmount < 100) continue;
        const amount = maxAmount;

        const upperLine = cleanLine.toUpperCase();

        // Categorize based on keywords
        if (upperLine.includes('192') || upperLine.includes('SALARY')) {
            data.tdsSalary.push({
                grossSalary: amount,
                deductorName: 'Employer (Auto-extracted)',
                tdsAmount: 0 // Cannot reliably distinguish TDS vs Income in single line heuristics without column detection
            });
        }
        else if (upperLine.includes('194A') || upperLine.includes('INTEREST FROM SAVINGS') || upperLine.includes('INTEREST FROM DEPOSIT')) {
            data.tdsInterest.push({
                grossAmount: amount,
                deductorName: 'Bank (Auto-extracted)'
            });
        }
        else if (upperLine.includes('194') && upperLine.includes('DIVIDEND')) {
            data.tdsDividend.push({
                income: amount,
                companyName: 'Company (Auto-extracted)'
            });
        }
        else if (upperLine.includes('194S') || upperLine.includes('VIRTUAL DIGITAL ASSET') || upperLine.includes('CRYPTO')) {
            data.vdaTransactions.push({
                saleValue: amount,
                tokenName: 'Crypto/VDA'
            });
        }
        else if (upperLine.includes('MUTUAL FUND') || upperLine.includes('UNITS OF MF')) {
            data.mutualFundTransactions.push({
                amount: amount,
                fundName: 'Mutual Fund'
            });
        }
        else if (upperLine.includes('SALE OF SECURITIES') || upperLine.includes('OFF MARKET SALE')) {
            data.sftShares.push({
                saleValue: amount,
                stockName: 'Share Transaction'
            });
        }
    }

    return data;
}
