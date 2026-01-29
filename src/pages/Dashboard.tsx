import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  Bitcoin,
  Receipt,
  BarChart3,
  FileText,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface TaxSummary {
  total_income: number;
  total_deductions: number;
  tax_old_regime: number;
  tax_new_regime: number;
  suggested_regime: string;
  tds_total: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      setProfile(profileData);

      // Fetch tax summary
      const { data: summaryData } = await supabase
        .from("tax_summaries")
        .select("*")
        .eq("user_id", user!.id)
        .eq("assessment_year", "2026-27")
        .maybeSingle();

      setTaxSummary(summaryData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getFilingStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      not_started: { variant: "secondary", icon: Clock },
      in_progress: { variant: "default", icon: Clock },
      submitted: { variant: "outline", icon: CheckCircle2 },
      processed: { variant: "default", icon: CheckCircle2 },
      rejected: { variant: "destructive", icon: AlertCircle },
    };
    
    const config = statusConfig[status] || statusConfig.not_started;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const quickActions = [
    {
      title: "Talk to Tax Guru",
      description: "Get AI-powered guidance for your filing",
      icon: MessageSquare,
      href: "/tax-guru",
      color: "bg-accent text-accent-foreground",
    },
    {
      title: "Add Income",
      description: "Salary, property, capital gains",
      icon: Wallet,
      href: "/income",
      color: "bg-info text-info-foreground",
    },
    {
      title: "Crypto Trades",
      description: "Import from CoinDCX, Binance",
      icon: Bitcoin,
      href: "/crypto",
      color: "bg-warning text-warning-foreground",
    },
    {
      title: "Claim Deductions",
      description: "80C, 80D, HRA and more",
      icon: Receipt,
      href: "/deductions",
      color: "bg-primary text-primary-foreground",
    },
  ];

  const filingProgress = profile?.filing_status === "not_started" ? 0 :
                         profile?.filing_status === "in_progress" ? 50 :
                         profile?.filing_status === "submitted" ? 75 : 100;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Assessment Year 2026-27 • Welcome back, {profile?.full_name || user?.email?.split("@")[0]}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {getFilingStatusBadge(profile?.filing_status || "not_started")}
            <Button asChild>
              <Link to="/efile">
                Continue Filing <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Filing Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Filing Progress</CardTitle>
            <CardDescription>Complete all sections to file your ITR</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span className="font-medium">{filingProgress}%</span>
              </div>
              <Progress value={filingProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Tax Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {taxSummary ? formatCurrency(taxSummary.total_income) : "₹0"}
              </div>
              <p className="text-xs text-muted-foreground">
                All income sources combined
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deductions</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {taxSummary ? formatCurrency(taxSummary.total_deductions) : "₹0"}
              </div>
              <p className="text-xs text-muted-foreground">
                80C, 80D, HRA, etc.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TDS Paid</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {taxSummary ? formatCurrency(taxSummary.tds_total) : "₹0"}
              </div>
              <p className="text-xs text-muted-foreground">
                Already deducted at source
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estimated Tax</CardTitle>
              <BarChart3 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                {taxSummary 
                  ? formatCurrency(Math.min(taxSummary.tax_old_regime, taxSummary.tax_new_regime))
                  : "₹0"
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {taxSummary?.suggested_regime 
                  ? `Best with ${taxSummary.suggested_regime} regime`
                  : "Complete data to calculate"
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link key={action.title} to={action.href}>
                <Card className="card-hover h-full">
                  <CardContent className="p-6">
                    <div className={`h-12 w-12 rounded-lg ${action.color} flex items-center justify-center mb-4`}>
                      <action.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold mb-1">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Regime Comparison Preview */}
        {taxSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Tax Regime Comparison
              </CardTitle>
              <CardDescription>
                See which tax regime saves you more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`p-4 rounded-lg border ${taxSummary.suggested_regime === "old" ? "border-accent bg-accent/5" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Old Regime</h4>
                    {taxSummary.suggested_regime === "old" && (
                      <Badge className="bg-accent text-accent-foreground">Recommended</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(taxSummary.tax_old_regime)}</p>
                  <p className="text-sm text-muted-foreground">With all deductions</p>
                </div>
                
                <div className={`p-4 rounded-lg border ${taxSummary.suggested_regime === "new" ? "border-accent bg-accent/5" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">New Regime</h4>
                    {taxSummary.suggested_regime === "new" && (
                      <Badge className="bg-accent text-accent-foreground">Recommended</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(taxSummary.tax_new_regime)}</p>
                  <p className="text-sm text-muted-foreground">Lower rates, fewer deductions</p>
                </div>
              </div>
              
              <div className="mt-4 text-center">
                <Button variant="outline" asChild>
                  <Link to="/optimizer">
                    View Detailed Comparison <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
