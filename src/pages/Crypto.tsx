import { useState, useEffect, useMemo } from "react";
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
  Briefcase
} from "lucide-react";
import { calculateDetailedPortfolio, Transaction, TaxSettings } from "@/lib/crypto-engine";
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

  const [settings, setSettings] = useState<TaxSettings>({
    accountingMethod: 'FIFO',
    treatAirdropsAsIncome: true,
    treatRewardsAsIncome: true,
    treatStakingAsIncome: true,
    treatInterestAsIncome: true,
    baseCurrency: 'INR',
    country: 'India'
  });

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
      setIsAdding(false);
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
    totalTaxable: portfolio.totalTaxable,
    totalOtherIncome: portfolio.totalOtherIncome,
    totalTaxDue: portfolio.totalTaxDue,
    totalTDS: trades.reduce((sum, t) => sum + (t.metadata?.tds_deducted || 0), 0),
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
            {activeTab === 'integrations' && <IntegrationsTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'portfolio' && (
              <Card className="bg-slate-900 border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4">
                <Coins className="h-12 w-12 text-indigo-400" />
                <h3 className="text-xl font-black">Portfolio Dashboard</h3>
                <p className="text-slate-400 text-sm max-w-sm">Aggregated view of all your holdings and real-time PnL tracking.</p>
                <Button onClick={() => setActiveTab('transactions')} className="bg-indigo-600 rounded-xl font-bold">View Ledger</Button>
              </Card>
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

function IntegrationsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
      <Card className="bg-slate-900 border-slate-800 rounded-3xl p-6 border-l-4 border-indigo-600 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <h4 className="text-lg font-black">CoinDCX Wallet</h4>
          <div className="h-2 w-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        </div>
        <div className="space-y-1 mb-6">
          <p className="text-[10px] text-slate-500 font-black uppercase">Status</p>
          <p className="text-xs font-bold text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Fully Synced</p>
        </div>
        <Button variant="outline" className="w-full h-10 rounded-xl font-black bg-slate-800 border-slate-700 hover:bg-slate-700 transition-colors">SYNC NOW</Button>
      </Card>
      <div className="border-4 border-dashed border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 text-slate-600 hover:bg-slate-800/20 cursor-pointer transition-all">
        <Plus className="h-10 w-10" />
        <p className="text-xs font-black uppercase tracking-widest">Add Integration</p>
      </div>
    </div>
  );
}

function ReportsTab() {
  const reports = [
    { title: 'Tax Audit Summary', desc: 'Detailed gain/loss matched schedule.', icon: ShieldCheck },
    { title: 'Schedule VDA (ITR)', desc: 'ITR-ready data as per Section 115BBH.', icon: FileSpreadsheet },
    { title: 'TDS Ledger', desc: '1% Deducted at source tracking report.', icon: Zap }
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-white">
      {reports.map((r, i) => (
        <Card key={i} className="bg-slate-900 border-slate-800 rounded-3xl p-8 hover:border-indigo-600/50 transition-all cursor-pointer flex items-center gap-6 border border-transparent shadow-xl">
          <div className="h-16 w-16 bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 transition-colors shadow-inner">
            <r.icon className="h-8 w-8" />
          </div>
          <div>
            <h4 className="text-xl font-black text-white">{r.title}</h4>
            <p className="text-slate-500 text-xs mt-1">{r.desc}</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="text-[10px] font-black h-8 border-slate-800 bg-slate-800 hover:bg-slate-700">PDF</Button>
              <Button variant="outline" className="text-[10px] font-black h-8 border-slate-800 bg-slate-800 hover:bg-slate-700">EXCEL</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
