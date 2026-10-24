const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { updateArrivalDate } from '@/services/onboarding/updateArrivalDate';

const TODAY = new Date(2026, 9, 23, 12, 0, 0);

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TODAY);
  jest.clearAllMocks();
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ select: mockSelect });
  mockSelect.mockResolvedValue({
    data: [{ id: 'u1', arrival_date: '2026-12-01', stage: 0 }],
    error: null,
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('updateArrivalDate', () => {
  it('updates only the date and stage of the user row', async () => {
    await updateArrivalDate('u1', '2026-12-01');
    expect(mockFrom).toHaveBeenCalledWith('user_onboarding_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({
      arrival_date: '2026-12-01',
      stage: 0,
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('writes the stage that matches the new date', async () => {
    mockSelect.mockResolvedValue({
      data: [{ id: 'u1', arrival_date: '2025-01-10', stage: 3 }],
      error: null,
    });
    await updateArrivalDate('u1', '2025-01-10');
    expect(mockUpdate).toHaveBeenCalledWith({
      arrival_date: '2025-01-10',
      stage: 3,
    });
  });

  it('returns the confirmed row', async () => {
    await expect(updateArrivalDate('u1', '2026-12-01')).resolves.toEqual({
      id: 'u1',
      arrival_date: '2026-12-01',
      stage: 0,
    });
  });

  it('fails when the update returns no row', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    await expect(updateArrivalDate('u1', '2026-12-01')).rejects.toThrow();
  });

  it('fails when the returned date is not the requested date', async () => {
    mockSelect.mockResolvedValue({
      data: [{ id: 'u1', arrival_date: '2026-01-01', stage: 1 }],
      error: null,
    });
    await expect(updateArrivalDate('u1', '2026-12-01')).rejects.toThrow();
  });

  it('fails on a database error', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(updateArrivalDate('u1', '2026-12-01')).rejects.toThrow(/boom/);
  });

  it.each(['not-a-date', '2026-02-30', '2020-01-01', '2031-01-01'])(
    'rejects %s before any network call',
    async value => {
      await expect(updateArrivalDate('u1', value)).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    }
  );
});
