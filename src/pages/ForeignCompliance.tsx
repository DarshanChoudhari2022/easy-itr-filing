import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Globe,
    Plus,
    Trash2,
    ShieldAlert,
    Info,
    DollarSign,
    Briefcase,
    Landmark,
    FileCheck,
    TrendingUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PlanGate } from "@/hooks/usePlanGuard";

export default function ForeignCompliance() {
    const { user } = useAuth();
    const [assets, setAssets] = useState<Database["public"]["Tables"]["foreign_assets"]["Row"][]>([]);
    const [income, setIncome] = useState<Database["public"]["Tables"]["foreign_income"]["Row"][]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        const { data: assetData } = await supabase.from("foreign_assets").select("*");
        const { data: incomeData } = await supabase.from("foreign_income").select("*");
        setAssets(assetData || []);
        setIncome(incomeData || []);
        setLoading(false);
    };

    return (
        <AppLayout>
            <PlanGate feature="foreign_compliance">
                <div className="space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                                <Globe className="h-8 w-8 text-primary" />
                                Global Compliance Center
                            </h1>
                            <p className="text-muted-foreground italic">Managing DTAA, Foreign Assets (Sch FA), and Overseas Income.</p>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" className="gap-2">
                                <Info className="h-4 w-4" /> Compliance Guide
                            </Button>
                            <Button className="gap-2">
                                <Plus className="h-4 w-4" /> Add Declaration
                            </Button>
                        </div>
                    </div>

                    {/* Severe Warning for Foreign Assets */}
                    <div className="p-6 rounded-2xl bg-destructive/5 border-2 border-destructive/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ShieldAlert className="h-24 w-24 text-destructive" />
                        </div>
                        <div className="flex gap-4 items-start relative z-10">
                            <ShieldAlert className="h-6 w-6 text-destructive mt-1 shrink-0" />
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-destructive">Crucial: Black Money Act Compliance</h3>
                                <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                                    As an Indian resident, failing to disclose foreign assets (including RSUs, bank accounts, or ESOPs from US employers)
                                    can lead to a <strong>₹10,00,000 penalty</strong> per year and prosecution, even if the income was not taxable.
                                    TaxMitra helps you automate <strong>Schedule FA</strong> filing to stay 100% safe.
                                </p>
                            </div>
                        </div>
                    </div>

                    <Tabs defaultValue="assets" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 lg:max-w-md bg-muted/50 p-1 rounded-xl">
                            <TabsTrigger value="assets" className="rounded-lg">Schedule FA (Assets)</TabsTrigger>
                            <TabsTrigger value="income" className="rounded-lg">Foreign Income & DTAA</TabsTrigger>
                        </TabsList>

                        <TabsContent value="assets" className="mt-6">
                            <Card className="border-2 border-primary/5">
                                <CardHeader>
                                    <CardTitle>Foreign Assets Registry</CardTitle>
                                    <CardDescription>Accounts, Stocks (RSUs/ESOPs), and Property held outside India.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Asset Type</TableHead>
                                                <TableHead>Country</TableHead>
                                                <TableHead>Entity Name</TableHead>
                                                <TableHead className="text-right">Peak Value (₹)</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell className="font-bold">Equity (RSUs)</TableCell>
                                                <TableCell><Badge variant="secondary">USA</Badge></TableCell>
                                                <TableCell>Alphabet Inc. (Google)</TableCell>
                                                <TableCell className="text-right font-mono">₹42,50,000</TableCell>
                                                <TableCell><Badge className="bg-success">Verified</Badge></TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-bold">Bank Account</TableCell>
                                                <TableCell><Badge variant="secondary">UK</Badge></TableCell>
                                                <TableCell>HSBC London</TableCell>
                                                <TableCell className="text-right font-mono">₹3,20,000</TableCell>
                                                <TableCell><Badge className="bg-success">Verified</Badge></TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </CardContent>
                                <CardFooter className="bg-muted/10">
                                    <Button variant="ghost" className="text-primary gap-2">
                                        <Plus className="h-4 w-4" /> Add another asset
                                    </Button>
                                </CardFooter>
                            </Card>
                        </TabsContent>

                        <TabsContent value="income" className="mt-6">
                            <div className="grid gap-6 lg:grid-cols-3">
                                {/* Income Summary */}
                                <Card className="lg:col-span-2">
                                    <CardHeader>
                                        <CardTitle>Foreign Income & Tax Credit</CardTitle>
                                        <CardDescription>Claim relief under Section 90/91 (DTAA).</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Income source</TableHead>
                                                    <TableHead>Gross FCY</TableHead>
                                                    <TableHead>Tax Paid (FCY)</TableHead>
                                                    <TableHead className="text-right">Relief Claimed (₹)</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                <TableRow>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold">US Dividends</span>
                                                            <span className="text-xs text-muted-foreground">Article 10 of Indo-US DTAA</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>$5,400</TableCell>
                                                    <TableCell>$810 (15%)</TableCell>
                                                    <TableCell className="text-right font-bold text-accent">₹68,200</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>

                                {/* DTAA Optimization Card */}
                                <Card className="bg-primary/5 border-primary/20">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <TrendingUp className="h-5 w-5 text-primary" /> Tax Optimizer
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="p-3 bg-background rounded-lg border">
                                            <p className="text-xs font-bold text-muted-foreground uppercase">Form 67 Status</p>
                                            <p className="text-sm font-medium mt-1">Ready for submission</p>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Our AI has calculated tax credits for your US RSU sales. You saved <strong>₹1.2 Lakh</strong> in double taxation.
                                        </div>
                                        <Button className="w-full">Download Form 67 Draft</Button>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </PlanGate>
        </AppLayout>
    );
}
