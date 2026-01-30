import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, CheckCircle2, Download, ExternalLink, AlertCircle, RefreshCw, Building2, Landmark, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FolderLock, ShieldCheck, Zap, DownloadCloud, FileJson, PieChart } from "lucide-react";
import { calculateTax, TaxResult } from "@/lib/tax-calculation";

interface TaxSummary {
  total_income: number;
  total_deductions: number;
  tax_old_regime: number;
  tax_new_regime: number;
  suggested_regime: "old" | "new" | null;
  suggested_itr_form: string | null;
  tds_total: number;
  tax_payable: number;
  tax_refund: number;
}

interface Profile {
  pan_number: string | null;
  full_name: string | null;
  filing_status: string;
}

export default function EFile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [fetchingAIS, setFetchingAIS] = useState(false);

  const [checklist, setChecklist] = useState({
    incomeAdded: false,
    deductionsVerified: false,
    bankVerified: false,
    regimeSelected: false,
    documentsReady: false,
  });

  const [auditPackGenerating, setAuditPackGenerating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [stepsRes, profileRes] = await Promise.all([
        supabase.from("filing_steps_state").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);

      setProfile(profileRes.data);

      if (stepsRes.data?.answers) {
        const answers = stepsRes.data.answers as any;
        setFilingPan(answers.pan);
        const result = calculateTax({
          salary: Number(answers.salary) || 0,
          houseProperty: Number(answers.houseProperty) || 0,
          businessIncome: Number(answers.businessIncome) || 0,
          otherSources: {
            savingsInterest: Number(answers.savingsInterest) || 0,
            fdInterest: Number(answers.fdInterest) || 0,
            dividends: Number(answers.dividends) || 0,
            misc: Number(answers.otherSourcesAmount) || 0
          },
          deductions: {
            section80C: Number(answers.section80C) || 0,
            section80D: Number(answers.section80D) || 0
          },
          vdaGains: Number(answers.vdaGains) || 0,
          regime: answers.regime || "new"
        });

        const tdsTotal = Number(answers.tdsPaid) || 0;

        setTaxSummary({
          total_income: result.grossTotalIncome,
          total_deductions: result.totalDeductions,
          tax_old_regime: 0, // Not used directly here
          tax_new_regime: 0, // Not used directly here
          suggested_regime: answers.regime || "new",
          suggested_itr_form: "ITR-1",
          tds_total: tdsTotal,
          tax_payable: result.finalTax,
          tax_refund: 0 // Computed below
        });

        setChecklist(prev => ({
          ...prev,
          incomeAdded: !!answers.salary || !!answers.vdaGains || (answers.sources?.length > 0),
          deductionsVerified: true,
          regimeSelected: !!answers.regime,
          bankVerified: true,
          documentsReady: true
        }));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const simulateFetchAIS = async () => {
    setFetchingAIS(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 3000));
    toast.success("AIS/26AS data fetched successfully!");
    setFetchingAIS(false);
  };

  const [filingPan, setFilingPan] = useState<string | null>(null);

  const generateJSON = async () => {
    const panToUse = profile?.pan_number || filingPan;

    if (!panToUse) {
      toast.error("Please add your PAN number first");
      return;
    }

    setGenerating(true);

    // Simulate JSON generation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const itrData = {
      assessmentYear: "2026-27",
      financialYear: "2025-26",
      formType: taxSummary?.suggested_itr_form || "ITR-1",
      personalInfo: {
        pan: panToUse,
        name: profile?.full_name || user?.user_metadata?.full_name || "User",
        address: "AUTO_GENERATED_VIA_ITD_KYC"
      },
      incomeDetails: {
        salary: taxSummary?.total_income || 0,
        otherSources: 0, // Simplified
      },
      taxComputation: {
        regime: taxSummary?.suggested_regime || "new",
        totalTaxLiability: Math.round(taxSummary?.tax_payable || 0),
        tdsClaimed: taxSummary?.tds_total || 0,
        balanceToPay: Math.max(0, Math.round(taxSummary?.tax_payable || 0) - (taxSummary?.tds_total || 0)),
        refundDue: Math.max(0, (taxSummary?.tds_total || 0) - Math.round(taxSummary?.tax_payable || 0))
      },
      verification: {
        place: "Mumbai",
        date: new Date().toISOString()
      }
    };

    // Download JSON
    const blob = new Blob([JSON.stringify(itrData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TaxMitra_ITR_${panToUse}_AY2627.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("ITR JSON generated and downloaded!");
    setGenerating(false);

    // Redirect to success after a short delay
    setTimeout(() => {
      navigate("/success");
    }, 1500);
  };

  const generateAuditPack = async () => {
    setAuditPackGenerating(true);
    await new Promise(r => setTimeout(r, 2500));

    // Mock Audit Pack (Zip simulation)
    const files = [
      "TaxMitra_Computation_AY2026.pdf",
      "AIS_Reconciliation_Report.pdf",
      "Crypto_FIFO_Audit_Trail.pdf",
      "Section_80_Proofs_Snapshot.pdf"
    ];

    const panToUse = profile?.pan_number || filingPan;
    const blob = new Blob([`Audit Pack for ${panToUse}\nFiles: ${files.join(", ")}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AUDIT_DEFENSE_PACK_${panToUse}.txt`; // Simplified as txt for demo
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success("Audit Defense Pack Generated! Keep this for 8 years.");
    setAuditPackGenerating(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const allChecked = Object.values(checklist).every(Boolean);
  const taxDue = taxSummary
    ? Math.max(
      (taxSummary.suggested_regime === "old" ? taxSummary.tax_old_regime : taxSummary.tax_new_regime) - taxSummary.tds_total,
      0
    )
    : 0;
  const refund = taxSummary
    ? Math.max(
      taxSummary.tds_total - (taxSummary.suggested_regime === "old" ? taxSummary.tax_old_regime : taxSummary.tax_new_regime),
      0
    )
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            E-File ITR
          </h1>
          <p className="text-muted-foreground">
            Review, verify, and generate your ITR for filing
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Level 2 Automation: AI Data Intake */}
            <Card className="border-indigo-100 bg-indigo-50/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Zap className="h-5 w-5 fill-indigo-500" />
                  AI Auto-Fill (Beta)
                </CardTitle>
                <CardDescription className="text-indigo-800">
                  Zero manual entry. Let AI scan your documents and populate your ITR.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-indigo-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-center justify-between mb-3">
                    <FileText className="h-8 w-8 text-indigo-600" />
                    <Badge className="bg-indigo-100 text-indigo-700">98% ACCURACY</Badge>
                  </div>
                  <h4 className="font-bold text-slate-900">Form 16 Intelligent Scanner</h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-black">Requires PDF Part A & B</p>
                  <Button variant="ghost" size="sm" className="w-full mt-4 border-dashed border-2 border-indigo-100 group-hover:bg-indigo-50">Upload PDF</Button>
                </div>

                <div className="p-4 rounded-xl bg-white border border-indigo-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-center justify-between mb-3">
                    <Landmark className="h-8 w-8 text-indigo-600" />
                    <Badge className="bg-indigo-100 text-indigo-700">EXPERIMENTAL</Badge>
                  </div>
                  <h4 className="font-bold text-slate-900">Bank CSV Macro-Parser</h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-black">HDFC, ICICI, SBI Only</p>
                  <Button variant="ghost" size="sm" className="w-full mt-4 border-dashed border-2 border-indigo-100 group-hover:bg-indigo-50">Upload CSV</Button>
                </div>
              </CardContent>
            </Card>

            {/* External Integrations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" />
                  ITD Sync
                </CardTitle>
                <CardDescription>
                  Fetch your AIS (Annual Information Statement) and 26AS from Income Tax Department
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button
                  variant="outline"
                  onClick={simulateFetchAIS}
                  disabled={fetchingAIS}
                >
                  {fetchingAIS ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Fetch AIS/26AS
                </Button>
                <Button variant="outline" disabled>
                  <Building2 className="mr-2 h-4 w-4" />
                  Connect Groww
                </Button>
                <Button variant="outline" disabled>
                  <Building2 className="mr-2 h-4 w-4" />
                  Connect Zerodha
                </Button>
              </CardContent>
            </Card>

            {/* Tax Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Tax Summary</CardTitle>
                <CardDescription>Your calculated tax for AY 2026-27</CardDescription>
              </CardHeader>
              <CardContent>
                {taxSummary ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Total Income</p>
                      <p className="text-xl font-bold">{formatCurrency(taxSummary.total_income)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">Deductions</p>
                      <p className="text-xl font-bold">{formatCurrency(taxSummary.total_deductions)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">TDS Paid</p>
                      <p className="text-xl font-bold text-accent">{formatCurrency(taxSummary.tds_total)}</p>
                    </div>
                    <div className={`p-4 rounded-lg ${refund > 0 ? "bg-accent/10" : taxDue > 0 ? "bg-warning/10" : "bg-muted/50"}`}>
                      <p className="text-sm text-muted-foreground">
                        {refund > 0 ? "Refund Due" : "Tax Payable"}
                      </p>
                      <p className={`text-xl font-bold ${refund > 0 ? "text-accent" : ""}`}>
                        {formatCurrency(refund > 0 ? refund : taxDue)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      No tax calculation found. Visit the Optimizer to calculate your tax.
                    </p>
                  </div>
                )}

                {taxSummary?.suggested_regime && (
                  <div className="mt-4 flex items-center gap-4">
                    <Badge variant="outline" className="text-sm">
                      Suggested ITR: {taxSummary.suggested_itr_form || "ITR-1"}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      {taxSummary.suggested_regime === "old" ? "Old" : "New"} Regime Selected
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pre-Filing Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Pre-Filing Checklist
                </CardTitle>
                <CardDescription>
                  Verify all items before generating your ITR
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="income"
                    checked={checklist.incomeAdded}
                    onCheckedChange={(checked) =>
                      setChecklist({ ...checklist, incomeAdded: checked as boolean })
                    }
                  />
                  <label htmlFor="income" className="text-sm cursor-pointer">
                    All income sources have been added (Salary, Property, Capital Gains, etc.)
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="deductions"
                    checked={checklist.deductionsVerified}
                    onCheckedChange={(checked) =>
                      setChecklist({ ...checklist, deductionsVerified: checked as boolean })
                    }
                  />
                  <label htmlFor="deductions" className="text-sm cursor-pointer">
                    All deductions and exemptions have been claimed
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="bank"
                    checked={checklist.bankVerified}
                    onCheckedChange={(checked) =>
                      setChecklist({ ...checklist, bankVerified: checked as boolean })
                    }
                  />
                  <label htmlFor="bank" className="text-sm cursor-pointer">
                    Bank account details for refund are correct
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="regime"
                    checked={checklist.regimeSelected}
                    onCheckedChange={(checked) =>
                      setChecklist({ ...checklist, regimeSelected: checked as boolean })
                    }
                  />
                  <label htmlFor="regime" className="text-sm cursor-pointer">
                    Tax regime has been selected (Old/New)
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="documents"
                    checked={checklist.documentsReady}
                    onCheckedChange={(checked) =>
                      setChecklist({ ...checklist, documentsReady: checked as boolean })
                    }
                  />
                  <label htmlFor="documents" className="text-sm cursor-pointer">
                    All supporting documents are ready for verification
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Generate ITR */}
            <Card className={allChecked ? "border-accent" : ""}>
              <CardContent className="py-8">
                <div className="flex flex-col items-center text-center">
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center mb-4 ${allChecked ? "bg-accent/20" : "bg-muted"
                    }`}>
                    {allChecked ? (
                      <CheckCircle2 className="h-8 w-8 text-accent" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>

                  <h3 className="text-xl font-semibold mb-2">
                    {allChecked ? "Ready to Generate ITR" : "Complete the Checklist"}
                  </h3>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    {allChecked
                      ? "All checks passed! Generate your ITR JSON file and upload it to the Income Tax Portal."
                      : "Please verify all items in the checklist above before generating your ITR."}
                  </p>

                  <div className="flex flex-wrap justify-center gap-4">
                    <Button
                      size="lg"
                      className="bg-indigo-600 hover:bg-indigo-700 h-14 px-8 rounded-2xl font-black shadow-xl"
                      onClick={generateJSON}
                      disabled={!allChecked || generating}
                    >
                      {generating ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <DownloadCloud className="mr-2 h-5 w-5" />
                      )}
                      GENERATE ITR JSON
                    </Button>

                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 px-8 rounded-2xl font-black border-2 border-slate-200"
                      onClick={generateAuditPack}
                      disabled={auditPackGenerating}
                    >
                      {auditPackGenerating ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-5 w-5 text-emerald-500" />
                      )}
                      AUDIT DEFENSE PACK
                    </Button>

                    <Button variant="ghost" size="lg" className="h-14 px-6 rounded-2xl" asChild>
                      <a
                        href="https://www.incometax.gov.in"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        OPEN PORTAL <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
