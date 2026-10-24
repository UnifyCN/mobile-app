// Run with: deno test --allow-env supabase/functions/personalize/index_test.ts
//
// Drives the real `personalize` handler. Only Deno.serve (captured) and
// fetch (Supabase HTTP responses) are faked, so the real supabase-js query
// builder and the handler's response mapping run. No network, no writes.
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
Deno.env.set('SUPABASE_ANON_KEY', 'anon-test-key');
await import('./index.ts');
assert(handler, 'personalize did not register a Deno.serve handler');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const PROFILE = {
  persona: 'international_student',
  city: 'Toronto',
  province: 'Ontario',
  arrival_date: null,
  stage: null,
  goals: [],
  learning_interests: ['documents'],
  hobbies: [],
};

function fakeSupabase(modules: () => Response) {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input: Request | URL | string) => {
    const url = new URL(
      typeof input === 'string' ? input : 'url' in input ? input.url : input
    );
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') {
      return Promise.resolve(json({ id: 'user-1' }));
    }
    if (url.pathname === '/rest/v1/user_onboarding_profiles') {
      return Promise.resolve(json(PROFILE));
    }
    if (url.pathname === '/rest/v1/learn_modules') {
      return Promise.resolve(modules());
    }
    if (url.pathname === '/rest/v1/learn_progress') {
      return Promise.resolve(json([]));
    }
    return Promise.resolve(
      json({ message: `unexpected ${url.pathname}` }, 500)
    );
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

async function callLearn(modules: () => Response) {
  const fake = fakeSupabase(modules);
  try {
    const res = await handler!(
      new Request('http://localhost/personalize?surfaces=learn', {
        headers: { Authorization: 'Bearer test' },
      })
    );
    assertEquals(res.status, 200);
    assert(
      fake.calls.includes('/rest/v1/learn_modules'),
      'metadata not queried'
    );
    // deno-lint-ignore no-explicit-any
    return (await res.json()) as any;
  } finally {
    fake.restore();
  }
}

// supabase-js starts auth timers on client creation that the handler cannot
// cancel, so the leak sanitizers are off for these tests.
const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

const quiet = <T>(run: () => Promise<T>) => {
  const realError = console.error;
  console.error = () => {};
  return run().finally(() => {
    console.error = realError;
  });
};

test('metadata query error makes the Learn surface unavailable (null)', async () => {
  const body = await quiet(() =>
    callLearn(() => json({ message: 'boom', code: 'XX000' }, 500))
  );
  assertEquals(body.learn, null);
});

test('successful empty metadata stays an authoritative empty ranking', async () => {
  const body = await callLearn(() => json([]));
  assertEquals(body.learn, { modules: [] });
});

test('successful metadata is province-filtered and scored', async () => {
  const body = await callLearn(() =>
    json([
      {
        sanity_id: 'national',
        title: 'National',
        personas: ['international_student'],
        interests: ['documents'],
        province: null,
      },
      {
        sanity_id: 'ontario',
        title: 'Ontario',
        personas: [],
        interests: [],
        province: 'Ontario',
      },
      {
        sanity_id: 'bc-only',
        title: 'BC only',
        personas: ['international_student'],
        interests: ['documents'],
        province: 'British Columbia',
      },
    ])
  );
  // deno-lint-ignore no-explicit-any
  const ids = body.learn.modules.map((m: any) => m.sanity_id).sort();
  assertEquals(ids, ['national', 'ontario']);
  // deno-lint-ignore no-explicit-any
  for (const m of body.learn.modules) assertEquals(typeof m.score, 'number');
});

test('all-excluded successful metadata stays empty, not null', async () => {
  const body = await callLearn(() =>
    json([
      {
        sanity_id: 'bc-only',
        title: 'BC only',
        personas: [],
        interests: [],
        province: 'British Columbia',
      },
    ])
  );
  assertEquals(body.learn, { modules: [] });
});
