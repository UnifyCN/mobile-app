// #371. Real local Auth, authenticated actions and profile persistence. RNTL is not native input proof.
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { randomUUID } from 'crypto';
import en from '@/i18n/locales/en/translation.json';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { ProfilePanel } from '@/components/companion/tasks/ProfilePanel';
import { useTaskActionStore, useTaskProgress } from '@/hooks/companion/useTaskActions';
import { useChecklistProfile } from '@/hooks/checklist/useChecklistProfile';

const API = process.env.ACTIONS_API_URL ?? '';
const ANON = process.env.ACTIONS_ANON_KEY ?? '';
const SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? '';
const enabled = API === 'http://127.0.0.1:64510' && Boolean(ANON && SERVICE);
if (API && !enabled) throw new Error('Profile test requires its assigned local service');
if (enabled && (process.env.ACTIONS_DB_CONTAINER !== 'supabase_db_unify-profile-371-r1' ||
  process.env.ACTIONS_REST_CONTAINER !== 'supabase_rest_unify-profile-371-r1')) throw new Error('Profile containers must match');
process.env.EXPO_PUBLIC_SUPABASE_URL = API;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;
let mockUser = { id: '', jwt: '' };
const mockListeners = new Set<(event: string, session: unknown) => void>();
const mockTrack = jest.fn();
jest.mock('@/utils/analytics', () => ({ useAnalytics: () => ({ trackCompanionActionResult: mockTrack }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '9.9.9', extra: {} } } }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: mockUser.id ? { id: mockUser.id } : null } }),
    getSession: async () => ({ data: { session: mockUser.id ? { user: { id: mockUser.id }, access_token: mockUser.jwt } : null } }),
    onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
      mockListeners.add(listener); return { data: { subscription: { unsubscribe: () => mockListeners.delete(listener) } } };
    },
  },
  from: (table: string) => {
    let columns = '*', id = '';
    const query = {
      select: (value: string) => { columns = value; return query; },
      eq: (_field: string, value: string) => { id = value; return query; },
      maybeSingle: async () => {
        const r = await mockHttp(`/rest/v1/${table}?select=${encodeURIComponent(columns)}&id=eq.${id}`, undefined, mockUser.jwt, 'GET');
        return { data: r.status === 200 ? r.json[0] ?? null : null, error: r.status === 200 ? null : r.json };
      },
    };
    return query;
  },
} }));
const originalFetch = global.fetch;
async function mockHttp(path: string, body?: unknown, jwt = ANON, method = 'POST') {
  const response = await originalFetch(API + path, { method,
    headers: { apikey: ANON, authorization: 'Bearer '+jwt, 'content-type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  return { status: response.status, json: raw ? JSON.parse(raw) : null };
}
const created: string[] = [];
async function account(province: string) {
  const email = 'profile-rntl-'+randomUUID()+'@profile371.invalid', password = 'synthetic-profile-password-371';
  const user = await mockHttp('/auth/v1/admin/users', { email, password, email_confirm: true }, SERVICE);
  expect(user.status).toBe(200); created.push(user.json.id);
  const signed = await mockHttp('/auth/v1/token?grant_type=password', { email, password });
  expect(signed.status).toBe(200);
  const profile = await mockHttp('/rest/v1/user_onboarding_profiles', { id: user.json.id, province, arrival_date: '2026-11-07' }, signed.json.access_token);
  expect(profile.status).toBe(201);
  return { id: user.json.id as string, jwt: signed.json.access_token as string };
}
function Surface() {
  const view = useTaskProgress(), store = useTaskActionStore('companion');
  const checklist = useChecklistProfile();
  const [draft, setDraft] = useState('Question kept during profile review');
  return <View><TextInput accessibilityLabel='Message' value={draft} onChangeText={setDraft} />
    <Text>Checklist province: {checklist.province ?? 'unknown'}</Text>
    <ProfilePanel view={view} store={store} /></View>;
}
async function mountSurface() {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  const query = createTestQueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={query}><I18nextProvider i18n={i18n}><Surface /></I18nextProvider></QueryClientProvider>);
}
afterEach(async () => {
  global.fetch = originalFetch;
  for (const id of created.splice(0)) expect((await mockHttp('/auth/v1/admin/users/'+id, undefined, SERVICE, 'DELETE')).status).toBe(200);
});
(enabled ? it : it.skip)('371 local: rendered review saves the authoritative profile, refreshes the Checklist reader, preserves drafts and survives a new view', async () => {
  // Wrong if the review differs from persistence, Checklist keeps the old province, or a new view loses the saved value.
  mockUser = await account('British Columbia');
  const app = await mountSurface();
  await screen.findByText('Checklist province: British Columbia');
  fireEvent.press(await screen.findByRole('button', { name: 'Edit province' }));
  fireEvent.changeText(screen.getByLabelText('Province'), 'Ontario');
  fireEvent.press(screen.getByRole('button', { name: 'Review profile change' }));
  expect(await screen.findByText('Current: British Columbia')).toBeTruthy();
  expect(screen.getByText('Proposed: Ontario')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Save profile change' }));
  expect(await screen.findByText('Changed province from British Columbia to Ontario')).toBeTruthy();
  expect(await screen.findByText('Checklist province: Ontario')).toBeTruthy();
  expect(screen.getByLabelText('Message').props.value).toBe('Question kept during profile review');
  const saved = await mockHttp('/rest/v1/user_onboarding_profiles?select=province&id=eq.'+mockUser.id, undefined, mockUser.jwt, 'GET');
  expect(saved.json).toEqual([{ province: 'Ontario' }]);
  app.unmount(); await mountSurface();
  expect(await screen.findByText('Checklist province: Ontario')).toBeTruthy();
}, 30000);
(enabled ? it : it.skip)('371 local: a late prepared response cannot restore the previous account; token refresh keeps valid typed work', async () => {
  // Wrong if A's reviewed values appear for B or a same-session refresh discards the current draft.
  const a = await account('British Columbia'), b = await account('Quebec'); mockUser = a;
  await mountSurface(); await screen.findByText('Checklist province: British Columbia');
  fireEvent.press(screen.getByRole('button', { name: 'Edit province' }));
  fireEvent.changeText(screen.getByLabelText('Province'), 'Ontario');
  await act(async () => { for (const l of mockListeners) l('TOKEN_REFRESHED', { user: { id: a.id }, access_token: a.jwt }); });
  expect(screen.getByLabelText('Province').props.value).toBe('Ontario');
  let release!: () => void, entered!: () => void;
  const hold = new Promise<void>(r => release=r), ready = new Promise<void>(r => entered=r);
  global.fetch = (async (input, init) => {
    if (String(input).endsWith('/companion-actions') && JSON.parse(String(init?.body)).action === 'prepare') {
      const reply = await originalFetch(input, init); entered(); await hold; return reply;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  fireEvent.press(screen.getByRole('button', { name: 'Review profile change' }));
  await ready;
  await act(async () => { mockUser=b; for (const l of mockListeners) l('SIGNED_IN', { user: { id: b.id }, access_token: b.jwt }); });
  await screen.findByText('Checklist province: Quebec');
  await act(async () => release());
  await waitFor(() => expect(screen.queryByText('Current: British Columbia')).toBeNull());
  expect(screen.queryByLabelText('Province')).toBeNull();
  const saved = await mockHttp('/rest/v1/user_onboarding_profiles?select=province&id=eq.'+b.id, undefined, b.jwt, 'GET');
  expect(saved.json).toEqual([{ province: 'Quebec' }]);
}, 30000);
