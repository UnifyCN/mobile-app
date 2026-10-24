import { highlightRangeMatches } from '@/utils/highlightRange';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHighlightsForPage,
  getAllUserHighlights,
  saveHighlight,
  deleteHighlight,
  Highlight,
} from '@/services/highlights/highlightService';

/**
 * Fetch highlights for a specific lesson page.
 */
export function usePageHighlights(lessonId: string, pageKey: string) {
  return useQuery({
    queryKey: ['highlights', lessonId, pageKey],
    queryFn: () => getHighlightsForPage(lessonId, pageKey),
    enabled: !!lessonId && !!pageKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch all highlights for the current user (for Saved screen).
 */
export function useAllHighlights() {
  return useQuery({
    queryKey: ['highlights', 'all'],
    queryFn: getAllUserHighlights,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Save a highlight with optimistic update and merge support.
 */
export function useSaveHighlight(lessonId: string, pageKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ['highlights', lessonId, pageKey];

  return useMutation({
    mutationFn: async ({
      blockKey,
      startWordIndex,
      endWordIndex,
      selectedText,
      allWordsInBlock,
      navContext,
      _snapshotHighlights,
    }: {
      blockKey: string;
      startWordIndex: number;
      endWordIndex: number;
      selectedText: string;
      allWordsInBlock: string[];
      navContext?: {
        moduleId: string;
        submoduleId: string;
        submoduleTitle: string;
        pageNum: number;
      };
      _snapshotHighlights?: Highlight[];
    }) => {
      // Use the pre-mutation snapshot captured in onMutate (falls back to current cache)
      const existingHighlights =
        _snapshotHighlights ??
        queryClient.getQueryData<Highlight[]>(queryKey) ??
        [];
      return saveHighlight(
        lessonId,
        pageKey,
        blockKey,
        startWordIndex,
        endWordIndex,
        selectedText,
        existingHighlights,
        allWordsInBlock,
        navContext
      );
    },
    onMutate: async variables => {
      const { blockKey, startWordIndex, endWordIndex, selectedText } =
        variables;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Highlight[]>(queryKey);

      // Capture pre-mutation snapshot for mutationFn overlap detection
      variables._snapshotHighlights = previous || [];

      queryClient.setQueryData<Highlight[]>(queryKey, old => {
        const existing = old || [];
        const nonOverlapping = existing.filter(
          h =>
            h.block_key !== blockKey ||
            !highlightRangeMatches(
              variables.allWordsInBlock,
              h.start_word_index,
              h.end_word_index,
              h.selected_text
            ) ||
            h.start_word_index > endWordIndex ||
            h.end_word_index < startWordIndex
        );
        return [
          ...nonOverlapping,
          {
            id: `optimistic-${Date.now()}`,
            user_id: 'optimistic-user',
            lesson_id: lessonId,
            page_key: pageKey,
            block_key: blockKey,
            start_word_index: startWordIndex,
            end_word_index: endWordIndex,
            selected_text: selectedText,
            created_at: new Date().toISOString(),
          },
        ];
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['highlights', 'all'] });
    },
  });
}

/**
 * Delete a highlight with optimistic update.
 */
export function useDeleteHighlight(lessonId: string, pageKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ['highlights', lessonId, pageKey];

  return useMutation({
    mutationFn: (highlightId: string) => deleteHighlight(highlightId),
    onMutate: async highlightId => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Highlight[]>(queryKey);

      queryClient.setQueryData<Highlight[]>(queryKey, old =>
        (old || []).filter(h => h.id !== highlightId)
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['highlights', 'all'] });
    },
  });
}
