// ingest-documents served handler (index.ts): a manual call whose source read
// fails. Runs the real Deno.serve handler and the real store; only the network
// is stubbed, and the Supabase HTTP hop answers the source read itself, so no
// database runs. What this proves: a failed read by id or URL gets the
// function's established 500 error answer, which carries the store's message
// and no credential, and starts no other database, page or provider call,
// while a read that finds nothing keeps its 400 or 403. It does not prove how
// hosted PostgREST words its errors.
//
// RUN: deno test --allow-read --allow-env unify-front-end/supabase/functions/ingest-documents/lib/index_source_read_test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureServe,
  fetchLog,
  json,
  setRoutes,
  testEnv,
} from '../../_shared/testHarness.ts';

// supabase-js starts an auth refresh timer when the handler builds its client.
const opts = { sanitizeOps: false, sanitizeResources: false };

const takeHandler = captureServe();
await import('../index.ts');
const handler = takeHandler();

const SERVICE_KEY = 'service-role-key';
const OPENROUTER_KEY = 'openrouter-key';
const SOURCE_URL = 'https://www.canada.ca/source';

/** The Supabase hop answers every source read with `answer`. */
function serveSourceRead(answer: () => Response) {
  testEnv.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  testEnv.OPENROUTER_API_KEY = OPENROUTER_KEY;
  setRoutes(call =>
    call.url.host === 'project.supabase.test' &&
    call.url.pathname === '/rest/v1/crawl_sources'
      ? answer()
      : undefined
  );
}

function ingest(body: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(
    handler(
      new Request('https://project.supabase.test/functions/v1/ingest-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify(body),
      })
    )
  );
}

const SELECTORS = [
  { name: 'id', body: { crawl_source_id: 3 }, status: 400, error: 'crawl_source_id 3 not found' },
  { name: 'URL', body: { url: SOURCE_URL }, status: 403, error: 'URL not in crawl_sources allowlist' },
];

const requested = () => fetchLog.map(c => `${c.url.host}${c.url.pathname}`);

for (const selector of SELECTORS) {
  // Falsifier: a database failure is answered as a missing source (400) or
  // an unlisted URL (403), or the call goes on to other work.
  Deno.test(`a failed source read by ${selector.name} is a 500 error, not a refusal`, opts, async () => {
    // The deployed client retries a 503 read itself; Retry-After: 0 keeps
    // those retries immediate.
    serveSourceRead(
      () =>
        new Response(
          JSON.stringify({ message: 'synthetic read failure', code: 'XX000' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
          }
        )
    );
    const res = await ingest(selector.body);
    const text = await res.text();

    assertEquals(res.status, 500);
    assertEquals(JSON.parse(text), {
      error: 'Reading the crawl source failed: synthetic read failure',
    });
    for (const secret of [SERVICE_KEY, OPENROUTER_KEY]) {
      assert(!text.includes(secret), 'a credential reached the response');
    }
    assert(fetchLog.length > 0);
    assertEquals(
      new Set(fetchLog.map(c => `${c.method} ${c.url.host}${c.url.pathname}`)),
      new Set(['GET project.supabase.test/rest/v1/crawl_sources']),
      'only the source read (and its client retries) was requested'
    );
  });

  // Falsifier: the fix also turns a genuine miss into an error.
  Deno.test(`a source read by ${selector.name} that finds nothing keeps its ${selector.status}`, opts, async () => {
    serveSourceRead(() => json([]));
    const res = await ingest(selector.body);

    assertEquals(res.status, selector.status);
    assertEquals(await res.json(), { error: selector.error });
    assertEquals(requested(), ['project.supabase.test/rest/v1/crawl_sources']);
  });
}
