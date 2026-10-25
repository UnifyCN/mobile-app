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
  captureServe,
  type FetchCall,
  fetchLog,
  json,
  setRoutes,
  testEnv,
} from '../../_shared/testHarness.ts';
import {
  embeddingsBody,
  embeddingsResponse,
  nativeVector,
  QWEN_MODEL,
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
Deno.test(
  'rows are matched to inputs by index and stored cut to 1536 at length 1',
  opts,
  async () => {
    const f = await setup(call =>
      embeddingsResponse((call.body as { input: string[] }).input.length, {
        reverse: true,
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
    } finally {
      await f.db.close();
    }
  }
);

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
const BAD_ANSWERS: Array<[string, (b: Record<string, unknown>) => unknown]> = [
  ['another model', b => ({ ...b, model: 'openai/text-embedding-3-small' })],
  ['a missing model', b => ({ ...b, model: undefined })],
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

// Falsifier: a response that breaks the contract must stop before staging, so
// no vector of unknown meaning reaches the tables.
for (const [name, mutate] of BAD_ANSWERS) {
  Deno.test(
    `${name} in the provider answer stops the refresh before staging`,
    opts,
    async () => {
      const f = await setup(call =>
        embeddingsResponse((call.body as { input: string[] }).input.length, {
          mutate,
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
          f.requests.filter(r => r.table === 'stage_knowledge_chunks'),
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
      const result = (await (await ingest(f.sourceId)).json()).results[0];

      assertEquals(result.status, 'error');
      assertEquals(result.error, 'Embedding request failed with HTTP 401');
      assertEquals(
        f.requests.filter(r => r.table === 'stage_knowledge_chunks'),
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
