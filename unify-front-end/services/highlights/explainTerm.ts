import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { resolveAiResponseLanguage } from '@/utils/aiLanguage';

/**
 * Calls the explain-term edge function to get a plain-language explanation
 * of a term or phrase from lesson content. The explanation comes back in the
 * current UI language; `language` is omitted for English so the function
 * keeps its default English prompt.
 */
export async function explainTerm(
  term: string,
  lessonContext?: string
): Promise<string> {
  const language = resolveAiResponseLanguage(i18n.language);
  let data, error;
  try {
    const result = await supabase.functions.invoke('explain-term', {
      body: { term, lessonContext, ...(language ? { language } : {}) },
    });
    data = result.data;
    error = result.error;
  } catch (err: any) {
    throw new Error(
      `Failed to reach explanation service: ${err.message || err}`
    );
  }

  if (error) {
    throw new Error(error.message || 'Failed to get explanation');
  }

  if (!data?.explanation) {
    throw new Error('No explanation available for this term');
  }

  return data.explanation;
}
