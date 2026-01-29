import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Users,
    Search,
    UserPlus,
    Filter,
    MoreHorizontal,
    FileCheck,
    AlertCircle,
    Download,
    Mail,
    Shield
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ClientManagement() {
    const clients = [
        { id: 1, name: "Acme Corp Pvt Ltd", type: "Enterprise", status: "Active", filing: "GSTR-1 Pending", manager: "Darshan C." },
        { id: 2, name: "TechFlow Solutions", type: "SME", status: "Action Required", filing: "ITR-3 Review", manager: "Priya S." },
        { id: 3, name: "Rohan Sharma", type: "Individual", status: "Active", filing: "Completed", manager: "Darshan C." },
        { id: 4, name: "CryptoHoldings Inc", type: "Startup", status: "Active", filing: "Crypto Summary Ready", manager: "Ankit M." },
    ];

    return (
        <AppLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Client Hub</h1>
                        <p className="text-muted-foreground">Managing 156 active clients across GST and ITR</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="gap-2">
                            <Download className="h-4 w-4" /> Export Report
                        </Button>
                        <Button className="gap-2 bg-primary">
                            <UserPlus className="h-4 w-4" /> Add New Client
                        </Button>
                    </div>
                </div>

                {/* Global Firm Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                    <StatCard title="Total Clients" value="156" icon={<Users className="h-4 w-4" />} trend="+4 this month" />
                    <StatCard title="Filings This Month" value="89" icon={<FileCheck className="h-4 w-4" />} trend="78% complete" />
                    <StatCard title="Critical Notices" value="3" icon={<AlertCircle className="h-4 w-4" />} trend="High priority" color="text-destructive" />
                    <StatCard title="Compliance Score" value="94%" icon={<Shield className="h-4 w-4" />} trend="Above industry avg" color="text-accent" />
                </div>

                {/* Client List */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Master Client List</CardTitle>
                                <CardDescription>Search and manage all clients in your firm</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 max-w-sm w-full">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search name, GSTIN, or PAN..." className="pl-8" />
                                </div>
                                <Button variant="outline" size="icon">
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                                    <tr>
                                        <th className="px-6 py-3">Client Name</th>
                                        <th className="px-6 py-3">Type</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3">Latest Task</th>
                                        <th className="px-6 py-3">Assigned To</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {clients.map((client) => (
                                        <tr key={client.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 font-semibold">{client.name}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline" className="font-normal">{client.type}</Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-2 w-2 rounded-full ${client.status === 'Active' ? 'bg-accent' : 'bg-warning'}`} />
                                                    {client.status}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={client.filing.includes('Pending') ? 'text-warning font-medium' : ''}>
                                                    {client.filing}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">{client.manager}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <Mail className="h-4 w-4" />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem>View Profile</DropdownMenuItem>
                                                            <DropdownMenuItem>Open Dashboard</DropdownMenuItem>
                                                            <DropdownMenuItem>Upload Documents</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-destructive">Archive Client</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

const StatCard = ({ title, value, icon, trend, color }: any) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
            <div className={`text-2xl font-bold ${color || ''}`}>{value}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{trend}</p>
        </CardContent>
    </Card>
);
