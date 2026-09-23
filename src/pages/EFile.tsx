import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PortalReadiness } from '@/components/PortalReadiness';
import { useFilingSession } from '@/hooks/useFilingSession';
import { EMPTY_PORTAL_JOURNEY, getPreparationBlockers, validatePortalReceipt, type PortalJourney } from '@/lib/filing-readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function EFile() {
    const { session, loading, updateSession, validation, itrForm, saving } = useFilingSession('FY2025-26');
    if (loading || !session) return <AppLayout><Loader2 className="m-8 animate-spin" /></AppLayout>;
    const p = { ...EMPTY_PORTAL_JOURNEY, ...session.portalJourney };
    const blockers = [...validation.errors, ...getPreparationBlockers(session)];
    const update = (patch: Partial<PortalJourney>) => updateSession(s => ({ ...s, portalJourney: { ...EMPTY_PORTAL_JOURNEY, ...s.portalJourney, ...patch } }));
    const receiptErrors = validatePortalReceipt(p);
    const recorded = receiptErrors.length === 0;
    return <AppLayout><main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <header><h1 className="text-2xl font-semibold">File on the Income Tax portal</h1>
            <p className="text-sm text-muted-foreground mt-2">{session.financialYear} / {session.assessmentYear} / Suggested {itrForm.form}</p>
            <p className="mt-3">EasyITR prepares a draft. Automatic government submission is not connected. Complete payment, submission and verification on the official portal.</p>
        </header>
        <PortalReadiness session={session} updateSession={updateSession} />
        <section className="space-y-3"><h2 className="text-lg font-semibold">Preparation checks</h2>
            {blockers.length ? <ul className="list-disc pl-5 space-y-2 text-sm">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul> : <p>Your recorded preparation checks are complete. The portal must still validate the return.</p>}
            <Button asChild variant="outline"><Link to="/guided">Review income and draft computation</Link></Button>
        </section>
        <section className="space-y-3"><h2 className="text-lg font-semibold">Submit and verify</h2>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
                <li>Log in, then open e-File &gt; Income Tax Returns &gt; File Income Tax Return. Select {session.assessmentYear}, the correct taxpayer status and filing type.</li>
                <li>Use the portal's form-selection questions to confirm the suggested form. Crypto transfers require Schedule VDA, normally ITR-2 or ITR-3 for individuals.</li>
                <li>Prepare online. Compare prefilled details against your evidence and draft computation. Enter each VDA transfer; do not offset VDA losses against gains. EasyITR draft JSON is not a validated portal upload file.</li>
                <li>Reconcile tax credits and let the portal calculate final tax, surcharge, cess, interest and any late fee. Use e-Pay Tax for any balance and confirm the challan before submitting.</li>
                <li>Review and submit. Save the acknowledgement receipt. Downloading an EasyITR draft does not submit a return.</li>
                <li>Choose e-Verify Now using an available method, such as Aadhaar OTP, bank EVC or net banking. The normal verification/ITR-V timeline is 30 days from filing; follow portal instructions for delays or exceptions.</li>
                <li>Check View Filed Returns for actual status. Save the verified acknowledgement; processing by the department is a later stage.</li>
            </ol>
            <Button asChild><a href="https://www.incometax.gov.in/iec/foportal/" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Open official portal</a></Button>
        </section>
        <section className="space-y-4 border-t pt-6"><h2 className="text-lg font-semibold">Record your portal receipt</h2>
            <p className="text-sm text-muted-foreground">Self-reported tracking only. This does not submit or verify your return.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="ack">Acknowledgement number</Label><Input id="ack" inputMode="numeric" maxLength={15} value={p.acknowledgement} onChange={e => update({ acknowledgement: e.target.value.replace(/\D/g, '') })} /></div>
                <div><Label htmlFor="submitted">Submission date</Label><Input id="submitted" type="date" value={p.submittedOn} onChange={e => update({ submittedOn: e.target.value })} /></div>
                <div><Label htmlFor="verified">E-verification date (leave empty if pending)</Label><Input id="verified" type="date" value={p.verifiedOn} onChange={e => update({ verifiedOn: e.target.value })} /></div>
            </div>
            <Button variant="outline" disabled={saving} onClick={() => { if (receiptErrors.length) receiptErrors.forEach(e => toast.error(e)); else toast.success('Receipt details recorded. Confirm actual status on the portal.'); }}><Save className="h-4 w-4 mr-2" />Check receipt details</Button>
            <p role="status">{saving ? 'Saving...' : recorded ? p.verifiedOn ? 'Reported as submitted and e-verified. Portal processing is separate.' : 'Reported as submitted. E-verification is pending.' : 'No valid submission receipt recorded.'}</p>
        </section>
    </main></AppLayout>;
}
