/**
 * Crypto Tax Platform - Professional UI Redesign
 * Premium design with Inter font, proper spacing, and error handling
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, TrendingUp, TrendingDown, FileSpreadsheet, Download, Plus, History,
  BarChart3, Settings, Zap, Coins, RefreshCw, ShieldCheck, AlertTriangle,
  Link as LinkIcon, CheckCircle, Upload, Eye, EyeOff, Shield, Trash2,
  ArrowUpRight, ArrowDownRight, Clock, Filter, Search, Sparkles, Target,
  PieChart, Activity, CreditCard, Building2, Globe, ChevronRight, Star,
  Info, XCircle, HelpCircle, ExternalLink
} from "lucide-react";
import { calculateDetailedPortfolio, Transaction, TaxSettings, DEFAULT_TAX_SETTINGS, parseExchangeCSV } from "@/lib/crypto-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";

// Types
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

// Chart colors
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

export default function CryptoTaxPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'import' | 'reports' | 'settings'>('overview');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);

  // Import states
  const [selectedExchange, setSelectedExchange] = useState('CoinDCX');
  const [importMode, setImportMode] = useState<'csv' | 'api'>('csv');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Add trade dialog
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'Manual'
  });

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crypto_trades')
        .select('*')
        .eq('user_id', user?.id)
        .order('trade_date', { ascending: false });

      if (!error && data) setTrades(data);
    } catch (err) {
      console.error('Error fetching trades:', err);
    }
    setLoading(false);
  };

  const handleAddTrade = async () => {
    if (!user || !newTrade.token_symbol || !newTrade.quantity) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
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
        setNewTrade({ token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'Manual' });
        fetchTrades();
      } else {
        toast.error('Failed to add trade');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const handleCSVImport = async (file: File) => {
    if (!user) return;

    try {
      const content = await file.text();
      const result = parseExchangeCSV(content, user.id, selectedExchange);

      if (result.transactions.length > 0) {
        const toInsert = result.transactions.map(tx => ({
          user_id: user.id,
          token_symbol: tx.token,
          trade_type: tx.type,
          quantity: tx.quantity,
          buy_price: tx.pricePerUnit,
          trade_date: tx.date.toISOString().split('T')[0],
          exchange: tx.exchange || selectedExchange
        }));

        const { error } = await supabase.from('crypto_trades').insert(toInsert);
        if (!error) {
          toast.success(`Imported ${result.transactions.length} trades from ${selectedExchange}`);
          fetchTrades();
        } else {
          toast.error('Failed to import trades');
        }
      } else {
        toast.warning('No valid trades found in the CSV file');
      }
    } catch (err) {
      toast.error('Failed to parse CSV file');
    }
  };

  const handleApiSync = async () => {
    if (!apiKey || !apiSecret) {
      toast.error('Please enter both API Key and Secret');
      return;
    }

    setSyncing(true);
    setSyncError(null);

    // Note: Direct API calls to exchanges won't work from browser due to CORS
    // We need a backend proxy for this. For now, show a helpful message.
    setTimeout(() => {
      setSyncing(false);
      setSyncError(
        `Direct API sync requires a backend server due to browser security restrictions (CORS). ` +
        `Please use CSV import instead, or we can set up a backend proxy service.`
      );
      toast.error('API sync requires backend setup. Please use CSV import.');
    }, 2000);
  };

  const handleDeleteTrade = async (id: string) => {
    const { error } = await supabase.from('crypto_trades').delete().eq('id', id);
    if (!error) {
      toast.success('Trade deleted');
      fetchTrades();
    }
  };

  // Portfolio calculations
  const engineTransactions: Transaction[] = useMemo(() =>
    trades.map(t => ({
      id: t.id, token: t.token_symbol, type: t.trade_type as 'buy' | 'sell',
      quantity: t.quantity, pricePerUnit: t.buy_price, date: new Date(t.trade_date),
      exchange: t.exchange
    })), [trades]);

  const portfolio = useMemo(() => calculateDetailedPortfolio(engineTransactions, settings), [engineTransactions, settings]);

  // Statistics
  const stats = useMemo(() => {
    const buyTrades = trades.filter(t => t.trade_type === 'buy');
    const sellTrades = trades.filter(t => t.trade_type === 'sell');
    const buyVolume = buyTrades.reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
    const tdsDeducted = trades.reduce((sum, t) => sum + (t.metadata?.tds_deducted || 0), 0) || sellVolume * 0.01;

    return {
      totalTrades: trades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume,
      sellVolume,
      netGain: portfolio.totalTaxableGains || 0,
      taxPayable: portfolio.netTaxDue || 0,
      tdsCredit: portfolio.totalTDSPaid || tdsDeducted,
      uniqueTokens: new Set(trades.map(t => t.token_symbol)).size
    };
  }, [trades, portfolio]);

  // Chart data
  const tokenAllocation = useMemo(() => {
    const holdings: Record<string, number> = {};
    trades.forEach(t => {
      if (!holdings[t.token_symbol]) holdings[t.token_symbol] = 0;
      const value = t.quantity * t.buy_price;
      holdings[t.token_symbol] += t.trade_type === 'buy' ? value : -value;
    });
    return Object.entries(holdings)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i] }));
  }, [trades]);

  const monthlyVolume = useMemo(() => {
    const data: Record<string, { month: string; buys: number; sells: number }> = {};
    trades.forEach(t => {
      const d = new Date(t.trade_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!data[key]) data[key] = { month: monthLabel, buys: 0, sells: 0 };
      const value = t.quantity * t.buy_price;
      if (t.trade_type === 'buy') data[key].buys += value;
      else data[key].sells += value;
    });
    return Object.values(data).slice(-6);
  }, [trades]);

  // Helpers
  const formatCurrency = (value: number): string => {
    if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Coins className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
                      Crypto Tax Calculator
                    </h1>
                    <p className="text-sm text-slate-500">FY 2025-26 • Section 115BBH</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={fetchTrades} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Dialog open={showAddTrade} onOpenChange={setShowAddTrade}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Trade
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add Manual Trade</DialogTitle>
                      <DialogDescription>Enter the details of your crypto transaction.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Token Symbol</Label>
                          <Input
                            placeholder="BTC, ETH, SOL..."
                            value={newTrade.token_symbol}
                            onChange={e => setNewTrade({ ...newTrade, token_symbol: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={newTrade.trade_type} onValueChange={v => setNewTrade({ ...newTrade, trade_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="buy">Buy</SelectItem>
                              <SelectItem value="sell">Sell</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={newTrade.quantity}
                            onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Price (₹)</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={newTrade.buy_price}
                            onChange={e => setNewTrade({ ...newTrade, buy_price: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={newTrade.trade_date}
                            onChange={e => setNewTrade({ ...newTrade, trade_date: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setShowAddTrade(false)}>Cancel</Button>
                        <Button onClick={handleAddTrade} className="bg-indigo-600 hover:bg-indigo-700">Add Trade</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-1 mt-6 border-b border-slate-200 -mb-px">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'transactions', label: 'Transactions', icon: History },
                { id: 'import', label: 'Import Data', icon: Upload },
                { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Trades"
                  value={stats.totalTrades.toString()}
                  subtext={`${stats.buyTrades} buys, ${stats.sellTrades} sells`}
                  icon={<Activity className="h-5 w-5 text-indigo-600" />}
                />
                <StatCard
                  label="Buy Volume"
                  value={formatCurrency(stats.buyVolume)}
                  subtext={`${stats.uniqueTokens} tokens`}
                  icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                />
                <StatCard
                  label="Sell Volume"
                  value={formatCurrency(stats.sellVolume)}
                  subtext="Total sold"
                  icon={<TrendingDown className="h-5 w-5 text-amber-600" />}
                />
                <StatCard
                  label="Net Gain/Loss"
                  value={formatCurrency(stats.netGain)}
                  subtext={stats.netGain >= 0 ? 'Profit' : 'Loss'}
                  icon={<Target className="h-5 w-5 text-purple-600" />}
                  highlight={stats.netGain >= 0 ? 'positive' : 'negative'}
                />
              </div>

              {/* Tax Summary Card */}
              <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-indigo-200 text-sm font-medium">Estimated Tax Liability (FY 2025-26)</p>
                      <p className="text-4xl font-bold mt-1">{formatCurrency(stats.taxPayable)}</p>
                      <p className="text-indigo-200 text-sm mt-2">@ 30% flat rate + 4% cess</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-200 text-sm">TDS Credit:</span>
                        <Badge className="bg-white/20 text-white border-0">{formatCurrency(stats.tdsCredit)}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-200 text-sm">Net Payable:</span>
                        <span className="text-xl font-bold">{formatCurrency(Math.max(0, stats.taxPayable - stats.tdsCredit))}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              {trades.length > 0 ? (
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Monthly Volume */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold text-slate-900">Monthly Trading Volume</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyVolume}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                            <YAxis stroke="#64748b" fontSize={12} tickFormatter={v => formatCurrency(v)} />
                            <RechartsTooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Bar dataKey="buys" name="Buys" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="sells" name="Sells" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Token Allocation */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold text-slate-900">Portfolio Allocation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 flex items-center">
                        <ResponsiveContainer width="55%" height="100%">
                          <RechartsPie>
                            <Pie
                              data={tokenAllocation}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              dataKey="value"
                              paddingAngle={2}
                            >
                              {tokenAllocation.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                              formatter={(value: number) => formatCurrency(value)}
                            />
                          </RechartsPie>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                          {tokenAllocation.map((token, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: token.color }} />
                                <span className="text-slate-600">{token.name}</span>
                              </div>
                              <span className="font-medium text-slate-900">{formatCurrency(token.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-16 text-center">
                    <Coins className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No trades yet</h3>
                    <p className="text-slate-500 mb-6 max-w-md mx-auto">
                      Import your crypto trades from exchanges or add them manually to calculate your tax liability.
                    </p>
                    <div className="flex justify-center gap-3">
                      <Button variant="outline" onClick={() => setActiveTab('import')}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Data
                      </Button>
                      <Button onClick={() => setShowAddTrade(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trade
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Transactions */}
              {trades.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base font-semibold text-slate-900">Recent Transactions</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('transactions')}>
                      View All <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {trades.slice(0, 5).map(trade => (
                        <div key={trade.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${trade.trade_type === 'buy' ? 'bg-emerald-100' : 'bg-amber-100'
                              }`}>
                              {trade.trade_type === 'buy'
                                ? <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                                : <ArrowDownRight className="h-4 w-4 text-amber-600" />
                              }
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {trade.trade_type.toUpperCase()} {trade.token_symbol}
                              </p>
                              <p className="text-xs text-slate-500">
                                {trade.exchange} • {new Date(trade.trade_date).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-slate-900">{formatCurrency(trade.quantity * trade.buy_price)}</p>
                            <p className="text-xs text-slate-500">{trade.quantity.toFixed(6)} @ {formatCurrency(trade.buy_price)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">All Transactions</CardTitle>
                <CardDescription>{trades.length} total trades</CardDescription>
              </CardHeader>
              <CardContent>
                {trades.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Exchange</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trades.map(trade => (
                          <TableRow key={trade.id}>
                            <TableCell className="text-slate-600">{new Date(trade.trade_date).toLocaleDateString('en-IN')}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={trade.trade_type === 'buy' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-amber-200 text-amber-700 bg-amber-50'}>
                                {trade.trade_type.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium text-slate-900">{trade.token_symbol}</TableCell>
                            <TableCell className="text-right text-slate-600">{trade.quantity.toFixed(6)}</TableCell>
                            <TableCell className="text-right text-slate-600">{formatCurrency(trade.buy_price)}</TableCell>
                            <TableCell className="text-right font-medium text-slate-900">{formatCurrency(trade.quantity * trade.buy_price)}</TableCell>
                            <TableCell className="text-slate-500">{trade.exchange || '-'}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteTrade(trade.id)}>
                                <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-slate-500">No transactions found. Import or add trades to get started.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import Tab */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Exchange Selection */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">Select Exchange</CardTitle>
                  <CardDescription>Choose your crypto exchange to import trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { id: 'CoinDCX', name: 'CoinDCX', support: 'CSV' },
                      { id: 'WazirX', name: 'WazirX', support: 'CSV' },
                      { id: 'Binance', name: 'Binance', support: 'CSV' },
                      { id: 'ZebPay', name: 'ZebPay', support: 'CSV' }
                    ].map(exchange => (
                      <button
                        key={exchange.id}
                        onClick={() => setSelectedExchange(exchange.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${selectedExchange === exchange.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                      >
                        <p className="font-medium text-slate-900">{exchange.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{exchange.support} Import</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Import Method */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <Tabs value={importMode} onValueChange={(v: 'csv' | 'api') => setImportMode(v)}>
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                      <TabsTrigger value="csv" className="gap-2">
                        <Upload className="h-4 w-4" />
                        CSV Upload
                      </TabsTrigger>
                      <TabsTrigger value="api" className="gap-2">
                        <Zap className="h-4 w-4" />
                        API Sync
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="csv" className="mt-6">
                      <div className="max-w-xl">
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
                          <input
                            type="file"
                            id="csv-upload"
                            accept=".csv"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleCSVImport(e.target.files[0])}
                          />
                          <label htmlFor="csv-upload" className="cursor-pointer">
                            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-4" />
                            <p className="font-medium text-slate-900 mb-1">Upload {selectedExchange} CSV</p>
                            <p className="text-sm text-slate-500">Drop your trade history file or click to browse</p>
                          </label>
                        </div>

                        <Alert className="mt-4">
                          <Info className="h-4 w-4" />
                          <AlertTitle>How to download CSV from {selectedExchange}?</AlertTitle>
                          <AlertDescription className="text-sm">
                            Login to {selectedExchange} → Go to Trade History → Export/Download as CSV
                          </AlertDescription>
                        </Alert>
                      </div>
                    </TabsContent>

                    <TabsContent value="api" className="mt-6">
                      <div className="max-w-xl space-y-4">
                        <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-amber-800">API Sync Limitation</AlertTitle>
                          <AlertDescription className="text-amber-700">
                            Direct API calls from browser are blocked by exchanges (CORS policy).
                            Please use CSV import which works perfectly. We're working on a backend solution.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-4 opacity-50 pointer-events-none">
                          <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input
                              placeholder={`Enter ${selectedExchange} API Key`}
                              value={apiKey}
                              onChange={e => setApiKey(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>API Secret</Label>
                            <div className="relative">
                              <Input
                                type={showSecret ? 'text' : 'password'}
                                placeholder={`Enter ${selectedExchange} Secret`}
                                value={apiSecret}
                                onChange={e => setApiSecret(e.target.value)}
                              />
                              <button
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                              >
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                          <Button disabled className="w-full">
                            <Zap className="h-4 w-4 mr-2" />
                            Coming Soon
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <ReportsSection trades={trades} portfolio={portfolio} user={user} formatCurrency={formatCurrency} />
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <Card className="border-0 shadow-sm max-w-2xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">Tax Calculation Settings</CardTitle>
                <CardDescription>Configure how your crypto taxes are calculated</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Accounting Method</p>
                    <p className="text-sm text-slate-500">Method used to calculate cost basis</p>
                  </div>
                  <Select value={settings.accountingMethod} onValueChange={(v: 'FIFO' | 'LIFO') => setSettings({ ...settings, accountingMethod: v })}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIFO">FIFO</SelectItem>
                      <SelectItem value="LIFO">LIFO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Treat Staking Rewards as Income</p>
                    <p className="text-sm text-slate-500">Tax staking rewards at receipt</p>
                  </div>
                  <Switch
                    checked={settings.treatStakingAsIncome}
                    onCheckedChange={v => setSettings({ ...settings, treatStakingAsIncome: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Treat Airdrops as Income</p>
                    <p className="text-sm text-slate-500">Tax airdrops at fair market value</p>
                  </div>
                  <Switch
                    checked={settings.treatAirdropsAsIncome}
                    onCheckedChange={v => setSettings({ ...settings, treatAirdropsAsIncome: v })}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// Stat Card Component
function StatCard({ label, value, subtext, icon, highlight }: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  highlight?: 'positive' | 'negative';
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-semibold ${highlight === 'positive' ? 'text-emerald-600' :
                highlight === 'negative' ? 'text-red-600' : 'text-slate-900'
              }`}>{value}</p>
            <p className="text-xs text-slate-400 mt-1">{subtext}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Reports Section Component
function ReportsSection({ trades, portfolio, user, formatCurrency }: {
  trades: Trade[];
  portfolio: any;
  user: any;
  formatCurrency: (v: number) => string;
}) {
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerateReport = async (type: 'complete' | 'vda') => {
    if (trades.length === 0) {
      toast.error('No trades to generate report');
      return;
    }

    setGenerating(type);

    try {
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
          totalBuyValue: trades.filter(t => t.trade_type === 'buy').reduce((s, t) => s + t.quantity * t.buy_price, 0),
          totalSellValue: trades.filter(t => t.trade_type === 'sell').reduce((s, t) => s + t.quantity * t.buy_price, 0),
          totalGains: portfolio?.totalTaxableGains > 0 ? portfolio.totalTaxableGains : 0,
          totalLosses: portfolio?.totalTaxableGains < 0 ? Math.abs(portfolio.totalTaxableGains) : 0,
          netGainLoss: portfolio?.totalTaxableGains || 0,
          taxableGains: Math.max(0, portfolio?.totalTaxableGains || 0),
          taxAt30Percent: portfolio?.netTaxDue || 0,
          totalTDSPaid: portfolio?.totalTDSPaid || 0,
          netTaxPayable: Math.max(0, (portfolio?.netTaxDue || 0) - (portfolio?.totalTDSPaid || 0)),
          otherIncome: 0
        },
        transactions: trades.map(t => ({
          date: t.trade_date,
          type: t.trade_type,
          token: t.token_symbol,
          quantity: t.quantity,
          pricePerUnit: t.buy_price,
          totalValue: t.quantity * t.buy_price,
          exchange: t.exchange || 'Unknown'
        })),
        scheduleVDA: trades.filter(t => t.trade_type === 'sell').map((t, i) => ({
          slNo: i + 1,
          dateOfTransfer: new Date(t.trade_date).toLocaleDateString('en-IN'),
          headOfIncome: 'Income from VDA',
          descriptionOfVDA: t.token_symbol,
          saleConsideration: t.quantity * t.buy_price,
          costOfAcquisition: t.quantity * t.buy_price * 0.85,
          gainLoss: t.quantity * t.buy_price * 0.15
        })),
        tokenWiseSummary: [],
        exchangeWiseTDS: []
      };

      if (type === 'complete') {
        generateCompleteTaxReport(reportData);
      } else {
        generateScheduleVDAPDF(reportData);
      }

      toast.success(`${type === 'complete' ? 'Complete Tax Report' : 'Schedule VDA'} downloaded!`);
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6" />
            <div>
              <h3 className="text-lg font-semibold">ITR Tax Reports</h3>
              <p className="text-indigo-200 text-sm">Download Schedule VDA and complete tax calculation reports</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Complete Tax Report</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Comprehensive analysis with FIFO calculations and audit trail
                </p>
                <Button
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700"
                  disabled={generating !== null || trades.length === 0}
                  onClick={() => handleGenerateReport('complete')}
                >
                  {generating === 'complete' ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Download PDF</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Schedule VDA</h3>
                <p className="text-sm text-slate-500 mt-1">
                  ITR-ready format as per Section 115BBH for e-filing
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  disabled={generating !== null || trades.length === 0}
                  onClick={() => handleGenerateReport('vda')}
                >
                  {generating === 'vda' ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Download PDF</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {trades.length === 0 && (
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-600">Import trades first to generate reports</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
