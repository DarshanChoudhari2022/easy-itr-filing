import { describe, expect, it, vi } from 'vitest';
import { EMPTY_PORTAL_JOURNEY, getPreparationBlockers, validatePortalReceipt, indianTaxDate } from './filing-readiness';
import { createDefaultSession, autoDetectITRForm } from './filing-session';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function readySession() {
    const s = createDefaultSession('test-user', 'FY2025-26');
    s.personalInfo = { residentStatus: 'RES', filingStatus: 'INDIVIDUAL' };
    s.regime = 'new';
    s.portalJourney = { ...EMPTY_PORTAL_JOURNEY, account: 'yes', canLogin: true, panChecked: true, bankValidated: true, evidenceReviewed: true, cryptoHistoryComplete: true, cryptoTdsReconciled: true };
    return s;
}

describe('filing preparation gate', () => {
    it('assigns trades at the FY boundary to their Indian calendar date', () => {
        expect(indianTaxDate(new Date('2025-03-31T19:00:00Z'))).toBe('2025-04-01');
    });
    it('requires portal registration confirmation for a new user', () => {
        expect(getPreparationBlockers(createDefaultSession('new-user', 'FY2025-26'))).toContain('Confirm you can log in to your Income Tax portal account.');
    });
    it('does not label unsupported profiles ready', () => {
        const s = readySession();
        s.foreignAssets.enabled = true;
        expect(getPreparationBlockers(s).some(e => e.includes('specialist'))).toBe(true);
    });
    it('blocks summary-only crypto data', () => {
        const s = readySession();
        s.cryptoVDA.enabled = true;
        s.cryptoVDA.taxableGains = 100;
        expect(getPreparationBlockers(s)).toContain('Import transaction-level Schedule VDA before continuing.');
    });
    it('requires reconciliation even when gains and TDS are zero', () => {
        const s = readySession();
        s.cryptoVDA.enabled = true;
        s.portalJourney.cryptoTdsReconciled = false;
        expect(getPreparationBlockers(s).some(e => e.includes('Reconcile crypto TDS'))).toBe(true);
    });
    it('never recommends ITR-1 for NRI or ITR-4 for presumptive business with foreign assets', () => {
        const s = readySession();
        s.personalInfo.residentStatus = 'NRI';
        expect(autoDetectITRForm(s).form).toBe('ITR-2');
        s.business.enabled = true;
        s.foreignAssets.enabled = true;
        expect(autoDetectITRForm(s).form).toBe('ITR-3');
    });
    it('permits preparation checks for a reconciled supported profile', () => {
        expect(getPreparationBlockers(readySession())).toEqual([]);
    });
});

describe('portal receipt validation', () => {
    it('does not treat an empty draft as a submitted return', () => {
        expect(validatePortalReceipt(EMPTY_PORTAL_JOURNEY)).toHaveLength(2);
    });
    it('rejects future submission and verification before submission', () => {
        expect(validatePortalReceipt({ ...EMPTY_PORTAL_JOURNEY, acknowledgement: '123456789012345', submittedOn: '2026-09-24', verifiedOn: '2026-09-22' }, '2026-09-23')).toHaveLength(2);
    });
    it('allows a submitted return awaiting verification', () => {
        expect(validatePortalReceipt({ ...EMPTY_PORTAL_JOURNEY, acknowledgement: '123456789012345', submittedOn: '2026-09-22' }, '2026-09-23')).toEqual([]);
    });
});
