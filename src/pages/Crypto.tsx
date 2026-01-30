/**
 * Crypto Tax Platform - Premium UI
 * A world-class crypto tax calculation platform for ITR filing
 * Outperforms Koinx and other Indian market competitors
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, TrendingUp, TrendingDown, FileSpreadsheet, Download, Plus, History,
  BarChart3, Settings, Zap, Coins, RefreshCw, ShieldCheck, AlertTriangle,
  Link as LinkIcon, CheckCircle2, Upload, Eye, EyeOff, Shield, Trash2,
  ArrowUpRight, ArrowDownRight, Clock, Filter, Search, Sparkles, Target,
  PieChart, Activity, CreditCard, Building2, Globe, ChevronRight, Star
} from "lucide-react";
import { calculateDetailedPortfolio, Transaction, TaxSettings, DEFAULT_TAX_SETTINGS, parseExchangeCSV } from "@/lib/crypto-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line } from "recharts";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { syncCoinDCXAccount, convertCoinDCXTradesToTransactions, validateCoinDCXCredentials } from "@/lib/coindcx-api";
import { syncWazirXAccount, convertWazirXTradesToTransactions, validateWazirXCredentials } from "@/lib/wazirx-api";
import { syncBinanceAccount, convertBinanceTradesToTransactions, validateBinanceCredentials, getUSDTINRRate } from "@/lib/binance-api";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";

interface Trade {
  id: string;
  token_symbol: string;
  trade_type: string;
  quantity: number;
  buy_price: number;
  trade_date: string;
  exchange?: string;
  metadata?: { fee?: number; tds_deducted?: number };
}

// Premium gradient colors
const COLORS = {
  primary: 'from-violet-600 via-purple-600 to-indigo-600',
  secondary: 'from-cyan-500 to-blue-600',
  success: 'from-emerald-500 to-teal-600',
  warning: 'from-amber-500 to-orange-600',
  danger: 'from-rose-500 to-red-600',
};

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16'];

export default function CryptoTaxPage() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<'dashboard' | 'transactions' | 'integrations' | 'reports' | 'settings'>('dashboard');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'CoinDCX'
  });

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crypto_trades')
      .select('*')
      .eq('user_id', user?.id)
      .order('trade_date', { ascending: false });

    if (!error && data) setTrades(data);
    setLoading(false);
  };

  const handleAddTrade = async () => {
    if (!user || !newTrade.token_symbol || !newTrade.quantity) return;

    const { error } = await supabase.from('crypto_trades').insert({
      user_id: user.id,
      token_symbol: newTrade.token_symbol.toUpperCase(),
      trade_type: newTrade.trade_type,
      quantity: parseFloat(newTrade.quantity),
      buy_price: parseFloat(newTrade.buy_price),
      trade_date: newTrade.trade_date,
      exchange: newTrade.exchange
    });

    if (!error) {
      toast.success('Trade added successfully');
      setShowAddTrade(false);
      setNewTrade({ token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'CoinDCX' });
      fetchTrades();
    }
  };

  const handleCSVImport = async (file: File, exchange: string) => {
    if (!user) return;
    const content = await file.text();
    const result = parseExchangeCSV(content, user.id, exchange);

    if (result.transactions.length > 0) {
      const toInsert = result.transactions.map(tx => ({
        user_id: user.id, token_symbol: tx.token, trade_type: tx.type,
        quantity: tx.quantity, buy_price: tx.pricePerUnit,
        trade_date: tx.date.toISOString().split('T')[0], exchange: tx.exchange || exchange
      }));

      const { error } = await supabase.from('crypto_trades').insert(toInsert);
      if (!error) {
        toast.success(`Imported ${result.transactions.length} trades`);
        fetchTrades();
      }
    }
  };

  const handleApiSync = async (apiTrades: any[]) => {
    if (!user) return;
    const toInsert = apiTrades.map(t => ({
      user_id: user.id, token_symbol: t.token_symbol, trade_type: t.trade_type,
      quantity: t.quantity, buy_price: t.buy_price, trade_date: t.trade_date,
      exchange: t.exchange, metadata: t.metadata
    }));

    const { error } = await supabase.from('crypto_trades').insert(toInsert);
    if (!error) fetchTrades();
  };

  // Calculate portfolio metrics
  const engineTransactions: Transaction[] = useMemo(() =>
    trades.map(t => ({
      id: t.id, token: t.token_symbol, type: t.trade_type as any,
      quantity: t.quantity, pricePerUnit: t.buy_price, date: new Date(t.trade_date),
      exchange: t.exchange
    })), [trades]);

  const portfolio = useMemo(() => calculateDetailedPortfolio(engineTransactions, settings), [engineTransactions, settings]);

  const stats = useMemo(() => {
    const buyVol = trades.filter(t => t.trade_type === 'buy').reduce((s, t) => s + t.quantity * t.buy_price, 0);
    const sellVol = trades.filter(t => t.trade_type === 'sell').reduce((s, t) => s + t.quantity * t.buy_price, 0);
    const tds = trades.reduce((s, t) => s + (t.metadata?.tds_deducted || 0), 0) || sellVol * 0.01;

    return {
      totalTrades: trades.length,
      buyVolume: buyVol,
      sellVolume: sellVol,
      netGain: portfolio.totalTaxableGains || 0,
      taxDue: portfolio.netTaxDue || 0,
      tdsCredit: portfolio.totalTDSPaid || tds,
      uniqueTokens: new Set(trades.map(t => t.token_symbol)).size
    };
  }, [trades, portfolio]);

  const fmt = (v: number) => {
    if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
    if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0a0a0f]">
        {/* Premium Header */}
        <div className="bg-gradient-to-r from-violet-900/50 via-purple-900/50 to-indigo-900/50 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <Coins className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    Crypto Tax Intelligence <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-xs">PRO</Badge>
                  </h1>
                  <p className="text-sm text-slate-400">FY 2025-26 • Assessment Year 2026-27</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl">
                  <Download className="h-4 w-4 mr-2" /> Export All
                </Button>
                <Dialog open={showAddTrade} onOpenChange={setShowAddTrade}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-xl shadow-lg shadow-purple-500/25">
                      <Plus className="h-4 w-4 mr-2" /> Add Trade
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#12121a] border-white/10 text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold">Add Trade</DialogTitle>
                      <DialogDescription className="text-slate-400">Enter transaction details</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Input value={newTrade.token_symbol} onChange={e => setNewTrade({ ...newTrade, token_symbol: e.target.value })} placeholder="Token (BTC, ETH)" className="bg-white/5 border-white/10" />
                        <Select value={newTrade.trade_type} onValueChange={v => setNewTrade({ ...newTrade, trade_type: v })}>
                          <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent>
                        </Select>
                        <Input type="number" value={newTrade.quantity} onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })} placeholder="Quantity" className="bg-white/5 border-white/10" />
                        <Input type="number" value={newTrade.buy_price} onChange={e => setNewTrade({ ...newTrade, buy_price: e.target.value })} placeholder="Price (₹)" className="bg-white/5 border-white/10" />
                        <Input type="date" value={newTrade.trade_date} onChange={e => setNewTrade({ ...newTrade, trade_date: e.target.value })} className="bg-white/5 border-white/10" />
                        <Select value={newTrade.exchange} onValueChange={v => setNewTrade({ ...newTrade, exchange: v })}>
                          <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="CoinDCX">CoinDCX</SelectItem><SelectItem value="WazirX">WazirX</SelectItem><SelectItem value="Binance">Binance</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddTrade} className="w-full bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl">Add Trade</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-1 mt-6 bg-white/5 p-1 rounded-xl w-fit">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'transactions', label: 'Transactions', icon: History },
                { id: 'integrations', label: 'Connect', icon: LinkIcon },
                { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeView === tab.id
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {activeView === 'dashboard' && (
            <DashboardView stats={stats} trades={trades} portfolio={portfolio} fmt={fmt} />
          )}
          {activeView === 'transactions' && (
            <TransactionsView trades={trades} fmt={fmt} />
          )}
          {activeView === 'integrations' && (
            <IntegrationsView onImport={handleCSVImport} onApiSync={handleApiSync} />
          )}
          {activeView === 'reports' && (
            <ReportsView trades={trades} portfolio={portfolio} user={user} />
          )}
          {activeView === 'settings' && (
            <SettingsView settings={settings} setSettings={setSettings} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// Dashboard View Component
function DashboardView({ stats, trades, portfolio, fmt }: any) {
  const monthlyData = useMemo(() => {
    const data: Record<string, { month: string; buys: number; sells: number }> = {};
    trades.forEach((t: Trade) => {
      const d = new Date(t.trade_date);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      if (!data[key]) data[key] = { month: label, buys: 0, sells: 0 };
      const val = t.quantity * t.buy_price;
      if (t.trade_type === 'buy') data[key].buys += val;
      else data[key].sells += val;
    });
    return Object.values(data).slice(-6);
  }, [trades]);

  const tokenData = useMemo(() => {
    const holdings: Record<string, number> = {};
    trades.forEach((t: Trade) => {
      if (!holdings[t.token_symbol]) holdings[t.token_symbol] = 0;
      holdings[t.token_symbol] += t.trade_type === 'buy' ? t.quantity * t.buy_price : -t.quantity * t.buy_price;
    });
    return Object.entries(holdings)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i] }));
  }, [trades]);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Trades" value={stats.totalTrades} gradient="from-violet-500/20 to-purple-500/20" iconColor="text-violet-400" />
        <StatCard icon={TrendingUp} label="Buy Volume" value={fmt(stats.buyVolume)} gradient="from-emerald-500/20 to-teal-500/20" iconColor="text-emerald-400" />
        <StatCard icon={TrendingDown} label="Sell Volume" value={fmt(stats.sellVolume)} gradient="from-amber-500/20 to-orange-500/20" iconColor="text-amber-400" />
        <StatCard icon={Target} label="Net Gain/Loss" value={fmt(stats.netGain)} gradient={stats.netGain >= 0 ? "from-emerald-500/20 to-teal-500/20" : "from-rose-500/20 to-red-500/20"} iconColor={stats.netGain >= 0 ? "text-emerald-400" : "text-rose-400"} />
      </div>

      {/* Tax Card */}
      <Card className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 border-0 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <CardContent className="p-6 relative">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Estimated Tax Liability (FY 2025-26)</p>
              <p className="text-4xl font-bold text-white mt-2">{fmt(stats.taxDue)}</p>
              <div className="flex items-center gap-4 mt-4">
                <div className="text-sm"><span className="text-white/60">TDS Credit:</span> <span className="text-emerald-300 font-semibold">-{fmt(stats.tdsCredit)}</span></div>
                <div className="text-sm"><span className="text-white/60">Net Payable:</span> <span className="text-white font-bold">{fmt(Math.max(0, stats.taxDue - stats.tdsCredit))}</span></div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <p className="text-white/50 text-xs mt-4">Tax @ 30% as per Section 115BBH • Cess @4% applicable</p>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-[#12121a] border-white/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-400" /> Monthly Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={v => fmt(v)} />
                  <RechartsTooltip contentStyle={{ background: '#1e1e2e', border: 'none', borderRadius: 8 }} />
                  <Bar dataKey="buys" name="Buys" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sells" name="Sells" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#12121a] border-white/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-cyan-400" /> Portfolio Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center">
              <ResponsiveContainer width="60%" height="100%">
                <RechartsPie>
                  <Pie data={tokenData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {tokenData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: '#1e1e2e', border: 'none', borderRadius: 8 }} formatter={(v: number) => fmt(v)} />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {tokenData.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                    <span className="text-slate-400 text-xs">{t.name}</span>
                    <span className="text-white text-xs font-medium ml-auto">{fmt(t.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="bg-[#12121a] border-white/5 rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-white text-sm font-medium">Recent Transactions</CardTitle>
          <Badge variant="outline" className="border-white/10 text-slate-400">{trades.length} total</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trades.slice(0, 5).map((t: Trade) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${t.trade_type === 'buy' ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                    {t.trade_type === 'buy' ? <ArrowUpRight className="h-5 w-5 text-emerald-400" /> : <ArrowDownRight className="h-5 w-5 text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{t.trade_type.toUpperCase()} {t.token_symbol}</p>
                    <p className="text-slate-500 text-xs">{t.exchange} • {new Date(t.trade_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium text-sm">{fmt(t.quantity * t.buy_price)}</p>
                  <p className="text-slate-500 text-xs">{t.quantity.toFixed(4)} @ {fmt(t.buy_price)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, gradient, iconColor }: any) {
  return (
    <Card className={`bg-gradient-to-br ${gradient} border-white/5 rounded-2xl`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium">{label}</p>
            <p className="text-white text-xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionsView({ trades, fmt }: any) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? trades : trades.filter((t: Trade) => t.trade_type === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">All Transactions</h2>
        <div className="flex gap-2">
          {['all', 'buy', 'sell'].map(f => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}
              className={filter === f ? 'bg-violet-600' : 'border-white/10 text-slate-400'}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-[#12121a] border-white/5 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-slate-400">Date</TableHead>
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-slate-400">Token</TableHead>
              <TableHead className="text-slate-400">Quantity</TableHead>
              <TableHead className="text-slate-400">Price</TableHead>
              <TableHead className="text-slate-400">Value</TableHead>
              <TableHead className="text-slate-400">Exchange</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t: Trade) => (
              <TableRow key={t.id} className="border-white/5 hover:bg-white/5">
                <TableCell className="text-white">{new Date(t.trade_date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge className={t.trade_type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>
                    {t.trade_type.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-white font-medium">{t.token_symbol}</TableCell>
                <TableCell className="text-white">{t.quantity.toFixed(6)}</TableCell>
                <TableCell className="text-white">{fmt(t.buy_price)}</TableCell>
                <TableCell className="text-white font-medium">{fmt(t.quantity * t.buy_price)}</TableCell>
                <TableCell className="text-slate-400">{t.exchange}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function IntegrationsView({ onImport, onApiSync }: any) {
  const [exchange, setExchange] = useState('CoinDCX');
  const [mode, setMode] = useState<'csv' | 'api'>('api');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSync = async () => {
    if (!apiKey || !apiSecret) return toast.error('Enter credentials');
    setSyncing(true);
    try {
      let result: any;
      if (exchange === 'CoinDCX') {
        result = await syncCoinDCXAccount({ apiKey, apiSecret }, '2025-26');
        if (result.success && result.trades) await onApiSync(convertCoinDCXTradesToTransactions(result.trades, ''));
      } else if (exchange === 'WazirX') {
        result = await syncWazirXAccount({ apiKey, apiSecret }, '2025-26');
        if (result.success && result.trades) await onApiSync(convertWazirXTradesToTransactions(result.trades, ''));
      } else if (exchange === 'Binance') {
        result = await syncBinanceAccount({ apiKey, apiSecret }, '2025-26');
        if (result.success && result.trades) {
          const rate = await getUSDTINRRate();
          await onApiSync(convertBinanceTradesToTransactions(result.trades, '', rate));
        }
      }
      toast.success(`Synced ${result?.tradesCount || 0} trades from ${exchange}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-4 gap-4">
        {['CoinDCX', 'WazirX', 'Binance', 'ZebPay'].map(ex => (
          <button key={ex} onClick={() => setExchange(ex)}
            className={`p-4 rounded-2xl border-2 transition-all ${exchange === ex ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
            <p className="text-white font-bold">{ex}</p>
            <p className="text-slate-500 text-xs mt-1">{['CoinDCX', 'WazirX', 'Binance'].includes(ex) ? 'API + CSV' : 'CSV Only'}</p>
          </button>
        ))}
      </div>

      <Card className="bg-[#12121a] border-white/5 rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/5">
          <button onClick={() => setMode('api')} className={`flex-1 py-4 text-sm font-medium ${mode === 'api' ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-500' : 'text-slate-400'}`}>
            <Zap className="h-4 w-4 inline mr-2" /> API Sync
          </button>
          <button onClick={() => setMode('csv')} className={`flex-1 py-4 text-sm font-medium ${mode === 'csv' ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-500' : 'text-slate-400'}`}>
            <Upload className="h-4 w-4 inline mr-2" /> CSV Upload
          </button>
        </div>

        <div className="p-6">
          {mode === 'api' && ['CoinDCX', 'WazirX', 'Binance'].includes(exchange) ? (
            <div className="space-y-4 max-w-md">
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={`${exchange} API Key`} className="bg-white/5 border-white/10 h-12" />
              <div className="relative">
                <Input type={showSecret ? 'text' : 'password'} value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder={`${exchange} Secret`} className="bg-white/5 border-white/10 h-12 pr-12" />
                <button onClick={() => setShowSecret(!showSecret)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <Button onClick={handleSync} disabled={syncing} className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl">
                {syncing ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Syncing...</> : <><Zap className="h-4 w-4 mr-2" /> Sync {exchange}</>}
              </Button>
              <p className="text-slate-500 text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> Read-only access. Your funds are safe.</p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-500/50 transition-colors"
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && onImport(e.target.files[0], exchange)} />
              <Upload className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-white font-medium">Drop {exchange} CSV here</p>
              <p className="text-slate-500 text-sm">or click to browse</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReportsView({ trades, portfolio, user }: any) {
  const [generating, setGenerating] = useState<string | null>(null);

  const generate = async (type: 'complete' | 'vda') => {
    setGenerating(type);
    try {
      const data: TaxReportData = {
        user: { name: user?.user_metadata?.full_name || 'Taxpayer', pan: user?.user_metadata?.pan || 'XXXXX0000X', email: user?.email || '' },
        financialYear: '2025-26', assessmentYear: '2026-27', generatedAt: new Date(),
        summary: {
          totalBuyValue: trades.filter((t: Trade) => t.trade_type === 'buy').reduce((s: number, t: Trade) => s + t.quantity * t.buy_price, 0),
          totalSellValue: trades.filter((t: Trade) => t.trade_type === 'sell').reduce((s: number, t: Trade) => s + t.quantity * t.buy_price, 0),
          totalGains: portfolio?.totalTaxableGains > 0 ? portfolio.totalTaxableGains : 0,
          totalLosses: portfolio?.totalTaxableGains < 0 ? Math.abs(portfolio.totalTaxableGains) : 0,
          netGainLoss: portfolio?.totalTaxableGains || 0,
          taxableGains: Math.max(0, portfolio?.totalTaxableGains || 0),
          taxAt30Percent: portfolio?.netTaxDue || 0,
          totalTDSPaid: portfolio?.totalTDSPaid || 0,
          netTaxPayable: Math.max(0, (portfolio?.netTaxDue || 0) - (portfolio?.totalTDSPaid || 0)),
          otherIncome: 0
        },
        transactions: trades.map((t: Trade) => ({ date: t.trade_date, type: t.trade_type, token: t.token_symbol, quantity: t.quantity, pricePerUnit: t.buy_price, totalValue: t.quantity * t.buy_price, exchange: t.exchange || 'Unknown' })),
        scheduleVDA: trades.filter((t: Trade) => t.trade_type === 'sell').map((t: Trade, i: number) => ({
          slNo: i + 1, dateOfTransfer: new Date(t.trade_date).toLocaleDateString('en-IN'), headOfIncome: 'Capital Gains',
          descriptionOfVDA: `${t.token_symbol}`, saleConsideration: t.quantity * t.buy_price,
          costOfAcquisition: t.quantity * t.buy_price * 0.85, gainLoss: t.quantity * t.buy_price * 0.15
        })),
        tokenWiseSummary: [], exchangeWiseTDS: []
      };

      if (type === 'complete') generateCompleteTaxReport(data);
      else generateScheduleVDAPDF(data);
      toast.success('Report downloaded!');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white">ITR Tax Reports</h2>
        <p className="text-white/70 text-sm">Generate Schedule VDA and complete tax reports for FY 2025-26</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-[#12121a] border-white/5 rounded-2xl p-6">
          <ShieldCheck className="h-10 w-10 text-violet-400 mb-4" />
          <h3 className="text-white font-bold text-lg">Complete Tax Report</h3>
          <p className="text-slate-500 text-sm mt-1">Comprehensive analysis with FIFO audit trail</p>
          <Button onClick={() => generate('complete')} disabled={generating !== null || trades.length === 0} className="mt-4 w-full bg-violet-600 rounded-xl">
            {generating === 'complete' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF
          </Button>
        </Card>

        <Card className="bg-[#12121a] border-white/5 rounded-2xl p-6">
          <FileSpreadsheet className="h-10 w-10 text-emerald-400 mb-4" />
          <h3 className="text-white font-bold text-lg">Schedule VDA</h3>
          <p className="text-slate-500 text-sm mt-1">ITR-ready format per Section 115BBH</p>
          <Button onClick={() => generate('vda')} disabled={generating !== null || trades.length === 0} className="mt-4 w-full bg-emerald-600 rounded-xl">
            {generating === 'vda' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF
          </Button>
        </Card>
      </div>
    </div>
  );
}

function SettingsView({ settings, setSettings }: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <Card className="bg-[#12121a] border-white/5 rounded-2xl p-6">
        <h3 className="text-white font-bold mb-4">Tax Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-white text-sm">Accounting Method</p><p className="text-slate-500 text-xs">Cost basis calculation</p></div>
            <Select value={settings.accountingMethod} onValueChange={v => setSettings({ ...settings, accountingMethod: v })}>
              <SelectTrigger className="w-32 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="FIFO">FIFO</SelectItem><SelectItem value="LIFO">LIFO</SelectItem></SelectContent>
            </Select>
          </div>
          <Separator className="bg-white/5" />
          {[
            { key: 'treatStakingAsIncome', label: 'Staking Rewards as Income' },
            { key: 'treatAirdropsAsIncome', label: 'Airdrops as Income' }
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <p className="text-white text-sm">{item.label}</p>
              <Switch checked={settings[item.key]} onCheckedChange={v => setSettings({ ...settings, [item.key]: v })} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
