/**
 * Portfolio Analytics Component
 * 
 * Provides comprehensive visualization of crypto portfolio including:
 * - Allocation pie chart
 * - Performance line/bar charts
 * - Gain/loss breakdown
 * - Monthly analysis
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
    LineChart, Line, AreaChart, Area
} from 'recharts';
import {
    TrendingUp, TrendingDown, Wallet, Coins,
    BarChart3, PieChart as PieChartIcon, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

// Types
interface Trade {
    id: string;
    token_symbol: string;
    trade_type: string;
    quantity: number;
    buy_price: number;
    trade_date: string;
    exchange?: string;
}

interface PortfolioData {
    totalTaxableGains?: number;
    totalOtherIncome?: number;
    netTaxDue?: number;
    totalTDSPaid?: number;
    breakdown?: {
        token: string;
        realizedGain: number;
        taxDue: number;
        buyValue: number;
        sellValue: number;
    }[];
    tokenWise?: {
        token: string;
        holdings: number;
        avgCost: number;
        currentValue: number;
        unrealizedGainLoss: number;
    }[];
}

// Color palette for charts
const CHART_COLORS = [
    '#4f46e5', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#84cc16', // Lime
    '#f97316', // Orange
    '#6366f1', // Indigo light
];

// Use any for portfolio to allow flexible data structures
interface PortfolioAnalyticsProps {
    trades: Trade[];
    portfolio: any;
}

export function PortfolioAnalytics({ trades, portfolio }: PortfolioAnalyticsProps) {
    // Calculate holdings from trades
    const holdings = useMemo(() => {
        const holdingsMap: Record<string, { quantity: number; totalCost: number; buyCount: number; sellCount: number }> = {};

        trades.forEach(trade => {
            if (!holdingsMap[trade.token_symbol]) {
                holdingsMap[trade.token_symbol] = { quantity: 0, totalCost: 0, buyCount: 0, sellCount: 0 };
            }

            if (trade.trade_type === 'buy') {
                holdingsMap[trade.token_symbol].quantity += trade.quantity;
                holdingsMap[trade.token_symbol].totalCost += trade.quantity * trade.buy_price;
                holdingsMap[trade.token_symbol].buyCount += 1;
            } else if (trade.trade_type === 'sell') {
                holdingsMap[trade.token_symbol].quantity -= trade.quantity;
                holdingsMap[trade.token_symbol].sellCount += 1;
            }
        });

        return Object.entries(holdingsMap)
            .filter(([_, data]) => data.quantity > 0.000001)
            .map(([token, data]) => ({
                token,
                quantity: data.quantity,
                avgCost: data.totalCost / (data.quantity || 1),
                estimatedValue: data.totalCost, // In real app, multiply by current price
                buyCount: data.buyCount,
                sellCount: data.sellCount
            }))
            .sort((a, b) => b.estimatedValue - a.estimatedValue);
    }, [trades]);

    // Portfolio allocation data for pie chart
    const allocationData = useMemo(() => {
        const totalValue = holdings.reduce((sum, h) => sum + h.estimatedValue, 0);
        return holdings.slice(0, 10).map((h, i) => ({
            name: h.token,
            value: h.estimatedValue,
            percentage: totalValue > 0 ? ((h.estimatedValue / totalValue) * 100).toFixed(1) : 0,
            color: CHART_COLORS[i % CHART_COLORS.length]
        }));
    }, [holdings]);

    // Monthly trade analysis
    const monthlyAnalysis = useMemo(() => {
        const monthlyData: Record<string, { month: string; buys: number; sells: number; netFlow: number; tradeCount: number }> = {};

        trades.forEach(trade => {
            const date = new Date(trade.trade_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { month: monthLabel, buys: 0, sells: 0, netFlow: 0, tradeCount: 0 };
            }

            const value = trade.quantity * trade.buy_price;
            monthlyData[monthKey].tradeCount += 1;

            if (trade.trade_type === 'buy') {
                monthlyData[monthKey].buys += value;
                monthlyData[monthKey].netFlow -= value;
            } else if (trade.trade_type === 'sell') {
                monthlyData[monthKey].sells += value;
                monthlyData[monthKey].netFlow += value;
            }
        });

        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([_, data]) => data);
    }, [trades]);

    // Token-wise gain/loss breakdown
    const tokenGainLoss = useMemo(() => {
        if (portfolio.breakdown && portfolio.breakdown.length > 0) {
            return portfolio.breakdown
                .filter(b => b.sellValue > 0)
                .map((b, i) => ({
                    token: b.token,
                    gain: b.realizedGain,
                    sellValue: b.sellValue,
                    buyValue: b.buyValue,
                    color: b.realizedGain >= 0 ? '#10b981' : '#ef4444'
                }))
                .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
                .slice(0, 10);
        }
        return [];
    }, [portfolio]);

    // Exchange distribution
    const exchangeData = useMemo(() => {
        const exchangeMap: Record<string, { count: number; value: number }> = {};

        trades.forEach(trade => {
            const exchange = trade.exchange || 'Unknown';
            if (!exchangeMap[exchange]) {
                exchangeMap[exchange] = { count: 0, value: 0 };
            }
            exchangeMap[exchange].count += 1;
            exchangeMap[exchange].value += trade.quantity * trade.buy_price;
        });

        return Object.entries(exchangeMap).map(([name, data], i) => ({
            name,
            count: data.count,
            value: data.value,
            color: CHART_COLORS[i % CHART_COLORS.length]
        }));
    }, [trades]);

    // Summary stats
    const stats = useMemo(() => {
        const totalBuys = trades.filter(t => t.trade_type === 'buy').reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
        const totalSells = trades.filter(t => t.trade_type === 'sell').reduce((sum, t) => sum + t.quantity * t.buy_price, 0);
        return {
            totalTrades: trades.length,
            buyVolume: totalBuys,
            sellVolume: totalSells,
            netGain: portfolio.totalTaxableGains || 0,
            taxDue: portfolio.netTaxDue || 0,
            tdsCredit: portfolio.totalTDSPaid || 0,
            uniqueTokens: new Set(trades.map(t => t.token_symbol)).size
        };
    }, [trades, portfolio]);

    const formatCurrency = (value: number) => {
        if (Math.abs(value) >= 10000000) {
            return `₹${(value / 10000000).toFixed(2)}Cr`;
        } else if (Math.abs(value) >= 100000) {
            return `₹${(value / 100000).toFixed(2)}L`;
        } else if (Math.abs(value) >= 1000) {
            return `₹${(value / 1000).toFixed(1)}K`;
        }
        return `₹${value.toLocaleString('en-IN')}`;
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-slate-900 border-slate-800 rounded-2xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                                <BarChart3 className="h-5 w-5 text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Trades</p>
                                <p className="text-xl font-black text-white">{stats.totalTrades}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800 rounded-2xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                                <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Buy Volume</p>
                                <p className="text-xl font-black text-white">{formatCurrency(stats.buyVolume)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800 rounded-2xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                                <ArrowDownLeft className="h-5 w-5 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Sell Volume</p>
                                <p className="text-xl font-black text-white">{formatCurrency(stats.sellVolume)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800 rounded-2xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 ${stats.netGain >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'} rounded-xl flex items-center justify-center`}>
                                {stats.netGain >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-400" /> : <TrendingDown className="h-5 w-5 text-red-400" />}
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Gain/Loss</p>
                                <p className={`text-xl font-black ${stats.netGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {formatCurrency(stats.netGain)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Portfolio Allocation Pie Chart */}
                <Card className="bg-slate-900 border-slate-800 rounded-3xl">
                    <CardHeader className="border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-2">
                            <PieChartIcon className="h-5 w-5 text-indigo-400" />
                            <CardTitle className="text-sm font-black uppercase text-slate-400">Portfolio Allocation</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {allocationData.length > 0 ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={allocationData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {allocationData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                                                            <p className="font-bold text-white">{data.name}</p>
                                                            <p className="text-sm text-slate-400">{formatCurrency(data.value)}</p>
                                                            <p className="text-xs text-indigo-400">{data.percentage}%</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-64 flex items-center justify-center text-slate-500">
                                No holdings data available
                            </div>
                        )}

                        {/* Legend */}
                        <div className="flex flex-wrap gap-2 mt-4 justify-center">
                            {allocationData.slice(0, 6).map((item, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs text-slate-400">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Monthly Trade Volume */}
                <Card className="bg-slate-900 border-slate-800 rounded-3xl">
                    <CardHeader className="border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-emerald-400" />
                            <CardTitle className="text-sm font-black uppercase text-slate-400">Monthly Trade Volume</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {monthlyAnalysis.length > 0 ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyAnalysis}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="month" stroke="#64748b" fontSize={10} />
                                        <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1e293b',
                                                border: '1px solid #334155',
                                                borderRadius: '8px'
                                            }}
                                            formatter={(value: number) => [formatCurrency(value), '']}
                                        />
                                        <Legend />
                                        <Bar dataKey="buys" name="Buys" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="sells" name="Sells" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-64 flex items-center justify-center text-slate-500">
                                No trade data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Token-wise Gain/Loss */}
            {tokenGainLoss.length > 0 && (
                <Card className="bg-slate-900 border-slate-800 rounded-3xl">
                    <CardHeader className="border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-amber-400" />
                            <CardTitle className="text-sm font-black uppercase text-slate-400">Token-wise Realized Gain/Loss</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tokenGainLoss} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis type="number" stroke="#64748b" fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                                    <YAxis type="category" dataKey="token" stroke="#64748b" fontSize={10} width={50} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value: number) => [formatCurrency(value), 'Gain/Loss']}
                                    />
                                    <Bar
                                        dataKey="gain"
                                        name="Gain/Loss"
                                        radius={[0, 4, 4, 0]}
                                    >
                                        {tokenGainLoss.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Exchange Distribution and Trade Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Exchange Distribution */}
                <Card className="bg-slate-900 border-slate-800 rounded-3xl">
                    <CardHeader className="border-b border-slate-800 pb-4">
                        <CardTitle className="text-sm font-black uppercase text-slate-400">Exchange Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-3">
                            {exchangeData.map((ex, i) => (
                                <div key={ex.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="h-4 w-4 rounded-full"
                                            style={{ backgroundColor: ex.color }}
                                        />
                                        <span className="text-sm font-bold text-white">{ex.name}</span>
                                        <Badge className="bg-slate-800 text-slate-400 text-[10px]">{ex.count} trades</Badge>
                                    </div>
                                    <span className="text-sm font-black text-slate-300">{formatCurrency(ex.value)}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Tax Summary */}
                <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 border-none rounded-3xl">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-black uppercase text-white/70">Tax Summary (FY 2025-26)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-white/70">Taxable Capital Gains</span>
                            <span className="text-xl font-black text-white">{formatCurrency(stats.netGain)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-white/70">Tax @ 30%</span>
                            <span className="text-lg font-bold text-white">{formatCurrency(stats.taxDue)}</span>
                        </div>
                        <div className="h-px bg-white/20" />
                        <div className="flex justify-between items-center">
                            <span className="text-white/70">TDS Already Paid (1%)</span>
                            <span className="text-lg font-bold text-emerald-300">- {formatCurrency(stats.tdsCredit)}</span>
                        </div>
                        <div className="h-px bg-white/20" />
                        <div className="flex justify-between items-center">
                            <span className="text-white font-bold">Net Tax Payable</span>
                            <span className="text-2xl font-black text-white">{formatCurrency(Math.max(0, stats.taxDue - stats.tdsCredit))}</span>
                        </div>

                        <p className="text-[10px] text-white/50 mt-4">
                            Note: Cess @ 4% and surcharge may apply based on total income
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Current Holdings Table */}
            <Card className="bg-slate-900 border-slate-800 rounded-3xl">
                <CardHeader className="border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                        <Coins className="h-5 w-5 text-amber-400" />
                        <CardTitle className="text-sm font-black uppercase text-slate-400">Current Holdings ({holdings.length} Assets)</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-4 overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800">
                                <th className="text-left py-3">Token</th>
                                <th className="text-right py-3">Quantity</th>
                                <th className="text-right py-3">Avg Cost</th>
                                <th className="text-right py-3">Total Value</th>
                                <th className="text-right py-3">Trades</th>
                            </tr>
                        </thead>
                        <tbody>
                            {holdings.slice(0, 15).map((h, i) => (
                                <tr key={h.token} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black"
                                                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '30', color: CHART_COLORS[i % CHART_COLORS.length] }}
                                            >
                                                {h.token.slice(0, 3)}
                                            </div>
                                            <span className="font-bold text-white">{h.token}</span>
                                        </div>
                                    </td>
                                    <td className="text-right text-white font-mono">{h.quantity.toFixed(6)}</td>
                                    <td className="text-right text-slate-400">{formatCurrency(h.avgCost)}</td>
                                    <td className="text-right text-white font-bold">{formatCurrency(h.estimatedValue)}</td>
                                    <td className="text-right">
                                        <span className="text-emerald-400 text-xs">{h.buyCount}B</span>
                                        <span className="text-slate-600 mx-1">/</span>
                                        <span className="text-orange-400 text-xs">{h.sellCount}S</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}

export default PortfolioAnalytics;
