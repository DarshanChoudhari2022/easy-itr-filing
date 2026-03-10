/**
 * useFilingSession — React hook for the central filing session
 * 
 * Provides the filing session state, auto-save, and helper methods
 * to all wizard steps. Auto-saves on every change.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
    FilingSession,
    getOrCreateSession,
    saveFilingSession,
    validateSession,
    autoDetectITRForm,
    computeGrossTotalIncome,
    computeTotalTDS,
    getFilingProgress,
    getEnabledIncomeTypes,
    createDefaultSession,
} from '@/lib/filing-session';

export function useFilingSession(financialYear: string) {
    const { user } = useAuth();
    const [session, setSession] = useState<FilingSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load session on mount
    useEffect(() => {
        if (!user?.id || !financialYear) return;
        (async () => {
            setLoading(true);
            try {
                const s = await getOrCreateSession(user.id, financialYear);
                setSession(s);
            } catch (e) {
                console.error('[useFilingSession] Load failed:', e);
                // Create a default session if load fails
                setSession(createDefaultSession(user.id, financialYear));
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id, financialYear]);

    // Auto-save with debounce
    const debouncedSave = useCallback(async (updated: FilingSession) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                await saveFilingSession(updated);
            } catch (e) {
                console.warn('[useFilingSession] Save failed:', e);
            } finally {
                setSaving(false);
            }
        }, 500);
    }, []);

    // Update session and trigger auto-save
    const updateSession = useCallback((updater: (prev: FilingSession) => FilingSession) => {
        setSession(prev => {
            if (!prev) return prev;
            const updated = updater(prev);
            debouncedSave(updated);
            return updated;
        });
    }, [debouncedSave]);

    // Helpers
    const validation = session ? validateSession(session) : { errors: [], warnings: [] };
    const itrForm = session ? autoDetectITRForm(session) : { form: 'auto' as const, reason: '' };
    const grossIncome = session ? computeGrossTotalIncome(session) : 0;
    const totalTDS = session ? computeTotalTDS(session) : 0;
    const progress = session ? getFilingProgress(session) : 0;
    const incomeTypes = session ? getEnabledIncomeTypes(session) : [];

    // Force save (for critical moments like step completion)
    const forceSave = useCallback(async () => {
        if (!session) return;
        setSaving(true);
        try {
            await saveFilingSession(session);
        } catch (e) {
            console.warn('[useFilingSession] Force save failed:', e);
        } finally {
            setSaving(false);
        }
    }, [session]);

    return {
        session,
        loading,
        saving,
        updateSession,
        forceSave,
        validation,
        itrForm,
        grossIncome,
        totalTDS,
        progress,
        incomeTypes,
    };
}
