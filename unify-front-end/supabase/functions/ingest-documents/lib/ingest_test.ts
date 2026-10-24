import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ingestSource } from './ingest.ts';
import { makeHarness, makeSource, page, prose } from './testSupport.ts';

// Falsifier: with the old batch size of 50, a 45-plus chunk page is embedded in
// one call of 45 or more texts, and the assertion below fails.
Deno.test('embeds a long page in batches of at most 20 chunks', async () => {
  const source = makeSource(1);
  const h = makeHarness([source], { [source.url]: page(prose(90_000)) });

  const result = await ingestSource(source, h.deps);

  assertEquals(result.status, 'success');
  const stored = h.store.chunks.length;
  assert(stored > 40, `expected a long document, got ${stored} chunks`);
  assert(
    h.embedBatches.every(n => n <= 20),
    `batches: ${h.embedBatches}`
  );
  assertEquals(
    h.embedBatches.reduce((a, b) => a + b, 0),
    stored
  );
  assertEquals(h.embedBatches.slice(0, 2), [20, 20]);
});

// Falsifier: if old chunks are not deleted after a changed crawl, the first-run
// text ("group old") is still stored beside the new text.
Deno.test('a changed page replaces the document chunks', async () => {
  const source = makeSource(1);
  const pages: Record<string, string> = {
    [source.url]: page(prose(5_000, 'old')),
  };
  const h = makeHarness([source], pages);

  await ingestSource(source, h.deps);
  const documentId = h.store.documents[0].id;
  const firstCount = h.store.chunksOf(documentId).length;
  assert(firstCount >= 2);

  pages[source.url] = page(prose(3_000, 'new'));
  const second = await ingestSource(source, h.deps);

  assertEquals(second.status, 'success');
  assertEquals(h.store.documents.length, 1);
  const texts = h.store.chunksOf(documentId).map(c => c.chunk_text);
  assert(texts.length > 0);
  assert(
    texts.every(t => t.includes('group new')),
    `stale chunks kept: ${texts.filter(t => !t.includes('group new')).length}`
  );
  assert(!texts.some(t => t.includes('group old')));
  assertEquals(
    h.store.chunksOf(documentId).map(c => c.chunk_index),
    texts.map((_, i) => i)
  );
});

// Falsifier: empty metadata (the previous behaviour) has no fetched_at or
// published_at, and a fetch-date fallback would give 2026-10-23, not 2026-10-16.
Deno.test(
  'document and chunk metadata carry fetched_at and the page Date modified',
  async () => {
    const source = makeSource(1);
    const h = makeHarness([source], {
      [source.url]: page(prose(3_000), '2026-10-16'),
    });

    await ingestSource(source, h.deps);

    const doc = h.store.documents[0];
    assertEquals(doc.metadata.published_at, '2026-10-16');
    assertEquals(doc.metadata.fetched_at, '2026-10-23T12:00:00.000Z');
    assertEquals(doc.metadata.source, 'crawler');
    const chunks = h.store.chunksOf(doc.id);
    assertEquals(doc.metadata.chunk_count, chunks.length);
    for (const c of chunks) {
      assertEquals(c.metadata, {
        source: 'crawler',
        fetched_at: '2026-10-23T12:00:00.000Z',
        published_at: '2026-10-16',
      });
    }
  }
);

// Falsifier: leaving published_at empty (or using the modified date of another
// page) fails when the page has no Date modified.
Deno.test(
  'published_at falls back to the fetch date without a Date modified',
  async () => {
    const source = makeSource(1);
    const h = makeHarness([source], { [source.url]: page(prose(3_000)) });

    await ingestSource(source, h.deps);

    const doc = h.store.documents[0];
    assertEquals(doc.metadata.published_at, '2026-10-23');
    assertEquals(
      h.store.chunksOf(doc.id)[0].metadata.published_at,
      '2026-10-23'
    );
  }
);

// Falsifier: without the unchanged branch, the second crawl re-embeds the page
// (embed batches grow) and the old fetched_at / published_at stay on the chunks.
Deno.test(
  'an unchanged page refreshes document and chunk dates without re-embedding',
  async () => {
    const source = makeSource(1);
    const body = prose(5_000);
    const pages: Record<string, string> = {
      [source.url]: page(body, '2026-10-01'),
    };
    const h = makeHarness([source], pages);

    await ingestSource(source, h.deps);
    const doc = h.store.documents[0];
    const before = h.store.chunksOf(doc.id).map(c => c.chunk_text);
    const embedCallsBefore = h.embedBatches.length;
    const wordCount = doc.metadata.word_count;

    pages[source.url] = page(body, '2026-10-16');
    const second = await ingestSource(source, h.deps);

    assertEquals(second.status, 'skipped');
    assertEquals(h.embedBatches.length, embedCallsBefore);
    assertEquals(
      h.store.chunksOf(doc.id).map(c => c.chunk_text),
      before
    );
    assertEquals(doc.metadata.published_at, '2026-10-16');
    assertEquals(doc.metadata.fetched_at, '2026-10-23T12:01:00.000Z');
    assertEquals(doc.metadata.word_count, wordCount);
    for (const c of h.store.chunksOf(doc.id)) {
      assertEquals(c.metadata, {
        source: 'crawler',
        fetched_at: '2026-10-23T12:01:00.000Z',
        published_at: '2026-10-16',
      });
    }
    assertEquals(h.store.logs.at(-1)?.status, 'skipped');
  }
);

// Falsifier: if a failed fetch is not stamped, last_crawled_at stays null and
// the source is picked first on every run; if it is not logged, logs stay empty;
// if it throws, the caller sees a rejection instead of an error result.
Deno.test(
  'a failed fetch is stamped and logged, and keeps the previous document',
  async () => {
    const source = makeSource(1);
    const pages: Record<string, string | Error> = {
      [source.url]: page(prose(5_000, 'good'), '2026-10-01'),
    };
    const h = makeHarness([source], pages);
    await ingestSource(source, h.deps);
    const doc = h.store.documents[0];
    const chunksBefore = JSON.stringify(h.store.chunksOf(doc.id));
    const metadataBefore = JSON.stringify(doc.metadata);
    const hashBefore = doc.contentHash;

    pages[source.url] = new Error('HTTP 503: Service Unavailable');
    const result = await ingestSource(source, h.deps);

    assertEquals(result.status, 'error');
    assertEquals(
      h.store.sources[0].last_crawled_at,
      '2026-10-23T12:01:00.000Z'
    );
    const log = h.store.logs.at(-1)!;
    assertEquals(log.status, 'error');
    assertEquals(log.error_message, 'HTTP 503: Service Unavailable');
    assertEquals(log.crawl_source_id, 1);
    assertEquals(JSON.stringify(h.store.chunksOf(doc.id)), chunksBefore);
    assertEquals(JSON.stringify(doc.metadata), metadataBefore);
    assertEquals(doc.contentHash, hashBefore);
  }
);

// Falsifier: without cleanup, chunks written before the embedding failure stay
// next to the old ones and the document shows duplicated text.
Deno.test(
  'a failure after some chunks were written leaves only the previous chunks',
  async () => {
    const source = makeSource(1);
    const pages: Record<string, string | Error> = {
      [source.url]: page(prose(5_000, 'old')),
    };
    // First run: 3 chunks, one embed call. Second run: the 2nd embed call fails.
    const h = makeHarness([source], pages, { failEmbedOnCall: 3 });
    await ingestSource(source, h.deps);
    const doc = h.store.documents[0];
    const before = h.store.chunksOf(doc.id).map(c => c.chunk_text);
    const docBefore = JSON.stringify(doc);

    pages[source.url] = page(prose(90_000, 'new'));
    const result = await ingestSource(source, h.deps);

    assertEquals(result.status, 'error');
    assertEquals(
      h.store.chunksOf(doc.id).map(c => c.chunk_text),
      before
    );
    assertEquals(
      h.store.logs.at(-1)?.error_message,
      'embedding service unavailable'
    );
    assertEquals(
      JSON.stringify(doc),
      docBefore,
      'document row must not change'
    );
  }
);

// Falsifier: today a nearly empty page is "success" with zero chunks, and it
// would delete the previous document's usable chunks on the next write.
Deno.test(
  'an empty or boilerplate-only page is an error that keeps previous chunks',
  async () => {
    const source = makeSource(1);
    const pages: Record<string, string> = {
      [source.url]: page(prose(5_000)),
    };
    const h = makeHarness([source], pages);
    await ingestSource(source, h.deps);
    const doc = h.store.documents[0];
    const before = h.store.chunksOf(doc.id).length;

    for (const body of ['Maintenance.', 'Skip to content ' + 'x '.repeat(10)]) {
      pages[source.url] = page(body);
      const result = await ingestSource(source, h.deps);
      assertEquals(result.status, 'error');
      assertEquals(h.store.chunksOf(doc.id).length, before);
      assertEquals(h.store.logs.at(-1)?.status, 'error');
    }
  }
);
