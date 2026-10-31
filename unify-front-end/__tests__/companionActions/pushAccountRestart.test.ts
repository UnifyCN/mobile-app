import {
  ownAccountWork,
  stillOwned,
  subscribeAccount,
} from '@/services/account/accountSession';
const mockListeners = new Set<(event: string, session: unknown) => void>();
let mockSession = {
  user: { id: 'restart-a' },
  access_token:
    'x.' +
    btoa(
      JSON.stringify({ session_id: '11111111-1111-4111-8111-111111111111' })
    ) +
    '.x',
};
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
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
it('does not restore old work when a restarted read finds a new session for the same account', async () => {
  const stop = subscribeAccount(() => {});
  await Promise.resolve();
  await Promise.resolve();
  const old = ownAccountWork();
  expect(stillOwned(old)).toBe(true);
  stop();
  expect(stillOwned(old)).toBe(false);
  mockSession = {
    ...mockSession,
    access_token:
      'x.' +
      btoa(
        JSON.stringify({ session_id: '22222222-2222-4222-8222-222222222222' })
      ) +
      '.x',
  };
  const stop2 = subscribeAccount(() => {});
  await Promise.resolve();
  await Promise.resolve();
  expect(stillOwned(old)).toBe(false);
  expect(stillOwned(ownAccountWork())).toBe(true);
  stop2();
});
