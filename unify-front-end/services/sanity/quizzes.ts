import { sanityClient } from '../../sanity-custom';
import { SanityQuiz, SanityQuizQuestion } from '../../types/sanity';
import {
  BASE_LANGUAGE_FILTER,
  i18nOverlay,
  mergeI18nOverlay,
  type SanityLanguage,
  type WithI18n,
} from './i18n';

const QUESTION_FIELDS = `questions[] | order(order_number asc) {
  _key,
  question_type,
  question_text,
  options[] { _key, text, value, is_correct, explanation },
  matching_pairs[] { _key, left_item, right_item, explanation },
  correct_answer { value, explanation, points },
  order_number,
  answer_box { content, showAfterSubmit }
}`;

// Get all quizzes for a lesson
export async function getLessonQuizzes(
  lessonId: string,
  language: SanityLanguage = 'en'
): Promise<SanityQuiz[]> {
  try {
    const query = `*[_type == "quiz" && lesson._ref == $lessonId && ${BASE_LANGUAGE_FILTER}] | order(order_number) {
      _id,
      _type,
      title,
      description,
      lesson,
      order_number,
      ${QUESTION_FIELDS},
      ${i18nOverlay(`title, description, ${QUESTION_FIELDS}`)}
    }`;

    const quizzes = await sanityClient.fetch<WithI18n<SanityQuiz>[]>(query, {
      lessonId,
      lang: language,
    });
    return (quizzes || []).map(mergeI18nOverlay);
  } catch (error) {
    console.error('Error fetching lesson quizzes from Sanity:', error);
    throw error;
  }
}

// Get quiz questions (questions are embedded in the quiz document)
export async function getQuizQuestions(
  quizId: string,
  language: SanityLanguage = 'en'
): Promise<SanityQuizQuestion[]> {
  try {
    const query = `*[_type == "quiz" && _id == $quizId && ${BASE_LANGUAGE_FILTER}][0] {
      ${QUESTION_FIELDS},
      ${i18nOverlay(QUESTION_FIELDS)}
    }`;

    const quiz = await sanityClient.fetch<WithI18n<
      Pick<SanityQuiz, 'questions'>
    > | null>(query, { quizId, lang: language });
    return quiz ? mergeI18nOverlay(quiz).questions || [] : [];
  } catch (error) {
    console.error('Error fetching quiz questions from Sanity:', error);
    throw error;
  }
}
