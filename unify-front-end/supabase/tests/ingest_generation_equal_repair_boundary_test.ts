// Run with: deno test --allow-read --allow-env unify-front-end/supabase/tests/
//
// An equal generation that repairs a live source, at the public handler: the
// real store over supabase-js, the real migrations (PGlite) and fixed clocks.
// A 50-chunk page is published, one live vector is removed (the live
// generation then needs repair), and a repair job checks 20 rows before the
// provider fails. The same page is then fetched again, before and after the
// 24-hour snapshot limit. Falsifier for both cases: the second fetch closes
// the repair job, embeds a confirmed row again, resets its request debit, or
// changes live data before the complete generation promotes. It does not
// prove hosted PostgREST, provider output or charges.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EmbeddingError } from '../functions/_shared/embeddings.ts';
import { handleIngestRequest } from '../functions/ingest-documents/lib/handler.ts';
import { createStore } from '../functions/ingest-documents/lib/supabaseStore.ts';
import { ManualClock } from '../functions/ingest-documents/lib/testClock.ts';
import { page, prose, receipt } from '../functions/ingest-documents/lib/testSupport.ts';
import { openQwenIngestDb } from './support/ingestDb.ts';
import { crawlLogs, live, unitVector } from './support/generationJobs.ts';
import { rows, type Db } from './support/sharedDb.ts';
import { supabaseHttp } from './support/supabaseHttp.ts';

const KEY = 'test-service-role-key';
const PAGE = page(prose(90000, 'equal-repair'));

interface Job {
  id: string;
  status: string;
  operations: number;
  requests_reserved: number;
  request_cap: number;
  fetched_at: string;
  generation_fingerprint: string;
  source_config_hash: string;
}

function jobs(db: Db) {
  return rows<Job>(
    db,
    `select id::text as id, status, cardinality(operation_ids) as operations,
            requests_reserved, request_cap,
            to_char(fetched_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as fetched_at,
            generation_fingerprint, source_config_hash
       from public.knowledge_generation_jobs order by created_at`
  );
}

function checkedRows(db: Db, job: string) {
  return rows<{ chunk_index: number; receipt_identity: string; embedding: string }>(
    db,
    `select chunk_index, receipt_identity, embedding::text as embedding
       from public.knowledge_generation_rows
      where job_id = $1 and embedding is not null order by chunk_index`,
    [job]
  );
}

for (const stale of [false, true]) {
  Deno.test(`${stale ? 'a stale' : 'a current'} equal repair fetch keeps the 20 checked rows and embeds only the 30 missing`, async () => {
    const db = await openQwenIngestDb();
    try {
      const [s] = await rows<{ id: number; url: string }>(
        db,
        `select id::int as id, url from public.crawl_sources
          where source_kind = 'html' and enabled order by id limit 1`
      );
      await db.query(`update public.crawl_sources set crawl_frequency_hours = 24 where id = $1`, [
        s.id,
      ]);
      let onSend: (() => Promise<void>) | null = null;
      const invoke = async (at: string, failSecond = false) => {
        const sends: string[][] = [];
        const response = await handleIngestRequest(
          new Request('https://example.test/ingest', {
            method: 'POST',
            headers: { Authorization: `Bearer ${KEY}` },
            body: JSON.stringify({ crawl_source_id: s.id }),
          }),
          {
            store: createStore(supabaseHttp(db).client),
            timers: new ManualClock(),
            now: () => new Date(at),
            serviceRoleKey: KEY,
            fetchPage: () => Promise.resolve(PAGE),
            embedChecked: async texts => {
              sends.push(texts);
              if (onSend) await onSend();
              if (failSecond && sends.length === 2) {
                throw new EmbeddingError('http', 'Embedding request failed with HTTP 503', 503);
              }
              return { vectors: texts.map(() => unitVector()), receipt: receipt(texts.length) };
            },
          }
        );
        return { body: await response.json(), sends };
      };

      const first = await invoke('2026-10-25T00:00:00Z');
      assertEquals(first.body.results[0].status, 'success');
      const published = await live(db, s.url);
      assertEquals(published.chunks.length, 50);
      await db.query(
        `update public.knowledge_chunks set embedding = null
          where id = (select kc.id from public.knowledge_chunks kc
                        join public.knowledge_documents kd on kd.id = kc.document_id
                       where kd.source_url = $1 order by kc.chunk_index limit 1)`,
        [s.url]
      );
      const needsRepair = await live(db, s.url);

      const second = await invoke('2026-10-25T01:00:00Z', true);
      const pending = second.body.results[0];
      assertEquals(pending.status, 'pending');
      assertEquals([pending.staged, pending.remaining, pending.reserved, pending.cap], [20, 30, 2, 11]);
      assertEquals(second.sends.map(b => b.length), [20, 20]);
      const repairJob = pending.job_id as string;
      const checked = await checkedRows(db, repairJob);
      assertEquals(checked.map(r => r.chunk_index), [...Array(20).keys()]);
      assert(checked.every(r => r.receipt_identity === 'canonical'), 'each checked row has its receipt');
      assertEquals(await live(db, s.url), needsRepair, 'the incomplete repair changed no live row');

      // Until the repair promotes, the third call sees the old live data.
      const duringThird: Array<Awaited<ReturnType<typeof live>>> = [];
      onSend = async () => {
        duringThird.push(await live(db, s.url));
      };
      const thirdAt = stale ? '2026-10-26T02:00:00Z' : '2026-10-25T02:00:00Z';
      const third = await invoke(thirdAt);
      onSend = null;

      assertEquals(third.body.results[0].status, 'success');
      assertEquals(third.body.results[0].chunks_created, 50);
      // Rows are reserved lowest index first, and prose repeats text across
      // chunks, so the exact ordered index slices are the ground truth.
      const texts = published.chunks.map(c => c.chunk_text as string);
      assertEquals(second.sends[0], texts.slice(0, 20), 'rows 0-19 were confirmed');
      assertEquals(third.sends.map(b => b.length), [20, 10]);
      assertEquals(third.sends.flat(), texts.slice(20), 'only rows 20-49 are sent, once each');
      assertEquals(duringThird.length, 2);
      for (const seen of duringThird) assertEquals(seen, needsRepair);

      const all = await jobs(db);
      assertEquals(all.length, 2, 'no replacement job opened');
      assertEquals(all[1].id, repairJob);
      assertEquals(all[1].status, 'promoted');
      assertEquals(all[1].operations, stale ? 2 : 1, 'only a fresh fetch reuses the job');
      assertEquals(all[1].fetched_at, stale ? '2026-10-26T02:00:00' : '2026-10-25T01:00:00');
      assertEquals(
        [all[1].requests_reserved, all[1].request_cap],
        [4, 11],
        'the earlier debit stays and two more requests are added'
      );
      assertEquals(all[1].generation_fingerprint, all[0].generation_fingerprint);
      assertEquals(all[1].source_config_hash, all[0].source_config_hash);

      const repaired = await live(db, s.url);
      assertEquals(repaired.chunks.length, 50);
      assertEquals(
        repaired.chunks.map(c => c.chunk_text),
        published.chunks.map(c => c.chunk_text)
      );
      assert(repaired.chunks.every(c => c.embedding !== null), 'the live generation is complete');
      assertEquals((await crawlLogs(db, s.id)).map(l => l.status), ['success', 'success']);
    } finally {
      await db.close();
    }
  });
}
