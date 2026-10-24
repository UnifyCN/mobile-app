import { gradeQuizAnswer, isTextAnswerQuestion } from '@/utils/quizAnswer';

describe('quiz text answers', () => {
  it.each(['short_answer', 'fill_blank', 'long_answer'])(
    'renders %s as a text answer question',
    questionType => {
      expect(isTextAnswerQuestion(questionType)).toBe(true);
    }
  );

  it('accepts the Home Buying answer with or without currency formatting', () => {
    const question = {
      question_type: 'short_answer',
      correct_answer: { value: ['$65,000'] },
    };

    expect(gradeQuizAnswer(question, '$65,000')).toBe(true);
    expect(gradeQuizAnswer(question, '65000')).toBe(true);
  });

  it('rejects a different short answer', () => {
    const question = {
      question_type: 'short_answer',
      correct_answer: { value: ['$65,000'] },
    };

    expect(gradeQuizAnswer(question, '$50,000')).toBe(false);
  });

  it('does not treat a decimal answer as the same whole number', () => {
    const question = {
      question_type: 'short_answer',
      correct_answer: { value: ['1.5'] },
    };

    expect(gradeQuizAnswer(question, '15')).toBe(false);
  });

  it('does not discard a percent sign from an answer', () => {
    const question = {
      question_type: 'short_answer',
      correct_answer: { value: ['6.5%'] },
    };

    expect(gradeQuizAnswer(question, '6.5')).toBe(false);
  });

  it('keeps meaningful spaces between words', () => {
    const question = {
      question_type: 'short_answer',
      correct_answer: { value: ['therapist'] },
    };

    expect(gradeQuizAnswer(question, 'the rapist')).toBe(false);
  });
});
