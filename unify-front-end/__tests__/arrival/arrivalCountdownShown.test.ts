import AsyncStorage from '@react-native-async-storage/async-storage';

// One store shared by every isolated module copy, so a "restart" keeps data.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    getAllKeys: jest.fn(async () => [...mockStore.keys()]),
    clear: jest.fn(async () => mockStore.clear()),
  },
}));

type Mod = typeof import('@/utils/arrivalCountdownShown');

const load = (): Mod => {
  let mod!: Mod;
  jest.isolateModules(() => {
    mod = require('@/utils/arrivalCountdownShown');
  });
  return mod;
};

beforeEach(async () => {
  mockStore.clear();
  jest.restoreAllMocks();
});

const always = () => true;

describe('trackArrivalCountdownShownOnce', () => {
  it('emits once for concurrent callers on the same user and day', async () => {
    const { trackArrivalCountdownShownOnce } = load();
    const emit = jest.fn();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        trackArrivalCountdownShownOnce({
          userId: 'u1',
          day: '2026-10-23',
          isCurrent: always,
          emit,
        })
      )
    );
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('stores a durable marker keyed by user and local day', async () => {
    const { trackArrivalCountdownShownOnce } = load();
    await trackArrivalCountdownShownOnce({
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: always,
      emit: jest.fn(),
    });
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('u1');
    expect(keys[0]).toContain('2026-10-23');
  });

  it('does not emit again after an app restart on the same day', async () => {
    const first = load();
    await first.trackArrivalCountdownShownOnce({
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: always,
      emit: jest.fn(),
    });
    const restarted = load();
    const emit = jest.fn();
    await restarted.trackArrivalCountdownShownOnce({
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: always,
      emit,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits again on a new day and for a different user', async () => {
    const { trackArrivalCountdownShownOnce } = load();
    const emit = jest.fn();
    const base = { isCurrent: always, emit };
    await trackArrivalCountdownShownOnce({
      ...base,
      userId: 'u1',
      day: '2026-10-23',
    });
    await trackArrivalCountdownShownOnce({
      ...base,
      userId: 'u1',
      day: '2026-10-24',
    });
    await trackArrivalCountdownShownOnce({
      ...base,
      userId: 'u2',
      day: '2026-10-24',
    });
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('neither emits nor marks when the account is no longer current', async () => {
    const { trackArrivalCountdownShownOnce } = load();
    const staleEmit = jest.fn();
    await trackArrivalCountdownShownOnce({
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: () => false,
      emit: staleEmit,
    });
    expect(staleEmit).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toHaveLength(0);

    const emit = jest.fn();
    await trackArrivalCountdownShownOnce({
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: always,
      emit,
    });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('still dedupes in memory when storage fails, and never throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('read'));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('write'));
    const { trackArrivalCountdownShownOnce } = load();
    const emit = jest.fn();
    const args = {
      userId: 'u1',
      day: '2026-10-23',
      isCurrent: always,
      emit,
    };
    await expect(
      Promise.all([
        trackArrivalCountdownShownOnce(args),
        trackArrivalCountdownShownOnce(args),
      ])
    ).resolves.toBeDefined();
    await trackArrivalCountdownShownOnce(args);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does not throw when emit throws', async () => {
    const { trackArrivalCountdownShownOnce } = load();
    await expect(
      trackArrivalCountdownShownOnce({
        userId: 'u1',
        day: '2026-10-23',
        isCurrent: always,
        emit: () => {
          throw new Error('posthog');
        },
      })
    ).resolves.toBeUndefined();
  });
});
