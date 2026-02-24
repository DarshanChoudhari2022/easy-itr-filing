import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, Target, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import type { ReconciliationResult, ReconciliationCheck, AssetReconciliation } from "@/lib/taxmitra/koinx-reconciliation";

export function KoinXReconciliationDashboard({ result }: { result: ReconciliationResult | null }) {
    if (!result) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'MATCH': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'MINOR': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'MAJOR': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
            case 'MATCHED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'MINOR_DISCREPANCY': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'MAJOR_DISCREPANCY': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'MATCH':
            case 'MATCHED': return <CheckCircle className="h-4 w-4 text-emerald-600" />;
            case 'MINOR':
            case 'MINOR_DISCREPANCY': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
            case 'MAJOR':
            case 'CRITICAL':
            case 'MAJOR_DISCREPANCY': return <XCircle className="h-4 w-4 text-red-600" />;
            default: return null;
        }
    };

    const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6">
            {/* Overall Status Banner */}
            <Card className={`border-2 shadow-sm ${result.overallStatus === 'MATCHED' ? 'border-emerald-300 bg-emerald-50' :
                    result.overallStatus === 'MINOR_DISCREPANCY' ? 'border-amber-300 bg-amber-50' :
                        'border-red-300 bg-red-50'
                }`}>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className={`h-8 w-8 ${result.overallStatus === 'MATCHED' ? 'text-emerald-600' :
                                    result.overallStatus === 'MINOR_DISCREPANCY' ? 'text-amber-600' :
                                        'text-red-600'
                                }`} />
                            <div>
                                <CardTitle className={`text-lg font-bold ${result.overallStatus === 'MATCHED' ? 'text-emerald-800' :
                                        result.overallStatus === 'MINOR_DISCREPANCY' ? 'text-amber-800' :
                                            'text-red-800'
                                    }`}>
                                    KoinX Reconciliation Status: {result.overallStatus.replace('_', ' ')}
                                </CardTitle>
                                <CardDescription className={
                                    result.overallStatus === 'MATCHED' ? 'text-emerald-600' :
                                        result.overallStatus === 'MINOR_DISCREPANCY' ? 'text-amber-700' :
                                            'text-red-700'
                                }>
                                    Comparing TaxMitra V5 Engine output against known KoinX reference data for {result.financialYear}
                                </CardDescription>
                            </div>
                        </div>
                        <Badge className={getStatusColor(result.overallStatus)}>
                            {result.checks.filter(c => c.status === 'MATCH').length} / {result.checks.length} MATCHED
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Metric Comparison Table */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        <Target className="h-5 w-5 text-indigo-600" /> Metric Comparison
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto text-sm">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b">
                                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Metric</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">TaxMitra</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">KoinX Ref</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Variance</th>
                                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {result.checks.map((check, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4">
                                            <p className="font-medium text-slate-900">{check.metric}</p>
                                            <p className="text-xs text-slate-500">{check.notes}</p>
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-indigo-700">
                                            {check.metric.includes('Count') ? check.taxMitraValue : formatCurrency(check.taxMitraValue)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                                            {check.metric.includes('Count') ? check.koinxValue : formatCurrency(check.koinxValue)}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {check.discrepancy === 0 ? (
                                                <span className="text-slate-400">-</span>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className={`${check.status === 'CRITICAL' || check.status === 'MAJOR' ? 'text-red-600 font-bold' : 'text-amber-600 font-medium'}`}>
                                                        Δ {check.metric.includes('Count') ? check.discrepancy : formatCurrency(check.discrepancy)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500">({check.discrepancyPct}%)</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex justify-center">
                                                <Badge className={`flex items-center gap-1 ${getStatusColor(check.status)}`}>
                                                    {getStatusIcon(check.status)}
                                                    {check.status}
                                                </Badge>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Diagnostics */}
            {result.overallStatus !== 'MATCHED' && (
                <Alert className="border-indigo-200 bg-indigo-50">
                    <AlertTitle className="text-indigo-800 font-semibold mb-2">Engine Diagnostics Summary</AlertTitle>
                    <AlertDescription>
                        <pre className="whitespace-pre-wrap text-xs text-indigo-900 font-mono bg-white p-4 rounded border border-indigo-100 overflow-x-auto">
                            {result.summary}
                        </pre>
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
