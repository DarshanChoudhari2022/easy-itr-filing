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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Wallet, Building2, TrendingUp, Briefcase, PiggyBank, Loader2 } from "lucide-react";

type IncomeSourceType = "salary" | "house_property" | "capital_gains_equity" | "capital_gains_debt" | "capital_gains_property" | "business_professional" | "other_sources";

interface IncomeSource {
  id: string;
  source_type: IncomeSourceType;
  description: string | null;
  employer_name: string | null;
  amount: number;
  tds_deducted: number;
}

const incomeTypes: { value: IncomeSourceType; label: string; icon: React.ElementType }[] = [
  { value: "salary", label: "Salary", icon: Wallet },
  { value: "house_property", label: "House Property", icon: Building2 },
  { value: "capital_gains_equity", label: "Capital Gains (Equity)", icon: TrendingUp },
  { value: "capital_gains_debt", label: "Capital Gains (Debt)", icon: TrendingUp },
  { value: "capital_gains_property", label: "Capital Gains (Property)", icon: Building2 },
  { value: "business_professional", label: "Business/Professional", icon: Briefcase },
  { value: "other_sources", label: "Other Sources", icon: PiggyBank },
];

export default function Income() {
  const { user } = useAuth();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newSource, setNewSource] = useState({
    source_type: "salary" as IncomeSourceType,
    description: "",
    employer_name: "",
    amount: "",
    tds_deducted: "",
  });

  useEffect(() => {
    if (user) {
      fetchIncomeSources();
    }
  }, [user]);

  const fetchIncomeSources = async () => {
    try {
      const { data, error } = await supabase
        .from("income_sources")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIncomeSources(data || []);
    } catch (error) {
      console.error("Error fetching income sources:", error);
      toast.error("Failed to load income sources");
    } finally {
      setLoading(false);
    }
  };

  const addIncomeSource = async () => {
    console.log("Attempting to add income source:", newSource);

    if (!user) {
      console.error("No user found in addIncomeSource");
      toast.error("You must be logged in to add income");
      return;
    }

    if (!newSource.amount || parseFloat(newSource.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        source_type: newSource.source_type,
        description: newSource.description || null,
        employer_name: newSource.employer_name || null,
        amount: parseFloat(newSource.amount),
        tds_deducted: parseFloat(newSource.tds_deducted) || 0,
        assessment_year: "2026-27"
      };

      console.log("Sending payload to Supabase:", payload);

      const { data, error } = await supabase.from("income_sources")
        .insert(payload)
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }

      console.log("Supabase insert success:", data);

      toast.success("Income source added successfully");
      setDialogOpen(false);
      setNewSource({
        source_type: "salary",
        description: "",
        employer_name: "",
        amount: "",
        tds_deducted: "",
      });
      fetchIncomeSources();
    } catch (error) {
      console.error("Error adding income source:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add income source");
    } finally {
      setSaving(false);
    }
  };

  const deleteIncomeSource = async (id: string) => {
    try {
      const { error } = await supabase
        .from("income_sources")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Income source deleted");
      fetchIncomeSources();
    } catch (error) {
      console.error("Error deleting income source:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete income source");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalIncome = incomeSources.reduce((sum, source) => sum + source.amount, 0);
  const totalTds = incomeSources.reduce((sum, source) => sum + (source.tds_deducted || 0), 0);

  const getIncomeTypeIcon = (type: IncomeSourceType) => {
    const config = incomeTypes.find((t) => t.value === type);
    return config?.icon || Wallet;
  };

  const getIncomeTypeLabel = (type: IncomeSourceType) => {
    const config = incomeTypes.find((t) => t.value === type);
    return config?.label || type;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Income</h1>
            <p className="text-muted-foreground">
              Manage all your income sources for AY 2026-27
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Income
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Income Source</DialogTitle>
                <DialogDescription>
                  Enter details of your income source
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Income Type</Label>
                  <Select
                    value={newSource.source_type}
                    onValueChange={(value: IncomeSourceType) =>
                      setNewSource({ ...newSource, source_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newSource.source_type === "salary" && (
                  <div className="space-y-2">
                    <Label>Employer Name</Label>
                    <Input
                      placeholder="Company name"
                      value={newSource.employer_name}
                      onChange={(e) =>
                        setNewSource({ ...newSource, employer_name: e.target.value })
                      }
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Input
                    placeholder="Brief description"
                    value={newSource.description}
                    onChange={(e) =>
                      setNewSource({ ...newSource, description: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newSource.amount}
                      onChange={(e) =>
                        setNewSource({ ...newSource, amount: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TDS Deducted (₹)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newSource.tds_deducted}
                      onChange={(e) =>
                        setNewSource({ ...newSource, tds_deducted: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addIncomeSource} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Add Income"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatCurrency(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                TDS Deducted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-accent">{formatCurrency(totalTds)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Income Sources Table */}
        <Card>
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
            <CardDescription>
              {incomeSources.length} income source{incomeSources.length !== 1 ? "s" : ""} added
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : incomeSources.length === 0 ? (
              <div className="text-center py-8">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg mb-1">No income sources yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add your salary, rental income, and other sources
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Income
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">TDS</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeSources.map((source) => {
                    const Icon = getIncomeTypeIcon(source.source_type);
                    return (
                      <TableRow key={source.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <Badge variant="outline">
                              {getIncomeTypeLabel(source.source_type)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {source.employer_name || source.description || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(source.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(source.tds_deducted || 0)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteIncomeSource(source.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
