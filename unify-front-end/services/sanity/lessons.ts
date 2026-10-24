import { sanityClient } from '../../sanity-custom';
import { SanityLesson } from '../../types/sanity';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';

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
      pages,
      activity_pages,
      ending_pages,
      order,
      ${i18nOverlay('title, description, pages, activity_pages, ending_pages')}
    }`;

    const lesson = await sanityClient.fetch<WithI18n<SanityLesson> | null>(
      query,
      { lessonId, lang: language }
    );
    if (!lesson) return null;
    const merged = mergeI18nOverlay(lesson);
    if (language === 'en') return merged;

    // Section keys can change independently during authoring. Never merge an
    // English section tree into a translated page. Page positions remain fixed.
    const translatedPages = new Map(
      (lesson.i18n?.pages ?? []).map(page => [page._key, page])
    );
    return {
      ...merged,
      pages: merged.pages?.map(page => {
        const translated = translatedPages.get(page._key);
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
      }),
    };
  } catch (error) {
    console.error('Error fetching lesson from Sanity:', error);
    return null;
  }
}
