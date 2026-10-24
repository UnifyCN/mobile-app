const CHUNK_TARGET_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const APPROX_CHARS_PER_TOKEN = 4;
export const CHUNK_TARGET_CHARS = CHUNK_TARGET_TOKENS * APPROX_CHARS_PER_TOKEN;
const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;

// Each loop pass moves the window forward by at least 30% of a chunk minus the
// overlap, so a correct run never needs more chunks than this.
const MIN_PROGRESS_CHARS = CHUNK_TARGET_CHARS * 0.3 - CHUNK_OVERLAP_CHARS;

/**
 * Splits text into overlapping chunks of ~CHUNK_TARGET_CHARS characters.
 * Tries to split at paragraph boundaries, falling back to sentence boundaries.
 * Throws if the output grows beyond what a terminating run can produce, so a
 * stalled window fails fast instead of allocating without bound.
 */
export function chunkText(
  text: string,
  options: { maxChunks?: number } = {}
): string[] {
  if (text.length <= CHUNK_TARGET_CHARS) {
    return [text];
  }

  const maxChunks =
    options.maxChunks ?? Math.ceil(text.length / MIN_PROGRESS_CHARS) + 2;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_TARGET_CHARS, text.length);

    // If not at the end, try to find a good split point
    if (end < text.length) {
      // Try paragraph break first
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + CHUNK_TARGET_CHARS * 0.3) {
        end = paragraphBreak;
      } else {
        // Try sentence break
        const sentenceBreak = text.lastIndexOf('. ', end);
        if (sentenceBreak > start + CHUNK_TARGET_CHARS * 0.3) {
          end = sentenceBreak + 1; // Include the period
        }
        // Otherwise just cut at the target length
      }
    }

    chunks.push(text.slice(start, end).trim());
    if (chunks.length > maxChunks) {
      throw new Error(
        `chunkText exceeded ${maxChunks} chunks without finishing`
      );
    }

    // Move start with overlap
    const nextStart = Math.max(0, end - CHUNK_OVERLAP_CHARS);
    start = nextStart <= start ? end : nextStart;
  }

  return chunks.filter(c => c.length > 0);
}
