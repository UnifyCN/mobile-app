// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// The administrative rebuild interface of ingest-documents, driven through the
// public handler (handleIngestRequest), the real store (createRebuildStore),
// the real supabase-js client over an emulated HTTP hop and the real migration
// SQL in a local Postgres. The embedding service is a stub that answers from
// the text it is given. These tests prove the call sequence, the bounds, the
// fencing and the preserved data; they do not prove the real provider's answer
// or concurrent transactions on a real PostgreSQL server.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import {
  createRebuildStore,
  createStore,
} from '../functions/ingest-documents/lib/supabaseStore.ts';
import { openIngestDb } from './support/ingestDb.ts';
import {
  LEGACY,
  QWEN,
  qwenVector,
  seedStatedCorpus,
  withReceipt,
} from './support/embeddingModels.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const KEY = 'test-service-role-key';

/** A vector that depends on the text, so a mix-up of rows would show. */
const vectorFor = (text: string) =>
  JSON.parse(qwenVector(0.1 + (text.length % 8) / 10));

interface Harness {
  db: Db;
  /** Every embedding call: the texts it carried. */
  calls: string[][];
  admin: (
    operation: string,
    body?: Record<string, unknown>
  ) => Promise<{ status: number; body: Record<string, any> }>;
  failNext: { error?: Error; short?: boolean };
}

async function harness(): Promise<Harness> {
  const db = await openIngestDb();
  const client = supabaseHttp(db).client;
  const calls: string[][] = [];
  const failNext: Harness['failNext'] = {};
  const embed = async (texts: string[]) => {
    calls.push(texts);
    if (failNext.error) throw failNext.error;
    const vectors = texts.map(vectorFor);
    return failNext.short ? vectors.slice(1) : vectors;
  };
  const deps = {
    store: createStore(client),
    rebuild: createRebuildStore(client),
    now: () => new Date('2026-10-25T00:00:00Z'),
    fetchPage: () =>
      Promise.reject(new Error('the rebuild never fetches a page')),
    embed,
    embedChecked: withReceipt(embed),
    serviceRoleKey: KEY,
  };
  const admin: Harness['admin'] = async (operation, body = {}) => {
    const res = await handleIngestRequest(
      new Request('https://example.test/ingest-documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          action: 'embedding_rebuild',
          operation,
          ...body,
        }),
      }),
      deps
    );
    return { status: res.status, body: await res.json() };
  };
  return { db, calls, admin, failNext };
}

/** Runs embed_batch until nothing is left; fails fast on any refusal. */
async function drainAll(h: Harness, run: string, token: string) {
  for (let i = 0; i < 25; i++) {
    const r = await h.admin('embed_batch', {
      run_id: run,
      worker_token: token,
    });
    assertEquals(r.status, 200, JSON.stringify(r.body));
    if (r.body.sent === 0) return;
  }
  throw new Error('the rebuild did not finish within 25 batches');
}

const preserved = (db: Db) =>
  rows(
    db,
    `select kc.id, kc.document_id, kc.chunk_index, kc.chunk_text, kc.metadata, kc.created_at, kc.updated_at,
            kd.title, kd.source_url, kd.content_hash, kd.metadata as document_metadata, kd.updated_at as document_updated
       from public.knowledge_chunks kc join public.knowledge_documents kd on kd.id = kc.document_id
      order by kc.id`
  );
const vectorsOf = (db: Db) =>
  rows(
    db,
    `select id, md5(embedding::text) as vector, embedding_model from public.knowledge_chunks order by id`
  );

// Falsifier: a runner that selects only crawl sources, sends more than 20
// texts, lets an old worker continue, changes live rows before the cutover, or
// drops any preserved field fails here.
Deno.test(
  'the whole 351-chunk corpus is rebuilt in bounded batches, stopped, resumed and cut over',
  async () => {
    const h = await harness();
    try {
      await seedStatedCorpus(h.db);
      const before = await preserved(h.db);
      const legacyVectors = await vectorsOf(h.db);
      assertEquals(before.length, 351);

      const begun = await h.admin('begin');
      assertEquals(begun.status, 200);
      assertEquals(
        [
          begun.body.chunks,
          begun.body.documents,
          begun.body.source_linked_chunks,
          begun.body.other_chunks,
        ],
        [351, 33, 13, 338]
      );
      const run = begun.body.run_id as string;

      const first = await h.admin('acquire_worker', { run_id: run });
      assertEquals(first.status, 200);
      const oldToken = first.body.worker_token as string;
      assertEquals(
        (await h.admin('acquire_worker', { run_id: run })).status,
        409
      );

      // Stop after two batches.
      for (let i = 0; i < 2; i++) {
        const r = await h.admin('embed_batch', {
          run_id: run,
          worker_token: oldToken,
        });
        assertEquals([r.status, r.body.sent, r.body.staged], [200, 20, 20]);
      }
      assertEquals(
        h.calls.map(c => c.length),
        [20, 20]
      );
      // Nothing live changed before the cutover.
      assertEquals(await vectorsOf(h.db), legacyVectors);
      assertEquals(
        (await h.admin('activate', { run_id: run, worker_token: oldToken }))
          .status,
        409
      );

      // The old worker stops renewing; a new worker resumes only what is missing.
      await h.db.exec(
        `update public.knowledge_embedding_cutover set worker_expires_at = now() - interval '1 second'`
      );
      const second = await h.admin('acquire_worker', { run_id: run });
      const token = second.body.worker_token as string;
      const callsBefore = h.calls.length;
      const stale = await h.admin('embed_batch', {
        run_id: run,
        worker_token: oldToken,
      });
      assertEquals(stale.status, 409);
      assertEquals(
        h.calls.length,
        callsBefore,
        'a stale worker reaches no provider call'
      );
      assertEquals(
        (await h.admin('activate', { run_id: run, worker_token: oldToken }))
          .status,
        409
      );

      await drainAll(h, run, token);
      assertEquals(
        h.calls.map(c => c.length),
        [20, 20, ...new Array(15).fill(20), 11],
        '17 batches of 20 and one of 11'
      );
      const texts = h.calls.flat();
      assertEquals(texts.length, 351);
      assertEquals(new Set(texts).size, 351, 'every chunk text once');
      assertEquals(
        texts,
        before.map(r => r.chunk_text as string),
        'in chunk id order'
      );
      assert((await h.admin('status')).body.status.run_missing === 0);
      assertEquals(
        await vectorsOf(h.db),
        legacyVectors,
        'still nothing live before the cutover'
      );

      const done = await h.admin('activate', {
        run_id: run,
        worker_token: token,
      });
      assertEquals(
        [done.status, done.body.chunks, done.body.documents],
        [200, 351, 33]
      );

      assertEquals(
        await preserved(h.db),
        before,
        'every preserved field is unchanged'
      );
      const [{ models }] = await rows<{ models: string }>(
        h.db,
        `select string_agg(distinct embedding_model, ',') as models from public.knowledge_chunks`
      );
      assertEquals(models, QWEN);
      // The stored vector is the one computed from that chunk's own text.
      for (const row of before.filter(r => (r.id as number) % 50 === 1)) {
        const [{ close }] = await rows<{ close: boolean }>(
          h.db,
          `select (embedding <=> $2::vector) < 1e-6 as close from public.knowledge_chunks where id = $1`,
          [row.id, JSON.stringify(vectorFor(row.chunk_text as string))]
        );
        assert(close, `chunk ${row.id} holds the vector of its own text`);
      }
      const status = (await h.admin('status')).body.status;
      assertEquals(
        [status.phase, status.serving_model, status.writers_paused],
        ['qwen', QWEN, true]
      );
      assertEquals((await h.admin('enable_writers')).status, 200);
      assertEquals(
        (
          await rows<{ writers_paused: boolean }>(
            h.db,
            `select writers_paused from public.knowledge_embedding_cutover`
          )
        )[0].writers_paused,
        false
      );
      void LEGACY;
    } finally {
      await h.db.close();
    }
  }
);

// Falsifier: an embedding failure or a short answer must stage nothing, and the
// same batch is retried without a gap.
Deno.test(
  'a provider failure or short answer stages nothing and the batch is retried',
  async () => {
    const h = await harness();
    try {
      await seedStatedCorpus(h.db);
      const run = (await h.admin('begin')).body.run_id as string;
      const token = (await h.admin('acquire_worker', { run_id: run })).body
        .worker_token as string;
      const missing = async () =>
        (await h.admin('status')).body.status.run_missing as number;

      h.failNext.error = new Error('Embedding request failed with HTTP 401');
      const refused = await h.admin('embed_batch', {
        run_id: run,
        worker_token: token,
      });
      assertEquals(
        [refused.status, refused.body.error],
        [502, 'Embedding request failed with HTTP 401']
      );
      assertEquals(await missing(), 351);

      h.failNext.error = undefined;
      h.failNext.short = true;
      const short = await h.admin('embed_batch', {
        run_id: run,
        worker_token: token,
      });
      assertEquals(short.status, 502);
      assertEquals(await missing(), 351);

      h.failNext.short = false;
      const ok = await h.admin('embed_batch', {
        run_id: run,
        worker_token: token,
      });
      assertEquals([ok.status, ok.body.staged], [200, 20]);
      assertEquals(await missing(), 331);
      assertEquals(h.calls.at(-1)!.length, 20);
      assertEquals(
        h.calls[0],
        h.calls.at(-1),
        'the retry sent the same first 20 chunks'
      );
    } finally {
      await h.db.close();
    }
  }
);

// Falsifier: an admin action reachable without the service key, or without a
// valid operation, would let anyone freeze or roll back the knowledge base.
Deno.test(
  'the admin interface is service-only and validates its input',
  async () => {
    const h = await harness();
    try {
      const rejected = await handleIngestRequest(
        new Request('https://example.test/ingest-documents', {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong' },
          body: JSON.stringify({
            action: 'embedding_rebuild',
            operation: 'begin',
          }),
        }),
        {
          store: createStore(supabaseHttp(h.db).client),
          rebuild: createRebuildStore(supabaseHttp(h.db).client),
          now: () => new Date(),
          fetchPage: () => Promise.reject(new Error('no')),
          embed: () => Promise.reject(new Error('no')),
          serviceRoleKey: KEY,
        }
      );
      assertEquals(rejected.status, 401);
      await rejected.body?.cancel();
      assertEquals((await h.admin('status')).body.status.phase, 'legacy');

      assertEquals((await h.admin('drop_everything')).status, 400);
      assertEquals(
        (
          await h.admin('embed_batch', {
            run_id: 'not-a-uuid',
            worker_token: 'x',
          })
        ).status,
        400
      );
      assertEquals((await h.admin('activate')).status, 400);
      assertEquals(h.calls, []);
    } finally {
      await h.db.close();
    }
  }
);

// Falsifier: a normal scheduled call must not be changed by the new action
// field, and a body with an unknown action must not fall through to a crawl.
Deno.test('an unknown action is refused and never starts a crawl', async () => {
  const h = await harness();
  try {
    const res = await handleIngestRequest(
      new Request('https://example.test/ingest-documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ action: 'something_else' }),
      }),
      {
        store: createStore(supabaseHttp(h.db).client),
        rebuild: createRebuildStore(supabaseHttp(h.db).client),
        now: () => new Date(),
        fetchPage: () => Promise.reject(new Error('no page may be fetched')),
        embed: () => Promise.reject(new Error('no')),
        serviceRoleKey: KEY,
      }
    );
    assertEquals(res.status, 400);
    await res.body?.cancel();
    const [{ n }] = await rows<{ n: number }>(
      h.db,
      `select count(*)::int as n from public.crawl_logs`
    );
    assertEquals(n, 0);
  } finally {
    await h.db.close();
  }
});

// Falsifier: rollback and return must be reachable through the same interface.
Deno.test(
  'rollback and return to Qwen run through the admin interface',
  async () => {
    const h = await harness();
    try {
      await seedStatedCorpus(h.db);
      const run = (await h.admin('begin')).body.run_id as string;
      const token = (await h.admin('acquire_worker', { run_id: run })).body
        .worker_token as string;
      await drainAll(h, run, token);
      assertEquals(
        (await h.admin('activate', { run_id: run, worker_token: token }))
          .status,
        200
      );

      assertEquals((await h.admin('rollback')).status, 200);
      assertEquals((await h.admin('status')).body.status.phase, 'rollback');
      assertEquals(
        (await h.admin('enable_writers')).status,
        409,
        'writers stay paused in rollback'
      );
      assertEquals((await h.admin('return_to_qwen')).status, 200);
      assertEquals((await h.admin('status')).body.status.phase, 'qwen');
    } finally {
      await h.db.close();
    }
  }
);

// Falsifier: a supplied worker_token that is not a valid UUID must never act as
// the operator's forced release. Only an absent token releases by force. The
// live owner keeps the lease after every malformed request.
Deno.test(
  'a malformed worker_token is refused with 400 and the live lease stays held',
  async () => {
    const h = await harness();
    try {
      await seedStatedCorpus(h.db);
      const run = (await h.admin('begin')).body.run_id as string;
      const token = (await h.admin('acquire_worker', { run_id: run })).body
        .worker_token as string;
      const owner = () =>
        rows<{ worker_token: string | null; live: boolean | null }>(
          h.db,
          `select worker_token::text as worker_token, worker_expires_at > now() as live
             from public.knowledge_embedding_cutover`
        );
      assertEquals(await owner(), [{ worker_token: token, live: true }]);

      for (const bad of [
        'mistyped-token',
        '',
        null,
        42,
        {},
        token.slice(0, -1),
        `${token} `,
      ]) {
        const r = await h.admin('release_worker', {
          run_id: run,
          worker_token: bad,
        });
        assertEquals(
          [r.status, r.body.released],
          [400, undefined],
          String(bad)
        );
        assertEquals(
          await owner(),
          [{ worker_token: token, live: true }],
          `the owner still holds the lease after ${JSON.stringify(bad)}`
        );
        assertEquals(
          (await h.admin('acquire_worker', { run_id: run })).status,
          409,
          'a competing worker is still refused'
        );
      }

      // A valid token releases; an absent token is the explicit forced release.
      assertEquals(
        (await h.admin('release_worker', { run_id: run, worker_token: token }))
          .status,
        200
      );
      const second = await h.admin('acquire_worker', { run_id: run });
      assertEquals(second.status, 200);
      assertEquals(
        (await h.admin('release_worker', { run_id: run })).status,
        200
      );
      assertEquals(await owner(), [{ worker_token: null, live: null }]);
    } finally {
      await h.db.close();
    }
  }
);
