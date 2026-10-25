// Fixtures for the Qwen embedding contract. Test support only, not production
// code. Every number here is a literal from the design, not a value the adapter
// computes: the contract is native 4096 coordinates, the first 1536 kept, then
// scaled to length 1.
export const QWEN_MODEL = 'qwen/qwen3-embedding-8b';
export const NATIVE_DIMENSIONS = 4096;
export const STORED_DIMENSIONS = 1536;

/**
 * Three native vectors that need no tooling to check: the first coordinates are
 * a Pythagorean triple, so the length is a whole number (5, 13, 17) and the
 * scaled values are simple fractions. Position `1536 + tag` is also non-zero:
 * only the first 1536 coordinates may count, so the stored vector must have no
 * other non-zero value.
 */
export const WORKED_VECTORS: Array<{ head: number[]; stored: number[] }> = [
  { head: [3, 4, 0], stored: [3 / 5, 4 / 5, 0] },
  { head: [0, 5, 12], stored: [0, 5 / 13, 12 / 13] },
  { head: [8, 0, 15], stored: [8 / 17, 0, 15 / 17] },
];

export function nativeVector(tag = 0): number[] {
  const values = new Array<number>(NATIVE_DIMENSIONS).fill(0);
  WORKED_VECTORS[tag % 3].head.forEach((value, i) => (values[i] = value));
  values[STORED_DIMENSIONS + (tag % 100)] = 7;
  return values;
}

/** The stored vector for the input at `tag`: the worked values, then zeros. */
export function storedVector(tag = 0): number[] {
  const values = new Array<number>(STORED_DIMENSIONS).fill(0);
  WORKED_VECTORS[tag % 3].stored.forEach((value, i) => (values[i] = value));
  return values;
}

export interface FixtureOptions {
  model?: string;
  /** Answer the rows in reverse index order. */
  reverse?: boolean;
  /** Replace the final response body, for malformed provider answers. */
  mutate?: (body: Record<string, unknown>) => unknown;
}

/** An OpenRouter embeddings response for `count` inputs. */
export function embeddingsBody(
  count: number,
  options: FixtureOptions = {}
): Record<string, unknown> {
  const data = Array.from({ length: count }, (_, index) => ({
    object: 'embedding',
    index,
    embedding: nativeVector(index),
  }));
  if (options.reverse) data.reverse();
  return {
    object: 'list',
    model: options.model ?? QWEN_MODEL,
    data,
    usage: { prompt_tokens: 1, total_tokens: 1 },
  };
}

export function embeddingsResponse(
  inputCount: number,
  options: FixtureOptions = {}
): Response {
  const body = embeddingsBody(inputCount, options);
  const final = options.mutate ? options.mutate(body) : body;
  return new Response(
    typeof final === 'string' ? final : JSON.stringify(final),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
