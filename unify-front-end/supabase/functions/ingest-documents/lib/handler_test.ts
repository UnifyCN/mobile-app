import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleIngestRequest } from './handler.ts';
import {
  makeHarness,
  makeSource,
  NOW,
  page,
  prose,
  type Harness,
} from './testSupport.ts';

const KEY = 'service-role-key-for-tests';
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

function request(
  body: unknown,
  headers: Record<string, string> = { Authorization: `Bearer ${KEY}` }
): Request {
  return new Request('https://example.test/functions/v1/ingest-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function call(h: Harness, req: Request, serviceRoleKey = KEY) {
  return handleIngestRequest(req, { ...h.deps, serviceRoleKey });
}

function fourSources() {
  return [
    makeSource(1, { last_crawled_at: hoursAgo(100) }),
    makeSource(2, { last_crawled_at: null }),
    makeSource(3, { last_crawled_at: hoursAgo(2) }), // not due
    makeSource(4, { last_crawled_at: hoursAgo(400) }),
    makeSource(5, { enabled: false, last_crawled_at: null }),
  ];
}

function pagesFor(sources: { url: string }[]) {
  return Object.fromEntries(
    sources.map((s, i) => [s.url, page(prose(3_000, `s${i}`))])
  );
}

// Falsifier: if authorization is not checked in application code, each request
// below reaches the store or the network and returns 200.
Deno.test(
  'requests without the service role key are rejected before any work',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));
    const rejected: Request[] = [
      request({}, {}),
      request({}, { Authorization: 'Bearer wrong-key' }),
      request({}, { Authorization: KEY }),
      request({}, { Authorization: 'Bearer ' }),
      request({ crawl_source_id: 2 }, { Authorization: 'Bearer wrong-key' }),
      request({ url: sources[1].url }, {}),
    ];
    for (const req of rejected) {
      const res = await call(h, req);
      assertEquals(res.status, 401);
      await res.body?.cancel();
    }
    assertEquals(h.fetched, []);
    assertEquals(h.store.events, []);
    assertEquals(h.store.logs, []);
    assertEquals(h.store.documents, []);
  }
);

// Falsifier: a missing server key must not turn "Bearer " into a valid login.
Deno.test('an unset service role key rejects every request', async () => {
  const sources = fourSources();
  const h = makeHarness(sources, pagesFor(sources));
  for (const header of ['Bearer ', 'Bearer undefined', 'Bearer null']) {
    const res = await call(h, request({}, { Authorization: header }), '');
    assertEquals(res.status, 401);
    await res.body?.cancel();
  }
  assertEquals(h.fetched, []);
});

async function body(res: Response) {
  return await res.json();
}

// Falsifier: processing all due sources (3) or running them in parallel fails.
// Parallel runs interleave events (fetch:2 before saveDocument:1).
Deno.test(
  'an empty body processes two due sources one after the other',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));

    const res = await call(h, request({}));

    assertEquals(res.status, 200);
    const json = await body(res);
    // Never fetched (id 2) first, then oldest (id 4: 400h), not id 1 (100h).
    assertEquals(
      json.results.map((r: { source_id: number }) => r.source_id),
      [2, 4]
    );
    assertEquals(h.fetched, [sources[1].url, sources[3].url]);
    const events = h.store.events;
    assert(
      events.indexOf(`recordAttempt:2`) <
        events.indexOf(`fetch:${sources[3].url}`),
      `source 2 must finish before source 4 starts: ${events.join(' | ')}`
    );
    assertEquals(h.store.sources[1].last_crawled_at !== null, true);
    assertEquals(h.store.sources[2].last_crawled_at, hoursAgo(2));
    assertEquals(h.store.sources[0].last_crawled_at, hoursAgo(100));
  }
);

// Falsifier: if one failing source aborts the run or returns non-2xx, the
// second source is never fetched or the status is 500.
Deno.test(
  'a failing source returns 2xx and does not block the next source',
  async () => {
    const sources = fourSources();
    const pages = pagesFor(sources);
    const h = makeHarness(sources, {
      ...pages,
      [sources[1].url]: new Error('HTTP 500: upstream'),
    });

    const res = await call(h, request({}));

    assertEquals(res.status, 200);
    const json = await body(res);
    assertEquals(
      json.results.map((r: { status: string }) => r.status),
      ['error', 'success']
    );
    assert(
      h.store.sources[1].last_crawled_at !== null,
      'failed source is stamped'
    );
    assertEquals(h.store.logs[0].status, 'error');
    assertEquals(h.store.logs[0].error_message, 'HTTP 500: upstream');
    assertEquals(h.store.documents.length, 1);
  }
);

// Falsifier: a stamped failed source must leave the next run's pick untouched;
// a second run must reach ids 4 and 1 (ids 2 is now not due).
Deno.test(
  'the next run moves on after a failed source was stamped',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, {
      ...pagesFor(sources),
      [sources[1].url]: new Error('HTTP 500: upstream'),
    });

    await call(h, request({}));
    h.fetched.length = 0;
    const second = await body(await call(h, request({})));

    assertEquals(
      second.results.map((r: { source_id: number }) => r.source_id),
      [1]
    );
  }
);

// Falsifier: an exception from the store for source 2 (outside the crawl itself)
// would reject the whole request and skip source 4.
Deno.test(
  'a store failure for one source still returns 2xx and continues',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));
    h.store.failRecordAttemptFor.add(2);

    const res = await call(h, request({}));

    assertEquals(res.status, 200);
    const json = await body(res);
    assertEquals(
      json.results.map((r: { status: string }) => r.status),
      ['error', 'success']
    );
    assertEquals(json.results[0].error, 'database unavailable');
  }
);

// Falsifier: if the targeted call used the due picker, source 3 (attempted 2h
// ago, not due) would be skipped.
Deno.test(
  'crawl_source_id processes exactly that source, due or not',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));

    const res = await call(h, request({ crawl_source_id: 3 }));

    assertEquals(res.status, 200);
    assertEquals(h.fetched, [sources[2].url]);
    assertEquals((await body(res)).results.length, 1);
  }
);

Deno.test(
  'an unknown crawl_source_id is a 400 and fetches nothing',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));
    const res = await call(h, request({ crawl_source_id: 999 }));
    assertEquals(res.status, 400);
    await res.body?.cancel();
    assertEquals(h.fetched, []);
  }
);

// Falsifier: fetching the body url directly would request the attacker URL.
Deno.test(
  'a body url only selects an enabled allowlisted source and is never fetched itself',
  async () => {
    const sources = fourSources();
    const h = makeHarness(sources, pagesFor(sources));

    for (const url of [
      'https://evil.example/steal',
      'http://169.254.169.254/latest/meta-data',
      sources[4].url, // disabled source
    ]) {
      const res = await call(h, request({ url }));
      assertEquals(res.status, 403, url);
      await res.body?.cancel();
    }
    assertEquals(h.fetched, []);

    const ok = await call(h, request({ url: sources[0].url }));
    assertEquals(ok.status, 200);
    await ok.body?.cancel();
    assertEquals(h.fetched, [sources[0].url]);
  }
);

Deno.test('a malformed JSON body is a 400 and fetches nothing', async () => {
  const sources = fourSources();
  const h = makeHarness(sources, pagesFor(sources));
  const req = new Request('https://example.test/x', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body: '{not json',
  });
  const res = await call(h, req);
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(h.fetched, []);
});

// Falsifier: if the scheduled picker ignored record sources, the two due
// record sources would not both be crawled, one after the other.
Deno.test(
  'a scheduled run crawls two due record sources one at a time',
  async () => {
    const ee =
      'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';
    const news = 'https://api.io.canada.ca/io-server/gc/news/en/v2?x=1';
    const sources = [
      makeSource(7, {
        source_kind: 'ircc_express_entry_rounds',
        data_urls: [ee],
        last_crawled_at: hoursAgo(30),
      }),
      makeSource(30, {
        source_kind: 'ircc_newsroom',
        data_urls: [news],
        last_crawled_at: null,
      }),
      makeSource(31, { last_crawled_at: hoursAgo(500) }),
    ];
    const h = makeHarness(sources, {
      [ee]: Deno.readTextFileSync(
        new URL('./fixtures/ircc/ee_rounds_sample.json', import.meta.url)
      ),
      [news]: Deno.readTextFileSync(
        new URL('./fixtures/ircc/newsroom_shape.json', import.meta.url)
      ),
    });

    const response = await call(h, request({}));

    const body = await response.json();
    assertEquals(response.status, 200);
    assertEquals(
      body.results.map((r: { source_id: number; status: string }) => [
        r.source_id,
        r.status,
      ]),
      [
        [30, 'success'],
        [31, 'error'],
      ]
    );
    assertEquals(h.fetched, [news, sources[2].url]);
  }
);
