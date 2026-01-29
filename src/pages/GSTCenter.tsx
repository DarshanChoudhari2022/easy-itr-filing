import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    FilePlus,
    Upload,
    RefreshCw,
    Search,
    CheckCircle2,
    AlertCircle,
    TrendingUp,
    Filter,
    MoreHorizontal,
    FileText,
    History
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function GSTCenter() {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (user) {
            fetchInvoices();
        }
    }, [user]);

    const fetchInvoices = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("gst_invoices")
            .select("*")
            .order("invoice_date", { ascending: false });

        if (error) {
            console.error(error);
        } else {
            setInvoices(data || []);
        }
        setLoading(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        // Simulation of parsing and uploading for now
        setTimeout(async () => {
            const mockInvoice = {
                user_id: user?.id,
                invoice_number: `INV-${Math.floor(Math.random() * 10000)}`,
                invoice_date: new Date().toISOString().split('T')[0],
                vendor_name: "Mock Vendor Ltd",
                vendor_gstin: "27AAACR12345A1Z5",
                taxable_value: 10000,
                total_value: 11800,
                igst: 1800,
                match_status: "matched",
                confidence_score: 100
            };

            const { error } = await supabase.from("gst_invoices").insert(mockInvoice);

            if (error) {
                toast.error("Failed to upload invoice");
            } else {
                toast.success("Invoice uploaded successfully");
                fetchInvoices();
            }
            setUploading(false);
        }, 1500);
    };

    return (
        <AppLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">GST Intelligence</h1>
                        <p className="text-muted-foreground">Manage inputs, output, and reconciliation for FY 2025-26</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="relative">
                            <Button variant="outline" className="gap-2 overflow-hidden relative">
                                <Upload className="h-4 w-4" /> Import Excel/CSV
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    accept=".csv,.xlsx"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </Button>
                        </div>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <FilePlus className="h-4 w-4" /> New E-Invoice
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Generate E-Invoice</DialogTitle>
                                    <DialogDescription>Generate IRN and QR code directly via GSP.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    {/* Form fields would go here */}
                                    <p className="text-sm text-muted-foreground italic text-center">Form implementation in next phase...</p>
                                </div>
                                <DialogFooter>
                                    <Button disabled>Generate IRN</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Analytics Summary */}
                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard
                        title="GSTR-1 Liability"
                        value="₹4,25,000"
                        trend="+12%"
                        status="In Progress"
                    />
                    <StatCard
                        title="ITC (GSTR-2B)"
                        value="₹3,80,000"
                        trend="+5%"
                        status="Reconciled"
                        color="text-accent"
                    />
                    <StatCard
                        title="Net Cash Payable"
                        value="₹45,000"
                        trend="-2%"
                        status="Pending"
                        color="text-warning"
                    />
                </div>

                {/* Invoices Section */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Invoice Ledger</CardTitle>
                                <CardDescription>View and manage your purchase and sales invoices.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 max-w-sm w-full">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search invoice or vendor..." className="pl-8" />
                                </div>
                                <Button variant="outline" size="icon">
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                                Loading ledger...
                            </div>
                        ) : invoices.length === 0 ? (
                            <div className="p-12 text-center">
                                <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                <h3 className="text-lg font-medium">No invoices found</h3>
                                <p className="text-muted-foreground mb-4">Upload your purchase register to start reconciliation.</p>
                                <Button variant="outline" className="relative overflow-hidden">
                                    Upload First Invoice
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0"
                                        onChange={handleFileUpload}
                                    />
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Invoice #</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Vendor</TableHead>
                                            <TableHead className="text-right">Value (₹)</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                                <TableCell className="text-sm">{inv.invoice_date}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{inv.vendor_name}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{inv.vendor_gstin}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {new Intl.NumberFormat('en-IN').format(inv.total_value)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={inv.match_status === 'matched' ? 'default' : 'secondary'}
                                                        className={inv.match_status === 'matched' ? 'bg-accent/10 text-accent border-accent/20' : ''}
                                                    >
                                                        {inv.match_status.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Reconciliation Preview Area */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-warning" />
                                Reconciliation Mismatches
                            </CardTitle>
                            <CardDescription>Invoices present in your books but missing in GSTR-2B.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground italic">Integration with GSTR-2B API required for real-time mismatches.</p>
                                <Button variant="ghost" className="w-full justify-start text-primary p-0">
                                    View Matching Logic Details <RefreshCw className="ml-2 h-3 w-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <History className="h-5 w-5 text-info" />
                                Recent Filing History
                            </CardTitle>
                            <CardDescription>Past 3 months of filing status.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <HistoryItem month="December 2025" type="GSTR-1" status="filed" />
                                <HistoryItem month="December 2025" type="GSTR-3B" status="filed" />
                                <HistoryItem month="November 2025" type="GSTR-1" status="filed" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}

const StatCard = ({ title, value, trend, status, color }: any) => (
    <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className={`text-2xl font-bold ${color || ''}`}>{value}</div>
            <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px]">{status}</Badge>
                <span className="text-xs text-accent font-medium">{trend} from prev</span>
            </div>
        </CardContent>
    </Card>
);

const HistoryItem = ({ month, type, status }: any) => (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
        <div className="flex flex-col">
            <span className="text-sm font-bold">{type}</span>
            <span className="text-[10px] text-muted-foreground">{month}</span>
        </div>
        <Badge className="bg-accent text-accent-foreground text-[10px]">
            <CheckCircle2 className="h-2 w-2 mr-1" /> FILED
        </Badge>
    </div>
);
