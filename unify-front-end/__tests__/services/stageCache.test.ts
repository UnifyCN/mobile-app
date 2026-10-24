/**
 * The stored stage is a cache. These tests pin what the app writes to it
 * and what it returns, for a frozen "today" of local 2026-10-23.
 */
const mockEq = jest.fn();
const mockUpdate = jest.fn((_values: unknown) => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { syncStageCache } from '@/services/onboarding/syncStageCache';
import type { StageNumber } from '@/types/checklist';

describe('syncStageCache', () => {
  beforeEach(() => {
    mockEq.mockReset().mockResolvedValue({ error: null });
    mockUpdate.mockClear();
    mockFrom.mockClear();
  });

  it.each<[string, unknown, StageNumber | null, StageNumber | null]>([
    ['stale stored stage', '1', 2, 2],
    ['no stored stage yet', null, 3, 3],
    ['null transition: date removed', '1', null, null],
    ['null transition: unparseable stored value', 'garbage', null, null],
    ['numeric column value', 4, 0, 0],
  ])('writes the new stage for %s', async (_name, stored, computed, written) => {
    await expect(syncStageCache('user-1', stored, computed)).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('user_onboarding_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ stage: written });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it.each<[string, unknown, StageNumber | null]>([
    ['matching enum label', '2', 2],
    ['matching number', 2, 2],
    ['both unknown (null)', null, null],
    ['both unknown (undefined)', undefined, null],
  ])('does not write for %s', async (_name, stored, computed) => {
    await expect(syncStageCache('user-1', stored, computed)).resolves.toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports a failed cache write without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockEq.mockResolvedValue({ error: { message: 'denied' } });
    await expect(syncStageCache('user-1', '1', 2)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a thrown write', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockEq.mockRejectedValue(new Error('network'));
    await expect(syncStageCache('user-1', '1', 2)).resolves.toBe(false);
    warn.mockRestore();
  });
});
