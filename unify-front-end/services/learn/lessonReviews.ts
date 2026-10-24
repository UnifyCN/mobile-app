import { progressClient } from '@/services/progress/progressClient';

export async function saveLessonReview(
  lessonId: string,
  rating: number,
  comment: string
): Promise<void> {
  if (
    !lessonId ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    comment.length > 2000
  ) {
    throw new Error('Invalid lesson review');
  }
  const {
    data: { user },
    error: authError,
  } = await progressClient.auth.getUser();
  if (authError || !user) throw new Error('Sign in to save a review');
  const { error } = await progressClient.from('lesson_reviews').upsert(
    {
      user_id: user.id,
      sanity_lesson_id: lessonId,
      rating,
      comment: comment.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,sanity_lesson_id' }
  );
  if (error) throw error;
}
