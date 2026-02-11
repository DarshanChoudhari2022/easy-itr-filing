/**
 * Plan Guard — Feature Flag Enforcement System
 * Controls access to features based on user's subscription plan
 * 
 * Plans:
 *   - free:   ITR-1 only, no crypto, basic AIS, limited AI
 *   - pro:    All ITR forms, crypto module, full AIS, unlimited AI
 *   - expert: Everything in Pro + CA review workflows
 */

export type Plan = 'free' | 'pro' | 'expert';

export type Feature =
    | 'itr1'
    | 'itr2'
    | 'itr3'
    | 'itr4'
    | 'crypto'
    | 'ais_full'
    | 'ais_basic'
    | 'regime_optimizer'
    | 'form16_import'
    | 'form16_unlimited'
    | 'ai_assistant'
    | 'ai_unlimited'
    | 'ca_review'
    | 'tax_planning_call'
    | 'document_preparation'
    | 'priority_support'
    | 'multi_return'
    | 'foreign_compliance'
    | 'gst_center'
    | 'family_dashboard'
    | 'audit_logs'
    | 'pdf_reports';

/**
 * Feature access matrix per plan
 */
const PLAN_FEATURES: Record<Plan, Feature[]> = {
    free: [
        'itr1',
        'ais_basic',
        'regime_optimizer',
        'form16_import',
        'ai_assistant',
    ],
    pro: [
        'itr1', 'itr2', 'itr3', 'itr4',
        'crypto',
        'ais_basic', 'ais_full',
        'regime_optimizer',
        'form16_import', 'form16_unlimited',
        'ai_assistant', 'ai_unlimited',
        'priority_support',
        'multi_return',
        'foreign_compliance',
        'gst_center',
        'family_dashboard',
        'audit_logs',
        'pdf_reports',
    ],
    expert: [
        'itr1', 'itr2', 'itr3', 'itr4',
        'crypto',
        'ais_basic', 'ais_full',
        'regime_optimizer',
        'form16_import', 'form16_unlimited',
        'ai_assistant', 'ai_unlimited',
        'ca_review',
        'tax_planning_call',
        'document_preparation',
        'priority_support',
        'multi_return',
        'foreign_compliance',
        'gst_center',
        'family_dashboard',
        'audit_logs',
        'pdf_reports',
    ],
};

/**
 * Rate limits per plan
 */
export const PLAN_LIMITS: Record<Plan, {
    maxReturnsPerAY: number;
    maxForm16Uploads: number;
    maxAIQueriesPerDay: number;
    maxCryptoTrades: number;
    maxFamilyMembers: number;
}> = {
    free: {
        maxReturnsPerAY: 1,
        maxForm16Uploads: 1,
        maxAIQueriesPerDay: 5,
        maxCryptoTrades: 0,
        maxFamilyMembers: 0,
    },
    pro: {
        maxReturnsPerAY: 5,
        maxForm16Uploads: 10,
        maxAIQueriesPerDay: 100,
        maxCryptoTrades: 10000,
        maxFamilyMembers: 5,
    },
    expert: {
        maxReturnsPerAY: -1, // Unlimited
        maxForm16Uploads: -1,
        maxAIQueriesPerDay: -1,
        maxCryptoTrades: -1,
        maxFamilyMembers: -1,
    },
};

/**
 * Plan display info
 */
export const PLAN_INFO: Record<Plan, {
    name: string;
    price: string;
    period: string;
    description: string;
    highlight: string;
}> = {
    free: {
        name: 'Free',
        price: '₹0',
        period: '',
        description: 'For simple ITR-1 filing',
        highlight: 'ITR-1 filing with basic features',
    },
    pro: {
        name: 'Pro',
        price: '₹499',
        period: '/year',
        description: 'For investors, crypto holders & freelancers',
        highlight: 'All ITR forms + Crypto + Full AIS',
    },
    expert: {
        name: 'Expert Assisted',
        price: '₹1,999',
        period: '/filing',
        description: 'CA-reviewed filing with full support',
        highlight: 'Everything in Pro + Dedicated CA',
    },
};

/**
 * Check if a user's plan allows access to a specific feature
 */
export function canAccess(userPlan: Plan, feature: Feature): boolean {
    return PLAN_FEATURES[userPlan]?.includes(feature) ?? false;
}

/**
 * Check if user is within rate limits
 */
export function isWithinLimit(
    userPlan: Plan,
    limitType: keyof typeof PLAN_LIMITS['free'],
    currentCount: number
): boolean {
    const limit = PLAN_LIMITS[userPlan][limitType];
    if (limit === -1) return true; // Unlimited
    return currentCount < limit;
}

/**
 * Get the minimum plan required for a feature
 */
export function getRequiredPlan(feature: Feature): Plan {
    if (PLAN_FEATURES.free.includes(feature)) return 'free';
    if (PLAN_FEATURES.pro.includes(feature)) return 'pro';
    return 'expert';
}

/**
 * Get all features available for a plan
 */
export function getPlanFeatures(plan: Plan): Feature[] {
    return PLAN_FEATURES[plan];
}

/**
 * Get user-facing feature name
 */
export function getFeatureDisplayName(feature: Feature): string {
    const names: Record<Feature, string> = {
        itr1: 'ITR-1 (Sahaj) Filing',
        itr2: 'ITR-2 Filing',
        itr3: 'ITR-3 Filing',
        itr4: 'ITR-4 (Sugam) Filing',
        crypto: 'Crypto Tax Engine',
        ais_basic: 'Basic AIS Reconciliation',
        ais_full: 'Full AIS Reconciliation',
        regime_optimizer: 'Regime Optimizer',
        form16_import: 'Form 16 Import',
        form16_unlimited: 'Unlimited Form 16 Imports',
        ai_assistant: 'AI Tax Assistant',
        ai_unlimited: 'Unlimited AI Queries',
        ca_review: 'CA-Reviewed Filing',
        tax_planning_call: 'Tax Planning Call',
        document_preparation: 'Document Preparation',
        priority_support: 'Priority Support',
        multi_return: 'Multiple Returns per AY',
        foreign_compliance: 'Foreign Asset Compliance',
        gst_center: 'GST Center',
        family_dashboard: 'Family Dashboard',
        audit_logs: 'Audit Logs',
        pdf_reports: 'PDF Reports',
    };
    return names[feature] || feature;
}

/**
 * Map ITR form type to required feature
 */
export function getITRFormFeature(formType: string): Feature {
    switch (formType) {
        case 'ITR-1': return 'itr1';
        case 'ITR-2': return 'itr2';
        case 'ITR-3': return 'itr3';
        case 'ITR-4': return 'itr4';
        default: return 'itr1';
    }
}
