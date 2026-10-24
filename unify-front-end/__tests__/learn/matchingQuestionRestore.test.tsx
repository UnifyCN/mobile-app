import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native', () => ({ AlignJustify: () => null, AlignVerticalJustifyCenter: () => null }));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/components/sanity/ImageViewerModal', () => () => null);
jest.mock('@/components/sanity/DropdownBlock', () => () => null);
jest.mock('@/components/sanity/ChecklistCheckboxBlock', () => () => null);
jest.mock('@/components/learn/SelectableText', () => () => null);
jest.mock('@/services/highlights/highlightService', () => ({}));

const block = {
  _type: 'matching_question',
  _key: 'match',
  question_text: [],
  matching_pairs: [
    { _key: 'p1', left_item: 'Health card', right_item: 'Province' },
    { _key: 'p2', left_item: 'SIN', right_item: 'Service Canada' },
  ],
};

function renderMatching(saved: string[]) {
  const onQuestionAnswer = jest.fn();
  const view = render(
    <RichTextRenderer
      blocks={[block] as any}
      questionAnswers={{ match: saved }}
      onQuestionAnswer={onQuestionAnswer}
    />
  );
  return { view, onQuestionAnswer };
}

it('adds a new correct pair to the restored pair keys', () => {
  const { view, onQuestionAnswer } = renderMatching(['p1']);
  fireEvent.press(view.getByText('SIN'));
  fireEvent.press(view.getByText('Service Canada'));
  fireEvent.press(view.getByText('common.check'));
  expect(onQuestionAnswer).toHaveBeenCalledWith('match', ['p1', 'p2']);
});

it.each([
  [[], [['match', ['p1']]]],
  [['p1'], []],
])('restored pairs %j stay completed', (saved, expectedCalls) => {
  const { view, onQuestionAnswer } = renderMatching(saved);
  fireEvent.press(view.getByText('Health card'));
  fireEvent.press(view.getByText('Province'));
  fireEvent.press(view.getByText('common.check'));
  expect(onQuestionAnswer.mock.calls).toEqual(expectedCalls);
});
