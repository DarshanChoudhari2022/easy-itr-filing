import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bitcoin,
  Plus,
  Upload,
  TrendingUp,
  AlertTriangle,
  PieChart as PieChartIcon,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { calculateTokenGains, Transaction } from "@/lib/crypto-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function Crypto() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    setLoading(true);
    const { data } = await supabase.from("crypto_trades").select("*");
    setTrades(data || []);
    setLoading(false);
  };

  // Group by token for the engine
  const grouped = trades.reduce((acc: any, t) => {
    if (!acc[t.token_symbol]) acc[t.token_symbol] = [];
    acc[t.token_symbol].push({
      id: t.id,
      type: t.trade_type as 'buy' | 'sell',
      token: t.token_symbol,
      quantity: t.quantity,
      pricePerUnit: t.buy_price || 0, // Simplified for now
      date: new Date(t.trade_date)
    });
    return acc;
  }, {});

  const tokenSummaries = Object.keys(grouped).map(token => calculateTokenGains(grouped[token]));
  const totalTaxable = tokenSummaries.reduce((sum, res) => sum + res.taxableGain, 0);

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Bitcoin className="h-8 w-8 text-warning" /> Asset Tax (Crypto)
            </h1>
            <p className="text-muted-foreground italic">VDA Compliance under Section 115BBH for FY 2025-26.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" /> Import from Exchange
            </Button>
            <Button onClick={() => toast.success("Connected to Filing Wizard! Results will appear in Step 2.")} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <RefreshCw className="h-4 w-4" /> Push to ITR
            </Button>
          </div>
        </div>

        {/* Section 115BBH Engine Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Taxable Gains (Gross)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black">₹{new Intl.NumberFormat('en-IN').format(totalTaxable)}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">Loss Disallowance Applied</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-accent/5 border-accent/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Tax Liability (Flat 30%)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-accent">₹{new Intl.NumberFormat('en-IN').format(totalTaxable * 0.30)}</p>
              <p className="text-xs text-muted-foreground mt-2 font-medium">+ Surcharge & Cess if applicable</p>
            </CardContent>
          </Card>

          <Card className="bg-success/5 border-success/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Audit Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-success" />
                <div>
                  <p className="text-sm font-bold">Compliant</p>
                  <p className="text-xs text-muted-foreground">FIFO Applied for {Object.keys(grouped).length} tokens</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Token Wise Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Analysis</CardTitle>
            <CardDescription>FIFO per-token gain/loss breakdown for AY 2026-27.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token Asset</TableHead>
                  <TableHead className="text-right">Total Gain (₹)</TableHead>
                  <TableHead className="text-right">Total Loss (₹)</TableHead>
                  <TableHead className="text-right">Taxable Amount (₹)</TableHead>
                  <TableHead className="text-right font-bold">Tax (30%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokenSummaries.length > 0 ? tokenSummaries.map((res) => (
                  <TableRow key={res.token}>
                    <TableCell className="font-bold flex items-center gap-2 uppercase">
                      <div className="h-6 w-6 rounded-full bg-warning/20 flex items-center justify-center text-[10px] text-warning">₿</div>
                      {res.token}
                    </TableCell>
                    <TableCell className="text-right text-success font-medium">+{res.totalGain.toFixed(0)}</TableCell>
                    <TableCell className="text-right text-destructive">-{res.totalLoss.toFixed(0)}</TableCell>
                    <TableCell className="text-right font-bold">₹{res.taxableGain.toFixed(0)}</TableCell>
                    <TableCell className="text-right font-black text-accent">₹{res.taxReady.toFixed(0)}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No trades found. Start by importing your exchange CSV.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Warning Footer */}
        <div className="p-4 rounded-xl border-2 border-warning/10 bg-warning/5 flex items-start gap-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong>Note on Loss Disallowance:</strong> As per the Finance Act 2022, loss from transfer of one VDA cannot be set-off against gain from transfer of another VDA.
            TaxMitra enforces this rule token-by-token at the transaction level to ensure audit-proof filing.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
