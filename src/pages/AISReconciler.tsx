import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PlanGate } from "@/hooks/usePlanGuard";
import AISUploader from "@/components/AISUploader";
import { getITRFilings, ITRFilingData, updateProfileKYC, IncomeSourcesData, getAISData, AISDBData } from "@/lib/supabase-data-service";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function AISReconciler() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [itrData, setItrData] = useState<any>(null);
    const [aisDBData, setAisDBData] = useState<AISDBData | undefined>(undefined);

    useEffect(() => {
        if (user) {
            loadITRData();
            fetchAISData();
        }
    }, [user]);

    const fetchAISData = async () => {
        try {
            const data = await getAISData('2026-27');
            if (data) {
                setAisDBData(data as unknown as AISDBData);
            }
        } catch (e) {
            console.error("Failed to load AIS data", e);
        }
    };

    const loadITRData = async () => {
        try {
            // Fetch latest filing for current AY
            const filings = await getITRFilings('2026-27');
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
                        initialData={aisDBData}
                        onAutoFill={async (suggestions) => {
                            try {
                                console.log("Auto-filling data:", suggestions);

                                // 1. Update Profile PAN if available and valid
                                if (suggestions.pan && suggestions.pan !== 'MANUAL_ENTRY' && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(suggestions.pan)) {
                                    await updateProfileKYC({ pan_number: suggestions.pan });
                                }

                                // 2. Insert as List Items (matching Income.tsx schema)
                                const ay = '2026-27';
                                const items: any[] = [];

                                if ((suggestions.salary || 0) > 0) {
                                    items.push({
                                        user_id: user?.id,
                                        source_type: 'salary',
                                        amount: suggestions.salary,
                                        tds_deducted: suggestions.salaryTDS || 0,
                                        description: 'Imported from AIS (Salary)',
                                        assessment_year: ay
                                    });
                                }

                                if ((suggestions.interestIncome || 0) > 0) {
                                    items.push({
                                        user_id: user?.id,
                                        source_type: 'other_sources',
                                        amount: suggestions.interestIncome,
                                        description: 'Interest Income (AIS)',
                                        assessment_year: ay
                                    });
                                }

                                if ((suggestions.dividendIncome || 0) > 0) {
                                    items.push({
                                        user_id: user?.id,
                                        source_type: 'other_sources',
                                        amount: suggestions.dividendIncome,
                                        description: 'Dividend Income (AIS)',
                                        assessment_year: ay
                                    });
                                }

                                if ((suggestions.capitalGains || 0) > 0) {
                                    items.push({
                                        user_id: user?.id,
                                        source_type: 'capital_gains_equity',
                                        amount: suggestions.capitalGains,
                                        description: 'Capital Gains (AIS)',
                                        assessment_year: ay
                                    });
                                }

                                // 3. Save to Supabase using 'any' cast to bypass strict typing
                                if (items.length > 0 && user) {
                                    const { error } = await supabase.from('income_sources' as any).insert(items);
                                    if (error) throw error;

                                    toast({
                                        title: "Synced with Income Page",
                                        description: `Successfully added ${items.length} income sources from AIS.`
                                    });
                                } else {
                                    toast({ title: "No new data", description: "No significant income found in AIS to import." });
                                }

                            } catch (error) {
                                console.error("Failed to save auto-fill data", error);
                                toast({
                                    variant: "destructive",
                                    title: "Sync Failed",
                                    description: error instanceof Error ? error.message : "Could not save AIS data to database."
                                });
                            }
                        }}
                        onNext={() => navigate('/income')}
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
