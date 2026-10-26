import { fetchWithRetry } from '../../_shared/fetchWithRetry.ts';
import { MAX_SOURCE_FILE_BYTES, ResourceLimitError } from './limits.ts';
import type { FetchOptions } from './types.ts';

/**
 * Fetches one official page or data file. The caller's signal stops the
 * request and the body read; the body is read in pieces and refused past
 * `maxBytes` before it is all in memory. A failure carries the status line or
 * a fixed class, never the body.
 */
export async function fetchSourcePage(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const response = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'UnifyBot/1.0 (+https://unifysocial.ca; educational-knowledge-indexer)',
      },
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { timeoutMs: 15000, retries: 2, retryDelayMs: 500 }
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await readWithin(
    response,
    options.signal,
    options.maxBytes ?? MAX_SOURCE_FILE_BYTES
  );
}

async function readWithin(
  response: Response,
  signal: AbortSignal | undefined,
  limit: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('The fetch was aborted', 'AbortError'));
  });
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ResourceLimitError('file size');
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
