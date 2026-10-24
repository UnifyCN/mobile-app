import React, { useCallback, useMemo, useEffect } from 'react';
import { Text, StyleSheet, Linking } from 'react-native';
import { highlightRangeMatches } from '@/utils/highlightRange';
import { Theme } from '@/constants/Theme';
import { useSelectionOptional } from '@/context/SelectionContext';
import { Highlight } from '@/services/highlights/highlightService';

interface SelectableTextProps {
  /** Portable Text span children (from block.children) */
  spans: any[];
  /** Combined markDefs (props + block-level) */
  allMarkDefs: any[];
  /** The Portable Text block key — used to scope selection to a single block */
  blockKey: string;
  /** Persisted highlights for this block */
  highlights: Highlight[];
  /** Base text style (from RichTextRenderer) */
  style?: any;
  /** Merged styles object from RichTextRenderer for decorator resolution */
  mergedStyles?: any;
}

interface StyledWord {
  word: string;
  styles: any[];
  linkHref?: string;
  /** Sequential index among non-whitespace words only (undefined for whitespace tokens) */
  wordIndex?: number;
}

/**
 * Takes Portable Text span children and flattens them into per-segment items
 * that preserve inline styling (bold, italic, code, links) and whitespace.
 * Non-whitespace words get a sequential wordIndex for highlight/selection alignment.
 */
export function flattenSpansToWords(
  spans: any[],
  allMarkDefs: any[],
  mergedStyles?: any
): StyledWord[] {
  if (!spans || !Array.isArray(spans)) return [];

  const styledWords: StyledWord[] = [];
  let wordCounter = 0;

  for (const child of spans) {
    if (child._type !== 'span') continue;

    const text = child.text || '';
    if (!text.length) continue;

    const wordStyles: any[] = [];
    let linkHref: string | undefined;

    if (child.marks) {
      for (const mark of child.marks) {
        if (typeof mark === 'string') {
          const markDef = allMarkDefs.find((def: any) => def._key === mark);
          if (markDef && markDef._type === 'link') {
            linkHref = markDef.href;
          }
          switch (mark) {
            case 'strong':
              wordStyles.push(mergedStyles?.strong || { fontWeight: '700' });
              break;
            case 'em':
              wordStyles.push({ fontStyle: 'italic' as const });
              break;
            case 'code':
              wordStyles.push({
                fontFamily: 'monospace',
                backgroundColor: '#F3F4F6',
                paddingHorizontal: 4,
                borderRadius: 2,
              });
              break;
            case 'underline':
              wordStyles.push({ textDecorationLine: 'underline' as const });
              break;
            case 'strike-through':
              wordStyles.push({ textDecorationLine: 'line-through' as const });
              break;
          }
        } else if (typeof mark === 'object' && mark !== null) {
          const markType = mark._type;
          if (markType === 'link') {
            linkHref = mark.href || mark.value?.href;
          }
          const markKey = mark._key;
          if (markKey && !linkHref) {
            const markDef = allMarkDefs.find(
              (def: any) => def._key === markKey
            );
            if (markDef && markDef._type === 'link') {
              linkHref = markDef.href;
            }
          }
        }
      }
    }

    // Split text into words and whitespace, preserving both
    const segments = text.split(/(\s+)/);
    for (const segment of segments) {
      if (segment.length === 0) continue;
      const isWhitespace = /^\s+$/.test(segment);
      styledWords.push({
        word: segment,
        styles: wordStyles,
        linkHref,
        wordIndex: isWhitespace ? undefined : wordCounter++,
      });
    }
  }

  return styledWords;
}

/**
 * Checks if a word index is within any highlight range for this block.
 */
function findHighlightForWord(
  wordIndex: number | undefined,
  highlights: Highlight[]
): Highlight | null {
  if (wordIndex == null) return null;
  for (const h of highlights) {
    if (wordIndex >= h.start_word_index && wordIndex <= h.end_word_index) {
      return h;
    }
  }
  return null;
}

/**
 * Wrapper that checks for SelectionProvider. If absent, renders plain text.
 * If present, renders the interactive version with selection + highlights.
 */
export default function SelectableText(props: SelectableTextProps) {
  const selectionCtx = useSelectionOptional();

  if (!selectionCtx) {
    return <PlainStyledText {...props} />;
  }

  return <InteractiveSelectableText {...props} selectionCtx={selectionCtx} />;
}

/**
 * Plain text rendering — used when no SelectionProvider is available
 * (e.g. submodule intro screens, boxes outside lesson pages).
 */
function PlainStyledText({
  spans,
  allMarkDefs,
  blockKey,
  style,
  mergedStyles,
}: SelectableTextProps) {
  const styledWords = useMemo(
    () => flattenSpansToWords(spans, allMarkDefs, mergedStyles),
    [spans, allMarkDefs, mergedStyles]
  );

  return (
    <Text style={style}>
      {styledWords.map((sw, index) => {
        const wordStyle = [
          ...sw.styles,
          sw.linkHref ? componentStyles.link : undefined,
        ].filter(Boolean);

        return (
          <Text
            key={`${blockKey}-w-${index}`}
            style={wordStyle.length > 0 ? wordStyle : undefined}
            onPress={
              sw.linkHref ? () => Linking.openURL(sw.linkHref!) : undefined
            }
          >
            {sw.word}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Interactive text with selection, highlights, long-press, and tap-to-extend.
 * Only rendered when SelectionProvider is available.
 */
function InteractiveSelectableText({
  spans,
  allMarkDefs,
  blockKey,
  highlights,
  style,
  mergedStyles,
  selectionCtx,
}: SelectableTextProps & {
  selectionCtx: NonNullable<ReturnType<typeof useSelectionOptional>>;
}) {
  const { selection, onWordLongPress, onWordTap } = selectionCtx;

  const styledWords = useMemo(
    () => flattenSpansToWords(spans, allMarkDefs, mergedStyles),
    [spans, allMarkDefs, mergedStyles]
  );

  // Non-whitespace words only, for selection context (allWords array)
  const plainWords = useMemo(
    () => styledWords.filter(sw => sw.wordIndex != null).map(sw => sw.word),
    [styledWords]
  );

  const validHighlights = useMemo(
    () =>
      highlights.filter(h =>
        highlightRangeMatches(
          plainWords,
          h.start_word_index,
          h.end_word_index,
          h.selected_text
        )
      ),
    [highlights, plainWords]
  );

  useEffect(() => {
    if (
      selection.startWord?.blockKey === blockKey &&
      JSON.stringify(selection.allWords) !== JSON.stringify(plainWords)
    ) {
      selectionCtx.clearSelection();
    }
  }, [
    blockKey,
    plainWords,
    selection.allWords,
    selection.startWord?.blockKey,
    selectionCtx.clearSelection,
  ]);

  const isWordInSelection = useCallback(
    (wordIndex: number | undefined): boolean => {
      if (wordIndex == null) return false;
      if (
        selection.mode !== 'selected' ||
        !selection.startWord ||
        !selection.endWord
      )
        return false;
      if (selection.startWord.blockKey !== blockKey) return false;
      const start = Math.min(
        selection.startWord.wordIndex,
        selection.endWord.wordIndex
      );
      const end = Math.max(
        selection.startWord.wordIndex,
        selection.endWord.wordIndex
      );
      return wordIndex >= start && wordIndex <= end;
    },
    [selection, blockKey]
  );

  const handleLongPress = useCallback(
    (wordIndex: number, word: string, event: any) => {
      const pageX = event?.nativeEvent?.pageX ?? 0;
      const pageY = event?.nativeEvent?.pageY ?? 0;

      const existingHighlight = findHighlightForWord(
        wordIndex,
        validHighlights
      );
      onWordLongPress(
        { blockKey, wordIndex, word, pageX, pageY },
        existingHighlight,
        plainWords
      );
    },
    [blockKey, validHighlights, onWordLongPress, plainWords]
  );

  const handleTap = useCallback(
    (wordIndex: number, word: string, event: any) => {
      if (selection.mode !== 'selected') return;
      if (selection.startWord?.blockKey !== blockKey) return;

      const pageX = event?.nativeEvent?.pageX ?? 0;
      const pageY = event?.nativeEvent?.pageY ?? 0;

      // onWordTap in SelectionContext computes and sets selectedText
      onWordTap({ blockKey, wordIndex, word, pageX, pageY });
    },
    [selection, blockKey, onWordTap]
  );

  return (
    <Text style={style}>
      {styledWords.map((sw, index) => {
        const highlight = findHighlightForWord(sw.wordIndex, validHighlights);
        const isSelected = isWordInSelection(sw.wordIndex);
        const isWhitespace = sw.wordIndex == null;

        // Whitespace between highlighted/selected words inherits the highlight style.
        // Scan outward to find nearest non-whitespace neighbors (handles consecutive whitespace).
        let inHighlightRange = false;
        let inSelectionRange = false;
        if (isWhitespace) {
          let prevWordIndex: number | undefined;
          let nextWordIndex: number | undefined;
          for (let i = index - 1; i >= 0; i--) {
            if (styledWords[i].wordIndex != null) {
              prevWordIndex = styledWords[i].wordIndex;
              break;
            }
          }
          for (let i = index + 1; i < styledWords.length; i++) {
            if (styledWords[i].wordIndex != null) {
              nextWordIndex = styledWords[i].wordIndex;
              break;
            }
          }
          if (prevWordIndex != null && nextWordIndex != null) {
            inHighlightRange =
              findHighlightForWord(prevWordIndex, validHighlights) != null &&
              findHighlightForWord(nextWordIndex, validHighlights) != null;
            inSelectionRange =
              isWordInSelection(prevWordIndex) &&
              isWordInSelection(nextWordIndex);
          }
        }

        const wordStyle = [
          ...sw.styles,
          highlight || inHighlightRange
            ? componentStyles.highlighted
            : undefined,
          isSelected || inSelectionRange
            ? componentStyles.activeSelection
            : undefined,
          sw.linkHref ? componentStyles.link : undefined,
        ].filter(Boolean);

        // Whitespace tokens are not interactive
        if (isWhitespace) {
          return (
            <Text
              key={`${blockKey}-w-${index}`}
              style={wordStyle.length > 0 ? wordStyle : undefined}
            >
              {sw.word}
            </Text>
          );
        }

        return (
          <Text
            key={`${blockKey}-w-${index}`}
            style={wordStyle.length > 0 ? wordStyle : undefined}
            onLongPress={e => handleLongPress(sw.wordIndex!, sw.word, e)}
            onPress={e => {
              if (sw.linkHref && selection.mode !== 'selected') {
                Linking.openURL(sw.linkHref);
              } else {
                handleTap(sw.wordIndex!, sw.word, e);
              }
            }}
            suppressHighlighting
          >
            {sw.word}
          </Text>
        );
      })}
    </Text>
  );
}

const componentStyles = StyleSheet.create({
  highlighted: {
    backgroundColor: Theme.highlightYellow,
    borderRadius: 2,
  },
  activeSelection: {
    backgroundColor: Theme.highlightYellowActive,
    borderRadius: 2,
  },
  link: {
    color: Theme.surfaceBlue,
    textDecorationLine: 'underline',
  },
});
