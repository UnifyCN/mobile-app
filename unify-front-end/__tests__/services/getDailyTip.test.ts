/**
 * The daily-tip request tells the server this device's calendar day, so the
 * tip's stage and arrival wording match what the app shows.
 */
const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import { getDailyTip } from '@/services/tips/getDailyTip';

const tipRow = {
  id: 't1',
  persona: 'skilled_worker',
  stage: '0',
  date: '2026-10-24',
  category: 'general',
  title: 'Title',
  description: 'Description',
  tip_text: 'Text',
  source_refs: null,
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { tip: tipRow }, error: null });
});

describe('getDailyTip', () => {
  it('sends the device calendar day, not the UTC day', async () => {
    // 2026-10-24 00:30 UTC is still October 23 in Vancouver. Build the Date
    // from local parts so the test holds in any zone.
    await getDailyTip(new Date(2026, 9, 23, 17, 30));
    expect(mockInvoke).toHaveBeenCalledWith('get-daily-tip', {
      headers: { 'x-local-date': '2026-10-23' },
    });
  });

  it('uses today on this device when no date is given', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 23, 59));
    try {
      await getDailyTip();
      expect(mockInvoke).toHaveBeenCalledWith('get-daily-tip', {
        headers: { 'x-local-date': '2026-10-23' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('still maps the tip and reports a server error', async () => {
    await expect(getDailyTip(new Date(2026, 9, 23))).resolves.toMatchObject({
      id: 't1',
      tipText: 'Text',
    });
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'bad date' },
    });
    await expect(getDailyTip(new Date(2026, 9, 23))).rejects.toThrow(
      /bad date/
    );
  });
});
