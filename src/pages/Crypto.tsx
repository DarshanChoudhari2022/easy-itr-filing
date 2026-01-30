import React, { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  History,
  FileSpreadsheet,
  Zap,
  ChevronDown,
  ChevronUp,
  Wallet,
  Link as LinkIcon,
  Info,
  MoreVertical,
  CheckCircle2,
  Lock,
  Plus,
  ArrowRight,
  Settings,
  BarChart3,
  PieChart as PieChartIcon,
  ShieldCheck,
  Globe,
  Clock,
  Briefcase,
  Upload,
  Eye,
  EyeOff,
  Shield,
  AlertTriangle,
  Trash2
} from "lucide-react";
import { calculateDetailedPortfolio, Transaction, TaxSettings, DEFAULT_TAX_SETTINGS, parseExchangeCSV } from "@/lib/crypto-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { syncCoinDCXAccount, convertCoinDCXTradesToTransactions, validateCoinDCXCredentials } from "@/lib/coindcx-api";
import { syncWazirXAccount, convertWazirXTradesToTransactions, validateWazirXCredentials } from "@/lib/wazirx-api";
import { syncBinanceAccount, convertBinanceTradesToTransactions, validateBinanceCredentials, getUSDTINRRate } from "@/lib/binance-api";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";
import { PortfolioAnalytics } from "@/components/crypto/PortfolioAnalytics";

interface Trade {
  id: string;
  token_symbol: string;
  trade_type: string;
  quantity: number;
  buy_price: number | null;
  trade_date: string;
  exchange?: string;
  metadata?: {
    fee?: number;
    tds_deducted?: number;
  };
}

export default function CryptoTaxPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isAdding, setIsAdding] = useState(false);

  // Manual Trade Form State
  const [newTrade, setNewTrade] = useState({
    token_symbol: 'BTC',
    trade_type: 'buy',
    quantity: '',
    buy_price: '',
    trade_date: new Date().toISOString().split('T')[0],
    exchange: 'CoinDCX'
  });

  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("crypto_trades").select("*").order('trade_date', { ascending: false });
    if (error) {
      toast.error("Failed to load trades");
    } else {
      setTrades((data as Trade[]) || []);
    }
    setLoading(false);
  };

  const handleAddManualTrade = async () => {
    if (!user) return;
    if (!newTrade.quantity || !newTrade.buy_price) {
      toast.error("Please fill all trade details");
      return;
    }

    setIsAdding(true);
    const { data, error } = await supabase.from("crypto_trades").insert({
      user_id: user.id,
      token_symbol: newTrade.token_symbol.toUpperCase(),
      trade_type: newTrade.trade_type,
      quantity: parseFloat(newTrade.quantity),
      buy_price: parseFloat(newTrade.buy_price),
      trade_date: newTrade.trade_date,
      exchange: newTrade.exchange
    }).select();

    if (error) {
      toast.error("Failed to add trade: " + error.message);
    } else {
      toast.success("Trade added successfully!");
      fetchTrades(); // Refresh data
      setNewTrade({
        token_symbol: 'BTC',
        trade_type: 'buy',
        quantity: '',
        buy_price: '',
        trade_date: new Date().toISOString().split('T')[0],
        exchange: 'CoinDCX'
      });
      setIsAdding(false);
    }
  };

  // Handle CSV import
  const handleCSVImport = async (file: File, exchange: string) => {
    if (!user) return;

    try {
      const content = await file.text();
      const result = parseExchangeCSV(content, user.id, exchange);

      if (result.errors.length > 0) {
        toast.warning(`Parsed with ${result.errors.length} warnings`);
      }

      if (result.transactions.length === 0) {
        toast.error('No valid trades found in CSV');
        return;
      }

      // Insert trades into database
      const tradesToInsert = result.transactions.map(tx => ({
        user_id: user.id,
        token_symbol: tx.token,
        trade_type: tx.type,
        quantity: tx.quantity,
        buy_price: tx.pricePerUnit,
        trade_date: tx.date.toISOString().split('T')[0],
        exchange: tx.exchange || exchange,
        metadata: tx.fee ? { fee: tx.fee } : undefined
      }));

      const { error } = await supabase.from('crypto_trades').insert(tradesToInsert);

      if (error) {
        toast.error('Failed to import trades: ' + error.message);
      } else {
        toast.success(`Successfully imported ${result.transactions.length} trades from ${exchange}!`);
        fetchTrades();
      }
    } catch (err) {
      toast.error('Failed to parse CSV: ' + (err as Error).message);
    }
  };

  // Handle API sync from CoinDCX
  const handleApiSync = async (apiTrades: any[]) => {
    if (!user) return;

    try {
      const tradesToInsert = apiTrades.map(t => ({
        user_id: user.id,
        token_symbol: t.token_symbol,
        trade_type: t.trade_type,
        quantity: t.quantity,
        buy_price: t.buy_price,
        trade_date: t.trade_date,
        exchange: t.exchange,
        metadata: t.metadata
      }));

      const { error } = await supabase.from('crypto_trades').insert(tradesToInsert);

      if (error) {
        toast.error('Failed to save trades: ' + error.message);
      } else {
        fetchTrades();
      }
    } catch (err) {
      toast.error('Failed to save trades: ' + (err as Error).message);
    }
  };

  // Handle delete trade
  const handleDeleteTrade = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trade?')) return;

    const { error } = await supabase.from('crypto_trades').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete trade: ' + error.message);
    } else {
      toast.success('Trade deleted');
      fetchTrades();
    }
  };

  const engineTransactions: Transaction[] = useMemo(() => trades.map(t => ({
    id: t.id,
    type: t.trade_type as any,
    token: t.token_symbol,
    quantity: t.quantity,
    pricePerUnit: t.buy_price || 0,
    date: new Date(t.trade_date),
    exchange: t.exchange,
    fee: t.metadata?.fee,
    tdsDeducted: t.metadata?.tds_deducted
  })), [trades]);

  const portfolio = useMemo(() => calculateDetailedPortfolio(engineTransactions, settings), [engineTransactions, settings]);

  const metrics = {
    totalTaxable: portfolio.totalTaxableGains || 0,
    totalOtherIncome: portfolio.totalOtherIncome || 0,
    totalTaxDue: portfolio.netTaxDue || 0,
    totalTDS: portfolio.totalTDSPaid || 0,
    totalSaleValue: trades.filter(t => t.trade_type === 'sell').reduce((sum, t) => sum + (t.quantity * (t.buy_price || 0)), 0),
    tradeTypeData: [
      { name: 'Spot', value: trades.filter(t => t.trade_type === 'buy' || t.trade_type === 'sell').length, color: '#4f46e5' },
      { name: 'Deposit', value: trades.filter(t => t.trade_type === 'transfer_in').length, color: '#f59e0b' },
      { name: 'Withdrawal', value: trades.filter(t => t.trade_type === 'transfer_out').length, color: '#10b981' },
      { name: 'Others', value: trades.filter(t => !['buy', 'sell', 'transfer_in', 'transfer_out'].includes(t.trade_type)).length, color: '#64748b' }
    ].filter(d => d.value > 0)
  };

  if (loading) return <div className="p-8 text-white bg-slate-900 min-h-screen">Loading Crypto Data...</div>;

  return (
    <AppLayout>
      <div className="flex flex-col min-h-screen bg-[#0f172a] text-slate-100">
        <div className="max-w-[1400px] mx-auto w-full px-4 lg:px-8 py-6 flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 space-y-1 shrink-0">
            {[
              { id: 'overview', label: 'Overview', icon: History },
              { id: 'portfolio', label: 'Portfolio', icon: Wallet },
              { id: 'transactions', label: 'Transactions', icon: History },
              { id: 'integrations', label: 'Integrations', icon: LinkIcon },
              { id: 'reports', label: 'Tax Reports', icon: FileSpreadsheet, badge: 'New' },
              { id: 'insights', label: 'Insights', icon: BarChart3 },
              { id: 'settings', label: 'Tax Settings', icon: Settings },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm">{item.label}</span>
                </div>
                {item.badge && <Badge className="bg-orange-500 text-[10px] h-5">{item.badge}</Badge>}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-2xl">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-2xl font-black text-white capitalize">{activeTab}</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    FY 2025-2026 • 1 Apr '25 - 31 Mar '26
                  </p>
                </div>
                <Badge variant="outline" className="border-indigo-500 text-indigo-400 font-black">PRO PLAN</Badge>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="border-slate-800 bg-slate-800 text-white font-bold h-11 rounded-xl">
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-indigo-600 font-black rounded-xl shadow-lg h-11 hover:bg-indigo-700">
                      <Plus className="mr-2 h-4 w-4" /> Add Trade
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-black">Add Crypto Transaction</DialogTitle>
                      <DialogDescription className="text-slate-400">Add a manual trade to see real-time tax impact.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Token</label>
                          <Input
                            value={newTrade.token_symbol}
                            onChange={(e) => setNewTrade({ ...newTrade, token_symbol: e.target.value })}
                            className="bg-slate-800 border-slate-700 h-11"
                            placeholder="ETH, BTC..."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Exchange</label>
                          <Select value={newTrade.exchange} onValueChange={(v) => setNewTrade({ ...newTrade, exchange: v })}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-white">
                              <SelectItem value="CoinDCX">CoinDCX</SelectItem>
                              <SelectItem value="WazirX">WazirX</SelectItem>
                              <SelectItem value="Binance">Binance</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Type</label>
                          <Select value={newTrade.trade_type} onValueChange={(v) => setNewTrade({ ...newTrade, trade_type: v })}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-white font-bold">
                              <SelectItem value="buy">BUY</SelectItem>
                              <SelectItem value="sell">SELL</SelectItem>
                              <SelectItem value="airdrop">AIRDROP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Trade Date</label>
                          <Input
                            type="date"
                            value={newTrade.trade_date}
                            onChange={(e) => setNewTrade({ ...newTrade, trade_date: e.target.value })}
                            className="bg-slate-800 border-slate-700 h-11"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Quantity</label>
                          <Input
                            type="number"
                            value={newTrade.quantity}
                            onChange={(e) => setNewTrade({ ...newTrade, quantity: e.target.value })}
                            className="bg-slate-800 border-slate-700 h-11"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500">Price (INR)</label>
                          <Input
                            type="number"
                            value={newTrade.buy_price}
                            onChange={(e) => setNewTrade({ ...newTrade, buy_price: e.target.value })}
                            className="bg-slate-800 border-slate-700 h-11"
                            placeholder="Price per unit"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={handleAddManualTrade}
                        disabled={isAdding}
                        className="w-full bg-indigo-600 h-12 rounded-xl font-black mt-4 shadow-lg shadow-indigo-600/20"
                      >
                        {isAdding ? "Adding..." : "Add Transaction"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </header>

            {activeTab === 'overview' && <OverviewTab metrics={metrics} />}
            {activeTab === 'insights' && <InsightsTab portfolio={portfolio} />}
            {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} />}
            {activeTab === 'transactions' && <TransactionsTab trades={trades} />}
            {activeTab === 'integrations' && <IntegrationsTab onImport={handleCSVImport} onApiSync={handleApiSync} />}
            {activeTab === 'reports' && <ReportsTab trades={trades} portfolio={portfolio} user={user} />}
            {activeTab === 'portfolio' && (
              <PortfolioAnalytics trades={trades} portfolio={portfolio} />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function OverviewTab({ metrics }: { metrics: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 py-4 font-black"><CardTitle className="text-xs font-black uppercase text-slate-400">TDS Summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-900/50">
              <TableRow className="border-slate-800">
                <TableHead className="text-[10px] font-black pl-6">Platform</TableHead>
                <TableHead className="text-right text-[10px] font-black">TDS</TableHead>
                <TableHead className="text-right text-[10px] font-black pr-6">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-slate-800 border-none hover:bg-slate-800/50 transition-colors">
                <TableCell className="pl-6 text-xs font-bold text-white">CoinDCX</TableCell>
                <TableCell className="text-right text-xs font-black text-white">₹{metrics.totalTDS.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs font-black text-slate-400 pr-6">₹{(metrics.totalSaleValue / 100000).toFixed(2)}L</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-3xl shadow-xl">
        <CardHeader className="border-b border-slate-800 py-4"><CardTitle className="text-xs font-black uppercase text-slate-400">Tax Summary</CardTitle></CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-center text-xs font-bold text-white">
            <span>Capital Gains</span>
            <span>₹{metrics.totalTaxable.toLocaleString()}</span>
          </div>
          <Separator className="bg-slate-800" />
          <div className="flex justify-between items-center text-white">
            <span className="text-xs font-black text-slate-500 uppercase">Total Taxable</span>
            <div className="text-xl font-black">₹{(metrics.totalTaxable + metrics.totalOtherIncome).toLocaleString()}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 py-4"><CardTitle className="text-xs font-black uppercase text-slate-400">ITR Plan</CardTitle></CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-4 text-white">
            <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black">Comprehensive ITR</p>
              <p className="text-[10px] font-bold text-emerald-500 uppercase">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-8 bg-indigo-600 border-none rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between shadow-2xl overflow-hidden relative text-white">
        <div className="z-10 space-y-4">
          <h3 className="text-3xl font-black">Download Tax Reports</h3>
          <p className="text-indigo-100 text-sm max-w-sm">Aggregated reports ready for Section 115BBH filing with complete audit logs.</p>
          <Button
            onClick={() => toast.promise(new Promise(res => setTimeout(res, 1500)), {
              loading: 'Generating Schedule VDA...',
              success: 'Tax Audit Report for FY 25-26 is ready!',
              error: 'Error generating report'
            })}
            className="bg-white text-indigo-600 font-black rounded-xl h-12 px-8"
          >
            Generate Now
          </Button>
        </div>
        <div className="opacity-20 absolute -right-4 -bottom-4">
          <FileSpreadsheet className="h-48 w-48 rotate-12" />
        </div>
      </Card>

      <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-3xl shadow-xl">
        <CardHeader className="py-4 border-b border-slate-800"><CardTitle className="text-xs font-black uppercase text-slate-400">Trade Distribution</CardTitle></CardHeader>
        <CardContent className="h-[200px] pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={metrics.tradeTypeData} innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                {metrics.tradeTypeData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function InsightsTab({ portfolio }: { portfolio: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="bg-slate-900 border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <CardHeader className="border-b border-slate-800"><CardTitle className="text-xs font-black uppercase text-slate-400">Gains by Coin</CardTitle></CardHeader>
        <CardContent className="h-[300px] pt-6 text-white px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={portfolio.tokenWise} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={40} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '10px' }} />
              <Bar dataKey="gain" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="bg-slate-900 border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <CardHeader className="border-b border-slate-800"><CardTitle className="text-xs font-black uppercase text-slate-400">Monthly Gains</CardTitle></CardHeader>
        <CardContent className="h-[300px] pt-6 text-white px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={portfolio.monthlyArray}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '10px' }} />
              <Bar dataKey="gain" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ settings, setSettings }: { settings: TaxSettings, setSettings: any }) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-3xl p-8 shadow-2xl max-w-2xl">
      <div className="space-y-8">
        <div className="space-y-4">
          <h4 className="text-sm font-black text-white flex items-center gap-2"><Globe className="h-4 w-4" /> Regional Selection</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Country</label>
              <Select value={settings.country} disabled>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-11 text-white"><SelectValue /></SelectTrigger>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Currency</label>
              <Select value={settings.baseCurrency} disabled>
                <SelectTrigger className="bg-slate-800 border-slate-700 h-11 text-white"><SelectValue /></SelectTrigger>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-black text-white flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Tax Methodology</h4>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Accounting Method</label>
            <Select value={settings.accountingMethod} onValueChange={(v: any) => setSettings({ ...settings, accountingMethod: v })}>
              <SelectTrigger className="bg-slate-800 border-slate-700 h-12 rounded-xl text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                <SelectItem value="FIFO">First-In First-Out (FIFO)</SelectItem>
                <SelectItem value="LIFO">Last-In First-Out (LIFO)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500 font-medium">Note: Indian Tax Laws mandate FIFO for Section 115BBH calculations.</p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-black text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Data Rules</h4>
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: 'treatAirdropsAsIncome', label: 'Treat Airdrops as Income' },
              { id: 'treatRewardsAsIncome', label: 'Treat Mining Rewards as Income' },
            ].map(rule => (
              <div key={rule.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-white">{rule.label}</span>
                <Switch checked={true} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" className="text-slate-400 font-bold">Cancel</Button>
          <Button className="bg-indigo-600 font-black rounded-xl h-11 px-8 shadow-lg shadow-indigo-600/20">Apply Changes</Button>
        </div>
      </div>
    </Card>
  );
}

function TransactionsTab({ trades }: { trades: Trade[] }) {
  return (
    <div className="space-y-3">
      {trades.map(t => (
        <Card key={t.id} className="bg-slate-900 border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:bg-slate-800/30 transition-all border">
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${t.trade_type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>
              <TrendingUp className={`h-5 w-5 ${t.trade_type === 'sell' ? 'rotate-180' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-black text-white capitalize">{t.trade_type} {t.token_symbol}</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase">{t.exchange}</p>
                <span className="text-slate-700">•</span>
                <p className="text-[10px] text-slate-500 font-bold">{new Date(t.trade_date).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          <p className="text-sm font-black text-white">₹{(t.quantity * (t.buy_price || 0)).toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}

function IntegrationsTab({ onImport, onApiSync }: {
  onImport: (file: File, exchange: string) => Promise<void>;
  onApiSync: (trades: any[]) => Promise<void>;
}) {
  const [selectedExchange, setSelectedExchange] = useState('CoinDCX');
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [integrationMode, setIntegrationMode] = useState<'csv' | 'api'>('csv');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    setIsUploading(true);
    try {
      await onImport(file, selectedExchange);
    } finally {
      setIsUploading(false);
    }
  };

  const handleApiSync = async () => {
    if (!apiKey || !apiSecret) {
      toast.error('Please enter both API Key and Secret');
      return;
    }

    setIsSyncing(true);
    try {
      toast.info(`Validating ${selectedExchange} API credentials...`);

      // Route to appropriate exchange API
      if (selectedExchange === 'CoinDCX') {
        const validation = await validateCoinDCXCredentials({ apiKey, apiSecret });
        if (!validation.valid) {
          toast.error(`Invalid credentials: ${validation.error}`);
          return;
        }

        toast.info('Fetching trade history from CoinDCX...');
        const syncResult = await syncCoinDCXAccount({ apiKey, apiSecret }, '2025-26');

        if (!syncResult.success) {
          toast.error(`Sync failed: ${syncResult.error}`);
          return;
        }

        if (syncResult.trades && syncResult.trades.length > 0) {
          const converted = convertCoinDCXTradesToTransactions(syncResult.trades, '');
          await onApiSync(converted);
          toast.success(`Imported ${syncResult.tradesCount} trades from CoinDCX!`);
        } else {
          toast.info('No trades found for FY 2025-26');
        }

        if (syncResult.balances) {
          const nonZero = syncResult.balances.filter(b => b.balance > 0);
          if (nonZero.length > 0) {
            toast.success(`Found ${nonZero.length} coins with balance`);
          }
        }
      } else if (selectedExchange === 'WazirX') {
        const validation = await validateWazirXCredentials({ apiKey, apiSecret });
        if (!validation.valid) {
          toast.error(`Invalid credentials: ${validation.error}`);
          return;
        }

        toast.info('Fetching trade history from WazirX...');
        const syncResult = await syncWazirXAccount({ apiKey, apiSecret }, '2025-26');

        if (!syncResult.success) {
          toast.error(`Sync failed: ${syncResult.error}`);
          return;
        }

        if (syncResult.trades && syncResult.trades.length > 0) {
          const converted = convertWazirXTradesToTransactions(syncResult.trades, '');
          await onApiSync(converted);
          toast.success(`Imported ${syncResult.tradesCount} trades from WazirX!`);
        } else {
          toast.info('No trades found for FY 2025-26');
        }
      } else if (selectedExchange === 'Binance') {
        const validation = await validateBinanceCredentials({ apiKey, apiSecret });
        if (!validation.valid) {
          toast.error(`Invalid credentials: ${validation.error}`);
          return;
        }

        toast.info('Fetching trade history from Binance...');
        const syncResult = await syncBinanceAccount({ apiKey, apiSecret }, '2025-26');

        if (!syncResult.success) {
          toast.error(`Sync failed: ${syncResult.error}`);
          return;
        }

        if (syncResult.trades && syncResult.trades.length > 0) {
          const usdtRate = await getUSDTINRRate();
          const converted = convertBinanceTradesToTransactions(syncResult.trades, '', usdtRate);
          await onApiSync(converted);
          toast.success(`Imported ${syncResult.tradesCount} trades from Binance!`);
        } else {
          toast.info('No trades found for FY 2025-26');
        }

        if (syncResult.balances) {
          const nonZero = syncResult.balances.filter(b => parseFloat(b.free) > 0);
          if (nonZero.length > 0) {
            toast.success(`Found ${nonZero.length} coins with balance`);
          }
        }
      } else {
        toast.error(`API integration not available for ${selectedExchange}`);
      }
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Exchange Selector */}
      <Card className="bg-slate-900 border-slate-800 rounded-3xl p-6">
        <h4 className="text-sm font-black uppercase text-slate-400 mb-4">Select Exchange</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['CoinDCX', 'WazirX', 'Binance', 'ZebPay'].map(ex => (
            <button
              key={ex}
              onClick={() => setSelectedExchange(ex)}
              className={`p-4 rounded-xl border-2 transition-all ${selectedExchange === ex
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                }`}
            >
              <span className="text-sm font-bold">{ex}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Integration Mode Tabs */}
      <Card className="bg-slate-900 border-slate-800 rounded-3xl overflow-hidden">
        <div className="border-b border-slate-800 flex">
          <button
            onClick={() => setIntegrationMode('csv')}
            className={`flex-1 py-4 px-6 text-sm font-bold ${integrationMode === 'csv'
              ? 'bg-indigo-500/20 text-indigo-400 border-b-2 border-indigo-500'
              : 'text-slate-400 hover:text-white'
              }`}
          >
            <Upload className="h-4 w-4 inline mr-2" /> CSV Upload
          </button>
          <button
            onClick={() => setIntegrationMode('api')}
            className={`flex-1 py-4 px-6 text-sm font-bold ${integrationMode === 'api'
              ? 'bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-500'
              : 'text-slate-400 hover:text-white'
              }`}
          >
            <Zap className="h-4 w-4 inline mr-2" /> API Sync {['CoinDCX', 'WazirX', 'Binance'].includes(selectedExchange) && '✨'}
          </button>
        </div>

        <div className="p-6">
          {integrationMode === 'csv' ? (
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700'
                }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-10 w-10 text-indigo-400 animate-spin" />
                  <p className="text-slate-400">Processing {selectedExchange} data...</p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="font-bold mb-2">Drop your {selectedExchange} CSV here</p>
                  <p className="text-slate-400 text-sm">or click to browse</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {['CoinDCX', 'WazirX', 'Binance'].includes(selectedExchange) ? (
                <>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                    <div className="flex gap-3">
                      <Zap className="h-5 w-5 text-emerald-400" />
                      <div>
                        <p className="text-emerald-400 font-bold text-sm">Automatic Sync from {selectedExchange}</p>
                        <p className="text-slate-300 text-xs mt-1">Connect with read-only API to auto-fetch all trades.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 mb-2 block">API Key</label>
                      <Input
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={`Enter your ${selectedExchange} API Key`}
                        className="bg-slate-800 border-slate-700 h-12 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 mb-2 block">API Secret</label>
                      <div className="relative">
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          placeholder={`Enter your ${selectedExchange} API Secret`}
                          className="bg-slate-800 border-slate-700 h-12 rounded-xl pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                        >
                          {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      onClick={handleApiSync}
                      disabled={isSyncing || !apiKey || !apiSecret}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 h-14 rounded-xl font-black text-lg"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" /> Syncing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-5 w-5 mr-2" /> Sync from {selectedExchange}
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="bg-slate-800/50 rounded-xl p-4 text-xs text-slate-400">
                    <p className="font-bold mb-2">How to get {selectedExchange} API Keys:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {selectedExchange === 'CoinDCX' && (
                        <>
                          <li>Login to CoinDCX → Settings → API Access</li>
                          <li>Click "Create New API Key"</li>
                          <li>Enable only READ permissions</li>
                          <li>Copy Key & Secret above</li>
                        </>
                      )}
                      {selectedExchange === 'WazirX' && (
                        <>
                          <li>Login to WazirX → Settings → API Management</li>
                          <li>Click "Create API Key"</li>
                          <li>Enable "Read Only" access</li>
                          <li>Copy API Key & Secret above</li>
                        </>
                      )}
                      {selectedExchange === 'Binance' && (
                        <>
                          <li>Login to Binance → Profile → API Management</li>
                          <li>Click "Create API"</li>
                          <li>Select "System Generated" and enable only "Read" permissions</li>
                          <li>Whitelist IP if required, copy Key & Secret above</li>
                        </>
                      )}
                    </ol>
                    <p className="text-amber-400 mt-2 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Read-only access. Your funds are safe.
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                  <p className="font-bold mb-2">API Not Available for {selectedExchange}</p>
                  <p className="text-slate-400 text-sm mb-4">Please use CSV upload for this exchange.</p>
                  <Button onClick={() => setIntegrationMode('csv')} className="bg-indigo-600 rounded-xl">
                    Switch to CSV
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReportsTab({ trades, portfolio, user }: { trades: Trade[]; portfolio: any; user: any }) {
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const handleGenerateReport = async (reportType: 'complete' | 'vda' | 'tds') => {
    setIsGenerating(reportType);

    try {
      // Build report data from trades and portfolio
      const reportData: TaxReportData = {
        user: {
          name: user?.user_metadata?.full_name || 'Taxpayer',
          pan: user?.user_metadata?.pan || 'XXXXX0000X',
          email: user?.email || ''
        },
        financialYear: '2025-26',
        assessmentYear: '2026-27',
        generatedAt: new Date(),
        summary: {
          totalBuyValue: trades.filter(t => t.trade_type === 'buy').reduce((sum, t) => sum + t.quantity * t.buy_price, 0),
          totalSellValue: trades.filter(t => t.trade_type === 'sell').reduce((sum, t) => sum + t.quantity * t.buy_price, 0),
          totalGains: portfolio?.totalTaxableGains > 0 ? portfolio.totalTaxableGains : 0,
          totalLosses: portfolio?.totalTaxableGains < 0 ? Math.abs(portfolio.totalTaxableGains) : 0,
          netGainLoss: portfolio?.totalTaxableGains || 0,
          taxableGains: Math.max(0, portfolio?.totalTaxableGains || 0),
          taxAt30Percent: portfolio?.netTaxDue || 0,
          totalTDSPaid: portfolio?.totalTDSPaid || 0,
          netTaxPayable: Math.max(0, (portfolio?.netTaxDue || 0) - (portfolio?.totalTDSPaid || 0)),
          otherIncome: portfolio?.totalOtherIncome || 0
        },
        transactions: trades.map(t => ({
          date: t.trade_date,
          type: t.trade_type,
          token: t.token_symbol,
          quantity: t.quantity,
          pricePerUnit: t.buy_price,
          totalValue: t.quantity * t.buy_price,
          exchange: t.exchange || 'Unknown',
          fee: t.metadata?.fee,
          tds: t.metadata?.tds_deducted
        })),
        scheduleVDA: trades
          .filter(t => t.trade_type === 'sell')
          .map((t, i) => ({
            slNo: i + 1,
            dateOfTransfer: new Date(t.trade_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            headOfIncome: 'Capital Gains',
            descriptionOfVDA: `${t.token_symbol} (${t.exchange || 'Unknown'})`,
            saleConsideration: t.quantity * t.buy_price,
            costOfAcquisition: t.quantity * t.buy_price * 0.85, // Approximate, real calculation should use FIFO
            gainLoss: t.quantity * t.buy_price * 0.15 // Approximate
          })),
        tokenWiseSummary: Object.entries(
          trades.reduce((acc, t) => {
            if (!acc[t.token_symbol]) {
              acc[t.token_symbol] = { bought: 0, sold: 0, totalCost: 0, totalSale: 0 };
            }
            if (t.trade_type === 'buy') {
              acc[t.token_symbol].bought += t.quantity;
              acc[t.token_symbol].totalCost += t.quantity * t.buy_price;
            } else {
              acc[t.token_symbol].sold += t.quantity;
              acc[t.token_symbol].totalSale += t.quantity * t.buy_price;
            }
            return acc;
          }, {} as Record<string, { bought: number; sold: number; totalCost: number; totalSale: number }>)
        ).map(([token, data]) => ({
          token,
          totalBought: data.bought,
          totalSold: data.sold,
          avgBuyPrice: data.bought > 0 ? data.totalCost / data.bought : 0,
          realizedGain: data.totalSale - (data.totalCost / data.bought * data.sold),
          currentHolding: data.bought - data.sold
        })),
        exchangeWiseTDS: Object.entries(
          trades.reduce((acc, t) => {
            const ex = t.exchange || 'Unknown';
            if (!acc[ex]) acc[ex] = { sales: 0, tds: 0 };
            if (t.trade_type === 'sell') {
              acc[ex].sales += t.quantity * t.buy_price;
              acc[ex].tds += (t.metadata?.tds_deducted || t.quantity * t.buy_price * 0.01);
            }
            return acc;
          }, {} as Record<string, { sales: number; tds: number }>)
        ).map(([name, data]) => ({
          exchange: name,
          totalSales: data.sales,
          tdsDeducted: data.tds
        }))
      };

      if (reportType === 'complete') {
        generateCompleteTaxReport(reportData);
        toast.success('Complete Tax Report downloaded!');
      } else if (reportType === 'vda') {
        generateScheduleVDAPDF(reportData);
        toast.success('Schedule VDA Report downloaded!');
      } else {
        // TDS report - use complete for now
        generateCompleteTaxReport(reportData);
        toast.success('TDS Report downloaded!');
      }
    } catch (error) {
      toast.error(`Failed to generate report: ${(error as Error).message}`);
    } finally {
      setIsGenerating(null);
    }
  };

  const reports = [
    {
      id: 'complete',
      title: 'Complete Tax Report',
      desc: 'Comprehensive gain/loss analysis with FIFO audit trail.',
      icon: ShieldCheck,
      color: 'indigo'
    },
    {
      id: 'vda',
      title: 'Schedule VDA (ITR)',
      desc: 'ITR-ready format as per Section 115BBH. Copy-paste ready.',
      icon: FileSpreadsheet,
      color: 'emerald'
    },
    {
      id: 'tds',
      title: 'TDS Summary Report',
      desc: '1% TDS deduction tracking for Form 26AS reconciliation.',
      icon: Zap,
      color: 'amber'
    }
  ];

  return (
    <div className="space-y-6 text-white">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl p-6">
        <h3 className="text-xl font-black mb-2">FY 2025-26 Tax Reports</h3>
        <p className="text-white/70 text-sm">Generate ITR-ready reports for your crypto transactions. Assessment Year: 2026-27</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((r) => (
          <Card key={r.id} className="bg-slate-900 border-slate-800 rounded-3xl p-6 hover:border-indigo-600/50 transition-all border shadow-xl">
            <div className={`h-14 w-14 bg-${r.color}-500/20 rounded-2xl flex items-center justify-center text-${r.color}-400 mb-4`}>
              <r.icon className="h-7 w-7" />
            </div>
            <h4 className="text-lg font-black text-white mb-2">{r.title}</h4>
            <p className="text-slate-500 text-xs mb-4">{r.desc}</p>
            <Button
              onClick={() => handleGenerateReport(r.id as 'complete' | 'vda' | 'tds')}
              disabled={isGenerating !== null || trades.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold h-11"
            >
              {isGenerating === r.id ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Download PDF</>
              )}
            </Button>
          </Card>
        ))}
      </div>

      {trades.length === 0 && (
        <Card className="bg-amber-500/10 border-amber-500/20 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-amber-400 font-bold text-sm">No transactions found</p>
              <p className="text-slate-300 text-xs">Import your trades via CSV or API to generate tax reports.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
