import { highlightRangeMatches } from '@/utils/highlightRange';
import { supabase } from '@/lib/supabase';

export interface Highlight {
  id: string;
  user_id: string;
  lesson_id: string;
  page_key: string;
  block_key: string;
  start_word_index: number;
  end_word_index: number;
  selected_text: string;
  created_at: string;
  module_id?: string;
  submodule_id?: string;
  submodule_title?: string;
  page_num?: number;
}

/**
 * Fetch all highlights for a specific lesson page, scoped to the current user via RLS.
 */
export async function getHighlightsForPage(
  lessonId: string,
  pageKey: string
): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from('lesson_highlights')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('page_key', pageKey)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch all highlights for the current user across all lessons (for Saved screen).
 */
export async function getAllUserHighlights(): Promise<Highlight[]> {
  const { data, error } = await supabase
    .from('lesson_highlights')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Save a new highlight. Handles merge logic: if the new highlight overlaps
 * an existing one in the same block, they are merged into a single highlight.
 *
 * @param allWordsInBlock - The complete word list for the block, used to
 *   reconstruct the merged selected_text when highlights overlap.
 */
export async function saveHighlight(
  lessonId: string,
  pageKey: string,
  blockKey: string,
  startWordIndex: number,
  endWordIndex: number,
  selectedText: string,
  existingHighlights: Highlight[],
  allWordsInBlock: string[],
  navContext?: {
    moduleId: string;
    submoduleId: string;
    submoduleTitle: string;
    pageNum: number;
  }
): Promise<Highlight> {
  if (
    !highlightRangeMatches(
      allWordsInBlock,
      startWordIndex,
      endWordIndex,
      selectedText
    )
  ) {
    throw new Error('The selected text no longer matches the lesson content.');
  }
  // Filter out optimistic (non-UUID) entries before checking overlaps
  const realHighlights = existingHighlights.filter(
    h =>
      !h.id.startsWith('optimistic-') &&
      h.lesson_id === lessonId &&
      h.page_key === pageKey &&
      h.block_key === blockKey &&
      highlightRangeMatches(
        allWordsInBlock,
        h.start_word_index,
        h.end_word_index,
        h.selected_text
      )
  );

  // Check for overlapping highlights in the same block
  const overlapping = realHighlights.filter(
    h =>
      h.block_key === blockKey &&
      h.start_word_index <= endWordIndex &&
      h.end_word_index >= startWordIndex
  );

  if (overlapping.length > 0) {
    // Merge: find the combined range
    const mergedStart = Math.min(
      startWordIndex,
      ...overlapping.map(h => h.start_word_index)
    );
    const mergedEnd = Math.max(
      endWordIndex,
      ...overlapping.map(h => h.end_word_index)
    );

    // Validate bounds before slicing
    const clampedStart = Math.max(
      0,
      Math.min(mergedStart, allWordsInBlock.length - 1)
    );
    const clampedEnd = Math.max(
      clampedStart,
      Math.min(mergedEnd, allWordsInBlock.length - 1)
    );

    // Reconstruct the full merged text from the word list
    const mergedText = allWordsInBlock
      .slice(clampedStart, clampedEnd + 1)
      .join(' ');

    // Atomic delete + insert via RPC (single transaction)
    const idsToDelete = overlapping.map(h => h.id);
    const { data, error } = await supabase.rpc('merge_highlights', {
      p_ids_to_delete: idsToDelete,
      p_lesson_id: lessonId,
      p_page_key: pageKey,
      p_block_key: blockKey,
      p_start_word_index: clampedStart,
      p_end_word_index: clampedEnd,
      p_selected_text: mergedText,
      p_module_id: navContext?.moduleId ?? null,
      p_submodule_id: navContext?.submoduleId ?? null,
      p_submodule_title: navContext?.submoduleTitle ?? null,
      p_page_num: navContext?.pageNum ?? null,
    });

    if (error) throw error;
    return data;
  }

  // No overlap — simple insert
  const { data, error } = await supabase
    .from('lesson_highlights')
    .insert({
      lesson_id: lessonId,
      page_key: pageKey,
      block_key: blockKey,
      start_word_index: startWordIndex,
      end_word_index: endWordIndex,
      selected_text: selectedText,
      ...(navContext && {
        module_id: navContext.moduleId,
        submodule_id: navContext.submoduleId,
        submodule_title: navContext.submoduleTitle,
        page_num: navContext.pageNum,
      }),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a highlight by ID.
 */
export async function deleteHighlight(highlightId: string): Promise<void> {
  const { error } = await supabase
    .from('lesson_highlights')
    .delete()
    .eq('id', highlightId);

  if (error) throw error;
}
