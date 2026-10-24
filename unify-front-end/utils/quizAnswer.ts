const TEXT_ANSWER_TYPES = new Set([
  'short_answer',
  'fill_blank',
  'long_answer',
]);

type QuizQuestion = {
  question_type?: string | null;
  correct_answer?: { value?: string | string[] | null } | null;
  options?: Array<{ _key?: string; is_correct?: boolean }> | null;
};

export function isTextAnswerQuestion(
  questionType: string | null | undefined
): boolean {
  return Boolean(questionType && TEXT_ANSWER_TYPES.has(questionType));
}

function normalizeTextAnswer(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[$]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gradeQuizAnswer(
  question: QuizQuestion | null | undefined,
  answer: string | string[]
): boolean {
  if (!question) return false;

  if (question.question_type === 'multiple_choice_multiple') {
    const correctIds = (question.options || [])
      .filter(option => option.is_correct)
      .map(option => option._key)
      .filter((id): id is string => Boolean(id));
    const submittedIds = Array.isArray(answer) ? answer : [];

    return (
      correctIds.length > 0 &&
      correctIds.every(id => submittedIds.includes(id)) &&
      submittedIds.every(id => correctIds.includes(id))
    );
  }

  const submittedAnswer = Array.isArray(answer) ? answer[0] : answer;
  if (!submittedAnswer) return false;

  const configuredAnswer = question.correct_answer?.value;
  const acceptedAnswers = Array.isArray(configuredAnswer)
    ? configuredAnswer
    : configuredAnswer
      ? [configuredAnswer]
      : [];

  if (isTextAnswerQuestion(question.question_type)) {
    const normalizedSubmittedAnswer = normalizeTextAnswer(submittedAnswer);
    return acceptedAnswers.some(
      acceptedAnswer =>
        normalizeTextAnswer(acceptedAnswer) === normalizedSubmittedAnswer
    );
  }

  return (
    acceptedAnswers.includes(submittedAnswer) ||
    Boolean(
      question.options?.find(option => option._key === submittedAnswer)
        ?.is_correct
    )
  );
}
