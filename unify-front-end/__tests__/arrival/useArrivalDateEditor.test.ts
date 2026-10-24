import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockUpdateArrivalDate = jest.fn();
jest.mock('@/services/onboarding/updateArrivalDate', () => ({
  updateArrivalDate: (...args: unknown[]) => mockUpdateArrivalDate(...args),
}));

const mockTrackChanged = jest.fn();
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackArrivalDateChanged: mockTrackChanged }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';

const TODAY = new Date(2026, 9, 23, 12, 0, 0);

type Props = { userId: string | null; arrivalDate: string | null };

const setup = (initial: Props = { userId: 'u1', arrivalDate: '2026-12-01' }) => {
  const refreshStage = jest.fn().mockResolvedValue(undefined);
  const refreshUser = jest.fn();
  const refetchChecklist = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    (props: Props) =>
      useArrivalDateEditor({
        ...props,
        refreshStage,
        refreshUser,
        refetchChecklist,
      }),
    { initialProps: initial }
  );
  return { ...hook, refreshStage, refreshUser, refetchChecklist };
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TODAY);
  jest.clearAllMocks();
  mockUpdateArrivalDate.mockResolvedValue({
    id: 'u1',
    arrival_date: '2026-12-15',
    stage: 0,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('opening', () => {
  it('opens only when the user has an arrival date', () => {
    const withDate = setup();
    act(() => withDate.result.current.open());
    expect(withDate.result.current.isOpen).toBe(true);

    const noDate = setup({ userId: 'u1', arrivalDate: null });
    act(() => noDate.result.current.open());
    expect(noDate.result.current.isOpen).toBe(false);
  });

  it('dismissing changes nothing', () => {
    const { result, refreshStage } = setup();
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(mockUpdateArrivalDate).not.toHaveBeenCalled();
    expect(refreshStage).not.toHaveBeenCalled();
  });
});

describe('saving a changed date', () => {
  it('writes, refreshes stage, user, and checklist, and tracks the new date', async () => {
    const { result, refreshStage, refreshUser, refetchChecklist } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    expect(mockUpdateArrivalDate).toHaveBeenCalledWith('u1', '2026-12-15');
    expect(refreshStage).toHaveBeenCalledTimes(1);
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(refetchChecklist).toHaveBeenCalledTimes(1);
    expect(mockTrackChanged).toHaveBeenCalledTimes(1);
    expect(mockTrackChanged).toHaveBeenCalledWith(53);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('tracks negative days for a past date', async () => {
    const { result } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-10-13');
    });
    expect(mockTrackChanged).toHaveBeenCalledWith(-10);
  });

  it('does nothing when the date is unchanged', async () => {
    const { result } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-01');
    });
    expect(mockUpdateArrivalDate).not.toHaveBeenCalled();
    expect(mockTrackChanged).not.toHaveBeenCalled();
  });

  it('ignores a second save while one is in flight', async () => {
    const write = deferred<unknown>();
    mockUpdateArrivalDate.mockReturnValue(write.promise);
    const { result } = setup();
    act(() => result.current.open());
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.save('2026-12-15');
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => {
      await result.current.save('2027-01-01');
    });
    expect(mockUpdateArrivalDate).toHaveBeenCalledTimes(1);
    await act(async () => {
      write.resolve({ id: 'u1', arrival_date: '2026-12-15', stage: 0 });
      await first;
    });
  });
});

describe('failure', () => {
  it('keeps the sheet open, shows the error, and skips refresh and event', async () => {
    mockUpdateArrivalDate.mockRejectedValue(new Error('rls'));
    const { result, refreshStage, refreshUser, refetchChecklist } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'common.error',
      'checklist.arrivalDate.saveError'
    );
    expect(refreshStage).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(refetchChecklist).not.toHaveBeenCalled();
    expect(mockTrackChanged).not.toHaveBeenCalled();
  });

  it('can retry after a failure', async () => {
    mockUpdateArrivalDate.mockRejectedValueOnce(new Error('network'));
    const { result } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    expect(mockUpdateArrivalDate).toHaveBeenCalledTimes(2);
    expect(result.current.isOpen).toBe(false);
  });
});

describe('after a successful write', () => {
  it('does not report failure when analytics throws', async () => {
    mockTrackChanged.mockImplementation(() => {
      throw new Error('posthog down');
    });
    const { result, refreshStage } = setup();
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
    expect(refreshStage).toHaveBeenCalled();
    mockTrackChanged.mockReset();
  });

  it('does not report failure when a refresh rejects', async () => {
    const { result, refreshStage, refetchChecklist } = setup();
    refreshStage.mockRejectedValue(new Error('offline'));
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2026-12-15');
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
    expect(refetchChecklist).toHaveBeenCalled();
  });
});

describe('account changes', () => {
  it('drops the result of a save that finishes after the account changed', async () => {
    const write = deferred<unknown>();
    mockUpdateArrivalDate.mockReturnValue(write.promise);
    const { result, rerender, refreshStage, refreshUser, refetchChecklist } =
      setup();
    act(() => result.current.open());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.save('2026-12-15');
    });
    rerender({ userId: 'u2', arrivalDate: '2027-02-01' });
    await act(async () => {
      write.resolve({ id: 'u1', arrival_date: '2026-12-15', stage: 0 });
      await pending;
    });
    expect(refreshStage).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(refetchChecklist).not.toHaveBeenCalled();
    expect(mockTrackChanged).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('shows no error for a failed save that finishes after the account changed', async () => {
    const write = deferred<unknown>();
    mockUpdateArrivalDate.mockReturnValue(write.promise);
    const { result, rerender } = setup();
    act(() => result.current.open());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.save('2026-12-15');
    });
    rerender({ userId: 'u2', arrivalDate: '2027-02-01' });
    await act(async () => {
      write.reject(new Error('rls'));
      await pending;
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('closes the sheet and lets the new account save', async () => {
    const { result, rerender } = setup();
    act(() => result.current.open());
    rerender({ userId: 'u2', arrivalDate: '2027-02-01' });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
    act(() => result.current.open());
    await act(async () => {
      await result.current.save('2027-03-01');
    });
    expect(mockUpdateArrivalDate).toHaveBeenCalledWith('u2', '2027-03-01');
  });
});
