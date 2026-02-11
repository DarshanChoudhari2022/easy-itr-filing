/**
 * usePlanGuard Hook — Provides plan-checking utilities to any component
 * Combines user's plan from Supabase with plan-guard.ts feature matrix
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { getUserPlan } from '@/lib/supabase-data-service';
import { canAccess, isWithinLimit, getRequiredPlan, Plan, Feature, PLAN_LIMITS } from '@/lib/plan-guard';
import UpgradePrompt from '@/components/UpgradePrompt';

interface PlanGuardState {
    plan: Plan;
    loading: boolean;
    error: string | null;
}

export function usePlanGuard() {
    const [state, setState] = useState<PlanGuardState>({
        plan: 'free',
        loading: true,
        error: null,
    });

    useEffect(() => {
        let mounted = true;
        getUserPlan()
            .then(result => {
                if (mounted) {
                    setState({
                        plan: result.plan as Plan,
                        loading: false,
                        error: null,
                    });
                }
            })
            .catch(err => {
                if (mounted) {
                    setState({
                        plan: 'free', // Default to free on error
                        loading: false,
                        error: err.message,
                    });
                }
            });
        return () => { mounted = false; };
    }, []);

    const checkAccess = useCallback((feature: Feature): boolean => {
        return canAccess(state.plan, feature);
    }, [state.plan]);

    const checkLimit = useCallback((
        limitType: keyof typeof PLAN_LIMITS['free'],
        currentCount: number
    ): boolean => {
        return isWithinLimit(state.plan, limitType, currentCount);
    }, [state.plan]);

    const requiredPlan = useCallback((feature: Feature): Plan => {
        return getRequiredPlan(feature);
    }, []);

    return {
        plan: state.plan,
        loading: state.loading,
        error: state.error,
        checkAccess,
        checkLimit,
        requiredPlan,
    };
}

/**
 * PlanGate Component — Wraps content that requires a specific feature
 * Shows UpgradePrompt if user's plan doesn't include the feature
 */
interface PlanGateProps {
    feature: Feature;
    children: ReactNode;
    variant?: 'card' | 'inline';
    fallback?: ReactNode;
}

export function PlanGate({ feature, children, variant = 'card', fallback }: PlanGateProps) {
    const { plan, loading, checkAccess } = usePlanGuard();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!checkAccess(feature)) {
        if (fallback) return <>{fallback}</>;
        return <UpgradePrompt feature={feature} currentPlan={plan} variant={variant} />;
    }

    return <>{children}</>;
}
