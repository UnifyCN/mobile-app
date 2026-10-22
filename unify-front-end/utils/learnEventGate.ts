/**
 * Decides when the Learn analytics events may fire, so each one fires once
 * per occurrence and never again on a re-render, a re-focus, or a back
 * navigation. Lesson screens are pushed as new instances on every Next and
 * Back press, so this state cannot live in a component ref.
 *
 * Model:
 * - A Learn hub is Learn home or a module screen. Focus on a hub means the
 *   user left any submodule.
 * - A visit is the time between two boundaries: focus on the submodule
 *   screen, a module screen, or Learn home. Everything the user does inside
 *   lessons between two boundaries (Next, Back, moving between lessons and
 *   back again) belongs to one visit, so nothing fires twice inside it.
 * - submodule_viewed: the submodule screen gains focus and the user was not
 *   already inside that submodule (coming back from one of its lessons,
 *   tasks or practice is back navigation, not a new view).
 * - lesson_started: page 1 of a lesson gains focus and no screen of that
 *   lesson (page, activity, quiz, ending) has had focus in this visit. So
 *   resuming mid-lesson and then going Back to page 1 is not a start.
 * - lesson_completed and activity_completed: once per lesson (per activity)
 *   per visit.
 */
export interface LearnEventGate {
  hubFocused(): void;
  submoduleFocused(submoduleId: string): boolean;
  lessonPageFocused(lessonId: string, pageNumber: number): boolean;
  lessonScreenFocused(lessonId: string): void;
  lessonCompleted(lessonId: string): boolean;
  activitySubmitted(lessonId: string, activityId: string): boolean;
}

export function createLearnEventGate(): LearnEventGate {
  let currentSubmoduleId: string | null = null;
  // Lessons with a focused screen in this visit.
  const seenLessons = new Set<string>();
  // Once-per-visit events already fired.
  const fired = new Set<string>();

  const endVisit = () => {
    seenLessons.clear();
    fired.clear();
  };

  const fireOnce = (key: string) => {
    if (fired.has(key)) return false;
    fired.add(key);
    return true;
  };

  return {
    hubFocused() {
      currentSubmoduleId = null;
      endVisit();
    },
    submoduleFocused(submoduleId) {
      endVisit();
      if (currentSubmoduleId === submoduleId) return false;
      currentSubmoduleId = submoduleId;
      return true;
    },
    lessonPageFocused(lessonId, pageNumber) {
      if (seenLessons.has(lessonId)) return false;
      seenLessons.add(lessonId);
      return pageNumber === 1;
    },
    lessonScreenFocused(lessonId) {
      seenLessons.add(lessonId);
    },
    lessonCompleted(lessonId) {
      return fireOnce(`${lessonId}:completed`);
    },
    activitySubmitted(lessonId, activityId) {
      return fireOnce(`${lessonId}:activity:${activityId}`);
    },
  };
}

/** App-wide gate shared by every Learn screen. */
export const learnEventGate = createLearnEventGate();
