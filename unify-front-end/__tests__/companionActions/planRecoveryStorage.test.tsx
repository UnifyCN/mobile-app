import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '@/i18n/locales/en/translation.json';
import { PlanPanel } from '@/components/companion/plans/PlanPanel';
import { clearPlanStores, proposalKey } from '@/services/companionActions/planStore';
import { clearPlanRecoveryExcept } from '@/services/companionActions/planRecovery';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '33333333-3333-4333-8333-333333333333';
const OPERATION = '44444444-4444-4444-8444-444444444444';
const STORAGE_KEY = 'companion-plan-recovery-v1';
const mockState = { account: ACCOUNT, epoch: 0, requests: [] as Record<string, unknown>[] };
const mockTrack = () => {};

jest.mock('@/services/account/accountSession', () => ({
  accountSnapshot: () => ({ accountId: mockState.account, epoch: mockState.epoch }),
  ownAccountWork: () => ({ accountId: mockState.account, epoch: mockState.epoch }),
  stillOwned: (owner: { accountId: string | null; epoch: number }) =>
    owner.accountId === mockState.account && owner.epoch === mockState.epoch,
}));
jest.mock('@/hooks/auth/useSessionAccountId', () => ({
  useAccountSnapshot: () => ({ accountId: mockState.account, epoch: mockState.epoch }),
}));
jest.mock('@/hooks/companion/useTaskActions', () => ({
  useTaskProgress: () => ({ canWrite: true, stale: false }),
  useTaskActionAccount: () => mockState.account,
  TASK_PROGRESS_ROOT: 'task-progress',
}));
jest.mock('@/services/companionActions/transport', () => ({ mobileTransportFor: () => mockTransport }));
jest.mock('@/utils/analytics', () => ({ useAnalytics: () => ({ trackCompanionActionResult: mockTrack }) }));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const proposal = {
  plan_proposal_id: PROPOSAL,
  proposal_revision: 1,
  status: 'draft',
  kind: 'plan',
  goal: 'Review synthetic phone work',
  items: [{ kind: 'new', key: 'phone', title: 'Synthetic phone task', include: true }],
  change_count: 1,
  context: null,
  unresolved: [],
  tasks: [],
};
const retainedRecord = JSON.stringify({
  accountId: ACCOUNT,
  entries: {
    [proposalKey(PROPOSAL)]: {
      operationId: OPERATION,
      kind: 'apply',
      proposalId: PROPOSAL,
      proposalRevision: 1,
    },
  },
});
async function mockTransport(body: Record<string, unknown>) {
  mockState.requests.push(body);
  if (body.action === 'plan_proposal') return { status: 200, body: { plan_proposal: proposal } };
  if (body.action === 'plans') return { status: 200, body: { plans: [], drafts: [proposal] } };
  throw new Error('Controlled unresolved operation');
}
const writes = () => mockState.requests.filter(request => request.action === 'plan_apply');
let queryClient: QueryClient | undefined;

beforeEach(async () => {
  clearPlanStores();
  mockState.requests = [];
  mockState.epoch++;
  await AsyncStorage.removeItem(STORAGE_KEY);
});
afterEach(async () => {
  cleanup();
  queryClient?.clear();
  clearPlanStores();
  jest.restoreAllMocks();
  await clearPlanRecoveryExcept(null, () => true);
});

it('preserves an unresolved operation through a temporary cleanup read failure before reopening its panel', async () => {
  // Falsifier: cleanup loses the original reference or the reopened panel permits an unproved write.
  await AsyncStorage.setItem(STORAGE_KEY, retainedRecord);
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Temporary read failure'));
  await clearPlanRecoveryExcept(ACCOUNT, () => true);

  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'en', resources: { en: { translation: en } }, initImmediate: false,
    interpolation: { escapeValue: false },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <PlanPanel target={{ proposalId: PROPOSAL }} onOpenTask={() => {}} />
      </I18nextProvider>
    </QueryClientProvider>
  );
  await screen.findByText('Synthetic phone task');
  await waitFor(() => expect(screen.queryByText(en.taskActions.checking)).toBeNull());
  const approval = screen.getByRole('button', { name: 'Approve and add 1 task' });
  if (!approval.props.accessibilityState?.disabled) {
    fireEvent.press(approval);
    await waitFor(() => expect(writes()).toHaveLength(1));
  }
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(retainedRecord);
  expect(approval.props.accessibilityState?.disabled).toBe(true);
  await screen.findByText(en.taskActions.lookupFailed);
  expect(writes()).toHaveLength(0);

  fireEvent.press(screen.getByRole('button', { name: en.taskActions.checkAgain }));
  await waitFor(() => expect(mockState.requests.filter(request => request.action === 'plan_status')).toHaveLength(1));
  expect(mockState.requests.find(request => request.action === 'plan_status')?.operation_id).toBe(OPERATION);
  expect(writes()).toHaveLength(0);
});
