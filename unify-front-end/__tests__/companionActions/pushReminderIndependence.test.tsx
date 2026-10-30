// The actual reminder editor, action client/store and new device control render together.
// Device SDK/service states are stand-ins. The assertions inspect saved reminder requests.
let mockPushPhase = 'off';
jest.mock('@/hooks/companion/useCompanionPush', () => ({
  useCompanionPushDevice: () => ({
    view: { phase: mockPushPhase, permission: 'denied', receiptSaved: false },
    locale: 'en',
    device: {
      enable: jest.fn(),
      disable: jest.fn(),
      refresh: jest.fn(),
      check: jest.fn(),
      retry: jest.fn(),
      revoke: jest.fn(),
    },
  }),
}));
// Rendered React Native controls. No device or screen-reader proof.
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en/translation.json';
import {
  createTaskActionClient,
  type TaskActionClient,
  type TransportReply,
} from '@/services/companionActions/client';
import { TaskActionStore } from '@/services/companionActions/taskActionStore';
import {
  ReminderSection,
  ReminderList,
} from '@/components/companion/tasks/ReminderSection';
import type { TaskProgressView } from '@/hooks/companion/useTaskActions';
const mockReact = React;
let mockBound: unknown = null;
let mockAccount = 'a';
let mockEpoch = 0;
const noteAccount = (id: string) => {
  if (mockAccount !== id) mockEpoch++;
  mockAccount = id;
};
const ownAccountWork = () => ({ accountId: mockAccount, epoch: mockEpoch });
jest.mock('@/services/account/accountSession', () => ({
  ownAccountWork: () => ({ accountId: mockAccount, epoch: mockEpoch }),
  stillOwned: (owner: { accountId: string; epoch: number }) =>
    owner.accountId === mockAccount && owner.epoch === mockEpoch,
}));
jest.mock('@/hooks/companion/useTaskActions', () => ({
  useTaskActionClient: () => mockBound,
  useTaskActionDraft: (store: TaskActionStore | null, key: string) =>
    mockReact.useSyncExternalStore(
      store?.subscribe ?? (() => () => {}),
      () => store?.draft(key),
      () => undefined
    ),
  useTaskActionPhase: (store: TaskActionStore | null, key: string) =>
    mockReact.useSyncExternalStore(
      store?.subscribe ?? (() => () => {}),
      () => store!.get(key),
      () => store!.get(key)
    ),
  progressFor: (ref: string, view: TaskProgressView) =>
    view.byRef.get(ref) ?? {
      taskRef: ref,
      state: 'not_started',
      revision: 0,
      removed: false,
      waitingReason: null,
      lastReceipt: null,
    },
}));
function testI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: en } },
    initImmediate: false,
  });
  return i18n;
}
let calls: Record<string, unknown>[];
let client: TaskActionClient;
let store: TaskActionStore;
let override: (
  body: Record<string, unknown>
) => TransportReply | Promise<TransportReply> | undefined;
const receipt = (id: string) => ({
  operation_id: id,
  created_at: '2026-10-29T00:00:00Z',
  kind: 'change',
  operation_type: 'reminder.schedule',
  task_ref: 'sanity:1',
  before_state: 'not_started',
  after_state: 'not_started',
  after_revision: 0,
  undone_by: null,
  undo_of: null,
  current: true,
  undoable: true,
  reminder: {
    reminder_id: 'reminder-1',
    remind_at: '2027-11-07T01:30:00-04:00',
    time_zone: 'America/New_York',
    scheduling: 'registered',
  },
});
const view = (): TaskProgressView => ({
  status: 'ready',
  readAt: Date.now(),
  byRef: new Map(),
  stepsByRef: new Map(),
  details: [],
  stale: false,
  canWrite: true,
  refetch: jest.fn(),
  reminders: { items: [], scheduler: 'ready' },
});
const mount = (v = view(), s = store) =>
  render(
    <I18nextProvider i18n={testI18n()}>
      <ReminderSection taskRef='sanity:1' view={v} store={s} />
    </I18nextProvider>
  );
beforeEach(() => {
  calls = [];
  override = () => undefined;
  noteAccount('a');
  client = createTaskActionClient({
    platform: 'web',
    appVersion: 'test',
    transport: async body => {
      calls.push(body);
      const result = override(body);
      if (result) return result;
      if (body.action === 'prepare')
        return {
          status: 200,
          body: {
            proposal: {
              proposal_id: 'proposal-1',
              proposal_revision: 2,
              kind: 'reminder',
              status: 'draft',
              operations: [body.operation],
            },
          },
        };
      if (body.action === 'apply')
        return {
          status: 200,
          body: { receipt: receipt(String(body.operation_id)) },
        };
      return { status: 200, body: { status: 'not_applied' } };
    },
  });
  mockBound = { client, owner: ownAccountWork() };
  let i = 0;
  store = new TaskActionStore({
    client,
    newOperationId: () => `operation-${++i}`,
    onChanged: () => {},
  });
});
afterEach(() => cleanup());
function fill() {
  fireEvent.changeText(
    screen.getByLabelText('Date and time with UTC offset'),
    '2027-11-07T01:30-04:00'
  );
  fireEvent.changeText(screen.getByLabelText('Time zone'), 'America/New_York');
}

it.each([
  'off',
  'denied',
  'unsupported',
  'serviceDisabled',
  'unknown',
  'unavailable',
])(
  'saving an in-app reminder stays independent while push is %s',
  async phase => {
    mockPushPhase = phase;
    mount();
    fill();
    fireEvent.press(screen.getByRole('button', { name: en.reminders.review }));
    fireEvent.press(
      await screen.findByRole('button', { name: en.reminders.save })
    );
    await screen.findByText(en.reminders.saved);
    expect(calls.map(b => b.action)).toEqual(['prepare', 'apply']);
    const operations = calls
      .filter(b => b.action === 'apply')
      .flatMap(b => b.operations as any[]);
    expect(operations.map(o => o.type)).toEqual(['reminder.schedule']);
    expect(screen.getByLabelText(en.reminders.instant).props.value).toBe(
      '2027-11-07T01:30-04:00'
    );
  }
);
it.each([
  'off',
  'denied',
  'unsupported',
  'serviceDisabled',
  'unknown',
  'unavailable',
])(
  'cancelling an in-app reminder stays independent while push is %s',
  async phase => {
    mockPushPhase = phase;
    const v = view();
    v.reminders!.items = [
      {
        reminderId: 'reminder-1',
        taskRef: 'sanity:1',
        title: 'Synthetic reminder',
        remindAt: '2027-11-07T01:30:00-04:00',
        timeZone: 'America/New_York',
        wallTime: '2027-11-07T01:30:00',
        revision: 1,
        status: 'pending',
        due: false,
        dueAt: null,
        cancelledReason: null,
        history: [],
      },
    ];
    override = b =>
      b.action === 'apply'
        ? {
            status: 200,
            body: {
              receipt: {
                ...receipt(String(b.operation_id)),
                operation_type: 'reminder.cancel',
                reminder: { ...receipt('x').reminder, scheduling: 'stopped' },
              },
            },
          }
        : undefined;
    mount(v);
    fireEvent.press(screen.getByRole('button', { name: en.reminders.cancel }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: en.reminders.cancel })
      ).toHaveLength(2)
    );
    const cancel = screen.getAllByRole('button', { name: en.reminders.cancel });
    fireEvent.press(cancel[cancel.length - 1]);
    fireEvent.press(
      await screen.findByRole('button', { name: en.reminders.confirmCancel })
    );
    await screen.findByText(en.reminders.stopped);
    expect(calls.map(b => b.action)).toEqual(['prepare', 'apply']);
    expect(
      calls
        .filter(b => b.action === 'apply')
        .flatMap(b => b.operations as any[])
        .map(o => o.type)
    ).toEqual(['reminder.cancel']);
  }
);
