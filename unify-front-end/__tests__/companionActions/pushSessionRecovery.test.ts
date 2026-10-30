import { CompanionPushDevice } from '@/services/companionActions/pushDevice';
import { createPushClient } from '@/services/companionActions/pushClient';
import type { TransportReply } from '@/services/companionActions/client';
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
const mockListeners = new Set<(e: string, s: unknown) => void>();
let mockAccount: string | null = 'a';
let mockDeviceSession = 'session-a';
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
  const transport = jest.fn(
    async (b: Record<string, any>): Promise<TransportReply> => {
      if (b.action === 'push_read')
        return { status: 200, body: { enrollment } };
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
    }
  );
  const deps = {
    read: jest.fn(async () => saved),
    write: jest.fn(async (v: string) => {
      saved = v;
    }),
    permission: jest.fn(async (_ask: boolean) => 'granted' as const),
    token: jest.fn(async () => 'ExponentPushToken[synthetic369-client]'),
    proof: () => ({ installation_id: id, installation_secret: secret }),
    uuid: () => `33333333-3333-4333-8333-${String(n++).padStart(12, '0')}`,
    session: () => mockDeviceSession,
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
  mockDeviceSession = 'session-a';
  stop = subscribeAccount(() => {});
  await flush();
});
afterEach(() => stop());

it.each(['a', 'b'])(
  'fresh explicit consent renews retained proof for %s after sign-out',
  async destination => {
    const s = setup();
    const disconnect = s.device.connect();
    try {
      await s.device.enable('en');
      auth(null, 'SIGNED_OUT');
      await flush();
      const retired = JSON.parse(s.saved()!);
      expect(retired.retired).toBe(true);
      auth(destination);
      mockDeviceSession = 'new-session';
      await flush();
      await s.device.refresh('en');
      expect(s.device.snapshot().phase).toBe('sessionEnded');
      expect(
        s.transport.mock.calls.filter(c => c[0].action === 'push_apply')
      ).toHaveLength(1);
      await s.device.enable('en', true);
      expect(s.device.snapshot().phase).toBe('on');
      const renewed = JSON.parse(s.saved()!);
      expect(renewed.accountId).toBe(destination);
      expect(renewed.sessionId).toBe('new-session');
      expect(renewed.retired).toBe(false);
      expect(renewed.pending).toBeNull();
      expect(renewed.cleanup[0]).toEqual({
        accountId: 'a',
        sessionId: 'session-a',
        pending: retired.pending,
      });
      const writes = s.transport.mock.calls
        .map(c => c[0])
        .filter(c => c.action === 'push_apply');
      expect(writes.map(c => c.operation.type)).toEqual([
        'push.enroll',
        'push.enroll',
      ]);
      expect(writes[1].operation.expected_revision).toBe(1);
      expect(writes[1].operation_id).not.toBe(retired.pending.operation_id);
      expect(writes[1].operation_id).not.toBe(writes[0].operation_id);
      expect(writes[1].operation.installation_secret).toBe(secret);
    } finally {
      disconnect();
    }
  }
);
it('a rejected transfer retains old cleanup and requires another explicit consent', async () => {
  const s = setup();
  const disconnect = s.device.connect();
  try {
    await s.device.enable('en');
    auth(null, 'SIGNED_OUT');
    await flush();
    const retired = JSON.parse(s.saved()!);
    auth('b');
    mockDeviceSession = 'session-b';
    await flush();
    const normal = s.transport.getMockImplementation()!;
    s.transport.mockImplementation(async b =>
      b.action === 'push_apply'
        ? { status: 403, body: { error: 'active_session_required' } }
        : normal(b)
    );
    await s.device.enable('en', true);
    expect(s.device.snapshot().phase).toBe('forbidden');
    expect(JSON.parse(s.saved()!).cleanup[0].pending).toEqual(retired.pending);
    const count = s.transport.mock.calls.filter(
      c => c[0].action === 'push_apply'
    ).length;
    await s.device.refresh('en');
    expect(
      s.transport.mock.calls.filter(c => c[0].action === 'push_apply')
    ).toHaveLength(count);
    s.transport.mockImplementation(normal);
    await s.device.enable('en');
    expect(s.device.snapshot().phase).toBe('on');
    expect(
      s.transport.mock.calls
        .filter(c => c[0].action === 'push_apply')
        .every(c => c[0].operation.type === 'push.enroll')
    ).toBe(true);
  } finally {
    disconnect();
  }
});

it('uses the latest saved revision when a rotated installation transfers', async () => {
  const s = setup();
  const disconnect = s.device.connect();
  try {
    await s.device.enable('en');
    await s.device.enable('en');
    s.deps.token.mockResolvedValueOnce('ExpoPushToken[synthetic369-rotation]');
    await s.device.refresh('en');
    expect(JSON.parse(s.saved()!).enrollment.revision).toBe(3);
    auth(null, 'SIGNED_OUT');
    await flush();
    auth('b');
    mockDeviceSession = 'session-b';
    await flush();
    const normal = s.transport.getMockImplementation()!;
    s.transport.mockImplementation(async request =>
      request.action === 'push_read'
        ? { status: 200, body: { enrollment: null } }
        : normal(request)
    );
    await s.device.enable('en', true);
    const writes = s.transport.mock.calls
      .map(c => c[0])
      .filter(c => c.action === 'push_apply');
    expect(writes[writes.length - 1].operation.expected_revision).toBe(3);
  } finally {
    disconnect();
  }
});
