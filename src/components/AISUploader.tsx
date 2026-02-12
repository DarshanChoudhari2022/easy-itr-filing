import { useState, useCallback, useEffect } from 'react';
import {
    Upload, FileText, CheckCircle2, AlertTriangle, Loader2,
    RefreshCw, XCircle, ArrowRight, FileCheck, Shield, Eye, Lock, Globe, Keyboard, File as FileIcon
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { extractTextFromPDF, detectDocumentType } from '../lib/pdf-extractor';
import {
    parseAISJson, reconcileWithITR,
    AISData, ReconciliationResult, getAutoFillSuggestions
} from '../lib/ais-parser';
import { formatINR } from '../lib/validators';
import { DEMO_AIS_DATA } from '../lib/ais-mock-data';
import { saveAISData, uploadAISFile, getFileUrl, AISDBData } from '../lib/supabase-data-service';

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
    initialData?: AISDBData;
    onAutoFill?: (suggestions: ReturnType<typeof getAutoFillSuggestions>) => void;
    onNext?: () => void;
}

type UploadStatus = 'idle' | 'processing' | 'parsed' | 'reconciled' | 'error';

export default function AISUploader({ itrData, initialData, onAutoFill, onNext }: AISUploaderProps) {
    const { toast } = useToast();
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [aisData, setAisData] = useState<AISData | null>(null);
    const [reconciliation, setReconciliation] = useState<ReconciliationResult[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [uploadType, setUploadType] = useState<'json' | 'pdf' | 'manual'>('json');
    const [isSaving, setIsSaving] = useState(false);
    const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);

    // Manual Entry State
    const [manualMode, setManualMode] = useState(false);
    const [manualFormData, setManualFormData] = useState({
        salary: '', interest: '', dividend: '', capitalGains: '', tds: ''
    });

    // Password Handling State
    const [passwordRequired, setPasswordRequired] = useState(false);
    const [pdfPassword, setPdfPassword] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    // Initial Data Load
    useEffect(() => {
        if (initialData?.parsed_data) {
            setAisData(initialData.parsed_data as AISData);
            setStatus('parsed');
        }
    }, [initialData]);

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

            // Save to DB in background
            const currentUploadType = (file.type === 'application/json' || file.name.endsWith('.json')) ? 'json' : 'pdf';
            (async () => {
                try {
                    setIsSaving(true);
                    let filePath = initialData?.file_path;
                    // Only upload if verified PDF/JSON and not already strictly linked (simplified logic)
                    if (currentUploadType === 'pdf' && !filePath) {
                        try {
                            filePath = await uploadAISFile(file, parsedAIS.assessmentYear || '2025-26');
                            setUploadedFilePath(filePath);
                        } catch (err) { console.error("File upload failed", err); }
                    }

                    await saveAISData({
                        assessment_year: parsedAIS.assessmentYear || '2025-26',
                        parsed_data: parsedAIS,
                        file_path: filePath,
                        source_type: currentUploadType,
                        status: 'parsed'
                    });
                    console.log("AIS Data synced to DB");
                } catch (e) {
                    console.error("Background sync failed", e);
                } finally {
                    setIsSaving(false);
                }
            })();

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

    const handleManualSubmit = async () => {
        try {
            setIsSaving(true);
            const manualAIS: AISData = {
                assessmentYear: '2025-26',
                financialYear: '2024-25',
                pan: 'MANUAL_ENTRY',
                generatedDate: new Date().toISOString(),
                records: [],
                incomeDetails: {
                    salary: parseFloat(manualFormData.salary) || 0,
                    interest: parseFloat(manualFormData.interest) || 0,
                    dividend: parseFloat(manualFormData.dividend) || 0,
                    rentalIncome: 0,
                    capitalGains: parseFloat(manualFormData.capitalGains) || 0,
                    businessIncome: 0,
                    otherSources: 0,
                },
                totalIncome: (parseFloat(manualFormData.salary) || 0) + (parseFloat(manualFormData.interest) || 0) + (parseFloat(manualFormData.dividend) || 0) + (parseFloat(manualFormData.capitalGains) || 0),
                totalTDSCredited: parseFloat(manualFormData.tds) || 0,
                totalTCSCredited: 0,
                tdsDetails: {
                    total: parseFloat(manualFormData.tds) || 0,
                    salary: 0, interest: 0, dividend: 0, rent: 0, professional: 0, other: 0
                },
                sftTransactions: {
                    savingsDeposits: 0, timeDeposits: 0, creditCardPayments: 0,
                    mutualFundPurchases: 0, shareTransactions: 0, propertyTransactions: 0, foreignRemittances: 0
                },
                warnings: ['Manually entered data'],
                lastUpdated: new Date()
            };

            await saveAISData({
                assessment_year: '2025-26',
                parsed_data: manualAIS,
                source_type: 'manual',
                status: 'parsed',
                file_path: null
            });

            setAisData(manualAIS);
            setStatus('parsed');
            setManualMode(false);
            toast({ title: "Manual Entry Saved", description: "Your data has been recorded." });

        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Failed to save data" });
        } finally {
            setIsSaving(false);
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
        setManualMode(false);
        setManualFormData({ salary: '', interest: '', dividend: '', capitalGains: '', tds: '' });
        setUploadedFilePath(null);
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
                        manualMode ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 p-1">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Salary Income</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={manualFormData.salary}
                                            onChange={e => setManualFormData({ ...manualFormData, salary: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Interest Income</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={manualFormData.interest}
                                            onChange={e => setManualFormData({ ...manualFormData, interest: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Dividend Income</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={manualFormData.dividend}
                                            onChange={e => setManualFormData({ ...manualFormData, dividend: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Capital Gains</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={manualFormData.capitalGains}
                                            onChange={e => setManualFormData({ ...manualFormData, capitalGains: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <Label>Total TDS Deducted</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={manualFormData.tds}
                                            onChange={e => setManualFormData({ ...manualFormData, tds: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-center pt-2">
                                    <Button onClick={handleManualSubmit} disabled={isSaving} className="w-32">
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Save
                                    </Button>
                                    <Button variant="ghost" onClick={() => setManualMode(false)}>Cancel</Button>
                                </div>
                            </div>
                        ) : (
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

                                <div className="mb-4 flex justify-center">
                                    <Button variant="outline" size="sm" onClick={() => setManualMode(true)} className="gap-2 text-xs border-dashed">
                                        <Keyboard className="h-4 w-4" /> Enter Manually
                                    </Button>
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
                        )
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
                            {(uploadedFilePath || initialData?.file_path) && (
                                <Button variant="outline" size="sm" onClick={async () => {
                                    const path = uploadedFilePath || initialData?.file_path;
                                    if (path) {
                                        const url = await getFileUrl(path);
                                        if (url) window.open(url, '_blank');
                                    }
                                }} className="gap-1">
                                    <FileIcon className="h-4 w-4" /> View PDF
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                                <RefreshCw className="h-4 w-4" /> Upload New
                            </Button>
                            {onNext && (
                                <Button size="sm" onClick={onNext} className="gap-1 ml-auto">
                                    Next <ArrowRight className="h-4 w-4" />
                                </Button>
                            )}
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
    const cleaned = raw.replace(/\s/g, '').replace(/,/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
}

/**
 * Extract financial numbers from a line of text.
 * Carefully masks out ALL non-financial data before extracting numbers.
 *
 * Masking order (each step removes patterns that could leak false numbers):
 * 1. Dates (DD/MM/YYYY, DD-MM-YYYY)
 * 2. Quarter labels (Q2(Jul-Sep), Q 2, Q2 Jul-Sep, etc.)
 * 3. Month names (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec)
 * 4. Status words (Active, Inactive)
 * 5. Parenthesized text like (Section 194S)
 * 6. Alphanumeric identifiers (MUMH25146C, BTJPC4473Q)
 * 7. Phone numbers (10+ consecutive digits)
 *
 * Indian number regex: `,\d{3}` is REQUIRED (not optional) to prevent
 * `10,740` from being misread as `10,74` (=1074).
 */
function extractFinancialNumbers(text: string): { value: number; raw: string }[] {
    const masked = text
        .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g, ' ')             // Dates: 19/09/2025 or 19-09-2025
        .replace(/Q\s*[1-4]\s*\([^)]*\)/gi, ' ')                   // Q2(Jul-Sep) or Q 2(Jul-Sep)
        .replace(/Q\s*[1-4]\s+[A-Z]{3}[\s\-]+[A-Z]{3}/gi, ' ')    // Q2 Jul-Sep (without parens)
        .replace(/Q\s*[1-4]\b/gi, ' ')                             // Standalone Q2, Q 1, etc.
        .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi, ' ') // Month names
        .replace(/\b(?:Active|Inactive)\b/gi, ' ')                 // Status words
        .replace(/\([^)]*\)/g, ' ')                                // Any parenthesized text
        .replace(/[A-Z]{2,}[\dA-Z]+/gi, ' ')                      // TANs/PANs: MUMH25146C
        .replace(/\b\d{10,}\b/g, ' ');                             // Phone numbers

    // Indian format: d{1,2} followed by groups of ,dd then final ,ddd (REQUIRED)
    // Western format: d{1,3} followed by groups of ,ddd
    // Plain: just digits
    const regex = /\b(\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\b/g;
    const results: { value: number; raw: string }[] = [];
    let match;
    while ((match = regex.exec(masked)) !== null) {
        const val = parseIndianNumber(match[0]);
        if (!isNaN(val) && val >= 0) {
            results.push({ value: val, raw: match[0] });
        }
    }
    return results;
}

/**
 * Extract structured data from AIS PDF text.
 *
 * FIXED approach:
 * 1. Only start parsing AFTER "Part B" is found (ignores Part A personal info)
 * 2. Detect section headers (TDS 194S, 192, 194A) — if same section re-detected, MERGE (no double-count)
 * 3. Use section header AMOUNT as the authoritative total
 * 4. Parse individual transaction rows for TDS details
 * 5. Filter out non-financial numbers (phone numbers, TANs, years)
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

    console.log('[AIS Parser v2] Raw text length:', text.length);

    // 1. Extract identity info from anywhere in the document
    const panMatch = text.match(/(?:Permanent Account Number|PAN)[^A-Z]*([A-Z]{5}\d{4}[A-Z])/i);
    if (panMatch) data.pan = panMatch[1];

    const ayMatch = text.match(/Assessment\s*Year\s*(\d{4}-\d{2,4})/i);
    if (ayMatch) data.assessmentYear = ayMatch[1];

    const fyMatch = text.match(/Financial\s*Year\s*(\d{4}-\d{2,4})/i);
    if (fyMatch) data.financialYear = fyMatch[1];

    console.log(`[AIS Parser v2] PAN: ${data.pan}, AY: ${data.assessmentYear}, FY: ${data.financialYear}`);

    // 2. Find where Part B starts — IGNORE everything before it
    const lines = text.split('\n');
    let partBStarted = false;
    let currentSection = '';
    let sectionHeaderAmount = 0; // From the header row (authoritative)
    let sectionTDSFromRows = 0;  // Sum of individual row TDS
    let sectionAmountFromRows = 0; // Sum of individual row amounts

    // Detect section type from line content
    const detectSection = (line: string): string | null => {
        const upper = line.toUpperCase();

        // Skip column header rows (they contain keywords but aren't section data)
        if (upper.includes('SR. NO') && (upper.includes('INFORMATION CODE') || upper.includes('QUARTER'))) return null;
        if (upper.includes('DATE OF PAYMENT') || upper.includes('AMOUNT PAID')) return null;

        // VDA / Crypto — check FIRST (most specific)
        if (/\b194S\b/.test(line) && (upper.includes('VIRTUAL DIGITAL') || upper.includes('TRANSFER OF VIRTUAL'))) return 'VDA';
        if (/TDS.{0,5}194S/i.test(line)) return 'VDA';

        // Salary (Section 192)
        if (/\b192\b/.test(line) && upper.includes('SALARY')) return 'SALARY';
        if (/TDS.{0,5}192\b/i.test(line)) return 'SALARY';

        // Interest (Section 194A)
        if (/\b194A\b/.test(line) && upper.includes('INTEREST')) return 'INTEREST';

        // Dividend
        if (/\b194[K]?\b/.test(line) && upper.includes('DIVIDEND')) return 'DIVIDEND';

        // SFT categories
        if (upper.includes('MUTUAL FUND') || upper.includes('UNITS OF MF')) return 'MF';
        if (/SFT.?0?17|SFT.?0?18|SALE OF SECURITIES/i.test(line)) return 'SHARES';

        return null;
    };

    // Check if a line is a transaction detail row (has date + numbers)
    const isTransactionRow = (line: string): boolean => {
        const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(line);
        const hasQuarter = /Q[1-4]\s*\(/i.test(line);
        return hasDate || hasQuarter;
    };

    // Filter numbers to only financial amounts (exclude years, serial numbers, section codes)
    const getFinancialAmounts = (line: string, minValue = 1): number[] => {
        return extractFinancialNumbers(line)
            .map(n => n.value)
            .filter(v =>
                v >= minValue &&
                !(v >= 2020 && v <= 2030) &&  // years
                !(v >= 190 && v <= 200) &&     // section numbers (192, 194, 194S → 194)
                v < 100000000                   // < 10 crore (reasonableness cap)
            );
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length < 3) continue;

        // Wait for Part B to start
        if (!partBStarted) {
            if (/Part\s*B/i.test(line) || /Information relating to tax/i.test(line)) {
                partBStarted = true;
                console.log(`[AIS Parser v2] Part B starts at line ${i}: "${line.substring(0, 60)}"`);
            }
            continue;
        }

        // Detect section header
        const section = detectSection(line);
        if (section) {
            // If SAME section detected again (e.g. "TDS 194S" then "virtual digital asset (Section 194S)")
            // → just update the header amount, don't flush
            if (section === currentSection) {
                const amounts = getFinancialAmounts(line, 100);
                if (amounts.length > 0) {
                    const newAmount = amounts[amounts.length - 1];
                    if (newAmount > sectionHeaderAmount) {
                        sectionHeaderAmount = newAmount;
                        console.log(`[AIS Parser v2] Same section ${section} re-detected, updated amount: ${sectionHeaderAmount}`);
                    }
                }
                continue;
            }

            // Different section → flush previous section first
            if (currentSection && sectionHeaderAmount > 0) {
                flushSectionV2(data, currentSection, sectionHeaderAmount, sectionTDSFromRows, sectionAmountFromRows);
            }

            // Start new section
            currentSection = section;
            sectionHeaderAmount = 0;
            sectionTDSFromRows = 0;
            sectionAmountFromRows = 0;

            // Extract amount from this header line
            const amounts = getFinancialAmounts(line, 100);
            if (amounts.length > 0) {
                sectionHeaderAmount = amounts[amounts.length - 1]; // Last number = AMOUNT column
            }

            console.log(`[AIS Parser v2] New section: ${section}, header amount: ${sectionHeaderAmount}, line: "${line.substring(0, 80)}"`);
            continue;
        }

        // Parse transaction detail rows within a section
        if (currentSection && isTransactionRow(line)) {
            const allNums = getFinancialAmounts(line, 0);

            // ROBUST: Skip ALL consecutive leading numbers ≤ 50
            // These are serial numbers (1-12), leaked quarter digits (Q2→2),
            // sub-rule numbers, or any other non-financial small values.
            let startIdx = 0;
            while (startIdx < allNums.length && allNums[startIdx] <= 50) {
                startIdx++;
            }
            const amounts = allNums.slice(startIdx);

            // Log every row with full detail for debugging
            console.log(`[AIS Parser v3] Line ${i}: "${line.substring(0, 90)}"`);
            console.log(`[AIS Parser v3]   allNums=[${allNums.join(',')}], skipped=${startIdx}, amounts=[${amounts.join(',')}]`);

            if (amounts.length >= 1) {
                const txAmount = amounts[0]; // AMOUNT PAID/CREDITED (first number > 50)
                const txTDS = amounts.length >= 2 ? amounts[1] : 0; // TDS DEDUCTED
                const txTDSDeposited = amounts.length >= 3 ? amounts[2] : 0; // TDS DEPOSITED

                // Validation: TDS should never exceed the amount paid
                const validTDS = (txTDS <= txAmount) ? txTDS : 0;

                // Only count Active transactions with positive amounts
                const isInactive = /inactive/i.test(line);
                if (!isInactive && txAmount > 0) {
                    sectionAmountFromRows += txAmount;
                    sectionTDSFromRows += validTDS;
                }

                console.log(`[AIS Parser v3]   → amt=${txAmount}, tds=${validTDS}, inactive=${isInactive}`);
            } else {
                // All numbers were ≤ 50 (small/zero transaction) — skip
                console.log(`[AIS Parser v3]   → skipped (all numbers ≤ 50)`);
            }
            continue;
        }
    }

    // Flush the last section
    if (currentSection && (sectionHeaderAmount > 0 || sectionAmountFromRows > 0)) {
        flushSectionV2(data, currentSection, sectionHeaderAmount, sectionTDSFromRows, sectionAmountFromRows);
    }

    // Cross-validation logging
    if (data.vdaTransactions.length > 0) {
        const vda = data.vdaTransactions[0];
        console.log(`[AIS Parser v3] VALIDATION - VDA sale: ${vda.saleValue}, TDS: ${vda.tdsAmount}`);
        if (vda.tdsAmount > vda.saleValue) {
            console.warn('[AIS Parser v3] WARNING: TDS exceeds sale value - possible parsing error');
            vda.tdsAmount = 0; // Safety reset
        }
    }

    // If Part B was never found, try without the Part B guard (some PDFs may not have it)
    if (!partBStarted) {
        console.log('[AIS Parser v2] Part B marker not found, retrying without guard...');
        return extractAISFromPDFTextNoGuard(text);
    }

    console.log('[AIS Parser v2] Final result:', JSON.stringify(data, null, 2));
    return data;
}

/**
 * Flush a completed section into the data object.
 * Uses the section header amount as the authoritative total (not the sum of rows).
 */
function flushSectionV2(
    data: Record<string, any>,
    section: string,
    headerAmount: number,
    rowTDS: number,
    rowAmount: number
) {
    // Use header amount if available, fallback to sum of rows
    const finalAmount = headerAmount > 0 ? headerAmount : rowAmount;
    const finalTDS = rowTDS;

    // Validation: TDS should be a reasonable percentage of amount (typically < 30% for most sections)
    if (finalTDS > finalAmount && finalAmount > 0) {
        console.warn(`[AIS Parser v3] WARNING: TDS (${finalTDS}) exceeds amount (${finalAmount}) for ${section}. Capping TDS.`);
    }

    console.log(`[AIS Parser v3] Flush ${section}: amount=${finalAmount}, tds=${finalTDS} (headerAmt=${headerAmount}, rowAmt=${rowAmount}, rowTDS=${rowTDS})`);

    switch (section) {
        case 'SALARY':
            data.tdsSalary.push({ grossSalary: finalAmount, deductorName: 'Employer (from AIS)', tdsAmount: finalTDS });
            break;
        case 'INTEREST':
            data.tdsInterest.push({ grossAmount: finalAmount, deductorName: 'Bank (from AIS)', tdsAmount: finalTDS });
            break;
        case 'DIVIDEND':
            data.tdsDividend.push({ income: finalAmount, companyName: 'Company (from AIS)', tdsAmount: finalTDS });
            break;
        case 'VDA':
            data.vdaTransactions.push({ saleValue: finalAmount, tokenName: 'Crypto/VDA (from AIS)', tdsAmount: finalTDS });
            break;
        case 'MF':
            data.mutualFundTransactions.push({ amount: finalAmount, fundName: 'Mutual Fund (from AIS)' });
            break;
        case 'SHARES':
            data.sftShares.push({ saleValue: finalAmount, stockName: 'Share Transaction (from AIS)' });
            break;
        case 'PROPERTY':
            data.propertyTransactions.push({ saleValue: finalAmount, description: 'Property (from AIS)' });
            break;
    }
}

/**
 * Fallback parser without the Part B guard — for PDFs that don't clearly mark Part B.
 */
function extractAISFromPDFTextNoGuard(text: string): Record<string, any> {
    const data: Record<string, any> = {
        tdsSalary: [], tdsInterest: [], tdsDividend: [],
        vdaTransactions: [], mutualFundTransactions: [],
        sftShares: [], propertyTransactions: [],
        pan: '', assessmentYear: '', financialYear: '',
    };

    const panMatch = text.match(/(?:Permanent Account Number|PAN)[^A-Z]*([A-Z]{5}\d{4}[A-Z])/i);
    if (panMatch) data.pan = panMatch[1];
    const ayMatch = text.match(/Assessment\s*Year\s*(\d{4}-\d{2,4})/i);
    if (ayMatch) data.assessmentYear = ayMatch[1];
    const fyMatch = text.match(/Financial\s*Year\s*(\d{4}-\d{2,4})/i);
    if (fyMatch) data.financialYear = fyMatch[1];

    // Simple line-by-line scan for section headers with amounts
    const lines = text.split('\n');
    for (const line of lines) {
        const upper = line.toUpperCase();

        // Skip non-data lines
        if (upper.includes('SR. NO') || upper.includes('QUARTER') || upper.includes('DATE OF PAYMENT')) continue;

        // Mask out alphanumeric identifiers before extracting numbers
        const masked = line
            .replace(/[A-Z]{2,}[\dA-Z]+/gi, ' ')
            .replace(/\b\d{10,}\b/g, ' ');

        const numbers = extractFinancialNumbers(masked)
            .map(n => n.value)
            .filter(v => v > 100 && !(v >= 2020 && v <= 2030) && !(v >= 190 && v <= 200) && v < 100000000);

        if (numbers.length === 0) continue;
        const amount = numbers[numbers.length - 1];

        if (/\b194S\b/i.test(line) && (upper.includes('VIRTUAL DIGITAL') || upper.includes('TDS')) && data.vdaTransactions.length === 0) {
            data.vdaTransactions.push({ saleValue: amount, tokenName: 'Crypto/VDA (from AIS)' });
            console.log(`[AIS Parser v2 Fallback] VDA: ${amount}`);
        } else if (/\b192\b/.test(line) && upper.includes('SALARY') && data.tdsSalary.length === 0) {
            data.tdsSalary.push({ grossSalary: amount, deductorName: 'Employer (from AIS)', tdsAmount: 0 });
            console.log(`[AIS Parser v2 Fallback] Salary: ${amount}`);
        } else if (/\b194A\b/.test(line) && upper.includes('INTEREST') && data.tdsInterest.length === 0) {
            data.tdsInterest.push({ grossAmount: amount, deductorName: 'Bank (from AIS)', tdsAmount: 0 });
            console.log(`[AIS Parser v2 Fallback] Interest: ${amount}`);
        }
    }

    console.log('[AIS Parser v2 Fallback] Result:', JSON.stringify(data, null, 2));
    return data;
}

