import { act, renderHook, waitFor } from '@testing-library/react-native';

let mockLanguage = 'en';

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => mockLanguage,
}));

jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({ currentUser: { province: null }, isLoading: false }),
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
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
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
