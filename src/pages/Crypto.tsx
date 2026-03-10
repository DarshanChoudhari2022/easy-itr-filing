/**
 * Crypto Tax Platform — KoinX-style Design
 * 
 * Tabs: Overview | Data Coverage | Transactions | Tax Drill-Down | Import Data | Reports | Settings
 * All data from APIs. FY selection is global and consistent across all tabs.
 */

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Wallet, TrendingUp, TrendingDown, FileSpreadsheet, Download,
  BarChart3, Upload, AlertTriangle, CheckCircle, ArrowUpRight,
  ArrowDownRight, Calculator, Shield, RefreshCw, Info,
  Loader2, ChevronLeft, ChevronRight, Trash2, FileText, Coins,
  XCircle, Settings as SettingsIcon, Eye, PieChart, Database,
  Clock, CheckCircle2, AlertCircle, File,
} from "lucide-react";
import {
  fetchAvailableYears, fetchOverview, fetchAssetPnL, fetchScheduleVDA,
  fetchTransactions, checkDataQuality, computeTax, uploadOrderHistory,
  uploadInstaHistory, uploadTDS, deleteAllCryptoData,
  type TaxSummary, type AssetPnLResponse, type ScheduleVDAResponse,
  type TransactionsResponse, type DataQualityResponse, type UploadResponse,
} from "@/lib/taxmitra/api-client";
import { formatINR, formatINRFull, TAX_RULES } from "@/lib/taxmitra/constants";
import { getLocalAvailableYears, getLocalOverview, getLocalAssetPnL, getLocalDataQuality } from "@/lib/taxmitra/local-crypto-data";

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

const CryptoTaxPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  // Default FY years - always available even if API fails
  const defaultYears = ['FY2024-25', 'FY2025-26'];
  const [fy, setFy] = useState("FY2024-25");
  const [years, setYears] = useState<string[]>(defaultYears);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [quality, setQuality] = useState<DataQualityResponse | null>(null);
  const [computing, setComputing] = useState(false);
  const [assetPnl, setAssetPnl] = useState<AssetPnLResponse | null>(null);
  const [scheduleVDA, setScheduleVDA] = useState<ScheduleVDAResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionsResponse | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [txType, setTxType] = useState("all");

  useEffect(() => { if (user) loadYears(); }, [user]);

  const loadYears = async () => {
    try {
      const yrs = await fetchAvailableYears();
      if (yrs.length > 0) {
        const merged = [...new Set([...yrs, ...defaultYears])].sort();
        setYears(merged);
        if (!fy) setFy(yrs[0]);
      }
    } catch (e) { console.error('loadYears failed, using defaults:', e); }
    finally { setLoading(false); }
  };

  // Reload ALL tab data when FY changes
  useEffect(() => {
    if (!fy || !user) return;
    // CRITICAL: Clear all pre-computed data states immediately when FY changes
    // to prevent "Data Carryover" bugs where old year's data stays on screen.
    setSummary(null);
    setQuality(null);
    setAssetPnl(null);
    setScheduleVDA(null);
    setTransactions(null);
    setTxPage(1);

    loadAll();
  }, [fy, user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, q] = await Promise.all([fetchOverview(fy), checkDataQuality(fy)]);
      setSummary(ov.not_computed ? null : ov);
      setQuality(q);
    } catch (e) {
      console.error('[loadAll] API error:', e);
      setSummary(null);
      setQuality(null);
    }
    finally { setLoading(false); }
  };

  const loadAssetPnl = async () => { try { setAssetPnl(await fetchAssetPnL(fy)); } catch (e) { console.error(e); } };
  const loadScheduleVDA = async () => { try { setScheduleVDA(await fetchScheduleVDA(fy)); } catch (e) { console.error(e); } };
  const loadTransactions = async (p = 1, t = "all") => { try { setTransactions(await fetchTransactions(fy, t, p, 50)); } catch (e) { console.error(e); } };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "drilldown" && !assetPnl) loadAssetPnl();
    if (tab === "schedule-vda" && !scheduleVDA) loadScheduleVDA();
    if (tab === "transactions" && !transactions) loadTransactions();
  };

  const handleCompute = async () => {
    if (!fy) return;
    setComputing(true);
    try {
      const r = await computeTax(fy);
      if (r.success) {
        setSummary(r.summary);
        toast.success("Tax computed!", { description: `${r.summary.num_fifo_lots} FIFO lots processed.` });
        setAssetPnl(null); setScheduleVDA(null);
        setQuality(await checkDataQuality(fy));
      }
    } catch (e) { toast.error("Failed", { description: (e as Error).message }); }
    finally { setComputing(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete ALL crypto data and re-import fresh?")) return;
    try {
      await deleteAllCryptoData();
      setSummary(null); setAssetPnl(null); setScheduleVDA(null);
      setTransactions(null); setQuality(null); setYears([]); setFy("");
      toast.success("All data deleted.");
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!user) return <AppLayout><div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;

  // Derive FY label
  const fyLabel = fy ? `${fy.replace('FY', 'FY ')}` : 'No FY';
  const fyDateRange = fy ? (() => {
    const startYr = parseInt(fy.replace('FY', '').split('-')[0]);
    return `1 Apr '${String(startYr).slice(-2)} – 31 Mar '${String(startYr + 1).slice(-2)}`;
  })() : '';

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0a0e1a] text-white">
        {/* ── Top Header ── */}
        <header className="border-b border-white/10 bg-[#0d1221]/90 backdrop-blur-lg sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <Coins className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Crypto Tax Calculator</h1>
                  <p className="text-[10px] text-slate-500">Section 115BBH • 30% Tax Rate</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* FY Selector - always visible */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <Select value={fy} onValueChange={(v) => { console.log('FY changed to:', v); setFy(v); }}>
                  <SelectTrigger className="w-[140px] bg-white/5 border-white/10 text-white text-sm h-9 focus:ring-1 focus:ring-indigo-500/50">
                    <SelectValue>
                      {fy ? (fy.replace('FY', 'FY ')) : 'Select FY'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1f35] border-white/10 z-[100] shadow-2xl">
                    {years.length > 0 ? (
                      years.map(y => (
                        <SelectItem key={y} value={y} className="text-white focus:bg-white/10 focus:text-white cursor-pointer py-2">
                          {y.replace('FY', 'FY ')}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No FY available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCompute} disabled={computing || !fy} size="sm"
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-sm h-8">
                {computing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Calculating...</>
                  : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</>}
              </Button>
            </div>
          </div>
        </header>

        {/* ── Sub-header with FY date range ── */}
        {fy && (
          <div className="border-b border-white/5 bg-[#0d1221]/50">
            <div className="max-w-[1400px] mx-auto px-6 py-1.5 flex items-center gap-4 text-xs text-slate-500">
              <span>{fyDateRange}</span>
              {summary && <span>• {summary.num_sell_events || 0} sell trades</span>}
              {quality && <span>• Data quality: {quality.data_quality_score}%</span>}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="flex items-center justify-between mb-5">
              <TabsList className="bg-white/5 border border-white/10 h-9">
                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Overview
                </TabsTrigger>
                <TabsTrigger value="data-coverage" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <Database className="h-3.5 w-3.5 mr-1.5" />Data Coverage
                </TabsTrigger>
                <TabsTrigger value="transactions" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Transactions
                </TabsTrigger>
                <TabsTrigger value="drilldown" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Tax Drill-Down
                </TabsTrigger>
                <TabsTrigger value="import" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Import Data
                </TabsTrigger>
                <TabsTrigger value="reports" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />Reports
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 h-7 px-3">
                  <SettingsIcon className="h-3.5 w-3.5 mr-1.5" />Settings
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview">
              <OverviewTab fy={fy} fyLabel={fyLabel} summary={summary} quality={quality} loading={loading} onCompute={handleCompute} computing={computing} onGoImport={() => setActiveTab("import")} />
            </TabsContent>
            <TabsContent value="data-coverage">
              <DataCoverageTab fy={fy} quality={quality} summary={summary} />
            </TabsContent>
            <TabsContent value="transactions">
              <TransactionsTab fy={fy} data={transactions} page={txPage} typeFilter={txType}
                onPageChange={p => { setTxPage(p); loadTransactions(p, txType); }}
                onTypeChange={t => { setTxType(t); setTxPage(1); loadTransactions(1, t); }}
                onRefresh={() => loadTransactions(txPage, txType)} />
            </TabsContent>
            <TabsContent value="drilldown">
              <DrillDownTab fy={fy} data={assetPnl} onRefresh={loadAssetPnl} />
            </TabsContent>
            <TabsContent value="import">
              <ImportTab onComplete={() => { loadYears(); loadAll(); }} />
            </TabsContent>
            <TabsContent value="reports">
              <ReportsTab fy={fy} summary={summary} scheduleVDA={scheduleVDA} onLoadVDA={loadScheduleVDA} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab onDelete={handleDelete} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
};

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB — KoinX style
// ═══════════════════════════════════════════════════════════════
const OverviewTab: React.FC<{
  fy: string; fyLabel: string; summary: TaxSummary | null; quality: DataQualityResponse | null;
  loading: boolean; computing: boolean; onCompute: () => void; onGoImport: () => void;
}> = ({ fy, fyLabel, summary, quality, loading, computing, onCompute, onGoImport }) => {
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>;

  if (!summary) return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="py-16 text-center">
        <Upload className="h-14 w-14 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Tax Data for {fyLabel}</h3>
        <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">Import your CoinDCX CSV files and click Refresh to compute your crypto tax.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onGoImport} className="bg-indigo-600 hover:bg-indigo-500 text-sm"><Upload className="h-4 w-4 mr-2" />Import</Button>
          <Button onClick={onCompute} disabled={computing} className="bg-violet-600 hover:bg-violet-500 text-white text-sm">
            {computing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</> : <><Calculator className="h-4 w-4 mr-2" />Calculate</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const s = summary;
  const ay = s.assessment_year || '';

  return (
    <div className="space-y-5">
      {/* Crypto Tax Reports banner */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center"><FileText className="h-5 w-5 text-white" /></div>
          <div>
            <h2 className="text-white font-bold text-lg">Crypto Tax Reports — {ay}</h2>
            <p className="text-white/70 text-sm">Comprehensive report with Schedule VDA, Asset P&L</p>
          </div>
        </div>
        <Badge className="bg-white/20 text-white border-0">{s.num_sell_events} trades</Badge>
      </div>

      {/* Data quality warnings */}
      {quality && quality.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <h3 className="text-amber-400 font-semibold text-sm flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" />Data Gaps Detected
          </h3>
          <p className="text-slate-300 text-xs leading-relaxed">
            {quality.warnings.map(w => w.message).join('. ')}
            {' — '}Resolve issues in the <strong>Data Coverage</strong> tab first.
          </p>
        </div>
      )}

      {/* Capital Gains Summary section (KoinX style) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <h3 className="text-white font-semibold">Capital Gains Summary — {fy.replace('FY', '')}</h3>
          <span className="text-slate-500 text-xs ml-2">This is exactly what goes into your ITR under Schedule VDA</span>
        </div>

        {/* 5 metric cards in a row — matching screenshots */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Transfers" value={String(s.num_sell_events)} sub={`${s.num_fifo_lots} FIFO lots`} />
          <StatCard label="Sale Consideration" value={formatINR(s.sale_consideration)} sub="Total sell proceeds" color="blue" />
          <StatCard label="Cost of Acquisition" value={formatINR(s.cost_of_acquisition)} sub="FIFO cost basis" color="teal" />
          <StatCard label="Taxable Gains" value={formatINR(s.taxable_capital_gains)} sub="§115BBH gains" color="green" />
          <StatCard label="Losses (Ignored)" value={formatINR(s.gross_losses)} sub="Cannot offset" color="red" />
        </div>
      </div>

      {/* Row 2: 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Capital Gain Trades" value={String(s.num_sell_events)} sub={`${s.num_fifo_lots || 0} FIFO lots`} icon={<TrendingUp className="h-5 w-5 text-indigo-400" />} />
        <StatCard label="Other Income" value={formatINR(s.total_other_income)} sub="Rewards/Staking" icon={<Coins className="h-5 w-5 text-amber-400" />} />
        <StatCard label="TDS Credit" value={formatINR(s.tds_credit)} sub="Section 194S deducted" icon={<Shield className="h-5 w-5 text-cyan-400" />} />
      </div>

      {/* Non-Deductible Losses */}
      {s.gross_losses > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-orange-400 font-semibold text-sm">Non-Deductible Losses</p>
            <p className="text-orange-300 text-2xl font-bold mt-1">{formatINR(s.gross_losses)}</p>
            <p className="text-orange-400/60 text-xs mt-1">Cannot be set off against gains (§115BBH)</p>
          </div>
          <AlertTriangle className="h-8 w-8 text-orange-400/40" />
        </div>
      )}

      {/* Tax Liability Banner — purple gradient like screenshot */}
      <div className="bg-gradient-to-r from-purple-600/90 to-violet-600/90 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm">Estimated Tax Liability ({fy.replace('FY', '')})</p>
            <p className="text-white text-3xl font-bold mt-1">{formatINR(s.total_tax_liability)}</p>
            <p className="text-white/60 text-xs mt-2">
              Capital Gains: {formatINR(s.taxable_capital_gains)} + Other Income: {formatINR(s.total_other_income)} @ 30% + 4% cess
            </p>
            <p className="text-white/40 text-xs mt-1">
              Gross Tax: {formatINRFull(s.gross_tax)} + Cess: {formatINRFull(s.cess)} = {formatINRFull(s.total_tax_liability)}
            </p>
          </div>
          <div className="text-right space-y-2">
            <div>
              <span className="text-white/60 text-xs">TDS Credit: </span>
              <Badge className="bg-white/20 text-white border-0">{formatINR(s.tds_credit)}</Badge>
            </div>
            <div>
              <span className="text-white/60 text-xs">Net Payable: </span>
              <span className="text-white text-xl font-bold">{formatINR(s.net_tax_payable)}</span>
            </div>
            {s.refund_eligible > 0 && (
              <div><span className="text-emerald-300 text-xs">Refund Eligible: {formatINR(s.refund_eligible)}</span></div>
            )}
            <p className="text-white/40 text-xs">Gross Tax: {formatINRFull(s.total_tax_liability)}</p>
          </div>
        </div>
      </div>

      {/* Data Coverage Score */}
      {quality && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-white font-semibold text-sm">Data Coverage Score</span>
          </div>
          <Badge className={`text-sm px-3 py-1 ${quality.data_quality_score >= 80 ? 'bg-emerald-500/20 text-emerald-400' : quality.data_quality_score >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
            {quality.data_quality_score}%
          </Badge>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// DATA COVERAGE TAB
// ═══════════════════════════════════════════════════════════════
const DataCoverageTab: React.FC<{
  fy: string; quality: DataQualityResponse | null; summary: TaxSummary | null;
}> = ({ fy, quality, summary }) => {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Data Coverage — {fy}</h2>

      {/* Score */}
      {quality && (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold">Overall Score</span>
              <span className={`text-2xl font-bold ${quality.data_quality_score >= 80 ? 'text-emerald-400' : quality.data_quality_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {quality.data_quality_score}%
              </span>
            </div>
            <Progress value={quality.data_quality_score} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {quality?.warnings.map((w, i) => (
        <Card key={i} className={`border ${w.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${w.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
              <div>
                <p className="text-white text-sm font-medium">{w.message}</p>
                <p className="text-slate-400 text-xs mt-1">Fix: {w.fix}</p>
                {w.affected_assets && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {w.affected_assets.map(a => <Badge key={a} variant="outline" className="text-xs border-white/20 text-slate-300">{a}</Badge>)}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Info */}
      {quality?.info.map((info, i) => (
        <Card key={i} className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="h-4 w-4 text-blue-400 shrink-0" />
            <p className="text-blue-300 text-sm">{info.message}</p>
          </CardContent>
        </Card>
      ))}

      {quality && quality.warnings.length === 0 && quality.info.length === 0 && (
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-emerald-300 font-semibold">All Clear!</p>
            <p className="text-slate-400 text-sm mt-1">Your data coverage looks good for {fy}.</p>
          </CardContent>
        </Card>
      )}

      {/* Account Settings */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader><CardTitle className="text-sm text-white">Account Settings</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Country</span><span className="text-white">India</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Base Currency</span><span className="text-white">INR</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Calculation Method</span><span className="text-white">First-In First-Out (FIFO)</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Tax Section</span><span className="text-white">115BBH</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Tax Rate</span><span className="text-white">30% + 4% Cess = 31.2%</span></div>
        </CardContent>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TRANSACTIONS TAB
// ═══════════════════════════════════════════════════════════════
const TransactionsTab: React.FC<{
  fy: string; data: TransactionsResponse | null; page: number; typeFilter: string;
  onPageChange: (p: number) => void; onTypeChange: (t: string) => void; onRefresh: () => void;
}> = ({ fy, data, page, typeFilter, onPageChange, onTypeChange, onRefresh }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-white">Transactions — {fy}</h2>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[110px] bg-white/5 border-white/10 text-white text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#1a1f35] border-white/10">
              {['all', 'buy', 'sell', 'staking', 'reward'].map(t => <SelectItem key={t} value={t} className="text-white text-xs">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={onRefresh} size="sm" className="text-slate-400 border-white/10 h-8 text-xs"><RefreshCw className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-slate-500">{data.total} records</span>
        </div>
      </div>
      {data.transactions.length === 0 ? (
        <Card className="bg-white/5 border-white/10"><CardContent className="py-12 text-center"><FileSpreadsheet className="h-10 w-10 text-slate-600 mx-auto mb-2" /><p className="text-slate-400 text-sm">No transactions for {fy}.</p></CardContent></Card>
      ) : (
        <>
          <Card className="bg-white/5 border-white/10 overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-500 text-xs">Date</TableHead>
                <TableHead className="text-slate-500 text-xs">Type</TableHead>
                <TableHead className="text-slate-500 text-xs">Asset</TableHead>
                <TableHead className="text-slate-500 text-xs text-right">Qty</TableHead>
                <TableHead className="text-slate-500 text-xs text-right">Price/Unit</TableHead>
                <TableHead className="text-slate-500 text-xs text-right">Value (INR)</TableHead>
                <TableHead className="text-slate-500 text-xs text-right">Fee</TableHead>
                <TableHead className="text-slate-500 text-xs text-right">TDS</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.transactions.map(tx => (
                  <TableRow key={tx.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="text-slate-300 text-xs whitespace-nowrap">{new Date(tx.trade_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell><TypeBadge type={tx.type} /></TableCell>
                    <TableCell className="text-white font-medium text-xs">{tx.asset}</TableCell>
                    <TableCell className="text-right text-slate-300 font-mono text-[11px]">{Number(tx.quantity).toFixed(6)}</TableCell>
                    <TableCell className="text-right text-slate-300 text-xs">{tx.price_per_unit > 0 ? formatINR(tx.price_per_unit) : '—'}</TableCell>
                    <TableCell className="text-right text-white font-semibold text-xs">{formatINR(tx.value_inr)}</TableCell>
                    <TableCell className="text-right text-slate-500 text-xs">{tx.fee_inr > 0 ? formatINR(tx.fee_inr) : '—'}</TableCell>
                    <TableCell className="text-right text-cyan-400 text-xs">{tx.tds_inr > 0 ? formatINR(tx.tds_inr) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {data.total_pages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="border-white/10 text-slate-400 h-7"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="text-xs text-slate-500">Page {page}/{data.total_pages}</span>
              <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= data.total_pages} className="border-white/10 text-slate-400 h-7"><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// TAX DRILL-DOWN TAB
// ═══════════════════════════════════════════════════════════════
const DrillDownTab: React.FC<{ fy: string; data: AssetPnLResponse | null; onRefresh: () => void; }> = ({ fy, data, onRefresh }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
  if (!data.assets?.length) return <Card className="bg-white/5 border-white/10"><CardContent className="py-12 text-center"><p className="text-slate-400 text-sm">No data for {fy}. Run Calculate Tax first.</p></CardContent></Card>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Asset-wise P&L — {fy}</h2>
        <Button variant="outline" onClick={onRefresh} size="sm" className="text-slate-400 border-white/10 h-8 text-xs"><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
      </div>
      <Card className="bg-white/5 border-white/10 overflow-hidden">
        <Table>
          <TableHeader><TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-slate-500 text-xs">Asset</TableHead>
            <TableHead className="text-slate-500 text-xs text-right">Sale</TableHead>
            <TableHead className="text-slate-500 text-xs text-right">Cost</TableHead>
            <TableHead className="text-slate-500 text-xs text-right">Profit</TableHead>
            <TableHead className="text-slate-500 text-xs text-right">Loss</TableHead>
            <TableHead className="text-slate-500 text-xs text-right">Taxable</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.assets.map(a => (
              <TableRow key={a.asset} className="border-white/5 hover:bg-white/5">
                <TableCell><Badge variant="outline" className="border-indigo-500/30 text-indigo-300 text-xs">{a.asset}</Badge></TableCell>
                <TableCell className="text-right text-blue-300 text-xs">{formatINR(a.sale)}</TableCell>
                <TableCell className="text-right text-slate-300 text-xs">{formatINR(a.cost)}</TableCell>
                <TableCell className="text-right text-green-400 text-xs">{a.profit > 0 ? formatINR(a.profit) : '—'}</TableCell>
                <TableCell className="text-right text-red-400 text-xs">{a.loss > 0 ? formatINR(a.loss) : '—'}</TableCell>
                <TableCell className="text-right text-white font-semibold text-xs">{formatINR(a.net_taxable)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 border-indigo-500/30 bg-indigo-500/5">
              <TableCell className="font-bold text-white text-xs">TOTAL</TableCell>
              <TableCell className="text-right font-semibold text-blue-300 text-xs">{formatINR(data.totals.sale)}</TableCell>
              <TableCell className="text-right font-semibold text-slate-300 text-xs">{formatINR(data.totals.cost)}</TableCell>
              <TableCell className="text-right font-semibold text-green-400 text-xs">{formatINR(data.totals.profit)}</TableCell>
              <TableCell className="text-right font-semibold text-red-400 text-xs">{formatINR(data.totals.loss)}</TableCell>
              <TableCell className="text-right font-bold text-white text-xs">{formatINR(data.totals.net_taxable)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// IMPORT TAB
// ═══════════════════════════════════════════════════════════════
const ImportTab: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [status, setStatus] = useState<Record<string, { state: string; result: UploadResponse | null }>>({
    order: { state: 'idle', result: null }, insta: { state: 'idle', result: null }, tds: { state: 'idle', result: null },
  });
  const upload = async (key: string, fn: (f: File) => Promise<UploadResponse>, file: File) => {
    setStatus(s => ({ ...s, [key]: { state: 'uploading', result: null } }));
    try {
      const r = await fn(file);
      setStatus(s => ({ ...s, [key]: { state: r.success ? 'done' : 'error', result: r } }));
      if (r.success) { toast.success(r.message); onComplete(); }
      else toast.error(r.message || r.errors?.[0]?.issue);
    } catch (e) {
      setStatus(s => ({ ...s, [key]: { state: 'error', result: { success: false, errors: [{ row: 0, issue: (e as Error).message }], message: (e as Error).message } as UploadResponse } }));
    }
  };
  return (
    <div className="space-y-5">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-1">Import CoinDCX Data</h2>
        <p className="text-slate-400 text-sm">Download from CoinDCX → Profile → Reports</p>
      </div>
      <ImportCard step={1} title="Order History CSV" desc="All buy & sell trades with correct prices"
        instructions={['CoinDCX → Profile → Reports → Order History', 'Set date range to "All Time"', 'Export CSV']}
        status={status.order} onUpload={f => upload('order', uploadOrderHistory, f)} />
      <ImportCard step={2} title="Insta History CSV" desc="Instant trades, staking rewards, cashback"
        instructions={['CoinDCX → Reports → Insta History', 'Export All Time history']}
        status={status.insta} onUpload={f => upload('insta', uploadInstaHistory, f)} />
      <ImportCard step={3} title="TDS Certificate CSV" desc="1% TDS deducted (§194S)"
        instructions={['CoinDCX → Reports → TDS Certificate', 'Select FY', 'Export CSV']}
        status={status.tds} onUpload={f => upload('tds', uploadTDS, f)} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// REPORTS TAB
// ═══════════════════════════════════════════════════════════════
const ReportsTab: React.FC<{
  fy: string; summary: TaxSummary | null; scheduleVDA: ScheduleVDAResponse | null; onLoadVDA: () => void;
}> = ({ fy, summary, scheduleVDA, onLoadVDA }) => {
  useEffect(() => { if (!scheduleVDA) onLoadVDA(); }, []);

  const downloadCSV = (name: string, headers: string[], rows: any[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}_${fy}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${name} downloaded`);
  };

  const downloadScheduleVDA = () => {
    if (!scheduleVDA?.rows.length) return;
    downloadCSV('Schedule_VDA',
      ['Sl No', 'Asset', 'Description', 'Date of Acquisition', 'Date of Transfer', 'Cost of Acquisition', 'Sale Consideration', 'Income from Transfer', 'Taxable Income'],
      scheduleVDA.rows.map(r => [r.sl_no, r.asset, r.description, r.date_of_acquisition, r.date_of_transfer, r.cost_of_acquisition, r.sale_consideration, r.income_from_transfer, r.taxable_income])
    );
  };

  const downloadTaxSummary = () => {
    if (!summary) return;
    downloadCSV('Tax_Summary',
      ['Metric', 'Value'],
      [
        ['Financial Year', summary.financial_year], ['Assessment Year', summary.assessment_year],
        ['Sell Events', summary.num_sell_events], ['Sale Consideration', summary.sale_consideration],
        ['Cost of Acquisition', summary.cost_of_acquisition], ['Taxable Capital Gains', summary.taxable_capital_gains],
        ['Gross Losses', summary.gross_losses], ['Other Income', summary.total_other_income],
        ['TDS Credit', summary.tds_credit], ['Total Taxable', summary.total_taxable],
        ['Gross Tax (30%)', summary.gross_tax], ['Cess (4%)', summary.cess],
        ['Total Tax Liability', summary.total_tax_liability], ['Net Tax Payable', summary.net_tax_payable],
        ['Refund Eligible', summary.refund_eligible],
      ]
    );
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Reports — {fy}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition cursor-pointer" onClick={downloadScheduleVDA}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center"><FileText className="h-6 w-6 text-violet-400" /></div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">Schedule VDA (CSV)</h3>
              <p className="text-slate-400 text-xs mt-0.5">ITR-ready FIFO lot data</p>
            </div>
            <Download className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition cursor-pointer" onClick={downloadTaxSummary}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><BarChart3 className="h-6 w-6 text-emerald-400" /></div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">Tax Summary (CSV)</h3>
              <p className="text-slate-400 text-xs mt-0.5">Complete tax computation breakdown</p>
            </div>
            <Download className="h-5 w-5 text-slate-500" />
          </CardContent>
        </Card>
      </div>

      {/* Schedule VDA preview */}
      {scheduleVDA && scheduleVDA.rows.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white">Schedule VDA Preview ({scheduleVDA.total_rows} entries)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-white/10">
                <TableHead className="text-slate-500 text-[11px]">#</TableHead>
                <TableHead className="text-slate-500 text-[11px]">Asset</TableHead>
                <TableHead className="text-slate-500 text-[11px]">Buy</TableHead>
                <TableHead className="text-slate-500 text-[11px]">Sell</TableHead>
                <TableHead className="text-slate-500 text-[11px] text-right">Cost</TableHead>
                <TableHead className="text-slate-500 text-[11px] text-right">Sale</TableHead>
                <TableHead className="text-slate-500 text-[11px] text-right">Taxable</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {scheduleVDA.rows.slice(0, 10).map(r => (
                  <TableRow key={r.sl_no} className="border-white/5">
                    <TableCell className="text-slate-500 text-[11px]">{r.sl_no}</TableCell>
                    <TableCell className="text-white text-[11px]">{r.asset}</TableCell>
                    <TableCell className="text-slate-400 text-[11px]">{r.date_of_acquisition}</TableCell>
                    <TableCell className="text-slate-300 text-[11px]">{r.date_of_transfer}</TableCell>
                    <TableCell className="text-right text-slate-300 text-[11px]">{formatINR(r.cost_of_acquisition)}</TableCell>
                    <TableCell className="text-right text-blue-300 text-[11px]">{formatINR(r.sale_consideration)}</TableCell>
                    <TableCell className="text-right text-white font-semibold text-[11px]">{formatINR(r.taxable_income)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {scheduleVDA.rows.length > 10 && <p className="text-slate-500 text-xs text-center py-2">Showing 10 of {scheduleVDA.total_rows} — download CSV for full data</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
const SettingsTab: React.FC<{ onDelete: () => void }> = ({ onDelete }) => (
  <div className="space-y-5 max-w-2xl">
    <h2 className="text-lg font-semibold text-white">Settings</h2>
    <Card className="bg-white/5 border-white/10">
      <CardHeader><CardTitle className="text-sm text-white">Account Settings</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b border-white/5"><span className="text-slate-400">Country</span><span className="text-white">India</span></div>
        <div className="flex justify-between py-2 border-b border-white/5"><span className="text-slate-400">Base Currency</span><span className="text-white">INR</span></div>
        <div className="flex justify-between py-2 border-b border-white/5"><span className="text-slate-400">Calculation Method</span><span className="text-white">First-In First-Out (FIFO)</span></div>
        <div className="flex justify-between py-2 border-b border-white/5"><span className="text-slate-400">Tax Section</span><span className="text-white">Section 115BBH</span></div>
        <div className="flex justify-between py-2 border-b border-white/5"><span className="text-slate-400">Tax Rate</span><span className="text-white">30% + 4% Cess</span></div>
        <div className="flex justify-between py-2"><span className="text-slate-400">TDS Section</span><span className="text-white">194S (1%)</span></div>
      </CardContent>
    </Card>
    <Card className="bg-white/5 border-white/10">
      <CardHeader><CardTitle className="text-sm text-white">Integrations</CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-4 py-3">
            <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center"><Coins className="h-4 w-4 text-blue-400" /></div>
            <span className="text-white text-sm">CoinDCX</span>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-3">Data imported via CSV files from CoinDCX Reports.</p>
      </CardContent>
    </Card>
    <Card className="bg-red-500/5 border-red-500/20">
      <CardHeader><CardTitle className="text-sm text-red-400">Danger Zone</CardTitle></CardHeader>
      <CardContent>
        <p className="text-slate-400 text-sm mb-4">Delete all crypto data and start fresh. This cannot be undone.</p>
        <Button variant="outline" onClick={onDelete} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
          <Trash2 className="h-4 w-4 mr-2" />Delete All Data
        </Button>
      </CardContent>
    </Card>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════
const StatCard: React.FC<{ label: string; value: string; sub: string; color?: string; icon?: React.ReactNode }> = ({ label, value, sub, color, icon }) => (
  <Card className="bg-white/5 border-white/10">
    <CardContent className="p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-slate-400 text-xs">{label}</span>
        {icon}
      </div>
      <div className={`text-xl font-bold ${color === 'green' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : color === 'blue' ? 'text-blue-400' : color === 'teal' ? 'text-teal-400' : 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </CardContent>
  </Card>
);

const TypeBadge: React.FC<{ type: string }> = ({ type }) => (
  <Badge className={`text-[10px] ${type === 'buy' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
    type === 'sell' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
      'bg-purple-500/20 text-purple-400 border-purple-500/30'
    }`}>{type.toUpperCase()}</Badge>
);

const ImportCard: React.FC<{
  step: number; title: string; desc: string; instructions: string[];
  status: { state: string; result: UploadResponse | null }; onUpload: (f: File) => void;
}> = ({ step, title, desc, instructions, status, onUpload }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Card className={`bg-white/5 ${status.state === 'done' ? 'border-emerald-500/30' : status.state === 'error' ? 'border-red-500/30' : 'border-white/10'}`}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${status.state === 'done' ? 'bg-emerald-500/20 text-emerald-400' : status.state === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
          }`}>{status.state === 'done' ? <CheckCircle className="h-4 w-4" /> : status.state === 'error' ? <XCircle className="h-4 w-4" /> : step}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <p className="text-slate-400 text-xs mb-2">{desc}</p>
          <ol className="text-[11px] text-slate-500 space-y-0.5 mb-3">
            {instructions.map((s, i) => <li key={i}>{i + 1}. {s}</li>)}
          </ol>
          <input ref={ref} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} className="hidden" />
          <Button onClick={() => ref.current?.click()} disabled={status.state === 'uploading'} size="sm"
            className={status.state === 'done' ? 'bg-transparent border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'bg-indigo-600 hover:bg-indigo-500'}>
            {status.state === 'uploading' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading...</>
              : status.state === 'done' ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Re-upload</>
                : <><Upload className="h-3.5 w-3.5 mr-1" />Upload CSV</>}
          </Button>
          {status.result && (
            <div className={`mt-2 p-2 rounded text-xs ${status.result.success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {status.result.message}
              {status.result.errors?.length > 0 && (
                <details className="mt-1"><summary className="cursor-pointer opacity-70">{status.result.errors.length} issue(s)</summary>
                  <ul className="mt-1 opacity-60">{status.result.errors.slice(0, 3).map((e, i) => <li key={i}>Row {e.row}: {e.issue}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CryptoTaxPage;
