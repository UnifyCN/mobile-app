// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/embedding_adapter_transport_test.ts
//
// The shared embedding adapter's optional transport bounds, at its public
// seam (embedTextsChecked) with a stubbed fetch and real body streams. What
// this proves: a caller signal reaches the request and still stops a body that
// stalls after the headers, a body larger than the caller's limit is refused
// while it is read, and a call without the new options behaves as before. It
// does not prove OpenRouter's answers or Deno's network stack.
import {
  assert,
  assertEquals,
  assertInstanceOf,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EmbeddingError,
  embedTextsChecked,
} from '../functions/_shared/embeddings.ts';
import {
  embeddingsBody,
  storedVector,
} from '../functions/_shared/testEmbeddingFixtures.ts';

const opts = { sanitizeOps: false, sanitizeResources: false };

interface Sent {
  signal: AbortSignal | null;
}

/** Replaces fetch for one test. `answer` builds each response. */
async function withFetch(
  answer: (sent: Sent) => Response,
  run: (sent: Sent[]) => Promise<void>
): Promise<void> {
  const real = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    const call = { signal: init?.signal ?? null };
    sent.push(call);
    return Promise.resolve(answer(call));
  };
  try {
    await run(sent);
  } finally {
    globalThis.fetch = real;
  }
}

/**
 * A 200 answer whose body sends `first` and then waits forever. `cancelled`
 * resolves when the reader cancels the stream.
 */
function stalledBody(first: string) {
  let cancelled!: () => void;
  const wasCancelled = new Promise<void>(resolve => (cancelled = resolve));
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (pulls === 1) {
        controller.enqueue(new TextEncoder().encode(first));
        return;
      }
      return new Promise<void>(() => {}); // never resolves
    },
    cancel() {
      cancelled();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    wasCancelled,
  };
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

// Falsifier: the adapter clears its only timer at the headers and ignores a
// caller signal, so a body that stalls after the headers keeps the call open
// after the caller has given up, and the request's signal never aborts.
Deno.test(
  'a caller signal stops a body that stalls after the headers',
  opts,
  async () => {
    const body = stalledBody('{"object":"list","data":[');
    await withFetch(
      () => body.response,
      async sent => {
        const caller = new AbortController();
        const call = embedTextsChecked(['one'], 'key', {
          signal: caller.signal,
          retries: 0,
          timeoutMs: 30000,
        });
        // Let the headers arrive and the first body bytes be read.
        await new Promise(resolve => setTimeout(resolve, 20));
        caller.abort();

        const outcome = await settleWithin(call, 500);
        assert(outcome.settled, 'the call is still pending after the abort');
        assertInstanceOf(outcome.error, EmbeddingError);
        assertEquals((outcome.error as EmbeddingError).category, 'network');
        assertEquals(
          (outcome.error as EmbeddingError).message,
          'Embedding request did not complete'
        );
        assertEquals(sent.length, 1, 'exactly one request');
        assert(sent[0].signal?.aborted, 'the request signal did not abort');
        const cancelled = await settleWithin(body.wasCancelled, 500);
        assert(cancelled.settled, 'the stalled body stream was not cancelled');
      }
    );
  }
);

/** A 200 answer that sends `text` in `chunk`-byte pieces and counts what was pulled. */
function chunkedBody(text: string, chunk: number) {
  const bytes = new TextEncoder().encode(text);
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= bytes.length) {
        controller.close();
        return;
      }
      const piece = bytes.slice(state.pulled, state.pulled + chunk);
      state.pulled += piece.byteLength;
      controller.enqueue(piece);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    state,
  };
}

// Falsifier: the adapter buffers and parses the whole answer whatever its
// size, so an oversized answer is fully read (or even accepted) and the
// identity line is written before any size check.
Deno.test(
  'an answer larger than the byte limit is refused while it is read',
  opts,
  async () => {
    const text = JSON.stringify(embeddingsBody(1));
    const limit = 2048;
    assert(text.length > limit * 3, 'the fixture must exceed the limit');
    const body = chunkedBody(text, 512);
    const lines: string[] = [];
    const info = console.info;
    console.info = (line: string) => lines.push(line);
    try {
      await withFetch(
        () => body.response,
        async () => {
          const error = await embedTextsChecked(['one'], 'key', {
            maxResponseBytes: limit,
            retries: 0,
          }).then(
            () => null,
            e => e
          );
          assertInstanceOf(error, EmbeddingError);
          assertEquals(error.category, 'response');
          assertEquals(
            error.message,
            'Invalid embedding response: the body is too large'
          );
          // One piece crosses the limit and the stream queues one more.
          assert(
            body.state.pulled <= limit + 2 * 512,
            `read ${body.state.pulled} bytes past a ${limit}-byte limit`
          );
          assert(body.state.pulled < text.length, 'the whole body was read');
          assert(body.state.cancelled, 'the oversized body was not cancelled');
          assertEquals(lines, [], 'nothing was parsed or reported');
        }
      );
    } finally {
      console.info = info;
    }
  }
);

// Falsifier: an off-by-one limit refuses an answer of exactly the limit.
Deno.test('an answer of exactly the byte limit is accepted', opts, async () => {
  const text = JSON.stringify(embeddingsBody(1));
  const body = chunkedBody(text, 999);
  const info = console.info;
  console.info = () => {};
  try {
    await withFetch(
      () => body.response,
      async () => {
        const encoded = new TextEncoder().encode(text).byteLength;
        const result = await embedTextsChecked(['one'], 'key', {
          maxResponseBytes: encoded,
          retries: 0,
        });
        assertEquals(result.vectors, [storedVector(0)]);
        assertEquals(result.receipt.checked, 1);
      }
    );
  } finally {
    console.info = info;
  }
});

// Guard (passes before and after this change). Falsifier: the transport
// change alters other callers' defaults, so a call with no options stops
// retrying a 503, or a `retries: 0` caller still sends a second request.
Deno.test(
  'default retries are unchanged and retries 0 sends exactly once',
  opts,
  async () => {
    const info = console.info;
    console.info = () => {};
    try {
      let answers = [503, 503, 200];
      await withFetch(
        () => {
          const status = answers.shift()!;
          return status === 200
            ? new Response(JSON.stringify(embeddingsBody(1)), { status })
            : new Response('busy', { status });
        },
        async sent => {
          const result = await embedTextsChecked(['one'], 'key');
          assertEquals(result.receipt.checked, 1);
          assertEquals(sent.length, 3, 'two default retries');
          assertEquals(sent[0].signal?.aborted, false);
        }
      );
      answers = [503, 200];
      await withFetch(
        () => {
          const status = answers.shift()!;
          return status === 200
            ? new Response(JSON.stringify(embeddingsBody(1)), { status })
            : new Response('busy', { status });
        },
        async sent => {
          const caller = new AbortController();
          const error = await embedTextsChecked(['one'], 'key', {
            retries: 0,
            signal: caller.signal,
          }).then(
            () => null,
            e => e
          );
          assertInstanceOf(error, EmbeddingError);
          assertEquals(error.category, 'http');
          assertEquals(error.status, 503);
          assertEquals(sent.length, 1, 'no retry');
        }
      );
    } finally {
      console.info = info;
    }
  }
);

/**
 * A body whose cancellation cleanup never finishes on its own (`pending`) or
 * fails (`rejected`). Both are valid stream behaviour. `release` ends a
 * pending cleanup so the test leaves nothing behind.
 */
function cleanupBody(
  cleanup: 'pending' | 'rejected',
  body: 'stall' | 'oversize',
  status = 200
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
          controller.enqueue(new Uint8Array(10));
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

const ABORTED = ['network', 'Embedding request did not complete'];
const TOO_LARGE = ['response', 'Invalid embedding response: the body is too large'];

for (const cleanup of ['pending', 'rejected'] as const) {
  for (const trigger of ['abort', 'oversize'] as const) {
    // Falsifier: the required error waits for the stream's cancellation
    // cleanup, so a cleanup that never finishes keeps the call open; or a
    // failed cleanup replaces the error or goes unhandled.
    Deno.test(
      `${trigger} returns its fixed error while cancellation cleanup is ${cleanup}`,
      opts,
      async () => {
        const body = cleanupBody(cleanup, trigger === 'abort' ? 'stall' : 'oversize');
        try {
          await withFetch(
            () => body.response,
            async () => {
              const caller = new AbortController();
              const call = embedTextsChecked(['one'], 'key', {
                signal: caller.signal,
                maxResponseBytes: 5,
                retries: 0,
              });
              await body.reading;
              if (trigger === 'abort') caller.abort();
              await body.cancelStarted;

              const outcome = await settleWithin(call, 500);
              assert(outcome.settled, 'the call waits for cancellation cleanup');
              assertInstanceOf(outcome.error, EmbeddingError);
              const error = outcome.error as EmbeddingError;
              assertEquals(
                [error.category, error.message],
                trigger === 'abort' ? ABORTED : TOO_LARGE
              );
            }
          );
        } finally {
          body.release();
        }
      }
    );
  }

  // Falsifier: an HTTP error waits for its body's cancellation cleanup, or a
  // failed cleanup is thrown instead of the HTTP error. The call uses the
  // caller defaults: a 400 is not retried.
  Deno.test(
    `an HTTP error returns its fixed error while body cleanup is ${cleanup}`,
    opts,
    async () => {
      const body = cleanupBody(cleanup, 'stall', 400);
      try {
        await withFetch(
          () => body.response,
          async sent => {
            const outcome = await settleWithin(embedTextsChecked(['one'], 'key'), 500);
            assert(outcome.settled, 'the call waits for cancellation cleanup');
            assertInstanceOf(outcome.error, EmbeddingError);
            const error = outcome.error as EmbeddingError;
            assertEquals(
              [error.category, error.message, error.status],
              ['http', 'Embedding request failed with HTTP 400', 400]
            );
            assertEquals(sent.length, 1);
            const started = await settleWithin(body.cancelStarted, 500);
            assert(started.settled, 'the error body was not cancelled');
          }
        );
      } finally {
        body.release();
      }
    }
  );
}
