import { renderHook } from '@testing-library/react-native';
import {
  SAVE_DEADLINE_MS,
  saveResumePosition,
  updateLessonProgress,
} from '@/services/progress/progressService';
import { useLessonProgress } from '@/hooks/progress/useLessonProgress';

const mockGetUser = jest.fn();
const mockUpsert = jest.fn();
jest.mock('@/services/progress/progressClient', () => ({
  progressClient: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({
      upsert: (row: unknown, options: unknown) => ({
        abortSignal: (signal: AbortSignal) => mockUpsert(row, options, signal),
      }),
    }),
  },
}));
jest.mock('@/utils/progressEventEmitter', () => ({ progressEventEmitter: { emit: jest.fn() } }));
jest.mock('@/services/progress/cachedProgressService', () => ({ cachedProgressService: { invalidate: jest.fn() } }));
jest.mock('@/services/learn/moduleProgressService', () => ({ maybeMarkModuleCompleted: jest.fn(() => Promise.resolve()) }));
jest.mock('@/hooks/learn/useLearnEvents', () => ({ useLearnEvents: () => ({ onLessonCompleted: jest.fn() }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

type Row = { current_page_number?: number; is_completed?: boolean; user_id?: string };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'learner' } } });
});

function holdFirstUpsert() {
  const first = deferred<{ error: null }>();
  const stored: Row[] = [];
  mockUpsert.mockImplementation(async (row: Row) => {
    if (mockUpsert.mock.calls.length === 1) await first.promise;
    stored.push(row);
    return { error: null };
  });
  return { first, stored };
}

test('a slow Next save cannot land after the next page resume save', async () => {
  const { first, stored } = holdFirstUpsert();
  const next = updateLessonProgress('next', 'sub', 'module', 'lesson', 1, 3);
  const focus = saveResumePosition('next', 'sub', 'module', 'lesson', 2);
  await flush();
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  first.resolve({ error: null });
  await Promise.all([next, focus]);
  expect(stored.map(row => row.current_page_number)).toEqual([1, 2]);
});

test('a slow resume save cannot reopen a lesson that was completed after it', async () => {
  const { first, stored } = holdFirstUpsert();
  const { result } = renderHook(() => useLessonProgress());
  const focus = saveResumePosition('done', 'sub', 'module', 'lesson', 3);
  const completion = result.current.saveLessonCompletion('done', 'sub', 'module', 3);
  await flush();
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  first.resolve({ error: null });
  expect(await Promise.all([focus, completion])).toEqual([true, true]);
  expect(stored.map(row => Boolean(row.is_completed))).toEqual([false, true]);
});

test('different lessons do not wait for each other', async () => {
  const { first } = holdFirstUpsert();
  void saveResumePosition('slow', 'sub', 'module', 'lesson', 1);
  const other = saveResumePosition('other', 'sub', 'module', 'lesson', 1);
  expect(await other).toBe(true);
  first.resolve({ error: null });
});

const abortable = (_row: unknown, _options: unknown, signal: AbortSignal) =>
  new Promise(resolve => signal.addEventListener('abort', () => resolve({ error: { message: 'aborted' } })));

test('a stalled earlier write is aborted at its deadline and completion then runs', async () => {
  jest.useFakeTimers();
  try {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsert.mockImplementationOnce(abortable).mockResolvedValue({ error: null });
    const { result } = renderHook(() => useLessonProgress());
    const stalled = saveResumePosition('stalled', 'sub', 'module', 'lesson', 2);
    const completion = result.current.saveLessonCompletion('stalled', 'sub', 'module', 3);
    await jest.advanceTimersByTimeAsync(SAVE_DEADLINE_MS - 1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await stalled).toBe(false);
    expect(await completion).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect((mockUpsert.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    expect((mockUpsert.mock.calls[1][2] as AbortSignal).aborted).toBe(false);
    errorLog.mockRestore();
  } finally {
    jest.useRealTimers();
  }
});

test('queued writes keep the learner who was signed in when they were called', async () => {
  const { first, stored } = holdFirstUpsert();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'a' } } });
  const { result } = renderHook(() => useLessonProgress());
  const focus = saveResumePosition('switch', 'sub', 'module', 'lesson', 1);
  const next = updateLessonProgress('switch', 'sub', 'module', 'lesson', 2, 3);
  const completion = result.current.saveLessonCompletion('switch', 'sub', 'module', 3);
  await flush();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'b' } } });
  first.resolve({ error: null });
  await Promise.all([focus, next, completion]);
  expect(stored.map(row => row.user_id)).toEqual(['a', 'a', 'a']);
});

test('completion fails instead of waiting forever for a stalled sign-in check', async () => {
  jest.useFakeTimers();
  try {
    mockGetUser.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useLessonProgress());
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    const completion = result.current.saveLessonCompletion('auth', 'sub', 'module', 3);
    await jest.advanceTimersByTimeAsync(SAVE_DEADLINE_MS);
    expect(await completion).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
    errorLog.mockRestore();
  } finally {
    jest.useRealTimers();
  }
});
