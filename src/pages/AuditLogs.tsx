import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Activity,
    Search,
    Filter,
    Download,
    AlertCircle,
    CheckCircle2,
    Info,
    ClipboardList
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuditLog {
    id: number;
    action: string;
    user: string;
    module: string;
    timestamp: string;
    severity: "info" | "warning" | "success";
}

export default function AuditLogs() {
    const [logs] = useState<AuditLog[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.module.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <AppLayout>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <Activity className="h-8 w-8 text-primary" />
                            Audit Repository
                        </h1>
                        <p className="text-muted-foreground italic">Comprehensive logs for enterprise compliance & security.</p>
                    </div>
                    <div className="flex gap-3">
                        {logs.length > 0 && (
                            <Button variant="outline" className="gap-2">
                                <Download className="h-4 w-4" /> Export for Auditor
                            </Button>
                        )}
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>System Activity</CardTitle>
                                <CardDescription>Track every tax computation and data change.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 max-w-sm w-full">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Filter by action or user..."
                                        className="pl-8"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" size="icon">
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                    <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">No activity recorded yet</h3>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    System actions like tax computations, data imports, and filing events will appear here automatically as you use EasyITR.
                                </p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Module</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Severity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs font-mono text-muted-foreground">{log.timestamp}</TableCell>
                                            <TableCell className="font-bold">{log.action}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{log.module}</Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">{log.user}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={log.severity === 'warning' ? 'destructive' : log.severity === 'success' ? 'default' : 'secondary'}
                                                    className={log.severity === 'success' ? 'bg-success/10 text-success' : ''}
                                                >
                                                    {log.severity.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}

