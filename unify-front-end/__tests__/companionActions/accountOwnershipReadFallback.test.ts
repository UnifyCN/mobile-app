// Account ownership at the compatibility retry stages of the conversation
// services (mobile-app#361, review round 5). The actual getConversationMessages
// and saveMessage run against a scripted Supabase auth session and a scripted
// PostgREST chain. Each test holds the first request, which names
// messages.companion_context, changes the signed-in account (or makes it
// unknown), and then answers that the column does not exist. The retry without
// the column is a new authenticated request: it may start only while the
// account that started the work is still the established signed-in one. This
// proves which requests the client starts; it is not evidence of server
// authorization (both requests keep their user filters).
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
import { getConversationMessages } from '@/services/companion/getConversationMessages';
import { saveMessage } from '@/services/companion/saveMessage';

let mockAccount: string | null = 'fallback-a';
const mockListeners = new Set<(event: string, session: unknown) => void>();
/** Answers the request that names companion_context. */
const mockContextReply = jest.fn();
type Call = {
  as: string | null;
  table: string;
  kind: 'select' | 'insert';
  withContext: boolean;
};
const mockCalls: Call[] = [];
const missingColumn = {
  data: null,
  error: { code: '42703', message: 'column companion_context does not exist' },
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: mockAccount ? { id: mockAccount } : null },
      }),
      getSession: async () => ({
        data: { session: mockAccount ? { user: { id: mockAccount } } : null },
      }),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void
      ) => {
        mockListeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => mockListeners.delete(listener) },
          },
        };
      },
    },
    from: (table: string) => {
      const chain: any = {
        select: (columns: string) => {
          // The conversation lookup of saveMessage selects only its id.
          if (table === 'conversations') {
            mockCalls.push({
              as: mockAccount,
              table,
              kind: 'select',
              withContext: false,
            });
            return chain;
          }
          const call: Call = {
            as: mockAccount,
            table,
            kind: 'select',
            withContext: columns.includes('companion_context'),
          };
          mockCalls.push(call);
          chain.order = () =>
            call.withContext
              ? mockContextReply()
              : Promise.resolve({
                  data: [{ id: 1, role: 'user', content: 'A only' }],
                  error: null,
                });
          return chain;
        },
        eq: () => chain,
        single: async () => ({ data: { id: 7 }, error: null }),
        insert: (row: Record<string, unknown>) => {
          const call: Call = {
            as: mockAccount,
            table,
            kind: 'insert',
            withContext: 'companion_context' in row,
          };
          mockCalls.push(call);
          return call.withContext
            ? mockContextReply()
            : Promise.resolve({ error: null });
        },
      };
      return chain;
    },
  },
}));

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
function emit(account: string | null, event: string) {
  mockAccount = account;
  for (const listener of [...mockListeners])
    listener(event, account ? { user: { id: account } } : null);
}

let stop: () => void = () => {};
beforeEach(async () => {
  mockAccount = 'fallback-a';
  mockCalls.splice(0);
  mockContextReply.mockReset();
  stop = subscribeAccount(() => {});
  await flush();
  expect(ownAccountWork().accountId).toBe('fallback-a');
});
afterEach(() => stop());

/** Holds the next companion_context request until the returned function answers it. */
function holdContextReply() {
  let answer: (value: unknown) => void = () => {};
  mockContextReply.mockImplementationOnce(
    () => new Promise(resolve => (answer = resolve))
  );
  return (value: unknown) => answer(value);
}

const settle = (p: Promise<unknown>) =>
  p.then(
    value => ({ value, error: null as unknown }),
    error => ({ value: null, error })
  );

// While the first request is held, the account that started the read stops
// being the established signed-in account.
const lostOwnership = [
  ['another account signs in', () => emit('fallback-b', 'SIGNED_IN')],
  ['the account signs out', () => emit(null, 'SIGNED_OUT')],
  ['the session becomes unknown', () => stop()],
] as const;

describe('the thread read retries without companion_context only for its account', () => {
  it.each(lostOwnership)(
    'when %s during the first read, no retry is requested',
    async (_name, lose) => {
      const answer = holdContextReply();
      const reading = settle(
        getConversationMessages('private-a-thread', ownAccountWork())
      );
      await flush();
      expect(mockCalls).toEqual([
        { as: 'fallback-a', table: 'messages', kind: 'select', withContext: true },
      ]);

      lose();
      answer(missingColumn);
      const result = await reading;

      expect(mockCalls).toHaveLength(1);
      expect(result.error).toMatchObject({ name: 'AccountChangedError' });
    }
  );

  it('positive control: a token refresh of the same account keeps the retry', async () => {
    const answer = holdContextReply();
    const reading = settle(
      getConversationMessages('private-a-thread', ownAccountWork())
    );
    await flush();

    emit('fallback-a', 'TOKEN_REFRESHED');
    answer(missingColumn);
    const result = await reading;

    expect(result.error).toBeNull();
    expect(result.value).toEqual([{ id: 1, role: 'user', content: 'A only' }]);
    expect(mockCalls).toEqual([
      { as: 'fallback-a', table: 'messages', kind: 'select', withContext: true },
      { as: 'fallback-a', table: 'messages', kind: 'select', withContext: false },
    ]);
  });
});

describe('the answer save retries without companion_context only for its account', () => {
  const save = () =>
    saveMessage({
      conversationIdentifier: 'private-a-thread',
      role: 'assistant',
      content: 'private answer for A',
      companionContext: { province: 'ON' },
      owner: ownAccountWork(),
    });

  it.each(lostOwnership)(
    'when %s during the first insert, no retry is requested',
    async (_name, lose) => {
      const answer = holdContextReply();
      const saving = settle(save());
      await flush();
      expect(mockCalls.at(-1)).toEqual({
        as: 'fallback-a',
        table: 'messages',
        kind: 'insert',
        withContext: true,
      });

      lose();
      answer(missingColumn);
      const result = await saving;

      expect(mockCalls.filter(c => c.kind === 'insert')).toHaveLength(1);
      expect(result.error).toMatchObject({ name: 'AccountChangedError' });
    }
  );

  it('positive control: a token refresh of the same account keeps the retry', async () => {
    const answer = holdContextReply();
    const saving = settle(save());
    await flush();

    emit('fallback-a', 'TOKEN_REFRESHED');
    answer(missingColumn);
    const result = await saving;

    expect(result.error).toBeNull();
    expect(mockCalls.filter(c => c.kind === 'insert')).toEqual([
      { as: 'fallback-a', table: 'messages', kind: 'insert', withContext: true },
      { as: 'fallback-a', table: 'messages', kind: 'insert', withContext: false },
    ]);
  });
});
