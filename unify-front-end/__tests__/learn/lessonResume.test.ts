import { isResumable, lessonResumeHref } from '@/utils/lessonResume';

describe('lesson resume destinations', () => {
  it('excludes untouched and completed lessons', () => {
    expect(isResumable()).toBe(false);
    expect(isResumable({ sanity_lesson_id: 'l' })).toBe(false);
    expect(
      isResumable({
        sanity_lesson_id: 'l',
        is_in_progress: true,
        is_completed: true,
      })
    ).toBe(false);
    expect(isResumable({ sanity_lesson_id: 'l', is_in_progress: true })).toBe(
      true
    );
  });
  it.each([
    ['lesson', 'pages'],
    ['activity', 'activities'],
    ['ending', 'ending'],
  ])('resumes %s at its saved page', (type, route) => {
    expect(
      lessonResumeHref('m', 's', 'l', {
        sanity_lesson_id: 'l',
        current_page_type: type,
        current_page_number: 3,
      })
    ).toBe(`/(tabs)/Learn/modules/m/s/lessons/l/${route}/3`);
  });
  it('keeps quiz and question identity', () => {
    expect(
      lessonResumeHref('m', 's', 'l', {
        sanity_lesson_id: 'l',
        current_page_type: 'quiz',
        current_quiz_id: 'q',
        current_question_number: 2,
      })
    ).toBe('/(tabs)/Learn/modules/m/s/lessons/l/quizzes/q/pages/2');
  });
  it('rejects invalid page numbers', () => {
    for (const n of [NaN, Infinity, -2, 0])
      expect(
        lessonResumeHref('m', 's', 'l', {
          sanity_lesson_id: 'l',
          current_page_number: n,
        })
      ).toMatch(/\/pages\/1$/);
  });
});
