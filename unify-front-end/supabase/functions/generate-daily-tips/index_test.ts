// generate-daily-tips served handler: how the topic query is embedded and which
// knowledge-base search follows. Runs the real Deno.serve handler; only the
// network (OpenRouter and the Supabase HTTP API) is stubbed. A fake provider
// answer proves the request and the response handling, not the provider.
//
// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/generate-daily-tips/index_test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureConsole,
  captureServe,
  fetchLog,
  json,
  setRoutes,
  testEnv,
  type FetchCall,
} from '../_shared/testHarness.ts';
import {
  ACCEPTED_MODELS,
  embeddingsResponse,
  LEAK,
  MALFORMED_ANSWERS,
  QWEN_MODEL,
  REJECTED_IDENTITIES,
  storedVector,
} from '../_shared/testEmbeddingFixtures.ts';

// supabase-js starts an auth refresh timer when the handler builds its client.
const opts = { sanitizeOps: false, sanitizeResources: false };

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

const TIP = JSON.stringify({
  category: 'documents',
  title: 'Keep copies',
  description: 'Scan your papers',
  tip_text: 'Scan your documents and store them safely.',
});

function setup(provider?: (call: FetchCall) => Response) {
  testEnv.OPENROUTER_API_KEY = 'openrouter-key';
  testEnv.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  setRoutes(call => {
    if (call.url.href === 'https://openrouter.ai/api/v1/embeddings') {
      return (
        provider?.(call) ??
        embeddingsResponse((call.body as { input: string[] }).input.length)
      );
    }
    if (call.url.href.endsWith('/chat/completions')) {
      return json({
        choices: [{ message: { content: TIP }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'test/model',
        provider: 'Test',
      });
    }
    if (call.url.pathname === '/rest/v1/rpc/match_chunks') return json([]);
    if (call.url.pathname === '/rest/v1/daily_tips') {
      return new Response(null, { status: 201 });
    }
    return undefined;
  });
}

function run(): Promise<Response> {
  return Promise.resolve(
    handler(
      new Request(
        'https://project.supabase.test/functions/v1/generate-daily-tips',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer service-role-key' },
        }
      )
    )
  );
}

const embeddingCalls = () =>
  fetchLog.filter(c => c.url.pathname.endsWith('/embeddings'));
const searchCalls = () =>
  fetchLog.filter(c => c.url.pathname === '/rest/v1/rpc/match_chunks');

// Falsifier: the old handler needs OPENAI_API_KEY, calls api.openai.com, and
// searches with the three legacy arguments (no model identity).
Deno.test(
  'the topic query is embedded through OpenRouter and searched under the Qwen model',
  opts,
  async () => {
    setup();
    const res = await run();
    const summary = await res.json();

    assertEquals(res.status, 200);
    assertEquals(summary.total, 20);
    assertEquals(summary.failed, 0);
    assertEquals(embeddingCalls().length, 20, 'one embedding per cohort');
    for (const call of embeddingCalls()) {
      const sent = call.body as Record<string, unknown>;
      assertEquals(call.headers.get('authorization'), 'Bearer openrouter-key');
      assertEquals(sent.model, QWEN_MODEL);
      assertEquals((sent.input as string[]).length, 1);
      assert(
        (sent.input as string[])[0].startsWith('practical tips for '),
        'the topic query text is unchanged'
      );
    }
    assertEquals(
      fetchLog.filter(c => c.url.hostname.endsWith('openai.com')),
      []
    );
    assertEquals(searchCalls().length, 20);
    for (const call of searchCalls()) {
      const args = call.body as Record<string, unknown>;
      assertEquals(args.query_embedding_model, QWEN_MODEL);
      assertEquals(args.match_count, 5, 'tips keep their own count');
      assertEquals(args.match_threshold, 0.3);
      assertEquals(args.filter_province, null);
      const vector = args.query_embedding as number[];
      assertEquals(vector.length, 1536);
      assertEquals(vector.slice(0, 3), storedVector(0).slice(0, 3));
    }
  }
);

// Falsifier: a failed embedding must not become a vector search with an empty
// or stale vector. The tip is still written, without knowledge-base context.
Deno.test(
  'a failed embedding skips the vector search and still writes the tip',
  opts,
  async () => {
    setup(() => new Response('denied', { status: 401 }));
    const res = await run();
    const summary = await res.json();

    assertEquals(res.status, 200);
    assertEquals(summary.success, 20);
    assertEquals(searchCalls(), []);
    const writes = fetchLog.filter(
      c => c.url.pathname === '/rest/v1/daily_tips'
    );
    assertEquals(writes.length, 20, 'one upsert per cohort');
  }
);

const embeddingEvents = (lines: string[]) =>
  lines
    .filter(l => l.startsWith('{"event":"embedding_'))
    .map(l => JSON.parse(l) as Record<string, unknown>);

const tipWrites = () =>
  fetchLog.filter(c => c.url.pathname === '/rest/v1/daily_tips');

// Falsifier: an adapter that only accepts the router id fails the catalogue
// name; one that labels the search with the answer's name sends a model no
// stored row has. Both names must give the same vector and the canonical label.
for (const model of ACCEPTED_MODELS) {
  const identity = model === QWEN_MODEL ? 'canonical' : 'catalog_hf';
  Deno.test(
    `an answer naming ${model} is searched under the canonical model`,
    opts,
    async () => {
      setup(call =>
        embeddingsResponse((call.body as { input: string[] }).input.length, {
          model,
          reverse: true,
        })
      );
      const logs = captureConsole();
      try {
        const res = await run();
        const summary = await res.json();

        assertEquals(res.status, 200);
        assertEquals([summary.total, summary.failed], [20, 0]);
        assertEquals(
          embeddingCalls().map(c => (c.body as { model: string }).model),
          new Array(20).fill(QWEN_MODEL),
          'every request names the router id'
        );
        assertEquals(searchCalls().length, 20);
        for (const call of searchCalls()) {
          const args = call.body as Record<string, unknown>;
          assertEquals(args.query_embedding_model, QWEN_MODEL);
          assertEquals(args.match_count, 5);
          assertEquals(args.match_threshold, 0.3);
          assertEquals(args.filter_province, null);
          const vector = args.query_embedding as number[];
          const want = storedVector(0);
          assertEquals(vector.length, 1536);
          for (let d = 0; d < 1536; d++) {
            assert(Math.abs(vector[d] - want[d]) < 1e-9, `coordinate ${d}`);
          }
        }
        const events = embeddingEvents(logs.lines);
        assertEquals(
          events.filter(e => e.event === 'embedding_checked').length,
          20
        );
        for (const e of events) assertEquals(e.identity, identity);
      } finally {
        logs.restore();
      }
    }
  );
}

// Falsifier: a broken answer that still reaches match_chunks searches with a
// vector of unknown meaning. The tip is written without context instead.
// (One input per call, so the cases that need a second row do not apply.)
const SINGLE_ROW_ANSWERS = MALFORMED_ANSWERS.filter(
  ([name]) => name !== 'a repeated index'
);
for (const model of ACCEPTED_MODELS) {
  for (const [name, mutate] of SINGLE_ROW_ANSWERS) {
    Deno.test(
      `${name} (answer names ${model}) skips the search and still writes the tip`,
      opts,
      async () => {
        setup(call =>
          embeddingsResponse((call.body as { input: string[] }).input.length, {
            model,
            mutate,
          })
        );
        const logs = captureConsole();
        try {
          const res = await run();
          const summary = await res.json();

          assertEquals(res.status, 200);
          assertEquals(summary.success, 20);
          assertEquals(searchCalls(), [], 'no search after a refused answer');
          assertEquals(tipWrites().length, 20);
          assertEquals(
            embeddingEvents(logs.lines).filter(
              e => e.event === 'embedding_checked'
            ),
            [],
            'no receipt for a refused answer'
          );
        } finally {
          logs.restore();
        }
      }
    );
  }
}

// Falsifier: a near match accepted, or an unchecked value copied into the
// failure log, the summary or a tip.
for (const rejected of REJECTED_IDENTITIES) {
  Deno.test(
    `${rejected.name} as the model skips the search and is never logged`,
    opts,
    async () => {
      setup(call =>
        embeddingsResponse((call.body as { input: string[] }).input.length, {
          model: rejected.value,
        })
      );
      const logs = captureConsole();
      try {
        const res = await run();
        const text = await res.text();

        assertEquals(res.status, 200);
        assertEquals(JSON.parse(text).success, 20);
        assertEquals(searchCalls(), []);
        const written = tipWrites().map(c => c.rawBody ?? '');
        const everything = [text, ...logs.lines, ...written].join('\n');
        assert(!everything.includes(LEAK), 'a credential reached the output');
        if (typeof rejected.value === 'string' && rejected.value !== '') {
          assert(
            !everything.includes(rejected.value),
            'the unchecked model value reached the output'
          );
        }
        assert(
          logs.lines.some(l =>
            l.includes(
              'Invalid embedding response: the model identity is not accepted'
            )
          ),
          'the refusal is logged with its fixed reason'
        );
        const events = embeddingEvents(logs.lines);
        assertEquals(events.length, 20, 'one identity line per cohort');
        for (const e of events) {
          assertEquals(
            [e.event, e.identity],
            ['embedding_identity', rejected.identity]
          );
        }
      } finally {
        logs.restore();
      }
    }
  );
}
