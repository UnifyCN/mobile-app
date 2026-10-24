import {
  isResumable,
  lessonResumeHref,
  ResumeProgress,
} from '@/utils/lessonResume';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { progressClient } from '@/services/progress/progressClient';
import { sanityClient } from '@/sanity-custom';
import { progressEventEmitter } from '@/utils/progressEventEmitter';
import { getLessonTotalPages } from '@/utils/submoduleProgress';
import { useSanityLanguage } from '@/hooks/sanity/useSanityLanguage';
import { useLearnProvince } from '@/hooks/learn/useLearnProvince';
import { isVisibleForProvince } from '@/supabase/functions/_shared/province';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
} from '@/services/sanity/i18n';

interface ContinueLesson {
  id: string;
  title: string;
  description: string;
  moduleId: string;
  moduleTitle: string;
  // The module's province tag, kept so the cards can be checked again against
  // the current profile province on every render.
  moduleProvince?: string | null;
  submoduleId: string;
  submoduleTitle: string;
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  currentSection: number;
  totalSections: number;
  href: string;
  isNext?: boolean;
}

interface LessonProgressRow extends ResumeProgress {
  sanity_lesson_id: string;
  sanity_submodule_id: string;
  is_completed: boolean;
  is_in_progress: boolean;
  completed_pages: number;
  current_page_number: number;
  last_accessed_at: string;
}

export function useInProgressLessons() {
  const language = useSanityLanguage();
  const { province, isLoading: provinceLoading } = useLearnProvince();
  const [lessons, setLessons] = useState<ContinueLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchInProgressLessons = useCallback(async () => {
    // Until the profile loads, null does not yet mean "no province".
    if (provinceLoading) return;
    const requestId = ++requestSequence.current;
    const isLatestRequest = () => requestId === requestSequence.current;
    try {
      setIsLoading(true);
      setError(null);

      // Get current user
      const {
        data: { user },
      } = await progressClient.auth.getUser();
      if (!user) {
        if (isLatestRequest()) setLessons([]);
        return;
      }

      // Fetch lesson progress rows needed for continue-learning cards
      const { data: lessonProgresses, error: lessonError } =
        await progressClient
          .from('user_lesson_progress')
          .select(
            'sanity_lesson_id,sanity_submodule_id,is_completed,is_in_progress,completed_pages,current_page_number,current_page_type,current_quiz_id,current_question_number,last_accessed_at'
          )
          .eq('user_id', user.id)
          .order('last_accessed_at', { ascending: false });

      if (lessonError) {
        if (isLatestRequest()) {
          console.error('Error fetching lesson progress:', lessonError);
          setError('Failed to fetch lessons');
        }
        return;
      }

      // Fetch modules/submodules/lessons with compact page counts from Sanity
      const modulesQuery = `*[_type == "module" && ${BASE_LANGUAGE_FILTER}] | order(order, _id) {
          _id,
          title,
          province,
          ${i18nOverlay('title')},
          "submodules": *[_type == "submodule" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
            _id,
            title,
            order,
            ${i18nOverlay('title')},
            "lessons": *[_type == "lesson" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order) {
              _id,
              title,
              description,
              order,
              "lesson_page_count": select(count(content_blocks) > 0 => count(content_blocks), count(pages)),
              "activity_page_count": select(count(content_blocks) > 0 => 0, count(activity_pages)),
              "ending_page_count": select(count(content_blocks) > 0 => 0, count(ending_pages)),
              ${i18nOverlay('title, description')},
              "quizzes": *[_type == "quiz" && references(^._id) && ${BASE_LANGUAGE_FILTER}] | order(order_number) {
                _id,
                "question_count": count(questions)
              }
            }
          }
        }`;

      const rawModules = await sanityClient.fetch(modulesQuery, {
        lang: language,
      });
      // A card is built per module, so a module for another province never
      // reaches the loop below, with or without saved progress.
      const modulesData = (rawModules ?? [])
        .filter((module: any) =>
          isVisibleForProvince(module.province, province)
        )
        .map((module: any) => ({
          ...mergeI18nOverlay(module),
          submodules: (module.submodules ?? []).map((submodule: any) => ({
            ...mergeI18nOverlay(submodule),
            lessons: (submodule.lessons ?? []).map((lesson: any) =>
              mergeI18nOverlay(lesson)
            ),
          })),
        }));

      const progressRows = (lessonProgresses || []) as LessonProgressRow[];

      const progressByLessonId = new Map<string, LessonProgressRow>();

      for (const row of progressRows) {
        progressByLessonId.set(row.sanity_lesson_id, row);
      }

      const availableLessons: ContinueLesson[] = [];
      const catalogLessons: ContinueLesson[] = [];

      for (const module of modulesData || []) {
        for (const activeSubmodule of module.submodules || []) {
          for (const activeLesson of activeSubmodule.lessons || []) {
            const lessonProgress = progressByLessonId.get(activeLesson._id);
            if (!getLessonTotalPages(activeLesson)) continue;

            const totalPages = getLessonTotalPages(activeLesson);
            const progressPercent =
              lessonProgress && totalPages > 0
                ? Math.round(
                    (lessonProgress.completed_pages / totalPages) * 100
                  )
                : 0;

            const currentPage = lessonProgress?.current_page_number || 1;
            const submoduleIndex = (module.submodules || []).findIndex(
              (s: any) => s._id === activeSubmodule._id
            );
            const currentSection = submoduleIndex >= 0 ? submoduleIndex + 1 : 1;
            const totalSections = module.submodules?.length || 0;

            const candidate: ContinueLesson = {
              id: activeLesson._id,
              title: activeLesson.title || 'Untitled Lesson',
              description: activeLesson.description || '',
              moduleId: module._id,
              moduleTitle: module.title || 'Unknown Module',
              moduleProvince: module.province ?? null,
              submoduleId: activeSubmodule._id,
              submoduleTitle: activeSubmodule.title || 'Unknown Submodule',
              currentPage,
              totalPages,
              progressPercent,
              currentSection,
              totalSections,
              href: lessonResumeHref(
                module._id,
                activeSubmodule._id,
                activeLesson._id,
                lessonProgress
              ),
            };
            catalogLessons.push(candidate);
            if (isResumable(lessonProgress)) availableLessons.push(candidate);
          }
        }
      }

      // Sort by most recently accessed using O(1) lookups.
      const inProgressLessons = availableLessons.sort((a, b) => {
        const aAccess = progressByLessonId.get(a.id)?.last_accessed_at;
        const bAccess = progressByLessonId.get(b.id)?.last_accessed_at;

        if (!aAccess && !bAccess) return 0;
        if (!aAccess) return 1;
        if (!bAccess) return -1;

        return new Date(bAccess).getTime() - new Date(aAccess).getTime();
      });

      if (!inProgressLessons.length) {
        const latest = progressRows.find(row =>
          catalogLessons.some(lesson => lesson.id === row.sanity_lesson_id)
        );
        const pivot = catalogLessons.findIndex(
          lesson => lesson.id === latest?.sanity_lesson_id
        );
        const ordered = [
          ...catalogLessons.slice(pivot + 1),
          ...catalogLessons.slice(0, pivot + 1),
        ];
        const next = ordered.find(
          lesson => !progressByLessonId.get(lesson.id)?.is_completed
        );
        if (next)
          inProgressLessons.push({
            ...next,
            isNext: true,
            href: lessonResumeHref(next.moduleId, next.submoduleId, next.id),
          });
      }
      if (isLatestRequest()) setLessons(inProgressLessons);
    } catch (error) {
      if (isLatestRequest()) {
        console.error('Error fetching in-progress lessons:', error);
        setError('Failed to load lessons');
      }
    } finally {
      if (isLatestRequest()) setIsLoading(false);
    }
  }, [language, province, provinceLoading]);

  // Fetch on mount and whenever the content language changes.
  useEffect(() => {
    void fetchInProgressLessons();
    return () => {
      requestSequence.current += 1;
    };
  }, [fetchInProgressLessons]);

  // Subscribe to progress update events
  useEffect(() => {
    const unsubscribe = progressEventEmitter.subscribe(() => {
      // Only refetch when progress is logged to the database
      void fetchInProgressLessons();
    });

    return unsubscribe;
  }, [fetchInProgressLessons]);

  // The cards were built for the province of the request that made them. A
  // profile change renders before the next request starts, so the returned
  // cards are checked against the province of this render.
  const visibleLessons = useMemo(
    () =>
      lessons.filter(lesson =>
        isVisibleForProvince(lesson.moduleProvince, province)
      ),
    [lessons, province]
  );

  return {
    lessons: visibleLessons,
    isLoading,
    error,
    refresh: fetchInProgressLessons,
  };
}
