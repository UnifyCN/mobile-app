// Run with: deno test --allow-env --no-lock --node-modules-dir=none supabase/functions/get-daily-tip/index_test.ts
//
// Drives the real `get-daily-tip` handler. Only Deno.serve (captured) and
// fetch (Supabase and OpenRouter HTTP responses) are faked, so the real
// supabase-js query builder, the stage rule and the prompt builder run. No
// network, no writes, no model call.
//
// The filename uses an underscore, not `.test.ts`, so jest-expo's default
// testMatch never picks it up (Deno APIs fail under jest).
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Handler = (req: Request) => Response | Promise<Response>;

let handler: Handler | undefined;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: Handler) => {
  handler = h;
  return {};
};
Deno.env.set('SUPABASE_URL', 'http://supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-test-key');
Deno.env.set('OPENROUTER_API_KEY', 'openrouter-test-key');
await import('./index.ts');
assert(handler, 'get-daily-tip did not register a Deno.serve handler');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const TIP = {
  category: 'documents',
  title: 'Gather your documents',
  description: 'Copies of key papers',
  tip_text: 'Keep copies of your passport and offer letters.',
};

interface Captured {
  /** Stage the handler wrote to the daily_tips claim row. */
  claimedStage?: string;
  /** The prompt sent to the model. */
  prompt?: string;
}

// The hosted arrival_date column is a timestamptz. PostgREST returns a date
// the user chose, 2026-12-02, as "2026-12-02T00:00:00+00:00".
async function callTip(arrival_date: string | null): Promise<Captured> {
  const captured: Captured = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(
      input instanceof Request ? input.url : String(input)
    );
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (url.pathname === '/auth/v1/user') return json({ id: 'user-1' });
    if (url.pathname === '/rest/v1/user_onboarding_profiles') {
      return json({
        persona: 'skilled_worker',
        city: 'Toronto',
        province: 'Ontario',
        goals: [],
        learning_interests: [],
        arrival_date,
      });
    }
    if (url.pathname === '/rest/v1/daily_tips') {
      if (method === 'GET') return json([]);
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? request?.body));
        captured.claimedStage = body.stage;
        return json([{ id: 'claim-1' }], 201);
      }
      if (method === 'PATCH') {
        return json({
          id: 'claim-1',
          persona: 'skilled_worker',
          stage: captured.claimedStage,
          date: '2026-10-23',
          ...TIP,
          source_refs: null,
        });
      }
    }
    if (url.hostname === 'openrouter.ai') {
      const body = JSON.parse(String(init?.body));
      captured.prompt = body.messages[0].content;
      return json({
        choices: [{ message: { content: JSON.stringify(TIP) } }],
        model: 'test-model',
      });
    }
    return json({ message: `unexpected ${method} ${url.href}` }, 500);
  };
  try {
    const res = await handler!(
      new Request('http://localhost/get-daily-tip', {
        headers: { Authorization: 'Bearer test', 'x-local-date': '2026-10-23' },
      })
    );
    assertEquals(res.status, 200);
    await res.json();
    return captured;
  } finally {
    globalThis.fetch = realFetch;
  }
}

// supabase-js starts auth timers on client creation that the handler cannot
// cancel, so the leak sanitizers are off for these tests.
const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

test('a stored arrival timestamp is stage 0: claim row and both prompt lines', async () => {
  const { claimedStage, prompt } = await callTip('2026-12-02T00:00:00+00:00');
  assertEquals(claimedStage, '0');
  assert(prompt?.includes('- Stage (time since arrival): pre-arrival'), 'stage line');
  assert(prompt?.includes('- Has not yet arrived in Canada'), 'arrival line');
});

test('a plain stored date is still stage 0 with both prompt lines', async () => {
  const { claimedStage, prompt } = await callTip('2026-12-02');
  assertEquals(claimedStage, '0');
  assert(prompt?.includes('- Stage (time since arrival): pre-arrival'), 'stage line');
  assert(prompt?.includes('- Has not yet arrived in Canada'), 'arrival line');
});

test('an unreadable stored timestamp is unknown: no stage line, no arrival line', async () => {
  const { claimedStage, prompt } = await callTip('2026-02-30T00:00:00+00:00');
  assertEquals(claimedStage, 'unknown');
  assert(!prompt?.includes('Stage (time since arrival)'), 'stage line present');
  assert(!prompt?.includes('Has not yet arrived'), 'arrival line present');
  assert(!prompt?.includes('Has been in Canada'), 'arrival line present');
});

test('a missing arrival date is unknown', async () => {
  const { claimedStage, prompt } = await callTip(null);
  assertEquals(claimedStage, 'unknown');
  assert(!prompt?.includes('Stage (time since arrival)'));
});
