/**
 * The one embedding contract for documents and queries: Qwen3 Embedding 8B
 * through OpenRouter, kept as the first 1536 of its 4096 native coordinates and
 * scaled to length 1 (Qwen's matryoshka design allows shortening). The same
 * file lives in the mobile-app and the web-app repositories, byte for byte.
 *
 * One model, no fallback, no override. A response that does not match the
 * contract is an error and never reaches a table or a search.
 */
import { fetchWithRetry } from './fetchWithRetry.ts';

export const EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b';
/** Recorded with the stored vectors so a later change of contract is visible. */
export const EMBEDDING_CONTRACT = 'qwen3-8b-prefix1536-l2-v1';
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_NATIVE_DIMENSIONS = 4096;
export const EMBEDDING_MAX_INPUTS = 20;
const ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

export type EmbeddingErrorCategory = 'input' | 'network' | 'http' | 'response';

/** Carries a category and, for a provider answer, the HTTP status, never a body. */
export class EmbeddingError extends Error {
  constructor(
    readonly category: EmbeddingErrorCategory,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export interface EmbeddingRequestOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Embeds 1 to 20 texts. Returns one 1536-coordinate vector of length 1 per
 * text, in input order.
 */
export async function embedTexts(
  texts: string[],
  apiKey: string,
  options: EmbeddingRequestOptions = {}
): Promise<number[][]> {
  if (
    texts.length < 1 ||
    texts.length > EMBEDDING_MAX_INPUTS ||
    texts.some(text => typeof text !== 'string')
  ) {
    throw new EmbeddingError(
      'input',
      `Embed between 1 and ${EMBEDDING_MAX_INPUTS} texts per request`
    );
  }
  let response: Response;
  try {
    response = await fetchWithRetry(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          encoding_format: 'float',
        }),
      },
      {
        timeoutMs: options.timeoutMs ?? 30000,
        retries: options.retries ?? 2,
        retryDelayMs: options.retryDelayMs ?? 500,
      }
    );
  } catch {
    // The thrown value can echo a URL or header, so only the category is kept.
    throw new EmbeddingError('network', 'Embedding request did not complete');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new EmbeddingError(
      'http',
      `Embedding request failed with HTTP ${response.status}`,
      response.status
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw invalid('the body is not JSON');
  }
  return readEmbeddings(body, texts.length);
}

function invalid(reason: string): EmbeddingError {
  return new EmbeddingError(
    'response',
    `Invalid embedding response: ${reason}`
  );
}

function readEmbeddings(body: unknown, count: number): number[][] {
  const record = body as { model?: unknown; data?: unknown } | null;
  if (record === null || typeof record !== 'object') {
    throw invalid('the body is not an object');
  }
  if (record.model !== EMBEDDING_MODEL) {
    throw invalid('the model is not the requested model');
  }
  if (!Array.isArray(record.data) || record.data.length !== count) {
    throw invalid('the result count does not match the input count');
  }
  const ordered = new Array<number[]>(count);
  for (const item of record.data as Array<{
    index?: unknown;
    embedding?: unknown;
  } | null>) {
    const index = item?.index;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= count
    ) {
      throw invalid('an index is missing or out of range');
    }
    if (ordered[index] !== undefined) throw invalid('an index is repeated');
    ordered[index] = shorten(item?.embedding);
  }
  return ordered;
}

/** The first 1536 coordinates, divided by their length. */
function shorten(embedding: unknown): number[] {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_NATIVE_DIMENSIONS
  ) {
    throw invalid(
      `a vector does not have ${EMBEDDING_NATIVE_DIMENSIONS} values`
    );
  }
  let squares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalid('a vector value is not a finite number');
    }
    squares += value * value;
  }
  // Values past 1535 are dropped, but they must still be numbers.
  for (let i = EMBEDDING_DIMENSIONS; i < EMBEDDING_NATIVE_DIMENSIONS; i++) {
    if (typeof embedding[i] !== 'number' || !Number.isFinite(embedding[i])) {
      throw invalid('a vector value is not a finite number');
    }
  }
  const norm = Math.sqrt(squares);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw invalid('a vector has no usable length');
  }
  const result = new Array<number>(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    result[i] = (embedding[i] as number) / norm;
  }
  return result;
}
