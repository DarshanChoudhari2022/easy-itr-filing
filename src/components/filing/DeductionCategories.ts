/**
 * DeductionCategories — Complete deduction section configuration
 * Covers ALL Indian Income Tax deduction sections with baby-step explanations
 */

export interface DeductionCategoryConfig {
    id: string;
    section: string;
    dbKey: string; // maps to the database column or section name
    label: string;
    emoji: string;
    limit: number | null;
    description: string;
    examples: string;
    babyExplanation: string;
    documentsNeeded: string[];
    whoCanClaim: string;
    applicableRegime: 'old' | 'both' | 'new';
    groupId: string;
}

export interface DeductionGroup {
    id: string;
    title: string;
    emoji: string;
    description: string;
    color: string;
}

export const DEDUCTION_GROUPS: DeductionGroup[] = [
    {
        id: 'investments',
        title: 'Investment & Savings',
        emoji: '💰',
        description: 'Tax-saving investments like PPF, ELSS, LIC, EPF',
        color: 'emerald',
    },
    {
        id: 'health',
        title: 'Health & Insurance',
        emoji: '🏥',
        description: 'Health insurance and medical expenses',
        color: 'blue',
    },
    {
        id: 'housing',
        title: 'Housing & Rent',
        emoji: '🏠',
        description: 'House rent, home loan interest, affordable housing',
        color: 'violet',
    },
    {
        id: 'education',
        title: 'Education',
        emoji: '🎓',
        description: 'Education loan interest',
        color: 'amber',
    },
    {
        id: 'donations',
        title: 'Donations & Social',
        emoji: '🎁',
        description: 'Charitable donations and political contributions',
        color: 'rose',
    },
    {
        id: 'interest',
        title: 'Interest Deductions',
        emoji: '🏦',
        description: 'Savings account and deposit interest deductions',
        color: 'cyan',
    },
    {
        id: 'others',
        title: 'Other Deductions',
        emoji: '📋',
        description: 'Electric vehicle, disability, and other deductions',
        color: 'slate',
    },
];

export const ALL_DEDUCTIONS: DeductionCategoryConfig[] = [
    // ============ INVESTMENTS & SAVINGS (80C family) ============
    {
        id: 'section_80c',
        section: '80C',
        dbKey: 'section_80c',
        label: 'Section 80C — Investments & Savings',
        emoji: '💰',
        limit: 150000,
        description: 'PPF, ELSS, LIC, EPF, Tuition fees, Home Loan Principal',
        examples: 'PPF, ELSS Mutual Funds, LIC Premium, EPF, Tuition Fees, NSC, SCSS, Home Loan Repayment (Principal)',
        babyExplanation:
            'Did you invest money in PPF, buy ELSS mutual funds, pay LIC premiums, or pay your children\'s school fees? All these count! Even your EPF contribution from salary counts here automatically.',
        documentsNeeded: ['PPF passbook/statement', 'ELSS mutual fund statement', 'LIC premium receipt', 'Tuition fee receipt', 'Home loan statement'],
        whoCanClaim: 'Any individual or HUF',
        applicableRegime: 'old',
        groupId: 'investments',
    },
    {
        id: 'section_80ccd_1b',
        section: '80CCD(1B)',
        dbKey: 'section_80ccd_1b',
        label: 'Section 80CCD(1B) — NPS Additional',
        emoji: '🏦',
        limit: 50000,
        description: 'Additional deduction for NPS contribution',
        examples: 'NPS Tier-1 account contribution',
        babyExplanation:
            'If you contribute to National Pension System (NPS), you get an EXTRA ₹50,000 deduction over and above the ₹1.5L under 80C. This is like a bonus tax saving!',
        documentsNeeded: ['NPS contribution receipt/statement', 'PRAN statement'],
        whoCanClaim: 'Any individual contributing to NPS',
        applicableRegime: 'old',
        groupId: 'investments',
    },
    {
        id: 'section_80ccd_2',
        section: '80CCD(2)',
        dbKey: 'section_80ccd_2',
        label: 'Section 80CCD(2) — NPS Employer Contribution',
        emoji: '🏢',
        limit: null, // 14% of salary
        description: "Employer's NPS contribution (up to 14% of salary)",
        examples: "Employer's NPS contribution shown in pay slip",
        babyExplanation:
            "If your employer also contributes to your NPS account, that amount (up to 14% of your basic salary) is deductible. Check your pay slip for 'Employer NPS Contribution'. This is available even in New Regime!",
        documentsNeeded: ['Salary slip showing employer NPS contribution'],
        whoCanClaim: 'Salaried employees whose employer contributes to NPS',
        applicableRegime: 'both',
        groupId: 'investments',
    },

    // ============ HEALTH & INSURANCE ============
    {
        id: 'section_80d',
        section: '80D',
        dbKey: 'section_80d',
        label: 'Section 80D — Health Insurance',
        emoji: '🏥',
        limit: 75000, // 25K self + 50K parents (senior)
        description: 'Health insurance premium for self, family & parents',
        examples: 'Mediclaim policy, Star Health, HDFC Ergo, Preventive health checkup (₹5K)',
        babyExplanation:
            'Do you pay health insurance premium? You can deduct: ₹25,000 for yourself & family + ₹25,000 for parents (₹50,000 if parents are 60+). Even a preventive health checkup of ₹5,000 counts!',
        documentsNeeded: ['Health insurance premium receipt', 'Policy documents', 'Health checkup bills'],
        whoCanClaim: 'Any individual paying health insurance premium',
        applicableRegime: 'old',
        groupId: 'health',
    },
    {
        id: 'section_80dd',
        section: '80DD',
        dbKey: 'section_80dd',
        label: 'Section 80DD — Disabled Dependent',
        emoji: '♿',
        limit: 125000, // 75K normal, 1.25L severe
        description: 'Maintenance of disabled dependent (spouse, child, parent, sibling)',
        examples: 'Medical treatment, rehabilitation, special education of disabled dependent',
        babyExplanation:
            'If you have a disabled dependent family member (spouse, child, parent, or sibling), you can claim ₹75,000 (40-80% disability) or ₹1,25,000 (80%+ severe disability) regardless of actual expenses.',
        documentsNeeded: ['Form 10-IA', 'Disability certificate from authorized hospital'],
        whoCanClaim: 'Individual with a disabled dependent',
        applicableRegime: 'old',
        groupId: 'health',
    },
    {
        id: 'section_80ddb',
        section: '80DDB',
        dbKey: 'section_80ddb',
        label: 'Section 80DDB — Specified Disease Treatment',
        emoji: '💊',
        limit: 100000, // 40K normal, 1L for seniors
        description: 'Treatment of specified diseases (cancer, AIDS, neurological, etc.)',
        examples: 'Cancer treatment, chronic renal failure, AIDS, hematological disorders',
        babyExplanation:
            'If you or a dependent spent money on treating severe diseases like cancer, kidney failure, or neurological diseases, you can claim up to ₹40,000 (₹1,00,000 if patient is senior citizen).',
        documentsNeeded: ['Prescription from specialist doctor', 'Medical bills', 'Form 10-I'],
        whoCanClaim: 'Individual or HUF for treatment of self or dependent',
        applicableRegime: 'old',
        groupId: 'health',
    },

    // ============ HOUSING & RENT ============
    {
        id: 'hra',
        section: 'HRA',
        dbKey: 'hra',
        label: 'HRA — House Rent Allowance',
        emoji: '🏠',
        limit: null, // Formula based
        description: 'Rent paid when HRA is part of salary',
        examples: 'Monthly rent paid for rented accommodation',
        babyExplanation:
            'If your salary includes HRA and you pay rent, you can claim exemption. The amount is the minimum of: (a) Actual HRA received, (b) Rent paid minus 10% of salary, (c) 50% of salary (metro) or 40% (non-metro).',
        documentsNeeded: ['Rent receipts', 'Rental agreement', "Landlord's PAN (if rent > ₹1L/year)"],
        whoCanClaim: 'Salaried individuals receiving HRA in salary',
        applicableRegime: 'old',
        groupId: 'housing',
    },
    {
        id: 'section_80gg',
        section: '80GG',
        dbKey: 'section_80gg',
        label: 'Section 80GG — Rent Without HRA',
        emoji: '🏘️',
        limit: 60000, // ₹5,000/month
        description: 'Rent deduction if HRA is NOT part of salary',
        examples: 'Rent paid by self-employed or those without HRA component',
        babyExplanation:
            "Don't receive HRA in your salary but pay rent? You can claim up to ₹5,000/month (₹60,000/year). This is great for freelancers and business owners who pay rent!",
        documentsNeeded: ['Rent receipts', 'Rental agreement', 'Form 10BA declaration'],
        whoCanClaim: 'Self-employed or salaried without HRA',
        applicableRegime: 'old',
        groupId: 'housing',
    },
    {
        id: 'section_80ee',
        section: '80EE',
        dbKey: 'section_80ee',
        label: 'Section 80EE — Home Loan Interest (First-time)',
        emoji: '🏡',
        limit: 50000,
        description: 'Additional interest deduction for first-time home buyers',
        examples: 'Home loan interest for property value ≤ ₹50L, loan ≤ ₹35L',
        babyExplanation:
            'First-time home buyer? You get an EXTRA ₹50,000 deduction on home loan interest (above the ₹2L under Section 24). Conditions: Property value ≤ ₹50 Lakhs, Loan ≤ ₹35 Lakhs.',
        documentsNeeded: ['Home loan interest certificate', 'Property registration documents'],
        whoCanClaim: 'First-time home buyers with loan sanctioned in FY 2016-17',
        applicableRegime: 'old',
        groupId: 'housing',
    },
    {
        id: 'section_80eea',
        section: '80EEA',
        dbKey: 'section_80eea',
        label: 'Section 80EEA — Affordable Housing',
        emoji: '🏗️',
        limit: 150000,
        description: 'Interest deduction for affordable housing',
        examples: 'Home loan for property with stamp value ≤ ₹45L',
        babyExplanation:
            'Buying an affordable house (stamp value ≤ ₹45 Lakhs)? You get ₹1,50,000 extra deduction on home loan interest. Loan must have been sanctioned between April 2019 - March 2022.',
        documentsNeeded: ['Home loan interest certificate', 'Property stamp duty receipt'],
        whoCanClaim: 'First-time home buyers in affordable housing segment',
        applicableRegime: 'old',
        groupId: 'housing',
    },
    {
        id: 'lta',
        section: 'LTA',
        dbKey: 'lta',
        label: 'LTA — Leave Travel Allowance',
        emoji: '✈️',
        limit: null, // Actual travel cost
        description: 'Domestic travel expenses when LTA is part of salary',
        examples: 'Flight/train tickets for vacation within India',
        babyExplanation:
            'If your salary includes LTA and you traveled within India, you can claim exemption for the actual travel fare (flight/train tickets only — not hotel or food). Only 2 trips in 4 years!',
        documentsNeeded: ['Travel tickets/boarding passes', 'LTA claim form from employer'],
        whoCanClaim: 'Salaried individuals with LTA component in salary',
        applicableRegime: 'old',
        groupId: 'housing',
    },

    // ============ EDUCATION ============
    {
        id: 'section_80e',
        section: '80E',
        dbKey: 'section_80e',
        label: 'Section 80E — Education Loan Interest',
        emoji: '🎓',
        limit: null, // No limit!
        description: 'Interest on higher education loan (NO LIMIT!)',
        examples: 'Bank education loan for graduation, post-graduation, professional courses',
        babyExplanation:
            'Paying interest on an education loan? Great news — there is NO upper limit on this deduction! You can claim the ENTIRE interest amount. Available for 8 years from when you start repaying.',
        documentsNeeded: ['Education loan interest certificate from bank'],
        whoCanClaim: 'Individual who took loan for own or dependent education',
        applicableRegime: 'old',
        groupId: 'education',
    },

    // ============ DONATIONS & SOCIAL ============
    {
        id: 'section_80g',
        section: '80G',
        dbKey: 'section_80g',
        label: 'Section 80G — Charitable Donations',
        emoji: '🎁',
        limit: null, // Varies 50-100%
        description: 'Donations to approved charities (50% or 100% deductible)',
        examples: 'PM Relief Fund (100%), CM Relief Fund, NGOs, temples, educational institutions',
        babyExplanation:
            'Donated money to charity? Depending on the organization, you can claim 50% or 100% deduction. PM Relief Fund, National Defence Fund = 100% deduction. Most NGOs = 50% deduction up to 10% of income.',
        documentsNeeded: ['Donation receipt with Form 10BE', 'Receipt from fund/charity'],
        whoCanClaim: 'Any individual making charitable donations',
        applicableRegime: 'old',
        groupId: 'donations',
    },
    {
        id: 'section_80gga',
        section: '80GGA',
        dbKey: 'section_80gga',
        label: 'Section 80GGA — Scientific Research Donations',
        emoji: '🔬',
        limit: null,
        description: 'Donations for scientific research or rural development',
        examples: 'Donations to approved research associations, universities',
        babyExplanation:
            'If you donated money for scientific research or rural development to approved associations, you can claim a deduction. Not applicable if you have business income.',
        documentsNeeded: ['Donation receipt from approved research body'],
        whoCanClaim: 'Any individual without business income',
        applicableRegime: 'old',
        groupId: 'donations',
    },
    {
        id: 'section_80ggc',
        section: '80GGC',
        dbKey: 'section_80ggc',
        label: 'Section 80GGC — Political Party Donations',
        emoji: '🗳️',
        limit: null, // No limit
        description: 'Donations to registered political parties',
        examples: 'Electoral bonds, party fund donations (non-cash)',
        babyExplanation:
            'Donated to a registered political party? You can claim the full amount as deduction. Note: Cash donations are NOT eligible — only bank transfer, cheque, or electoral bonds.',
        documentsNeeded: ['Donation receipt from political party'],
        whoCanClaim: 'Any individual',
        applicableRegime: 'old',
        groupId: 'donations',
    },

    // ============ INTEREST DEDUCTIONS ============
    {
        id: 'section_80tta',
        section: '80TTA',
        dbKey: 'section_80tta',
        label: 'Section 80TTA — Savings Interest',
        emoji: '🏦',
        limit: 10000,
        description: 'Interest from savings accounts (up to ₹10,000)',
        examples: 'Interest earned in SBI, HDFC, ICICI savings accounts',
        babyExplanation:
            'The interest your bank pays you on your savings account (not FD!) — up to ₹10,000 of this is tax-free! If you earned ₹8,000 interest in savings, you pay ZERO tax on it.',
        documentsNeeded: ['Bank statement showing interest credited'],
        whoCanClaim: 'Individuals and HUFs (under 60 years)',
        applicableRegime: 'old',
        groupId: 'interest',
    },
    {
        id: 'section_80ttb',
        section: '80TTB',
        dbKey: 'section_80ttb',
        label: 'Section 80TTB — Senior Citizen Interest',
        emoji: '👴',
        limit: 50000,
        description: 'Interest income for senior citizens (60+ years)',
        examples: 'Interest from savings, FD, RD, post office deposits',
        babyExplanation:
            'If you are 60 years or older, you get ₹50,000 deduction on ALL types of interest income — savings, FD, RD, post office. This replaces 80TTA for seniors.',
        documentsNeeded: ['Bank/FD interest statements', 'Age proof'],
        whoCanClaim: 'Senior citizens (60+ years)',
        applicableRegime: 'old',
        groupId: 'interest',
    },

    // ============ OTHERS ============
    {
        id: 'section_80eeb',
        section: '80EEB',
        dbKey: 'section_80eeb',
        label: 'Section 80EEB — Electric Vehicle Loan',
        emoji: '🚗',
        limit: 150000,
        description: 'Interest on loan for electric vehicle',
        examples: 'EMI interest on Tata Nexon EV, MG ZS EV, Ather scooter loan',
        babyExplanation:
            'Bought an electric vehicle on loan? The interest portion of your EMI (up to ₹1,50,000) is deductible! Loan must have been sanctioned between April 2019 - March 2023.',
        documentsNeeded: ['Vehicle loan interest certificate', 'EV purchase invoice'],
        whoCanClaim: 'Individual who purchased an electric vehicle on loan',
        applicableRegime: 'old',
        groupId: 'others',
    },
    {
        id: 'section_80u',
        section: '80U',
        dbKey: 'section_80u',
        label: 'Section 80U — Person with Disability',
        emoji: '♿',
        limit: 125000, // 75K normal, 1.25L severe
        description: 'Deduction for person with disability (self)',
        examples: 'Physical disability, blindness, mental retardation, autism',
        babyExplanation:
            'If you yourself have a disability (40%+), you can claim ₹75,000. For severe disability (80%+), the deduction is ₹1,25,000. This is a fixed amount — no need to show actual expenses.',
        documentsNeeded: ['Disability certificate from authorized medical authority'],
        whoCanClaim: 'Individual who is a person with disability',
        applicableRegime: 'old',
        groupId: 'others',
    },
    {
        id: 'other',
        section: 'Other',
        dbKey: 'other',
        label: 'Other Eligible Deductions',
        emoji: '📋',
        limit: null,
        description: 'Any other eligible deductions not listed above',
        examples: 'Standard Deduction for salaried (auto-applied), Professional Tax',
        babyExplanation:
            'Any other deductions that don\'t fit the categories above. Standard Deduction (₹75K New / ₹50K Old) is automatically applied for salaried individuals.',
        documentsNeeded: ['Relevant receipts/certificates'],
        whoCanClaim: 'Varies',
        applicableRegime: 'old',
        groupId: 'others',
    },
];

/**
 * Get deductions grouped by their group ID
 */
export function getDeductionsByGroup() {
    const grouped: Record<string, DeductionCategoryConfig[]> = {};
    DEDUCTION_GROUPS.forEach(g => {
        grouped[g.id] = ALL_DEDUCTIONS.filter(d => d.groupId === g.id);
    });
    return grouped;
}

/**
 * Get the most common deductions (for quick setup)
 */
export function getCommonDeductions(): DeductionCategoryConfig[] {
    return ALL_DEDUCTIONS.filter(d =>
        ['section_80c', 'section_80d', 'section_80e', 'section_80g', 'section_80tta', 'hra', 'section_80ccd_1b'].includes(d.id)
    );
}

/**
 * Calculate total deductions and check limits
 */
export function validateDeduction(deductionId: string, amount: number): {
    isValid: boolean;
    effectiveAmount: number;
    message?: string;
} {
    const config = ALL_DEDUCTIONS.find(d => d.id === deductionId);
    if (!config) return { isValid: false, effectiveAmount: 0, message: 'Unknown deduction section' };

    if (amount < 0) return { isValid: false, effectiveAmount: 0, message: 'Amount cannot be negative' };

    if (config.limit && amount > config.limit) {
        return {
            isValid: true, // Still valid but capped
            effectiveAmount: config.limit,
            message: `Exceeds limit of ₹${config.limit.toLocaleString('en-IN')}. Only ₹${config.limit.toLocaleString('en-IN')} will be considered.`,
        };
    }

    return { isValid: true, effectiveAmount: amount };
}
