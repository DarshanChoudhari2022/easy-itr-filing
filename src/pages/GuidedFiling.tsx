import { AppLayout } from "@/components/layout/AppLayout";
import { SmartFilingWizard } from "@/components/SmartFilingWizard";

export default function GuidedFiling() {
    return (
        <AppLayout>
            <div className="py-8 px-4 sm:px-6 lg:px-8">
                <SmartFilingWizard />
            </div>
        </AppLayout>
    );
}
