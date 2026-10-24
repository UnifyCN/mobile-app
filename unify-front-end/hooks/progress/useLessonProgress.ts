import { useCallback } from 'react';
import { progressClient } from '@/services/progress/progressClient';
import { cachedProgressService } from '@/services/progress/cachedProgressService';
import { progressEventEmitter } from '@/utils/progressEventEmitter';
import {
  enqueueLessonProgressWrite,
  updateLessonProgress,
} from '@/services/progress/progressService';
import { maybeMarkModuleCompleted } from '@/services/learn/moduleProgressService';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';

export function useLessonProgress() {
  const { onLessonCompleted } = useLearnEvents();

  // Save lesson completion to database
  const saveLessonCompletion = useCallback(
    async (
      lessonId: string,
      submoduleId: string,
      moduleId: string,
      totalPages: number
    ) => {
      try {
        // Queue behind earlier page and resume writes for this lesson, so a
        // late one cannot mark the completed lesson as in progress again.
        const saved = await enqueueLessonProgressWrite(lessonId, async () => {
          const {
            data: { user },
            error: authError,
          } = await progressClient.auth.getUser();

          if (authError || !user) {
            console.error('No authenticated user found:', authError);
            return false;
          }

          const { error } = await progressClient
            .from('user_lesson_progress')
            .upsert(
              {
                user_id: user.id, // Use actual authenticated user ID
                sanity_lesson_id: lessonId,
                sanity_submodule_id: submoduleId,
                sanity_module_id: moduleId,
                progress_percent: 100.0,
                total_pages: totalPages,
                completed_pages: totalPages,
                is_completed: true,
                is_in_progress: false,
                completed_at: new Date().toISOString(),
                last_accessed_at: new Date().toISOString(),
              },
              {
                onConflict: 'user_id,sanity_lesson_id',
              }
            );

          if (error) {
            console.error('Error saving lesson completion:', error);
            return false;
          }
          return true;
        });
        if (!saved) return false;

        // DO NOT await the full cache refresh here — it fetches every
        // user_lesson_progress row AND runs a huge GROQ for all modules /
        // submodules / lessons (~several seconds on slow networks). Awaiting
        // it blocks lesson-end navigation and makes the whole Learn tab feel
        // laggy. Just mark the cache stale; consumers that need fresh data
        // (submodule index's useFocusEffect) already call `refreshProgress()`
        // themselves on the next render.
        cachedProgressService.invalidate();

        // Emit progress update event to trigger refetch in learn index
        progressEventEmitter.emit();

        // lesson_completed: every end-of-lesson path (last content page,
        // activity, quiz, or ending page) saves through here.
        onLessonCompleted(moduleId, submoduleId, lessonId);

        // Fire-and-forget: if this was the last lesson in the module, flip
        // `learn_progress.status` to 'completed'. Never block the UI on this.
        maybeMarkModuleCompleted(moduleId)
          .then(() => progressEventEmitter.emit())
          .catch(() => {
            /* swallowed in the helper too, but belt & suspenders */
          });

        return true;
      } catch (error) {
        console.error('Error saving lesson completion:', error);
        return false;
      }
    },
    [onLessonCompleted]
  );

  /**
   * Persists the user's current page position so they can resume exactly where
   * they left off. Call this fire-and-forget on every Next press.
   */
  const saveCurrentPage = useCallback(
    (
      lessonId: string,
      submoduleId: string,
      moduleId: string,
      pageType: 'intro' | 'lesson' | 'activity' | 'quiz',
      pageNumber: number,
      totalPages: number,
      quizId?: string,
      questionNumber?: number
    ) => {
      if (!lessonId || !submoduleId || !moduleId) return;
      updateLessonProgress(
        lessonId,
        submoduleId,
        moduleId,
        pageType,
        pageNumber,
        totalPages,
        quizId,
        questionNumber
      ).then(() => {
        // Invalidate the cached progress so the submodule index gets fresh data
        cachedProgressService.invalidate();
      });
    },
    []
  );

  return {
    saveLessonCompletion,
    saveCurrentPage,
  };
}
