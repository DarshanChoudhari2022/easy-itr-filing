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
import { syncCryptoToFiling } from "@/lib/crypto-itr-bridge";
import { useNavigate } from "react-router-dom";

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
      console.error('[loadAll] API error, trying local data:', e);
      // Fallback to local pre-computed data
      const localOv = getLocalOverview(fy);
      setSummary(localOv);
      setQuality(getLocalDataQuality(fy));
    }
    finally { setLoading(false); }
  };

  const loadAssetPnl = async () => {
    try {
      const data = await fetchAssetPnL(fy);
      if (data && data.assets && data.assets.length > 0) { setAssetPnl(data); return; }
    } catch (e) { console.error('[loadAssetPnl] API error:', e); }
    // Fallback to local data
    const local = getLocalAssetPnL(fy);
    setAssetPnl(local || { success: true, financial_year: fy, assets: [], totals: { sale: 0, cost: 0, profit: 0, loss: 0, net_taxable: 0 } });
  };
  const loadScheduleVDA = async () => { try { setScheduleVDA(await fetchScheduleVDA(fy)); } catch (e) { console.error(e); } };
  const loadTransactions = async (p = 1, t = "all") => {
    try {
      const data = await fetchTransactions(fy, t, p, 50);
      setTransactions(data);
    } catch (e) {
      console.error('[loadTransactions] API error:', e);
      // Set empty response so UI doesn't show infinite spinner
      setTransactions({ success: true, financial_year: fy, transactions: [], total: 0, page: p, limit: 50, total_pages: 0 });
    }
  };

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
              <OverviewTab fy={fy} fyLabel={fyLabel} summary={summary} quality={quality} loading={loading} onCompute={handleCompute} computing={computing} onGoImport={() => setActiveTab("import")} userId={user?.id || ''} />
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
              <ReportsTab fy={fy} summary={summary} assetPnl={assetPnl} scheduleVDA={scheduleVDA} onLoadVDA={loadScheduleVDA} />
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
// OVERVIEW TAB — Premium Dashboard + Guided Setup Flow
// ═══════════════════════════════════════════════════════════════
const OverviewTab: React.FC<{
  fy: string; fyLabel: string; summary: TaxSummary | null; quality: DataQualityResponse | null;
  loading: boolean; computing: boolean; onCompute: () => void; onGoImport: () => void; userId: string;
}> = ({ fy, fyLabel, summary, quality, loading, computing, onCompute, onGoImport, userId }) => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = React.useState(false);
  const [synced, setSynced] = React.useState(false);
  // Guided flow upload states
  const [uploadStatus, setUploadStatus] = React.useState<Record<string, { state: string; result: UploadResponse | null }>>({
    order: { state: 'idle', result: null }, insta: { state: 'idle', result: null }, tds: { state: 'idle', result: null },
  });
  const orderRef = React.useRef<HTMLInputElement>(null);
  const instaRef = React.useRef<HTMLInputElement>(null);
  const tdsRef = React.useRef<HTMLInputElement>(null);
  // Try local data fallback when API returns nothing
  const displaySummary = summary || getLocalOverview(fy);
  const displayQuality = quality || getLocalDataQuality(fy);

  const guidedUpload = async (key: string, fn: (f: File) => Promise<UploadResponse>, file: File) => {
    setUploadStatus(s => ({ ...s, [key]: { state: 'uploading', result: null } }));
    try {
      const r = await fn(file);
      setUploadStatus(s => ({ ...s, [key]: { state: r.success ? 'done' : 'error', result: r } }));
      if (r.success) toast.success(r.message);
      else toast.error(r.message || r.errors?.[0]?.issue);
    } catch (e) {
      setUploadStatus(s => ({ ...s, [key]: { state: 'error', result: { success: false, errors: [{ row: 0, issue: (e as Error).message }], message: (e as Error).message } as UploadResponse } }));
    }
  };

  const handleSendToITR = async () => {
    setSyncing(true);
    try {
      const result = await syncCryptoToFiling(userId, fy);
      if (result.success) {
        setSynced(true);
        toast.success('Crypto data sent to ITR!', { description: result.message });
        setTimeout(() => navigate('/guided'), 1500);
      } else { toast.error('Sync failed', { description: result.message }); }
    } catch (e) { toast.error('Failed to sync', { description: (e as Error).message }); }
    finally { setSyncing(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>;

  // ─── NO COMPUTED DATA: Show Guided Setup Flow ───
  if (!displaySummary) return (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border-indigo-500/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center"><Coins className="h-5 w-5 text-indigo-400" /></div>
            <div>
              <h2 className="text-white font-bold text-lg">Setup Crypto Tax — {fyLabel}</h2>
              <p className="text-slate-400 text-sm">Complete these steps to calculate your crypto tax</p>
            </div>
          </div>
          <div className="space-y-3">
            {/* Step 1: Order History */}
            <div className={`rounded-lg p-4 border ${uploadStatus.order.state === 'done' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${uploadStatus.order.state === 'done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    {uploadStatus.order.state === 'done' ? <CheckCircle className="h-4 w-4" /> : '1'}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold">Order History CSV (All Time)</h4>
                    <p className="text-slate-500 text-xs">CoinDCX → Profile → Reports → Order History → All Time</p>
                  </div>
                </div>
                <input ref={orderRef} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) guidedUpload('order', uploadOrderHistory, f); e.target.value = ''; }} className="hidden" />
                <Button onClick={() => orderRef.current?.click()} disabled={uploadStatus.order.state === 'uploading'} size="sm"
                  className={uploadStatus.order.state === 'done' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-indigo-600 hover:bg-indigo-500'}>
                  {uploadStatus.order.state === 'uploading' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading...</> : uploadStatus.order.state === 'done' ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</> : <><Upload className="h-3.5 w-3.5 mr-1" />Upload</>}
                </Button>
              </div>
            </div>
            {/* Step 2: Insta History */}
            <div className={`rounded-lg p-4 border ${uploadStatus.insta.state === 'done' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${uploadStatus.insta.state === 'done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    {uploadStatus.insta.state === 'done' ? <CheckCircle className="h-4 w-4" /> : '2'}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold">Insta History CSV (All Time)</h4>
                    <p className="text-slate-500 text-xs">CoinDCX → Reports → Insta/Instant History → All Time</p>
                  </div>
                </div>
                <input ref={instaRef} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) guidedUpload('insta', uploadInstaHistory, f); e.target.value = ''; }} className="hidden" />
                <Button onClick={() => instaRef.current?.click()} disabled={uploadStatus.insta.state === 'uploading'} size="sm"
                  className={uploadStatus.insta.state === 'done' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-indigo-600 hover:bg-indigo-500'}>
                  {uploadStatus.insta.state === 'uploading' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading...</> : uploadStatus.insta.state === 'done' ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</> : <><Upload className="h-3.5 w-3.5 mr-1" />Upload</>}
                </Button>
              </div>
            </div>
            {/* Step 3: TDS for selected FY */}
            <div className={`rounded-lg p-4 border ${uploadStatus.tds.state === 'done' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${uploadStatus.tds.state === 'done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {uploadStatus.tds.state === 'done' ? <CheckCircle className="h-4 w-4" /> : '3'}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold">TDS Certificate for {fyLabel}</h4>
                    <p className="text-amber-400/80 text-xs">CoinDCX → Reports → TDS Certificate → Select {fyLabel} → Export</p>
                  </div>
                </div>
                <input ref={tdsRef} type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) guidedUpload('tds', uploadTDS, f); e.target.value = ''; }} className="hidden" />
                <Button onClick={() => tdsRef.current?.click()} disabled={uploadStatus.tds.state === 'uploading'} size="sm"
                  className={uploadStatus.tds.state === 'done' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-amber-600 hover:bg-amber-500'}>
                  {uploadStatus.tds.state === 'uploading' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading...</> : uploadStatus.tds.state === 'done' ? <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</> : <><Upload className="h-3.5 w-3.5 mr-1" />Upload TDS</>}
                </Button>
              </div>
            </div>
          </div>
          {/* Calculate button at bottom */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <Button onClick={onCompute} disabled={computing} size="lg" className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white h-12 text-base font-semibold">
              {computing ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Computing Tax...</> : <><Calculator className="h-5 w-5 mr-2" />Calculate Crypto Tax for {fyLabel}</>}
            </Button>
            <p className="text-slate-500 text-xs text-center mt-2">FIFO method • Section 115BBH • 30% + 4% Cess</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── HAS DATA: Premium Dashboard ───
  const s = displaySummary;
  const ay = s.assessment_year || '';

  return (
    <div className="space-y-5">
      {/* Row 1: Three equal cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TDS Summary */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Shield className="h-4 w-4 text-cyan-400" />TDS Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center"><Coins className="h-3 w-3 text-blue-400" /></div>
                <span className="text-slate-400 text-xs">CoinDCX</span>
              </div>
              <div className="text-right">
                <span className="text-cyan-400 font-semibold text-sm">{formatINRFull(s.tds_credit)}</span>
              </div>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-slate-400 text-xs font-semibold">Total TDS</span>
              <span className="text-white font-bold text-sm">{formatINRFull(s.tds_credit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 text-xs">Total Sale Value</span>
              <span className="text-slate-300 text-xs">{formatINRFull(s.sale_consideration)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Crypto Tax Summary */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />Crypto Tax Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Progress value={100} className="h-1.5 mb-3" />
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-slate-400 text-xs">Capital Gains</span></div>
              <span className="text-white font-semibold text-sm">{formatINRFull(s.taxable_capital_gains)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-gray-500" /><span className="text-slate-400 text-xs">Other Gains</span></div>
              <span className="text-white font-semibold text-sm">{formatINRFull(s.total_other_income)}</span>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-slate-300 text-xs font-semibold">Total Taxable Gains</span>
              <span className="text-emerald-400 font-bold text-sm">{formatINRFull(s.total_taxable)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tax Liability */}
        <Card className="bg-white/5 border-white/10 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-2 relative z-10"><CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Calculator className="h-4 w-4 text-indigo-400" />Tax Liability</CardTitle></CardHeader>
          <CardContent className="space-y-2 relative z-10">
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Gross Tax (30%)</span><span className="text-white text-sm">{formatINRFull(s.gross_tax)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Cess (4%)</span><span className="text-white text-sm">{formatINRFull(s.cess)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Total Tax</span><span className="text-white font-semibold text-sm">{formatINRFull(s.total_tax_liability)}</span></div>
            <div className="flex justify-between"><span className="text-cyan-400 text-xs">TDS Credit</span><span className="text-cyan-400 text-sm">-{formatINRFull(s.tds_credit)}</span></div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-white text-xs font-bold">Net Payable</span>
              <span className="text-white font-bold text-lg">{formatINRFull(s.net_tax_payable)}</span>
            </div>
            {s.refund_eligible > 0 && <div className="text-emerald-400 text-xs text-right">Refund: {formatINRFull(s.refund_eligible)}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Account Settings + Integrations + Trade Types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Account Settings</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Country</span><span className="text-white text-xs">India</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Base Currency</span><span className="text-white text-xs">INR</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Calculation Method</span><span className="text-white text-xs">First-In First-Out (FIFO)</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Tax Rate</span><span className="text-white text-xs">30% + 4% Cess</span></div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Integrations</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex flex-col items-center gap-1.5 bg-white/5 rounded-lg px-5 py-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><Coins className="h-5 w-5 text-blue-400" /></div>
                <span className="text-white text-xs font-medium">CoinDCX</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Sell Events</span><span className="text-white text-xs font-semibold">{s.num_sell_events}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">FIFO Lots</span><span className="text-white text-xs font-semibold">{s.num_fifo_lots}</span></div>
            <div className="flex justify-between"><span className="text-slate-400 text-xs">Gross Losses</span><span className="text-red-400 text-xs font-semibold">{formatINR(s.gross_losses)}</span></div>
            {displayQuality && <div className="flex justify-between"><span className="text-slate-400 text-xs">Data Score</span><span className={`text-xs font-semibold ${displayQuality.data_quality_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{displayQuality.data_quality_score}%</span></div>}
          </CardContent>
        </Card>
      </div>

      {/* Send to ITR */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border border-indigo-500/30 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center"><ArrowUpRight className="h-5 w-5 text-indigo-400" /></div>
            <div>
              <h3 className="text-white font-semibold">Ready to File Your ITR?</h3>
              <p className="text-slate-400 text-xs mt-0.5">Send your crypto data (Schedule VDA, gains, TDS) to the ITR filing wizard.</p>
            </div>
          </div>
          <Button onClick={handleSendToITR} disabled={syncing || synced}
            className={synced ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white'}>
            {syncing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Syncing...</> : synced ? <><CheckCircle className="h-4 w-4 mr-2" />Sent to ITR!</> : <><ArrowUpRight className="h-4 w-4 mr-2" />Send to ITR →</>}
          </Button>
        </div>
      </div>
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
  const [loading, setLoading] = useState(!data);
  useEffect(() => { if (data) setLoading(false); }, [data]);
  // Timeout: if data hasn't loaded in 8s, show empty state
  useEffect(() => {
    if (!data) {
      const t = setTimeout(() => setLoading(false), 8000);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;

  const txList = data?.transactions || [];
  const total = data?.total || 0;
  const totalPages = data?.total_pages || 0;

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
          <span className="text-xs text-slate-500">{total} records</span>
        </div>
      </div>
      {txList.length === 0 ? (
        <Card className="bg-white/5 border-white/10"><CardContent className="py-12 text-center"><FileSpreadsheet className="h-10 w-10 text-slate-600 mx-auto mb-2" /><p className="text-slate-400 text-sm">No transactions for {fy}.</p><p className="text-slate-500 text-xs mt-1">Import data and click Refresh to compute.</p></CardContent></Card>
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
                {txList.map(tx => (
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="border-white/10 text-slate-400 h-7"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="text-xs text-slate-500">Page {page}/{totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="border-white/10 text-slate-400 h-7"><ChevronRight className="h-3.5 w-3.5" /></Button>
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
  const [loading, setLoading] = useState(!data);
  useEffect(() => { if (data) setLoading(false); }, [data]);
  useEffect(() => {
    if (!data) {
      const t = setTimeout(() => setLoading(false), 8000);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
  if (!data?.assets?.length) return <Card className="bg-white/5 border-white/10"><CardContent className="py-12 text-center"><TrendingUp className="h-10 w-10 text-slate-600 mx-auto mb-2" /><p className="text-slate-400 text-sm">No drill-down data for {fy}.</p><p className="text-slate-500 text-xs mt-1">Import data and click Refresh to compute tax first.</p><Button onClick={onRefresh} className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-sm" size="sm"><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button></CardContent></Card>;
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
// REPORTS TAB — Comprehensive Tax Report (KoinX-style)
// ═══════════════════════════════════════════════════════════════
const ReportsTab: React.FC<{
  fy: string; summary: TaxSummary | null; assetPnl: AssetPnLResponse | null;
  scheduleVDA: ScheduleVDAResponse | null; onLoadVDA: () => void;
}> = ({ fy, summary, assetPnl, scheduleVDA, onLoadVDA }) => {
  useEffect(() => { if (!scheduleVDA) onLoadVDA(); }, []);
  const [showFullReport, setShowFullReport] = useState(false);

  // Use local data as fallback
  const s = summary || getLocalOverview(fy);
  const pnl = assetPnl || getLocalAssetPnL(fy);
  const ay = s?.assessment_year || '';
  const fyShort = fy.replace('FY', '');

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

  const downloadCompleteReport = () => {
    if (!s || !pnl) return;
    const lines: string[] = [];
    lines.push('TaxMitra — Crypto Complete Tax Report');
    lines.push(`Financial Year: ${fy} | Assessment Year: ${ay}`);
    lines.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('SECTION 1: TAX SUMMARY');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Total Sell Events:,${s.num_sell_events}`);
    lines.push(`Total FIFO Lots:,${s.num_fifo_lots}`);
    lines.push(`Sale Consideration (A):,${s.sale_consideration}`);
    lines.push(`Cost of Acquisition (B):,${s.cost_of_acquisition}`);
    lines.push(`Taxable Capital Gains:,${s.taxable_capital_gains}`);
    lines.push(`Gross Losses (Non-Deductible):,${s.gross_losses}`);
    lines.push(`Staking Income:,${s.staking_income}`);
    lines.push(`Rewards Income:,${s.rewards_income}`);
    lines.push(`Total Other Income:,${s.total_other_income}`);
    lines.push(`Total Taxable Income:,${s.total_taxable}`);
    lines.push('');
    lines.push('── Tax Computation ──');
    lines.push(`Gross Tax @30% (§115BBH):,${s.gross_tax}`);
    lines.push(`Health & Education Cess @4%:,${s.cess}`);
    lines.push(`Total Tax Liability:,${s.total_tax_liability}`);
    lines.push(`TDS Credit (§194S):,${s.tds_credit}`);
    lines.push(`Net Tax Payable:,${s.net_tax_payable}`);
    lines.push(`Refund Eligible:,${s.refund_eligible}`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('SECTION 2: ASSET-WISE PROFIT & LOSS');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push('Asset,Sale (INR),Cost (INR),Profit (INR),Loss (INR),Net Taxable (INR),FIFO Lots');
    for (const a of pnl.assets) {
      lines.push(`${a.asset},${a.sale},${a.cost},${a.profit},${a.loss},${a.net_taxable},${a.num_lots}`);
    }
    lines.push(`TOTAL,${pnl.totals.sale},${pnl.totals.cost},${pnl.totals.profit},${pnl.totals.loss},${pnl.totals.net_taxable},`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('SECTION 3: SCHEDULE VDA (For ITR Filing)');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    if (scheduleVDA?.rows.length) {
      lines.push('Sl No,Asset,Description,Date of Acquisition,Date of Transfer,Head of Income,Cost of Acquisition,Sale Consideration,Income from Transfer,Taxable Income');
      for (const r of scheduleVDA.rows) {
        lines.push(`${r.sl_no},${r.asset},${r.description},${r.date_of_acquisition},${r.date_of_transfer},${r.head_of_income},${r.cost_of_acquisition},${r.sale_consideration},${r.income_from_transfer},${r.taxable_income}`);
      }
    } else {
      lines.push('Schedule VDA data not loaded. Please compute tax first.');
    }
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('SECTION 4: TDS SUMMARY');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Exchange: CoinDCX`);
    lines.push(`Section: 194S (1% TDS on crypto transactions)`);
    lines.push(`Total TDS Deducted: ${s.tds_credit}`);
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('SECTION 5: APPLICABLE TAX RULES');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push('Section 115BBH — Flat 30% tax on income from Virtual Digital Assets');
    lines.push('Rule 1: Losses on one VDA CANNOT offset gains from another VDA');
    lines.push('Rule 2: Losses CANNOT be carried forward to future assessment years');
    lines.push('Rule 3: Only cost of acquisition is deductible (no other expenses)');
    lines.push('Section 194S — 1% TDS on crypto sale consideration above ₹50,000');
    lines.push('Calculation Method: First-In First-Out (FIFO)');
    lines.push('');
    lines.push('── Disclaimer ──');
    lines.push('This report is generated for informational purposes. Please consult a CA for final ITR filing.');

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TaxMitra_Crypto_Complete_Tax_Report_${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Complete Tax Report downloaded!');
  };

  if (!s) return (
    <Card className="bg-white/5 border-white/10"><CardContent className="py-12 text-center">
      <FileText className="h-10 w-10 text-slate-600 mx-auto mb-2" />
      <p className="text-slate-400 text-sm">No data available for {fy}. Compute tax first.</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-5">
      {/* Report Header */}
      <div className="bg-gradient-to-r from-violet-600/90 to-indigo-600/90 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-xl">Crypto Complete Tax Report</h2>
            <p className="text-white/70 text-sm mt-1">Financial Year {fyShort} • {ay}</p>
            <p className="text-white/50 text-xs mt-1">Section 115BBH • FIFO Method • {s.num_sell_events} Sell Events • {s.num_fifo_lots} FIFO Lots</p>
          </div>
          <Button onClick={downloadCompleteReport} className="bg-white/20 hover:bg-white/30 text-white border-0">
            <Download className="h-4 w-4 mr-2" />Download Full Report
          </Button>
        </div>
      </div>

      {/* Quick Downloads */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition cursor-pointer" onClick={downloadCompleteReport}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center"><FileText className="h-5 w-5 text-indigo-400" /></div>
            <div className="flex-1"><h3 className="text-white font-semibold text-xs">Complete Report</h3><p className="text-slate-500 text-[10px]">All sections in one file</p></div>
            <Download className="h-4 w-4 text-slate-500" />
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition cursor-pointer" onClick={downloadScheduleVDA}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center"><FileText className="h-5 w-5 text-violet-400" /></div>
            <div className="flex-1"><h3 className="text-white font-semibold text-xs">Schedule VDA</h3><p className="text-slate-500 text-[10px]">ITR-ready FIFO data</p></div>
            <Download className="h-4 w-4 text-slate-500" />
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition cursor-pointer" onClick={() => setShowFullReport(!showFullReport)}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-emerald-400" /></div>
            <div className="flex-1"><h3 className="text-white font-semibold text-xs">{showFullReport ? 'Hide' : 'View'} Full Report</h3><p className="text-slate-500 text-[10px]">In-page detailed report</p></div>
            {showFullReport ? <ChevronLeft className="h-4 w-4 text-slate-500 rotate-90" /> : <ChevronRight className="h-4 w-4 text-slate-500 -rotate-90" />}
          </CardContent>
        </Card>
      </div>

      {/* ═══ FULL IN-PAGE REPORT ═══ */}
      {showFullReport && (
        <div className="space-y-4 border border-white/10 rounded-xl p-5 bg-[#0d1221]">

          {/* Section 1: Tax Summary */}
          <div>
            <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-xs">1</span>Tax Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-lg p-3"><span className="text-slate-500 text-[10px] block">Sale Consideration</span><span className="text-white font-bold text-sm">{formatINRFull(s.sale_consideration)}</span></div>
              <div className="bg-white/5 rounded-lg p-3"><span className="text-slate-500 text-[10px] block">Cost of Acquisition</span><span className="text-white font-bold text-sm">{formatINRFull(s.cost_of_acquisition)}</span></div>
              <div className="bg-white/5 rounded-lg p-3"><span className="text-slate-500 text-[10px] block">Taxable Capital Gains</span><span className="text-emerald-400 font-bold text-sm">{formatINRFull(s.taxable_capital_gains)}</span></div>
              <div className="bg-white/5 rounded-lg p-3"><span className="text-slate-500 text-[10px] block">Gross Losses</span><span className="text-red-400 font-bold text-sm">{formatINRFull(s.gross_losses)}</span></div>
            </div>
            <Card className="bg-white/5 border-white/10 mt-3">
              <CardContent className="p-4">
                <h4 className="text-white text-xs font-semibold mb-2">Tax Computation — §115BBH</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Total Taxable Income</span><span className="text-white font-semibold">{formatINRFull(s.total_taxable)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Tax @30%</span><span className="text-white">{formatINRFull(s.gross_tax)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Health & Education Cess @4%</span><span className="text-white">{formatINRFull(s.cess)}</span></div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5"><span className="text-white font-semibold">Total Tax Liability</span><span className="text-white font-bold">{formatINRFull(s.total_tax_liability)}</span></div>
                  <div className="flex justify-between"><span className="text-cyan-400">Less: TDS Credit (§194S)</span><span className="text-cyan-400">-{formatINRFull(s.tds_credit)}</span></div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5"><span className="text-white font-bold">Net Tax Payable</span><span className="text-emerald-400 font-bold text-base">{formatINRFull(s.net_tax_payable)}</span></div>
                  {s.refund_eligible > 0 && <div className="flex justify-between"><span className="text-emerald-400">Refund Eligible</span><span className="text-emerald-400 font-semibold">{formatINRFull(s.refund_eligible)}</span></div>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Asset-wise P&L */}
          {pnl && pnl.assets.length > 0 && (
            <div>
              <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-xs">2</span>Asset-wise Profit & Loss</h3>
              <Card className="bg-white/5 border-white/10 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-white/10">
                    <TableHead className="text-slate-500 text-[10px]">Asset</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Sale (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Cost (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Profit (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Loss (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Taxable (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Lots</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {pnl.assets.map(a => (
                      <TableRow key={a.asset} className="border-white/5">
                        <TableCell className="text-white font-medium text-[11px]">{a.asset}</TableCell>
                        <TableCell className="text-right text-blue-300 text-[11px]">{formatINRFull(a.sale)}</TableCell>
                        <TableCell className="text-right text-slate-300 text-[11px]">{formatINRFull(a.cost)}</TableCell>
                        <TableCell className="text-right text-emerald-400 text-[11px]">{a.profit > 0 ? formatINRFull(a.profit) : '—'}</TableCell>
                        <TableCell className="text-right text-red-400 text-[11px]">{a.loss > 0 ? formatINRFull(a.loss) : '—'}</TableCell>
                        <TableCell className="text-right text-white font-semibold text-[11px]">{formatINRFull(a.net_taxable)}</TableCell>
                        <TableCell className="text-right text-slate-400 text-[11px]">{a.num_lots}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-indigo-500/30 bg-indigo-500/5">
                      <TableCell className="font-bold text-white text-[11px]">TOTAL</TableCell>
                      <TableCell className="text-right font-bold text-blue-300 text-[11px]">{formatINRFull(pnl.totals.sale)}</TableCell>
                      <TableCell className="text-right font-bold text-slate-300 text-[11px]">{formatINRFull(pnl.totals.cost)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-400 text-[11px]">{formatINRFull(pnl.totals.profit)}</TableCell>
                      <TableCell className="text-right font-bold text-red-400 text-[11px]">{formatINRFull(pnl.totals.loss)}</TableCell>
                      <TableCell className="text-right font-bold text-white text-[11px]">{formatINRFull(pnl.totals.net_taxable)}</TableCell>
                      <TableCell className="text-right text-slate-400 text-[11px]"></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* Section 3: Schedule VDA */}
          {scheduleVDA && scheduleVDA.rows.length > 0 && (
            <div>
              <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-xs">3</span>Schedule VDA — FIFO Lot Details ({scheduleVDA.total_rows} entries)</h3>
              <Card className="bg-white/5 border-white/10 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-white/10">
                    <TableHead className="text-slate-500 text-[10px]">#</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Asset</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Acquired</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Transferred</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Cost (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Sale (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Gain/Loss (₹)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Taxable (₹)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {scheduleVDA.rows.map(r => {
                      const gain = r.sale_consideration - r.cost_of_acquisition;
                      return (
                        <TableRow key={r.sl_no} className="border-white/5">
                          <TableCell className="text-slate-500 text-[10px]">{r.sl_no}</TableCell>
                          <TableCell className="text-white text-[10px] font-medium">{r.asset}</TableCell>
                          <TableCell className="text-slate-400 text-[10px]">{r.date_of_acquisition}</TableCell>
                          <TableCell className="text-slate-300 text-[10px]">{r.date_of_transfer}</TableCell>
                          <TableCell className="text-right text-slate-300 text-[10px]">{formatINRFull(r.cost_of_acquisition)}</TableCell>
                          <TableCell className="text-right text-blue-300 text-[10px]">{formatINRFull(r.sale_consideration)}</TableCell>
                          <TableCell className={`text-right text-[10px] font-semibold ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gain >= 0 ? '+' : ''}{formatINRFull(gain)}</TableCell>
                          <TableCell className="text-right text-white font-semibold text-[10px]">{formatINRFull(r.taxable_income)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* Section 4: TDS Summary */}
          <div>
            <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-xs">4</span>TDS Summary — Section 194S</h3>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center"><Coins className="h-4 w-4 text-blue-400" /></div>
                  <div><span className="text-white text-sm font-semibold">CoinDCX</span><span className="text-slate-500 text-xs ml-2">via CSV Import</span></div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">TDS Section</span><span className="text-white">194S (1% on sale consideration)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Total TDS Deducted</span><span className="text-cyan-400 font-bold">{formatINRFull(s.tds_credit)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Financial Year</span><span className="text-white">{fy}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 5: Tax Rules */}
          <div>
            <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center text-xs">5</span>Applicable Tax Rules</h3>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">§115BBH:</strong> Flat 30% tax on income from Virtual Digital Assets (VDA)</span></div>
                <div className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">No Loss Offset:</strong> Losses from one VDA cannot be set off against gains from another VDA</span></div>
                <div className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">No Carry Forward:</strong> VDA losses cannot be carried forward to future assessment years</span></div>
                <div className="flex gap-2"><Shield className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">§194S:</strong> 1% TDS on crypto sale consideration above ₹50,000</span></div>
                <div className="flex gap-2"><Calculator className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">FIFO:</strong> First-In First-Out method used for cost basis calculation</span></div>
                <div className="flex gap-2"><Coins className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" /><span className="text-slate-300"><strong className="text-white">Cess:</strong> 4% Health & Education Cess on tax amount</span></div>
              </CardContent>
            </Card>
          </div>

          <p className="text-slate-600 text-[10px] text-center italic">This report is generated by TaxMitra for informational purposes. Consult a qualified CA for final ITR filing.</p>
        </div>
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
