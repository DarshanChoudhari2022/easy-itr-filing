/**
 * ITR Form Type Detection Engine
 * Auto-detects the appropriate ITR form (ITR-1, 2, 3, 4) based on income sources
 * 
 * ITR-1 (Sahaj): Salary, 1 House Property, Other Sources <= 50L
 * ITR-2: Salary + Capital Gains, Foreign Assets, Multiple House Properties
 * ITR-3: Business/Professional Income (not presumptive)
 * ITR-4 (Sugam): Presumptive income under 44AD/44ADA
 */

export type ITRFormType = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';

export interface IncomeProfile {
    hasSalary: boolean;
    salaryAmount: number;
    hasHouseProperty: boolean;
    housePropertyCount: number;
    hasCapitalGainsEquity: boolean;
    hasCapitalGainsProperty: boolean;
    hasCryptoVDA: boolean;
    hasBusinessIncome: boolean;
    isProfessionalIncome: boolean;
    hasPresumptiveIncome: boolean; // 44AD/44ADA
    hasForeignAssets: boolean;
    hasForeignIncome: boolean;
    hasAgricultureIncome: boolean;
    agricultureAmount: number;
    hasLotteryIncome: boolean;
    hasOtherSources: boolean;
    totalIncome: number;
    isDirector: boolean;
    hasUnlistedShares: boolean;
}

export interface ITRRecommendation {
    recommendedForm: ITRFormType;
    reasons: string[];
    eligibility: {
        'ITR-1': { eligible: boolean; reason: string };
        'ITR-2': { eligible: boolean; reason: string };
        'ITR-3': { eligible: boolean; reason: string };
        'ITR-4': { eligible: boolean; reason: string };
    };
    warnings: string[];
    tips: string[];
}

/**
 * Detect the appropriate ITR form based on income profile
 */
export function detectITRForm(profile: IncomeProfile): ITRRecommendation {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const tips: string[] = [];

    // ITR-1 Eligibility Check (Sahaj - for salaried individuals)
    const itr1Eligible = checkITR1Eligibility(profile);

    // ITR-4 Eligibility Check (Sugam - for presumptive income)
    const itr4Eligible = checkITR4Eligibility(profile);

    // ITR-3 Eligibility Check (Business/Professional)
    const itr3Eligible = checkITR3Eligibility(profile);

    // ITR-2 Eligibility Check (Capital Gains, Foreign Assets)
    const itr2Eligible = checkITR2Eligibility(profile);

    // Determine recommended form
    let recommendedForm: ITRFormType = 'ITR-2'; // Default fallback

    // Priority order: ITR-1 > ITR-4 > ITR-2 > ITR-3
    if (itr1Eligible.eligible) {
        recommendedForm = 'ITR-1';
        reasons.push('Simplest form for salaried individuals');
        reasons.push('Total income within ₹50 lakh limit');
        tips.push('ITR-1 is the easiest to file - takes about 15 minutes');
    } else if (itr4Eligible.eligible && profile.hasPresumptiveIncome) {
        recommendedForm = 'ITR-4';
        reasons.push('Presumptive taxation scheme applicable');
        reasons.push('No need to maintain detailed books of accounts');
        tips.push('Under 44AD, the presumptive rate is generally 6% for qualifying digital receipts and 8% for cash receipts; check eligibility.');
    } else if (profile.hasBusinessIncome) {
        recommendedForm = 'ITR-3';
        reasons.push('Regular business/professional income detected');
        reasons.push('Need to report P&L and Balance Sheet');
        tips.push('Ensure you have proper books of accounts');
    } else {
        recommendedForm = 'ITR-2';
        if (profile.hasCapitalGainsEquity || profile.hasCapitalGainsProperty) {
            reasons.push('Capital gains income detected');
        }
        if (profile.hasCryptoVDA) {
            reasons.push('Crypto/VDA income requires ITR-2 or above');
            tips.push('Crypto gains are taxed at 30% flat rate under Section 115BBH');
        }
        if (profile.hasForeignAssets || profile.hasForeignIncome) {
            reasons.push('Foreign assets/income requires ITR-2 or above');
            warnings.push('Ensure to fill Schedule FA correctly');
        }
        if (profile.housePropertyCount > 1) {
            reasons.push('Multiple house properties detected');
        }
    }

    // Add warnings
    if (profile.totalIncome > 5000000) {
        warnings.push('Audit may be required for income above ₹50L in certain cases');
    }
    if (profile.hasCryptoVDA) {
        warnings.push('TDS of 1% applies on crypto transfers above ₹50,000');
    }
    if (profile.agricultureAmount > 500000) {
        warnings.push('Agricultural income above ₹5L requires disclosure');
    }

    return {
        recommendedForm,
        reasons,
        eligibility: {
            'ITR-1': itr1Eligible,
            'ITR-2': itr2Eligible,
            'ITR-3': itr3Eligible,
            'ITR-4': itr4Eligible,
        },
        warnings,
        tips
    };
}

function checkITR1Eligibility(profile: IncomeProfile): { eligible: boolean; reason: string } {
    if (profile.totalIncome > 5000000) {
        return { eligible: false, reason: 'Total income exceeds ₹50 lakh limit' };
    }
    if (profile.housePropertyCount > 1) {
        return { eligible: false, reason: 'Multiple house properties not allowed' };
    }
    if (profile.hasCapitalGainsEquity || profile.hasCapitalGainsProperty || profile.hasCryptoVDA) {
        return { eligible: false, reason: 'Capital gains income not allowed in ITR-1' };
    }
    if (profile.hasBusinessIncome || profile.isProfessionalIncome) {
        return { eligible: false, reason: 'Business/Professional income not allowed' };
    }
    if (profile.hasForeignAssets || profile.hasForeignIncome) {
        return { eligible: false, reason: 'Foreign assets/income not allowed' };
    }
    if (profile.isDirector || profile.hasUnlistedShares) {
        return { eligible: false, reason: 'Directors/Unlisted shareholders not eligible' };
    }
    if (profile.agricultureAmount > 500000) {
        return { eligible: false, reason: 'Agricultural income exceeds ₹5 lakh' };
    }
    if (profile.hasLotteryIncome) {
        return { eligible: false, reason: 'Lottery/Game show income not allowed' };
    }

    return { eligible: true, reason: 'Meets all ITR-1 criteria' };
}

function checkITR2Eligibility(profile: IncomeProfile): { eligible: boolean; reason: string } {
    if (profile.hasBusinessIncome || profile.isProfessionalIncome) {
        return { eligible: false, reason: 'Business/Professional income requires ITR-3 or ITR-4' };
    }
    return { eligible: true, reason: 'Suitable for salary, capital gains, multiple properties' };
}

function checkITR3Eligibility(profile: IncomeProfile): { eligible: boolean; reason: string } {
    if (!profile.hasBusinessIncome && !profile.isProfessionalIncome) {
        return { eligible: false, reason: 'No business/professional income detected' };
    }
    return { eligible: true, reason: 'Required for business/professional income' };
}

function checkITR4Eligibility(profile: IncomeProfile): { eligible: boolean; reason: string } {
    if (!profile.hasPresumptiveIncome) {
        return { eligible: false, reason: 'No presumptive income scheme applicable' };
    }
    if (profile.totalIncome > 5000000) {
        return { eligible: false, reason: 'Total income exceeds ₹50 lakh limit for ITR-4' };
    }
    if (profile.hasCapitalGainsEquity || profile.hasCapitalGainsProperty || profile.hasCryptoVDA) {
        return { eligible: false, reason: 'Capital gains not allowed in ITR-4' };
    }
    if (profile.hasForeignAssets) {
        return { eligible: false, reason: 'Foreign assets not allowed in ITR-4' };
    }
    return { eligible: true, reason: 'Presumptive taxation applicable' };
}

/**
 * Get form complexity and estimated filing time
 */
export function getFormComplexity(form: ITRFormType): {
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedTime: string;
    schedules: string[];
} {
    const formDetails: Record<ITRFormType, { complexity: 'simple' | 'moderate' | 'complex'; estimatedTime: string; schedules: string[] }> = {
        'ITR-1': {
            complexity: 'simple',
            estimatedTime: '10-15 minutes',
            schedules: ['Personal Info', 'Income from Salary', 'House Property', 'Other Sources', 'Deductions', 'Tax Paid']
        },
        'ITR-2': {
            complexity: 'moderate',
            estimatedTime: '30-45 minutes',
            schedules: ['Personal Info', 'Salary', 'House Property', 'Capital Gains', 'Other Sources', 'Deductions', 'Schedule FA', 'Schedule VDA', 'Tax Paid']
        },
        'ITR-3': {
            complexity: 'complex',
            estimatedTime: '60-90 minutes',
            schedules: ['Personal Info', 'All Income Sources', 'P&L Account', 'Balance Sheet', 'Schedule BP', 'GST Details', 'Deductions', 'Tax Paid']
        },
        'ITR-4': {
            complexity: 'moderate',
            estimatedTime: '20-30 minutes',
            schedules: ['Personal Info', 'Presumptive Income', 'Salary', 'House Property', 'Deductions', 'Tax Paid']
        }
    };

    return formDetails[form];
}

/**
 * Get helpful tips for the recommended form
 */
export function getFormTips(form: ITRFormType): string[] {
    const tips: Record<ITRFormType, string[]> = {
        'ITR-1': [
            'Keep Form 16 ready from your employer',
            'Check your Form 26AS for TDS credits',
            'Standard deduction of ₹50,000 is automatic',
            'AIS will show all your interest income'
        ],
        'ITR-2': [
            'Gather all capital gains statements from brokers',
            'Foreign assets must be declared in Schedule FA',
            'Crypto gains go in Schedule VDA',
            'Keep buy/sell records for all transactions'
        ],
        'ITR-3': [
            'Ensure proper books of accounts are maintained',
            'GST returns should match with ITR',
            'Audit required if turnover exceeds threshold',
            'Keep all expense invoices for 8 years'
        ],
        'ITR-4': [
            '8% of turnover for digital receipts',
            '6% of turnover for cash receipts',
            'No need for detailed P&L if under 44AD',
            'Professionals can use 44ADA (50% profit)'
        ]
    };

    return tips[form];
}
