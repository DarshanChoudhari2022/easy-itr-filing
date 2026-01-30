import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, TrendingUp, Check, ArrowRight, RefreshCw, Sparkles, Calculator } from "lucide-react";
import { toast } from "sonner";
import { AssessmentYear, DEFAULT_AY, YEAR_CONFIGS } from "@/lib/tax-config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateTax as calculateTaxEngine } from "@/lib/tax-calculation";

interface TaxSummary {
  id: string;
  total_income: number;
  total_deductions: number;
  taxable_income_old: number;
  taxable_income_new: number;
  tax_old_regime: number;
  tax_new_regime: number;
  tds_total: number;
  suggested_regime: "old" | "new" | null;
  calculated_at: string | null;
}

// 2026-27 Tax Slabs
const OLD_REGIME_SLABS = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 5 },
  { min: 500000, max: 1000000, rate: 20 },
  { min: 1000000, max: Infinity, rate: 30 },
];

const NEW_REGIME_SLABS = [
  { min: 0, max: 300000, rate: 0 },
  { min: 300000, max: 700000, rate: 5 },
  { min: 700000, max: 1000000, rate: 10 },
  { min: 1000000, max: 1200000, rate: 15 },
  { min: 1200000, max: 1500000, rate: 20 },
  { min: 1500000, max: Infinity, rate: 30 },
];

// Standard deduction (New Regime)
const STANDARD_DEDUCTION_NEW = 75000;

export default function Optimizer() {
  const { user } = useAuth();
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [assessmentYear, setAssessmentYear] = useState<AssessmentYear>(DEFAULT_AY);

  useEffect(() => {
    if (user) {
      fetchTaxSummary();
    }
  }, [user]);

  const fetchTaxSummary = async () => {
    try {
      const { data, error } = await supabase
        .from("tax_summaries")
        .select("*")
        .eq("user_id", user!.id)
        .eq("assessment_year", assessmentYear)
        .maybeSingle();

      if (error) throw error;
      setTaxSummary(data);
    } catch (error) {
      console.error("Error fetching tax summary:", error);
    } finally {
      setLoading(false);
    }
  };

  // We will use the calculateTaxEngine from lib/tax-calculation instead of a local one

  const recalculateTax = async () => {
    setCalculating(true);
    try {
      // Fetch all income sources
      const { data: incomeSources } = await supabase
        .from("income_sources")
        .select("*")
        .eq("user_id", user!.id);

      // Fetch all deductions
      const { data: deductions } = await supabase
        .from("deductions")
        .select("*")
        .eq("user_id", user!.id);

      // Fetch crypto trades
      const { data: cryptoTrades } = await supabase
        .from("crypto_trades")
        .select("*")
        .eq("user_id", user!.id);

      // Calculate totals
      const totalIncome = (incomeSources || []).reduce((sum, s) => sum + Number(s.amount), 0);
      const totalDeductions = (deductions || []).reduce((sum, d) => sum + Number(d.amount), 0);
      const totalTds = (incomeSources || []).reduce((sum, s) => sum + Number(s.tds_deducted || 0), 0) +
        (cryptoTrades || []).reduce((sum, t) => sum + Number(t.tds_paid || 0), 0);

      // Use the engine for both regimes
      const resultOld = calculateTaxEngine({
        salary: totalIncome,
        deductions: { section80C: totalDeductions }, // Simplified mapping
        regime: "old",
        assessmentYear: assessmentYear
      });

      const resultNew = calculateTaxEngine({
        salary: totalIncome,
        regime: "new",
        assessmentYear: assessmentYear
      });

      // Determine suggested regime
      const suggestedRegime = resultOld.finalTax <= resultNew.finalTax ? "old" : "new";

      // Upsert tax summary
      const { data, error } = await supabase
        .from("tax_summaries")
        .upsert([{
          user_id: user!.id,
          assessment_year: assessmentYear,
          total_income: totalIncome,
          total_deductions: totalDeductions,
          taxable_income_old: resultOld.taxableIncome,
          taxable_income_new: resultNew.taxableIncome,
          tax_old_regime: Math.round(resultOld.finalTax),
          tax_new_regime: Math.round(resultNew.finalTax),
          tds_total: totalTds,
          suggested_regime: suggestedRegime as "old" | "new",
          calculated_at: new Date().toISOString(),
        }], { onConflict: "user_id,assessment_year" })
        .select()
        .single();

      if (error) throw error;

      setTaxSummary(data as TaxSummary);
      toast.success("Tax calculation updated!");
    } catch (error) {
      console.error("Error calculating tax:", error);
      toast.error(error instanceof Error ? error.message : "Failed to calculate tax");
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const savings = taxSummary
    ? Math.abs(taxSummary.tax_old_regime - taxSummary.tax_new_regime)
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-8 w-8 text-indigo-600" />
              Tax Regime Battleground
            </h1>
            <p className="text-muted-foreground">
              Compare Old vs New regime for AY {assessmentYear}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={assessmentYear} onValueChange={(v: AssessmentYear) => setAssessmentYear(v)}>
              <SelectTrigger className="w-[140px] border-indigo-100 font-bold text-indigo-700">
                <SelectValue placeholder="Select AY" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024-25">AY 2024-25</SelectItem>
                <SelectItem value="2025-26">AY 2025-26</SelectItem>
                <SelectItem value="2026-27">AY 2026-27</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={recalculateTax} disabled={calculating}>
              {calculating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Recalculate
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !taxSummary || taxSummary.total_income === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-xl mb-2">No tax data available</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Add your income sources and deductions first, then click Recalculate to see your tax comparison.
                </p>
                <Button onClick={recalculateTax} disabled={calculating}>
                  {calculating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Calculate My Tax
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Row */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Income
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(taxSummary.total_income)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Deductions (Old Regime)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(taxSummary.total_deductions)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    TDS Already Paid
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-accent">{formatCurrency(taxSummary.tds_total)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Regime Comparison */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Old Regime */}
              <Card className={`relative ${taxSummary.suggested_regime === "old" ? "border-accent border-2" : ""}`}>
                {taxSummary.suggested_regime === "old" && (
                  <div className="absolute -top-3 left-4">
                    <Badge className="bg-accent text-accent-foreground gap-1">
                      <Sparkles className="h-3 w-3" />
                      Maximum Savings
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Old Tax Regime
                    {taxSummary.suggested_regime === "old" && (
                      <Check className="h-5 w-5 text-accent" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    Higher rates but with deductions like 80C, 80D, HRA
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Income</span>
                      <span>{formatCurrency(taxSummary.total_income)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Deductions</span>
                      <span className="text-accent">- {formatCurrency(taxSummary.total_deductions)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-medium">
                      <span>Taxable Income</span>
                      <span>{formatCurrency(taxSummary.taxable_income_old)}</span>
                    </div>
                  </div>

                  <div className="text-center p-4 rounded-lg bg-primary/5">
                    <p className="text-sm text-muted-foreground mb-1">Total Tax</p>
                    <p className="text-4xl font-bold">{formatCurrency(taxSummary.tax_old_regime)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Including 4% cess</p>
                  </div>

                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Tax Slabs (Old Regime):</p>
                    <div className="grid grid-cols-2 gap-x-4 text-muted-foreground">
                      <span>Up to ₹2.5L</span><span>0%</span>
                      <span>₹2.5L - ₹5L</span><span>5%</span>
                      <span>₹5L - ₹10L</span><span>20%</span>
                      <span>Above ₹10L</span><span>30%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* New Regime */}
              <Card className={`relative ${taxSummary.suggested_regime === "new" ? "border-accent border-2" : ""}`}>
                {taxSummary.suggested_regime === "new" && (
                  <div className="absolute -top-3 left-4">
                    <Badge className="bg-accent text-accent-foreground gap-1">
                      <Sparkles className="h-3 w-3" />
                      Maximum Savings
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    New Tax Regime
                    {taxSummary.suggested_regime === "new" && (
                      <Check className="h-5 w-5 text-accent" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    Lower rates, only ₹75,000 standard deduction
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gross Income</span>
                      <span>{formatCurrency(taxSummary.total_income)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Standard Deduction</span>
                      <span className="text-accent">- {formatCurrency(STANDARD_DEDUCTION_NEW)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-medium">
                      <span>Taxable Income</span>
                      <span>{formatCurrency(taxSummary.taxable_income_new)}</span>
                    </div>
                  </div>

                  <div className="text-center p-4 rounded-lg bg-primary/5">
                    <p className="text-sm text-muted-foreground mb-1">Total Tax</p>
                    <p className="text-4xl font-bold">{formatCurrency(taxSummary.tax_new_regime)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Including 4% cess</p>
                  </div>

                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Tax Slabs (New Regime 2026):</p>
                    <div className="grid grid-cols-2 gap-x-4 text-muted-foreground">
                      <span>Up to ₹3L</span><span>0%</span>
                      <span>₹3L - ₹7L</span><span>5%</span>
                      <span>₹7L - ₹10L</span><span>10%</span>
                      <span>₹10L - ₹12L</span><span>15%</span>
                      <span>₹12L - ₹15L</span><span>20%</span>
                      <span>Above ₹15L</span><span>30%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Savings Highlight */}
            <Card className="bg-gradient-to-r from-accent/10 to-accent/5 border-accent/30">
              <CardContent className="py-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-accent/20 flex items-center justify-center">
                      <TrendingUp className="h-7 w-7 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">You save with {taxSummary.suggested_regime === "old" ? "Old" : "New"} Regime</p>
                      <p className="text-3xl font-bold text-accent">{formatCurrency(savings)}</p>
                    </div>
                  </div>
                  <Button asChild>
                    <a href="/efile">
                      Proceed to E-File <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Last Calculated */}
            {taxSummary.calculated_at && (
              <p className="text-center text-sm text-muted-foreground">
                Last calculated: {new Date(taxSummary.calculated_at).toLocaleString("en-IN")}
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
