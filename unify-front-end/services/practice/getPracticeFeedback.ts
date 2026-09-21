import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { resolveAiResponseLanguage } from '@/utils/aiLanguage';

export interface PracticeFeedbackRequest {
  questionText: string;
  userAnswer: string;
  expectedAnswer?: string;
  practiceTitle?: string;
}

/**
 * Calls the practice-feedback edge function. Feedback comes back in the
 * current UI language; `language` is omitted for English so the function
 * keeps its default English prompt.
 */
export async function getPracticeFeedback(
  request: PracticeFeedbackRequest
): Promise<string> {
  const language = resolveAiResponseLanguage(i18n.language);
  let data, error;
  try {
    const result = await supabase.functions.invoke('practice-feedback', {
      body: { ...request, ...(language ? { language } : {}) },
    });
    data = result.data;
    error = result.error;
  } catch (err: any) {
    throw new Error(
      `Failed to reach feedback service: ${err.message || err}`
    );
  }

  if (error) {
    throw new Error(error.message || 'Failed to get feedback');
  }

  if (!data?.feedback) {
    throw new Error('No feedback available');
  }

  return data.feedback;
}
