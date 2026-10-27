// ingest-documents served handler (index.ts): which embedding service a refresh
// calls and what it sends. Runs the real Deno.serve handler with the real
// store over the real migrations in a local Postgres; only the network (the
// page, OpenRouter, and the Supabase HTTP hop, which is emulated) is stubbed.
// A fake provider answer proves the request and the response handling. It does
// not prove that OpenRouter or Qwen answers this way.
//
// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/index_test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureConsole,
  captureServe,
  type FetchCall,
  fetchLog,
  json,
  setRoutes,
  testEnv,
} from '../../_shared/testHarness.ts';
import {
  ACCEPTED_MODELS,
  embeddingsBody,
  embeddingsResponse,
  LEAK,
  MALFORMED_ANSWERS,
  nativeVector,
  QWEN_MODEL,
  REJECTED_IDENTITIES,
  storedVector,
} from '../../_shared/testEmbeddingFixtures.ts';
import { openQwenIngestDb } from '../../../tests/support/ingestDb.ts';
import { type Db, rows } from '../../../tests/support/sharedDb.ts';
import { supabaseHttp } from '../../../tests/support/supabaseHttp.ts';
import { page, prose } from './testSupport.ts';

// supabase-js starts an auth refresh timer when the handler builds its client.
const opts = { sanitizeOps: false, sanitizeResources: false };

const takeHandler = captureServe();
await import('../index.ts');
const handler = takeHandler();

const SERVICE_KEY = 'service-role-key';
interface Fixture {
  db: Db;
  sourceId: number;
  sourceUrl: string;
  /** Requests the store sent to the emulated Supabase API. */
  requests: { table: string; action: string }[];
  embeddingCalls: () => FetchCall[];
}

/** Stub every host the function talks to. `provider` answers OpenRouter. */
async function setup(
  provider: (call: FetchCall) => Response = call =>
    embeddingsResponse((call.body as { input: string[] }).input.length)
): Promise<Fixture> {
  const db = await openQwenIngestDb();
  const [{ id, url }] = await rows<{ id: number; url: string }>(
    db,
    `select id::int as id, url from public.crawl_sources
      where source_kind = 'html' and enabled order by id limit 1`
  );
  const http = supabaseHttp(db);
  testEnv.OPENROUTER_API_KEY = 'openrouter-key';
  testEnv.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  setRoutes(call => {
    if (call.url.host === 'project.supabase.test') {
      return http.fetch(call.url.toString(), {
        method: call.method,
        headers: call.headers,
        body: call.rawBody,
      });
    }
    if (call.url.href === url) {
      return new Response(page(prose(3_000, 'qwen')), { status: 200 });
    }
    if (call.url.href === 'https://openrouter.ai/api/v1/embeddings') {
      return provider(call);
    }
    return undefined;
  });
  return {
    db,
    sourceId: id,
    sourceUrl: url,
    requests: http.requests,
    embeddingCalls: () =>
      fetchLog.filter(c => c.url.pathname.endsWith('/embeddings')),
  };
}

function ingest(sourceId: number, key = SERVICE_KEY): Promise<Response> {
  return Promise.resolve(
    handler(
      new Request(
        'https://project.supabase.test/functions/v1/ingest-documents',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ crawl_source_id: sourceId }),
        }
      )
    )
  );
}

// Falsifier: the old handler sends the request to api.openai.com with its own
// key and model, and fails when only the OpenRouter key exists.
Deno.test(
  'a refresh embeds through OpenRouter with the Qwen model and never calls OpenAI',
  opts,
  async () => {
    const f = await setup();
    try {
      const res = await ingest(f.sourceId);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.results[0].status, 'success');
      const calls = f.embeddingCalls();
      assert(calls.length > 0, 'no embedding request was sent');
      for (const call of calls) {
        assertEquals(call.url.href, 'https://openrouter.ai/api/v1/embeddings');
        assertEquals(
          call.headers.get('authorization'),
          'Bearer openrouter-key'
        );
        const sent = call.body as Record<string, unknown>;
        assertEquals(sent.model, QWEN_MODEL);
        assertEquals(sent.encoding_format, 'float');
        assert(!('dimensions' in sent), 'dimensions must be omitted');
        assert(!('input_type' in sent), 'input_type must be omitted');
        assert((sent.input as string[]).length <= 20);
      }
      assertEquals(
        fetchLog.filter(c => c.url.hostname.endsWith('openai.com')),
        []
      );
    } finally {
      await f.db.close();
    }
  }
);

// Falsifier: an unauthorized caller must reach neither configuration-dependent
// work nor any external service, even when the OpenRouter key is also missing.
Deno.test(
  'an unauthorized call does no work and reads no configuration',
  opts,
  async () => {
    const f = await setup();
    try {
      testEnv.OPENROUTER_API_KEY = undefined;
      for (const key of ['wrong-key', '']) {
        const res = await ingest(f.sourceId, key);
        assertEquals(res.status, 401);
        await res.body?.cancel();
      }
      assertEquals(fetchLog.length, 0);
    } finally {
      testEnv.OPENROUTER_API_KEY = 'openrouter-key';
      await f.db.close();
    }
  }
);

// Falsifier: a missing OpenRouter key must stop the run before any source is
// attempted. If the old OpenAI key check stays, this call is accepted instead.
Deno.test(
  'a missing OpenRouter key fails the run before a source attempt',
  opts,
  async () => {
    const f = await setup();
    try {
      testEnv.OPENROUTER_API_KEY = undefined;
      const res = await ingest(f.sourceId);
      const body = await res.json();

      assertEquals(res.status, 500);
      assertEquals(body.error, 'Missing OPENROUTER_API_KEY');
      assertEquals(
        fetchLog.length,
        0,
        'no page, embedding or database request'
      );
      const [{ last_crawled_at }] = await rows(
        f.db,
        `select last_crawled_at from public.crawl_sources where id = $1`,
        [f.sourceId]
      );
      assertEquals(last_crawled_at, null);
    } finally {
      testEnv.OPENROUTER_API_KEY = 'openrouter-key';
      await f.db.close();
    }
  }
);

// Falsifier: ignoring the response index (or the dimension cut) stores the
// wrong vector against a chunk. Each input has a different worked vector, the
// provider answers in reverse order, and a non-zero value sits past 1535.
for (const model of ACCEPTED_MODELS) {
  Deno.test(
    `rows are matched to inputs by index and stored cut to 1536 at length 1 (answer names ${model})`,
    opts,
    async () => {
      const f = await setup(call =>
        embeddingsResponse((call.body as { input: string[] }).input.length, {
          reverse: true,
          model,
        })
      );
      try {
        const res = await ingest(f.sourceId);
        assertEquals((await res.json()).results[0].status, 'success');

        const stored = await rows<{
          chunk_index: number;
          chunk_text: string;
          embedding: string;
        }>(
          f.db,
          `select chunk_index, chunk_text, embedding::text as embedding
           from public.knowledge_chunks order by chunk_index`
        );
        assert(stored.length >= 2, 'the page must give several chunks');
        const sent = f
          .embeddingCalls()
          .flatMap(c => (c.body as { input: string[] }).input);
        assertEquals(
          stored.map(r => r.chunk_text),
          sent,
          'the stored text is the text that was embedded, in order'
        );
        stored.forEach((row, i) => {
          const vector: number[] = JSON.parse(row.embedding);
          assertEquals(vector.length, 1536);
          const want = storedVector(i % 20);
          for (let d = 0; d < 1536; d++) {
            if (Math.abs(vector[d] - want[d]) > 1e-6) {
              throw new Error(
                `chunk ${i} coordinate ${d}: ${vector[d]} is not ${want[d]}`
              );
            }
          }
        });
        assertEquals(Math.round(storedVector(0)[0] * 10), 6);
        assertEquals(
          await rows(
            f.db,
            `select distinct embedding_model from public.knowledge_chunks`
          ),
          [{ embedding_model: QWEN_MODEL }],
          'the stored label is the canonical model whichever name the answer used'
        );
        assertEquals(
          f
            .embeddingCalls()
            .map(c => (c.body as { model: string }).model)
            .filter(m => m !== QWEN_MODEL),
          [],
          'every request names the canonical model'
        );
      } finally {
        await f.db.close();
      }
    }
  );
}

// Falsifier: a response that breaks the contract must stop before staging, so
// no vector of unknown meaning reaches the tables.
for (const model of ACCEPTED_MODELS) {
  for (const [name, mutate] of MALFORMED_ANSWERS) {
    Deno.test(
      `${name} in the provider answer stops the refresh before staging (answer names ${model})`,
      opts,
      async () => {
        const f = await setup(call =>
          embeddingsResponse((call.body as { input: string[] }).input.length, {
            mutate,
            model,
          })
        );
        try {
          const res = await ingest(f.sourceId);
          const result = (await res.json()).results[0];

          assertEquals(result.status, 'error');
          assert(
            String(result.error).startsWith('Invalid embedding response'),
            String(result.error)
          );
          assertEquals(
            f.requests.filter(
              r =>
                r.table === 'stage_knowledge_chunks' ||
                r.table === 'ingest_generation_stage'
            ),
            []
          );
          assertEquals(
            await rows(f.db, `select 1 from public.knowledge_chunks`),
            []
          );
        } finally {
          await f.db.close();
        }
      }
    );
  }
}

// Falsifier: an adapter that compares a prefix, a lower-cased value or only
// the vector length accepts one of these. None may reach a table, and none of
// the unchecked values may appear in the result, an error or a log line.
for (const rejected of REJECTED_IDENTITIES) {
  Deno.test(
    `${rejected.name} as the answer's model stops the refresh safely`,
    opts,
    async () => {
      const f = await setup(call =>
        embeddingsResponse((call.body as { input: string[] }).input.length, {
          model: rejected.value,
        })
      );
      const logs = captureConsole();
      try {
        const res = await ingest(f.sourceId);
        const text = await res.text();
        const result = JSON.parse(text).results[0];

        assertEquals(result.status, 'error');
        assertEquals(
          result.error,
          'Invalid embedding response: the model identity is not accepted'
        );
        assertEquals(
          f.requests.filter(
            r =>
              r.table === 'stage_knowledge_chunks' ||
              r.table === 'ingest_generation_stage'
          ),
          []
        );
        assertEquals(
          await rows(f.db, `select 1 from public.knowledge_chunks`),
          []
        );
        const everything = [text, ...logs.lines].join('\n');
        assert(!everything.includes(LEAK), 'a credential reached the output');
        if (typeof rejected.value === 'string' && rejected.value !== '') {
          assert(
            !everything.includes(rejected.value),
            'the unchecked model value reached the output'
          );
        }
        const events = logs.lines
          .filter(l => l.startsWith('{"event":"embedding_'))
          .map(l => JSON.parse(l));
        assertEquals(
          events.map(e => [e.event, e.identity]),
          [['embedding_identity', rejected.identity]],
          'one identity class, and no success receipt'
        );
      } finally {
        logs.restore();
        await f.db.close();
      }
    }
  );
}

// Falsifier: a checked receipt must exist only for a complete, valid answer,
// and the identity class must be reported before the vectors are examined.
for (const model of ACCEPTED_MODELS) {
  Deno.test(
    `diagnostics for a valid and an invalid answer naming ${model}`,
    opts,
    async () => {
      const identity = model === QWEN_MODEL ? 'canonical' : 'catalog_hf';
      for (const bad of [false, true]) {
        const f = await setup(call =>
          embeddingsResponse((call.body as { input: string[] }).input.length, {
            model,
            mutate: bad
              ? MALFORMED_ANSWERS.find(
                  ([name]) => name === '1536 values per vector'
                )![1]
              : undefined,
          })
        );
        const logs = captureConsole();
        try {
          const res = await ingest(f.sourceId);
          const result = (await res.json()).results[0];
          const events = logs.lines
            .filter(l => l.startsWith('{"event":"embedding_'))
            .map(l => JSON.parse(l));
          assertEquals(result.status, bad ? 'error' : 'success');
          const identities = events.filter(
            e => e.event === 'embedding_identity'
          );
          const receipts = events.filter(e => e.event === 'embedding_checked');
          assert(identities.length > 0);
          for (const e of identities) assertEquals(e.identity, identity);
          if (bad) {
            assertEquals(receipts, [], 'no receipt for a rejected batch');
            assertEquals(identities.length, 1);
          } else {
            assertEquals(receipts.length, identities.length);
            for (const e of receipts) {
              assertEquals(
                {
                  model: e.model,
                  contract: e.contract,
                  identity: e.identity,
                  native_dimensions: e.native_dimensions,
                  stored_dimensions: e.stored_dimensions,
                },
                {
                  model: QWEN_MODEL,
                  contract: 'qwen3-8b-prefix1536-l2-v1',
                  identity,
                  native_dimensions: 4096,
                  stored_dimensions: 1536,
                }
              );
              assert(e.checked >= 1 && e.checked <= 20);
            }
          }
        } finally {
          logs.restore();
          await f.db.close();
        }
      }
    }
  );
}

// Falsifier: a provider HTTP error must be reported without its body, and must
// not stage anything.
Deno.test(
  'a provider HTTP error stops the refresh without leaking the body',
  opts,
  async () => {
    const f = await setup(
      () => new Response('secret-detail Bearer abc', { status: 401 })
    );
    try {
      const text = await (await ingest(f.sourceId)).text();
      const result = JSON.parse(text).results[0];

      // The job stays open for a later call; nothing was staged.
      assertEquals(result.status, 'pending');
      assertEquals(result.stop_reason, 'provider_error');
      assertEquals(result.error, 'Embedding request failed with HTTP 401');
      assertEquals(result.staged, 0);
      assert(!text.includes('secret-detail'), 'the provider body leaked');
      assertEquals(
        f.requests.filter(
          r =>
            r.table === 'stage_knowledge_chunks' ||
            r.table === 'ingest_generation_stage'
        ),
        []
      );
      assertEquals(
        await rows(f.db, `select 1 from public.knowledge_chunks`),
        []
      );
    } finally {
      await f.db.close();
    }
  }
);
