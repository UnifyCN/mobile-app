import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LessonBlockActivity from '@/components/learn/LessonBlockActivity';
import { SAVE_DEADLINE_MS, getActivityInputsByPage, requestUser, saveActivityInput } from '@/services/progress/progressService';
import type { SanityActivityPage } from '@/types/sanity';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/services/progress/progressClient', () => ({ progressClient: {} }));
jest.mock('@/services/progress/progressService', () => ({
  ACTIVITY_QUESTION_PREFIX: 'question:',
  SAVE_DEADLINE_MS: jest.requireActual('@/services/progress/progressService').SAVE_DEADLINE_MS,
  getActivityInputsByPage: jest.fn(),
  requestUser: jest.fn(),
  saveActivityInput: jest.fn(),
  saveDeadline: jest.requireActual('@/services/progress/progressService').saveDeadline,
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
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' }, submittedFields: {}, isSubmitted: false },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection').props.value).toBe('Check the source'));
  fireEvent.press(view.getByText('common.submit'));
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(view.getByText('Feedback shown')).toBeTruthy();
  expect(saveInput).toHaveBeenCalledWith('lesson', 'module', 'course', 'knowledge-check', 'reflection', 'Check the source', true, expect.objectContaining({ clearSubmitted: false }));
  expect(saveInput).toHaveBeenCalledWith('lesson', 'module', 'course', 'knowledge-check', 'question:question', '"a"', true, expect.objectContaining({ clearSubmitted: false }));
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
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' },
      submittedFields: { reflection: true, 'question:question': true }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(view.getByText('Feedback shown')).toBeTruthy();
  expect(saveInput).not.toHaveBeenCalled();
});

it('asks for a new submit when a returning submission no longer meets the requirements', async () => {
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: ' ' }, questionAnswers: { question: 'a' },
      submittedFields: { reflection: true, 'question:question': true }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection')).toBeTruthy());
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
});

it('asks for a new submit when only part of an earlier submit was saved', async () => {
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' },
      submittedFields: { reflection: true, 'question:question': false }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection').props.value).toBe('Check the source'));
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
});

it('does not open Next for an edit made while the submit was saving', async () => {
  let finishSave!: (saved: boolean) => void;
  const held = new Promise<boolean>(resolve => { finishSave = resolve; });
  saveInput.mockImplementation(() => held);
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: 'Check the source' }, questionAnswers: { question: 'a' },
      submittedFields: {}, isSubmitted: false },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('reflection').props.value).toBe('Check the source'));
  fireEvent.press(view.getByText('common.submit'));
  await waitFor(() => expect(saveInput).toHaveBeenCalledTimes(2));
  fireEvent.changeText(view.getByTestId('reflection'), '');
  await act(async () => { finishSave(true); await held; });
  await act(async () => { await Promise.resolve(); });
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
});

it('clears the submitted state of an answer changed after Submit', async () => {
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={activity} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('question')).toBeTruthy());
  fireEvent.press(view.getByTestId('question'));
  await waitFor(() => expect(saveInput).toHaveBeenCalledTimes(1));
  expect(saveInput).toHaveBeenLastCalledWith('lesson', 'module', 'course', 'knowledge-check', 'question:question', '"a"', false, expect.objectContaining({ clearSubmitted: true }));
});

it('writes the pending draft of an older copy before a reopened copy reads', async () => {
  let finishDraft!: (saved: boolean) => void;
  saveInput.mockImplementationOnce(() => new Promise(resolve => { finishDraft = resolve; }));
  const first = render(<LessonBlockActivity activity={activity} lessonId="remount" submoduleId="module" moduleId="course" onReady={jest.fn()} />);
  await waitFor(() => expect(first.getByTestId('reflection')).toBeTruthy());
  fireEvent.changeText(first.getByTestId('reflection'), 'Older draft');
  expect(loadInputs).toHaveBeenCalledTimes(1);
  render(<LessonBlockActivity activity={activity} lessonId="remount" submoduleId="module" moduleId="course" onReady={jest.fn()} />);
  await waitFor(() => expect(saveInput).toHaveBeenCalledWith('remount', 'module', 'course', 'knowledge-check', 'reflection', 'Older draft', false, expect.objectContaining({ clearSubmitted: true })));
  await act(async () => { await Promise.resolve(); });
  expect(loadInputs).toHaveBeenCalledTimes(1);
  await act(async () => { finishDraft(true); });
  await waitFor(() => expect(loadInputs).toHaveBeenCalledTimes(2));
});

it('asks for a new submit when an optional answer changed after Submit', async () => {
  const withNote = { ...activity, instructions: [
    ...activity.instructions,
    { _type: 'small_input_box', _key: 'note', label: 'Note', placeholder: '' },
  ] } as typeof activity;
  loadInputs.mockResolvedValue({
    'knowledge-check': { inputValues: { reflection: 'Check the source', note: 'Edited later' }, questionAnswers: { question: 'a' },
      submittedFields: { reflection: true, 'question:question': true, note: false }, isSubmitted: true },
  });
  const onReady = jest.fn();
  const view = render(<LessonBlockActivity activity={withNote} lessonId="lesson" submoduleId="module" moduleId="course" onReady={onReady} />);
  await waitFor(() => expect(view.getByTestId('note').props.value).toBe('Edited later'));
  expect(onReady).not.toHaveBeenCalledWith(true);
  expect(view.queryByText('Feedback shown')).toBeNull();
});

it('keeps the account that was signed in when a write was queued', async () => {
  let finishFirst!: (saved: boolean) => void;
  saveInput.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  jest.mocked(requestUser).mockReturnValue('account-a' as never);
  const view = render(<LessonBlockActivity activity={activity} lessonId="account" submoduleId="module" moduleId="course" onReady={jest.fn()} />);
  await waitFor(() => expect(view.getByTestId('question')).toBeTruthy());
  fireEvent.press(view.getByTestId('question'));
  await waitFor(() => expect(saveInput).toHaveBeenCalledTimes(1));
  fireEvent.press(view.getByTestId('question'));
  jest.mocked(requestUser).mockReturnValue('account-b' as never);
  await act(async () => { finishFirst(true); });
  await waitFor(() => expect(saveInput).toHaveBeenCalledTimes(2));
  expect(saveInput.mock.calls.map(call => call[7]?.userRequest)).toEqual(['account-a', 'account-a']);
});

it('opens a reopened copy after a stalled save reaches its deadline', async () => {
  jest.useFakeTimers();
  try {
    saveInput.mockImplementationOnce((...args) => new Promise(resolve => {
      args[7]?.signal?.addEventListener('abort', () => resolve(false));
    }));
    const first = render(<LessonBlockActivity activity={activity} lessonId="stalled" submoduleId="module" moduleId="course" onReady={jest.fn()} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    fireEvent.press(first.getByTestId('question'));
    const reopened = render(<LessonBlockActivity activity={activity} lessonId="stalled" submoduleId="module" moduleId="course" onReady={jest.fn()} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(SAVE_DEADLINE_MS - 1); });
    expect(reopened.queryByText('learn.lesson.loadingActivity')).toBeTruthy();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(reopened.queryByText('learn.lesson.loadingActivity')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
