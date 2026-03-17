import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Users,
    Briefcase,
    FileCheck,
    Clock,
    Plus,
    Download,
    Search,
    CheckCircle2,
    TrendingUp,
    ShieldAlert,
    UsersRound
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FirmClient {
    id: number;
    name: string;
    pan: string;
    status: string;
    assignedTo: string;
    risk: string;
}

export default function ProfessionalFirm() {
    const [clients] = useState<FirmClient[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.pan.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <AppLayout>
            <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
                {/* Firm Pulse Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            <Briefcase className="h-8 w-8 text-primary" />
                            Firm Management Hub
                        </h1>
                        <p className="text-muted-foreground font-medium">Enterprise console for CA Firms & Tax Professionals.</p>
                    </div>
                    <div className="flex gap-3">
                        {clients.length > 0 && (
                            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export All Data</Button>
                        )}
                        <Button className="gap-2 bg-primary shadow-xl shadow-primary/20"><Plus className="h-4 w-4" /> Add New Client</Button>
                    </div>
                </div>

                {/* Firm Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <FirmStat label="Active Clients" value={String(clients.length)} sub={clients.length > 0 ? "Managed" : "Add clients to begin"} icon={<Users className="text-blue-500" />} />
                    <FirmStat label="Total Filings" value="0" sub="No filings yet" icon={<FileCheck className="text-emerald-500" />} />
                    <FirmStat label="Avg. Turnaround" value="—" sub="Track processing time" icon={<Clock className="text-amber-500" />} />
                    <FirmStat label="Revenue" value="—" sub="Track in firm settings" icon={<TrendingUp className="text-indigo-500" />} />
                </div>

                {/* Client Management Interface */}
                <Card className="border-slate-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Client Portfolio</CardTitle>
                                <CardDescription>Real-time status tracking for all assigned PANs.</CardDescription>
                            </div>
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search PAN or Client Name..."
                                    className="pl-10 h-10 w-full"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {filteredClients.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                                <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                    <UsersRound className="h-8 w-8 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">No clients added yet</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                                    Add your first client to start managing their ITR and GST filings from this professional dashboard.
                                </p>
                                <Button className="gap-2 bg-primary shadow-xl shadow-primary/20">
                                    <Plus className="h-4 w-4" /> Add First Client
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="font-bold">Client Name</TableHead>
                                        <TableHead className="font-bold">PAN Details</TableHead>
                                        <TableHead className="font-bold text-center">Audit Risk</TableHead>
                                        <TableHead className="font-bold">Assigned Staff</TableHead>
                                        <TableHead className="font-bold">Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredClients.map(client => (
                                        <TableRow key={client.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="font-bold text-slate-900">{client.name}</TableCell>
                                            <TableCell className="font-mono text-xs uppercase text-slate-500">{client.pan}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={
                                                    client.risk === 'High' ? 'bg-rose-500 font-black' :
                                                        client.risk === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'
                                                }>
                                                    {client.risk.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium text-slate-600">{client.assignedTo}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-2 w-2 rounded-full ${client.status === 'Filed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                                    <span className="text-xs font-bold uppercase tracking-tighter">{client.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="font-bold text-primary">MANAGE</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Audit Intelligence Panel */}
                <div className="grid md:grid-cols-2 gap-6 pb-12">
                    <Card className="border-rose-100 bg-rose-50/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-rose-900">
                                <ShieldAlert className="h-5 w-5" /> Critical Notice Risk
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-xl bg-white border border-rose-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-slate-900">No high-risk disclosures</p>
                                    <p className="text-xs text-slate-500 mt-1">Add clients to start risk monitoring</p>
                                </div>
                                <Button variant="outline" size="sm" className="border-rose-200 text-rose-600">Review</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-100 bg-emerald-50/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-emerald-900">
                                <CheckCircle2 className="h-5 w-5" /> Automation Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-xl bg-white border border-emerald-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-slate-900">Auto-fill ready</p>
                                    <p className="text-xs text-slate-500 mt-1">Data fetched via AIS/26AS/EasyITR Engine</p>
                                </div>
                                <Badge className="bg-emerald-500">READY</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}

interface FirmStatProps {
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
}

function FirmStat({ label, value, sub, icon }: FirmStatProps) {
    return (
        <Card className="border-slate-100 shadow-sm">
            <CardContent className="p-6">
                <div className="flex justify-between items-start">
                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center">{icon}</div>
                </div>
                <div className="mt-4">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 leading-none">{label}</p>
                    <p className="text-2xl font-black text-slate-900 mt-2">{value}</p>
                    <p className="text-[11px] font-bold text-emerald-600 mt-1">{sub}</p>
                </div>
            </CardContent>
        </Card>
    );
}

