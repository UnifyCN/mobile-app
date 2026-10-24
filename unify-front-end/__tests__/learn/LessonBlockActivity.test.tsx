import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LessonBlockActivity from '@/components/learn/LessonBlockActivity';
import { getActivityInputsByPage, saveActivityInput } from '@/services/progress/progressService';
import type { SanityActivityPage } from '@/types/sanity';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/services/progress/progressService', () => ({
  ACTIVITY_QUESTION_PREFIX: 'question:',
  getActivityInputsByPage: jest.fn(),
  saveActivityInput: jest.fn(),
}));
jest.mock('@/components/sanity/RichTextRenderer', () => {
  const React = require('react');
  const { Text, TextInput, View, TouchableOpacity } = require('react-native');
  return function MockRichTextRenderer(props: {
    blocks: { _type: string; _key: string }[];
    inputValues?: Record<string, string>;
    onInputChange?: (key: string, value: string) => void;
    onQuestionAnswer?: (key: string, value: string) => void;
    showQuestionFeedback?: boolean;
  }) {
    return React.createElement(View, {},
      props.blocks.map(block => block._type === 'small_input_box'
        ? React.createElement(TextInput, { key: block._key, testID: block._key,
            value: props.inputValues?.[block._key] || '',
            onChangeText: (value: string) => props.onInputChange?.(block._key, value) })
        : React.createElement(TouchableOpacity, { key: block._key, testID: block._key,
            onPress: () => props.onQuestionAnswer?.(block._key, 'a') }, React.createElement(Text, {}, 'Answer'))),
      props.showQuestionFeedback ? React.createElement(Text, {}, 'Feedback shown') : null);
  };
});

const activity: Omit<SanityActivityPage, 'order'> = {
  _key: 'knowledge-check', title: 'Try it',
  instructions: [
    { _type: 'small_input_box', _key: 'reflection', label: 'Your action', placeholder: '', required: true },
    { _type: 'multiple_choice_single', _key: 'question', question_text: [], options: [
      { _key: 'a', value: 'a', text: [], is_correct: true },
      { _key: 'b', value: 'b', text: [], is_correct: false },
    ] },
  ],
};

const loadInputs = jest.mocked(getActivityInputsByPage);
const saveInput = jest.mocked(saveActivityInput);

beforeEach(() => {
  jest.clearAllMocks();
  loadInputs.mockResolvedValue({});
  saveInput.mockResolvedValue(true);
});

it('restores answers, submits them, shows feedback, then enables navigation', async () => {
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' }, isSubmitted: false },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection').props.value).toBe('Check the source'));
  fireEvent.press(view.getByText('common.submit'));
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(view.getByText('Feedback shown')).toBeTruthy();
  expect(saveInput).toHaveBeenCalledWith('lesson', 'module', 'course', 'knowledge-check', 'reflection', 'Check the source', true);
  expect(saveInput).toHaveBeenCalledWith('lesson', 'module', 'course', 'knowledge-check', 'question:question', '"a"', true);
});

it('keeps Next unavailable when an answer cannot be saved', async () => {
  saveInput.mockResolvedValue(false);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection')).toBeTruthy());
  fireEvent.changeText(view.getByTestId('reflection'), 'Check the source');
  fireEvent.press(view.getByTestId('question'));
  fireEvent.press(view.getByText('common.submit'));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
  alert.mockRestore();
});

it('keeps a completed submission open when the learner returns', async () => {
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(view.getByText('Feedback shown')).toBeTruthy();
  expect(saveInput).not.toHaveBeenCalled();
});

it('asks for a new submit when a returning submission no longer meets the requirements', async () => {
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: ' ' }, questionAnswers: { question: 'a' }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection')).toBeTruthy());
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
});
