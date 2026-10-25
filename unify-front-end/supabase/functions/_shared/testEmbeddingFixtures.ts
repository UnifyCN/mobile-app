// Fixtures for the Qwen embedding contract. Test support only, not production
// code. Every number here is a literal from the design, not a value the adapter
// computes: the contract is native 4096 coordinates, the first 1536 kept, then
// scaled to length 1.
export const QWEN_MODEL = 'qwen/qwen3-embedding-8b';
/** The catalogue's Hugging Face id for the same model; the only other accepted answer. */
export const QWEN_HF_MODEL = 'Qwen/Qwen3-Embedding-8B';
export const ACCEPTED_MODELS = [QWEN_MODEL, QWEN_HF_MODEL];
/** Stands in for a credential that a careless diagnostic could echo. */
export const LEAK = 'sk-or-v1-LEAKED-0123456789abcdef';

/**
 * Every answer the model field must not be accepted for, with the closed class
 * the adapter reports for it. A `reject: 'missing'` entry removes the field.
 */
export const REJECTED_IDENTITIES: Array<{
  name: string;
  value: unknown;
  identity: 'missing' | 'null' | 'non_string' | 'unrecognized_string';
}> = [
  { name: 'a missing model', value: undefined, identity: 'missing' },
  { name: 'a null model', value: null, identity: 'null' },
  { name: 'a number', value: 8, identity: 'non_string' },
  { name: 'a boolean', value: true, identity: 'non_string' },
  { name: 'an array', value: [QWEN_MODEL], identity: 'non_string' },
  {
    name: 'an object holding a credential',
    value: { name: QWEN_MODEL, key: LEAK },
    identity: 'non_string',
  },
  {
    name: 'an object with a hostile toString',
    value: { toString: () => LEAK },
    identity: 'non_string',
  },
  {
    name: 'another provider model',
    value: 'openai/text-embedding-3-small',
    identity: 'unrecognized_string',
  },
  {
    name: 'upper case slug',
    value: 'QWEN/QWEN3-EMBEDDING-8B',
    identity: 'unrecognized_string',
  },
  {
    name: 'lower case Hugging Face id',
    value: 'qwen/Qwen3-Embedding-8B',
    identity: 'unrecognized_string',
  },
  {
    name: 'mixed case slug',
    value: 'Qwen/qwen3-embedding-8b',
    identity: 'unrecognized_string',
  },
  {
    name: 'a leading space',
    value: ` ${QWEN_MODEL}`,
    identity: 'unrecognized_string',
  },
  {
    name: 'a trailing space',
    value: `${QWEN_HF_MODEL} `,
    identity: 'unrecognized_string',
  },
  {
    name: 'a trailing newline',
    value: `${QWEN_MODEL}\n`,
    identity: 'unrecognized_string',
  },
  {
    name: 'a suffix',
    value: `${QWEN_MODEL}:free`,
    identity: 'unrecognized_string',
  },
  {
    name: 'a version suffix',
    value: `${QWEN_HF_MODEL}-v2`,
    identity: 'unrecognized_string',
  },
  {
    name: 'a shortened name',
    value: 'qwen/qwen3-embedding',
    identity: 'unrecognized_string',
  },
  {
    name: 'a substring',
    value: 'qwen3-embedding-8b',
    identity: 'unrecognized_string',
  },
  {
    name: 'the 4B model',
    value: 'qwen/qwen3-embedding-4b',
    identity: 'unrecognized_string',
  },
  {
    name: 'a string holding a credential',
    value: `${QWEN_MODEL}?key=${LEAK}`,
    identity: 'unrecognized_string',
  },
  { name: 'an empty string', value: '', identity: 'unrecognized_string' },
];
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
  /** The model field of the answer; `undefined` leaves the field out. */
  model?: unknown;
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
    model: 'model' in options ? options.model : QWEN_MODEL,
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

const SHORT = (n: number) => (body: Record<string, unknown>) => {
  const data = body.data as Array<{ embedding: number[] }>;
  data[0].embedding = data[0].embedding.slice(0, n);
  return body;
};
const zeroPrefix = (body: Record<string, unknown>) => {
  const data = body.data as Array<{ embedding: number[] }>;
  data[0].embedding = new Array(4096).fill(0);
  data[0].embedding[4000] = 5; // non-zero, but past the 1536 that are kept
  return body;
};
/** Provider answers that break the vector contract, whatever model name they carry. */
export const MALFORMED_ANSWERS: Array<
  [string, (b: Record<string, unknown>) => unknown]
> = [
  [
    'a repeated index',
    b => {
      const d = b.data as Array<{ index: number }>;
      d[1].index = d[0].index;
      return b;
    },
  ],
  [
    'an index past the input count',
    b => {
      (b.data as Array<{ index: number }>)[0].index = 99;
      return b;
    },
  ],
  [
    'a negative index',
    b => {
      (b.data as Array<{ index: number }>)[0].index = -1;
      return b;
    },
  ],
  [
    'a fractional index',
    b => {
      (b.data as Array<{ index: number }>)[0].index = 0.5;
      return b;
    },
  ],
  [
    'an index that is a string',
    b => {
      (b.data as Array<{ index: unknown }>)[0].index = '0';
      return b;
    },
  ],
  [
    'a row that is null',
    b => {
      (b.data as unknown[])[0] = null;
      return b;
    },
  ],
  [
    'a norm that overflows',
    b => {
      (b.data as Array<{ embedding: number[] }>)[0].embedding[0] = 1e200;
      return b;
    },
  ],
  [
    'a non-finite value past the kept prefix',
    b => {
      (b.data as Array<{ embedding: unknown[] }>)[0].embedding[4000] = null;
      return b;
    },
  ],
  ['data that is not a list', b => ({ ...b, data: { 0: b.data } })],
  [
    'a missing index',
    b => {
      (b.data as Array<{ index?: number }>)[0].index = undefined;
      return b;
    },
  ],
  [
    'one row too many',
    b => {
      const d = b.data as unknown[];
      d.push({ ...(d[0] as object), index: d.length });
      return b;
    },
  ],
  [
    'one row too few',
    b => {
      (b.data as unknown[]).pop();
      return b;
    },
  ],
  ['1536 values per vector', SHORT(1536)],
  ['4095 values per vector', SHORT(4095)],
  [
    '4097 values per vector',
    b => {
      (b.data as Array<{ embedding: number[] }>)[0].embedding.push(1);
      return b;
    },
  ],
  ['a zero kept prefix', zeroPrefix],
  [
    'a value that is not a number',
    b => {
      (b.data as Array<{ embedding: unknown[] }>)[0].embedding[10] = null;
      return b;
    },
  ],
  [
    'a base64 vector',
    b => {
      (b.data as Array<{ embedding: unknown }>)[0].embedding = 'AAAA';
      return b;
    },
  ],
  ['a body that is not JSON', () => '<html>gateway</html>'],
];
