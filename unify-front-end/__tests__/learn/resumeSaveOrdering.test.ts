import { saveResumePosition } from '@/services/progress/progressService';

const mockGetUser = jest.fn();
const mockUpsert = jest.fn();
jest.mock('@/services/progress/progressClient', () => ({
  progressClient: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
  },
}));
jest.mock('@/utils/progressEventEmitter', () => ({ progressEventEmitter: { emit: jest.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'learner' } } });
});

test('serializes forward saves and a later deliberate Back visit', async () => {
  const first = deferred<{ error: null }>();
  const stored: number[] = [];
  mockUpsert.mockImplementation(async (row: { current_page_number: number }) => {
    if (mockUpsert.mock.calls.length === 1) await first.promise;
    stored.push(row.current_page_number);
    return { error: null };
  });
  const a = saveResumePosition('ordering', 'sub', 'module', 'ending', 1);
  const b = saveResumePosition('ordering', 'sub', 'module', 'ending', 2);
  const back = saveResumePosition('ordering', 'sub', 'module', 'ending', 1);
  await flush();
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(stored).toEqual([]);
  first.resolve({ error: null });
  expect(await Promise.all([a, b, back])).toEqual([true, true, true]);
  expect(stored).toEqual([1, 2, 1]);
});

test('a failed save returns false and does not block a later retry', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUpsert.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValueOnce({ error: null });
  const a = saveResumePosition('retry', 'sub', 'module', 'ending', 1);
  const b = saveResumePosition('retry', 'sub', 'module', 'ending', 2);
  expect(await Promise.all([a, b])).toEqual([false, true]);
  expect(mockUpsert.mock.calls.map(call => call[0].current_page_number)).toEqual([1, 2]);
  errorLog.mockRestore();
});

test('captures the learner for each invocation before queued writes run', async () => {
  const first = deferred<{ error: null }>();
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'a' } } }).mockResolvedValueOnce({ data: { user: { id: 'b' } } });
  mockUpsert.mockImplementationOnce(() => first.promise).mockResolvedValue({ error: null });
  const a = saveResumePosition('users', 'sub', 'module', 'ending', 1);
  const b = saveResumePosition('users', 'sub', 'module', 'ending', 2);
  await flush();
  expect(mockGetUser).toHaveBeenCalledTimes(2);
  first.resolve({ error: null });
  await Promise.all([a, b]);
  expect(mockUpsert.mock.calls.map(call => call[0].user_id)).toEqual(['a', 'b']);
});
