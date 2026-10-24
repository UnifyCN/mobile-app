import { getLastLessonPageNumber } from '@/utils/submoduleProgress';

test.each([
  ['a submodule lesson list entry with only the projected count', { lesson_page_count: 4 }, 4],
  ['a content-block lesson counted by blocks', { lesson_page_count: 6, pages: undefined }, 6],
  ['a fully loaded lesson', { pages: [{}, {}] as never[] }, 2],
  ['a lesson with no reading pages', { lesson_page_count: 0 }, 1],
  ['a lesson with no page data', {}, 1],
])('returns the last reading page for %s', (_label, lesson, expected) => {
  expect(getLastLessonPageNumber(lesson)).toBe(expected);
});
