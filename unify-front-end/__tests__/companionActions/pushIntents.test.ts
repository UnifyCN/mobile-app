import { CompanionPushIntents } from '@/services/companionActions/pushIntents';
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
const mockListeners = new Set<(e: string, s: unknown) => void>();
let mockId: string | null = null;
const session = () =>
  mockId ? { user: { id: mockId }, access_token: 'jwt' } : null;
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: (cb: any) => {
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
const id = '44444444-4444-4444-8444-444444444444';
const data = {
  type: 'companion_reminder',
  delivery_id: id,
  task_id: 'foreign',
  url: '/wrong',
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function auth(value: string | null) {
  mockId = value;
  for (const cb of mockListeners)
    cb(value ? 'SIGNED_IN' : 'SIGNED_OUT', session());
}
let stop: () => void;
beforeEach(async () => {
  mockId = null;
  stop = subscribeAccount(() => {});
  await flush();
});
afterEach(() => stop());
function setup() {
  const resolve = jest.fn(async () => ({
      kind: 'ok' as const,
      value: { target: 'available' as const, task_ref: 'custom:7' },
    })),
    navigate = jest.fn(),
    clear = jest.fn();
  const q = new CompanionPushIntents({
    resolve,
    navigate,
    last: () => data,
    clear,
  });
  return { q, resolve, navigate, clear };
}
it('retains one minimal signed-out warm+cold intent until normal authentication and current resolve', async () => {
  const s = setup();
  s.q.receive(data);
  s.q.receive(data);
  await s.q.process('en');
  expect(s.resolve).not.toHaveBeenCalled();
  auth('a');
  await s.q.process('en');
  expect(s.resolve).toHaveBeenCalledTimes(1);
  expect(s.navigate).toHaveBeenCalledTimes(1);
  expect(s.q.snapshot()).toMatchObject({
    deliveryId: id,
    target: { target: 'available', task_ref: 'custom:7' },
  });
  s.q.complete(id);
  expect(s.clear).toHaveBeenCalledTimes(1);
  s.q.receive(data);
  await s.q.process('en');
  expect(s.navigate).toHaveBeenCalledTimes(1);
});
it('drops a late resolver after an account reset in one batch', async () => {
  const s = setup();
  auth('a');
  s.q.receive(data);
  let release: any;
  s.resolve.mockImplementationOnce(() => new Promise(r => (release = r)));
  const p = s.q.process('en');
  await flush();
  auth(null);
  auth('a');
  release({ kind: 'ok', value: { target: 'available', task_ref: 'custom:7' } });
  await p;
  expect(s.navigate).not.toHaveBeenCalled();
  expect(s.q.snapshot()).toBeNull();
  expect(s.clear).not.toHaveBeenCalled();
});
it('does not use a stale authenticated SDK last-response read in a new account', async () => {
  const s = setup();
  auth('a');
  const captured = ownAccountWork();
  auth('b');
  s.q.receive(data, captured);
  await s.q.process('en');
  expect(s.resolve).not.toHaveBeenCalled();
});
it('does not clear a newer SDK response when an older intent completes', async () => {
  const clear = jest.fn();
  auth('a');
  const q = new CompanionPushIntents({
    resolve: async () => ({ kind: 'ok', value: { target: 'unavailable' } }),
    navigate: jest.fn(),
    last: () => ({
      ...data,
      delivery_id: '55555555-5555-4555-8555-555555555555',
    }),
    clear,
  });
  q.receive(data);
  await q.process('en');
  q.complete(id);
  expect(clear).not.toHaveBeenCalled();
});
it('failed content resolution retains a retryable generic result without task data', async () => {
  const s = setup();
  auth('a');
  s.resolve.mockResolvedValueOnce({ kind: 'unknown' } as never);
  s.q.receive(data);
  await s.q.process('en');
  expect(s.q.snapshot()).toMatchObject({ target: { target: 'failed' } });
  expect(s.clear).not.toHaveBeenCalled();
  await s.q.process('en');
  expect(s.q.snapshot()).toMatchObject({
    target: { target: 'available', task_ref: 'custom:7' },
  });
});
it('processes the new account intent after an old account resolver finishes', async () => {
  const s = setup();
  auth('a');
  s.q.receive(data);
  let release: any;
  s.resolve.mockImplementationOnce(() => new Promise(r => (release = r)));
  const old = s.q.process('en');
  await flush();
  auth('b');
  s.q.invalidate();
  const next = '55555555-5555-4555-8555-555555555555';
  s.q.receive({ ...data, delivery_id: next });
  const fresh = s.q.process('en');
  release({ kind: 'ok', value: { target: 'available', task_ref: 'custom:7' } });
  await old;
  await fresh;
  expect(s.q.snapshot()?.deliveryId).toBe(next);
  expect(s.navigate).toHaveBeenCalledTimes(1);
});
