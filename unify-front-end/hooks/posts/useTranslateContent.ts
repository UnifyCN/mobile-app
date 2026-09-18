import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  translateContent,
  type TranslatableType,
} from '@/services/posts/translateContent';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '@/i18n';

/**
 * On-demand translation of a post or comment into the current UI language.
 * Nothing fetches automatically: `TranslateButton` calls `translate()`, and
 * the result stays in the React Query cache (keyed by type + id + language)
 * so re-showing a translation is instant and switching UI language
 * re-translates. Mirrors the web app's `useContentTranslation`.
 */
export function useTranslateContent(type: TranslatableType, id: number) {
  const { i18n } = useTranslation();
  const lang = isSupportedLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;

  const query = useQuery({
    queryKey: ['translation', type, id, lang],
    queryFn: () => translateContent(type, id, lang),
    enabled: false, // on-demand only
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return {
    /**
     * Trigger the translation. `refetch` always runs `queryFn` (a network
     * request that may spend quota) — check `translation` first and skip
     * calling this when data is already cached.
     */
    translate: query.refetch,
    translation: query.data,
    isTranslating: query.isFetching,
    error: query.error,
    targetLanguage: lang,
  };
}
