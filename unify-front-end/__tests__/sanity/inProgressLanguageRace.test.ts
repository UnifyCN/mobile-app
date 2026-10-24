import { act, renderHook, waitFor } from '@testing-library/react-native';

import { sanityClient } from '@/sanity-custom';
import { useInProgressLessons } from '@/hooks/progress/useInProgressLessons';

let mockLanguage = 'en';
let mockProgress = [
  {
    sanity_lesson_id: 'lesson-1',
    is_in_progress: true,
    is_completed: false,
    last_accessed_at: '2026-10-21T00:00:00Z',
  },
];

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => mockLanguage,
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
          order: jest.fn().mockImplementation(async () => ({
            data: mockProgress,
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

const mockFetch = sanityClient.fetch as jest.Mock;

function content(title: string) {
  return [
    {
      _id: 'module-1',
      title: `${title} module`,
      submodules: [
        {
          _id: 'submodule-1',
          title: `${title} section`,
          lessons: [
            {
              _id: 'lesson-1',
              title,
              lesson_page_count: 1,
              activity_page_count: 0,
              ending_page_count: 0,
              quizzes: [],
            },
          ],
        },
      ],
    },
  ];
}

describe('Continue Learning language changes', () => {
  beforeEach(() => {
    mockLanguage = 'en';
    mockFetch.mockReset();
    mockProgress = [
      {
        sanity_lesson_id: 'lesson-1',
        is_in_progress: true,
        is_completed: false,
        last_accessed_at: '2026-10-21T00:00:00Z',
      },
    ];
  });

  it('returns every active lesson in one category, newest first', async () => {
    mockProgress.push({
      sanity_lesson_id: 'lesson-2',
      is_in_progress: true,
      is_completed: false,
      last_accessed_at: '2026-10-22T00:00:00Z',
    });
    const modules = content('First');
    modules[0].submodules[0].lessons.push({
      ...modules[0].submodules[0].lessons[0],
      _id: 'lesson-2',
      title: 'Second',
    });
    mockFetch.mockResolvedValue(modules);
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lessons.map(lesson => lesson.id)).toEqual([
      'lesson-2',
      'lesson-1',
    ]);
  });

  it('recommends the next unfinished lesson after a completed lesson', async () => {
    mockProgress[0].is_completed = true;
    const modules = content('Completed');
    modules[0].submodules[0].lessons.push({
      ...modules[0].submodules[0].lessons[0],
      _id: 'lesson-2',
      title: 'Next',
    });
    mockFetch.mockResolvedValue(modules);
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lessons).toHaveLength(1);
    expect(result.current.lessons[0]).toMatchObject({
      id: 'lesson-2',
      isNext: true,
      href: '/(tabs)/Learn/modules/module-1/submodule-1/lessons/lesson-2/pages/1',
    });
  });

  it('does not recommend completed content when the catalog is finished', async () => {
    mockProgress[0].is_completed = true;
    mockFetch.mockResolvedValue(content('Completed'));
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lessons).toEqual([]);
  });

  it('starts a new learner at the first lesson', async () => {
    mockProgress = [];
    mockFetch.mockResolvedValue(content('First'));
    const { result } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lessons[0]).toMatchObject({
      id: 'lesson-1',
      isNext: true,
    });
  });

  it('ignores an old-language response that resolves after the new language', async () => {
    let resolveEnglish!: (value: unknown) => void;
    let resolveSpanish!: (value: unknown) => void;
    mockFetch.mockImplementation((_query, params) => {
      return new Promise(resolve => {
        if (params.lang === 'en') resolveEnglish = resolve;
        if (params.lang === 'es') resolveSpanish = resolve;
      });
    });

    const { result, rerender } = renderHook(() => useInProgressLessons());
    await waitFor(() => expect(resolveEnglish).toBeDefined());

    mockLanguage = 'es';
    rerender({});
    await waitFor(() => expect(resolveSpanish).toBeDefined());

    await act(async () => resolveSpanish(content('Lección')));
    await waitFor(() =>
      expect(result.current.lessons[0]?.title).toBe('Lección')
    );

    await act(async () => resolveEnglish(content('English lesson')));
    expect(result.current.lessons[0]?.title).toBe('Lección');
  });
});
