// Uses the real handler and supabase-js. Only HTTP and Deno.serve are replaced.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler | undefined;
Object.defineProperty(Deno, 'serve', {
  value: (callback: Handler) => {
    handler = callback;
  },
});
Deno.env.set('SUPABASE_URL', 'https://supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
await import('./index.ts');
assert(handler);
const serve = handler;
const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function call(feature: unknown, status = 200) {
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    calls.push(url.pathname);
    if (url.pathname === '/rest/v1/rpc/circles_feature_enabled')
      return json(feature, status);
    if (url.pathname === '/rest/v1/community_matching_runs')
      return json({ id: 'test-run' });
    return json([]);
  };
  try {
    const response = await serve(
      new Request('https://edge.test', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-service-key' },
      })
    );
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test(
  'paused matchmaking performs only the flag read, with no run, data queries, or push',
  async () => {
    const result = await call(false);
    assertEquals(result.status, 200);
    assertEquals(result.body, { ok: true, paused: true });
    assertEquals(result.calls, ['/rest/v1/rpc/circles_feature_enabled']);
  }
);

Deno.test(
  'missing, malformed, and failed flags stop all matchmaking work',
  async () => {
    for (const flag of [null, 'true', {}, []]) {
      const result = await call(flag);
      assertEquals(result.body, { ok: true, paused: true });
      assertEquals(result.calls, ['/rest/v1/rpc/circles_feature_enabled']);
    }
    const result = await call({ message: 'unavailable' }, 500);
    assertEquals(result.status, 503);
    assertEquals(result.calls, ['/rest/v1/rpc/circles_feature_enabled']);
  }
);

Deno.test(
  'enabled matchmaking reaches the existing worker and completes an empty run',
  async () => {
    const result = await call(true);
    assertEquals(result.status, 200);
    assertEquals(result.body.ok, true);
    assertEquals(result.body.paused, undefined);
    assert(result.calls.includes('/rest/v1/community_matching_runs'));
    assert(result.calls.includes('/rest/v1/community_match_waitlist'));
  }
);

Deno.test('unauthorized callers cannot reach the feature query', async () => {
  globalThis.fetch = () => {
    throw new Error('Unexpected HTTP request');
  };
  try {
    const response = await serve(
      new Request('https://edge.test', { method: 'POST' })
    );
    assertEquals(response.status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// Hold the run at real HTTP boundaries. No timers or delays are used to pause it.
async function matchingRun(
  pauseAt: 'never' | 'match' | 'first_batch' | 'flag_snapshot'
) {
  const userIds = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  let paused = false;
  let pushes = 0;
  let featureReads = 0;
  let created = 0;
  const flagSnapshot = Promise.withResolvers<void>();
  const releaseFlag = Promise.withResolvers<void>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    const method =
      init && 'method' in init
        ? String(init.method)
        : input instanceof Request
          ? input.method
          : 'GET';
    if (url.pathname === '/rest/v1/rpc/circles_feature_enabled') {
      featureReads++;
      const enabledAtRead = !paused;
      if (pauseAt === 'flag_snapshot' && featureReads === 2) {
        flagSnapshot.resolve();
        await releaseFlag.promise;
      }
      return json(enabledAtRead);
    }
    if (url.hostname === 'exp.host') {
      const body: unknown = JSON.parse(
        String(init && 'body' in init ? init.body : undefined)
      );
      assert(Array.isArray(body));
      pushes++;
      if (pauseAt === 'first_batch') paused = true;
      return json({ data: body.map(() => ({ status: 'ok' })) });
    }
    if (url.pathname === '/rest/v1/rpc/create_circle_match') {
      created++;
      if (pauseAt === 'match') paused = true;
      return json('33333333-3333-4333-8333-333333333333');
    }
    if (paused && (method === 'POST' || method === 'PATCH'))
      return json({ code: '55000', message: 'Circles are paused' }, 400);
    if (url.pathname === '/rest/v1/community_matching_runs')
      return json({ id: 'test-run' });
    if (url.pathname === '/rest/v1/community_match_waitlist')
      return json(
        userIds.map(user_id => ({
          user_id,
          pool_key: 'mixed__new',
          persona: null,
          time_in_canada: 'new',
          created_at: '2020-01-01',
          placement_deadline_at: '2020-01-04',
          goal: null,
          topics: [],
        }))
      );
    if (url.pathname === '/rest/v1/users')
      return json(userIds.map(id => ({ id, preferred_language: 'en' })));
    if (url.pathname === '/rest/v1/push_tokens')
      return json(
        Array.from({ length: 101 }, (_, index) => ({
          token: `ExponentPushToken[test-${index}]`,
          user_id: userIds[index % 2],
        }))
      );
    return json([]);
  };
  try {
    const activeRequest = serve(
      new Request('https://edge.test', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-service-key' },
      })
    );
    if (pauseAt === 'flag_snapshot') {
      await flagSnapshot.promise;
      paused = true;
      releaseFlag.resolve();
    }
    await activeRequest;
    if (pauseAt === 'flag_snapshot') {
      // The earlier request has drained. A new request cannot start work.
      const next = await serve(
        new Request('https://edge.test', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-service-key' },
        })
      );
      assertEquals(await next.json(), { ok: true, paused: true });
    }
    return { pushes, featureReads, created };
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test(
  'pause after match commit blocks all push delivery from that run',
  async () => {
    const result = await matchingRun('match');
    assertEquals(result.created, 1);
    assertEquals(result.pushes, 0);
    assert(result.featureReads > 1);
  }
);

Deno.test(
  'pause after the first push batch blocks the next batch',
  async () => {
    const result = await matchingRun('first_batch');
    assertEquals(result.created, 1);
    assertEquals(result.pushes, 1);
    assertEquals(result.featureReads, 3);
  }
);

Deno.test(
  'enabled matching delivers both batches with the same input',
  async () => {
    const result = await matchingRun('never');
    assertEquals(result.created, 1);
    assertEquals(result.pushes, 2);
    assertEquals(result.featureReads, 3);
  }
);

Deno.test(
  'an earlier flag response can authorize a drain-period batch; new work stops after the request drains',
  async () => {
    const result = await matchingRun('flag_snapshot');
    assertEquals(result.created, 1);
    assertEquals(result.pushes, 1);
    assertEquals(result.featureReads, 4);
  }
);
