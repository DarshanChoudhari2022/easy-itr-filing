import { useState, useEffect } from "react";
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
    Info
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function AuditLogs() {
    const [logs, setLogs] = useState([
        { id: 1, action: "ITR-2 Generated", user: "Darshan C.", module: "Income Tax", timestamp: "2026-01-29 18:45", severity: "info" },
        { id: 2, action: "GSTR-2B Mismatch Flagged", user: "System", module: "GST", timestamp: "2026-01-29 17:30", severity: "warning" },
        { id: 3, action: "Crypto FIFO Recalculated", user: "Darshan C.", module: "Assets", timestamp: "2026-01-29 16:15", severity: "info" },
        { id: 4, action: "Sch FA Declaration Added", user: "Darshan C.", module: "Foreign Compliance", timestamp: "2026-01-29 15:00", severity: "success" },
    ]);

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
                        <Button variant="outline" className="gap-2">
                            <Download className="h-4 w-4" /> Export for Auditor
                        </Button>
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
                                    <Input placeholder="Filter by action or user..." className="pl-8" />
                                </div>
                                <Button variant="outline" size="icon">
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
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
                                {logs.map((log) => (
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
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
