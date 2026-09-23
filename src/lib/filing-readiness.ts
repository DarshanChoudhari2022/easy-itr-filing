import type { FilingSession } from './filing-session';

export function indianTaxDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export interface PortalJourney {
    account: 'unknown' | 'yes' | 'no';
    canLogin: boolean;
    panChecked: boolean;
    bankValidated: boolean;
    evidenceReviewed: boolean;
    cryptoHistoryComplete: boolean;
    cryptoTdsReconciled: boolean;
    submittedOn: string;
    acknowledgement: string;
    verifiedOn: string;
}

export const EMPTY_PORTAL_JOURNEY: PortalJourney = {
    account: 'unknown', canLogin: false, panChecked: false, bankValidated: false,
    evidenceReviewed: false, cryptoHistoryComplete: false, cryptoTdsReconciled: false,
    submittedOn: '', acknowledgement: '', verifiedOn: '',
};

export function getPreparationBlockers(session: FilingSession): string[] {
    const p = { ...EMPTY_PORTAL_JOURNEY, ...session.portalJourney };
    const errors: string[] = [];
    if (p.account !== 'yes' || !p.canLogin) errors.push('Confirm you can log in to your Income Tax portal account.');
    if (!p.panChecked) errors.push('Check PAN status and Aadhaar linking requirements on the portal.');
    if (!p.bankValidated) errors.push('Validate your bank account on the Income Tax portal.');
    if (!p.evidenceReviewed) errors.push('Reconcile all income and tax credits with AIS, Form 26AS and source documents.');
    if (session.regime === 'undecided') errors.push('Choose a tax regime.');
    if (session.financialYear !== 'FY2025-26') errors.push('This preparation flow currently supports FY2025-26 only.');
    if (session.personalInfo.residentStatus !== 'RES' || session.personalInfo.filingStatus !== 'INDIVIDUAL' ||
        session.business.enabled || session.foreignAssets.enabled || session.capitalGains.enabled || session.agriculture.enabled) {
        errors.push('This profile requires specialist review: non-resident/HUF, business, foreign assets, non-crypto capital gains or agricultural income is not fully validated for automated preparation.');
    }
    if (session.cryptoVDA.enabled) {
        if (![session.cryptoVDA.taxableGains, session.cryptoVDA.saleConsideration, session.cryptoVDA.costOfAcquisition, session.cryptoVDA.tdsCredit].every(n => Number.isFinite(n) && n >= 0)) errors.push('Crypto totals must be finite, non-negative amounts.');
        if (!p.cryptoHistoryComplete) errors.push('Confirm all exchanges, wallets and opening crypto acquisition history are included.');
        if (!p.cryptoTdsReconciled) errors.push('Reconcile crypto TDS with Form 26AS; an estimated 1% is not a tax credit.');
        if (session.cryptoVDA.financialYear !== session.financialYear) errors.push('Crypto financial year does not match this return.');
        const rows = session.cryptoVDA.scheduleVDA;
        const startYear = Number(session.financialYear.replace('FY', '').split('-')[0]);
        const startDate = `${startYear}-04-01`;
        const endDate = `${startYear + 1}-03-31`;
        if (rows.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.dateOfAcquisition) || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateOfTransfer) || r.dateOfAcquisition > r.dateOfTransfer || r.dateOfTransfer < startDate || r.dateOfTransfer > endDate)) errors.push('Review Schedule VDA dates: purchases cannot follow sales and transfers must belong to this financial year.');
        if (!rows.length && (session.cryptoVDA.numSellEvents > 0 || session.cryptoVDA.taxableGains > 0 || session.cryptoVDA.saleConsideration > 0)) {
            errors.push('Import transaction-level Schedule VDA before continuing.');
        }
        if (rows.some(r => !Number.isFinite(r.taxableIncome) || !Number.isFinite(r.costOfAcquisition) || !Number.isFinite(r.saleConsideration) || r.costOfAcquisition < 0 || r.saleConsideration < 0 || Math.abs(r.taxableIncome - Math.max(0, r.saleConsideration - r.costOfAcquisition)) > 1)) {
            errors.push('Schedule VDA contains invalid amounts or loss offsets. Review each transfer.');
        }
        if (Math.abs(rows.reduce((sum, r) => sum + r.taxableIncome, 0) - session.cryptoVDA.taxableGains) > 1) errors.push('Schedule VDA does not reconcile to crypto taxable gains.');
    }
    return errors;
}

export function validatePortalReceipt(p: PortalJourney, today = new Date().toISOString().slice(0, 10)): string[] {
    const errors: string[] = [];
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!/^\d{15}$/.test(p.acknowledgement)) errors.push('Enter the 15-digit acknowledgement number from the portal receipt.');
    if (!validDate(p.submittedOn) || p.submittedOn > today) errors.push('Enter a valid submission date, no later than today.');
    if (p.verifiedOn && (!validDate(p.verifiedOn) || p.verifiedOn < p.submittedOn || p.verifiedOn > today)) errors.push('Verification date must be between submission and today.');
    return errors;
}
