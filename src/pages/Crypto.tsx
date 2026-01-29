import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Bitcoin, Loader2, AlertTriangle, TrendingUp, TrendingDown, Info } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface CryptoTrade {
  id: string;
  exchange: string;
  token_symbol: string;
  token_name: string | null;
  trade_type: string;
  quantity: number;
  buy_price: number;
  sell_price: number | null;
  trade_date: string;
  gain_loss: number | null;
  tds_paid: number;
}

export default function Crypto() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<CryptoTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  
  const [newTrade, setNewTrade] = useState({
    exchange: "CoinDCX",
    token_symbol: "",
    token_name: "",
    trade_type: "sell",
    quantity: "",
    buy_price: "",
    sell_price: "",
    trade_date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (user) {
      fetchTrades();
    }
  }, [user]);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from("crypto_trades")
        .select("*")
        .eq("user_id", user!.id)
        .order("trade_date", { ascending: false });

      if (error) throw error;
      setTrades(data || []);
    } catch (error) {
      console.error("Error fetching trades:", error);
      toast.error("Failed to load crypto trades");
    } finally {
      setLoading(false);
    }
  };

  const addTrade = async () => {
    if (!newTrade.token_symbol || !newTrade.quantity || !newTrade.buy_price) {
      toast.error("Please fill in required fields");
      return;
    }

    setSaving(true);
    try {
      const quantity = parseFloat(newTrade.quantity);
      const buyPrice = parseFloat(newTrade.buy_price);
      const sellPrice = newTrade.sell_price ? parseFloat(newTrade.sell_price) : null;
      
      // Calculate gain/loss for sell trades
      let gainLoss = null;
      let tdsPaid = 0;
      
      if (newTrade.trade_type === "sell" && sellPrice) {
        gainLoss = (sellPrice - buyPrice) * quantity;
        // 1% TDS on sale consideration (only if gain)
        if (gainLoss > 0) {
          tdsPaid = sellPrice * quantity * 0.01;
        }
      }

      const { error } = await supabase.from("crypto_trades").insert({
        user_id: user!.id,
        exchange: newTrade.exchange,
        token_symbol: newTrade.token_symbol.toUpperCase(),
        token_name: newTrade.token_name || null,
        trade_type: newTrade.trade_type,
        quantity,
        buy_price: buyPrice,
        sell_price: sellPrice,
        trade_date: newTrade.trade_date,
        gain_loss: gainLoss,
        tds_paid: tdsPaid,
      });

      if (error) throw error;
      
      toast.success("Trade added");
      setDialogOpen(false);
      setNewTrade({
        exchange: "CoinDCX",
        token_symbol: "",
        token_name: "",
        trade_type: "sell",
        quantity: "",
        buy_price: "",
        sell_price: "",
        trade_date: new Date().toISOString().split("T")[0],
      });
      fetchTrades();
    } catch (error: any) {
      console.error("Error adding trade:", error);
      toast.error(error.message || "Failed to add trade");
    } finally {
      setSaving(false);
    }
  };

  const deleteTrade = async (id: string) => {
    try {
      const { error } = await supabase.from("crypto_trades").delete().eq("id", id);
      if (error) throw error;
      toast.success("Trade deleted");
      fetchTrades();
    } catch (error: any) {
      console.error("Error deleting trade:", error);
      toast.error(error.message || "Failed to delete trade");
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n");
      const headers = lines[0].toLowerCase().split(",");
      
      // Detect exchange format
      const isCoinDCX = headers.some(h => h.includes("coindcx") || h.includes("coin"));
      const isBinance = headers.some(h => h.includes("binance") || h.includes("market"));
      
      const exchange = isCoinDCX ? "CoinDCX" : isBinance ? "Binance" : "Other";
      
      const parsedTrades: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(",");
        
        // Parse based on expected format
        // This is a simplified parser - real implementation would handle more edge cases
        const trade = {
          user_id: user!.id,
          exchange,
          token_symbol: values[0]?.toUpperCase().replace(/"/g, "").split("/")[0] || "UNKNOWN",
          trade_type: values[1]?.toLowerCase().includes("sell") ? "sell" : "buy",
          quantity: parseFloat(values[2]?.replace(/"/g, "") || "0"),
          buy_price: parseFloat(values[3]?.replace(/"/g, "") || "0"),
          sell_price: parseFloat(values[4]?.replace(/"/g, "") || "0") || null,
          trade_date: values[5]?.replace(/"/g, "") || new Date().toISOString().split("T")[0],
          gain_loss: null as number | null,
          tds_paid: 0,
        };
        
        // Calculate gain/loss
        if (trade.trade_type === "sell" && trade.sell_price) {
          trade.gain_loss = (trade.sell_price - trade.buy_price) * trade.quantity;
          if (trade.gain_loss > 0) {
            trade.tds_paid = trade.sell_price * trade.quantity * 0.01;
          }
        }
        
        if (trade.quantity > 0 && trade.buy_price > 0) {
          parsedTrades.push(trade);
        }
      }
      
      if (parsedTrades.length === 0) {
        toast.error("No valid trades found in file. Please check the format.");
        return;
      }
      
      const { error } = await supabase.from("crypto_trades").insert(parsedTrades);
      
      if (error) throw error;
      
      toast.success(`Imported ${parsedTrades.length} trades from ${exchange}`);
      fetchTrades();
    } catch (error: any) {
      console.error("Error importing file:", error);
      toast.error("Failed to import file. Please check the format.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }, [user]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate summaries
  const totalGains = trades.reduce((sum, t) => sum + Math.max(t.gain_loss || 0, 0), 0);
  const totalLosses = trades.reduce((sum, t) => sum + Math.min(t.gain_loss || 0, 0), 0);
  const netGainLoss = totalGains + totalLosses;
  const totalTds = trades.reduce((sum, t) => sum + (t.tds_paid || 0), 0);
  
  // Tax calculation (30% flat rate on gains, no loss set-off)
  const taxOnCrypto = totalGains * 0.30;

  const chartData = [
    { name: "Tax (30%)", value: taxOnCrypto, color: "hsl(var(--destructive))" },
    { name: "Net Gains", value: Math.max(totalGains - taxOnCrypto, 0), color: "hsl(var(--accent))" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Bitcoin className="h-8 w-8" />
              Crypto Tax Center
            </h1>
            <p className="text-muted-foreground">
              Section 115BBH • Virtual Digital Assets (VDA) Tax
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={importing}
              />
              <Button variant="outline" disabled={importing}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import CSV
              </Button>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Trade
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Crypto Trade</DialogTitle>
                  <DialogDescription>
                    Enter your crypto trade details
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Exchange</Label>
                      <Select
                        value={newTrade.exchange}
                        onValueChange={(value) => setNewTrade({ ...newTrade, exchange: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CoinDCX">CoinDCX</SelectItem>
                          <SelectItem value="Binance">Binance</SelectItem>
                          <SelectItem value="WazirX">WazirX</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trade Type</Label>
                      <Select
                        value={newTrade.trade_type}
                        onValueChange={(value) => setNewTrade({ ...newTrade, trade_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Token Symbol *</Label>
                      <Input
                        placeholder="BTC, ETH, etc."
                        value={newTrade.token_symbol}
                        onChange={(e) => setNewTrade({ ...newTrade, token_symbol: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        step="0.00000001"
                        placeholder="0.00"
                        value={newTrade.quantity}
                        onChange={(e) => setNewTrade({ ...newTrade, quantity: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Buy Price (₹) *</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newTrade.buy_price}
                        onChange={(e) => setNewTrade({ ...newTrade, buy_price: e.target.value })}
                      />
                    </div>
                    {newTrade.trade_type === "sell" && (
                      <div className="space-y-2">
                        <Label>Sell Price (₹)</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={newTrade.sell_price}
                          onChange={(e) => setNewTrade({ ...newTrade, sell_price: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Trade Date</Label>
                    <Input
                      type="date"
                      value={newTrade.trade_date}
                      onChange={(e) => setNewTrade({ ...newTrade, trade_date: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={addTrade} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add Trade
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tax Rules Info */}
        <Card className="border-warning bg-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">2026 Crypto Tax Rules (Section 115BBH)</p>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>• Flat 30% tax on crypto gains - no slab benefit</li>
                  <li>• No set-off of losses against gains from other tokens</li>
                  <li>• 1% TDS (Section 194S) on sale consideration above ₹10,000</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                Total Gains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-accent">{formatCurrency(totalGains)}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Total Losses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(Math.abs(totalLosses))}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tax on Crypto (30%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(taxOnCrypto)}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                TDS Paid (1%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-accent">{formatCurrency(totalTds)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart and Table */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Donut Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Gains vs Tax</CardTitle>
              <CardDescription>Breakdown of your crypto profits</CardDescription>
            </CardHeader>
            <CardContent>
              {totalGains > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Add trades to see breakdown</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trades Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
              <CardDescription>
                {trades.length} trade{trades.length !== 1 ? "s" : ""} recorded
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8">
                  <Bitcoin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-medium text-lg mb-1">No crypto trades yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Import from CoinDCX/Binance or add manually
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Exchange</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Gain/Loss</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.slice(0, 10).map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-medium">{trade.token_symbol}</TableCell>
                        <TableCell>
                          <Badge variant={trade.trade_type === "sell" ? "destructive" : "default"}>
                            {trade.trade_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{trade.exchange}</TableCell>
                        <TableCell className="text-right">{trade.quantity.toFixed(4)}</TableCell>
                        <TableCell className={`text-right font-medium ${(trade.gain_loss || 0) >= 0 ? "text-accent" : "text-destructive"}`}>
                          {trade.gain_loss ? formatCurrency(trade.gain_loss) : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteTrade(trade.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
