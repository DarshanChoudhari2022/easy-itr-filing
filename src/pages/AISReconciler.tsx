import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PlanGate } from "@/hooks/usePlanGuard";
import AISUploader from "@/components/AISUploader";
import { getITRFilings, ITRFilingData } from "@/lib/supabase-data-service";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function AISReconciler() {
    const { user } = useAuth();
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
                        onAutoFill={(suggestions) => {
                            console.log("Auto-fill suggestions:", suggestions);
                            // In a full implementation, we would redirect to ITR form with these values
                            // For now, AISUploader handles the toast notification
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
