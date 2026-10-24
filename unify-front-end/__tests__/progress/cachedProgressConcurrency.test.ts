import { cachedProgressService } from '@/services/progress/cachedProgressService';
import { progressClient } from '@/services/progress/progressClient';
import { sanityClient } from '@/sanity-custom';

let mockAuthChange: (event: string, session: any) => void;
jest.mock('@/services/progress/progressClient', () => ({
  progressClient: {
    auth: {
      onAuthStateChange: jest.fn(fn => {
        mockAuthChange = fn;
      }),
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));
jest.mock('@/sanity-custom', () => ({ sanityClient: { fetch: jest.fn() } }));
const auth = progressClient.auth.getUser as jest.Mock;
const from = progressClient.from as jest.Mock;
const fetchContent = sanityClient.fetch as jest.Mock;
const tree = [
  { _id: 'm', submodules: [{ _id: 's', lessons: [{ _id: 'l' }] }] },
];
const rows = [
  {
    sanity_submodule_id: 's',
    sanity_lesson_id: 'l',
    progress_percent: 50,
    is_completed: false,
  },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
function setUser(id: string | null) {
  mockAuthChange('SIGNED_IN', id ? { user: { id } } : null);
  auth.mockResolvedValue({ data: { user: id ? { id } : null }, error: null });
}
beforeEach(() => {
  jest.clearAllMocks();
  setUser(null);
  setUser('a');
  from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: rows, error: null }) }),
  });
  fetchContent.mockResolvedValue(tree);
});

test('six simultaneous module reads share one progress load', async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      cachedProgressService.getSubmoduleProgress('m', 's')
    )
  );
  expect(results.map(r => r.progress_percent)).toEqual([
    50, 50, 50, 50, 50, 50,
  ]);
  expect(auth).toHaveBeenCalledTimes(1);
  expect(from).toHaveBeenCalledTimes(1);
  expect(fetchContent).toHaveBeenCalledTimes(1);
});

test('an account change cannot return or cache an earlier account response', async () => {
  const blocked = deferred<any>();
  from.mockReturnValueOnce({ select: () => ({ eq: () => blocked.promise }) });
  const old = cachedProgressService.getProgressData();
  await Promise.resolve();
  setUser('b');
  from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  const current = await cachedProgressService.getProgressData();
  blocked.resolve({ data: rows, error: null });
  expect(await old).toEqual({});
  expect(current.m.s.progress_percent).toBe(0);
  expect(
    (await cachedProgressService.getProgressData()).m.s.progress_percent
  ).toBe(0);
});

test('invalidation during a read requires a new read and rejects the stale cache write', async () => {
  const blocked = deferred<any>();
  from.mockReturnValueOnce({ select: () => ({ eq: () => blocked.promise }) });
  const old = cachedProgressService.getProgressData();
  await Promise.resolve();
  cachedProgressService.invalidate();
  from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  await cachedProgressService.getProgressData();
  blocked.resolve({ data: rows, error: null });
  expect((await old).m.s.progress_percent).toBe(0);
  expect(
    (await cachedProgressService.getProgressData()).m.s.progress_percent
  ).toBe(0);
});

test('a forced refresh after a write does not join the previous read', async () => {
  const blocked = deferred<any>();
  from.mockReturnValueOnce({ select: () => ({ eq: () => blocked.promise }) });
  const old = cachedProgressService.getProgressData();
  await Promise.resolve();
  from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  const refreshed = await cachedProgressService.refreshProgress();
  blocked.resolve({ data: rows, error: null });
  expect((await old).m.s.progress_percent).toBe(0);
  expect(refreshed.m.s.progress_percent).toBe(0);
  expect(
    (await cachedProgressService.getProgressData()).m.s.progress_percent
  ).toBe(0);
});

test('a failed shared read can be retried immediately', async () => {
  from.mockReturnValueOnce({
    select: () => ({
      eq: async () => ({ data: null, error: new Error('offline') }),
    }),
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await cachedProgressService.getProgressData()).toEqual({});
    expect(
      (await cachedProgressService.getProgressData()).m.s.progress_percent
    ).toBe(50);
    expect(from).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});

test.each(['auth', 'database'])(
  'an old account %s error cannot return the new account cache',
  async stage => {
    const blocked = deferred<any>();
    if (stage === 'auth') auth.mockReturnValueOnce(blocked.promise);
    else
      from.mockReturnValueOnce({
        select: () => ({ eq: () => blocked.promise }),
      });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const old = cachedProgressService.getProgressData();
      await Promise.resolve();
      setUser('b');
      await cachedProgressService.getProgressData();
      blocked.reject(new Error('offline'));
      expect(await old).toEqual({});
      expect(
        (await cachedProgressService.getProgressData()).m.s.progress_percent
      ).toBe(50);
    } finally {
      log.mockRestore();
    }
  }
);

test.each(['success', 'error'])(
  'a delayed auth notification isolates the earlier account on %s',
  async outcome => {
    const blocked = deferred<any>();
    from.mockReturnValueOnce({ select: () => ({ eq: () => blocked.promise }) });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const old = cachedProgressService.getProgressData();
      await Promise.resolve();
      // The verified user changes before the listener notification arrives.
      auth.mockResolvedValue({ data: { user: { id: 'b' } }, error: null });
      const current = await cachedProgressService.refreshProgress();
      if (outcome === 'success') blocked.resolve({ data: rows, error: null });
      else blocked.reject(new Error('offline'));
      expect(await old).toEqual({});
      expect(current.m.s.progress_percent).toBe(50);
      mockAuthChange('SIGNED_IN', { user: { id: 'b' } });
      expect(
        (await cachedProgressService.getProgressData()).m.s.progress_percent
      ).toBe(50);
    } finally {
      log.mockRestore();
    }
  }
);
