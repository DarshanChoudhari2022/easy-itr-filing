import { describe, expect, it, vi, beforeEach } from 'vitest';
import { syncCryptoToFiling } from './crypto-itr-bridge';
import { fetchOverview, fetchScheduleVDA, checkDataQuality } from './easyitr/api-client';
import { saveFilingSession } from './filing-session';

vi.mock('./easyitr/api-client', () => ({ fetchOverview: vi.fn(), fetchScheduleVDA: vi.fn(), checkDataQuality: vi.fn() }));
vi.mock('./filing-session', () => ({ saveFilingSession: vi.fn(), getOrCreateSession: vi.fn() }));

describe('crypto sync fails closed', () => {
    beforeEach(() => vi.resetAllMocks());
    it('never substitutes hard-coded amounts on API failure', async () => {
        vi.mocked(fetchOverview).mockRejectedValue(new Error('Not authenticated'));
        const result = await syncCryptoToFiling('test', 'FY2025-26');
        expect(result.success).toBe(false);
        expect(saveFilingSession).not.toHaveBeenCalled();
    });
    it('does not sync when quality checks are unavailable', async () => {
        vi.mocked(checkDataQuality).mockRejectedValue(new Error('Quality check unavailable'));
        vi.mocked(fetchOverview).mockResolvedValue({ not_computed: true } as Awaited<ReturnType<typeof fetchOverview>>);
        vi.mocked(fetchScheduleVDA).mockRejectedValue(new Error('Schedule unavailable'));
        expect((await syncCryptoToFiling('test', 'FY2025-26')).success).toBe(false);
        expect(saveFilingSession).not.toHaveBeenCalled();
    });
});
