import { renderHook } from '@testing-library/react-native';
import {
  PREVIOUS_WRITE_WAIT_MS,
  saveResumePosition,
  updateLessonProgress,
} from '@/services/progress/progressService';
import { useLessonProgress } from '@/hooks/progress/useLessonProgress';

const mockGetUser = jest.fn();
const mockUpsert = jest.fn();
jest.mock('@/services/progress/progressClient', () => ({
  progressClient: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
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

test('a stalled earlier write does not hold lesson completion forever', async () => {
  jest.useFakeTimers();
  try {
    mockUpsert.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({ error: null });
    const { result } = renderHook(() => useLessonProgress());
    void saveResumePosition('stalled', 'sub', 'module', 'lesson', 2);
    const completion = result.current.saveLessonCompletion('stalled', 'sub', 'module', 3);
    await jest.advanceTimersByTimeAsync(PREVIOUS_WRITE_WAIT_MS - 1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await completion).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
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
