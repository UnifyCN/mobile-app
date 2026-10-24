import { progressClient } from './progressClient';
import { UserLessonProgress, UserPageProgress } from '@/types/progress';
import { progressEventEmitter } from '@/utils/progressEventEmitter';

// =============================================
// LESSON PROGRESS SERVICE
// =============================================

export async function getLessonProgress(
  lessonId: string
): Promise<UserLessonProgress | null> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return null;

    const { data, error } = await progressClient
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('sanity_lesson_id', lessonId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching lesson progress:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getLessonProgress:', error);
    return null;
  }
}

export async function getLessonProgressesBySubmodule(
  submoduleId: string
): Promise<Record<string, UserLessonProgress>> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return {};

    const { data, error } = await progressClient
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('sanity_submodule_id', submoduleId);

    if (error) {
      console.error('Error fetching lesson progresses by submodule:', error);
      return {};
    }

    const result: Record<string, UserLessonProgress> = {};
    for (const row of data || []) {
      if (row?.sanity_lesson_id) {
        result[row.sanity_lesson_id] = row;
      }
    }

    return result;
  } catch (error) {
    console.error('Error in getLessonProgressesBySubmodule:', error);
    return {};
  }
}

async function startLesson(
  lessonId: string,
  submoduleId: string,
  moduleId: string
): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    const { error } = await progressClient.from('user_lesson_progress').upsert(
      {
        user_id: user.id,
        sanity_lesson_id: lessonId,
        sanity_submodule_id: submoduleId,
        sanity_module_id: moduleId,
        is_in_progress: true,
        current_page_type: 'lesson',
        current_page_number: 1,
        current_question_number: 1,
        last_accessed_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,sanity_lesson_id',
      }
    );

    if (error) {
      console.error('Error starting lesson:', error);
    } else {
      // Emit progress update event
      progressEventEmitter.emit();
    }
  } catch (error) {
    console.error('Error in startLesson:', error);
  }
}

// Every writer of a lesson's user_lesson_progress row (page progress, resume
// position, completion) runs through one queue per lesson, in call order. A
// slow earlier write can otherwise land last and move the resume point back,
// or mark a completed lesson as in progress again.
const lessonProgressWrites = new Map<string, Promise<unknown>>();

export function enqueueLessonProgressWrite<T>(
  lessonId: string,
  write: () => Promise<T>
): Promise<T> {
  const previous = lessonProgressWrites.get(lessonId) || Promise.resolve();
  const pending = previous.catch(() => undefined).then(write);
  lessonProgressWrites.set(lessonId, pending);
  const release = () => {
    if (lessonProgressWrites.get(lessonId) === pending) {
      lessonProgressWrites.delete(lessonId);
    }
  };
  void pending.then(release, release);
  return pending;
}

export function updateLessonProgress(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  pageType: 'intro' | 'lesson' | 'activity' | 'quiz',
  pageNumber: number,
  totalPages: number,
  quizId?: string,
  questionNumber?: number
): Promise<void> {
  return enqueueLessonProgressWrite(lessonId, () =>
    writeLessonProgress(
      lessonId,
      submoduleId,
      moduleId,
      pageType,
      pageNumber,
      totalPages,
      quizId,
      questionNumber
    )
  );
}

async function writeLessonProgress(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  pageType: 'intro' | 'lesson' | 'activity' | 'quiz',
  pageNumber: number,
  totalPages: number,
  quizId?: string,
  questionNumber?: number
): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    // Page N clicked → pages 1..N are now done
    const completedPages = Math.min(pageNumber, totalPages);
    const progressPercent =
      totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

    const upsertData: any = {
      user_id: user.id,
      sanity_lesson_id: lessonId,
      sanity_submodule_id: submoduleId,
      sanity_module_id: moduleId,
      is_in_progress: true,
      current_page_type: pageType,
      current_page_number: pageNumber,
      total_pages: totalPages,
      completed_pages: completedPages,
      progress_percent: progressPercent,
      last_accessed_at: new Date().toISOString(),
    };

    if (quizId) upsertData.current_quiz_id = quizId;
    if (questionNumber) upsertData.current_question_number = questionNumber;

    const { error } = await progressClient
      .from('user_lesson_progress')
      .upsert(upsertData, { onConflict: 'user_id,sanity_lesson_id' });

    if (error) {
      console.error('Error updating lesson progress:', error);
    } else {
      progressEventEmitter.emit();
    }
  } catch (error) {
    console.error('Error in updateLessonProgress:', error);
  }
}

/**
 * Persists ONLY the resume position (current page/quiz/question) without touching
 * progress_percent / completed_pages. `updateLessonProgress` conflates position with
 * the progress bar, which is fine for reading pages (page index == cumulative index)
 * but WRONG for activities/quizzes, where the within-section index is smaller than the
 * cumulative one and would drag the bar backwards. Use this from activity/quiz pages so
 * learnHref can resume the user to the exact spot without regressing their progress.
 */
export function saveResumePosition(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  pageType: 'intro' | 'lesson' | 'activity' | 'quiz' | 'ending',
  pageNumber: number,
  quizId?: string,
  questionNumber?: number
): Promise<boolean> {
  if (!lessonId || !submoduleId || !moduleId) return Promise.resolve(false);
  // Capture authentication at invocation, then write in visit order, including Back.
  const userRequest = progressClient.auth.getUser().catch(() => null);
  return enqueueLessonProgressWrite(lessonId, async () => {
    try {
      const auth = await userRequest;
      const user = auth?.data.user;
      if (!user) return false;

      const upsertData: any = {
        user_id: user.id,
        sanity_lesson_id: lessonId,
        sanity_submodule_id: submoduleId,
        sanity_module_id: moduleId,
        is_in_progress: true,
        current_page_type: pageType,
        current_page_number: pageNumber,
        last_accessed_at: new Date().toISOString(),
      };
      if (quizId) upsertData.current_quiz_id = quizId;
      if (questionNumber) upsertData.current_question_number = questionNumber;

      const { error } = await progressClient
        .from('user_lesson_progress')
        .upsert(upsertData, { onConflict: 'user_id,sanity_lesson_id' });

      if (error) {
        console.error('Error saving resume position:', error);
        return false;
      } else {
        progressEventEmitter.emit();
        return true;
      }
    } catch (error) {
      console.error('Error in saveResumePosition:', error);
      return false;
    }
  });
}

async function completeLesson(lessonId: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    const { error } = await progressClient
      .from('user_lesson_progress')
      .update({
        is_completed: true,
        is_in_progress: false,
        completed_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('sanity_lesson_id', lessonId);

    if (error) {
      console.error('Error completing lesson:', error);
    } else {
      // Emit progress update event
      progressEventEmitter.emit();
    }
  } catch (error) {
    console.error('Error in completeLesson:', error);
  }
}

// =============================================
// PAGE PROGRESS SERVICE
// =============================================

async function trackPageVisit(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  pageType: 'intro' | 'lesson' | 'activity' | 'quiz',
  pageKey: string,
  pageNumber: number,
  quizId?: string,
  questionNumber?: number
): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    const { error } = await progressClient.from('user_page_progress').upsert(
      {
        user_id: user.id,
        sanity_lesson_id: lessonId,
        sanity_submodule_id: submoduleId,
        sanity_module_id: moduleId,
        page_type: pageType,
        page_key: pageKey,
        page_number: pageNumber,
        sanity_quiz_id: quizId,
        question_number: questionNumber,
        is_visited: true,
        first_visited_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,sanity_lesson_id,page_type,page_key',
      }
    );

    if (error) {
      console.error('Error tracking page visit:', error);
    } else {
      // Emit progress update event (page visits are progress updates)
      progressEventEmitter.emit();
    }
  } catch (error) {
    console.error('Error in trackPageVisit:', error);
  }
}

async function completePage(
  lessonId: string,
  pageType: 'intro' | 'lesson' | 'activity' | 'quiz',
  pageKey: string
): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    const { error } = await progressClient
      .from('user_page_progress')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('sanity_lesson_id', lessonId)
      .eq('page_type', pageType)
      .eq('page_key', pageKey);

    if (error) {
      console.error('Error completing page:', error);
    } else {
      // Emit progress update event
      progressEventEmitter.emit();
    }
  } catch (error) {
    console.error('Error in completePage:', error);
  }
}

// =============================================
// QUIZ PROGRESS SERVICE
// =============================================

export async function startQuizAttempt(
  quizId: string,
  lessonId: string,
  submoduleId: string,
  moduleId: string
): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return null;

    // Get current attempt number
    const { data: existingAttempts } = await progressClient
      .from('user_quiz_attempts')
      .select('attempt_number')
      .eq('user_id', user.id)
      .eq('sanity_quiz_id', quizId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    const attemptNumber = existingAttempts?.[0]?.attempt_number
      ? existingAttempts[0].attempt_number + 1
      : 1;

    const { data, error } = await progressClient
      .from('user_quiz_attempts')
      .insert({
        user_id: user.id,
        sanity_quiz_id: quizId,
        sanity_lesson_id: lessonId,
        sanity_submodule_id: submoduleId,
        sanity_module_id: moduleId,
        attempt_number: attemptNumber,
        total_questions: 0, // Will be updated as questions are answered
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error starting quiz attempt:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error in startQuizAttempt:', error);
    return null;
  }
}

/**
 * Returns the id of the current *in-progress* (not-yet-completed) quiz attempt for
 * this user+quiz, creating one if none exists. Used to resume a quiz so selections
 * persist across question navigation and exit/re-entry within the same attempt.
 */
export async function getOrCreateInProgressQuizAttempt(
  quizId: string,
  lessonId: string,
  submoduleId: string,
  moduleId: string
): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return null;

    const { data: existing, error: fetchError } = await progressClient
      .from('user_quiz_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('sanity_quiz_id', quizId)
      .is('completed_at', null)
      .order('attempt_number', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching in-progress quiz attempt:', fetchError);
      return null;
    }

    if (existing?.[0]?.id) return existing[0].id;

    const created = await startQuizAttempt(
      quizId,
      lessonId,
      submoduleId,
      moduleId
    );
    if (created) return created;

    // Creation may have lost a race to a concurrent mount (two question pages
    // inserting attempt_number=1 → unique violation → startQuizAttempt returns
    // null). Re-read once so we still land on the attempt the other mount created.
    const { data: retry } = await progressClient
      .from('user_quiz_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('sanity_quiz_id', quizId)
      .is('completed_at', null)
      .order('attempt_number', { ascending: false })
      .limit(1);

    return retry?.[0]?.id ?? null;
  } catch (error) {
    console.error('Error in getOrCreateInProgressQuizAttempt:', error);
    return null;
  }
}

/** Loads saved answers for a quiz attempt, keyed by sanity question id. */
export async function getQuizResponses(
  attemptId: string
): Promise<Record<string, any>> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return {};

    const { data, error } = await progressClient
      .from('user_quiz_responses')
      .select('sanity_question_id, user_answer')
      .eq('user_id', user.id)
      .eq('quiz_attempt_id', attemptId);

    if (error) {
      console.error('Error fetching quiz responses:', error);
      return {};
    }

    const result: Record<string, any> = {};
    for (const row of data || []) {
      if (row?.sanity_question_id) {
        result[row.sanity_question_id] = row.user_answer;
      }
    }
    return result;
  } catch (error) {
    console.error('Error in getQuizResponses:', error);
    return {};
  }
}

export async function submitQuizAnswer(
  attemptId: string,
  questionId: string,
  questionType: string,
  answer: any,
  isCorrect: boolean
): Promise<void> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return;

    const { error } = await progressClient.from('user_quiz_responses').upsert(
      {
        user_id: user.id,
        quiz_attempt_id: attemptId,
        sanity_question_id: questionId,
        question_type: questionType,
        user_answer: answer,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      },
      {
        onConflict: 'quiz_attempt_id,sanity_question_id',
      }
    );

    if (error) {
      console.error('Error submitting quiz answer:', error);
    }
  } catch (error) {
    console.error('Error in submitQuizAnswer:', error);
  }
}

/**
 * Closes an in-progress quiz attempt (sets completed_at) so the NEXT visit to the
 * quiz starts a fresh attempt instead of resuming old answers. Kept separate from
 * completeQuizAttempt so we don't have to fabricate a score just to close it.
 */
export async function markQuizAttemptComplete(
  attemptId: string
): Promise<void> {
  try {
    if (!attemptId) return;
    const { error } = await progressClient
      .from('user_quiz_attempts')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', attemptId)
      .is('completed_at', null);
    if (error) {
      console.error('Error marking quiz attempt complete:', error);
    }
  } catch (error) {
    console.error('Error in markQuizAttemptComplete:', error);
  }
}

export async function completeQuizAttempt(
  attemptId: string,
  score: number,
  totalQuestions: number,
  correctAnswers: number
): Promise<void> {
  try {
    const { error } = await progressClient
      .from('user_quiz_attempts')
      .update({
        score_percent: score,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        is_passed: score >= 70, // Assuming 70% is passing
        completed_at: new Date().toISOString(),
      })
      .eq('id', attemptId);

    if (error) {
      console.error('Error completing quiz attempt:', error);
    }
  } catch (error) {
    console.error('Error in completeQuizAttempt:', error);
  }
}

// =============================================
// ACTIVITY INPUT SERVICE
// =============================================

// Prefix used to distinguish embedded multiple-choice question answers (which can
// be string | string[], stored JSON-encoded) from free-text inputs (plain string)
// within the single user_activity_inputs.input_value text column. A given Sanity
// block _key is only ever an input OR a question, never both.
export const ACTIVITY_QUESTION_PREFIX = 'q::';

export async function saveActivityInput(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  pageKey: string,
  fieldKey: string,
  value: string,
  isSubmitted = false
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return false;

    const payload: any = {
      user_id: user.id,
      sanity_lesson_id: lessonId,
      sanity_submodule_id: submoduleId,
      sanity_module_id: moduleId,
      activity_page_key: pageKey,
      input_field_key: fieldKey,
      input_value: value,
    };
    // Only a real submit writes is_submitted, so an in-flight draft autosave can
    // never downgrade an already-submitted row back to false (upsert leaves
    // columns absent from the payload untouched on conflict).
    if (isSubmitted) {
      payload.is_submitted = true;
      payload.submitted_at = new Date().toISOString();
    }

    const { error } = await progressClient
      .from('user_activity_inputs')
      .upsert(payload, {
        onConflict:
          'user_id,sanity_lesson_id,activity_page_key,input_field_key',
      });

    if (error) {
      console.error('Error saving activity input:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in saveActivityInput:', error);
    return false;
  }
}

export interface RestoredActivityInputs {
  /** free-text inputs keyed by block _key */
  inputValues: Record<string, string>;
  /** embedded question answers keyed by block _key */
  questionAnswers: Record<string, string | string[]>;
  /** whether any saved row on this page was already submitted */
  isSubmitted: boolean;
}

/**
 * Loads previously-saved activity inputs/answers for a lesson, grouped by
 * activity page key, so a page can rehydrate its state on mount.
 * Returns {} when the user is signed out or nothing was saved.
 */
export async function getActivityInputsByPage(
  lessonId: string
): Promise<Record<string, RestoredActivityInputs>> {
  try {
    const {
      data: { user },
    } = await progressClient.auth.getUser();
    if (!user) return {};

    const { data, error } = await progressClient
      .from('user_activity_inputs')
      .select('activity_page_key, input_field_key, input_value, is_submitted')
      .eq('user_id', user.id)
      .eq('sanity_lesson_id', lessonId);

    if (error) {
      console.error('Error fetching activity inputs:', error);
      return {};
    }

    const result: Record<string, RestoredActivityInputs> = {};
    for (const row of data || []) {
      const pageKey = row.activity_page_key as string;
      if (!result[pageKey]) {
        result[pageKey] = {
          inputValues: {},
          questionAnswers: {},
          isSubmitted: false,
        };
      }
      const bucket = result[pageKey];
      if (row.is_submitted) bucket.isSubmitted = true;

      const fieldKey = row.input_field_key as string;
      const raw = (row.input_value ?? '') as string;
      if (fieldKey.startsWith(ACTIVITY_QUESTION_PREFIX)) {
        const blockKey = fieldKey.slice(ACTIVITY_QUESTION_PREFIX.length);
        try {
          bucket.questionAnswers[blockKey] = JSON.parse(raw);
        } catch {
          bucket.questionAnswers[blockKey] = raw;
        }
      } else {
        bucket.inputValues[fieldKey] = raw;
      }
    }
    return result;
  } catch (error) {
    console.error('Error in getActivityInputsByPage:', error);
    return {};
  }
}
