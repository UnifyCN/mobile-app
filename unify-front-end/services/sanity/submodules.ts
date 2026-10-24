import { sanityClient } from '../../sanity-custom';
import { SanitySubmodule, SanityLessonWithQuizzes } from '../../types/sanity';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';

type SubmoduleRow = WithI18n<SanitySubmodule> & {
  lessons?: WithI18n<SanityLessonWithQuizzes>[];
};

// Get submodule with all its lessons
export async function getSubmoduleWithLessons(
  submoduleId: string,
  language: SanityLanguage = 'en'
): Promise<(SanitySubmodule & { lessons: SanityLessonWithQuizzes[] }) | null> {
  try {
    const query = `*[_type == "submodule" && _id == $submoduleId && ${BASE_LANGUAGE_FILTER}][0] {
      _id,
      _type,
      title,
      description,
      module,
      intro_pages,
      order,
      ${i18nOverlay('title, description, intro_pages')},
      "lessons": *[_type == "lesson" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
        _id,
        _type,
        title,
        slug,
        description,
        submodule,
        order,
        "lesson_page_count": select(count(content_blocks) > 0 => count(content_blocks), count(pages)),
        "activity_page_count": select(count(content_blocks) > 0 => 0, count(activity_pages)),
        "ending_page_count": select(count(content_blocks) > 0 => 0, count(ending_pages)),
        ${i18nOverlay('title, description')},
        "quizzes": *[_type == "quiz" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order_number) {
          _id,
          _type,
          title,
          order_number,
          "question_count": count(questions),
          ${i18nOverlay('title')}
        }
      }
    }`;

    const submodule = await sanityClient.fetch<SubmoduleRow | null>(query, {
      submoduleId,
      lang: language,
    });
    if (!submodule || Array.isArray(submodule)) return null;
    const merged = mergeI18nOverlay(submodule);
    return {
      ...merged,
      lessons: (submodule.lessons ?? []).map(lesson => ({
        ...mergeI18nOverlay(lesson),
        quizzes: (lesson.quizzes ?? []).map(mergeI18nOverlay),
      })),
    };
  } catch (error) {
    console.error('Error fetching submodule with lessons from Sanity:', error);
    return null;
  }
}
