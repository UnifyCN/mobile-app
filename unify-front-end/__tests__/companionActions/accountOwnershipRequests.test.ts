// Account ownership at the request boundary of the answer stream and the task
// action store (mobile-app#361, Spec round 4). The actual streamGeminiAPI, the
// actual task action client, store and mobile transport run against a scripted
// Supabase auth session and a scripted fetch. Each test holds the session read
// that sits between the caller's ownership check and the request, changes the
// signed-in account, and then releases it. This proves which requests the
// client starts; it is not evidence of SDK event order or server authorization.
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
import { streamGeminiAPI } from '@/utils/gemini';
import { createMobileTaskActionClient } from '@/services/companionActions/transport';
import {
  clearTaskActionStores,
  taskActionStoreFor,
} from '@/services/companionActions/taskActionStore';
import { scriptedServer } from '@/testSupport/companionActionsServer';
import { getConversations } from '@/services/companion/getConversations';
import { getConversationMessages } from '@/services/companion/getConversationMessages';

const mockStreamFetch = jest.fn();
let mockUserId = 'request-a';
const mockAuthListeners = new Set<(event: string, session: unknown) => void>();
const sessionOf = (id: string) => ({
  data: { session: { user: { id }, access_token: `jwt-${id}` } },
});
const mockGetSession = jest.fn(async () => sessionOf(mockUserId));
const mockGetUser = jest.fn(async () => ({
  data: { user: { id: mockUserId } },
}));
// Any table read is recorded with the account signed in when it was made.
const mockReads: { table: string; as: string }[] = [];
const mockFrom = (table: string) => {
  mockReads.push({ table, as: mockUserId });
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: async () => ({
      data: [{ conversation_identifier: 'c-x', title: 'x' }],
      error: null,
    }),
  };
  return chain;
};

jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockStreamFetch(...args),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '9.9.9',
      extra: { supabaseUrl: 'http://127.0.0.1:59371', supabaseAnonKey: 'anon' },
    },
  },
}));
jest.mock('@/i18n', () => {
  const i18n = require('i18next');
  return { __esModule: true, default: i18n.default ?? i18n };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void
      ) => {
        mockAuthListeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => mockAuthListeners.delete(listener),
            },
          },
        };
      },
    },
    from: (table: string) => mockFrom(table),
  },
}));

function signIn(userId: string, event = 'SIGNED_IN') {
  mockUserId = userId;
  for (const listener of [...mockAuthListeners])
    listener(event, sessionOf(userId).data.session);
}
/** The next session read waits until the returned function answers it. */
function holdSessionRead() {
  let answer: (userId: string) => void = () => {};
  mockGetSession.mockImplementationOnce(
    () => new Promise(r => (answer = id => r(sessionOf(id))))
  );
  return (userId: string) => answer(userId);
}
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

let unsubscribe: () => void = () => {};
let accountCounter = 0;
async function establish(userId: string) {
  mockUserId = userId;
  unsubscribe = subscribeAccount(() => {});
  await flush();
  expect(ownAccountWork().accountId).toBe(userId);
}

beforeEach(() => {
  accountCounter += 1;
  // A refused reply ends a stream that was sent; the tests count requests.
  mockStreamFetch.mockReset().mockResolvedValue({
    ok: false,
    status: 503,
    text: async () => '',
  });
  mockReads.splice(0);
  mockGetUser.mockReset();
  mockGetUser.mockImplementation(async () => ({
    data: { user: { id: mockUserId } },
  }));
  mockGetSession.mockReset();
  mockGetSession.mockImplementation(async () => sessionOf(mockUserId));
});
afterEach(() => unsubscribe());

describe('the answer stream request belongs to its account', () => {
  const callbacks = () => ({
    onMetadata: jest.fn(),
    onToken: jest.fn(),
    onComplete: jest.fn(),
    onError: jest.fn(),
  });

  it('a session read that ends after B signed in sends no A prompt', async () => {
    const a = `stream-a-${accountCounter}`;
    await establish(a);
    const owner = ownAccountWork();
    const answerRead = holdSessionRead();
    const cb = callbacks();
    const done = streamGeminiAPI('Private A prompt', 'c-a', [], cb, owner);

    signIn(`stream-b-${accountCounter}`);
    answerRead(`stream-b-${accountCounter}`);
    await done;

    expect(mockStreamFetch).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AccountChangedError' })
    );
  });

  it('a late session reply naming A does not send while B is signed in', async () => {
    const a = `stream-a-${accountCounter}`;
    await establish(a);
    const owner = ownAccountWork();
    const answerRead = holdSessionRead();
    const done = streamGeminiAPI(
      'Private A prompt',
      'c-a',
      [],
      callbacks(),
      owner
    );

    signIn(`stream-b-${accountCounter}`);
    answerRead(a);
    await done;

    expect(mockStreamFetch).not.toHaveBeenCalled();
  });

  it('positive control: a token refresh of A still sends with A token', async () => {
    const a = `stream-a-${accountCounter}`;
    await establish(a);
    const owner = ownAccountWork();
    const answerRead = holdSessionRead();
    const done = streamGeminiAPI('A prompt', 'c-a', [], callbacks(), owner);

    signIn(a, 'TOKEN_REFRESHED');
    answerRead(a);
    await done;

    expect(mockStreamFetch).toHaveBeenCalledTimes(1);
    expect(mockStreamFetch.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer jwt-${a}`
    );
  });
});

describe('task action requests belong to the account of their store', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const sentAs = (server: ReturnType<typeof scriptedServer>) =>
    server.fetch.mock.calls.map(call => ({
      action: JSON.parse((call[1] as { body: string }).body).action,
      as: (call[1] as unknown as { headers: Record<string, string> }).headers
        .authorization,
    }));
  const op = {
    type: 'task.set_state',
    version: 1,
    task_ref: 'sanity:sin',
    state: 'waiting',
    waiting_reason: 'Private A reason',
    expected_revision: 1,
  } as const;

  it("a session read that ends after B signed in does not send A's change as B", async () => {
    const a = `task-a-${accountCounter}`;
    const b = `task-b-${accountCounter}`;
    await establish(a);
    const server = scriptedServer({ 'sanity:sin': { revision: 1 } });
    global.fetch = server.fetch as unknown as typeof fetch;
    const store = taskActionStoreFor(a, {
      client: createMobileTaskActionClient(ownAccountWork()),
      newOperationId: () => `op-${accountCounter}`,
      onChanged: () => {},
    });
    const answerRead = holdSessionRead();
    const saving = store.setState(op as never);

    signIn(b);
    clearTaskActionStores(b);
    answerRead(b);
    await saving;

    expect(sentAs(server)).toEqual([]);
  });

  it('an unknown outcome after B signed in is not looked up as B', async () => {
    const a = `task-a-${accountCounter}`;
    const b = `task-b-${accountCounter}`;
    await establish(a);
    let dropReply: () => void = () => {};
    const server = scriptedServer({ 'sanity:sin': { revision: 1 } });
    const scripted = server.fetch;
    // The apply request waits; the test then drops its reply (network error).
    const held = jest.fn((url: string, init: { body: string }) =>
      JSON.parse(init.body).action === 'apply'
        ? new Promise(
            (_r, reject) => (dropReply = () => reject(new TypeError('offline')))
          )
        : scripted(url as never, init as never)
    );
    global.fetch = held as unknown as typeof fetch;
    const store = taskActionStoreFor(a, {
      client: createMobileTaskActionClient(ownAccountWork()),
      newOperationId: () => `op-${accountCounter}`,
      onChanged: () => {},
    });
    const saving = store.setState(op as never);
    await flush();
    expect(held).toHaveBeenCalledTimes(1);

    signIn(b);
    clearTaskActionStores(b);
    dropReply();
    await saving;
    await flush();

    expect(held.mock.calls.map(c => JSON.parse(c[1].body).action)).toEqual([
      'apply',
    ]);
  });

  it('positive control: a token refresh of A keeps the lookup of an unknown outcome', async () => {
    const a = `task-a-${accountCounter}`;
    await establish(a);
    let dropReply: () => void = () => {};
    const server = scriptedServer({ 'sanity:sin': { revision: 1 } });
    const scripted = server.fetch;
    const held = jest.fn((url: string, init: { body: string }) =>
      JSON.parse(init.body).action === 'apply'
        ? new Promise(
            (_r, reject) => (dropReply = () => reject(new TypeError('offline')))
          )
        : scripted(url as never, init as never)
    );
    global.fetch = held as unknown as typeof fetch;
    const store = taskActionStoreFor(a, {
      client: createMobileTaskActionClient(ownAccountWork()),
      newOperationId: () => `op-${accountCounter}`,
      onChanged: () => {},
    });
    const saving = store.setState(op as never);
    await flush();

    signIn(a, 'TOKEN_REFRESHED');
    dropReply();
    await saving;

    expect(held.mock.calls.map(c => JSON.parse(c[1].body).action)).toEqual([
      'apply',
      'status',
    ]);
    expect(
      (held.mock.calls[1][1] as unknown as { headers: Record<string, string> })
        .headers.authorization
    ).toBe(`Bearer jwt-${a}`);
  });
});

describe('conversation reads belong to the account of their entry', () => {
  /** The next user read waits until the returned function answers it. */
  function holdUserRead() {
    let answer: (userId: string) => void = () => {};
    mockGetUser.mockImplementationOnce(
      () => new Promise(r => (answer = id => r({ data: { user: { id } } })))
    );
    return (userId: string) => answer(userId);
  }

  it.each([
    ['history list', (owner: never) => getConversations(owner)],
    ['thread', (owner: never) => getConversationMessages('c-a', owner)],
  ])(
    'a %s read whose user read ends after B signed in reads nothing as B',
    async (_n, read) => {
      const a = `read-a-${accountCounter}`;
      const b = `read-b-${accountCounter}`;
      await establish(a);
      const owner = ownAccountWork();
      const answerUser = holdUserRead();
      const reading = (read as (o: unknown) => Promise<unknown>)(owner);

      signIn(b);
      answerUser(b);
      await expect(reading).rejects.toMatchObject({
        name: 'AccountChangedError',
      });
      expect(mockReads).toEqual([]);
    }
  );

  it('positive control: a token refresh of A still reads the list as A', async () => {
    const a = `read-a-${accountCounter}`;
    await establish(a);
    const owner = ownAccountWork();
    const answerUser = holdUserRead();
    const reading = getConversations(owner as never);

    signIn(a, 'TOKEN_REFRESHED');
    answerUser(a);
    await expect(reading).resolves.toHaveLength(1);
    expect(mockReads).toEqual([{ table: 'conversations', as: a }]);
  });
});
