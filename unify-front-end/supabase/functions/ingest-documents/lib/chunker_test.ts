import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chunkText, CHUNK_TARGET_CHARS } from './chunker.ts';

function sentences(totalChars: number): string {
  const sentence =
    'Permanent residents can apply for citizenship after three years. ';
  return sentence
    .repeat(Math.ceil(totalChars / sentence.length))
    .slice(0, totalChars);
}

// Falsifier: a chunker whose tail loop never ends would hang or throw here for
// any input longer than one chunk. Sizes come from real pages (3,320 / 60,461
// characters) plus the exact one-chunk boundary and one character over it.
for (const size of [
  CHUNK_TARGET_CHARS,
  CHUNK_TARGET_CHARS + 1,
  3_320,
  60_461,
]) {
  Deno.test(`chunkText terminates and covers ${size} characters`, () => {
    const text = sentences(size);
    const chunks = chunkText(text);
    if (size <= CHUNK_TARGET_CHARS) {
      assertEquals(chunks, [text]);
      return;
    }
    assert(chunks.length >= 2, 'long text must split');
    // Every chunk stays within the target and the text start/end are covered.
    assert(chunks.every(c => c.length > 0 && c.length <= CHUNK_TARGET_CHARS));
    assert(text.startsWith(chunks[0]));
    assert(text.endsWith(chunks[chunks.length - 1]));
    // Bounded output: overlap is 200 chars, each chunk adds at least 600 new.
    assert(chunks.length <= Math.ceil(size / 400) + 2);
  });
}

// Falsifier: the non-progress guard must turn a stuck loop into an error, not
// an unbounded allocation. A text of 10 million characters would need more
// chunks than the guard allows only if progress stalls; this proves the guard
// is wired by passing a limit of one chunk.
Deno.test(
  'chunkText throws instead of looping when output exceeds its bound',
  () => {
    assertThrows(
      () => chunkText(sentences(5_000), { maxChunks: 1 }),
      Error,
      'chunk'
    );
  }
);
