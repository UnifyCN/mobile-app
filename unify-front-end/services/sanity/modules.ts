import { sanityClient } from '../../sanity-custom';
import {
  SanityModule,
  SanityLessonWithQuizzes,
  SanityQuiz,
  SanitySubmoduleWithLessons,
  SanityModuleWithSubmodules,
} from '../../types/sanity';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';

type ModuleRow = WithI18n<SanityModule> & {
  submodules?: (WithI18n<SanitySubmoduleWithLessons> & {
    lessons?: (WithI18n<SanityLessonWithQuizzes> & {
      quizzes?: WithI18n<SanityQuiz>[];
    })[];
  })[];
};

function mergeModuleTree(
  row: ModuleRow
): SanityModule & { submodules: SanitySubmoduleWithLessons[] } {
  const module = mergeI18nOverlay(row);
  return {
    ...module,
    submodules: (row.submodules ?? []).map(submodule => ({
      ...mergeI18nOverlay(submodule),
      lessons: (submodule.lessons ?? []).map(lesson => ({
        ...mergeI18nOverlay(lesson),
        quizzes: (lesson.quizzes ?? []).map(mergeI18nOverlay),
      })),
    })),
  };
}

// Get all modules
export async function getAllModules(
  language: SanityLanguage = 'en'
): Promise<SanityModule[]> {
  try {
    const query = `*[_type == "module" && ${BASE_LANGUAGE_FILTER}] | order(title) {
      _id,
      _type,
      title,
      description,
      colorTheme { hex },
      icon,
      province,
      ${i18nOverlay('title, description')}
    }`;

    const modules = await sanityClient.fetch<WithI18n<SanityModule>[]>(query, {
      lang: language,
    });
    return (modules || []).map(mergeI18nOverlay);
  } catch (error) {
    console.error('Error fetching modules from Sanity:', error);
    return [];
  }
}

// Get all modules with their submodules
export async function getAllModulesWithSubmodules(
  language: SanityLanguage = 'en'
): Promise<SanityModuleWithSubmodules[]> {
  try {
    const query = `*[_type == "module" && ${BASE_LANGUAGE_FILTER}] | order(title) {
      _id,
      _type,
      title,
      description,
      colorTheme { hex },
      icon,
      province,
      ${i18nOverlay('title, description')},
      "submodules": *[_type == "submodule" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
        _id,
        _type,
        title,
        description,
        module,
        order,
        ${i18nOverlay('title, description')}
      }
    }`;

    const modules = await sanityClient.fetch<ModuleRow[]>(query, {
      lang: language,
    });
    return (modules || []).map(mergeModuleTree);
  } catch (error) {
    console.error('Error fetching modules with submodules from Sanity:', error);
    return [];
  }
}

// Get a single module by ID
export async function getModule(
  moduleId: string,
  language: SanityLanguage = 'en'
): Promise<SanityModule | null> {
  try {
    const query = `*[_type == "module" && _id == $moduleId && ${BASE_LANGUAGE_FILTER}][0] {
      _id,
      _type,
      title,
      description,
      colorTheme { hex },
      icon,
      province,
      ${i18nOverlay('title, description')}
    }`;

    const module = await sanityClient.fetch<WithI18n<SanityModule> | null>(
      query,
      { moduleId, lang: language }
    );
    return module ? mergeI18nOverlay(module) : null;
  } catch (error) {
    console.error('Error fetching module from Sanity:', error);
    return null;
  }
}

// Get module with all its submodules
export async function getModuleWithSubmodules(
  moduleId: string,
  language: SanityLanguage = 'en'
): Promise<
  (SanityModule & { submodules: SanitySubmoduleWithLessons[] }) | null
> {
  try {
    const query = `*[_type == "module" && _id == $moduleId && ${BASE_LANGUAGE_FILTER}][0] {
      _id,
      _type,
      title,
      description,
      colorTheme { hex },
      icon,
      province,
      ${i18nOverlay('title, description')},
      "submodules": *[_type == "submodule" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
        _id,
        _type,
        title,
        description,
        module,
        order,
        ${i18nOverlay('title, description')},
        "lessons": *[_type == "lesson" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
          _id,
          _type,
          title,
          slug,
          description,
          submodule,
          order,
          "lesson_page_count": count(pages),
          "activity_page_count": count(activity_pages),
          "ending_page_count": count(ending_pages),
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
      }
    }`;

    const module = await sanityClient.fetch<ModuleRow | null>(query, {
      moduleId,
      lang: language,
    });
    return module ? mergeModuleTree(module) : null;
  } catch (error) {
    console.error('Error fetching module with submodules from Sanity:', error);
    return null;
  }
}

/**
 * The province tag of one module, for deciding whether the signed-in user may
 * open it. `found` is false when no such module exists, so a route can leave
 * that case to its own not-found state.
 */
export async function getModuleProvince(
  moduleId: string
): Promise<{ found: boolean; province: string | null }> {
  const row = await sanityClient.fetch<{ province?: string | null } | null>(
    `*[_type == "module" && _id == $moduleId && ${BASE_LANGUAGE_FILTER}][0] { province }`,
    { moduleId }
  );
  return { found: row != null, province: row?.province ?? null };
}
