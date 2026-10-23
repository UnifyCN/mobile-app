import { gradeQuizAnswer } from '@/utils/gradeQuizAnswer';
import { flattenSpansToWords } from '@/components/learn/SelectableText';

jest.mock('@/context/SelectionContext', () => ({ useSelectionOptional: () => null }));

describe('Learn audit regressions', () => {
  test('keeps whitespace spans without moving saved word indices', () => {
    const words = flattenSpansToWords([
      { _type: 'span', text: 'Credit', marks: ['strong'] },
      { _type: 'span', text: ' \n' },
      { _type: 'span', text: 'report' },
    ], []);
    expect(words.map(word => word.word).join('')).toBe('Credit \nreport');
    expect(words.filter(word => word.wordIndex != null).map(word => [word.word, word.wordIndex])).toEqual([['Credit', 0], ['report', 1]]);
  });
  test.each(['$65,000', '65000', '65,000.00'])('accepts numeric formatting for short answers: %s', answer => {
    expect(gradeQuizAnswer({ question_type: 'short_answer', correct_answer: { value: ['$65,000'] } }, answer)).toBe(true);
  });
  test.each(['', '6500', '65000abc'])('rejects incorrect or empty short answers: %s', answer => {
    expect(gradeQuizAnswer({ question_type: 'short_answer', correct_answer: { value: ['$65,000'] } }, answer)).toBe(false);
  });
  test('does not truncate scalar correct answer values', () => {
    expect(gradeQuizAnswer({ question_type: 'multiple_choice_single', correct_answer: { value: 'option-a' } }, 'option-a')).toBe(true);
    expect(gradeQuizAnswer({ question_type: 'multiple_choice_single', correct_answer: { value: 'option-a' } }, 'o')).toBe(false);
  });
});
