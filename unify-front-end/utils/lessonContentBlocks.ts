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
    legacyResumePages: lesson.legacyResumePages ?? {
      activity_pages: lesson.activity_pages,
      ending_pages: lesson.ending_pages,
    },
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
            contentVersion: block.contentVersion,
            sections: block.sections,
            readingMinutes: block.readingMinutes,
          }
    ),
    activity_pages: [],
    ending_pages: [],
    lesson_page_count: blocks.length,
    activity_page_count: 0,
    ending_page_count: 0,
  };
}

/** Resolve a saved legacy route to its stable step in the ordered reader. */
export function getOrderedLegacyPageNumber({
  lesson,
  pageType,
  pageNumber,
}: {
  lesson: SanityLesson | null | undefined;
  pageType: 'activity' | 'ending';
  pageNumber: number;
}): number | undefined {
  if (
    !lesson?.content_blocks?.length ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return undefined;
  }
  const legacy = lesson.legacyResumePages ?? lesson;
  // Ending routes sorted by order. Activity routes used their array position.
  const pages =
    pageType === 'ending'
      ? [...(legacy.ending_pages ?? [])].sort((a, b) => a.order - b.order)
      : legacy.activity_pages;
  const page = pages?.[pageNumber - 1];
  if (!page) return undefined;
  const type = pageType === 'activity' ? 'lesson_activity' : 'lesson_content';
  const index = lesson.content_blocks.findIndex(
    block => block._key === page._key && block._type === type
  );
  return index < 0 ? undefined : index + 1;
}
