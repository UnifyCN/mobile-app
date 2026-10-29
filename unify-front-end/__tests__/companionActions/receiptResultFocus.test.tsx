// This checks the rendered native-event boundary. Real TalkBack speech needs a native run.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import { ReceiptBlock } from '@/components/companion/tasks/ReceiptBlock';
import type { TaskReceipt } from '@/services/companionActions/contract';
import type { TaskActionPhase } from '@/services/companionActions/taskActionStore';
import type { TaskProgressView } from '@/hooks/companion/useTaskActions';
import { TaskStatePanel } from '@/components/companion/tasks/TaskStatePanel';

jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
let mockTaskPhase: TaskActionPhase = { phase: 'idle' };
jest.mock('@/hooks/companion/useTaskActions', () => ({
  useTaskActionPhase: (_store: unknown, key: string) => key === 'custom:1' ? mockTaskPhase : { phase: 'idle' },
  useTaskActionDraft: () => undefined,
  useTaskActionClient: () => null,
  progressFor: (key: string, view: TaskProgressView) => view.byRef.get(key),
  stepsFor: (key: string, view: TaskProgressView) => view.stepsByRef.get(key) ?? [],
}));
jest.mock('@/services/account/accountSession', () => ({ stillOwned: () => false }));

const receipt = (operationType: 'task.remove' | 'task.restore', operationId = 'receipt-1'): TaskReceipt => ({
  operationId, operationType, title: 'Get a phone plan', createdAt: '2026-10-28T16:00:00Z',
  kind: operationType === 'task.remove' ? 'change' : 'undo', changes: [], undoOf: null,
  taskRef: 'custom:1', beforeState: 'waiting', afterState: 'waiting', afterRevision: 2,
  undoneBy: null, current: true, undoable: true, steps: null, stepsDone: null,
  stepsTotal: null, waitingReasons: null, detail: null, plans: [], stepsKept: 2,
  remindersStopped: 0,
});

function renderReceipt(value: TaskReceipt, focusResult: boolean) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } },
    interpolation: { escapeValue: false }, initImmediate: false });
  return render(
    <I18nextProvider i18n={i18n}>
      <ReceiptBlock receipt={value} storeKey='custom:1' store={null} canWrite {...{ focusResult }} />
    </I18nextProvider>, { createNodeMock: () => ({}) }
  );
}

it.each(['task.remove', 'task.restore'] as const)('focuses the exact %s result after layout, once, while retaining Undo', type => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  try {
    renderReceipt(receipt(type), true);
    focus.mockClear();
    const text = screen.getByText(type === 'task.remove' ? 'Removed from your Checklist: Get a phone plan' : 'Restored to your Checklist: Get a phone plan');
    const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } } };
    expect(text.props.accessible).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    fireEvent(text, 'layout', layout);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    fireEvent(text, 'layout', layout);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();
  } finally { focus.mockRestore(); }
});

it('does not move focus for a receipt opened as history', () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  try {
    renderReceipt(receipt('task.remove'), false);
    focus.mockClear();
    fireEvent(screen.getByText('Removed from your Checklist: Get a phone plan'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } },
    });
    expect(focus).not.toHaveBeenCalled();
  } finally { focus.mockRestore(); }
});

function panel() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } },
    interpolation: { escapeValue: false }, initImmediate: false });
  const view: TaskProgressView = {
    status: 'ready', byRef: new Map([['custom:1', {
      taskRef: 'custom:1', state: 'not_started', waitingReason: null,
      revision: 2, removed: true, lastReceipt: null,
    }]]), stepsByRef: new Map(), details: [], stale: false, canWrite: true,
    readAt: Number.MAX_SAFE_INTEGER, refetch: () => {},
  };
  return <I18nextProvider i18n={i18n}>
    <TaskStatePanel taskRef='custom:1' taskTitle='Get a phone plan' view={view} store={null} />
  </I18nextProvider>;
}

it('the Android panel keeps focus when reopened on its retained saved receipt', () => {
  const platform = Platform.OS;
  Platform.OS = 'android';
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  try {
    mockTaskPhase = { phase: 'saved', receipt: receipt('task.remove') };
    render(panel(), { createNodeMock: () => ({}) });
    focus.mockClear();
    fireEvent(screen.getByText('Removed from your Checklist: Get a phone plan'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } },
    });
    expect(focus).not.toHaveBeenCalled();
  } finally { Platform.OS = platform; focus.mockRestore(); }
});

it.each(['task.remove', 'task.restore'] as const)('the Android panel focuses a fresh %s result and sends no competing announcement', type => {
  const platform = Platform.OS;
  Platform.OS = 'android';
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  try {
    mockTaskPhase = { phase: 'idle' };
    const rendered = render(panel(), { createNodeMock: () => ({}) });
    focus.mockClear(); announce.mockClear();
    mockTaskPhase = { phase: 'saved', receipt: receipt(type) };
    rendered.rerender(panel());
    fireEvent(screen.getByText(type === 'task.remove' ? 'Removed from your Checklist: Get a phone plan' : 'Restored to your Checklist: Get a phone plan'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } },
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
  } finally { Platform.OS = platform; focus.mockRestore(); announce.mockRestore(); }
});
