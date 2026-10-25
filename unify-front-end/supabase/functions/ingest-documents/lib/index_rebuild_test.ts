// ingest-documents served handler (index.ts), administrative embed_batch: the
// real Deno.serve handler, the real embedding adapter, the real rebuild store
// over the real migrations in a local Postgres. Only the network (OpenRouter
// and the Supabase HTTP hop, which is emulated) is stubbed. A fake provider
// answer proves the response handling and the receipt, not the provider.
//
// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/index_rebuild_test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureConsole,
  captureServe,
  type FetchCall,
  fetchLog,
  setRoutes,
  testEnv,
} from '../../_shared/testHarness.ts';
import {
  ACCEPTED_MODELS,
  embeddingsResponse,
  LEAK,
  MALFORMED_ANSWERS,
  QWEN_MODEL,
  REJECTED_IDENTITIES,
  storedVector,
} from '../../_shared/testEmbeddingFixtures.ts';
import { EmbeddingError, embedTextsChecked } from '../../_shared/embeddings.ts';
import { openIngestDb } from '../../../tests/support/ingestDb.ts';
import { seedStatedCorpus } from '../../../tests/support/embeddingModels.ts';
import { type Db, rows } from '../../../tests/support/sharedDb.ts';
import { supabaseHttp } from '../../../tests/support/supabaseHttp.ts';

// supabase-js starts an auth refresh timer when the handler builds its client.
const opts = { sanitizeOps: false, sanitizeResources: false };

const takeHandler = captureServe();
await import('../index.ts');
const handler = takeHandler();

const SERVICE_KEY = 'service-role-key';
const CONTRACT = 'qwen3-8b-prefix1536-l2-v1';

interface Answer {
  status: number;
  text: string;
  body: Record<string, unknown>;
}

interface Fixture {
  db: Db;
  run: string;
  token: string;
  admin: (operation: string) => Promise<Answer>;
  providerCalls: () => FetchCall[];
  stageCalls: () => FetchCall[];
}

/** The stated corpus, frozen, with a worker that holds the run. */
async function setup(
  provider: (call: FetchCall) => Response
): Promise<Fixture> {
  const db = await openIngestDb();
  await seedStatedCorpus(db);
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
    if (call.url.href === 'https://openrouter.ai/api/v1/embeddings') {
      return provider(call);
    }
    return undefined;
  });
  let run = '';
  let token = '';
  const send = async (body: Record<string, unknown>): Promise<Answer> => {
    const res = await handler(
      new Request(
        'https://project.supabase.test/functions/v1/ingest-documents',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ action: 'embedding_rebuild', ...body }),
        }
      )
    );
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) };
  };
  const begun = await send({ operation: 'begin' });
  assertEquals(begun.status, 200, begun.text);
  run = begun.body.run_id as string;
  const worker = await send({ operation: 'acquire_worker', run_id: run });
  assertEquals(worker.status, 200, worker.text);
  token = worker.body.worker_token as string;
  return {
    db,
    run,
    token,
    admin: operation => send({ operation, run_id: run, worker_token: token }),
    providerCalls: () =>
      fetchLog.filter(c => c.url.pathname.endsWith('/embeddings')),
    stageCalls: () =>
      fetchLog.filter(
        c => c.url.pathname === '/rest/v1/rpc/knowledge_embedding_stage_batch'
      ),
  };
}

const answer =
  (options: Parameters<typeof embeddingsResponse>[1]) => (call: FetchCall) =>
    embeddingsResponse(
      (call.body as { input: string[] }).input.length,
      options
    );

const stagedCount = async (f: Fixture) =>
  (
    await rows<{ n: number }>(
      f.db,
      `select count(*)::int as n from public.knowledge_embedding_rebuild_rows
        where run_id = $1 and qwen_embedding is not null`,
      [f.run]
    )
  )[0].n;

const embeddingEvents = (lines: string[]) =>
  lines
    .filter(l => l.startsWith('{"event":"embedding_'))
    .map(l => JSON.parse(l) as Record<string, unknown>);

// Falsifier: a rebuild that calls the unchecked number[][] path returns no
// receipt; one that builds the receipt from constants instead of the response
// reports the wrong class; one that ignores the response index stages the wrong
// vector against a chunk. The provider answers in reverse order.
for (const model of ACCEPTED_MODELS) {
  const identity = model === QWEN_MODEL ? 'canonical' : 'catalog_hf';
  Deno.test(
    `embed_batch stages the checked vectors and returns a receipt (answer names ${model})`,
    opts,
    async () => {
      const f = await setup(answer({ reverse: true, model }));
      const logs = captureConsole();
      try {
        const res = await f.admin('embed_batch');

        assertEquals(res.status, 200, res.text);
        assertEquals(res.body, {
          sent: 20,
          staged: 20,
          remaining: 331,
          receipt: {
            model: QWEN_MODEL,
            contract: CONTRACT,
            identity,
            checked: 20,
            native_dimensions: 4096,
            stored_dimensions: 1536,
          },
        });

        const [request] = f.providerCalls();
        assertEquals(f.providerCalls().length, 1, 'one provider request');
        const sent = request.body as { model: string; input: string[] };
        assertEquals(sent.model, QWEN_MODEL, 'the request names the router id');
        const frozen = await rows<{ chunk_id: number; text: string }>(
          f.db,
          `select chunk_id::int as chunk_id, original_row->>'chunk_text' as text
             from public.knowledge_embedding_rebuild_rows
            where run_id = $1 order by chunk_id limit 20`,
          [f.run]
        );
        assertEquals(
          sent.input,
          frozen.map(r => r.text)
        );

        const [stage] = f.stageCalls();
        const args = stage.body as Record<string, unknown>;
        assertEquals(
          [args.p_model, args.p_contract],
          [QWEN_MODEL, CONTRACT],
          'the stored label is canonical whichever name the answer used'
        );

        const staged = await rows<{ chunk_id: number; embedding: string }>(
          f.db,
          `select chunk_id::int as chunk_id, qwen_embedding::text as embedding
             from public.knowledge_embedding_rebuild_rows
            where run_id = $1 and qwen_embedding is not null order by chunk_id`,
          [f.run]
        );
        assertEquals(
          staged.map(r => r.chunk_id),
          frozen.map(r => r.chunk_id)
        );
        staged.forEach((row, i) => {
          const vector: number[] = JSON.parse(row.embedding);
          const want = storedVector(i);
          assertEquals(vector.length, 1536);
          for (let d = 0; d < 1536; d++) {
            if (Math.abs(vector[d] - want[d]) > 1e-6) {
              throw new Error(`chunk ${i} coordinate ${d}: ${vector[d]}`);
            }
          }
        });

        // The log line and the response describe the same provider call.
        const events = embeddingEvents(logs.lines);
        assertEquals(
          events.map(e => [e.event, e.identity]),
          [
            ['embedding_identity', identity],
            ['embedding_checked', identity],
          ]
        );
        assertEquals(events[0].call_id, events[1].call_id);
        const { event: _e, call_id: _c, ...logged } = events[1];
        assertEquals(logged, res.body.receipt);
      } finally {
        logs.restore();
        await f.db.close();
      }
    }
  );
}

// Falsifier: a receipt invented for a rejected answer, or an identity class
// dropped from the refusal, would let the operator count a failed batch as a
// checked one. Nothing may be staged.
for (const model of ACCEPTED_MODELS) {
  const identity = model === QWEN_MODEL ? 'canonical' : 'catalog_hf';
  for (const [name, mutate] of MALFORMED_ANSWERS) {
    Deno.test(
      `embed_batch refuses ${name} without a receipt (answer names ${model})`,
      opts,
      async () => {
        const f = await setup(answer({ model, mutate }));
        const logs = captureConsole();
        try {
          const res = await f.admin('embed_batch');

          assertEquals(res.status, 502, res.text);
          assert(
            String(res.body.error).startsWith('Invalid embedding response: '),
            res.text
          );
          assertEquals(res.body.category, 'response');
          // A body that is not JSON has no model field to classify.
          const reported =
            name === 'a body that is not JSON' ? undefined : identity;
          assertEquals(res.body.identity, reported);
          assert(!('receipt' in res.body), 'no receipt for a refused batch');
          assertEquals(f.stageCalls(), [], 'nothing reaches staging');
          assertEquals(await stagedCount(f), 0);
          assertEquals(
            embeddingEvents(logs.lines).filter(
              e => e.event === 'embedding_checked'
            ),
            []
          );
        } finally {
          logs.restore();
          await f.db.close();
        }
      }
    );
  }
}

// Falsifier: an adapter that accepts a near match stages it; a diagnostic that
// copies the unchecked value leaks it (or the credential inside it) into the
// response or the logs.
for (const rejected of REJECTED_IDENTITIES) {
  Deno.test(
    `embed_batch refuses ${rejected.name} as the model and reports only its class`,
    opts,
    async () => {
      const f = await setup(answer({ model: rejected.value }));
      const logs = captureConsole();
      try {
        const res = await f.admin('embed_batch');

        assertEquals(res.status, 502, res.text);
        assertEquals(res.body, {
          error:
            'Invalid embedding response: the model identity is not accepted',
          category: 'response',
          identity: rejected.identity,
        });
        assertEquals(f.stageCalls(), []);
        assertEquals(await stagedCount(f), 0);
        const everything = [res.text, ...logs.lines].join('\n');
        assert(!everything.includes(LEAK), 'a credential reached the output');
        assert(
          !everything.includes('openrouter-key'),
          'the provider key reached the output'
        );
        if (typeof rejected.value === 'string' && rejected.value !== '') {
          assert(
            !everything.includes(rejected.value),
            'the unchecked model value reached the output'
          );
        }
        assertEquals(
          embeddingEvents(logs.lines).map(e => [e.event, e.identity]),
          [['embedding_identity', rejected.identity]]
        );
      } finally {
        logs.restore();
        await f.db.close();
      }
    }
  );
}

// Falsifier: a provider HTTP error must keep its status and drop its body,
// and has no identity class because no answer was read.
Deno.test(
  'embed_batch reports a provider HTTP error by status only',
  opts,
  async () => {
    const f = await setup(
      () => new Response(`denied ${LEAK}`, { status: 401 })
    );
    try {
      const res = await f.admin('embed_batch');

      assertEquals(res.status, 502);
      assertEquals(res.body, {
        error: 'Embedding request failed with HTTP 401',
        category: 'http',
        http_status: 401,
      });
      assert(!res.text.includes(LEAK));
      assertEquals(await stagedCount(f), 0);
    } finally {
      await f.db.close();
    }
  }
);

// Falsifier: the completion call makes no provider request, so it must not
// carry a receipt that could be counted as a checked batch.
Deno.test(
  'an empty embed_batch makes no request and has no receipt',
  opts,
  async () => {
    const f = await setup(answer({}));
    try {
      await f.db.query(
        `update public.knowledge_embedding_rebuild_rows
            set qwen_embedding = $2::vector, staged_at = now()
          where run_id = $1`,
        [f.run, JSON.stringify(storedVector(0))]
      );
      const res = await f.admin('embed_batch');

      assertEquals(res.status, 200, res.text);
      assertEquals(res.body, { sent: 0, staged: 0, remaining: 0 });
      assertEquals(f.providerCalls(), []);
    } finally {
      await f.db.close();
    }
  }
);

// Falsifier: a receipt or identity class kept in module state (the last call
// wins) gives an overlapping call the other call's class. The slow calls name
// the router id, the fast ones the catalogue id, and one fast call is refused.
Deno.test(
  'overlapping embedding calls keep their own identity and receipt',
  opts,
  async () => {
    setRoutes(async call => {
      const [text] = (call.body as { input: string[] }).input;
      const slow = text.startsWith('slow');
      if (slow) await new Promise(resolve => setTimeout(resolve, 40));
      return embeddingsResponse(1, {
        model:
          text === 'fast refused'
            ? 'qwen/other'
            : slow
              ? QWEN_MODEL
              : 'Qwen/Qwen3-Embedding-8B',
      });
    });
    const texts = [
      'slow 0',
      'fast 0',
      'slow 1',
      'fast refused',
      'fast 1',
      'slow 2',
    ];
    const logs = captureConsole();
    let settled: PromiseSettledResult<
      Awaited<ReturnType<typeof embedTextsChecked>>
    >[];
    try {
      settled = await Promise.allSettled(
        texts.map(text => embedTextsChecked([text], 'openrouter-key'))
      );
    } finally {
      logs.restore();
    }
    settled.forEach((result, i) => {
      const text = texts[i];
      if (text === 'fast refused') {
        assertEquals(result.status, 'rejected');
        const error = (result as PromiseRejectedResult).reason;
        assert(error instanceof EmbeddingError);
        assertEquals(error.identity, 'unrecognized_string');
        return;
      }
      assertEquals(result.status, 'fulfilled', text);
      const { receipt } = (
        result as PromiseFulfilledResult<
          Awaited<ReturnType<typeof embedTextsChecked>>
        >
      ).value;
      assertEquals(
        receipt.identity,
        text.startsWith('slow') ? 'canonical' : 'catalog_hf',
        text
      );
      assertEquals(receipt.checked, 1);
    });

    // Every call has its own id, and its two lines agree on the class.
    const byCall = new Map<unknown, Record<string, unknown>[]>();
    for (const e of embeddingEvents(logs.lines)) {
      byCall.set(e.call_id, [...(byCall.get(e.call_id) ?? []), e]);
    }
    assertEquals(byCall.size, texts.length);
    const shapes = [...byCall.values()].map(events =>
      events.map(e => `${e.event}:${e.identity}`).join(' ')
    );
    assertEquals(shapes.sort(), [
      'embedding_identity:canonical embedding_checked:canonical',
      'embedding_identity:canonical embedding_checked:canonical',
      'embedding_identity:canonical embedding_checked:canonical',
      'embedding_identity:catalog_hf embedding_checked:catalog_hf',
      'embedding_identity:catalog_hf embedding_checked:catalog_hf',
      'embedding_identity:unrecognized_string',
    ]);
  }
);
