import { CompanionPushDevice } from '@/services/companionActions/pushDevice';
import { createPushClient } from '@/services/companionActions/pushClient';
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
const mockListeners = new Set<(e: string, s: unknown) => void>();
let mockAccount: string | null = 'a';
const session = () =>
  mockAccount ? { user: { id: mockAccount }, access_token: 'mock-jwt' } : null;
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        mockListeners.add(cb);
        return {
          data: {
            subscription: { unsubscribe: () => mockListeners.delete(cb) },
          },
        };
      },
    },
  },
}));
const id = '11111111-1111-4111-8111-111111111111',
  generation = '22222222-2222-4222-8222-222222222222';
const secret = 'ab'.repeat(32);
const held = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
function auth(id: string | null, event = 'SIGNED_IN') {
  mockAccount = id;
  for (const cb of mockListeners) cb(event, session());
}
function setup() {
  let saved: string | null = null,
    n = 1;
  let enrollment: any = null;
  const transport = jest.fn(async (b: Record<string, any>) => {
    if (b.action === 'push_read') return { status: 200, body: { enrollment } };
    if (b.action === 'status')
      return {
        status: 200,
        body: { status: 'not_applied', operation_id: b.operation_id },
      };
    const op = b.operation;
    enrollment = {
      installation_id: id,
      revision: (enrollment?.revision ?? 0) + 1,
      generation,
      enabled: op.type === 'push.enroll',
      revoked: op.type === 'push.revoke',
      locale: 'en',
    };
    return {
      status: 200,
      body: {
        status: 'applied',
        replayed: false,
        operation_id: b.operation_id,
        results: [
          {
            ...enrollment,
            type: op.type,
            before_revision: op.expected_revision,
            after_revision: enrollment.revision,
          },
        ],
        receipt: {
          operation_id: b.operation_id,
          operation_type: op.type,
          undoable: false,
          current: null,
        },
      },
    };
  });
  const deps = {
    read: jest.fn(async () => saved),
    write: jest.fn(async (v: string) => {
      saved = v;
    }),
    permission: jest.fn(async (_ask: boolean) => 'granted' as const),
    token: jest.fn(async () => 'ExponentPushToken[synthetic369-client]'),
    proof: () => ({ installation_id: id, installation_secret: secret }),
    uuid: () => `33333333-3333-4333-8333-${String(n++).padStart(12, '0')}`,
    session: () => 'session-a',
    client: (owner: ReturnType<typeof ownAccountWork>) =>
      createPushClient({
        transport: async b => {
          return transport(b);
        },
        platform: 'ios',
        appVersion: '9.9.9',
      }),
  };
  const device = new CompanionPushDevice(deps);
  return { device, deps, transport, saved: () => saved };
}
let stop: () => void;
beforeEach(async () => {
  mockAccount = 'a';
  stop = subscribeAccount(() => {});
  await flush();
});
afterEach(() => stop());
it('does not enroll on read; persists proof and exact intent before the first request', async () => {
  const s = setup();
  await s.device.refresh('en');
  expect(s.transport).not.toHaveBeenCalled();
  const wait = held<void>();
  s.deps.write.mockImplementationOnce(async () => wait.promise);
  const action = s.device.enable('en');
  await flush();
  expect(s.transport).not.toHaveBeenCalled();
  wait.resolve();
  await action;
  expect(s.device.snapshot().phase).toBe('on');
  expect(s.deps.write.mock.calls[0][0]).toContain(secret);
  expect(s.deps.write.mock.calls[0][0]).toContain('operation_id');
  expect(s.transport.mock.calls.map(c => c[0].action)).toEqual([
    'push_apply',
    'push_read',
  ]);
});
it.each(['permission', 'token', 'read', 'write'] as const)(
  'stops after account replacement during %s',
  async name => {
    const s = setup(),
      wait = held<any>();
    (s.deps[name] as jest.Mock).mockImplementationOnce(() => wait.promise);
    const action = s.device.enable('en');
    await flush();
    auth('b');
    wait.resolve(
      name === 'permission'
        ? 'granted'
        : name === 'token'
          ? 'ExponentPushToken[synthetic369-client]'
          : null
    );
    await action;
    expect(s.transport).not.toHaveBeenCalled();
    expect(s.device.snapshot().phase).not.toBe('on');
  }
);
it('does not restore a late receipt after batched sign-out and same-account sign-in', async () => {
  const s = setup(),
    wait = held<any>();
  s.transport.mockImplementationOnce(() => wait.promise);
  const action = s.device.enable('en');
  await flush();
  auth(null, 'SIGNED_OUT');
  auth('a');
  wait.resolve({ status: 503, body: {} });
  await action;
  expect(s.transport.mock.calls.map(c => c[0].action)).toEqual(['push_apply']);
  expect(s.device.snapshot().phase).not.toBe('on');
});
it('retains exact pending request on lost reply and looks up before any retry', async () => {
  const s = setup();
  s.transport.mockRejectedValueOnce(new TypeError('lost'));
  await s.device.enable('en');
  expect(s.device.snapshot().phase).toBe('unknown');
  const original = s.transport.mock.calls[0][0];
  await s.device.check('en');
  expect(s.device.snapshot().phase).toBe('not_applied');
  await s.device.retry('en');
  const writes = s.transport.mock.calls
    .map(c => c[0])
    .filter(b => b.action === 'push_apply');
  expect(writes).toEqual([original, original]);
});
it('denial leaves push off without a service request', async () => {
  const s = setup();
  s.deps.permission.mockResolvedValueOnce('denied' as never);
  await s.device.enable('en');
  expect(s.device.snapshot().phase).toBe('denied');
  expect(s.transport).not.toHaveBeenCalled();
});
it('storage failure sends nothing and remains unavailable', async () => {
  const s = setup();
  s.deps.write.mockRejectedValueOnce(new Error('locked'));
  await s.device.enable('en');
  expect(s.transport).not.toHaveBeenCalled();
  expect(s.device.snapshot().phase).toBe('unavailable');
});
it('uses current revision for token rotation and disable and has no Undo', async () => {
  const s = setup();
  await s.device.enable('en');
  s.deps.token.mockResolvedValueOnce('ExpoPushToken[synthetic369-rotated]');
  await s.device.refresh('en');
  await s.device.disable('en');
  const ops = s.transport.mock.calls
    .map(c => c[0])
    .filter(b => b.action === 'push_apply')
    .map(b => b.operation);
  expect(ops.map(o => [o.type, o.expected_revision])).toEqual([
    ['push.enroll', 0],
    ['push.enroll', 1],
    ['push.disable', 2],
  ]);
  expect(s.device.snapshot().phase).toBe('off');
  expect(s.device.snapshot()).not.toHaveProperty('undo');
});
it('token refresh retains ownership while an enable waits', async () => {
  const s = setup(),
    wait = held<any>();
  s.deps.permission.mockImplementationOnce(() => wait.promise);
  const action = s.device.enable('en');
  await flush();
  auth('a', 'TOKEN_REFRESHED');
  wait.resolve('granted');
  await action;
  expect(s.device.snapshot().phase).toBe('on');
});
it('does not retry an old token after a confirmed unapplied operation', async () => {
  const s = setup();
  s.transport.mockRejectedValueOnce(new TypeError('lost'));
  await s.device.enable('en');
  await s.device.check('en');
  s.deps.token.mockResolvedValueOnce(
    'ExponentPushToken[synthetic369-new-token]'
  );
  await s.device.retry('en');
  expect(
    s.transport.mock.calls.filter(c => c[0].action === 'push_apply')
  ).toHaveLength(1);
  expect(s.device.snapshot().phase).toBe('conflict');
  await s.device.enable('en');
  const writes = s.transport.mock.calls.filter(
    c => c[0].action === 'push_apply'
  );
  expect(writes).toHaveLength(2);
  expect(writes[0][0].operation_id === writes[1][0].operation_id).toBe(false);
});
it.each(['push_read', 'status'] as const)(
  'discards a held %s response after ownership changes',
  async action => {
    const s = setup();
    await s.device.enable('en');
    if (action === 'status') {
      s.transport.mockRejectedValueOnce(new TypeError('lost'));
      await s.device.disable('en');
    }
    const wait = held<any>();
    const normal = s.transport.getMockImplementation()!;
    s.transport.mockImplementation(async b =>
      b.action === action ? wait.promise : normal(b)
    );
    const pending =
      action === 'status' ? s.device.check('en') : s.device.refresh('en');
    await flush();
    auth('b');
    wait.resolve({
      status: 200,
      body:
        action === 'status'
          ? {
              status: 'not_applied',
              operation_id: '33333333-3333-4333-8333-000000000002',
            }
          : { enrollment: null },
    });
    await pending;
    expect(s.device.snapshot().phase).toBe('off');
  }
);
it('retains unknown pending storage across restart and never retries while a status is pending or failed', async () => {
  const s = setup();
  s.transport.mockRejectedValueOnce(new TypeError('lost'));
  await s.device.enable('en');
  const restarted = new CompanionPushDevice(s.deps);
  await restarted.refresh('en');
  expect(restarted.snapshot().phase).toBe('unknown');
  const op = JSON.parse(s.saved()!).pending.operation_id;
  s.transport.mockResolvedValueOnce({
    status: 200,
    body: { status: 'pending', operation_id: op },
  } as never);
  await restarted.check('en');
  await restarted.retry('en');
  expect(restarted.snapshot().phase).toBe('unknown');
  s.transport.mockRejectedValueOnce(new TypeError('lookup offline'));
  await restarted.check('en');
  await restarted.retry('en');
  expect(
    s.transport.mock.calls.filter(c => c[0].action === 'push_apply')
  ).toHaveLength(1);
});
it('captures a pending revoke on sign-out without sending it as the next account', async () => {
  const s = setup();
  const disconnect = s.device.connect();
  await s.device.enable('en');
  auth(null, 'SIGNED_OUT');
  auth('b');
  await flush();
  expect(s.device.snapshot().phase).toBe('off');
  const record = JSON.parse(s.saved()!);
  expect(record.retired).toBe(true);
  expect(record.accountId).toBe('a');
  expect(record.pending.operation.type).toBe('push.revoke');
  await s.device.enable('en');
  expect(s.device.snapshot().phase).toBe('sessionEnded');
  expect(
    s.transport.mock.calls.filter(c => c[0].action === 'push_apply')
  ).toHaveLength(1);
  disconnect();
});
it.each([401, 403, 409, 422, 503])(
  'keeps HTTP %s errors content-free and distinct from successful delivery',
  async status => {
    const s = setup();
    s.transport.mockResolvedValueOnce({
      status,
      body: {
        error: status === 503 ? 'push_disabled' : 'private-error',
        detail: { secret: 'do-not-display' },
      },
    } as never);
    await s.device.enable('en');
    expect(s.device.snapshot().phase).not.toBe('on');
    expect(JSON.stringify(s.device.snapshot()).includes('do-not-display')).toBe(
      false
    );
  }
);
