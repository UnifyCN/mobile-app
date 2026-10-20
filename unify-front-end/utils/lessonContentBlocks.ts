import type { SanityLesson } from '../types/sanity';

/**
 * Present ordered blocks through the existing reader route, progress counter,
 * bookmarks, and highlights. Array order is authoritative; block keys survive
 * translation and reordering. Legacy lessons are returned unchanged.
 */
export function withOrderedLessonBlocks(lesson: SanityLesson): SanityLesson {
  const blocks = lesson.content_blocks;
  if (!blocks?.length) return lesson;

  return {
    ...lesson,
    pages: blocks.map((block, index) =>
      block._type === 'lesson_activity'
        ? {
            _key: block._key,
            title: block.title,
            order: index,
            content: [],
            activity: block,
          }
        : {
            _key: block._key,
            title: block.title,
            order: index,
            content: block.content,
            markDefs: block.markDefs,
          }
    ),
    activity_pages: [],
    ending_pages: [],
    lesson_page_count: blocks.length,
    activity_page_count: 0,
    ending_page_count: 0,
  };
}
