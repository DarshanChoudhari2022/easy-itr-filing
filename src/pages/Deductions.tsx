import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Receipt, AlertCircle, Loader2, CheckCircle2, Info } from "lucide-react";

type DeductionSection = "section_80c" | "section_80d" | "section_80e" | "section_80g" | "section_80tta" | "section_80ttb" | "hra" | "lta" | "other";

interface Deduction {
  id: string;
  section: DeductionSection;
  description: string | null;
  amount: number;
}

interface SectionConfig {
  value: DeductionSection;
  label: string;
  limit: number | null;
  description: string;
  examples: string;
}

const deductionSections: SectionConfig[] = [
  {
    value: "section_80c",
    label: "Section 80C",
    limit: 150000,
    description: "Investments & Savings",
    examples: "PPF, ELSS, LIC, EPF, Tuition fees",
  },
  {
    value: "section_80d",
    label: "Section 80D",
    limit: 75000,
    description: "Health Insurance",
    examples: "Self, family & parents health insurance",
  },
  {
    value: "section_80e",
    label: "Section 80E",
    limit: null,
    description: "Education Loan Interest",
    examples: "Interest on higher education loans",
  },
  {
    value: "section_80g",
    label: "Section 80G",
    limit: null,
    description: "Donations",
    examples: "Charitable donations (50-100% deductible)",
  },
  {
    value: "section_80tta",
    label: "Section 80TTA",
    limit: 10000,
    description: "Savings Interest",
    examples: "Interest from savings accounts",
  },
  {
    value: "section_80ttb",
    label: "Section 80TTB",
    limit: 50000,
    description: "Senior Citizen Interest",
    examples: "Interest income for seniors (60+)",
  },
  {
    value: "hra",
    label: "HRA",
    limit: null,
    description: "House Rent Allowance",
    examples: "Rent paid if HRA component in salary",
  },
  {
    value: "lta",
    label: "LTA",
    limit: null,
    description: "Leave Travel Allowance",
    examples: "Domestic travel expenses",
  },
  {
    value: "other",
    label: "Other Deductions",
    limit: null,
    description: "Other Eligible Deductions",
    examples: "NPS (80CCD), etc.",
  },
];

export default function Deductions() {
  const { user } = useAuth();
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newDeduction, setNewDeduction] = useState({
    section: "section_80c" as DeductionSection,
    description: "",
    amount: "",
  });

  useEffect(() => {
    if (user) {
      fetchDeductions();
    }
  }, [user]);

  const fetchDeductions = async () => {
    try {
      const { data, error } = await supabase
        .from("deductions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDeductions(data || []);
    } catch (error) {
      console.error("Error fetching deductions:", error);
      toast.error("Failed to load deductions");
    } finally {
      setLoading(false);
    }
  };

  const addDeduction = async () => {
    if (!newDeduction.amount || parseFloat(newDeduction.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("deductions").insert({
        user_id: user!.id,
        section: newDeduction.section,
        description: newDeduction.description || null,
        amount: parseFloat(newDeduction.amount),
      });

      if (error) throw error;

      toast.success("Deduction added");
      setDialogOpen(false);
      setNewDeduction({ section: "section_80c", description: "", amount: "" });
      fetchDeductions();
    } catch (error) {
      console.error("Error adding deduction:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add deduction");
    } finally {
      setSaving(false);
    }
  };

  const deleteDeduction = async (id: string) => {
    try {
      const { error } = await supabase.from("deductions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deduction deleted");
      fetchDeductions();
    } catch (error) {
      console.error("Error deleting deduction:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete deduction");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate section-wise totals
  const getSectionTotal = (section: DeductionSection) => {
    return deductions
      .filter((d) => d.section === section)
      .reduce((sum, d) => sum + d.amount, 0);
  };

  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

  const getSectionConfig = (section: DeductionSection) => {
    return deductionSections.find((s) => s.value === section);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-8 w-8" />
              Deductions
            </h1>
            <p className="text-muted-foreground">
              Claim eligible deductions to reduce your taxable income (Old Regime)
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Deduction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Deduction</DialogTitle>
                <DialogDescription>
                  Enter your deduction details
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select
                    value={newDeduction.section}
                    onValueChange={(value: DeductionSection) =>
                      setNewDeduction({ ...newDeduction, section: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {deductionSections.map((section) => (
                        <SelectItem key={section.value} value={section.value}>
                          <div>
                            <span className="font-medium">{section.label}</span>
                            <span className="text-muted-foreground ml-2">
                              - {section.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {getSectionConfig(newDeduction.section) && (
                    <p className="text-xs text-muted-foreground">
                      Examples: {getSectionConfig(newDeduction.section)?.examples}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g., PPF Investment, LIC Premium"
                    value={newDeduction.description}
                    onChange={(e) =>
                      setNewDeduction({ ...newDeduction, description: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newDeduction.amount}
                    onChange={(e) =>
                      setNewDeduction({ ...newDeduction, amount: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={addDeduction} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add Deduction
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Info Banner */}
        <Card className="border-info bg-info/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Deductions apply only in Old Tax Regime</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The New Regime offers lower tax rates but doesn't allow most deductions.
                  Compare both regimes in the Optimizer to find your best option.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Deductions Claimed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-accent">{formatCurrency(totalDeductions)}</p>
          </CardContent>
        </Card>

        {/* Section-wise Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {deductionSections.map((section) => {
            const total = getSectionTotal(section.value);
            const used = section.limit ? Math.min(total, section.limit) : total;
            const percentage = section.limit ? (total / section.limit) * 100 : 0;
            const exceeded = section.limit && total > section.limit;
            const deductionCount = deductions.filter((d) => d.section === section.value).length;

            return (
              <Card
                key={section.value}
                className={exceeded ? "border-warning" : total > 0 ? "border-accent" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{section.label}</CardTitle>
                    {total > 0 && (
                      <Badge variant={exceeded ? "destructive" : "default"}>
                        {deductionCount} item{deductionCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{formatCurrency(total)}</span>
                      {section.limit && (
                        <span className="text-sm text-muted-foreground">
                          / {formatCurrency(section.limit)}
                        </span>
                      )}
                    </div>

                    {section.limit && (
                      <div className="space-y-1">
                        <Progress
                          value={Math.min(percentage, 100)}
                          className={exceeded ? "[&>div]:bg-warning" : ""}
                        />
                        {exceeded && (
                          <div className="flex items-center gap-1 text-xs text-warning">
                            <AlertCircle className="h-3 w-3" />
                            Exceeds limit by {formatCurrency(total - section.limit)}
                          </div>
                        )}
                        {!exceeded && total > 0 && (
                          <div className="flex items-center gap-1 text-xs text-accent">
                            <CheckCircle2 className="h-3 w-3" />
                            {formatCurrency(section.limit - total)} available
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">{section.examples}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Deductions List */}
        <Card>
          <CardHeader>
            <CardTitle>All Deductions</CardTitle>
            <CardDescription>
              {deductions.length} deduction{deductions.length !== 1 ? "s" : ""} added
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : deductions.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg mb-1">No deductions yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add your investments and expenses to claim deductions
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Deduction
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {deductions.map((deduction) => {
                  const config = getSectionConfig(deduction.section);
                  return (
                    <div
                      key={deduction.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{config?.label}</Badge>
                        <span>{deduction.description || config?.description}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatCurrency(deduction.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteDeduction(deduction.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
