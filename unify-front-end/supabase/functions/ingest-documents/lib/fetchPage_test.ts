// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/fetchPage_test.ts
//
// The source fetcher's error paths at its public seam (fetchSourcePage), with
// a stubbed fetch and real body streams whose cancellation cleanup stays
// pending or fails. Both are valid stream behaviour. What this proves: an
// abort, a body past the byte limit and an HTTP error each return their own
// error at once, start the body's cancellation, and never surface a cleanup
// failure. It does not prove Deno's network stack.
import {
  assert,
  assertEquals,
  assertInstanceOf,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fetchSourcePage } from './fetchPage.ts';
import { ResourceLimitError } from './limits.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };

/** A response whose body's cancellation cleanup is `pending` or `rejected`. */
function cleanupResponse(
  cleanup: 'pending' | 'rejected',
  body: 'stall' | 'oversize',
  status: number
) {
  let release = () => {};
  const done = new Promise<void>(resolve => (release = resolve));
  let started!: () => void;
  const cancelStarted = new Promise<void>(resolve => (started = resolve));
  let readStarted!: () => void;
  const reading = new Promise<void>(resolve => (readStarted = resolve));
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        readStarted();
        if (body === 'oversize') {
          controller.enqueue(new TextEncoder().encode('1234567890'));
          return;
        }
        return new Promise<void>(() => {}); // never resolves
      },
      cancel() {
        started();
        return cleanup === 'pending'
          ? done
          : Promise.reject(new Error('private-cleanup-detail'));
      },
    },
    { highWaterMark: 0 }
  );
  return { response: new Response(stream, { status }), cancelStarted, reading, release };
}

/** Settles within `ms` of real time, or reports that it did not. */
async function settleWithin<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ settled: boolean; value?: T; error?: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ settled: false }>(resolve => {
    timer = setTimeout(() => resolve({ settled: false }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        value => ({ settled: true, value }),
        error => ({ settled: true, error })
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const NAMES = { abort: 'an abort', size: 'a body past the limit', http: 'an HTTP error' };

for (const cleanup of ['pending', 'rejected'] as const) {
  for (const trigger of ['abort', 'size', 'http'] as const) {
    // Falsifier: the error waits for the body's cancellation cleanup, so a
    // cleanup that never finishes keeps the source read open past its
    // deadline; or a failed cleanup replaces the error or goes unhandled.
    Deno.test(
      `${NAMES[trigger]} returns its error while body cleanup is ${cleanup}`,
      opts,
      async () => {
        const body = cleanupResponse(
          cleanup,
          trigger === 'size' ? 'oversize' : 'stall',
          trigger === 'http' ? 400 : 200
        );
        const real = globalThis.fetch;
        globalThis.fetch = () => Promise.resolve(body.response);
        try {
          const caller = new AbortController();
          const call = fetchSourcePage('https://www.canada.ca/page', {
            signal: caller.signal,
            maxBytes: 5,
          });
          if (trigger !== 'http') await body.reading;
          if (trigger === 'abort') caller.abort();
          await body.cancelStarted;

          const outcome = await settleWithin(call, 500);
          assert(outcome.settled, 'the read waits for cancellation cleanup');
          const error = outcome.error as Error;
          if (trigger === 'abort') {
            assertInstanceOf(error, DOMException);
            assertEquals([error.name, error.message], ['AbortError', 'The fetch was aborted']);
          } else if (trigger === 'size') {
            assertInstanceOf(error, ResourceLimitError);
            assertEquals(error.message, new ResourceLimitError('file size').message);
          } else {
            assertEquals([error.constructor, error.message], [Error, 'HTTP 400: ']);
          }
        } finally {
          globalThis.fetch = real;
          body.release();
        }
      }
    );
  }
}
