export interface ResumeProgress {
  sanity_lesson_id: string;
  is_completed?: boolean;
  is_in_progress?: boolean;
  completed_pages?: number;
  current_page_type?: string;
  current_page_number?: number;
  current_quiz_id?: string;
  current_question_number?: number;
  last_accessed_at?: string;
}

export function isResumable(progress?: ResumeProgress) {
  return Boolean(
    progress &&
    !progress.is_completed &&
    (progress.is_in_progress || (progress.completed_pages ?? 0) > 0)
  );
}

export function lessonResumeHref(
  moduleId: string,
  submoduleId: string,
  lessonId: string,
  progress?: ResumeProgress
) {
  const base = `/(tabs)/Learn/modules/${moduleId}/${submoduleId}`;
  const positiveInteger = (n?: number) =>
    Number.isFinite(n) ? Math.max(1, Math.floor(n!)) : 1;
  const page = positiveInteger(progress?.current_page_number);
  if (progress?.current_page_type === 'intro') return `${base}/intro/${page}`;
  if (progress?.current_page_type === 'quiz' && progress.current_quiz_id) {
    return `${base}/lessons/${lessonId}/quizzes/${progress.current_quiz_id}/pages/${positiveInteger(progress.current_question_number)}`;
  }
  const section =
    progress?.current_page_type === 'activity'
      ? 'activities'
      : progress?.current_page_type === 'ending'
        ? 'ending'
        : 'pages';
  return `${base}/lessons/${lessonId}/${section}/${page}`;
}
