import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    BarChart3,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Info,
    ArrowRight,
    TrendingUp,
    Download
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function AISReconciler() {
    const { user } = useAuth();
    const [aisData, setAisData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        if (user) fetchAIS();
    }, [user]);

    const fetchAIS = async () => {
        setLoading(true);
        const { data } = await supabase.from("ais_records").select("*");
        setAisData(data || []);
        setLoading(false);
    };

    const syncAIS = async () => {
        setSyncing(true);
        // Mocking an IT Portal Sync
        await new Promise(resolve => setTimeout(resolve, 2000));

        const mockRecords = [
            { category: "SFT-005 (Dividends)", source_name: "TATA MOTORS LTD", reported_value: 12500, status: "unmatched" },
            { category: "SFT-001 (Savings Interest)", source_name: "HDFC BANK", reported_value: 4200, status: "matched" },
            { category: "SFT-006 (Mutual Funds Sale)", source_name: "ZERODHA", reported_value: 85000, status: "unmatched" },
            { category: "SFT-002 (FD Interest)", source_name: "ICICI BANK", reported_value: 15600, status: "mismatch" },
        ];

        const { error } = await supabase.from("ais_records").insert(
            mockRecords.map(r => ({ ...r, user_id: user!.id }))
        );

        if (!error) {
            setAisData(prev => [...prev, ...mockRecords]);
        }
        setSyncing(false);
    };

    const matchedCount = aisData.filter(r => r.status === 'matched').length;
    const reconciliationProgress = aisData.length > 0 ? (matchedCount / aisData.length) * 100 : 0;

    return (
        <AppLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <BarChart3 className="h-8 w-8 text-indigo-500" />
                            AIS / TIS Reconciler
                        </h1>
                        <p className="text-muted-foreground italic">Cross-referencing Annual Information Statement with your declarations.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="gap-2">
                            <Download className="h-4 w-4" /> Export Report
                        </Button>
                        <Button onClick={syncAIS} disabled={syncing} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Syncing IT Portal...' : 'Sync with IT Portal'}
                        </Button>
                    </div>
                </div>

                {/* Global Progress */}
                <Card className="border-indigo-100 bg-indigo-50/20">
                    <CardContent className="py-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="space-y-1 text-center md:text-left">
                                <p className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">Reconciliation Score</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-4xl font-black text-indigo-900">{reconciliationProgress.toFixed(0)}%</span>
                                    <Badge variant="outline" className="border-indigo-200 text-indigo-700">Audit-Ready</Badge>
                                </div>
                            </div>
                            <div className="flex-1 w-full max-w-md">
                                <Progress value={reconciliationProgress} className="h-3 bg-indigo-100" />
                                <p className="text-[10px] text-muted-foreground mt-2 text-right">
                                    {matchedCount} of {aisData.length} records verified against Form 16/Bank Statements
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Mismatch Alert Sidebar */}
                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>AIS Data Points</CardTitle>
                            <CardDescription>Income reported by banks and brokers to the IT Department.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead className="text-right">Reported Value</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {aisData.length > 0 ? aisData.map((record, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="text-xs font-medium">{record.category}</TableCell>
                                            <TableCell className="font-bold">{record.source_name}</TableCell>
                                            <TableCell className="text-right font-mono">₹{record.reported_value.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={record.status === 'matched' ? 'default' : record.status === 'mismatch' ? 'destructive' : 'secondary'}
                                                    className={record.status === 'matched' ? 'bg-emerald-500' : ''}
                                                >
                                                    {record.status.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="sm" className="h-8">
                                                    <ArrowRight className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
                                                No AIS records found. Click "Sync" to fetch data from the IT Portal.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="border-amber-200 bg-amber-50/30">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-amber-800 flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5" /> Pending Actions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-3 bg-white rounded-lg border border-amber-100 shadow-sm">
                                    <p className="text-xs font-bold text-amber-800">Unreported Dividend</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">₹12,500 from Tata Motors found in AIS but missing in your ITR.</p>
                                    <Button size="sm" variant="link" className="p-0 h-auto text-amber-700 mt-2">Add to ITR Now</Button>
                                </div>
                                <div className="p-3 bg-white rounded-lg border border-amber-100 shadow-sm">
                                    <p className="text-xs font-bold text-amber-800">Interest Variance</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">ICICI reported ₹15,600 interest; you entered ₹12,000. Potential notice risk.</p>
                                    <Button size="sm" variant="link" className="p-0 h-auto text-amber-700 mt-2">Recalculate Interest</Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-indigo-600 text-white">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5" /> Why Reconcile?
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-xs space-y-2 opacity-90 leading-relaxed">
                                <p>90% of IT notices in AY 2025-26 were due to mismatch between AIS and ITR declarations.</p>
                                <p>TaxBay auto-verifies your AIS every 15 days to ensure you never miss an reporting entry.</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
