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
    const logsBefore = h.store.logs.length;
    const result = await ingestSource(source, h.deps);

    // The checked first batch stays in the open job for the next call; a
    // pending job writes no crawl log.
    assertEquals(result.status, 'pending');
    assertEquals(result.stop_reason, 'provider_error');
    assertEquals(result.error, 'embedding service unavailable');
    assertEquals(result.staged, 20);
    assertEquals(
      h.store.chunksOf(doc.id).map(c => c.chunk_text),
      before
    );
    assertEquals(h.store.logs.length, logsBefore);
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

// Falsifier: without province in the metadata builders, the stored metadata has
// no province key and every assertion below fails.
Deno.test('a provincial source copies its province into document and chunk metadata', async () => {
  const source = makeSource(1, { province: 'Ontario' });
  const h = makeHarness([source], { [source.url]: page(prose(5_000)) });

  await ingestSource(source, h.deps);

  const doc = h.store.documents[0];
  assertEquals(doc.metadata.province, 'Ontario');
  const chunks = h.store.chunksOf(doc.id);
  assert(chunks.length >= 2);
  for (const c of chunks) assertEquals(c.metadata.province, 'Ontario');
});

// Falsifier: an unchanged crawl replaces chunk metadata as a whole. If the
// refresh leaves province out, the province chunks become national and every
// user would see them.
Deno.test('an unchanged crawl keeps the province on document and chunks', async () => {
  const source = makeSource(1, { province: 'British Columbia' });
  const h = makeHarness([source], { [source.url]: page(prose(5_000)) });

  await ingestSource(source, h.deps);
  const second = await ingestSource(source, h.deps);

  assertEquals(second.status, 'skipped');
  const doc = h.store.documents[0];
  assertEquals(doc.metadata.province, 'British Columbia');
  const chunks = h.store.chunksOf(doc.id);
  assert(chunks.length >= 2);
  for (const c of chunks) assertEquals(c.metadata.province, 'British Columbia');
});

// Falsifier: a national source must never get a province key. The old
// unchanged-crawl merge would keep a stale province on the document.
Deno.test('a source that becomes national drops the province on the next crawl', async () => {
  const provincial = makeSource(1, { province: 'Alberta' });
  const h = makeHarness([provincial], {
    [provincial.url]: page(prose(5_000)),
  });
  await ingestSource(provincial, h.deps);

  // The stored row changes, and the next crawl reads it.
  const national = { ...provincial, province: null };
  h.store.sources[0] = national;
  await ingestSource(national, h.deps);

  const doc = h.store.documents[0];
  assertEquals(doc.metadata.province, null);
  for (const c of h.store.chunksOf(doc.id)) {
    assert(!('province' in c.metadata), JSON.stringify(c.metadata));
  }
});

// Falsifier: when the live chunks need repair, the refresh returns false; if it
// closes the open equal job first, the next fetch embeds the 20 checked rows
// again (batches 20, 20, 13 instead of 20, 13 for this 53-chunk page).
Deno.test('a false refresh keeps the equal repair job and its checked rows', async () => {
  const source = makeSource(1);
  // Publishing takes calls 1-3; the repair's second call (5) fails.
  const h = makeHarness([source], { [source.url]: page(prose(90_000)) }, { failEmbedOnCall: 5 });

  assertEquals((await ingestSource(source, h.deps)).status, 'success');
  assertEquals(h.embedBatches, [20, 20, 13]);
  h.store.chunks[0].embedding = [];
  const repair = await ingestSource(source, h.deps);
  assertEquals([repair.status, repair.staged, repair.remaining], ['pending', 20, 33]);

  const done = await ingestSource(source, h.deps);

  assertEquals(done.status, 'success');
  assertEquals(h.embedBatches.slice(3), [20, 20, 20, 13]);
  assertEquals(h.store.chunks.length, 53);
  assert(h.store.chunks.every(c => c.embedding.length > 0));
});
