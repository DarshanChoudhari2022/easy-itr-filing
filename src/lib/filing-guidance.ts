import type { FilingSession } from './filing-session';

export interface FilingGuidanceItem {
    label: string;
    detail: string;
}

export interface FilingJourneyItem {
    title: string;
    outcome: string;
}

export interface FilingModulePlan {
    id: string;
    title: string;
    purpose: string;
    status: 'ready' | 'needs-input' | 'not-started';
}

export const FILING_STARTER_DOCUMENTS: FilingGuidanceItem[] = [
    { label: 'PAN card', detail: 'Name, PAN, date of birth, and father name exactly as registered.' },
    { label: 'Mobile and email', detail: 'Use the same details linked to the income tax portal where possible.' },
    { label: 'Bank account', detail: 'Account number, IFSC, bank name, and refund account preference.' },
    { label: 'Income documents', detail: 'Form 16, AIS/Form 26AS, broker P&L, rent records, or freelance invoices.' },
    { label: 'Crypto files', detail: 'CoinDCX order history, Insta history, and 194S TDS summary if you traded crypto.' },
];

export const BEGINNER_FILING_JOURNEY: FilingJourneyItem[] = [
    { title: 'Create or log in', outcome: 'Your filing workspace is saved for the correct financial year.' },
    { title: 'Identify yourself', outcome: 'PAN, contact, address, and residential status are captured.' },
    { title: 'Select income sources', outcome: 'The app recommends the likely ITR form and asks only relevant questions.' },
    { title: 'Enter or import evidence', outcome: 'Salary, AIS, capital gains, crypto, and business numbers are traceable.' },
    { title: 'Choose tax regime', outcome: 'Old and new regime outcomes are compared before you commit.' },
    { title: 'Add bank details', outcome: 'Refund account data is ready for validation and JSON generation.' },
    { title: 'Review warnings', outcome: 'Missing fields, mismatches, and risky assumptions are shown before filing.' },
    { title: 'Prepare, submit and verify', outcome: 'Review the draft report, complete the return on the official portal, save the acknowledgement and e-verify.' },
];

export const CRYPTO_TAX_PATH: FilingGuidanceItem[] = [
    { label: 'Import exchange files', detail: 'Upload CoinDCX order history, Insta history, and TDS records.' },
    { label: 'Validate coverage', detail: 'Confirm the financial year is complete before trusting gains.' },
    { label: 'Compute Schedule VDA', detail: 'FIFO cost, sale value, taxable gains, and non-deductible losses are separated.' },
    { label: 'Reconcile tax credits', detail: '194S TDS is tracked against the final payable or refund estimate.' },
];

export function getFilingModulePlan(session: FilingSession): FilingModulePlan[] {
    const hasPersonalInfo = Boolean(session.personalInfo.pan && session.personalInfo.firstName && session.personalInfo.mobile);
    const selectedIncomeCount = [
        session.salary.enabled,
        session.houseProperty.enabled,
        session.capitalGains.enabled,
        session.cryptoVDA.enabled,
        session.business.enabled,
        session.otherSources.enabled,
        session.foreignAssets.enabled,
        session.agriculture.enabled,
    ].filter(Boolean).length;
    const hasIncomeData = selectedIncomeCount > 0;
    const hasBank = session.bankDetails.length > 0;

    return [
        {
            id: 'identity',
            title: 'Identity and portal readiness',
            purpose: 'Collect PAN, contact details, residential status, and address without assuming portal knowledge.',
            status: hasPersonalInfo ? 'ready' : 'needs-input',
        },
        {
            id: 'income-interview',
            title: 'Income source interview',
            purpose: 'Convert beginner-friendly answers into the right ITR form and required schedules.',
            status: hasIncomeData ? 'ready' : 'needs-input',
        },
        {
            id: 'evidence',
            title: 'Evidence and imports',
            purpose: 'Attach Form 16, AIS/Form 26AS, broker reports, CoinDCX files, and manual entries to each figure.',
            status: hasIncomeData ? 'needs-input' : 'not-started',
        },
        {
            id: 'tax-computation',
            title: 'Tax computation and regime decision',
            purpose: 'Calculate old/new regime tax, crypto tax, credits, challan need, and refund/payable outcome.',
            status: session.regime === 'undecided' ? 'needs-input' : 'ready',
        },
        {
            id: 'filing-output',
            title: 'Review, JSON, and filing handoff',
            purpose: 'Block unsafe submissions, generate the filing package, and guide portal upload plus e-verification.',
            status: hasBank ? 'ready' : 'needs-input',
        },
    ];
}
