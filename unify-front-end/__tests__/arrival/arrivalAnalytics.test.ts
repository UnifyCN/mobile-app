import { renderHook } from '@testing-library/react-native';

const mockCapture = jest.fn();
jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

import { useAnalytics } from '@/utils/analytics';

beforeEach(() => mockCapture.mockClear());

const analytics = () => renderHook(() => useAnalytics()).result.current;

describe('arrival analytics', () => {
  it('sends state and days for a pre-arrival card', () => {
    analytics().trackArrivalCountdownShown({ state: 'pre_arrival', days: 40 });
    expect(mockCapture).toHaveBeenCalledWith('arrival_countdown_shown', {
      state: 'pre_arrival',
      days_until_arrival: 40,
    });
  });

  it('sends only state for the first-30-days card', () => {
    analytics().trackArrivalCountdownShown({ state: 'first_30_days' });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [name, props] = mockCapture.mock.calls[0];
    expect(name).toBe('arrival_countdown_shown');
    expect(props).toEqual({ state: 'first_30_days' });
    expect(Object.keys(props)).not.toContain('days_until_arrival');
  });

  it.each([45, 0, -12])('sends signed days %s for a changed date', days => {
    analytics().trackArrivalDateChanged(days);
    expect(mockCapture).toHaveBeenCalledWith('arrival_date_changed', {
      days_until_arrival: days,
    });
  });
});
