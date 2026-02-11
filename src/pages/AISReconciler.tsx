import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PlanGate } from "@/hooks/usePlanGuard";
import AISUploader from "@/components/AISUploader";
import { getITRFilings, ITRFilingData, saveIncomeSources, updateProfileKYC, IncomeSourcesData } from "@/lib/supabase-data-service";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AISReconciler() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [itrData, setItrData] = useState<any>(null);

    useEffect(() => {
        if (user) {
            loadITRData();
        }
    }, [user]);

    const loadITRData = async () => {
        try {
            // Fetch latest filing for current AY
            const filings = await getITRFilings('2025-26');
            if (filings && filings.length > 0) {
                const latest = filings[0] as unknown as ITRFilingData;
                // Transform to format expected by AISUploader
                // This is a simplification; actual mapping depends on filing_data structure
                if (latest.filing_data) {
                    setItrData({
                        salary: latest.filing_data.income?.salary || 0,
                        interest: latest.filing_data.income?.interest || 0,
                        dividend: latest.filing_data.income?.dividend || 0,
                        rentalIncome: latest.filing_data.income?.houseProperty || 0,
                        capitalGains: latest.filing_data.income?.capitalGains || 0,
                        businessIncome: latest.filing_data.income?.business || 0,
                        otherSources: latest.filing_data.income?.otherSources || 0,
                        // TDS would ideally be in filing_data or separate table
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load ITR data for reconciliation", e);
        }
    };

    return (
        <AppLayout>
            <PlanGate feature="ais_full">
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">AIS / TIS Reconciler</h1>
                        <p className="text-muted-foreground">
                            Upload your Annual Information Statement to verify against your ITR data.
                        </p>
                    </div>

                    <AISUploader
                        itrData={itrData}
                        onAutoFill={async (suggestions) => {
                            try {
                                console.log("Auto-filling data:", suggestions);

                                // 1. Update Profile PAN if available
                                if (suggestions.pan) {
                                    await updateProfileKYC({ pan_number: suggestions.pan });
                                }

                                // 2. Map suggestions to Income Sources structure
                                const incomeData: IncomeSourcesData = {
                                    assessment_year: '2025-26',

                                    // Salary
                                    has_salary: (suggestions.salary || 0) > 0,
                                    salary_gross: suggestions.salary || 0,
                                    salary_tds: suggestions.salaryTDS || 0,

                                    // Other Sources
                                    has_other_sources: (suggestions.interestIncome || 0) > 0 || (suggestions.dividendIncome || 0) > 0,
                                    savings_interest: suggestions.interestIncome || 0,
                                    dividend_income: suggestions.dividendIncome || 0,

                                    // Capital Gains
                                    has_capital_gains: (suggestions.capitalGains || 0) > 0,
                                    ltcg_equity: suggestions.capitalGains || 0, // Using LTCG as placeholder default

                                    // Crypto
                                    has_crypto: suggestions.hasCryptoTransactions || false,
                                };

                                // 3. Save to Supabase
                                await saveIncomeSources(incomeData);

                                toast({
                                    title: "Synced with Database",
                                    description: "Income details from AIS have been saved to your tax profile."
                                });

                            } catch (error) {
                                console.error("Failed to save auto-fill data", error);
                                toast({
                                    variant: "destructive",
                                    title: "Sync Failed",
                                    description: "Could not save AIS data to database."
                                });
                            }
                        }}
                    />

                    <Card className="bg-indigo-50 border-indigo-100">
                        <CardContent className="p-4 flex gap-4 items-start">
                            <FileText className="h-6 w-6 text-indigo-600 mt-1" />
                            <div>
                                <h4 className="font-semibold text-indigo-900">Why is this important?</h4>
                                <p className="text-sm text-indigo-700 mt-1">
                                    The Income Tax Department uses AIS to track all your financial transactions.
                                    Discrepancies between your ITR and AIS are the #1 cause of tax notices.
                                    Our tool ensures 100% match before you file.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </PlanGate>
        </AppLayout>
    );
}
