/** A stored range is valid only while it still identifies the saved text. */
export function highlightRangeMatches(
  words: readonly string[],
  start: number,
  end: number,
  selectedText: string
): boolean {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= words.length
  )
    return false;
  const normalize = (text: string) =>
    text.normalize('NFC').trim().replace(/\s+/g, ' ');
  return (
    normalize(selectedText).length > 0 &&
    normalize(words.slice(start, end + 1).join(' ')) === normalize(selectedText)
  );
}
