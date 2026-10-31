// R371-SPEC-01: real profile readers and query lifecycle with scripted SDK/HTTP boundaries.
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { scriptedServer } from '@/testSupport/companionActionsServer';
import { getArrivalStage } from '@/helpers/arrivalDate';
import { ProfilePanel } from '@/components/companion/tasks/ProfilePanel';
import { useTaskActionStore, useTaskProgress } from '@/hooks/companion/useTaskActions';
import { UserProvider, useCurrentUser } from '@/context/UserContext';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
let mockUserId = '';
const mockListeners = new Set<(event: string, session: unknown) => void>();
const mockProfiles = new Map<string, { province: string; arrivalDate: string; revision: number }>();
const mockReads: { table: string; columns: string; id: string; province?: string }[] = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function holdRead(columns: string) {
  const entered = deferred(), held = deferred();
  const gate = { columns, entered, held };
  mockHold = gate;
  return gate;
}
let mockHold: ReturnType<typeof holdRead> | null = null;
type MockReply = { data: Record<string, unknown> | null; error: null; count: number };
function mockFrom(table: string) {
  let columns = '*', id = '';
  async function read(): Promise<MockReply> {
    const profile = mockProfiles.get(id);
    mockReads.push({ table, columns, id, province: profile?.province });
    const data = table === 'users'
      ? { id, username: 'Synthetic', first_name: 'Synthetic', created_at: '2026-10-31', is_premium: false, permissions: 'user' }
      : table === 'user_onboarding_profiles' && profile
        ? { id, province: profile.province, arrival_date: profile.arrivalDate,
          stage: getArrivalStage(profile.arrivalDate), persona: 'skilled_worker', persona_other: null, city: 'Vancouver' }
        : null;
    if (table === 'user_onboarding_profiles' && mockHold && columns.startsWith(mockHold.columns)) {
      const gate = mockHold;
      mockHold = null;
      gate.entered.resolve();
      await gate.held.promise;
    }
    return { data, error: null, count: 0 };
  }
  const query = {
    select(value: string) { columns = value; return query; },
    eq(_field: string, value: string) { id = value; return query; },
    single: read,
    maybeSingle: read,
    then: (ok: (reply: MockReply) => unknown, fail: (reason: unknown) => unknown) => read().then(ok, fail),
  };
  return query;
}
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: mockUserId ? { id: mockUserId, email: 'synthetic@profile371.invalid' } : null } }),
    getSession: async () => ({ data: { session: mockUserId ? { user: { id: mockUserId, email: 'synthetic@profile371.invalid' }, access_token: `jwt-${mockUserId}` } : null } }),
    onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
      mockListeners.add(listener);
      return { data: { subscription: { unsubscribe: () => mockListeners.delete(listener) } } };
    },
  },
  from: (table: string) => mockFrom(table),
} }));
jest.mock('@/utils/analytics', () => ({ useAnalytics: () => ({ trackCompanionActionResult: () => {} }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '9.9.9', extra: {} } } }));

function Surface() {
  const view = useTaskProgress(), store = useTaskActionStore('companion');
  const { currentUser } = useCurrentUser();
  const onboarding = useOnboardingProfile(mockUserId || undefined);
  const [draft, setDraft] = useState('Keep the current settlement question');
  return <View>
    <TextInput accessibilityLabel='Message' value={draft} onChangeText={setDraft} />
    <Text>User province: {currentUser?.province ?? 'loading'}</Text>
    <Text>Onboarding province: {onboarding.data?.province ?? 'loading'}</Text>
    <ProfilePanel view={view} store={store} />
  </View>;
}
const clients: ReturnType<typeof createTestQueryClient>[] = [];
let server: ReturnType<typeof scriptedServer>;
const realFetch = global.fetch;
let accountCount = 0;
beforeEach(() => {
  mockUserId = `profile-reader-${++accountCount}`;
  mockProfiles.clear();
  mockProfiles.set(mockUserId, { province: 'British Columbia', arrivalDate: '2026-11-07', revision: 1 });
  mockReads.length = 0;
  mockHold = null;
  let proposal: Record<string, unknown> | null = null;
  server = scriptedServer({}, { override: body => {
    const profile = mockProfiles.get(mockUserId)!;
    if (body.action === 'read') return { status: 200, body: { tasks: [], details: [], steps: [], profile: {
      province: profile.province, arrival_date: profile.arrivalDate, city: 'Vancouver',
      revisions: { province: profile.revision, arrival_date: 1, city: 1 },
    } } };
    if (body.action === 'prepare') {
      proposal = { proposal_id: 'profile-reader-review', proposal_revision: 1, kind: 'profile_update', status: 'draft',
        operations: [body.operation], context: { field: 'province', value: profile.province, revision: profile.revision },
        source: null, previous_context: null, review_reason: null, receipt: null };
      return { status: 200, body: { proposal } };
    }
    if (body.action === 'proposal') return { status: 200, body: { proposal } };
    if (body.action === 'apply') {
      const before = profile.province;
      profile.province = body.operations[0].value;
      profile.revision++;
      const receipt = { operation_id: body.operation_id, operation_type: 'profile.update',
        created_at: '2026-10-31T06:00:00Z', kind: 'change', undo_of: null, task_ref: null,
        before_revision: profile.revision - 1, after_revision: profile.revision, undone_by: null,
        current: true, undoable: true, profile: { field: 'province', before, after: profile.province } };
      if (proposal) { proposal.status = 'applied'; proposal.receipt = receipt; }
      return { status: 200, body: { replayed: false, receipt } };
    }
  } });
  global.fetch = server.fetch as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  global.fetch = realFetch;
  mockHold?.held.resolve();
  mockHold = null;
});
async function mountSurface() {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  const client = createTestQueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><I18nextProvider i18n={i18n}><UserProvider><Surface /></UserProvider></I18nextProvider></QueryClientProvider>);
  await act(async () => { await Promise.resolve(); });
  return client;
}
async function saveProvince() {
  fireEvent.press(await screen.findByRole('button', { name: 'Edit province' }));
  fireEvent.changeText(screen.getByLabelText('Province'), 'Ontario');
  const review = screen.getByRole('button', { name: 'Review profile change' });
  await waitFor(() => expect(review.props.accessibilityState?.disabled).toBe(false));
  fireEvent.press(review);
  await screen.findByText('Current: British Columbia');
  expect(screen.getByText('Proposed: Ontario')).toBeTruthy();
  expect(server.writes()).toHaveLength(0);
  const save = screen.getByRole('button', { name: 'Save profile change' });
  await waitFor(() => expect(save.props.accessibilityState?.disabled).toBe(false));
  fireEvent.press(save);
  await screen.findByText('Changed province from British Columbia to Ontario');
  expect(mockProfiles.get(mockUserId)?.province).toBe('Ontario');
  expect(server.writes()).toHaveLength(1);
}

it.each([
  ['UserContext', 'arrival_date, stage', 'User province: Ontario'],
  ['onboarding query', '*', 'Onboarding province: Ontario'],
])('rejects a delayed initial %s read after a profile save', async (_name, columns, expected) => {
  // False if the held old read enters the cache or the mounted consumer after the save.
  const gate = holdRead(columns);
  const client = await mountSurface();
  await gate.entered.promise;
  try {
    await saveProvince();
    await act(async () => { gate.held.resolve(); });
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(await screen.findByText('User province: Ontario')).toBeTruthy();
    expect(await screen.findByText('Onboarding province: Ontario')).toBeTruthy();
    expect(client.getQueryData<{ province: string }>(['userInfo', mockUserId])?.province).toBe('Ontario');
    expect(client.getQueryData<{ province: string }>(['onboardingProfile', mockUserId])?.province).toBe('Ontario');
    expect(screen.getByLabelText('Message').props.value).toBe('Keep the current settlement question');
  } finally { gate.held.resolve(); }
});

it('replaces an older background profile read while keeping a same-account draft', async () => {
  // Cached reads are the control for the initial-read regression.
  const client = await mountSurface();
  await screen.findByText('User province: British Columbia');
  const gate = holdRead('arrival_date, stage');
  await act(async () => { void client.invalidateQueries({ queryKey: ['userInfo', mockUserId] }); });
  await gate.entered.promise;
  try {
    fireEvent.changeText(screen.getByLabelText('Message'), 'A newer draft typed during the read');
    await act(async () => {
      for (const listener of mockListeners) listener('TOKEN_REFRESHED', { user: { id: mockUserId, email: 'synthetic@profile371.invalid' }, access_token: `jwt-${mockUserId}` });
    });
    expect(screen.getByLabelText('Message').props.value).toBe('A newer draft typed during the read');
    await saveProvince();
    await act(async () => { gate.held.resolve(); });
    expect(await screen.findByText('User province: Ontario')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('A newer draft typed during the read');
  } finally { gate.held.resolve(); }
});

it('does not restart the previous account after cancellation finishes in a new session', async () => {
  // A late invalidation of A after B signs in disproves the asynchronous owner check.
  const client = await mountSurface();
  await screen.findByText('User province: British Columbia');
  const a = mockUserId;
  const entered = deferred(), held = deferred();
  const originalCancel = client.cancelQueries.bind(client);
  const cancellation = jest.spyOn(client, 'cancelQueries').mockImplementation((filters, options) => {
    const work = originalCancel(filters, options);
    if (filters?.queryKey?.[0] !== 'userInfo' || filters.queryKey[1] !== a) return work;
    return work.then(async () => { entered.resolve(); await held.promise; });
  });
  const invalidation = jest.spyOn(client, 'invalidateQueries');
  try {
    await saveProvince();
    await entered.promise;
    await act(async () => {
      mockUserId = 'profile-replacement-b';
      mockProfiles.set(mockUserId, { province: 'Quebec', arrivalDate: '2026-11-07', revision: 1 });
      for (const listener of mockListeners) listener('SIGNED_IN', { user: { id: mockUserId, email: 'synthetic@profile371.invalid' }, access_token: `jwt-${mockUserId}` });
    });
    await screen.findByText('User province: Quebec');
    const callsForA = () => invalidation.mock.calls.filter(([filters]) => filters?.queryKey?.[1] === a).length;
    const before = callsForA();
    await act(async () => { held.resolve(); });
    expect(callsForA()).toBe(before);
    expect(screen.getByText('User province: Quebec')).toBeTruthy();
    expect(client.getQueryData(['userInfo', a])).toBeUndefined();
  } finally { held.resolve(); cancellation.mockRestore(); invalidation.mockRestore(); }
});
