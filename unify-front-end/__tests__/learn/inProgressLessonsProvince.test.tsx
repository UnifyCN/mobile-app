import { act, renderHook, waitFor } from '@testing-library/react-native';

let mockProvince: string | null = null;
let mockUserLoading = false;
let mockLessonRows: any[] = [];

jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: mockUserLoading ? null : { province: mockProvince },
    isLoading: mockUserLoading,
  }),
}));

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));

jest.mock('@/services/progress/progressClient', () => ({
  progressClient: {
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest
            .fn()
            .mockImplementation(async () => ({
              data: mockLessonRows,
              error: null,
            })),
        })),
      })),
    })),
  },
}));

jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));

jest.mock('@/utils/progressEventEmitter', () => ({
  progressEventEmitter: { subscribe: jest.fn(() => jest.fn()) },
}));

import { sanityClient } from '@/sanity-custom';
import { useInProgressLessons } from '@/hooks/progress/useInProgressLessons';

const BC = 'British Columbia';

const moduleDoc = (id: string, province?: string) => ({
  _id: id,
  title: `${id} module`,
  province,
  submodules: [
    {
      _id: `${id}-section`,
      title: `${id} section`,
      lessons: [
        {
          _id: `${id}-lesson`,
          title: `${id} lesson`,
          lesson_page_count: 3,
          activity_page_count: 0,
          ending_page_count: 0,
          quizzes: [],
        },
      ],
    },
  ],
});

const CONTENT = [
  moduleDoc('banking'),
  moduleDoc('sfu', BC),
  moduleDoc('uofa', 'Alberta'),
];

const progressOn = (lessonId: string, completed = false) => ({
  sanity_lesson_id: lessonId,
  sanity_submodule_id: lessonId.replace('-lesson', '-section'),
  is_completed: completed,
  is_in_progress: !completed,
  completed_pages: completed ? 3 : 1,
  current_page_number: 2,
  last_accessed_at: '2026-10-20T00:00:00Z',
});

const moduleIds = (lessons: { moduleId: string }[]) =>
  lessons.map(l => l.moduleId).sort();

describe('Continue learning cards for a user in a province', () => {
  beforeEach(() => {
    mockProvince = null;
    mockUserLoading = false;
    mockLessonRows = [];
    (sanityClient.fetch as jest.Mock).mockReset();
    (sanityClient.fetch as jest.Mock).mockResolvedValue(CONTENT);
  });

  it('creates no card for a BC module without saved progress for an Ontario user', async () => {
    mockProvince = 'Ontario';
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(moduleIds(result.current.lessons)).toEqual(['banking']);
  });

  it('creates no resume card for a BC module with saved progress for an Ontario user', async () => {
    mockProvince = 'Ontario';
    mockLessonRows = [progressOn('sfu-lesson'), progressOn('banking-lesson')];
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(moduleIds(result.current.lessons)).toEqual(['banking']);
  });

  it('gives a BC user the BC resume card', async () => {
    mockProvince = BC;
    mockLessonRows = [progressOn('sfu-lesson')];
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(moduleIds(result.current.lessons)).toEqual(['banking', 'sfu']);
    expect(
      result.current.lessons.find(l => l.moduleId === 'sfu')?.currentPage
    ).toBe(2);
  });

  it('creates national cards only when no province is saved', async () => {
    mockProvince = null;
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(moduleIds(result.current.lessons)).toEqual(['banking']);
  });

  it('creates no province card while the profile is loading', async () => {
    mockUserLoading = true;
    const { result } = renderHook(() => useInProgressLessons());
    await act(async () => {});
    expect(result.current.isLoading).toBe(true);
    expect(result.current.lessons).toEqual([]);
  });

  it('drops the BC card when the profile province changes to Ontario', async () => {
    mockProvince = BC;
    const { result, rerender } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(moduleIds(result.current.lessons)).toContain('sfu');

    mockProvince = 'Ontario';
    rerender({});
    await waitFor(() =>
      expect(moduleIds(result.current.lessons)).toEqual(['banking'])
    );
  });
});
