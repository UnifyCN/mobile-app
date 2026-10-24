import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

let mockFocusCallbacks: Array<() => void | (() => void)> = [];
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(cb);
        return cb();
      }, [cb]);
    },
  };
});

import { useRefreshingToday } from '@/hooks/checklist/useRefreshingToday';
import { formatLocalDate } from '@/helpers/arrivalDate';

let appStateListener: ((state: string) => void) | null = null;
const removeListener = jest.fn();

beforeEach(() => {
  mockFocusCallbacks = [];
  appStateListener = null;
  removeListener.mockClear();
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 23, 23, 59, 0));
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: string) => void
  ) => {
    appStateListener = listener;
    return { remove: removeListener };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const day = (date: Date) => formatLocalDate(date);

describe('useRefreshingToday', () => {
  it('starts on the current local day', () => {
    const { result } = renderHook(() => useRefreshingToday());
    expect(day(result.current)).toBe('2026-10-23');
  });

  it('rolls over to the next day when the app returns to the foreground', () => {
    const { result } = renderHook(() => useRefreshingToday());
    jest.setSystemTime(new Date(2026, 9, 24, 0, 1, 0));
    expect(day(result.current)).toBe('2026-10-23');
    act(() => appStateListener?.('active'));
    expect(day(result.current)).toBe('2026-10-24');
  });

  it('ignores background and inactive states', () => {
    const { result } = renderHook(() => useRefreshingToday());
    jest.setSystemTime(new Date(2026, 9, 24, 0, 1, 0));
    act(() => appStateListener?.('background'));
    act(() => appStateListener?.('inactive'));
    expect(day(result.current)).toBe('2026-10-23');
  });

  it('rolls over when the Checklist tab gains focus', () => {
    const { result } = renderHook(() => useRefreshingToday());
    jest.setSystemTime(new Date(2026, 9, 24, 0, 1, 0));
    act(() => {
      mockFocusCallbacks[mockFocusCallbacks.length - 1]();
    });
    expect(day(result.current)).toBe('2026-10-24');
  });

  it('keeps the same value when the day has not changed', () => {
    const { result } = renderHook(() => useRefreshingToday());
    const first = result.current;
    jest.setSystemTime(new Date(2026, 9, 23, 23, 59, 59));
    act(() => appStateListener?.('active'));
    expect(result.current).toBe(first);
  });

  it('removes the foreground listener on unmount', () => {
    const { unmount } = renderHook(() => useRefreshingToday());
    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
