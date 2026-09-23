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
import type { Database } from "@/integrations/supabase/types";
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

import { PlanGate } from "@/hooks/usePlanGuard";

export default function GSTCenter() {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Database["public"]["Tables"]["gst_invoices"]["Row"][]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
    const [newInvoice, setNewInvoice] = useState<InvoiceDraft>(createEmptyInvoiceDraft());

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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!user) {
            toast.error("Please sign in before importing invoices.");
            return;
        }

        setUploading(true);
        try {
            if (!file.name.toLowerCase().endsWith(".csv")) {
                throw new Error("Please upload a CSV file. Excel import needs a spreadsheet parser dependency; CSV works now.");
            }

            const rows = parseGSTInvoiceCSV(await file.text(), user.id);
            if (rows.length === 0) {
                throw new Error("No valid invoice rows found. Check that the CSV has invoice number, date, vendor, and amount columns.");
            }

            const { error } = await supabase.from("gst_invoices").insert(rows);
            if (error) throw error;

            toast.success(`Imported ${rows.length} invoice${rows.length === 1 ? "" : "s"} from CSV.`);
            await fetchInvoices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to import invoices.");
        } finally {
            setUploading(false);
        }
    };

    const handleCreateInvoice = async () => {
        if (!user) {
            toast.error("Please sign in before adding invoices.");
            return;
        }

        try {
            const row = invoiceDraftToInsert(newInvoice, user.id);
            const { error } = await supabase.from("gst_invoices").insert(row);
            if (error) throw error;
            toast.success("Invoice added.");
            setNewInvoice(createEmptyInvoiceDraft());
            setNewInvoiceOpen(false);
            await fetchInvoices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add invoice.");
        }
    };

    return (
        <AppLayout>
            <PlanGate feature="gst_center">
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
                            <Dialog open={newInvoiceOpen} onOpenChange={setNewInvoiceOpen}>
                                <DialogTrigger asChild>
                                    <Button className="gap-2">
                                        <FilePlus className="h-4 w-4" /> New Invoice
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Invoice</DialogTitle>
                                        <DialogDescription>Enter the invoice details from your purchase or sales register.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-3 py-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <Input value={newInvoice.invoice_number} onChange={e => setNewInvoice(s => ({ ...s, invoice_number: e.target.value }))} placeholder="Invoice number" />
                                            <Input type="date" value={newInvoice.invoice_date} onChange={e => setNewInvoice(s => ({ ...s, invoice_date: e.target.value }))} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <Input value={newInvoice.vendor_name} onChange={e => setNewInvoice(s => ({ ...s, vendor_name: e.target.value }))} placeholder="Vendor / Customer name" />
                                            <Input value={newInvoice.vendor_gstin} onChange={e => setNewInvoice(s => ({ ...s, vendor_gstin: e.target.value.toUpperCase() }))} placeholder="GSTIN" maxLength={15} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <Input type="number" value={newInvoice.taxable_value} onChange={e => setNewInvoice(s => ({ ...s, taxable_value: e.target.value }))} placeholder="Taxable value" />
                                            <Input type="number" value={newInvoice.igst} onChange={e => setNewInvoice(s => ({ ...s, igst: e.target.value }))} placeholder="IGST" />
                                            <Input type="number" value={newInvoice.cgst} onChange={e => setNewInvoice(s => ({ ...s, cgst: e.target.value }))} placeholder="CGST" />
                                            <Input type="number" value={newInvoice.sgst} onChange={e => setNewInvoice(s => ({ ...s, sgst: e.target.value }))} placeholder="SGST" />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="button" variant={newInvoice.is_purchase ? "default" : "outline"} onClick={() => setNewInvoice(s => ({ ...s, is_purchase: true }))}>Purchase</Button>
                                            <Button type="button" variant={!newInvoice.is_purchase ? "default" : "outline"} onClick={() => setNewInvoice(s => ({ ...s, is_purchase: false }))}>Sales</Button>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateInvoice}>Save Invoice</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Analytics Summary */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <StatCard
                            title="GSTR-1 Liability"
                            value={`₹${invoices.reduce((sum, inv) => sum + (inv.igst || 0), 0).toLocaleString('en-IN')}`}
                            trend="+0%"
                            status="In Progress"
                        />
                        <StatCard
                            title="ITC (GSTR-2B)"
                            value="₹0"
                            trend="+0%"
                            status="Reconciled"
                            color="text-accent"
                        />
                        <StatCard
                            title="Net Cash Payable"
                            value={`₹${invoices.reduce((sum, inv) => sum + (inv.igst || 0), 0).toLocaleString('en-IN')}`}
                            trend="+0%"
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
                                    {invoices.length === 0 ? (
                                        <p className="text-sm text-muted-foreground italic text-center py-4">
                                            Filing history will appear here once invoices are added.
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic text-center py-4">
                                            Connect to GSP for real-time filing status.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </PlanGate>
        </AppLayout>
    );
}

interface StatCardProps {
    title: string;
    value: string;
    trend: string;
    status: string;
    color?: string;
}

const StatCard = ({ title, value, trend, status, color }: StatCardProps) => (
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

interface HistoryItemProps {
    month: string;
    type: string;
    status: string;
}

const HistoryItem = ({ month, type, status }: HistoryItemProps) => (
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

type GSTInvoiceInsert = Database["public"]["Tables"]["gst_invoices"]["Insert"];

interface InvoiceDraft {
    invoice_number: string;
    invoice_date: string;
    vendor_name: string;
    vendor_gstin: string;
    taxable_value: string;
    igst: string;
    cgst: string;
    sgst: string;
    is_purchase: boolean;
}

function createEmptyInvoiceDraft(): InvoiceDraft {
    return {
        invoice_number: "",
        invoice_date: new Date().toISOString().split("T")[0],
        vendor_name: "",
        vendor_gstin: "",
        taxable_value: "",
        igst: "",
        cgst: "",
        sgst: "",
        is_purchase: true,
    };
}

function invoiceDraftToInsert(draft: InvoiceDraft, userId: string): GSTInvoiceInsert {
    return normalizeInvoiceRow({
        invoice_number: draft.invoice_number,
        invoice_date: draft.invoice_date,
        vendor_name: draft.vendor_name,
        vendor_gstin: draft.vendor_gstin,
        taxable_value: draft.taxable_value,
        igst: draft.igst,
        cgst: draft.cgst,
        sgst: draft.sgst,
        is_purchase: draft.is_purchase ? "purchase" : "sales",
    }, userId);
}

function parseGSTInvoiceCSV(csv: string, userId: string): GSTInvoiceInsert[] {
    const rows = parseCSV(csv);
    if (rows.length < 2) return [];

    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1)
        .filter(row => row.some(cell => cell.trim() !== ""))
        .map(row => {
            const record: Record<string, string> = {};
            headers.forEach((header, index) => {
                record[header] = row[index]?.trim() || "";
            });
            return normalizeInvoiceRow(record, userId);
        });
}

function normalizeInvoiceRow(record: Record<string, string>, userId: string): GSTInvoiceInsert {
    const invoiceNumber = pick(record, ["invoice_number", "invoice_no", "invoice", "bill_number", "bill_no"]);
    const invoiceDate = normalizeDate(pick(record, ["invoice_date", "date", "bill_date"]));
    const vendorName = pick(record, ["vendor_name", "supplier_name", "customer_name", "party_name", "name"]);

    if (!invoiceNumber) throw new Error("Invoice number is required.");
    if (!invoiceDate) throw new Error(`Invoice ${invoiceNumber}: valid invoice date is required.`);
    if (!vendorName) throw new Error(`Invoice ${invoiceNumber}: vendor/customer name is required.`);

    const taxableValue = parseMoney(pick(record, ["taxable_value", "taxable", "taxable_amount", "amount_before_tax"]));
    const igst = parseMoney(pick(record, ["igst", "igst_amount"]));
    const cgst = parseMoney(pick(record, ["cgst", "cgst_amount"]));
    const sgst = parseMoney(pick(record, ["sgst", "sgst_amount"]));
    const totalFromCSV = parseMoney(pick(record, ["total_value", "invoice_value", "total", "gross_amount", "amount"]));
    const computedTotal = taxableValue + igst + cgst + sgst;
    const totalValue = totalFromCSV > 0 ? totalFromCSV : computedTotal;

    return {
        user_id: userId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        vendor_name: vendorName,
        vendor_gstin: pick(record, ["vendor_gstin", "supplier_gstin", "customer_gstin", "gstin"]).toUpperCase() || null,
        taxable_value: taxableValue,
        igst,
        cgst,
        sgst,
        total_value: totalValue,
        is_purchase: !["sale", "sales", "outward"].includes(pick(record, ["type", "invoice_type", "category"]).toLowerCase()),
        match_status: "pending",
        confidence_score: 0,
    };
}

function parseCSV(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < csv.length; index += 1) {
        const char = csv[index];
        const next = csv[index + 1];

        if (char === '"' && inQuotes && next === '"') {
            cell += '"';
            index += 1;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += char;
        }
    }

    row.push(cell);
    rows.push(row);
    return rows;
}

function normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function pick(record: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
        const value = record[key];
        if (value && value.trim()) return value.trim();
    }
    return "";
}

function parseMoney(value: string): number {
    const normalized = value.replace(/[₹,\s]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: string): string {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
        const [, dd, mm, rawYear] = match;
        const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
        return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().split("T")[0];
}
