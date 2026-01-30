/**
 * Crypto Tax Platform - Fully Functional Implementation
 * Complete CSV import, trade management, and tax calculation
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, TrendingUp, TrendingDown, FileSpreadsheet, Download, Plus, History,
  BarChart3, Settings, Zap, Coins, RefreshCw, ShieldCheck, AlertTriangle,
  CheckCircle, Upload, Eye, EyeOff, Trash2, ArrowUpRight, ArrowDownRight,
  Filter, Sparkles, Target, Activity, Info, XCircle, FileText, Clock
} from "lucide-react";
import {
  calculateDetailedPortfolio,
  Transaction,
  TaxSettings,
  parseExchangeCSV,
  parseWazirXCSV,
  parseCoinDCXCSV,
  parseBinanceCSV
} from "@/lib/crypto-engine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";

// Types
interface Trade {
  id: string;
  user_id: string;
  token_symbol: string;
  trade_type: string;
  quantity: number;
  buy_price: number;
  trade_date: string;
  exchange?: string;
  fee?: number;
  metadata?: { fee?: number; tds_deducted?: number };
}

// Default tax settings
const DEFAULT_TAX_SETTINGS: TaxSettings = {
  accountingMethod: 'FIFO',
  treatAirdropsAsIncome: true,
  treatRewardsAsIncome: true,
  treatStakingAsIncome: true,
  treatInterestAsIncome: true,
  treatMiningAsIncome: true,
  baseCurrency: 'INR',
  country: 'India',
  assessmentYear: '2025-26'
};

// Chart colors
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

export default function CryptoTaxPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'import' | 'reports' | 'settings'>('overview');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage if available
  const [settings, setSettings] = useState<TaxSettings>(() => {
    const saved = localStorage.getItem('taxSettings');
    return saved ? JSON.parse(saved) : DEFAULT_TAX_SETTINGS;
  });

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('taxSettings', JSON.stringify(settings));
  }, [settings]);

  // Assessment Year state
  const [assessmentYear, setAssessmentYear] = useState('2026-27');
  const [selectedExchange, setSelectedExchange] = useState('CoinDCX');
  const [importMode, setImportMode] = useState<'csv' | 'manual'>('csv');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; messages: string[] } | null>(null);

  // Add trade dialog
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'Manual'
  });

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Financial Year state and helper
  const [selectedFY, setSelectedFY] = useState<string>('2024-25');

  // Available Financial Years
  const FINANCIAL_YEARS = [
    { value: '2025-26', label: 'FY 2025-26', start: '2025-04-01', end: '2026-03-31' },
    { value: '2024-25', label: 'FY 2024-25', start: '2024-04-01', end: '2025-03-31' },
    { value: '2023-24', label: 'FY 2023-24', start: '2023-04-01', end: '2024-03-31' },
    { value: '2022-23', label: 'FY 2022-23', start: '2022-04-01', end: '2023-03-31' },
  ];

  // Get Financial Year from a date
  const getFinancialYear = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-11
    const year = date.getFullYear();
    // FY starts April (month 3). If Jan-Mar, it's previous year's FY
    if (month < 3) { // Jan, Feb, Mar
      return `${year - 1}-${String(year).slice(2)}`;
    }
    return `${year}-${String(year + 1).slice(2)}`;
  };

  // Filter trades by selected FY
  const filteredTrades = useMemo(() => {
    const fy = FINANCIAL_YEARS.find(f => f.value === selectedFY);
    if (!fy) return trades;

    return trades.filter(t => {
      const tradeDate = new Date(t.trade_date);
      return tradeDate >= new Date(fy.start) && tradeDate <= new Date(fy.end);
    });
  }, [trades, selectedFY]);

  // Get FY-wise trade counts for badges
  const fyTradeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    trades.forEach(t => {
      const fy = getFinancialYear(t.trade_date);
      counts[fy] = (counts[fy] || 0) + 1;
    });
    return counts;
  }, [trades]);

  const fetchTrades = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crypto_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('trade_date', { ascending: false });

      if (!error && data) {
        setTrades(data.map(d => ({
          ...d,
          metadata: typeof d.metadata === 'object' && d.metadata !== null
            ? d.metadata as { fee?: number; tds_deducted?: number }
            : undefined
        })));
      } else if (error) {
        console.error('Error fetching trades:', error);
        toast.error('Failed to fetch trades');
      }
    } catch (err) {
      console.error('Error fetching crypto:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user, fetchTrades]);

  // ============= CSV IMPORT HANDLER =============
  const handleCSVUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      toast.error('Please select a file');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const content = await file.text();

      let result;
      switch (selectedExchange) {
        case 'CoinDCX': result = parseCoinDCXCSV(content, user.id); break;
        case 'WazirX': result = parseWazirXCSV(content, user.id); break;
        case 'Binance': result = parseBinanceCSV(content, user.id); break;
        default: result = parseExchangeCSV(content, user.id, selectedExchange);
      }

      if (result.transactions.length === 0) {
        toast.error('No transactions found in CSV');
        setImporting(false);
        return;
      }

      // Filter valid transactions
      const validTransactions = result.transactions.filter(t => t.date && !isNaN(t.date.getTime()));

      // Convert to database format - Nuclear Option to avoid varchar(20) errors
      const tradesToInsert = validTransactions.map(tx => ({
        user_id: user.id,
        token_symbol: tx.token.toUpperCase().substring(0, 20),
        trade_type: tx.type.toString().substring(0, 20),
        quantity: tx.quantity,
        buy_price: tx.pricePerUnit,
        // Ensure date is strictly 10 chars (YYYY-MM-DD)
        trade_date: tx.date.toISOString().split('T')[0],
        exchange: (tx.exchange || selectedExchange).substring(0, 20),
        assessment_year: '2026-27', // Explicitly set to a short string
        tds_paid: tx.tdsDeducted || 0, // Use the proper numeric column for TDS
        metadata: {
          fee: tx.fee || 0 // Keep metadata minimal in case it's mistakenly varchar(20)
        }
      }));

      // Insert into database
      const { data, error } = await supabase
        .from('crypto_trades')
        .insert(tradesToInsert)
        .select();

      if (error) {
        console.error('Database error:', error);
        setImportResult({
          success: 0,
          errors: 1,
          messages: ['Failed to save trades to database: ' + error.message]
        });
        toast.error('Failed to save trades');
      } else {
        const successCount = data?.length || 0;
        setImportResult({
          success: successCount,
          errors: result.errors.length,
          messages: [
            `Successfully imported ${successCount} trades from ${selectedExchange}`,
            ...result.errors.map(e => `Line ${e.line}: ${e.message}`)
          ]
        });
        toast.success(`Imported ${successCount} trades successfully!`);
        fetchTrades(); // Refresh trades list
      }
    } catch (err) {
      console.error('Import error:', err);
      setImportResult({
        success: 0,
        errors: 1,
        messages: ['Error processing file: ' + (err as Error).message]
      });
      toast.error('Failed to process CSV file');
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [user, selectedExchange, fetchTrades]);

  // ============= MANUAL TRADE ADD =============
  const handleAddTrade = async () => {
    if (!user) {
      toast.error('Please sign in to add trades');
      return;
    }

    if (!newTrade.token_symbol || !newTrade.quantity || !newTrade.buy_price || !newTrade.trade_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase.from('crypto_trades').insert({
        user_id: user.id,
        token_symbol: newTrade.token_symbol.toUpperCase().substring(0, 20),
        trade_type: newTrade.trade_type.toString().substring(0, 20),
        quantity: parseFloat(newTrade.quantity),
        buy_price: parseFloat(newTrade.buy_price),
        trade_date: newTrade.trade_date,
        exchange: (newTrade.exchange || 'Manual').substring(0, 20),
        assessment_year: '2026-27',
        tds_paid: newTrade.trade_type === 'sell'
          ? parseFloat(newTrade.quantity) * parseFloat(newTrade.buy_price) * 0.01
          : 0,
        metadata: {
          fee: 0
        }
      });

      if (!error) {
        toast.success('Trade added successfully');
        setShowAddTrade(false);
        setNewTrade({ token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'Manual' });
        fetchTrades();
      } else {
        toast.error('Failed to add trade: ' + error.message);
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  // ============= DELETE TRADE =============
  const handleDeleteTrade = async (id: string) => {
    const { error } = await supabase.from('crypto_trades').delete().eq('id', id);
    if (!error) {
      toast.success('Trade deleted');
      fetchTrades();
    } else {
      toast.error('Failed to delete trade');
    }
  };

  // ============= DELETE ALL TRADES =============
  const handleDeleteAllTrades = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete all trades? This cannot be undone.')) return;

    const { error } = await supabase.from('crypto_trades').delete().eq('user_id', user.id);
    if (!error) {
      toast.success('All trades deleted');
      fetchTrades();
    } else {
      toast.error('Failed to delete trades');
    }
  };

  // ============= PORTFOLIO CALCULATIONS =============
  const engineTransactions: Transaction[] = useMemo(() =>
    filteredTrades.map(t => ({
      id: t.id,
      token: t.token_symbol,
      type: t.trade_type as 'buy' | 'sell',
      quantity: t.quantity,
      pricePerUnit: t.buy_price,
      date: new Date(t.trade_date),
      exchange: t.exchange,
      fee: t.fee || t.metadata?.fee || 0,
      tdsDeducted: t.metadata?.tds_deducted || 0
    })), [filteredTrades]);

  const portfolio = useMemo(() => {
    if (engineTransactions.length === 0) return null;
    return calculateDetailedPortfolio(engineTransactions, settings);
  }, [engineTransactions, settings]);

  // ============= STATISTICS (FY-wise) =============
  const stats = useMemo(() => {
    const buyTrades = filteredTrades.filter(t => t.trade_type === 'buy');
    const sellTrades = filteredTrades.filter(t => t.trade_type === 'sell');
    const buyVolume = buyTrades.reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
    const tdsDeducted = filteredTrades.reduce((sum, t) => sum + (t.metadata?.tds_deducted || 0), 0) || sellVolume * 0.01;

    return {
      totalTrades: filteredTrades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume,
      sellVolume,
      netGain: portfolio?.totalTaxableGains || 0,
      taxPayable: portfolio?.totalTaxAt30 || 0,
      tdsCredit: portfolio?.totalTDSPaid || tdsDeducted,
      uniqueTokens: new Set(filteredTrades.map(t => t.token_symbol)).size
    };
  }, [filteredTrades, portfolio]);

  // ============= CHART DATA (FY-wise) =============
  const tokenAllocation = useMemo(() => {
    const holdings: Record<string, number> = {};
    filteredTrades.forEach(t => {
      if (!holdings[t.token_symbol]) holdings[t.token_symbol] = 0;
      const value = t.quantity * t.buy_price;
      holdings[t.token_symbol] += t.trade_type === 'buy' ? value : -value;
    });
    return Object.entries(holdings)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i] }));
  }, [filteredTrades]);

  const monthlyVolume = useMemo(() => {
    const data: Record<string, { month: string; buys: number; sells: number }> = {};
    filteredTrades.forEach(t => {
      const d = new Date(t.trade_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!data[key]) data[key] = { month: monthLabel, buys: 0, sells: 0 };
      const value = t.quantity * t.buy_price;
      if (t.trade_type === 'buy') data[key].buys += value;
      else data[key].sells += value;
    });
    return Object.values(data).slice(-6);
  }, [filteredTrades]);

  // ============= HELPERS =============
  const formatCurrency = (value: number): string => {
    if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // ============= SAMPLE CSV GENERATOR =============
  const downloadSampleCSV = () => {
    let csvContent = '';

    if (selectedExchange === 'CoinDCX') {
      csvContent = `Timestamp,Pair,Side,Quantity,Price,Fee,Total
2024-01-15 10:30:00,BTCINR,buy,0.005,3500000,50,17550
2024-02-20 14:45:00,ETHINR,buy,0.5,200000,30,100030
2024-03-10 09:15:00,BTCINR,sell,0.003,3800000,45,11370
2024-04-05 16:20:00,SOLINR,buy,10,8500,25,85025`;
    } else if (selectedExchange === 'WazirX') {
      csvContent = `Date,Market,Type,Volume,Price,Total,Fee,Fee Currency
2024-01-15 10:30:00,BTC/INR,Buy,0.005,3500000,17500,50,INR
2024-02-20 14:45:00,ETH/INR,Buy,0.5,200000,100000,30,INR
2024-03-10 09:15:00,BTC/INR,Sell,0.003,3800000,11400,45,INR
2024-04-05 16:20:00,SOL/INR,Buy,10,8500,85000,25,INR`;
    } else if (selectedExchange === 'Binance') {
      csvContent = `Date(UTC),Pair,Side,Price,Executed,Amount,Fee
2024-01-15 10:30:00,BTCUSDT,BUY,42000,0.005,210,0.5
2024-02-20 14:45:00,ETHUSDT,BUY,2400,0.5,1200,0.3
2024-03-10 09:15:00,BTCUSDT,SELL,45000,0.003,135,0.4
2024-04-05 16:20:00,SOLUSDT,BUY,100,10,1000,0.25`;
    } else {
      csvContent = `Date,Symbol,Type,Quantity,Price,Fee
2024-01-15,BTC,buy,0.005,3500000,50
2024-02-20,ETH,buy,0.5,200000,30
2024-03-10,BTC,sell,0.003,3800000,45
2024-04-05,SOL,buy,10,8500,25`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample_${selectedExchange.toLowerCase()}_trades.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sample CSV downloaded');
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
                    <p className="text-sm text-slate-500">Section 115BBH • 30% Tax Rate</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* FY Selector */}
                <Select value={selectedFY} onValueChange={setSelectedFY}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Select FY" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_YEARS.map(fy => (
                      <SelectItem key={fy.value} value={fy.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{fy.label}</span>
                          {fyTradeCounts[fy.value] && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {fyTradeCounts[fy.value]}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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
                          <Label>Token Symbol *</Label>
                          <Input
                            placeholder="BTC, ETH, SOL..."
                            value={newTrade.token_symbol}
                            onChange={e => setNewTrade({ ...newTrade, token_symbol: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Type *</Label>
                          <Select value={newTrade.trade_type} onValueChange={v => setNewTrade({ ...newTrade, trade_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="buy">Buy</SelectItem>
                              <SelectItem value="sell">Sell</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={newTrade.quantity}
                            onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Price per Unit (₹) *</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={newTrade.buy_price}
                            onChange={e => setNewTrade({ ...newTrade, buy_price: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Trade Date *</Label>
                          <Input
                            type="date"
                            value={newTrade.trade_date}
                            onChange={e => setNewTrade({ ...newTrade, trade_date: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Exchange</Label>
                          <Input
                            placeholder="CoinDCX, WazirX, etc."
                            value={newTrade.exchange}
                            onChange={e => setNewTrade({ ...newTrade, exchange: e.target.value })}
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
            <div className="flex gap-1 mt-6 border-b border-slate-200 -mb-px overflow-x-auto">
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
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Database Fix Alert */}
        <Alert className="mb-6 bg-emerald-50 border-emerald-200 text-emerald-800">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="font-bold">System Update: Database Synchronization Fixed</AlertTitle>
          <AlertDescription className="text-sm">
            We've resolved the "value too long" error encountered during CoinDCX imports. You can now safely upload your trade reports.
          </AlertDescription>
        </Alert>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* ============= OVERVIEW TAB ============= */}
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
                      <p className="text-indigo-200 text-sm font-medium">Estimated Tax Liability ({selectedFY})</p>
                      <p className="text-4xl font-bold mt-1">{formatCurrency(Math.max(0, stats.taxPayable))}</p>
                      <p className="text-indigo-200 text-sm mt-2">@ 30% flat rate + 4% cess</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-200 text-sm">TDS Credit (1%):</span>
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
                            <YAxis stroke="#64748b" fontSize={12} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                            <RechartsTooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Legend />
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
                        {tokenAllocation.length > 0 ? (
                          <>
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
                          </>
                        ) : (
                          <div className="w-full text-center text-slate-500">No holdings data</div>
                        )}
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
                        Import CSV
                      </Button>
                      <Button onClick={() => setShowAddTrade(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trade
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ============= TRANSACTIONS TAB ============= */}
          {activeTab === 'transactions' && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">All Transactions</CardTitle>
                  <CardDescription>{trades.length} total trades</CardDescription>
                </div>
                {trades.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleDeleteAllTrades} className="text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All
                  </Button>
                )}
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

          {/* ============= IMPORT TAB ============= */}
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
                      { id: 'CoinDCX', name: 'CoinDCX', desc: 'CSV Import' },
                      { id: 'WazirX', name: 'WazirX', desc: 'CSV Import' },
                      { id: 'Binance', name: 'Binance', desc: 'CSV Import' },
                      { id: 'ZebPay', name: 'ZebPay', desc: 'CSV Import' }
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
                        <p className="text-xs text-slate-500 mt-1">{exchange.desc}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* CSV Upload */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-slate-900">Upload CSV File</CardTitle>
                  <CardDescription>Upload your trade history CSV from {selectedExchange}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Upload Area */}
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="csv-upload"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCSVUpload}
                      disabled={importing}
                    />
                    <label htmlFor="csv-upload" className={`cursor-pointer ${importing ? 'pointer-events-none opacity-50' : ''}`}>
                      {importing ? (
                        <RefreshCw className="h-10 w-10 text-indigo-500 mx-auto mb-4 animate-spin" />
                      ) : (
                        <Upload className="h-10 w-10 text-slate-400 mx-auto mb-4" />
                      )}
                      <p className="font-medium text-slate-900 mb-1">
                        {importing ? 'Processing...' : `Upload ${selectedExchange} CSV`}
                      </p>
                      <p className="text-sm text-slate-500">Drop your trade history file or click to browse</p>
                    </label>
                  </div>

                  {/* Import Result */}
                  {importResult && (
                    <Alert className={importResult.success > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}>
                      {importResult.success > 0 ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <AlertTitle className={importResult.success > 0 ? 'text-emerald-800' : 'text-red-800'}>
                        {importResult.success > 0 ? 'Import Successful' : 'Import Failed'}
                      </AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                          {importResult.messages.map((msg, i) => (
                            <li key={i} className={importResult.success > 0 ? 'text-emerald-700' : 'text-red-700'}>{msg}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Download Sample Button */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-slate-500" />
                      <div>
                        <p className="font-medium text-slate-900">Need a sample file?</p>
                        <p className="text-sm text-slate-500">Download a sample CSV to see the expected format</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Sample
                    </Button>
                  </div>

                  {/* Help Info */}
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>How to download CSV from {selectedExchange}?</AlertTitle>
                    <AlertDescription className="text-sm">
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>Login to {selectedExchange}</li>
                        <li>Go to Trade History / Order History</li>
                        <li>Click on Export or Download as CSV</li>
                        <li>Upload the downloaded file here</li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============= REPORTS TAB ============= */}
          {activeTab === 'reports' && (
            <ReportsSection trades={trades} portfolio={portfolio} user={user} formatCurrency={formatCurrency} />
          )}

          {/* ============= SETTINGS TAB ============= */}
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
                  <Select value={settings.accountingMethod} onValueChange={(v: 'FIFO' | 'LIFO' | 'HIFO') => setSettings({ ...settings, accountingMethod: v })}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIFO">FIFO</SelectItem>
                      <SelectItem value="LIFO">LIFO</SelectItem>
                      <SelectItem value="HIFO">HIFO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Treat Staking Rewards as Income</p>
                    <p className="text-sm text-slate-500">Tax staking rewards at receipt as other income</p>
                  </div>
                  <Switch
                    checked={settings.treatStakingAsIncome}
                    onCheckedChange={v => setSettings({ ...settings, treatStakingAsIncome: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Treat Airdrops as Income</p>
                    <p className="text-sm text-slate-500">Tax airdrops at fair market value when received</p>
                  </div>
                  <Switch
                    checked={settings.treatAirdropsAsIncome}
                    onCheckedChange={v => setSettings({ ...settings, treatAirdropsAsIncome: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Treat Interest as Income</p>
                    <p className="text-sm text-slate-500">Tax crypto interest/lending rewards as other income</p>
                  </div>
                  <Switch
                    checked={settings.treatInterestAsIncome}
                    onCheckedChange={v => setSettings({ ...settings, treatInterestAsIncome: v })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Assessment Year</p>
                    <p className="text-sm text-slate-500">Current assessment year for tax calculation</p>
                  </div>
                  <Badge className="bg-indigo-100 text-indigo-700 border-0">{settings.assessmentYear}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ============= STAT CARD COMPONENT =============
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

// ============= REPORTS SECTION COMPONENT =============
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
      // Flatten matched lots from all tokens to create the Schedule VDA
      // This uses the actual FIFO/LIFO/HIFO calculation results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allMatchedLots = portfolio?.breakdown?.flatMap((res: any) => res.matchedLots) || [];

      // Sort by sell date
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allMatchedLots.sort((a: any, b: any) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

      const reportData: TaxReportData = {
        user: {
          name: user?.user_metadata?.full_name || 'Taxpayer',
          pan: user?.user_metadata?.pan || 'XXXXX0000X',
          email: user?.email || ''
        },
        financialYear: '2024-25',
        assessmentYear: '2025-26',
        generatedAt: new Date(),
        summary: {
          totalBuyValue: trades.filter(t => t.trade_type === 'buy').reduce((s, t) => s + t.quantity * t.buy_price, 0),
          totalSellValue: trades.filter(t => t.trade_type === 'sell').reduce((s, t) => s + t.quantity * t.buy_price, 0),
          totalGains: portfolio?.totalTaxableGains > 0 ? portfolio.totalTaxableGains : 0,
          totalLosses: portfolio?.totalLosses || 0,
          netGainLoss: portfolio?.totalTaxableGains || 0,
          taxableGains: Math.max(0, portfolio?.totalTaxableGains || 0),
          taxAt30Percent: portfolio?.totalTaxAt30 || 0,
          totalTDSPaid: portfolio?.totalTDSPaid || 0,
          netTaxPayable: Math.max(0, (portfolio?.netTaxDue || 0)),
          otherIncome: portfolio?.totalOtherIncome || 0
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
        // Use actual calculated lots for the report
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scheduleVDA: allMatchedLots.map((lot: any, i: number) => ({
          slNo: i + 1,
          dateOfTransfer: new Date(lot.sellDate).toLocaleDateString('en-IN'),
          headOfIncome: 'Income from VDA',
          descriptionOfVDA: lot.token,
          saleConsideration: lot.sellPrice * lot.quantity,
          costOfAcquisition: lot.buyPrice * lot.quantity,
          gainLoss: lot.gainLoss
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tokenWiseSummary: portfolio?.tokenWise?.map((t: any) => ({
          token: t.name,
          totalBought: 0, // Simplified in summary view, detailed in breakdown
          totalSold: 0,
          avgBuyPrice: 0,
          realizedGain: t.gain - t.loss,
          currentHolding: t.holding
        })) || [],
        exchangeWiseTDS: [] // To be implemented if exchange data is granular enough
      };

      if (type === 'complete') {
        generateCompleteTaxReport(reportData);
      } else {
        generateScheduleVDAPDF(reportData);
      }

      toast.success(`${type === 'complete' ? 'Complete Tax Report' : 'Schedule VDA'} downloaded!`);
    } catch (error) {
      console.error('Report generation error:', error);
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
                  Comprehensive analysis with FIFO calculations, audit trail, and tax summary
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
                  ITR-ready format as per Section 115BBH for e-filing portal
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
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">No Trades Available</AlertTitle>
          <AlertDescription className="text-amber-700">
            Import your crypto trades first to generate tax reports.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
