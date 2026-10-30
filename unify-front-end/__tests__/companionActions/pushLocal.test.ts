// Opt-in real JWT + approved Edge + persisted readbacks. No SDK or provider send.
import { execFileSync } from 'child_process';
import { randomUUID, randomBytes } from 'crypto';
import { CompanionPushDevice } from '@/services/companionActions/pushDevice';
import { createPushClient } from '@/services/companionActions/pushClient';
import {
  ownAccountWork,
  subscribeAccount,
  accountSessionIdentity,
} from '@/services/account/accountSession';
import { mobileTransportFor } from '@/services/companionActions/transport';
const API = process.env.ACTIONS_API_URL ?? '',
  ANON = process.env.ACTIONS_ANON_KEY ?? '',
  SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.PUSH_CLIENT_LOCAL === '1';
if (
  enabled &&
  (API !== 'http://127.0.0.1:63610' ||
    !ANON ||
    !SERVICE ||
    process.env.ACTIONS_DB_CONTAINER !==
      'supabase_db_unify-push-369-client-r1' ||
    process.env.ACTIONS_REST_CONTAINER !==
      'supabase_rest_unify-push-369-client-r1')
)
  throw new Error('Exact owned loopback project required');
let mockSession: any = null;
const mockListeners = new Set<(e: string, s: unknown) => void>();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
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
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '9.9.9',
      extra: {
        supabaseUrl: process.env.ACTIONS_API_URL,
        supabaseAnonKey: process.env.ACTIONS_ANON_KEY,
      },
    },
  },
}));
const actualFetch = (
  globalThis as typeof globalThis & { __realFetch?: typeof fetch }
).__realFetch;
const users: string[] = [];
async function http(
  path: string,
  body?: unknown,
  jwt = ANON,
  key = ANON,
  method = 'POST'
) {
  if (!actualFetch) throw new Error('Native fetch preloader required');
  const r = await actualFetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: 'Bearer ' + jwt,
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function account() {
  const email = 'push-client-' + randomUUID() + '@369.invalid',
    password = randomBytes(24).toString('hex');
  const a = await http(
    '/auth/v1/admin/users',
    { email, password, email_confirm: true },
    SERVICE,
    SERVICE
  );
  expect(a.status).toBe(200);
  users.push(a.body.id);
  const s = await http('/auth/v1/token?grant_type=password', {
    email,
    password,
  });
  expect(s.status).toBe(200);
  return s.body;
}
function sign(session: any) {
  mockSession = session;
  for (const cb of mockListeners)
    cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
}
function sql(statement: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_unify-push-369-client-r1',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: statement, encoding: 'utf8' }
  ).trim();
}
let stop: () => void = () => {};
let originalFetch = global.fetch;
afterAll(async () => {
  stop();
  global.fetch = originalFetch;
  if (enabled)
    for (const id of users)
      expect([200, 204]).toContain(
        (
          await http(
            '/auth/v1/admin/users/' + id,
            undefined,
            SERVICE,
            SERVICE,
            'DELETE'
          )
        ).status
      );
});
(enabled ? it : it.skip)(
  'client enables, reconciles a lost reply, rotates, disables, isolates and resolves current delivery access',
  async () => {
    console.log(
      'FALSIFIER: wrong project identity, duplicate revision on lost reply, foreign access, failed persisted disable or obsolete target resolution.'
    );
    const cs = JSON.parse(
      execFileSync(
        'docker',
        [
          'inspect',
          ...['db', 'rest', 'auth', 'kong', 'edge_runtime'].map(
            k => 'supabase_' + k + '_unify-push-369-client-r1'
          ),
        ],
        { encoding: 'utf8' }
      )
    );
    for (const c of cs) {
      expect(c.Config.Labels['com.supabase.cli.project']).toBe(
        'unify-push-369-client-r1'
      );
      expect(c.State.Running).toBe(true);
    }
    global.fetch = actualFetch!;
    const a = await account(),
      b = await account();
    mockSession = a;
    stop = subscribeAccount(() => {});
    await Promise.resolve();
    await Promise.resolve();
    const owner = ownAccountWork();
    expect(owner.accountId).toBe(a.user.id);
    expect(accountSessionIdentity()).toBeTruthy();
    const installation = randomUUID(),
      secret = randomBytes(32).toString('hex');
    let secure: string | null = null,
      token = 'ExpoPushToken[synthetic369-client-' + randomUUID() + ']';
    const requests: Record<string, any>[] = [];
    let lose = true;
    const client = (captured = ownAccountWork()) =>
      createPushClient({
        owner: captured,
        platform: 'ios',
        appVersion: '9.9.9',
        transport: async body => {
          requests.push(body);
          const r = await mobileTransportFor(captured)(body);
          if (lose && body.action === 'push_apply') {
            lose = false;
            throw new TypeError('Synthetic dropped reply after commit');
          }
          return r;
        },
      });
    const device = new CompanionPushDevice({
      read: async () => secure,
      write: async v => {
        secure = v;
      },
      permission: async () => 'granted',
      token: async () => token,
      proof: () => ({
        installation_id: installation,
        installation_secret: secret,
      }),
      uuid: randomUUID,
      session: accountSessionIdentity,
      client,
    });
    await device.enable('en');
    expect(device.snapshot().phase).toBe('unknown');
    const first = requests[0];
    expect(
      sql(
        `select revision from companion_push_private.enrollments where installation_id='${installation}'`
      )
    ).toBe('1');
    await device.check('en');
    expect(device.snapshot().phase).toBe('on');
    expect(requests.filter(r => r.action === 'push_apply')).toHaveLength(1);
    // A client restart uses the same secure record and exact request, with no extra write.
    const saved = JSON.parse(secure!);
    expect(saved.pending).toBeNull();
    const replay = await client(owner).apply(first as any);
    expect(replay.kind).toBe('ok');
    expect(
      sql(
        `select revision from companion_push_private.enrollments where installation_id='${installation}'`
      )
    ).toBe('1');
    token = 'ExponentPushToken[synthetic369-rotated-' + randomUUID() + ']';
    await device.refresh('en');
    expect(device.snapshot().phase).toBe('on');
    await device.disable('en');
    expect(device.snapshot().phase).toBe('off');
    expect(
      sql(
        `select revision||':'||enabled from companion_push_private.enrollments where installation_id='${installation}'`
      )
    ).toBe('3:false');
    const retryInstallation = randomUUID(),
      retrySecret = randomBytes(32).toString('hex');
    let retrySecure: string | null = null,
      dropBefore = true;
    const exact: Record<string, any>[] = [];
    const retryDevice = new CompanionPushDevice({
      read: async () => retrySecure,
      write: async v => {
        retrySecure = v;
      },
      permission: async () => 'granted',
      token: async () =>
        'ExpoPushToken[synthetic369-retry-' + retryInstallation + ']',
      proof: () => ({
        installation_id: retryInstallation,
        installation_secret: retrySecret,
      }),
      uuid: randomUUID,
      session: accountSessionIdentity,
      client: captured =>
        createPushClient({
          owner: captured,
          platform: 'ios',
          appVersion: '9.9.9',
          transport: async body => {
            if (body.action === 'push_apply') {
              exact.push(body);
              if (dropBefore) {
                dropBefore = false;
                throw new TypeError('Synthetic loss before dispatch');
              }
            }
            return mobileTransportFor(captured)(body);
          },
        }),
    });
    await retryDevice.enable('en');
    expect(retryDevice.snapshot().phase).toBe('unknown');
    await retryDevice.check('en');
    expect(retryDevice.snapshot().phase).toBe('not_applied');
    await retryDevice.retry('en');
    expect(retryDevice.snapshot().phase).toBe('on');
    expect(exact.length).toBe(2);
    expect(JSON.stringify(exact[0]) === JSON.stringify(exact[1])).toBe(true);
    expect(
      sql(
        `select revision from companion_push_private.enrollments where installation_id='${retryInstallation}'`
      )
    ).toBe('1');
    const task = await http(
      '/rest/v1/custom_checklist_tasks',
      {
        user_id: a.user.id,
        title: 'Synthetic client delivery task',
        priority: 'Do soon',
      },
      a.access_token
    );
    expect(task.status).toBe(201);
    const taskRef = 'custom:' + task.body[0].id,
      reminder = randomUUID(),
      delivery = randomUUID();
    sql(
      `update public.custom_checklist_tasks set completed=true, completed_at=now() where id=${task.body[0].id};`
    );
    // Deliveries are fixture input only. No worker/provider send is started.
    sql(
      `insert into companion_push_private.deliveries(id,user_id,reminder_id,task_ref,installation_id,generation,token_id,state) select '${delivery}',user_id,'${reminder}','${taskRef}',installation_id,generation,token_id,'provider_accepted' from companion_push_private.enrollments where installation_id='${installation}';`
    );
    expect(await client().resolve(delivery, 'en')).toEqual({
      kind: 'ok',
      value: { target: 'available', task_ref: taskRef },
    });
    sign(b);
    expect(
      await client().read({
        installation_id: installation,
        installation_secret: secret,
      })
    ).toEqual({ kind: 'ok', value: { enrollment: null } });
    expect(await client().resolve(delivery, 'en')).toEqual({
      kind: 'ok',
      value: { target: 'unavailable' },
    });
    sign(a);
    sql(
      `update public.custom_checklist_tasks set removed_at=now() where id=${task.body[0].id};`
    );
    expect(await client().resolve(delivery, 'en')).toEqual({
      kind: 'ok',
      value: { target: 'unavailable' },
    });
    console.log(
      'Persisted readbacks: revision 1 after lost reply+status+replay; revision 3 disabled; completed available; foreign and removed unavailable. No provider call.'
    );
  },
  30000
);
