import {
  SanityLessonWithQuizzes,
  SanityQuiz,
  SanitySubmoduleWithLessons,
} from '@/types/sanity';

export interface SubmodulePageCounts {
  introPages: number;
  lessonPages: number;
  activityPages: number;
  quizPages: number;
  endingPages: number;
  totalPages: number;
}

export interface CurrentProgress {
  currentPage: number;
  totalPages: number;
  progressPercentage: number;
}

const resolvePageCount = (
  pages: unknown[] | undefined,
  countedValue: number | undefined
): number => {
  if (typeof countedValue === 'number' && Number.isFinite(countedValue)) {
    return countedValue;
  }
  return pages?.length || 0;
};

const resolveQuizQuestionCount = (lesson: SanityLessonWithQuizzes): number => {
  if (
    typeof lesson.quiz_question_count === 'number' &&
    Number.isFinite(lesson.quiz_question_count)
  ) {
    return lesson.quiz_question_count;
  }

  return (
    lesson.quizzes?.reduce((acc: number, quiz: SanityQuiz) => {
      if (
        typeof quiz.question_count === 'number' &&
        Number.isFinite(quiz.question_count)
      ) {
        return acc + quiz.question_count;
      }
      return acc + (quiz.questions?.length || 0);
    }, 0) || 0
  );
};

/**
 * Last reading page of a lesson. Submodule lesson lists carry only the
 * projected `lesson_page_count`, not the `pages` array.
 */
export function getLastLessonPageNumber(
  lesson: Pick<SanityLessonWithQuizzes, 'pages' | 'lesson_page_count'>
): number {
  return Math.max(1, resolvePageCount(lesson.pages, lesson.lesson_page_count));
}

const getLessonPageBreakdown = (lesson: SanityLessonWithQuizzes) => {
  const lessonPages = resolvePageCount(lesson.pages, lesson.lesson_page_count);
  const activityPages = resolvePageCount(
    lesson.activity_pages,
    lesson.activity_page_count
  );
  const endingPages = resolvePageCount(
    lesson.ending_pages,
    lesson.ending_page_count
  );
  const quizPages = resolveQuizQuestionCount(lesson);

  return { lessonPages, activityPages, quizPages, endingPages };
};

/**
 * Canonical denominator for `user_lesson_progress.total_pages`. Sums lesson
 * pages + activity pages + quiz questions + ending pages. Every call site that
 * writes `total_pages` (saveLessonCompletion, saveCurrentPage) must use this —
 * otherwise the same lesson ends up with different totals depending on which
 * screen last wrote it, and `completed_pages / total_pages` breaks across the
 * Home carousel, submodule progress bars, and module completion checks.
 *
 * Quizzes aren't always embedded on the lesson (useSanityLesson strips them).
 * Pass them separately via the second arg when available (from
 * useSanityLessonQuizzes); otherwise the helper falls back to lesson.quizzes.
 */
export function getLessonTotalPages(
  lesson:
    | (Partial<SanityLessonWithQuizzes> & { pages?: unknown[] })
    | null
    | undefined,
  quizzes?: SanityQuiz[] | null
): number {
  if (!lesson) return 0;

  const lessonPages = resolvePageCount(
    lesson.pages as unknown[] | undefined,
    (lesson as Partial<SanityLessonWithQuizzes>).lesson_page_count
  );
  const activityPages = resolvePageCount(
    lesson.activity_pages,
    lesson.activity_page_count
  );
  const endingPages = resolvePageCount(
    lesson.ending_pages,
    lesson.ending_page_count
  );

  const quizSource = quizzes ?? lesson.quizzes ?? [];
  const quizPages = quizSource.reduce((acc: number, quiz: SanityQuiz) => {
    if (
      typeof quiz?.question_count === 'number' &&
      Number.isFinite(quiz.question_count)
    ) {
      return acc + quiz.question_count;
    }
    return acc + (quiz?.questions?.length || 0);
  }, 0);

  return lessonPages + activityPages + quizPages + endingPages;
}

/**
 * Calculate the total number of pages in a submodule
 */
function calculateSubmodulePageCounts(
  submoduleData: SanitySubmoduleWithLessons | null
): SubmodulePageCounts {
  if (!submoduleData) {
    return {
      introPages: 0,
      lessonPages: 0,
      activityPages: 0,
      quizPages: 0,
      endingPages: 0,
      totalPages: 0,
    };
  }

  // Count intro pages
  const introPages = submoduleData.intro_pages?.length || 0;

  // Count lesson pages, activity pages, quiz pages, and ending pages
  let lessonPages = 0;
  let activityPages = 0;
  let quizPages = 0;
  let endingPages = 0;

  if (submoduleData.lessons) {
    submoduleData.lessons.forEach(lesson => {
      const breakdown = getLessonPageBreakdown(lesson);
      lessonPages += breakdown.lessonPages;
      activityPages += breakdown.activityPages;
      quizPages += breakdown.quizPages;
      endingPages += breakdown.endingPages;
    });
  }

  const totalPages =
    introPages + lessonPages + activityPages + quizPages + endingPages;

  return {
    introPages,
    lessonPages,
    activityPages,
    quizPages,
    endingPages,
    totalPages,
  };
}

/**
 * Calculate current progress for intro pages
 */
export function calculateIntroProgress(
  submoduleData: SanitySubmoduleWithLessons | null,
  currentPage: number
): CurrentProgress {
  const pageCounts = calculateSubmodulePageCounts(submoduleData);

  // First page shows 1 progress, second page shows 2 progress, etc.
  const progressValue = currentPage;

  return {
    currentPage: progressValue,
    totalPages: pageCounts.totalPages,
    progressPercentage:
      pageCounts.totalPages > 0
        ? (progressValue / pageCounts.totalPages) * 100
        : 0,
  };
}

/**
 * Calculate current progress for lesson pages
 */
export function calculateLessonProgress(
  submoduleData: SanitySubmoduleWithLessons | null,
  lessonId: string,
  currentPage: number
): CurrentProgress {
  const pageCounts = calculateSubmodulePageCounts(submoduleData);

  // Find the current lesson index
  const currentLessonIndex =
    submoduleData?.lessons?.findIndex(l => l._id === lessonId) || 0;

  // Calculate pages completed before current lesson
  let pagesCompleted = pageCounts.introPages; // Start with intro pages

  // Add pages from previous lessons
  if (submoduleData?.lessons && currentLessonIndex > 0) {
    for (let i = 0; i < currentLessonIndex; i++) {
      const lesson = submoduleData.lessons[i];
      const breakdown = getLessonPageBreakdown(lesson);
      pagesCompleted += breakdown.lessonPages;
      pagesCompleted += breakdown.activityPages;
      pagesCompleted += breakdown.quizPages;
      pagesCompleted += breakdown.endingPages;
    }
  }

  // Add current lesson progress (currentPage is already 1-indexed)
  const currentProgress = pagesCompleted + currentPage;

  return {
    currentPage: currentProgress,
    totalPages: pageCounts.totalPages,
    progressPercentage:
      pageCounts.totalPages > 0
        ? (currentProgress / pageCounts.totalPages) * 100
        : 0,
  };
}

/**
 * Calculate current progress for activity pages
 */
export function calculateActivityProgress(
  submoduleData: SanitySubmoduleWithLessons | null,
  lessonId: string,
  currentPage: number
): CurrentProgress {
  const pageCounts = calculateSubmodulePageCounts(submoduleData);

  // Find the current lesson index
  const currentLessonIndex =
    submoduleData?.lessons?.findIndex(l => l._id === lessonId) || 0;

  // Calculate pages completed before current lesson activities
  let pagesCompleted = pageCounts.introPages; // Start with intro pages

  // Add pages from previous lessons
  if (submoduleData?.lessons && currentLessonIndex >= 0) {
    for (let i = 0; i <= currentLessonIndex; i++) {
      const lesson = submoduleData.lessons[i];
      if (i < currentLessonIndex) {
        // Previous lessons - add all pages
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += breakdown.activityPages;
        pagesCompleted += breakdown.quizPages;
        pagesCompleted += breakdown.endingPages;
      } else {
        // Current lesson - add lesson pages, then activity pages
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += currentPage; // Current activity page (1-indexed)
      }
    }
  }

  return {
    currentPage: pagesCompleted,
    totalPages: pageCounts.totalPages,
    progressPercentage:
      pageCounts.totalPages > 0
        ? (pagesCompleted / pageCounts.totalPages) * 100
        : 0,
  };
}

/**
 * Calculate current progress for quiz pages
 */
export function calculateQuizProgress(
  submoduleData: SanitySubmoduleWithLessons | null,
  lessonId: string,
  quizId: string,
  currentQuestion: number
): CurrentProgress {
  const pageCounts = calculateSubmodulePageCounts(submoduleData);

  // Find the current lesson index
  const currentLessonIndex =
    submoduleData?.lessons?.findIndex(l => l._id === lessonId) || 0;

  // Calculate pages completed before current quiz
  let pagesCompleted = pageCounts.introPages; // Start with intro pages

  // Add pages from previous lessons
  if (submoduleData?.lessons && currentLessonIndex >= 0) {
    for (let i = 0; i <= currentLessonIndex; i++) {
      const lesson = submoduleData.lessons[i];
      if (i < currentLessonIndex) {
        // Previous lessons - add all pages
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += breakdown.activityPages;
        pagesCompleted += breakdown.quizPages;
        pagesCompleted += breakdown.endingPages;
      } else {
        // Current lesson - add lesson pages and activity pages
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += breakdown.activityPages;

        // Add quiz pages from current lesson up to current quiz
        if (lesson.quizzes) {
          const currentQuizIndex = lesson.quizzes.findIndex(
            q => q._id === quizId
          );
          for (let j = 0; j <= currentQuizIndex; j++) {
            const quiz = lesson.quizzes[j];
            if (j < currentQuizIndex) {
              // Previous quizzes in current lesson
              if (
                typeof quiz?.question_count === 'number' &&
                Number.isFinite(quiz.question_count)
              ) {
                pagesCompleted += quiz.question_count;
              } else {
                pagesCompleted += quiz.questions?.length || 0;
              }
            } else {
              // Current quiz (currentQuestion is already 1-indexed)
              pagesCompleted += currentQuestion;
            }
          }
        }
        // Note: ending pages are not added here as they come after quizzes
      }
    }
  }

  return {
    currentPage: pagesCompleted,
    totalPages: pageCounts.totalPages,
    progressPercentage:
      pageCounts.totalPages > 0
        ? (pagesCompleted / pageCounts.totalPages) * 100
        : 0,
  };
}

/**
 * Calculate current progress for ending pages
 */
export function calculateEndingProgress(
  submoduleData: SanitySubmoduleWithLessons | null,
  lessonId: string,
  currentPage: number
): CurrentProgress {
  const pageCounts = calculateSubmodulePageCounts(submoduleData);

  // Find the current lesson index
  const currentLessonIndex =
    submoduleData?.lessons?.findIndex(l => l._id === lessonId) || 0;

  // Calculate pages completed before current lesson ending pages
  let pagesCompleted = pageCounts.introPages; // Start with intro pages

  // Add pages from previous lessons
  if (submoduleData?.lessons && currentLessonIndex >= 0) {
    for (let i = 0; i <= currentLessonIndex; i++) {
      const lesson = submoduleData.lessons[i];
      if (i < currentLessonIndex) {
        // Previous lessons - add all pages
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += breakdown.activityPages;
        pagesCompleted += breakdown.quizPages;
        pagesCompleted += breakdown.endingPages;
      } else {
        // Current lesson - add lesson pages, activity pages, and all quizzes
        const breakdown = getLessonPageBreakdown(lesson);
        pagesCompleted += breakdown.lessonPages;
        pagesCompleted += breakdown.activityPages;
        pagesCompleted += breakdown.quizPages;
        // Add current ending page (currentPage is already 1-indexed)
        pagesCompleted += currentPage;
      }
    }
  }

  return {
    currentPage: pagesCompleted,
    totalPages: pageCounts.totalPages,
    progressPercentage:
      pageCounts.totalPages > 0
        ? (pagesCompleted / pageCounts.totalPages) * 100
        : 0,
  };
}
