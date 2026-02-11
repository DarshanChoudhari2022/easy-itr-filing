import { useState, useCallback } from 'react';
import {
    Upload, FileText, CheckCircle2, AlertTriangle, Loader2,
    Eye, Download, RefreshCw, Trash2, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { useToast } from '../hooks/use-toast';
import { extractTextFromPDF, isLikelyForm16, detectDocumentType } from '../lib/pdf-extractor';
import { parseForm16, Form16Data, convertForm16ToFilingData } from '../lib/form16-parser';
import { saveForm16Data } from '../lib/supabase-data-service';
import { formatINR } from '../lib/validators';

type UploadStatus = 'idle' | 'uploading' | 'parsing' | 'saving' | 'success' | 'error';

interface ParsedResult {
    form16Data: Form16Data;
    filingData: ReturnType<typeof convertForm16ToFilingData>;
    pdfInfo: {
        pages: number;
        isImageBased: boolean;
    };
}

export default function Form16Uploader() {
    const { toast } = useToast();
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ParsedResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        setResult(null);
        setWarnings([]);

        // Step 1: Upload & Extract
        setStatus('uploading');
        setProgress(10);

        try {
            const pdfResult = await extractTextFromPDF(file);
            setProgress(30);

            // Check if it's actually a Form 16
            const docType = detectDocumentType(pdfResult.text);
            if (docType !== 'form16' && !isLikelyForm16(pdfResult.text)) {
                setStatus('error');
                setError(
                    docType === 'ais'
                        ? 'This looks like an AIS document, not Form 16. Please upload it on the AIS Reconciler page.'
                        : docType === '26as'
                            ? 'This looks like Form 26AS, not Form 16. Go to AIS Reconciler to upload.'
                            : 'This doesn\'t appear to be a Form 16 document. Please verify and try again.'
                );
                return;
            }

            if (pdfResult.isImageBased) {
                setWarnings(prev => [...prev, 'PDF appears to be scanned/image-based. Extraction accuracy may be limited.']);
            }
            setWarnings(prev => [...prev, ...pdfResult.warnings]);

            // Step 2: Parse
            setStatus('parsing');
            setProgress(55);
            const form16Data = parseForm16(pdfResult.text);
            setProgress(75);

            const filingData = convertForm16ToFilingData(form16Data);

            if (form16Data.warnings.length > 0) {
                setWarnings(prev => [...prev, ...form16Data.warnings]);
            }

            const parsedResult: ParsedResult = {
                form16Data,
                filingData,
                pdfInfo: {
                    pages: pdfResult.pages,
                    isImageBased: pdfResult.isImageBased,
                },
            };

            setResult(parsedResult);

            // Step 3: Save to Supabase
            setStatus('saving');
            setProgress(90);
            try {
                await saveForm16Data({
                    assessment_year: form16Data.assessmentYear || '2026-27',
                    employer_name: form16Data.employerName,
                    employer_tan: form16Data.employerTAN,
                    employer_pan: form16Data.employerPAN,
                    gross_salary: form16Data.grossSalary,
                    exemptions: form16Data.exemptions as any,
                    deductions_under_16: form16Data.deductions as any,
                    tds_deducted: form16Data.totalTDSDeducted,
                    parse_confidence: form16Data.parseConfidence,
                    raw_text: pdfResult.text.substring(0, 5000), // Store first 5KB for reference
                });
                setProgress(100);
                setStatus('success');
                toast({
                    title: '✅ Form 16 Imported Successfully',
                    description: `Employer: ${form16Data.employerName || 'Detected'} | Gross Salary: ${formatINR(form16Data.grossSalary)} | TDS: ${formatINR(form16Data.totalTDSDeducted)}`,
                });
            } catch (saveError: any) {
                // Still show parsed data even if save fails
                setStatus('success');
                setWarnings(prev => [...prev, `Could not save to cloud: ${saveError.message}. Data is shown below for manual entry.`]);
            }

        } catch (err: any) {
            setStatus('error');
            setError(err.message || 'Failed to process Form 16. Please try again.');
        }
    }, [toast]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
            handleFile(file);
        } else {
            setError('Please drop a PDF file.');
        }
    }, [handleFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const reset = () => {
        setStatus('idle');
        setProgress(0);
        setError(null);
        setResult(null);
        setWarnings([]);
    };

    return (
        <Card className="border-2 border-dashed border-gray-200 hover:border-indigo-200 transition-colors">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Form 16 Import
                </CardTitle>
                <CardDescription>
                    Upload your Form 16 PDF to auto-fill salary, TDS, and deduction details
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Upload Area */}
                {status === 'idle' && (
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                            }`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('form16-file-input')?.click()}
                    >
                        <Upload className={`h-12 w-12 mx-auto mb-3 ${dragOver ? 'text-indigo-500' : 'text-gray-300'}`} />
                        <p className="text-sm font-medium text-gray-700">
                            {dragOver ? 'Drop your Form 16 here' : 'Drag & drop your Form 16 PDF here'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">or click to browse • Max 10MB • PDF only</p>
                        <input
                            id="form16-file-input"
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                    </div>
                )}

                {/* Processing State */}
                {(status === 'uploading' || status === 'parsing' || status === 'saving') && (
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                            <span className="text-sm font-medium text-gray-700">
                                {status === 'uploading' && 'Extracting text from PDF...'}
                                {status === 'parsing' && 'Parsing salary, TDS & deduction details...'}
                                {status === 'saving' && 'Saving to your account...'}
                            </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-gray-400 text-right">{progress}% complete</p>
                    </div>
                )}

                {/* Error State */}
                {status === 'error' && error && (
                    <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-red-800">{error}</p>
                                <p className="text-xs text-red-600 mt-1">Make sure you're uploading a Form 16 PDF issued by your employer.</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                            <RefreshCw className="h-4 w-4" /> Try Again
                        </Button>
                    </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                    <div className="space-y-2">
                        {warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                {w}
                            </div>
                        ))}
                    </div>
                )}

                {/* Success State */}
                {status === 'success' && result && (
                    <div className="space-y-4">
                        {/* Summary Card */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-800">Form 16 Parsed Successfully</span>
                                <Badge className="bg-indigo-100 text-indigo-700 text-[10px] ml-auto">
                                    Confidence: {result.form16Data.parseConfidence}%
                                </Badge>
                            </div>

                            {/* Key Metrics */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                <MetricBox label="Gross Salary" value={formatINR(result.form16Data.grossSalary)} />
                                <MetricBox label="TDS Deducted" value={formatINR(result.form16Data.totalTDSDeducted)} />
                                <MetricBox label="Std. Deduction" value={formatINR(result.form16Data.standardDeduction)} />
                                <MetricBox label="Net Taxable" value={formatINR(result.form16Data.incomeFromSalary)} />
                            </div>
                        </div>

                        {/* Employer Info */}
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Employer</span>
                                <span className="font-medium text-gray-900">{result.form16Data.employerName}</span>
                            </div>
                            {result.form16Data.employerTAN && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">TAN</span>
                                    <span className="font-medium text-gray-700">{result.form16Data.employerTAN}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Assessment Year</span>
                                <span className="font-medium text-gray-900">{result.form16Data.assessmentYear}</span>
                            </div>
                        </div>

                        {/* Expandable Details */}
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:text-indigo-800 w-full justify-center py-2"
                        >
                            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {showDetails ? 'Hide Details' : 'Show All Extracted Data'}
                        </button>

                        {showDetails && (
                            <div className="space-y-3 text-sm border-t border-gray-100 pt-3">
                                <h4 className="font-semibold text-gray-700">Salary Breakup</h4>
                                {Object.entries(result.form16Data.salaryBreakup).map(([key, value]) => (
                                    value > 0 && (
                                        <div key={key} className="flex justify-between px-2">
                                            <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            <span className="font-medium">{formatINR(value)}</span>
                                        </div>
                                    )
                                ))}

                                <h4 className="font-semibold text-gray-700 pt-2">Deductions (Chapter VI-A)</h4>
                                {Object.entries(result.form16Data.deductions).map(([key, value]) => (
                                    value > 0 && (
                                        <div key={key} className="flex justify-between px-2">
                                            <span className="text-gray-500">{key.replace('section', 'Section ')}</span>
                                            <span className="font-medium">{formatINR(value)}</span>
                                        </div>
                                    )
                                ))}

                                <h4 className="font-semibold text-gray-700 pt-2">Tax Computation</h4>
                                {Object.entries(result.form16Data.taxComputation).map(([key, value]) => (
                                    value > 0 && (
                                        <div key={key} className="flex justify-between px-2">
                                            <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            <span className="font-medium">{formatINR(value as number)}</span>
                                        </div>
                                    )
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                                <RefreshCw className="h-4 w-4" /> Upload Another
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const blob = new Blob([JSON.stringify(result.filingData, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `form16_parsed_${result.form16Data.assessmentYear}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="gap-1"
                            >
                                <Download className="h-4 w-4" /> Export JSON
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function MetricBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white rounded-lg p-3 border border-gray-100 text-center">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
        </div>
    );
}
