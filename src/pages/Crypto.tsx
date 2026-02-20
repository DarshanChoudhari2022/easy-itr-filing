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
import { saveIncomeSources, saveUserData, loadUserData, deleteUserData } from "@/lib/supabase-data-service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, TrendingUp, TrendingDown, FileSpreadsheet, Download, Plus, History,
  BarChart3, Settings, Zap, Coins, RefreshCw, ShieldCheck, AlertTriangle,
  CheckCircle, Upload, Eye, EyeOff, Trash2, ArrowUpRight, ArrowDownRight,
  Filter, Sparkles, Target, Activity, Info, XCircle, FileText, Clock,
  Calendar, CheckCircle2, FileCheck, Gift, Receipt
} from "lucide-react";
import {
  // Client-side engine (no DB required)
  processImportSession,
  computeVdaTaxForFinancialYear,
  generateScheduleVDACSV,
  generateTDSReconciliationCSV,
  formatPnLSummary,
  type TaxComputationResult,
  type NormalizedTransaction,
  type TDSRecord,
  type ImportProgress
} from "@/lib/taxmitra";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { generateCompleteTaxReport, generateScheduleVDAPDF, TaxReportData } from "@/lib/pdf-report-generator";
import { generateComprehensiveReport, buildComprehensiveReportData } from "@/lib/comprehensive-report-generator";
import { PlanGate } from "@/hooks/usePlanGuard";
import {
  fullCoinDCXSync,
  validateCoinDCXCredentials,
  saveCredentials,
  loadCredentials,
  clearCredentials,
  hasStoredCredentials,
  type SyncProgress,
  type FullSyncResult,
  type MissingDataItem
} from "@/lib/coindcx-api";

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

// Tax calculation settings
interface TaxSettings {
  accountingMethod: string;
  treatAirdropsAsIncome: boolean;
  treatRewardsAsIncome: boolean;
  treatStakingAsIncome: boolean;
  treatInterestAsIncome: boolean;
  treatMiningAsIncome: boolean;
  baseCurrency: string;
  country: string;
  assessmentYear: string;
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
  const [loading, setLoading] = useState(false);
  const [taxComputation, setTaxComputation] = useState<TaxComputationResult | null>(null);
  const [importSessions, setImportSessions] = useState<any[]>([]);
  // Client-side parsed data — loaded from DB (primary) and localStorage (cache)
  const [parsedTransactions, setParsedTransactions] = useState<NormalizedTransaction[]>([]);
  const [parsedTDSRecords, setParsedTDSRecords] = useState<TDSRecord[]>([]);
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [dataLoadedFromDB, setDataLoadedFromDB] = useState(false);

  // Helper: revive transaction data from JSON (fix Date objects and numeric fields)
  const reviveTransactions = (parsed: any[]): NormalizedTransaction[] => {
    return parsed.map((tx: any) => ({
      ...tx,
      tradeTimestamp: new Date(tx.tradeTimestamp),
      quantity: Number(tx.quantity) || 0,
      pricePerUnit: Number(tx.pricePerUnit) || 0,
      priceInr: Number(tx.priceInr) || 0,
      grossAmountQuote: Number(tx.grossAmountQuote) || 0,
      grossAmountInr: Number(tx.grossAmountInr) || 0,
      feeAmount: Number(tx.feeAmount) || 0,
      feeInr: Number(tx.feeInr) || 0,
      tdsAmount: Number(tx.tdsAmount) || 0,
      tdsRate: Number(tx.tdsRate) || 0,
    }));
  };

  const reviveTDSRecords = (parsed: any[]): TDSRecord[] => {
    return parsed.map((r: any) => ({ ...r, tdsDate: new Date(r.tdsDate) }));
  };

  // ── LOAD DATA FROM SUPABASE (primary) → localStorage (fallback cache) ──
  useEffect(() => {
    const loadDataFromDB = async () => {
      if (!user) return;
      try {
        // Load all data from Supabase in parallel
        const [dbTransactions, dbTDS, dbSettings] = await Promise.all([
          loadUserData<any[]>('taxmitra_transactions'),
          loadUserData<any[]>('taxmitra_tds'),
          loadUserData<TaxSettings>('taxSettings'),
        ]);

        let hasDBData = false;

        if (dbTransactions && Array.isArray(dbTransactions) && dbTransactions.length > 0) {
          const revived = reviveTransactions(dbTransactions);
          setParsedTransactions(revived);
          localStorage.setItem('taxmitra_transactions', JSON.stringify(dbTransactions));
          hasDBData = true;
          console.log(`[CryptoTax] ✅ Loaded ${revived.length} transactions from database`);
        }

        if (dbTDS && Array.isArray(dbTDS) && dbTDS.length > 0) {
          const revived = reviveTDSRecords(dbTDS);
          setParsedTDSRecords(revived);
          localStorage.setItem('taxmitra_tds', JSON.stringify(dbTDS));
          hasDBData = true;
          console.log(`[CryptoTax] ✅ Loaded ${revived.length} TDS records from database`);
        }

        if (dbSettings) {
          setSettings(dbSettings);
          localStorage.setItem('taxSettings', JSON.stringify(dbSettings));
          console.log('[CryptoTax] ✅ Loaded settings from database');
        }

        // If no DB data, try localStorage as fallback
        if (!hasDBData) {
          console.log('[CryptoTax] No DB data found, checking localStorage...');
          try {
            const localTx = localStorage.getItem('taxmitra_transactions');
            if (localTx) {
              const parsed = JSON.parse(localTx);
              const revived = reviveTransactions(parsed);
              setParsedTransactions(revived);
              // Migrate localStorage data to DB
              saveUserData('taxmitra_transactions', parsed).catch(() => { });
              console.log(`[CryptoTax] Migrated ${revived.length} transactions from localStorage to DB`);
            }
          } catch (e) { console.log('Failed to restore transactions from localStorage'); }
          try {
            const localTDS = localStorage.getItem('taxmitra_tds');
            if (localTDS) {
              const parsed = JSON.parse(localTDS);
              const revived = reviveTDSRecords(parsed);
              setParsedTDSRecords(revived);
              // Migrate localStorage data to DB
              saveUserData('taxmitra_tds', parsed).catch(() => { });
              console.log(`[CryptoTax] Migrated ${revived.length} TDS records from localStorage to DB`);
            }
          } catch (e) { console.log('Failed to restore TDS from localStorage'); }
        }

        if (!dbSettings) {
          try {
            const localSettings = localStorage.getItem('taxSettings');
            if (localSettings) {
              const parsed = JSON.parse(localSettings);
              setSettings(parsed);
              saveUserData('taxSettings', parsed).catch(() => { });
            }
          } catch (e) { /* ignore */ }
        }

        setDataLoadedFromDB(true);
      } catch (err) {
        console.error('[CryptoTax] Error loading from DB:', err);
        // Final fallback to localStorage
        try {
          const localTx = localStorage.getItem('taxmitra_transactions');
          if (localTx) setParsedTransactions(reviveTransactions(JSON.parse(localTx)));
          const localTDS = localStorage.getItem('taxmitra_tds');
          if (localTDS) setParsedTDSRecords(reviveTDSRecords(JSON.parse(localTDS)));
          const localSettings = localStorage.getItem('taxSettings');
          if (localSettings) setSettings(JSON.parse(localSettings));
        } catch (e) { /* ignore */ }
        setDataLoadedFromDB(true);
      }
    };

    loadDataFromDB();
  }, [user]);

  // ── PERSIST to Supabase + localStorage cache whenever data changes ──
  useEffect(() => {
    if (!dataLoadedFromDB || !user) return; // Don't save until initial load completes
    localStorage.setItem('taxSettings', JSON.stringify(settings));
    // Debounce DB save
    const timer = setTimeout(() => {
      saveUserData('taxSettings', settings).catch(e =>
        console.warn('[CryptoTax] Failed to save settings to DB:', e)
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [settings, dataLoadedFromDB, user]);

  useEffect(() => {
    if (!dataLoadedFromDB || !user) return;
    if (parsedTransactions.length > 0) {
      localStorage.setItem('taxmitra_transactions', JSON.stringify(parsedTransactions));
      // Debounced save to DB
      const timer = setTimeout(() => {
        saveUserData('taxmitra_transactions', parsedTransactions).catch(e =>
          console.warn('[CryptoTax] Failed to save transactions to DB:', e)
        );
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [parsedTransactions, dataLoadedFromDB, user]);

  useEffect(() => {
    if (!dataLoadedFromDB || !user) return;
    if (parsedTDSRecords.length > 0) {
      localStorage.setItem('taxmitra_tds', JSON.stringify(parsedTDSRecords));
      const timer = setTimeout(() => {
        saveUserData('taxmitra_tds', parsedTDSRecords).catch(e =>
          console.warn('[CryptoTax] Failed to save TDS to DB:', e)
        );
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [parsedTDSRecords, dataLoadedFromDB, user]);

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
    token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'CoinDCX', tds_deducted: '', value_inr: ''
  });

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // CoinDCX API Connect state
  const [apiKey, setApiKey] = useState(() => loadCredentials()?.apiKey || '');
  const [apiSecret, setApiSecret] = useState(() => loadCredentials()?.apiSecret || '');
  const [apiConnected, setApiConnected] = useState(() => hasStoredCredentials());
  const [apiSyncing, setApiSyncing] = useState(false);
  const [apiSyncProgress, setApiSyncProgress] = useState<SyncProgress | null>(null);
  const [apiSyncResult, setApiSyncResult] = useState<FullSyncResult | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);

  // Financial Year state and helper
  // Smart FY: auto-detect from data, default to current FY (2025-26)
  const [selectedFY, setSelectedFY] = useState<string>('2025-26');
  const [fyAutoDetected, setFyAutoDetected] = useState(false);

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

  // Convert NormalizedTransaction[] to Trade[] for UI display
  const mapTransactionsToTrades = useCallback((txs: NormalizedTransaction[]): Trade[] => {
    return txs.map((tx, i) => ({
      id: tx.externalId || `tx-${i}`,
      user_id: user?.id || '',
      token_symbol: tx.assetSymbol || 'UNKNOWN',
      trade_type: tx.transactionType || 'buy',
      quantity: Number(tx.quantity) || 0,
      buy_price: Number(tx.priceInr) || 0,
      trade_date: tx.tradeTimestamp instanceof Date ? tx.tradeTimestamp.toISOString() : new Date(tx.tradeTimestamp).toISOString(),
      exchange: tx.exchange || '',
      fee: Number(tx.feeInr) || 0,
      metadata: {
        fee: Number(tx.feeInr) || 0,
        tds_deducted: Number(tx.tdsAmount) || 0
      }
    }));
  }, [user]);

  // RECOMPUTE TAX from in-memory transactions whenever FY or data changes
  // Also persists result to localStorage + Supabase for the filing wizard
  const recomputeTax = useCallback((txs: NormalizedTransaction[], tds: TDSRecord[], fy: string) => {
    if (txs.length === 0) return;
    try {
      const result = computeVdaTaxForFinancialYear(txs, tds, fy, settings.accountingMethod as any);
      setTaxComputation(result);

      // ── Persist to Supabase + localStorage so the Filing Wizard can auto-read ──
      const cryptoTaxSummary = {
        taxableCapitalGains: result.taxableCapitalGains,
        totalTaxLiability: result.totalTaxLiability,
        totalTDSCredit: result.totalTDSCredit,
        totalConsiderationInr: result.totalConsiderationInr,
        totalCostOfAcquisitionInr: result.totalCostOfAcquisitionInr,
        grossCapitalGains: result.grossCapitalGains,
        netTaxPayable: result.netTaxPayable,
        uniqueAssets: result.uniqueAssets,
        totalVDAEntries: result.totalVDAEntries,
        financialYear: result.financialYear,
        assessmentYear: result.assessmentYear,
        computedAt: new Date().toISOString(),
      };
      localStorage.setItem('taxmitra_crypto_tax_summary', JSON.stringify(cryptoTaxSummary));
      // Also save to Supabase for cross-device access
      saveUserData('taxmitra_crypto_tax_summary', cryptoTaxSummary).catch(e =>
        console.warn('[CryptoTax] Failed to save tax summary to DB:', e)
      );
      console.log('[CryptoTax] Saved tax summary to DB + localStorage:', cryptoTaxSummary);

      // ── Persist to Supabase income_sources so it appears in Filing Wizard ──
      if (user) {
        const ay = result.assessmentYear || '2026-27';
        saveIncomeSources({
          assessment_year: ay,
          has_crypto: true,
          crypto_gains: Math.round(result.taxableCapitalGains),
          crypto_tds: Math.round(result.totalTDSCredit),
        }).then(() => {
          console.log('[CryptoTax] ✅ Saved crypto data to income_sources for filing wizard');
        }).catch(err => {
          console.warn('[CryptoTax] Could not save to income_sources:', err.message);
        });
      }
    } catch (err) {
      console.error('Tax computation error:', err);
    }
  }, [settings.accountingMethod, user]);

  // FETCH TRADES from DB (graceful — won't fail if tables don't exist)
  const fetchTrades = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await (supabase as any)
        .from('crypto_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('trade_timestamp', { ascending: false });

      if (!error && data && data.length > 0) {
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
      }
      // Silently ignore errors (table may not exist)
    } catch (err) {
      console.log('DB tables not available, using client-side mode');
    }
  }, [user]);

  // FETCH TAX COMPUTATION — recompute from client-side parsed data
  const fetchTaxComputation = useCallback(async () => {
    if (parsedTransactions.length > 0) {
      recomputeTax(parsedTransactions, parsedTDSRecords, selectedFY);
    }
  }, [parsedTransactions, parsedTDSRecords, selectedFY, recomputeTax]);

  // Fetch Import Sessions (graceful)
  const fetchSessions = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('crypto_import_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setImportSessions(data);
    } catch (err) {
      // Silently ignore — table may not exist
    }
  }, []);

  // Recompute tax whenever parsed data or FY changes
  // Also auto-detect the best FY from the data (once)
  useEffect(() => {
    if (parsedTransactions.length > 0) {
      // ── Auto-detect FY from data (run once after first load) ──
      if (!fyAutoDetected) {
        const fyCounts: Record<string, number> = {};
        for (const tx of parsedTransactions) {
          // Only count buy/sell trades (not deposits/withdrawals)
          if (tx.transactionType === 'buy' || tx.transactionType === 'sell') {
            fyCounts[tx.financialYear] = (fyCounts[tx.financialYear] || 0) + 1;
          }
        }
        const fyEntries = Object.entries(fyCounts).sort((a, b) => b[1] - a[1]);
        if (fyEntries.length > 0) {
          const bestFY = fyEntries[0][0];
          if (bestFY !== selectedFY) {
            console.log(`[CryptoTax] Auto-detected FY ${bestFY} from data (${fyEntries[0][1]} trades). Was: ${selectedFY}`);
            setSelectedFY(bestFY);
          }
          setFyAutoDetected(true);
          return; // Will re-run with new FY
        }
        setFyAutoDetected(true);
      }
      recomputeTax(parsedTransactions, parsedTDSRecords, selectedFY);
      setTrades(mapTransactionsToTrades(parsedTransactions));
    }
  }, [parsedTransactions, parsedTDSRecords, selectedFY, recomputeTax, mapTransactionsToTrades, fyAutoDetected]);

  useEffect(() => {
    if (user) {
      fetchTrades();
      fetchSessions();
    }
  }, [user, fetchTrades, fetchSessions]);

  // ============= CSV IMPORT HANDLER =============
  const handleCSVUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) {
      toast.error('Please select file(s)');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      // 1. Read all files
      const filePayloads: { name: string; content: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();
        filePayloads.push({ name: file.name, content });
      }

      // 2. Parse CSVs CLIENT-SIDE (no database required)
      const sessionId = `client-${Date.now()}`;
      const importResult = await processImportSession(
        sessionId,
        selectedFY,
        filePayloads,
        undefined, // fxRateLookup (use defaults)
        selectedExchange // CoinDCX, WazirX, etc.
      );

      // 3. Collect all parsed transactions and TDS records
      const allTransactions: NormalizedTransaction[] = [];
      const allTDSRecords: TDSRecord[] = [];
      const messages: string[] = [];

      for (const fileResult of importResult.files) {
        allTransactions.push(...fileResult.transactions);
        allTDSRecords.push(...fileResult.tdsRecords);
        if (fileResult.successCount > 0) {
          messages.push(`✅ ${fileResult.fileName}: ${fileResult.successCount} transactions parsed`);
        }
        if (fileResult.errorCount > 0) {
          messages.push(`⚠️ ${fileResult.fileName}: ${fileResult.errorCount} rows had errors`);
        }
        if (fileResult.duplicateCount > 0) {
          messages.push(`ℹ️ ${fileResult.fileName}: ${fileResult.duplicateCount} duplicates skipped`);
        }
      }

      // Log parsing details for debugging
      console.log('[CryptoImport] Import result:', {
        exchange: selectedExchange,
        selectedFY,
        totalFiles: importResult.files.length,
        totalTransactions: importResult.totalTransactions,
        totalErrors: importResult.totalErrors,
        totalDuplicates: importResult.totalDuplicates,
        warnings: importResult.warnings,
      });
      for (const f of importResult.files) {
        console.log(`[CryptoImport] File "${f.fileName}": type=${f.fileType}, rows=${f.totalRows}, success=${f.successCount}, errors=${f.errorCount}, dups=${f.duplicateCount}`);
        if (f.errors.length > 0) console.log(`[CryptoImport] File errors:`, f.errors.slice(0, 10));
        if (f.warnings.length > 0) console.log(`[CryptoImport] File warnings:`, f.warnings.slice(0, 10));
      }

      if (allTransactions.length === 0) {
        // Collect all file-level errors for display
        const errorDetails: string[] = ['No transactions could be parsed. Check the CSV format and try again.'];
        for (const f of importResult.files) {
          if (f.errors.length > 0) {
            errorDetails.push(...f.errors.slice(0, 5).map(e => `Row ${e.line}: ${e.message}`));
          }
        }
        if (importResult.warnings.length > 0) {
          errorDetails.push(...importResult.warnings.slice(0, 5));
        }
        toast.error('No valid transactions found in the uploaded file(s)');
        setImportResult({
          success: 0,
          errors: 1,
          messages: errorDetails
        });
        return;
      }

      // 4. Store parsed data in state — REPLACE all old data (not append)
      // This prevents stale data accumulation from old API syncs/imports
      // that had fabricated TDS or other bad values
      setFyAutoDetected(false); // Will trigger FY re-detection from new data

      // REPLACE mode: clear old data and use only the new import
      // This is intentional — re-uploading CSV should give you a fresh, correct state
      console.log(`[CryptoImport] REPLACE mode: clearing ${parsedTransactions.length} old transactions, replacing with ${allTransactions.length} new ones`);
      messages.push(`🔄 Replaced ${parsedTransactions.length} old transactions with ${allTransactions.length} fresh ones from CSV`);

      setParsedTransactions(allTransactions);
      setParsedTDSRecords(allTDSRecords);

      // 5. Map to Trade[] for UI display
      const newTrades = mapTransactionsToTrades(allTransactions);
      setTrades(newTrades);

      // 6. Compute tax immediately using the FY with most trades
      const allTxs = allTransactions;
      const allTds = allTDSRecords;
      // Auto-detect best FY from the combined data
      const fyCounts: Record<string, number> = {};
      for (const tx of allTxs) {
        if (tx.transactionType === 'buy' || tx.transactionType === 'sell') {
          fyCounts[tx.financialYear] = (fyCounts[tx.financialYear] || 0) + 1;
        }
      }
      const bestFY = Object.entries(fyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || selectedFY;
      const taxResult = computeVdaTaxForFinancialYear(allTxs, allTds, bestFY, settings.accountingMethod as any);
      setTaxComputation(taxResult);

      // 7. Show success
      toast.success(`Imported ${allTransactions.length} transactions! Tax computed.`);
      messages.push(`📊 Capital Gains: ₹${taxResult.grossCapitalGains.toLocaleString('en-IN')}`);
      messages.push(`💰 Tax Liability: ₹${taxResult.totalTaxLiability.toLocaleString('en-IN')}`);
      if (taxResult.totalTDSCredit > 0) {
        messages.push(`🔖 TDS Credit: ₹${taxResult.totalTDSCredit.toLocaleString('en-IN')}`);
      }
      if (taxResult.warnings.length > 0) {
        messages.push(...taxResult.warnings.slice(0, 5)); // Show first 5 engine warnings
      }

      setImportResult({
        success: allTransactions.length,
        errors: importResult.totalErrors,
        messages
      });

      // 8. Add import session to local state
      setImportSessions(prev => [{
        id: sessionId,
        exchange: selectedExchange,
        financial_year: selectedFY,
        status: 'completed',
        total_files: files.length,
        total_transactions: allTransactions.length,
        created_at: new Date().toISOString()
      }, ...prev]);

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
  }, [user, selectedFY, selectedExchange, parsedTransactions, parsedTDSRecords, settings.accountingMethod, mapTransactionsToTrades]);

  // ============= MANUAL TRADE ADD =============
  const handleAddTrade = async () => {
    if (!user) {
      toast.error('Please sign in to add trades');
      return;
    }
    if (!newTrade.token_symbol || !newTrade.quantity || !newTrade.trade_date) {
      toast.error('Please fill Token, Quantity, and Date');
      return;
    }
    const qty = parseFloat(newTrade.quantity);
    const price = parseFloat(newTrade.buy_price) || 0;
    const tds = parseFloat(newTrade.tds_deducted) || 0;
    const valueInr = parseFloat(newTrade.value_inr) || (qty * price);
    if (qty <= 0) { toast.error('Quantity must be positive'); return; }

    const tradeDate = new Date(newTrade.trade_date);
    const month = tradeDate.getMonth();
    const year = tradeDate.getFullYear();
    const fy = month < 3 ? `${year - 1}-${String(year).slice(2)}` : `${year}-${String(year + 1).slice(2)}`;
    const ayStart = parseInt(fy.split('-')[0]) + 1;
    const ay = `${ayStart}-${String(ayStart + 1).slice(2)}`;

    const txType = newTrade.trade_type;
    const isReward = txType.startsWith('reward_') || txType === 'airdrop';
    const isSell = txType === 'sell';

    const manualTx: NormalizedTransaction = {
      externalId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      exchange: newTrade.exchange || 'Manual',
      transactionType: txType,
      isTaxableEvent: isSell,
      assetSymbol: newTrade.token_symbol.toUpperCase(),
      quoteAsset: 'INR',
      pair: `${newTrade.token_symbol.toUpperCase()}/INR`,
      quantity: qty,
      pricePerUnit: price || (valueInr / qty),
      priceInr: price || (valueInr / qty),
      grossAmountQuote: valueInr,
      grossAmountInr: valueInr,
      feeAmount: 0,
      feeAsset: 'INR',
      feeInr: 0,
      tdsAmount: tds,
      tdsRate: tds > 0 ? 0.01 : 0,
      tradeTimestamp: tradeDate,
      financialYear: fy,
      assessmentYear: ay,
      description: `MANUAL ${txType.toUpperCase()} ${qty} ${newTrade.token_symbol.toUpperCase()}${isReward ? ' (Other Income)' : ''}`,
      rawData: { source: 'manual_entry' },
      contentHash: `manual-${Date.now()}`,
    };

    // Add to parsed transactions
    const updatedTxs = [...parsedTransactions, manualTx];
    setParsedTransactions(updatedTxs);

    // Update trades for UI
    const newTradeUI: Trade = {
      id: manualTx.externalId,
      user_id: user.id,
      token_symbol: manualTx.assetSymbol,
      trade_type: manualTx.transactionType,
      quantity: qty,
      buy_price: manualTx.priceInr,
      trade_date: tradeDate.toISOString(),
      exchange: manualTx.exchange,
      fee: 0,
      metadata: { fee: 0, tds_deducted: tds }
    };
    setTrades(prev => [...prev, newTradeUI]);

    // Recompute tax
    const taxResult = computeVdaTaxForFinancialYear(updatedTxs, parsedTDSRecords, selectedFY, settings.accountingMethod as any);
    setTaxComputation(taxResult);

    toast.success(`Added ${isReward ? 'reward' : txType} for ${qty} ${newTrade.token_symbol.toUpperCase()}`);
    setShowAddTrade(false);
    setNewTrade({ token_symbol: '', trade_type: 'buy', quantity: '', buy_price: '', trade_date: '', exchange: 'CoinDCX', tds_deducted: '', value_inr: '' });
  };

  // ============= DELETE TRADE =============
  const handleDeleteTrade = async (id: string) => {
    // Remove from local state (works without DB)
    const updatedTxs = parsedTransactions.filter(tx => tx.externalId !== id);
    setParsedTransactions(updatedTxs);
    setTrades(prev => prev.filter(t => t.id !== id));

    // Recompute tax
    if (updatedTxs.length > 0) {
      const taxResult = computeVdaTaxForFinancialYear(updatedTxs, parsedTDSRecords, selectedFY, settings.accountingMethod as any);
      setTaxComputation(taxResult);
    } else {
      setTaxComputation(null);
    }

    // Also try DB delete (non-blocking)
    try {
      await (supabase as any).from('crypto_transactions').delete().eq('id', id);
    } catch (e) { /* silent */ }

    toast.success('Trade deleted');
  };

  // ============= DELETE ALL TRADES =============
  const handleDeleteAllTrades = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete all trades? This cannot be undone.')) return;

    // Clear local state
    setTaxComputation(null);
    setParsedTransactions([]);
    setParsedTDSRecords([]);
    setTrades([]);
    setImportSessions([]);
    setImportResult(null);

    // Clear localStorage + database
    localStorage.removeItem('taxmitra_transactions');
    localStorage.removeItem('taxmitra_tds');
    localStorage.removeItem('taxmitra_crypto_tax_summary');
    // Also clear from Supabase
    deleteUserData('taxmitra_transactions').catch(() => { });
    deleteUserData('taxmitra_tds').catch(() => { });
    deleteUserData('taxmitra_crypto_tax_summary').catch(() => { });

    // Also try DB delete (non-blocking)
    try {
      await (supabase as any).from('crypto_transactions').delete().eq('user_id', user.id);
      await (supabase as any).from('crypto_import_sessions').delete().eq('user_id', user.id);
    } catch (e) { /* silent */ }

    toast.success('All trades deleted');
  };

  // ============= STATISTICS (FY-wise) =============
  // Only count transactions that belong to the selected FY (not prior-FY buys kept for FIFO)
  const fySpecificTransactions = useMemo(() => {
    return parsedTransactions.filter(tx => tx.financialYear === selectedFY);
  }, [parsedTransactions, selectedFY]);

  const stats = useMemo(() => {
    const fyBuys = fySpecificTransactions.filter(t => t.transactionType === 'buy');
    const fySells = fySpecificTransactions.filter(t => t.transactionType === 'sell');
    const fyRewards = fySpecificTransactions.filter(t =>
      t.transactionType.startsWith('reward_') || t.transactionType === 'airdrop' ||
      t.transactionType === 'staking_reward' || t.transactionType === 'reward'
    );

    // Use engine computation if available
    if (taxComputation) {
      // ── Use engine's sell count (VDA report lines = unique sell events, matches KoinX) ──
      // totalVDAEntries = number of sell events processed by FIFO engine
      // This is more accurate than raw fySells.length which counts raw CSV rows
      const engineSellCount = taxComputation.totalVDAEntries || fySells.length;
      return {
        totalTrades: fyBuys.length + engineSellCount,
        buyTrades: fyBuys.length,
        sellTrades: engineSellCount,
        rewardTrades: fyRewards.length,
        // BUG FIX: totalBuyValueInr = cost of ALL buys (including unsold inventory) — WRONG
        // totalCostOfAcquisitionInr = FIFO-matched cost for SOLD assets only — CORRECT
        buyVolume: taxComputation.totalCostOfAcquisitionInr,
        sellVolume: taxComputation.totalConsiderationInr,
        netGain: taxComputation.netGainLossInfo,
        taxableGain: taxComputation.taxableCapitalGains,
        taxPayable: taxComputation.totalTaxLiability,
        tdsCredit: taxComputation.totalTDSCredit,
        uniqueTokens: taxComputation.uniqueAssets,
        otherIncome: taxComputation.otherVDAIncome || 0,
        brokerage: taxComputation.totalBrokerageFee || 0
      };
    }

    // Fallback or empty state
    return {
      totalTrades: fyBuys.length + fySells.length,
      buyTrades: fyBuys.length,
      sellTrades: fySells.length,
      rewardTrades: fyRewards.length,
      buyVolume: 0,
      sellVolume: 0,
      netGain: 0,
      taxableGain: 0,
      taxPayable: 0,
      tdsCredit: 0,
      uniqueTokens: 0,
      otherIncome: 0,
      brokerage: 0
    };
  }, [fySpecificTransactions, taxComputation]);

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
  const formatCurrency = (value: number | string | undefined | null): string => {
    const v = Number(value) || 0;
    if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
    if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
    if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
    return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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

                <div className="flex flex-wrap items-center gap-3">
                  {/* FY Selector */}
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <Calendar className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium text-slate-600 whitespace-nowrap">FY</span>
                    <Select value={selectedFY} onValueChange={setSelectedFY}>
                      <SelectTrigger className="w-[120px] h-8 border-0 shadow-none focus:ring-0 p-0 hover:bg-transparent">
                        <SelectValue placeholder="Select FY" />
                      </SelectTrigger>
                      <SelectContent>
                        {FINANCIAL_YEARS.map(fy => (
                          <SelectItem key={fy.value} value={fy.value} textValue={fy.value}>
                            <div className="flex items-center justify-between gap-4 w-full">
                              <span className="truncate">{fy.label}</span>
                              {fyTradeCounts[fy.value] > 0 && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] min-w-[1.25rem] flex items-center justify-center">
                                  {fyTradeCounts[fy.value]}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="outline" size="sm" onClick={fetchTrades} disabled={loading} className="h-[38px]">
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Dialog open={showAddTrade} onOpenChange={setShowAddTrade}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-[38px]">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trade
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add Transaction Manually</DialogTitle>
                        <DialogDescription>Add trades, staking rewards, airdrops, or promotions that aren't in your CSV exports.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Token Symbol *</Label>
                            <Input
                              placeholder="BTC, ETH, ADA..."
                              value={newTrade.token_symbol}
                              onChange={e => setNewTrade({ ...newTrade, token_symbol: e.target.value.toUpperCase() })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Transaction Type *</Label>
                            <Select value={newTrade.trade_type} onValueChange={v => setNewTrade({ ...newTrade, trade_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="buy">Buy</SelectItem>
                                <SelectItem value="sell">Sell</SelectItem>
                                <SelectItem value="reward_staking">🥩 Staking Reward</SelectItem>
                                <SelectItem value="reward_airdrop">🎁 Airdrop / Promotion</SelectItem>
                                <SelectItem value="reward_interest">💰 Interest / Lending</SelectItem>
                                <SelectItem value="reward_mining">⛏️ Mining</SelectItem>
                                <SelectItem value="deposit">Deposit</SelectItem>
                                <SelectItem value="withdrawal">Withdrawal</SelectItem>
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
                            <Label>Price per Unit (₹)</Label>
                            <Input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={newTrade.buy_price}
                              onChange={e => setNewTrade({ ...newTrade, buy_price: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Total Value (₹)</Label>
                            <Input
                              type="number"
                              step="any"
                              placeholder="Auto-calculated"
                              value={newTrade.value_inr}
                              onChange={e => setNewTrade({ ...newTrade, value_inr: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>TDS Deducted (₹)</Label>
                            <Input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={newTrade.tds_deducted}
                              onChange={e => setNewTrade({ ...newTrade, tds_deducted: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Date *</Label>
                            <Input
                              type="date"
                              value={newTrade.trade_date}
                              onChange={e => setNewTrade({ ...newTrade, trade_date: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Exchange</Label>
                            <Select value={newTrade.exchange} onValueChange={v => setNewTrade({ ...newTrade, exchange: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CoinDCX">CoinDCX</SelectItem>
                                <SelectItem value="WazirX">WazirX</SelectItem>
                                <SelectItem value="Binance">Binance</SelectItem>
                                <SelectItem value="ZebPay">ZebPay</SelectItem>
                                <SelectItem value="Manual">Other / Manual</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {newTrade.trade_type.startsWith('reward_') || newTrade.trade_type === 'airdrop' ? (
                          <Alert className="border-amber-200 bg-amber-50">
                            <Info className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-700 text-xs">
                              💡 <strong>Where to find this data:</strong> Check your email for "CoinDCX reward credited" messages. Each email has the asset, amount, and date.
                            </AlertDescription>
                          </Alert>
                        ) : null}
                        <div className="flex justify-end gap-3 pt-4">
                          <Button variant="outline" onClick={() => setShowAddTrade(false)}>Cancel</Button>
                          <Button onClick={handleAddTrade} className="bg-indigo-600 hover:bg-indigo-700">Add Transaction</Button>
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



          {/* Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

            {/* ============= OVERVIEW TAB ============= */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatCard
                    label="Capital Gain Trades"
                    value={stats.totalTrades.toString()}
                    subtext={`${stats.buyTrades} buys · ${stats.sellTrades} sells`}
                    icon={<Activity className="h-5 w-5 text-indigo-600" />}
                  />
                  <StatCard
                    label="Cost of Acquisition"
                    value={formatCurrency(stats.buyVolume)}
                    subtext={`${stats.uniqueTokens} unique assets`}
                    icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                  />
                  <StatCard
                    label="Sale Consideration"
                    value={formatCurrency(stats.sellVolume)}
                    subtext="Total sell proceeds"
                    icon={<TrendingDown className="h-5 w-5 text-amber-600" />}
                  />
                  <StatCard
                    label="Capital Gains"
                    value={formatCurrency(stats.taxableGain)}
                    subtext={stats.taxableGain >= 0 ? 'Taxable gains (§115BBH)' : 'Net loss (info only)'}
                    icon={<Target className="h-5 w-5 text-purple-600" />}
                    highlight={stats.taxableGain >= 0 ? 'positive' : 'negative'}
                  />
                  <StatCard
                    label="Other Income"
                    value={formatCurrency(stats.otherIncome)}
                    subtext={`Rewards/Staking${(stats as any).rewardTrades > 0 ? ` · ${(stats as any).rewardTrades} txns` : ' · Add manually ↗'}`}
                    icon={<Gift className="h-5 w-5 text-pink-600" />}
                    highlight="positive"
                  />
                  <StatCard
                    label="TDS Credit"
                    value={formatCurrency(stats.tdsCredit)}
                    subtext="Section 194S deducted"
                    icon={<Receipt className="h-5 w-5 text-gray-600" />}
                  />
                </div>

                {/* Tax Summary Card */}
                <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <p className="text-indigo-200 text-sm font-medium">Estimated Tax Liability ({selectedFY})</p>
                        <p className="text-4xl font-bold mt-1">{formatCurrency(Math.max(0, stats.taxPayable))}</p>
                        <p className="text-indigo-200 text-sm mt-1">
                          Capital Gains: {formatCurrency(stats.taxableGain)} + Other Income: {formatCurrency(stats.otherIncome)}
                        </p>
                        <p className="text-indigo-300 text-xs mt-1">@ 30% flat rate + 4% cess (§115BBH)</p>
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
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-300 text-xs">Gross Tax: {formatCurrency(stats.taxPayable)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Missing Data Alerts ── */}
                {parsedTransactions.length > 0 && (
                  <div className="space-y-3">
                    {/* Alert: Missing staking rewards */}
                    {stats.otherIncome < 500 && (
                      <Alert className="border-amber-300 bg-amber-50">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-800 font-semibold">⚠️ Staking Rewards May Be Missing</AlertTitle>
                        <AlertDescription className="text-amber-700 text-sm mt-1">
                          <p>Your Other Income is <strong>{formatCurrency(stats.otherIncome)}</strong>. CoinDCX does <strong>not</strong> expose staking rewards via their API — they must be added manually.</p>
                          <p className="mt-2 font-medium">KoinX reference for FY 2024-25:</p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
                            <li>ADA Staking: 4 rewards totaling ~₹1,027.74 (₹232.49 + ₹414.75 + ₹49.24 + ₹331.26)</li>
                            <li>SHIB Rewards: 2 rewards totaling ~₹103.58 (₹51.79 × 2)</li>
                            <li>INR Cashback: ~₹709.63 (₹6.77 + ₹0.86 + ₹702.00)</li>
                            <li><strong>Total Other Income: ~₹1,840.95</strong></li>
                          </ul>
                          <p className="mt-2 text-xs">📧 Check your email for "CoinDCX reward credited" messages. Then use <strong>+ Add Trade → Staking Reward / Airdrop</strong> to add each one.</p>
                        </AlertDescription>
                      </Alert>
                    )}
                    {/* Alert: TDS may be estimated (no TDS CSV uploaded) */}
                    {parsedTDSRecords.length === 0 && stats.tdsCredit > 0 && (
                      <Alert className="border-blue-200 bg-blue-50">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-800 font-semibold">ℹ️ TDS is Estimated (1% of Sell Value)</AlertTitle>
                        <AlertDescription className="text-blue-700 text-sm">
                          No TDS certificate CSV uploaded. TDS is estimated at 1% of sell consideration. For exact figures, download your <strong>TDS Summary CSV</strong> from CoinDCX → Tax Reports, then upload it here.
                          <br /><span className="text-xs mt-1 block">KoinX reference TDS for FY 2024-25: ₹28,770.38</span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

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
                                <Badge variant="outline" className={
                                  trade.trade_type === 'buy' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                                    trade.trade_type === 'sell' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                                      trade.trade_type.startsWith('reward_') ? 'border-purple-200 text-purple-700 bg-purple-50' :
                                        trade.trade_type === 'deposit' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                                          'border-slate-200 text-slate-700 bg-slate-50'
                                }>
                                  {trade.trade_type === 'reward_staking' ? '🥩 STAKING' :
                                    trade.trade_type === 'reward_airdrop' ? '🎁 AIRDROP' :
                                      trade.trade_type === 'reward_interest' ? '💰 INTEREST' :
                                        trade.trade_type === 'reward_mining' ? '⛏️ MINING' :
                                          trade.trade_type.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium text-slate-900">{trade.token_symbol}</TableCell>
                              <TableCell className="text-right text-slate-600">{Number(trade.quantity || 0).toFixed(6)}</TableCell>
                              <TableCell className="text-right text-slate-600">{formatCurrency(trade.buy_price)}</TableCell>
                              <TableCell className="text-right font-medium text-slate-900">{formatCurrency(Number(trade.quantity || 0) * Number(trade.buy_price || 0))}</TableCell>
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
                {/* ===== CONNECT COINDCX API — PRIMARY METHOD ===== */}
                <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-900 to-indigo-900 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-sm">⚡</div>
                      <div>
                        <CardTitle className="text-lg font-bold text-white">Connect CoinDCX API</CardTitle>
                        <CardDescription className="text-indigo-200">One-click import • All trades + staking + rewards • Like KoinX</CardDescription>
                      </div>
                      {apiConnected && (
                        <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-400/30">✅ Connected</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 relative z-10">
                    {!apiConnected ? (
                      <>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-indigo-200 text-xs">API Key</Label>
                            <div className="relative">
                              <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder="Paste your CoinDCX API key"
                                className="bg-white/10 border-white/20 text-white placeholder:text-indigo-300/50 pr-10"
                              />
                              <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2">
                                {showApiKey ? <EyeOff className="h-4 w-4 text-indigo-300" /> : <Eye className="h-4 w-4 text-indigo-300" />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <Label className="text-indigo-200 text-xs">API Secret</Label>
                            <div className="relative">
                              <Input
                                type={showApiSecret ? 'text' : 'password'}
                                value={apiSecret}
                                onChange={e => setApiSecret(e.target.value)}
                                placeholder="Paste your CoinDCX API secret"
                                className="bg-white/10 border-white/20 text-white placeholder:text-indigo-300/50 pr-10"
                              />
                              <button onClick={() => setShowApiSecret(!showApiSecret)} className="absolute right-2 top-1/2 -translate-y-1/2">
                                {showApiSecret ? <EyeOff className="h-4 w-4 text-indigo-300" /> : <Eye className="h-4 w-4 text-indigo-300" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-xs text-indigo-200">🔒 Your keys are stored locally in your browser only. We never send them to our servers.</p>
                          <p className="text-xs text-indigo-300 mt-1">📋 Get your API key from: <strong>coindcx.com → API Dashboard → Create New Key</strong></p>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            onClick={async () => {
                              if (!apiKey || !apiSecret) {
                                toast.error('Please enter both API Key and Secret');
                                return;
                              }
                              setApiSyncing(true);
                              setApiSyncProgress({ stage: 'Validating', detail: 'Checking credentials...', current: 0, total: 1, pctComplete: 0 });
                              const creds = { apiKey, apiSecret };
                              const validation = await validateCoinDCXCredentials(creds);
                              if (!validation.valid) {
                                toast.error(`Invalid API credentials: ${validation.error}`);
                                setApiSyncing(false);
                                setApiSyncProgress(null);
                                return;
                              }
                              saveCredentials(creds);
                              setApiConnected(true);
                              toast.success('CoinDCX connected! Starting data sync...');

                              // Auto-sync after connect
                              try {
                                const result = await fullCoinDCXSync(creds, setApiSyncProgress);
                                setApiSyncResult(result);
                                if (result.success && result.transactions.length > 0) {
                                  // The API Sync result now contains the FULL merged history from the database (V5 engine)
                                  setFyAutoDetected(false); // Reset so FY is re-detected from new data
                                  setParsedTransactions(result.transactions);

                                  if (result.tdsRecords.length > 0) {
                                    setParsedTDSRecords(result.tdsRecords);
                                  }
                                  const totalTradeRelated = (result.summary.totalSpotTrades || 0) + (result.summary.totalMarginTrades || 0) + (result.summary.totalFuturesTrades || 0);
                                  toast.success(`✅ Imported ${result.transactions.length} transactions (${totalTradeRelated} trades)! Tax will recompute automatically.`);
                                  // Show staking warning if no rewards found
                                  if (result.summary.totalRewards === 0) {
                                    toast.warning('⚠️ No staking rewards found via API. Add them manually using + Add Trade → Staking Reward.', { duration: 8000 });
                                  }
                                } else if (!result.success) {
                                  toast.error(result.error || 'Sync failed');
                                } else {
                                  toast.info('No transactions found for this account');
                                }
                              } catch (e) {
                                toast.error('Sync error: ' + (e as Error).message);
                              }
                              setApiSyncing(false);
                              setApiSyncProgress(null);
                            }}
                            disabled={apiSyncing || !apiKey || !apiSecret}
                            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg"
                          >
                            {apiSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                            {apiSyncing ? 'Connecting...' : 'Connect & Fetch All Data'}
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                          {[
                            { icon: '📈', label: 'All Trades' },
                            { icon: '🥩', label: 'Staking Rewards' },
                            { icon: '📥', label: 'Deposits' },
                            { icon: '📤', label: 'Withdrawals' },
                          ].map((f, i) => (
                            <div key={i} className="p-2 rounded-lg bg-white/5 border border-white/10">
                              <span className="text-lg">{f.icon}</span>
                              <p className="text-[10px] text-indigo-200 mt-0.5">{f.label}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Connected state */}
                        {apiSyncProgress && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-indigo-200">{apiSyncProgress.stage}: {apiSyncProgress.detail}</span>
                              <span className="text-white font-semibold">{apiSyncProgress.pctComplete}%</span>
                            </div>
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                                style={{ width: `${apiSyncProgress.pctComplete}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {apiSyncResult?.success && (
                          <div className="space-y-3">
                            {/* Stats grid with TDS and Other Income */}
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              <div className="p-2 rounded-lg bg-white/10 text-center relative group">
                                <p className="text-xl font-bold text-white">{apiSyncResult.summary.totalTrades}</p>
                                <p className="text-[10px] text-indigo-200">Trades</p>
                                {/* Tooltip for breakdown */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-32 p-2 bg-slate-900 border border-white/20 rounded shadow-xl hidden group-hover:block z-50 text-[10px] text-left">
                                  <p className="text-white border-b border-white/10 mb-1 pb-1">Breakdown:</p>
                                  <p className="flex justify-between"><span>Spot:</span> <span>{apiSyncResult.summary.totalSpotTrades || 0}</span></p>
                                  <p className="flex justify-between"><span>Margin:</span> <span>{apiSyncResult.summary.totalMarginTrades || 0}</span></p>
                                  <p className="flex justify-between"><span>Futures:</span> <span>{apiSyncResult.summary.totalFuturesTrades || 0}</span></p>
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-white/10 text-center">
                                <p className="text-xl font-bold text-white">{(apiSyncResult.summary as any).totalRewards || 0}</p>
                                <p className="text-[10px] text-indigo-200">Rewards</p>
                              </div>
                              <div className="p-2 rounded-lg bg-white/10 text-center">
                                <p className="text-xl font-bold text-white">{apiSyncResult.summary.totalDeposits}</p>
                                <p className="text-[10px] text-indigo-200">Deposits</p>
                              </div>
                              <div className="p-2 rounded-lg bg-white/10 text-center">
                                <p className="text-xl font-bold text-white">{apiSyncResult.summary.uniqueAssets.length}</p>
                                <p className="text-[10px] text-indigo-200">Assets</p>
                              </div>
                              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                                <p className="text-xl font-bold text-emerald-300">₹{Math.round(apiSyncResult.summary.computedTDSCredit).toLocaleString('en-IN')}</p>
                                <p className="text-[10px] text-emerald-200">TDS Credit</p>
                              </div>
                              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                                <p className="text-xl font-bold text-amber-300">₹{Math.round(apiSyncResult.summary.computedOtherIncome).toLocaleString('en-IN')}</p>
                                <p className="text-[10px] text-amber-200">Other Income</p>
                              </div>
                            </div>

                            {/* Missing Data Checklist - Critical items */}
                            {apiSyncResult.missingDataChecklist && apiSyncResult.missingDataChecklist.length > 0 && (
                              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 space-y-2">
                                <p className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Missing Data ({apiSyncResult.missingDataChecklist.filter(i => i.severity === 'critical').length} critical)
                                </p>
                                {apiSyncResult.missingDataChecklist.map((item, i) => (
                                  <div key={i} className={`p-2 rounded ${item.severity === 'critical' ? 'bg-red-500/15 border border-red-500/25' :
                                    item.severity === 'warning' ? 'bg-amber-500/15 border border-amber-500/25' :
                                      'bg-blue-500/10 border border-blue-500/20'
                                    }`}>
                                    <p className="text-[11px] font-semibold text-white">{item.category}</p>
                                    <p className="text-[10px] text-slate-300 mt-0.5">{item.description}</p>
                                    <p className="text-[10px] text-slate-300">
                                      Current: <span className="text-red-300 font-medium">{item.currentValue}</span> → Expected: <span className="text-emerald-300 font-medium">{item.expectedValue}</span>
                                    </p>
                                    <p className="text-[10px] text-amber-300 mt-1 font-medium">→ {item.action}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Debug: show API step results */}
                        {apiSyncResult?.warnings && apiSyncResult.warnings.length > 0 && (
                          <details className="group">
                            <summary className="text-xs font-semibold text-indigo-200 cursor-pointer hover:text-indigo-100 p-2 rounded-lg bg-white/5 border border-white/10">
                              API Sync Log ({apiSyncResult.warnings.length} entries) ▸
                            </summary>
                            <div className="p-3 rounded-b-lg bg-white/5 border border-t-0 border-white/10 space-y-1 max-h-48 overflow-y-auto">
                              {apiSyncResult.warnings.map((w, i) => (
                                <p key={i} className="text-[11px] text-indigo-300 font-mono">{w}</p>
                              ))}
                            </div>
                          </details>
                        )}

                        <div className="flex gap-3">
                          <Button
                            onClick={async () => {
                              const creds = loadCredentials();
                              if (!creds) { toast.error('No stored credentials'); return; }
                              setApiSyncing(true);
                              try {
                                const result = await fullCoinDCXSync(creds, setApiSyncProgress);
                                setApiSyncResult(result);
                                if (result.success && result.transactions.length > 0) {
                                  // The API Sync result now contains the FULL merged history from the database (V5 engine)
                                  setFyAutoDetected(false); // Reset so FY is re-detected from new data
                                  setParsedTransactions(result.transactions);

                                  if (result.tdsRecords.length > 0) {
                                    setParsedTDSRecords(result.tdsRecords);
                                  }
                                  toast.success(`✅ Re-synced ${result.summary.totalTransactions} transactions with updated rates`);
                                } else {
                                  toast.error(result.error || 'No transactions found');
                                }
                              } catch (e) {
                                toast.error('Sync error: ' + (e as Error).message);
                              }
                              setApiSyncing(false);
                              setApiSyncProgress(null);
                            }}
                            disabled={apiSyncing}
                            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                          >
                            {apiSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                            {apiSyncing ? 'Syncing...' : 'Sync Now'}
                          </Button>
                          <Button
                            variant="default"
                            onClick={() => {
                              clearCredentials();
                              setApiConnected(false);
                              setApiKey('');
                              setApiSecret('');
                              setApiSyncResult(null);
                              toast.success('CoinDCX disconnected');
                            }}
                            className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs h-10 px-4"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Disconnect
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="text-xs text-slate-400 font-medium">OR IMPORT CSV MANUALLY</span>
                  <Separator className="flex-1" />
                </div>

                {/* Exchange Selection */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-slate-900">Select Exchange</CardTitle>
                    <CardDescription>Choose your crypto exchange to import trades via CSV</CardDescription>
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

                    {/* Exchange-specific download instructions */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="font-medium text-blue-900 mb-2">📋 How to download your {selectedExchange} CSV:</p>
                      <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                        {selectedExchange === 'CoinDCX' && (
                          <>
                            <li><strong>File 1 — Order History (Required):</strong> Go to <strong>coindcx.com → Orders → Order History</strong></li>
                            <li>Click <strong>"FILLED ORDERS"</strong> tab, set dates for your FY, click <strong>"Download CSV"</strong></li>
                            <li><strong>File 2 — TDS Summary (Recommended):</strong> Go to <strong>Downloads → TDS Summary → Export CSV</strong></li>
                            <li><strong>File 3 — Insta History (If used):</strong> If you used Instant Buy/Sell, download that CSV too</li>
                            <li>Select all 3 files at once and upload — TaxMitra auto-detects each file type!</li>
                            <li className="text-amber-700 font-medium mt-2">⚠️ <strong>Missing data:</strong> Staking rewards & airdrops aren't in CSV. Use "Add Trade" → Staking Reward to add manually.</li>
                          </>
                        )}
                        {selectedExchange === 'WazirX' && (
                          <>
                            <li>Go to <strong>wazirx.com → Reports → Trading Report</strong></li>
                            <li>Select date range for the financial year</li>
                            <li>Download the <strong>Exchange Trades</strong> report</li>
                            <li>Save the XLSX as CSV (or upload directly)</li>
                            <li>Upload the CSV file here</li>
                          </>
                        )}
                        {selectedExchange === 'Binance' && (
                          <>
                            <li>Go to <strong>binance.com → Orders → Spot Order → Trade History</strong></li>
                            <li>Click <strong>"Export"</strong> and select date range</li>
                            <li>Download as CSV</li>
                            <li>Upload the CSV file here</li>
                          </>
                        )}
                        {selectedExchange === 'ZebPay' && (
                          <>
                            <li>Go to <strong>zebpay.com → Reports → Trade History</strong></li>
                            <li>Select the financial year date range</li>
                            <li>Download as CSV</li>
                            <li>Upload the CSV file here</li>
                          </>
                        )}
                      </ol>
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
                              { step: "Step 2", text: "Go to 'Orders' → 'Trade History' → Download CSV" },
                              { step: "Step 3", text: "Go to 'Downloads' → 'TDS Summary' → Export CSV" },
                              { step: "Step 4", text: "If you used Instant Buy/Sell, download Insta CSV too" },
                              { step: "Step 5", text: "Upload all files at once — we auto-detect types!" },
                              { step: "Step 6", text: "Click 'Add Trade' → Staking Reward for missing data" },
                              { step: "Step 7", text: "Check your email for 'CoinDCX reward' notifications" }
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
                trades={filteredTrades}
                portfolio={null}
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
    if (!taxComputation) { toast.error('No tax computation available. Import your CSV first.'); return; }
    setGenerating('vda');
    try {
      const csv = generateScheduleVDACSV(taxComputation);
      const filename = `Schedule_VDA_${selectedFY || 'unknown'}.csv`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Schedule VDA CSV downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadTDS = async () => {
    if (!taxComputation) { toast.error('No tax computation available. Import your CSV first.'); return; }
    setGenerating('tds');
    try {
      const csv = generateTDSReconciliationCSV(taxComputation);
      const filename = `TDS_Reconciliation_${selectedFY || 'unknown'}.csv`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('TDS Reconciliation CSV downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setGenerating(null);
    }
  };

  // Preview Data Source: TaxComputation engine output (single source of truth)
  const taxableGains = taxComputation?.taxableCapitalGains ?? 0;
  const totalLosses = taxComputation?.grossCapitalLosses ?? 0;
  const totalTax = taxComputation?.totalTaxLiability ?? 0;
  const tdsPaid = taxComputation?.totalTDSCredit ?? 0;
  const netTax = taxComputation?.netTaxPayable ?? Math.max(0, totalTax - tdsPaid);

  // BUG FIX: sellCount must be number of SELL TRANSACTIONS (VDA report lines), NOT total token quantity sold.
  // totalSold is the sum of token quantities (e.g. 91,828 ADA tokens) — completely wrong for "Number of Transfers".
  // totalVDAEntries = number of Schedule VDA rows = number of sell events = matches KoinX's "73 transfers".
  const sellCount = taxComputation?.totalVDAEntries ?? trades.filter(t => t.trade_type === 'sell').length;

  // BUG FIX: buyVolume must be cost of acquisition for SOLD assets only (from FIFO lot matches).
  // totalBuyValueInr includes ALL buys (even unsold inventory) — massively overstated.
  // totalCostOfAcquisitionInr is the correct FIFO-matched cost for sold assets only.
  const buyVolume = taxComputation?.totalCostOfAcquisitionInr ?? trades.filter(t => t.trade_type === 'buy').reduce((s, t) => s + t.quantity * t.buy_price, 0);

  // sellVolume: totalConsiderationInr = sum of sell proceeds from engine (correct)
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
                          <td className="p-2 font-medium border">{t.assetSymbol ?? t.asset}</td>
                          <td className="p-2 text-right text-emerald-600 border">{formatCurrency(t.grossGains ?? t.gains ?? 0)}</td>
                          <td className="p-2 text-right text-red-600 border">{(t.grossLosses ?? t.losses ?? 0) > 0 ? formatCurrency(t.grossLosses ?? t.losses) : '₹0'}</td>
                          <td className={`p-2 text-right font-bold border ${((t.grossGains ?? t.gains ?? 0) - (t.grossLosses ?? t.losses ?? 0)) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatCurrency((t.grossGains ?? t.gains ?? 0) - (t.grossLosses ?? t.losses ?? 0))}
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
