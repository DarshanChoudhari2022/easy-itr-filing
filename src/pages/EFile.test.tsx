import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSession } from '@/lib/filing-session';
import { EMPTY_PORTAL_JOURNEY } from '@/lib/filing-readiness';
import EFile from './EFile';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useFilingSession', () => ({ useFilingSession: () => ({ session, loading: false, saving: false, updateSession: vi.fn(), validation: { errors: [] }, itrForm: { form: 'ITR-2' } }) }));
let session = createDefaultSession('test-user', 'FY2025-26');
const render = () => renderToStaticMarkup(<MemoryRouter><EFile /></MemoryRouter>);

describe('beginner portal handoff', () => {
    it('asks about the government account and provides registration steps', () => {
        session = createDefaultSession('test-user', 'FY2025-26');
        const html = render();
        expect(html).toContain('Do you already have an account on incometax.gov.in?');
        expect(html).toContain('Forgot Password');
        expect(html).toContain('No valid submission receipt recorded.');
        expect(html).toContain('Automatic government submission is not connected.');
    });
    it('does not equate submission with e-verification', () => {
        session.portalJourney = { ...EMPTY_PORTAL_JOURNEY, acknowledgement: '123456789012345', submittedOn: '2026-01-01' };
        expect(render()).toContain('E-verification is pending.');
        session.portalJourney.verifiedOn = '2026-01-02';
        expect(render()).toContain('Portal processing is separate.');
    });
});
