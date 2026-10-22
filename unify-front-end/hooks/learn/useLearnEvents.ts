import { useMemo } from 'react';

import { useAnalytics } from '@/utils/analytics';
import { LearnEventGate, learnEventGate } from '@/utils/learnEventGate';

/**
 * Learn start/complete events (submodule_viewed, lesson_started,
 * lesson_completed, activity_completed). Screens report what happened; the
 * gate decides whether that is a new occurrence worth an event.
 */
export function useLearnEvents(gate: LearnEventGate = learnEventGate) {
  const {
    trackSubmoduleViewed,
    trackLessonStarted,
    trackLessonCompleted,
    trackActivityCompleted,
  } = useAnalytics();

  return useMemo(
    () => ({
      /** Learn home or a module screen gained focus: the user left any submodule. */
      onLearnHubFocused: () => gate.hubFocused(),
      onSubmoduleFocused: (
        moduleId: string,
        submoduleId: string,
        submoduleTitle?: string
      ) => {
        if (gate.submoduleFocused(submoduleId)) {
          trackSubmoduleViewed(moduleId, submoduleId, submoduleTitle);
        }
      },
      onLessonPageFocused: (
        moduleId: string,
        submoduleId: string,
        lessonId: string,
        pageNumber: number,
        lessonTitle?: string
      ) => {
        if (gate.lessonPageFocused(lessonId, pageNumber)) {
          trackLessonStarted(moduleId, submoduleId, lessonId, lessonTitle);
        }
      },
      onLessonCompleted: (
        moduleId: string,
        submoduleId: string,
        lessonId: string
      ) => {
        if (gate.lessonCompleted(lessonId)) {
          trackLessonCompleted(moduleId, submoduleId, lessonId);
        }
      },
      onActivitySubmitted: (
        moduleId: string,
        submoduleId: string,
        lessonId: string,
        activityId: string
      ) => {
        if (gate.activitySubmitted(lessonId, activityId)) {
          trackActivityCompleted(moduleId, submoduleId, lessonId, activityId);
        }
      },
    }),
    [
      gate,
      trackSubmoduleViewed,
      trackLessonStarted,
      trackLessonCompleted,
      trackActivityCompleted,
    ]
  );
}
