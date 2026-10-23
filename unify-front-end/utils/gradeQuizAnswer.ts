/** Grade stored answer values without treating a string as an array. */
export function gradeQuizAnswer(
  question: any,
  answer: string | string[]
): boolean {
  if (!question) return false;
  const values = Array.isArray(question.correct_answer?.value)
    ? question.correct_answer.value
    : [question.correct_answer?.value];
  if (question.question_type === 'short_answer') {
    const normalize = (value: string) => {
      const text = value.normalize('NFKC').trim().toLocaleLowerCase();
      const numeric = text.replace(/[$,\s]/g, '');
      return /^[-+]?\d+(\.\d+)?$/.test(numeric)
        ? String(Number(numeric))
        : text;
    };
    const single = Array.isArray(answer) ? answer[0] : answer;
    return (
      !!single?.trim() &&
      values.some(
        (value: unknown) =>
          typeof value === 'string' && normalize(value) === normalize(single)
      )
    );
  }
  if (question.question_type === 'multiple_choice_multiple') {
    const ids = (question.options || [])
      .filter((o: any) => o.is_correct)
      .map((o: any) => o._key);
    const selected = Array.isArray(answer) ? answer : [];
    return (
      ids.length > 0 &&
      ids.every((id: string) => selected.includes(id)) &&
      selected.every(id => ids.includes(id))
    );
  }
  const single = Array.isArray(answer) ? answer[0] : answer;
  return (
    (!!single && values.includes(single)) ||
    !!question.options?.find((o: any) => o._key === single)?.is_correct
  );
}
