import type { FilingSession } from '@/lib/filing-session';
import { EMPTY_PORTAL_JOURNEY, type PortalJourney } from '@/lib/filing-readiness';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from 'lucide-react';

export function PortalReadiness({ session, updateSession }: {
    session: FilingSession;
    updateSession: (fn: (s: FilingSession) => FilingSession) => void;
}) {
    const p = { ...EMPTY_PORTAL_JOURNEY, ...session.portalJourney };
    const update = (patch: Partial<PortalJourney>) => updateSession(s => ({
        ...s, portalJourney: { ...EMPTY_PORTAL_JOURNEY, ...s.portalJourney, ...patch },
    }));
    const checks: { key: 'canLogin' | 'panChecked' | 'bankValidated' | 'evidenceReviewed' | 'cryptoHistoryComplete' | 'cryptoTdsReconciled'; label: string; detail: string }[] = [
        { key: 'canLogin', label: 'I can log in to the Income Tax portal', detail: 'Your EasyITR account is separate. Use your PAN as the government portal user ID.' },
        { key: 'panChecked', label: 'I checked PAN status and Aadhaar linking requirements', detail: 'Use the portal PAN status and Link Aadhaar Status services; check applicable exemptions if needed.' },
        { key: 'bankValidated', label: 'My refund bank account is validated on the portal', detail: 'Open My Profile > My Bank Account. Add your own account, complete validation and nominate it for refund.' },
        { key: 'evidenceReviewed', label: 'I reconciled income and tax credits with source documents', detail: 'Compare AIS, Form 26AS, Form 16, bank interest, investment statements and challans for the selected year. Resolve differences before claiming credits.' },
        ...(session.cryptoVDA.enabled ? [
            { key: 'cryptoHistoryComplete' as const, label: 'All crypto activity and acquisition history is included', detail: 'Include every exchange and wallet, earlier purchases for opening holdings, Insta trades, swaps and rewards. CoinDCX API sync alone does not prove completeness.' },
            { key: 'cryptoTdsReconciled' as const, label: 'Crypto TDS credit matches supporting tax records', detail: 'Reconcile exchange TDS with Form 26AS. Do not claim an estimated 1% of sales as tax paid.' },
        ] : []),
    ];
    return <section className="space-y-5 border-b pb-6">
        <h2 className="text-lg font-semibold">First, your Income Tax portal account</h2>
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">Do you already have an account on incometax.gov.in?</legend>
            <div className="flex flex-wrap gap-5">
                {([['yes', 'Yes'], ['no', 'No, I need to register'], ['unknown', 'I am not sure']] as const).map(([value, label]) =>
                    <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="portalAccount" value={value} checked={p.account === value} onChange={() => update({ account: value, canLogin: false })} />{label}</label>)}
            </div>
        </fieldset>
        {p.account !== 'yes' && <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>Keep your active PAN, mobile number and email ready.</li>
            <li>Open the official portal, choose Register, then Taxpayer. Enter your PAN and select Validate.</li>
            <li>If your PAN is already registered, choose Login and use Forgot Password if needed.</li>
            <li>For a new account, enter PAN details and contact information. Complete the mobile/email verification requested by the portal.</li>
            <li>Confirm the details, set a password on the portal and log in. Return here and select Yes.</li>
        </ol>}
        <a className="inline-flex items-center gap-2 text-primary underline text-sm" href="https://www.incometax.gov.in/iec/foportal/" target="_blank" rel="noopener noreferrer">Open official Income Tax portal<ExternalLink className="h-4 w-4" /></a>
        <p className="text-sm text-muted-foreground">Enter portal passwords and OTPs only on the official portal. These checkboxes record your confirmation; EasyITR has not independently verified them.</p>
        <div className="space-y-4">{checks.map(({ key, label, detail }) => <div key={key}>
            <label className="flex items-start gap-3 text-sm font-medium"><Checkbox checked={p[key]} disabled={key === 'canLogin' && p.account !== 'yes'} onCheckedChange={value => update({ [key]: value === true })} />{label}</label>
            <p className="ml-7 text-sm text-muted-foreground mt-1">{detail}</p>
        </div>)}</div>
        <a className="text-sm text-primary underline" href="https://www.incometax.gov.in/iec/foportal/help/how-to-register-e-filing" target="_blank" rel="noopener noreferrer">Official registration guide</a>
    </section>;
}
