import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { StyleSheet, TouchableOpacity } from 'react-native';
import PracticeActivityPageScreen from '@/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice/[practiceId]/activity/[pageNum]';

const mockSaveAnswer = jest.fn().mockResolvedValue(undefined);
const mockGetAnswers = jest.fn();
const mockProgress = {
  updatePracticeProgress: jest.fn(),
  completePractice: jest.fn(),
};
const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
const paragraph = (text: string) => ({
  _type: 'block',
  _key: text,
  style: 'normal',
  children: [{ _type: 'span', _key: `${text}-span`, text }],
});
let mockMode: string | undefined = 'reflection';
let mockPractice: object;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    moduleId: 'course',
    submoduleId: 'module',
    practiceId: 'confidence-practice',
    pageNum: '1',
  }),
  useRouter: () => mockRouter,
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/hooks/sanity/useSanityPractices', () => ({
  useSanityPractice: () => ({ data: mockPractice, isLoading: false }),
  useSanityPractices: () => ({ data: [mockPractice], isLoading: false }),
}));
jest.mock('@/hooks/sanity/useSanityModules', () => ({
  useSanityModule: () => ({ data: {} }),
}));
jest.mock('@/hooks/sanity/useSanitySubmodules', () => ({
  useSanitySubmoduleWithLessons: () => ({ data: {} }),
}));
jest.mock('@/hooks/progress/usePracticeProgress', () => ({
  usePracticeProgress: () => mockProgress,
}));
jest.mock('@/services/progress/practiceProgressService', () => ({
  savePracticeAnswer: (...args: unknown[]) => mockSaveAnswer(...args),
  getPracticeAnswers: (...args: unknown[]) => mockGetAnswers(...args),
  PRACTICE_QUESTION_PREFIX: 'question_',
}));
jest.mock('@/components/learn/CategorySymbol', () => ({
  categorySymbol: () => ({ foreground: '#000' }),
}));
jest.mock('@/components/learn/LearnRetry', () => () => null);
jest.mock('@/components/learn/SubmoduleProgressBar', () => () => null);
jest.mock('@/components/learn/PracticeFeedbackModal', () => () => null);
jest.mock('@/components/sanity/RichTextRenderer', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return ({ blocks }: { blocks: { children?: { text: string }[] }[] }) => (
    <Text>
      {blocks
        .flatMap(block => block.children?.map(span => span.text) || [])
        .join('')}
    </Text>
  );
});

function borders() {
  return screen
    .UNSAFE_getAllByType(TouchableOpacity)
    .slice(0, 2)
    .map(button => StyleSheet.flatten(button.props.style).borderColor);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'reflection';
  mockGetAnswers.mockResolvedValue({
    inputValues: {},
    questionAnswers: {},
    submittedKeys: [],
  });
});

function showPractice() {
  mockPractice = {
    _id: 'confidence-practice',
    title: 'Confidence check',
    practice_type: 'activity',
    pages: [
      {
        _key: 'confidence-page',
        order: 1,
        title: 'Confidence check',
        instructions: [
          {
            _key: 'confidence-question',
            _type: 'multiple_choice_multiple',
            gradingMode: mockMode,
            question_text: [paragraph('How confident do you feel?')],
            options: [
              {
                _key: 'first',
                value: 'Not Confident',
                is_correct: false,
                text: [paragraph('Not confident')],
                explanation: [paragraph('You are still learning.')],
              },
              {
                _key: 'second',
                value: 'Very Confident',
                is_correct: false,
                text: [paragraph('Very confident')],
                explanation: [paragraph('Continue with the examples.')],
              },
            ],
          },
        ],
      },
    ],
  };
  return render(<PracticeActivityPageScreen />);
}

it('saves the original answer identity and shows neutral submitted feedback', async () => {
  showPractice();
  await waitFor(() => expect(mockGetAnswers).toHaveBeenCalled());
  fireEvent.press(screen.getByText('Not confident'));
  fireEvent.press(screen.getByText('common.submit'));
  expect(mockSaveAnswer).toHaveBeenLastCalledWith(
    'confidence-practice',
    'module',
    'course',
    'question_confidence-question',
    ['Not Confident'],
    true
  );
  expect(borders()).toEqual(['black', '#DCDCDC']);
  expect(screen.getByText('You are still learning.')).toBeTruthy();
  expect(screen.queryByText('Continue with the examples.')).toBeNull();
});

it('restores a submitted reflection without incorrect feedback', async () => {
  mockGetAnswers.mockResolvedValue({
    inputValues: {},
    questionAnswers: { 'confidence-question': ['Very Confident'] },
    submittedKeys: ['confidence-question'],
  });
  showPractice();
  await waitFor(() =>
    expect(screen.getByText('Continue with the examples.')).toBeTruthy()
  );
  expect(borders()).toEqual(['#DCDCDC', 'black']);
  expect(mockSaveAnswer).not.toHaveBeenCalled();
});

it('keeps incorrect feedback for a factual question without the optional mode', async () => {
  mockMode = undefined;
  showPractice();
  await waitFor(() => expect(mockGetAnswers).toHaveBeenCalled());
  fireEvent.press(screen.getByText('Not confident'));
  fireEvent.press(screen.getByText('common.submit'));
  expect(borders()).toEqual(['#EF4444', '#DCDCDC']);
});
