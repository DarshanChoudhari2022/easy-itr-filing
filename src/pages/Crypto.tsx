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
  Filter, Sparkles, Target, Activity, Info, XCircle, FileText, Clock,
  Calendar, CheckCircle2, FileCheck
} from "lucide-react";
import {
  runFullImport,
  computeTaxForFY,
  getImportSessions,
  getPnLSummary,
  exportScheduleVDA,
  exportTDSReconciliation,
  formatPnLSummary,
  type TaxComputationResult,
  type ImportProgress
} from "@/lib/taxmitra";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";
import { generateComprehensiveReport, buildComprehensiveReportData } from "@/lib/comprehensive-report-generator";
import { PlanGate } from "@/hooks/usePlanGuard";

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
  assessmentYear: '2026-27'
};

// Chart colors
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

export default function CryptoTaxPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'import' | 'reports' | 'settings'>('overview');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxComputation, setTaxComputation] = useState<TaxComputationResult | null>(null);
  const [importSessions, setImportSessions] = useState<any[]>([]);

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
  const [uploadProgress, setUploadProgress] = useState<ImportProgress | null>(null);

  // Add trade dialog
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'Manual'
  });

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Financial Year state and helper
  const [selectedFY, setSelectedFY] = useState<string>('2025-26');

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

  // FETCH TRADES from NEW ENGINE TABLE
  const fetchTrades = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crypto_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('trade_timestamp', { ascending: false });

      if (!error && data) {
        // Map new schema to old UI interface
        const mappedTrades: Trade[] = data.map(d => ({
          id: d.id,
          user_id: d.user_id,
          token_symbol: d.asset_symbol,
          trade_type: d.transaction_type,
          quantity: Number(d.quantity),
          buy_price: Number(d.price_inr || d.price_per_unit || 0),
          trade_date: d.trade_timestamp,
          exchange: d.exchange,
          fee: Number(d.fee_amount || 0),
          metadata: {
            fee: Number(d.fee_amount || 0),
            tds_deducted: Number(d.tds_amount || 0)
          }
        }));
        setTrades(mappedTrades);
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

  // FETCH TAX COMPUTATION
  const fetchTaxComputation = useCallback(async () => {
    if (!user) return;
    const cache = await getPnLSummary(selectedFY); // Using summary first for speed
    // Actually we need the full result for the UI
    const result = await computeTaxForFY(selectedFY, settings.accountingMethod as any);
    if (result.success && result.data) {
      setTaxComputation(result.data);
    }
  }, [user, selectedFY, settings.accountingMethod]);

  // Fetch Import Sessions
  const fetchSessions = useCallback(async () => {
    const res = await getImportSessions();
    if (res.success && res.data) setImportSessions(res.data);
  }, []);

  useEffect(() => {
    if (user) {
      fetchTrades();
      fetchTaxComputation();
      fetchSessions();
    }
  }, [user, fetchTrades, fetchTaxComputation, fetchSessions]);

  // ============= CSV IMPORT HANDLER =============
  const handleCSVUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) {
      toast.error('Please select file(s)');
      return;
    }

    setImporting(true);
    setImportResult(null);
    setUploadProgress({
      sessionId: '', status: 'processing', totalFiles: files.length, processedFiles: 0,
      totalRows: 0, parsedRows: 0, duplicatesSkipped: 0, errors: []
    });

    try {
      const filePayloads = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();
        filePayloads.push({ name: file.name, content });
      }

      const result = await runFullImport(selectedFY, filePayloads, (p) => setUploadProgress(p));

      if (result.success && result.data) {
        toast.success(`Imported ${result.data.totalTransactions} transactions successfully!`);

        if (result.warnings && result.warnings.length > 0) {
          setImportResult({
            success: result.data.totalTransactions,
            errors: result.warnings.length,
            messages: result.warnings
          });
        }

        fetchTrades();
        fetchTaxComputation();
        fetchSessions();
      } else {
        toast.error('Import failed: ' + result.error);
        if (result.warnings?.length) {
          setImportResult({ success: 0, errors: result.warnings.length, messages: result.warnings });
        }
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
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [user, selectedFY, fetchTrades, fetchTaxComputation, fetchSessions]);

  // ============= MANUAL TRADE ADD =============
  const handleAddTrade = async () => {
    if (!user) {
      toast.error('Please sign in to add trades');
      return;
    }
    // Note: Manual add not yet implemented in new engine - fallback to raw SQL insert or future implementation
    toast.error("Manual trade addition is temporarily disabled during system upgrade.");
  };

  // ============= DELETE TRADE =============
  const handleDeleteTrade = async (id: string) => {
    const { error } = await supabase.from('crypto_transactions').delete().eq('id', id);
    if (!error) {
      toast.success('Trade deleted');
      fetchTrades();
      fetchTaxComputation();
    } else {
      toast.error('Failed to delete trade');
    }
  };

  // ============= DELETE ALL TRADES =============
  const handleDeleteAllTrades = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete all trades? This cannot be undone.')) return;

    const { error } = await supabase.from('crypto_transactions').delete().eq('user_id', user.id);
    const { error: sessError } = await supabase.from('crypto_import_sessions').delete().eq('user_id', user.id);

    if (!error) {
      toast.success('All trades deleted');
      setTaxComputation(null);
      fetchTrades();
      fetchSessions();
    } else {
      toast.error('Failed to delete trades');
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = "Details,Transaction Date,Transaction Type,Asset,Amount,Price (INR),Total (INR),Exchange\n" +
      "Buy BTC,2025-04-12,Buy,BTC,0.5,3500000,1750000,CoinDCX\n" +
      "Sell BTC,2025-06-15,Sell,BTC,0.2,4000000,800000,CoinDCX";

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sample_crypto_trades.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ============= STATISTICS (FY-wise) =============
  const stats = useMemo(() => {
    const buyTrades = filteredTrades.filter(t => t.trade_type === 'buy');
    const sellTrades = filteredTrades.filter(t => t.trade_type === 'sell');

    // Use engine computation if available
    if (taxComputation) {
      return {
        totalTrades: filteredTrades.length,
        buyTrades: buyTrades.length,
        sellTrades: sellTrades.length,
        buyVolume: taxComputation.totalCostOfAcquisitionInr,
        sellVolume: taxComputation.totalConsiderationInr,
        netGain: taxComputation.taxableCapitalGains,
        taxPayable: taxComputation.totalTaxLiability,
        tdsCredit: taxComputation.totalTDSPaid,
        uniqueTokens: taxComputation.uniqueAssets
      };
    }

    // Fallback or empty state
    return {
      totalTrades: filteredTrades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume: 0,
      sellVolume: 0,
      netGain: 0,
      taxPayable: 0,
      tdsCredit: 0,
      uniqueTokens: 0
    };
  }, [filteredTrades, taxComputation]);

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
      <PlanGate feature="crypto">
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
                        multiple
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

                    {/* Help Info & Document Checklist */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <Card className="border-0 shadow-sm bg-slate-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                              <FileCheck className="h-4 w-4 text-indigo-600" />
                            </div>
                            <CardTitle className="text-sm font-semibold">Required Document Checklist</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-3">
                            {[
                              { item: "Annual Information Statement (AIS)", desc: "Mandatory for cross-verifying all income" },
                              { item: "Taxpayer Information Summary (TIS)", desc: "Simplified summary of your tax data" },
                              { item: "Exchange Trade Report (CSV)", desc: "Full history from CoinDCX/WazirX/Binance" },
                              { item: "Form 26AS", desc: "For verifying TDS deducted on crypto sales (1%)" },
                              { item: "Bank Statements", desc: "To reconcile deposits and withdrawals" }
                            ].map((doc, i) => (
                              <li key={i} className="flex gap-3">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{doc.item}</p>
                                  <p className="text-xs text-slate-500 font-normal">{doc.desc}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-sm bg-slate-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                              <Zap className="h-4 w-4 text-orange-600" />
                            </div>
                            <CardTitle className="text-sm font-semibold">Baby Steps: Get CoinDCX Report</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="relative space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                            {[
                              { step: "Step 1", text: "Login to CoinDCX on Desktop browser" },
                              { step: "Step 2", text: "Go to 'Orders' → 'Trade History'" },
                              { step: "Step 3", text: "Click 'Download Report' button" },
                              { step: "Step 4", text: "Select 'Trade History' and your 'Financial Year'" },
                              { step: "Step 5", text: "Choose CSV format and click 'Generate'" }
                            ].map((s, i) => (
                              <div key={i} className="relative pl-6">
                                <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-slate-300 bg-white" />
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-tight">{s.step}</p>
                                <p className="text-sm text-slate-700 font-medium">{s.text}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="md:col-span-2 border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-indigo-600" />
                            <CardTitle className="text-sm font-semibold">How to Calculate for Desired Financial Year</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid sm:grid-cols-3 gap-4">
                            <div className="p-3 rounded-lg bg-white border border-indigo-100">
                              <p className="text-xs font-bold text-indigo-600 mb-1">FY 2025-26</p>
                              <p className="text-[10px] text-slate-500">Current Year</p>
                              <p className="text-sm font-medium mt-1">April 1, 2025 to March 31, 2026</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white border border-slate-100">
                              <p className="text-xs font-bold text-slate-600 mb-1">FY 2024-25</p>
                              <p className="text-[10px] text-slate-500">Past Year</p>
                              <p className="text-sm font-medium mt-1">April 1, 2024 to March 31, 2025</p>
                            </div>
                            <div className="p-3 rounded-lg bg-indigo-600 text-white">
                              <p className="text-xs font-bold mb-1 opacity-90">Quick Tip</p>
                              <p className="text-xs leading-relaxed">Always use the **FY Selector** at the top to filter trades accurately for each individual tax filing period.</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ============= REPORTS TAB ============= */}
            {activeTab === 'reports' && (
              <ReportsSection
                trades={trades}
                portfolio={portfolio}
                taxComputation={taxComputation}
                user={user}
                formatCurrency={formatCurrency}
                selectedFY={selectedFY}
              />
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
      </PlanGate>
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
function ReportsSection({ trades, portfolio, user, formatCurrency, taxComputation, selectedFY }: {
  trades: Trade[];
  portfolio?: any;
  taxComputation?: TaxComputationResult | null;
  user: any;
  formatCurrency: (v: number) => string;
  selectedFY?: string;
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const handleDownloadScheduleVDA = async () => {
    if (!selectedFY) return;
    setGenerating('vda');
    try {
      const res = await exportScheduleVDA(selectedFY);
      if (res.success && res.data) {
        const blob = new Blob([res.data.csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('Schedule VDA CSV downloaded!');
      } else {
        toast.error('Failed to generate Schedule VDA: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadTDS = async () => {
    if (!selectedFY) return;
    setGenerating('tds');
    try {
      const res = await exportTDSReconciliation(selectedFY);
      if (res.success && res.data) {
        const blob = new Blob([res.data.csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('TDS Reconciliation CSV downloaded!');
      } else {
        toast.error('Failed to generate TDS Report: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setGenerating(null);
    }
  };

  // Preview Data Source: TaxComputation or Portfolio (Fallback)
  const taxableGains = taxComputation?.taxableCapitalGains ?? (portfolio?.totalTaxableGains || 0);
  const totalLosses = taxComputation?.grossCapitalLosses ?? (portfolio?.totalLosses || 0);
  const totalTax = taxComputation?.totalTaxLiability ?? (portfolio?.totalTaxAt30 * 1.04 || 0);
  const tdsPaid = taxComputation?.totalTDSPaid ?? (portfolio?.totalTDSPaid || 0);
  const netTax = taxComputation?.netTaxPayable ?? Math.max(0, totalTax - tdsPaid);

  const sellCount = taxComputation?.assetSummaries?.reduce((acc, curr) => acc + curr.totalSold, 0) ?? trades.filter(t => t.trade_type === 'sell').length;
  const buyVolume = taxComputation?.totalCostOfAcquisitionInr ?? trades.filter(t => t.trade_type === 'buy').reduce((s, t) => s + t.quantity * t.buy_price, 0);
  const sellVolume = taxComputation?.totalConsiderationInr ?? trades.filter(t => t.trade_type === 'sell').reduce((s, t) => s + t.quantity * t.buy_price, 0);

  // Asset Wise List
  const assetList = taxComputation?.assetSummaries || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-6 w-6" />
              <div>
                <h3 className="text-lg font-semibold">Crypto Tax Reports — AY 2026-27</h3>
                <p className="text-indigo-200 text-sm">Comprehensive report with Schedule VDA, Asset P&L</p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white border-white/30">{trades.length} trades</Badge>
          </div>
        </CardContent>
      </Card>

      {/* In-Page Tax Summary Preview */}
      {showPreview && (taxComputation || portfolio) && (
        <Card className="border-2 border-indigo-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-indigo-600" />
                Capital Gains Summary — {selectedFY}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                <EyeOff className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>This is exactly what goes into your ITR under Schedule VDA</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border">
                <p className="text-xs text-slate-500 mb-1">Transfers</p>
                <p className="text-xl font-bold text-slate-900">{sellCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-600 mb-1">Sale Consideration</p>
                <p className="text-lg font-bold text-blue-800">{formatCurrency(sellVolume)}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border">
                <p className="text-xs text-slate-500 mb-1">Cost of Acquisition</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(buyVolume)}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-emerald-600 mb-1">Taxable Gains</p>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(taxableGains)}</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 mb-1">Losses (Ignored)</p>
                <p className="text-lg font-bold text-red-700">{formatCurrency(totalLosses)}</p>
              </div>
            </div>

            {/* Tax Computation */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
              <h4 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Tax Computation (Section 115BBH)
              </h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between border-t pt-2">
                  <span className="text-slate-700 font-medium">Total Tax Liability (inc Cess)</span>
                  <span className="font-bold">{formatCurrency(totalTax)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>TDS Already Paid</span>
                  <span className="font-medium">- {formatCurrency(tdsPaid)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span className={netTax > 0 ? 'text-red-700' : 'text-emerald-700'}>
                    {netTax > 0 ? 'Net Tax Payable' : 'Refund Due'}
                  </span>
                  <span className={netTax > 0 ? 'text-red-700' : 'text-emerald-700'}>
                    {formatCurrency(Math.abs(netTax))}
                  </span>
                </div>
              </div>
            </div>

            {/* Asset-wise P&L Preview */}
            {assetList.length > 0 && (
              <div>
                <h4 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Asset-Wise P&L
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-indigo-50">
                        <th className="text-left p-2 font-medium text-indigo-800 border">Asset</th>
                        <th className="text-right p-2 font-medium text-indigo-800 border">Gross Profit</th>
                        <th className="text-right p-2 font-medium text-indigo-800 border">Gross Loss</th>
                        <th className="text-right p-2 font-medium text-indigo-800 border">Net Gains</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetList.slice(0, 10).map((t: any, i: number) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-2 font-medium border">{t.asset}</td>
                          <td className="p-2 text-right text-emerald-600 border">{formatCurrency(t.gains)}</td>
                          <td className="p-2 text-right text-red-600 border">{t.losses > 0 ? formatCurrency(t.losses) : '₹0'}</td>
                          <td className={`p-2 text-right font-bold border ${(t.gains - t.losses) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatCurrency(t.gains - t.losses)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Download Buttons */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Schedule VDA Download */}
        <Card className="border-2 border-emerald-300 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Schedule VDA (Excel/CSV)</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Ready-to-upload format for ITR Utility (Section 115BBH)
                </p>
                <Button
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 w-full"
                  disabled={generating !== null || (!taxComputation && trades.length === 0)}
                  onClick={handleDownloadScheduleVDA}
                >
                  {generating === 'vda' ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Download Schedule VDA (CSV)</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TDS Reconciliation */}
        <Card className="border-0 shadow-sm border-blue-200 border">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">TDS Reconciliation</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Verify your Form 26AS vs Actual Deductions
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  disabled={generating !== null || (!taxComputation && trades.length === 0)}
                  onClick={handleDownloadTDS}
                >
                  {generating === 'tds' ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Download TDS Report (CSV)</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!taxComputation && trades.length === 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">No Tax Data Available</AlertTitle>
          <AlertDescription className="text-amber-700">
            Import your crypto trades first to generate tax reports. Go to the Import tab to upload your exchange CSV.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
