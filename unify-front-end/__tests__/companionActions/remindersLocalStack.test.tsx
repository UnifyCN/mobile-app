// Push SDK setup is outside these retained in-app reminder assertions.
jest.mock('@/components/companion/tasks/CompanionPushControl', () => ({ CompanionPushControl: () => null }));
// Rendered reminder controls and real local Auth/JWT/action persistence.
// This is RNTL evidence, not native device or screen-reader evidence.
import React, { useEffect, useState } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';
import { randomUUID } from 'crypto';
import en from '@/i18n/locales/en/translation.json';
import {
  createTaskActionClient,
  type TaskActionClient,
} from '@/services/companionActions/client';
import { TaskActionStore } from '@/services/companionActions/taskActionStore';
import {
  ReminderSection,
  ReminderList,
} from '@/components/companion/tasks/ReminderSection';
import type { TaskProgressView } from '@/hooks/companion/useTaskActions';
const mockReact = React;
const API = process.env.ACTIONS_API_URL ?? '',
  ANON = process.env.ACTIONS_ANON_KEY ?? '',
  SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? '';
const enabled = API === 'http://127.0.0.1:63081' && Boolean(ANON && SERVICE);
if (API && !enabled)
  throw new Error(
    'Reminder live test requires its exact owned loopback API and keys'
  );
if (
  enabled &&
  (process.env.ACTIONS_DB_CONTAINER !== 'supabase_db_unify-reminders-368-r1' ||
    process.env.ACTIONS_REST_CONTAINER !==
      'supabase_rest_unify-reminders-368-r1')
)
  throw new Error(
    'Exact owned reminder DB and REST container names are required'
  );
const actualFetch =
  (globalThis as typeof globalThis & { __realFetch?: typeof fetch })
    .__realFetch ?? global.fetch;
let mockOwner = { accountId: '', epoch: 0 };
let mockClient: TaskActionClient;
let mockStore: TaskActionStore;
let mockTaskRef = '';
let mockRefresh = async () => {};
jest.mock('@/services/account/accountSession', () => ({
  stillOwned: (owner: { accountId: string; epoch: number }) =>
    owner.accountId === mockOwner.accountId && owner.epoch === mockOwner.epoch,
}));
jest.mock('@/hooks/companion/useTaskActions', () => ({
  useTaskActionClient: () => ({ client: mockClient, owner: mockOwner }),
  useTaskActionDraft: (store: TaskActionStore, key: string) =>
    mockReact.useSyncExternalStore(
      store.subscribe,
      () => store.draft(key),
      () => undefined
    ),
  useTaskActionPhase: (store: TaskActionStore, key: string) =>
    mockReact.useSyncExternalStore(
      store.subscribe,
      () => store.get(key),
      () => store.get(key)
    ),
}));
const users: string[] = [];
async function http(
  path: string,
  body?: unknown,
  jwt = ANON,
  key = ANON,
  method = 'POST'
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await actualFetch(API + path, {
      method,
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: 'Bearer ' + jwt,
        Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null };
  } finally {
    clearTimeout(timer);
  }
}
async function account() {
  const email = 'reminder-rntl-' + randomUUID() + '@reminder368.invalid',
    password = 'reminder-rntl-password-1';
  const created = await http(
    '/auth/v1/admin/users',
    { email, password, email_confirm: true },
    SERVICE,
    SERVICE
  );
  expect(created.status).toBe(200);
  users.push(created.json.id);
  const signed = await http('/auth/v1/token?grant_type=password', {
    email,
    password,
  });
  expect(signed.status).toBe(200);
  return {
    id: created.json.id as string,
    jwt: signed.json.access_token as string,
  };
}
function clientFor(jwt: string) {
  return createTaskActionClient({
    platform: 'ios',
    appVersion: 'reminder-local-test',
    transport: async body => {
      const r = await http('/functions/v1/companion-actions', body, jwt);
      return { status: r.status, body: r.json };
    },
  });
}
function Panel() {
  const [view, setView] = useState<TaskProgressView>({
    status: 'loading',
    byRef: new Map(),
    stepsByRef: new Map(),
    details: [],
    stale: false,
    canWrite: false,
    readAt: 0,
    refetch: () => {},
  });
  useEffect(() => {
    let cancelled = false;
    mockRefresh = async () => {
      const r = await mockClient.read();
      if (!cancelled && r.kind === 'ok')
        setView({
          status: 'ready',
          byRef: new Map(r.tasks.map(t => [t.taskRef, t])),
          stepsByRef: new Map(),
          details: r.details,
          reminders: r.reminders,
          stale: false,
          canWrite: true,
          readAt: Date.now(),
          refetch: () => void mockRefresh(),
        });
    };
    void mockRefresh();
    const timer = setInterval(() => void mockRefresh(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <ReminderList view={view} onOpen={mockOpen} />
      <ReminderSection taskRef={mockTaskRef} view={view} store={mockStore} />
    </>
  );
}
const mockOpen = jest.fn();
afterEach(() => cleanup());
afterAll(async () => {
  if (enabled)
    for (const id of users) {
      const deleted = await http(
        '/auth/v1/admin/users/' + id,
        undefined,
        SERVICE,
        SERVICE,
        'DELETE'
      );
      expect([200, 204]).toContain(deleted.status);
    }
});
(enabled ? it : it.skip)(
  'reviews and saves a reminder, observes actual Cron due state, opens the same task and stops it through its own receipt',
  async () => {
    const containers = JSON.parse(
      execFileSync(
        'docker',
        [
          'inspect',
          '--type',
          'container',
          ...['db', 'auth', 'rest', 'kong', 'edge_runtime'].map(
            n => 'supabase_' + n + '_unify-reminders-368-r1'
          ),
        ],
        { encoding: 'utf8' }
      )
    ) as {
      Config: { Labels: Record<string, string>; Env: string[] };
      Name: string;
      State: { Running: boolean };
    }[];
    for (const c of containers) {
      expect(c.Config.Labels['com.supabase.cli.project']).toBe(
        'unify-reminders-368-r1'
      );
      expect(c.Config.Labels['com.supabase.cli.workdir']).toBe(
        realpathSync(
          process.env.ACTIONS_STACK_WORKDIR ??
            '/Users/savargupta/.t3/worktrees/Unify/t3-abe3435e/DOCS/companion-actions/evidence/368-reminders-r1/.runtime/supabase/tests/companion-actions'
        )
      );
      expect(c.State.Running).toBe(true);
      if (c.Name.includes('edge_runtime'))
        expect(c.Config.Env).toContain(
          'COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:3385/content'
        );
    }
    const owner = await account(),
      foreign = await account();
    mockOwner = { accountId: owner.id, epoch: 0 };
    mockClient = clientFor(owner.jwt);
    const task = await http(
      '/rest/v1/custom_checklist_tasks',
      {
        user_id: owner.id,
        title: 'Synthetic rendered reminder task',
        priority: 'Do soon',
      },
      owner.jwt
    );
    expect(task.status).toBe(201);
    mockTaskRef = 'custom:' + task.json[0].id;
    mockStore = new TaskActionStore({
      client: mockClient,
      newOperationId: randomUUID,
      onChanged: () => void mockRefresh(),
    });
    const i18n = createInstance();
    void i18n.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: en } },
      initImmediate: false,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <Panel />
      </I18nextProvider>
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.reminders.review })
      ).toBeEnabled()
    );
    const time = new Date(Date.now() + 15000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    fireEvent.changeText(screen.getByLabelText(en.reminders.instant), time);
    fireEvent.changeText(screen.getByLabelText(en.reminders.zone), 'Etc/UTC');
    fireEvent.press(screen.getByRole('button', { name: en.reminders.review }));
    fireEvent.press(
      await screen.findByRole(
        'button',
        { name: en.reminders.save },
        { timeout: 10000 }
      )
    );
    await screen.findByText(en.reminders.saved, {}, { timeout: 10000 });
    await waitFor(
      () =>
        expect(screen.getAllByText(en.reminders.due).length).toBeGreaterThan(0),
      { timeout: 90000 }
    );
    fireEvent.press(
      screen.getByRole('button', { name: en.reminders.openTask })
    );
    expect(mockOpen).toHaveBeenCalledWith(
      mockTaskRef,
      'Synthetic rendered reminder task'
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: en.taskActions.undo })
      ).toBeEnabled()
    );
    fireEvent.press(screen.getByRole('button', { name: en.taskActions.undo }));
    fireEvent.press(
      screen.getByRole('button', { name: en.reminders.confirmUndo })
    );
    await waitFor(async () => {
      const r = await mockClient.read();
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect(
          r.reminders?.items.find(x => x.taskRef === mockTaskRef)?.status
        ).toBe('cancelled');
        expect(r.tasks.find(x => x.taskRef === mockTaskRef)?.state).toBe(
          'not_started'
        );
        expect(r.tasks.find(x => x.taskRef === mockTaskRef)?.revision).toBe(
          task.json[0].revision
        );
      }
    });
    const theirs = await clientFor(foreign.jwt).read();
    expect(theirs.kind).toBe('ok');
    if (theirs.kind === 'ok') expect(theirs.reminders?.items).toEqual([]);
  },
  120000
);
