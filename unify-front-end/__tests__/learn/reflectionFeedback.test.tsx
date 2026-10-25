import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, TouchableOpacity } from 'react-native';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/sanity/ImageViewerModal', () => () => null);
jest.mock('@/components/sanity/DropdownBlock', () => () => null);
jest.mock('@/components/sanity/ChecklistCheckboxBlock', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('lucide-react-native', () => ({
  AlignJustify: () => null,
  AlignVerticalJustifyCenter: () => null,
}));
jest.mock('@/components/learn/SelectableText', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return ({ spans }: { spans: { text: string }[] }) => (
    <Text>{spans.map(span => span.text).join('')}</Text>
  );
});

function paragraph(key: string, text: string) {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    children: [{ _type: 'span', _key: `${key}-span`, text }],
  };
}

const question = {
  _type: 'multiple_choice_multiple',
  _key: 'confidence-question',
  question_text: [paragraph('prompt', 'How confident do you feel?')],
  options: [
    {
      _key: 'not-confident',
      value: 'Not Confident',
      is_correct: false,
      text: [paragraph('first-label', 'Not confident')],
      explanation: [paragraph('first-feedback', 'You are still learning.')],
    },
    {
      _key: 'very-confident',
      value: 'Very Confident',
      is_correct: false,
      text: [paragraph('second-label', 'Very confident')],
      explanation: [
        paragraph('second-feedback', 'Continue with the examples.'),
      ],
    },
  ],
};

function optionBorders() {
  return screen
    .UNSAFE_getAllByType(TouchableOpacity)
    .map(option => StyleSheet.flatten(option.props.style).borderColor);
}

describe('reflection feedback in the actual rich text renderer', () => {
  it('keeps neutral selection and the selected explanation after submission', () => {
    const reflection = { ...question, gradingMode: 'reflection' };
    const onAnswer = jest.fn();
    const { rerender } = render(
      <RichTextRenderer blocks={[reflection]} onQuestionAnswer={onAnswer} />
    );

    fireEvent.press(screen.getByText('Not confident'));
    expect(onAnswer).toHaveBeenCalledWith('confidence-question', [
      'Not Confident',
    ]);

    rerender(
      <RichTextRenderer
        blocks={[reflection]}
        questionAnswers={{ 'confidence-question': ['Not Confident'] }}
        onQuestionAnswer={onAnswer}
        showQuestionFeedback
      />
    );

    expect(optionBorders()).toEqual(['#000', '#DCDCDC']);
    expect(screen.getByText('You are still learning.')).toBeTruthy();
    expect(screen.queryByText('Continue with the examples.')).toBeNull();
    fireEvent.press(screen.getByText('Very confident'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('does not grade reflection options even if an old flag is true', () => {
    render(
      <RichTextRenderer
        blocks={[
          {
            ...question,
            gradingMode: 'reflection',
            options: question.options.map(option => ({
              ...option,
              is_correct: true,
            })),
          },
        ]}
        questionAnswers={{ 'confidence-question': ['Very Confident'] }}
        showQuestionFeedback
      />
    );
    expect(optionBorders()).toEqual(['#DCDCDC', '#000']);
    expect(screen.getByText('Continue with the examples.')).toBeTruthy();
  });

  it.each([undefined, 'knowledge'])(
    'retains factual grading for mode %s',
    mode => {
      render(
        <RichTextRenderer
          blocks={[
            {
              ...question,
              gradingMode: mode,
              options: [
                question.options[0],
                { ...question.options[1], is_correct: true },
              ],
            },
          ]}
          questionAnswers={{ 'confidence-question': ['Not Confident'] }}
          showQuestionFeedback
        />
      );
      expect(optionBorders()).toEqual(['#EF4444', '#10B981']);
      expect(screen.getByText('You are still learning.')).toBeTruthy();
    }
  );
});
