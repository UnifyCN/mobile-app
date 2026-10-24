import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { SanityLesson, SanitySubmoduleWithLessons } from '@/types/sanity';
import { withOrderedLessonBlocks } from '@/utils/lessonContentBlocks';
import { lessonResumeHref } from '@/utils/lessonResume';
import EndingPageScreen from '@/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum]';
import ActivityPageScreen from '@/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/activities/[pageNum]';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
};
const mockSaveResumePosition = jest.fn().mockResolvedValue(true);
const mockTrackScreen = jest.fn();
const mockScreenFocused = jest.fn();
const mockPageFocused = jest.fn();
const mockActivitySubmitted = jest.fn();
let mockLesson: SanityLesson;
let mockSubmodule: SanitySubmoduleWithLessons;
let mockOrigin: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    moduleId: 'course',
    submoduleId: 'module',
    lessonId: 'lesson',
    pageNum: '1',
    origin: mockOrigin,
  }),
  useRouter: () => mockRouter,
  Redirect: ({ href }: { href: unknown }) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockRouter.replace(href);
    }, [href]);
    return null;
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
}));
jest.mock('@expo/vector-icons', () => ({
  AntDesign: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
  Feather: () => null,
}));
jest.mock('@/components/learn/CategorySymbol', () => ({
  categorySymbol: () => ({ foreground: '#000000' }),
}));
jest.mock('@/components/StarFilled', () => () => null);
jest.mock('@/components/StarOutline', () => () => null);
jest.mock(
  '@/components/learn/StructuredLesson',
  () =>
    ({ title }: { title: string }) => {
      const { Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return jest
        .requireActual<typeof import('react')>('react')
        .createElement(Text, null, title);
    }
);
jest.mock('@/components/sanity/RichTextRenderer', () => () => null);
jest.mock('@/components/learn/SubmoduleProgressBar', () => () => null);
jest.mock('@/components/learn/LearnRetry', () => () => null);
jest.mock('@/hooks/sanity/useSanityLessons', () => ({
  useSanityLesson: () => ({ data: mockLesson, isLoading: false }),
}));
jest.mock('@/hooks/sanity/useSanityModules', () => ({
  useSanityModule: () => ({ data: { colorTheme: { hex: '#000000' } } }),
}));
jest.mock('@/hooks/sanity/useSanitySubmodules', () => ({
  useSanitySubmoduleWithLessons: () => ({
    data: mockSubmodule,
    isLoading: false,
  }),
}));
jest.mock('@/hooks/sanity/useSanityQuizzes', () => ({
  useSanityLessonQuizzes: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/hooks/progress/useLessonProgress', () => ({
  useLessonProgress: () => ({
    saveLessonCompletion: jest.fn().mockResolvedValue(true),
  }),
}));
jest.mock('@/services/learn/lessonReviews', () => ({
  saveLessonReview: jest.fn(),
}));
jest.mock('@/services/progress/progressService', () => ({
  saveResumePosition: (...args: unknown[]) => mockSaveResumePosition(...args),
  saveActivityInput: jest.fn(),
  getActivityInputsByPage: jest.fn().mockResolvedValue({}),
  ACTIVITY_QUESTION_PREFIX: 'question:',
}));
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackScreen: mockTrackScreen }),
}));
jest.mock('@/hooks/learn/useLearnEvents', () => ({
  useLearnEvents: () => ({
    onLessonScreenFocused: mockScreenFocused,
    onLessonPageFocused: mockPageFocused,
    onActivitySubmitted: mockActivitySubmitted,
  }),
}));

const rawLesson: SanityLesson = {
  _id: 'lesson',
  _type: 'lesson',
  _rev: 'rev',
  _createdAt: '',
  _updatedAt: '',
  title: 'A converted lesson',
  slug: { _type: 'slug', current: 'converted' },
  submodule: { _type: 'reference', _ref: 'module' },
  order: 1,
  pages: [{ _key: 'reading', title: 'Reading', order: 0, content: [] }],
  activity_pages: [
    { _key: 'activity', title: 'Saved exercise', order: 0, instructions: [] },
  ],
  ending_pages: [
    { _key: 'ending', title: 'Saved conclusion', order: 0, content: [] },
  ],
  content_blocks: [
    { _key: 'reading', _type: 'lesson_content', title: 'Reading', content: [] },
    {
      _key: 'activity',
      _type: 'lesson_activity',
      title: 'Saved exercise',
      instructions: [],
    },
    {
      _key: 'ending',
      _type: 'lesson_content',
      title: 'Saved conclusion',
      content: [],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrigin = undefined;
  mockLesson = withOrderedLessonBlocks(rawLesson);
  mockSubmodule = {
    _id: 'module',
    _type: 'submodule',
    _rev: 'rev',
    _createdAt: '',
    _updatedAt: '',
    title: 'Module',
    module: { _type: 'reference', _ref: 'course' },
    order: 1,
    lessons: [mockLesson],
  };
});

test('a saved ending link opens its original step after content-block conversion', async () => {
  expect(
    lessonResumeHref('course', 'module', 'lesson', {
      sanity_lesson_id: 'lesson',
      current_page_type: 'ending',
      current_page_number: 1,
    })
  ).toBe('/(tabs)/Learn/modules/course/module/lessons/lesson/ending/1');
  const screen = render(React.createElement(EndingPageScreen));
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname:
        '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]',
      params: {
        moduleId: 'course',
        submoduleId: 'module',
        lessonId: 'lesson',
        pageNum: '3',
      },
    })
  );
  expect(screen.queryByText('learn.lesson.errorLoadingEnding')).toBeNull();
  expect(mockSaveResumePosition).not.toHaveBeenCalled();
  expect(mockTrackScreen).not.toHaveBeenCalled();
});

test('a saved activity link opens its original exercise without saving an old route', async () => {
  expect(
    lessonResumeHref('course', 'module', 'lesson', {
      sanity_lesson_id: 'lesson',
      current_page_type: 'activity',
      current_page_number: 1,
    })
  ).toBe('/(tabs)/Learn/modules/course/module/lessons/lesson/activities/1');
  const screen = render(React.createElement(ActivityPageScreen));
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname:
        '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]',
      params: {
        moduleId: 'course',
        submoduleId: 'module',
        lessonId: 'lesson',
        pageNum: '2',
      },
    })
  );
  expect(screen.queryByText('learn.lesson.errorLoadingActivity')).toBeNull();
  expect(mockSaveResumePosition).not.toHaveBeenCalled();
  expect(mockPageFocused).not.toHaveBeenCalled();
  expect(mockTrackScreen).not.toHaveBeenCalled();
});

test('an unconverted ending route still renders and saves its original position', async () => {
  mockLesson = { ...rawLesson, content_blocks: undefined };
  const screen = render(React.createElement(EndingPageScreen));
  expect(screen.getByText('Saved conclusion')).toBeTruthy();
  await waitFor(() =>
    expect(mockSaveResumePosition).toHaveBeenCalledWith(
      'lesson',
      'module',
      'course',
      'ending',
      1
    )
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('an unconverted activity route still renders and saves its original position', async () => {
  mockLesson = { ...rawLesson, content_blocks: undefined };
  const screen = render(React.createElement(ActivityPageScreen));
  expect(screen.getByText('Saved exercise')).toBeTruthy();
  await waitFor(() =>
    expect(mockSaveResumePosition).toHaveBeenCalledWith(
      'lesson',
      'module',
      'course',
      'activity',
      1
    )
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockPageFocused).toHaveBeenCalled();
});

test.each([
  { Screen: EndingPageScreen, pageNum: '3' },
  { Screen: ActivityPageScreen, pageNum: '2' },
])(
  'a converted saved route retains its checklist origin at page $pageNum',
  async ({ Screen, pageNum }) => {
    mockOrigin = 'checklist';
    render(React.createElement(Screen));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]',
        params: {
          moduleId: 'course',
          submoduleId: 'module',
          lessonId: 'lesson',
          pageNum,
          origin: 'checklist',
        },
      })
    );
  }
);
