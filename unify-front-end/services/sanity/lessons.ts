import { withOrderedLessonBlocks } from '../../utils/lessonContentBlocks';
import { sanityClient } from '../../sanity-custom';
import { SanityLesson, SanityLessonPage } from '../../types/sanity';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';

type SectionedPage = Pick<
  SanityLessonPage,
  '_key' | 'contentVersion' | 'sections' | 'readingMinutes'
>;

// Section keys can change independently during authoring. Never merge an
// English section tree into a translated page. Page positions remain fixed.
function withTranslatedSections(translatedPages: SectionedPage[] | null | undefined) {
  const byKey = new Map((translatedPages ?? []).map(page => [page._key, page]));
  return <T extends SectionedPage>(page: T): T => {
    const translated = byKey.get(page._key);
    if (translated?.contentVersion === 2 && translated.sections?.length) {
      return {
        ...page,
        contentVersion: 2,
        sections: translated.sections,
        readingMinutes: translated.readingMinutes,
      };
    }
    // Existing translated content remains readable until its sections exist.
    return { ...page, contentVersion: undefined, sections: undefined };
  };
}

// Get a single lesson by ID
export async function getLesson(
  lessonId: string,
  language: SanityLanguage = 'en'
): Promise<SanityLesson | null> {
  try {
    const query = `*[_type == "lesson" && _id == $lessonId && ${BASE_LANGUAGE_FILTER}][0] {
      _id,
      _type,
      title,
      slug,
      description,
      submodule,
      content_blocks,
      pages,
      activity_pages,
      ending_pages,
      order,
      ${i18nOverlay('title, description, content_blocks, pages, activity_pages, ending_pages')}
    }`;

    const lesson = await sanityClient.fetch<WithI18n<SanityLesson> | null>(
      query,
      { lessonId, lang: language }
    );
    if (!lesson) return null;
    const merged = mergeI18nOverlay(lesson);
    if (language === 'en') return withOrderedLessonBlocks(merged);

    const translateBlock = withTranslatedSections(lesson.i18n?.content_blocks);
    return withOrderedLessonBlocks({
      ...merged,
      pages: merged.pages?.map(withTranslatedSections(lesson.i18n?.pages)),
      content_blocks: merged.content_blocks?.map(block =>
        block._type === 'lesson_content' ? translateBlock(block) : block
      ),
    });
  } catch (error) {
    console.error('Error fetching lesson from Sanity:', error);
    return null;
  }
}
