/**
 * Decides when the Learn analytics events may fire, so each one fires once
 * per occurrence and never again on a re-render, a re-focus, or a back
 * navigation. Lesson screens are pushed as new instances on every Next and
 * Back press, so this state cannot live in a component ref.
 *
 * Model:
 * - A Learn hub is Learn home or a module screen. Focus on a hub means the
 *   user left any submodule.
 * - submodule_viewed: the submodule screen gains focus and the user was not
 *   already inside that submodule (coming back from one of its lessons,
 *   tasks or practice is back navigation, not a new view).
 * - A lesson visit starts when any lesson page of a lesson gains focus while
 *   that lesson is not the active visit. lesson_started fires only when that
 *   page is page 1 (resuming mid-lesson is not a start).
 * - A lesson visit ends when another lesson starts, or when the submodule
 *   screen or a hub gains focus (the user left the lesson flow).
 * - lesson_completed and activity_completed fire once per lesson visit.
 */
export interface LearnEventGate {
  hubFocused(): void;
  submoduleFocused(submoduleId: string): boolean;
  lessonPageFocused(lessonId: string, pageNumber: number): boolean;
  lessonCompleted(lessonId: string): boolean;
  activitySubmitted(lessonId: string, activityId: string): boolean;
}

export function createLearnEventGate(): LearnEventGate {
  let currentSubmoduleId: string | null = null;
  let activeLessonId: string | null = null;
  // Keys of once-per-visit events already fired, prefixed by lesson id.
  const fired = new Set<string>();

  const endLessonVisits = () => {
    activeLessonId = null;
    fired.clear();
  };

  const startLessonVisit = (lessonId: string) => {
    activeLessonId = lessonId;
    for (const key of fired) {
      if (key.startsWith(`${lessonId}:`)) fired.delete(key);
    }
  };

  return {
    hubFocused() {
      currentSubmoduleId = null;
      endLessonVisits();
    },
    submoduleFocused(submoduleId) {
      endLessonVisits();
      if (currentSubmoduleId === submoduleId) return false;
      currentSubmoduleId = submoduleId;
      return true;
    },
    lessonPageFocused(lessonId, pageNumber) {
      if (activeLessonId === lessonId) return false;
      startLessonVisit(lessonId);
      return pageNumber === 1;
    },
    lessonCompleted(lessonId) {
      const key = `${lessonId}:completed`;
      if (fired.has(key)) return false;
      fired.add(key);
      return true;
    },
    activitySubmitted(lessonId, activityId) {
      const key = `${lessonId}:activity:${activityId}`;
      if (fired.has(key)) return false;
      fired.add(key);
      return true;
    },
  };
}

/** App-wide gate shared by every Learn screen. */
export const learnEventGate = createLearnEventGate();
