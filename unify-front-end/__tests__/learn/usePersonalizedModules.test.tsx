import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';

let mockProvince: string | null = null;
let mockUserLoading = false;
let mockSanityModules: any[] = [];
let mockProgressRows: { module_id: string; status: string }[] = [];
let mockEdgeResponse: ((init: RequestInit) => Promise<any>) | null = null;

jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: mockUserLoading ? null : { province: mockProvince },
    isLoading: mockUserLoading,
  }),
}));

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));

jest.mock('@/services/sanity/modules', () => ({
  getAllModulesWithSubmodules: jest.fn(async () => mockSanityModules),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: mockProgressRows, error: null }),
      }),
    }),
  },
}));

import { usePersonalizedModules } from '@/hooks/learn/usePersonalizedModules';

const BC = 'British Columbia';

// Fixture content. `sfu` and `healthcare` are BC-only, `uofa` is Alberta-only,
// `newmod` and `newbc` have no learn_modules row yet (not ranked by the edge
// function).
const module = (id: string, province?: string) => ({
  _id: id,
  _type: 'module',
  title: id,
  province,
  submodules: [],
});
const ALL_MODULES = [
  module('banking'),
  module('sfu', BC),
  module('healthcare', BC),
  module('uofa', 'Alberta'),
  module('newmod'),
  module('newbc', BC),
];

const ranked = (...ids: string[]) =>
  ids.map((id, i) => ({
    sanity_id: id,
    title: id,
    score: 10 - i,
    progress: 'not_started',
    completed_at: null,
    why_tag: '',
  }));

function respondWith(modules: ReturnType<typeof ranked>) {
  mockEdgeResponse = async () => ({
    ok: true,
    json: async () => ({ learn: { modules } }),
  });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function setup() {
  const client = createTestQueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const hook = renderHook(() => usePersonalizedModules(), {
    wrapper: wrapperFor(client),
  });
  return { ...hook, client };
}

const ids = (modules: any[] | undefined) => modules?.map(m => m._id);

const clients: QueryClient[] = [];
afterEach(() => {
  // Query garbage-collection timers would keep the Jest process alive.
  clients.splice(0).forEach(client => client.clear());
});

describe('Learn module list for a user in a province', () => {
  beforeEach(() => {
    mockProvince = null;
    mockUserLoading = false;
    mockSanityModules = ALL_MODULES;
    mockProgressRows = [];
    mockEdgeResponse = null;
    (global as any).fetch = jest.fn((_url: string, init: RequestInit) =>
      mockEdgeResponse!(init)
    );
  });

  it('keeps BC modules out of an Ontario list after a successful ranking', async () => {
    mockProvince = 'Ontario';
    respondWith(ranked('banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
    expect(result.current.isPersonalized).toBe(true);
  });

  it('drops a ranked module that does not match the current province', async () => {
    mockProvince = 'Ontario';
    // A ranking cached while the user was in BC can still contain SFU.
    respondWith(ranked('sfu', 'banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
  });

  it('shows a BC user the BC modules in the ranked order', async () => {
    mockProvince = BC;
    respondWith(ranked('sfu', 'banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toEqual([
      'sfu',
      'banking',
      'healthcare',
      'newmod',
      'newbc',
    ]);
  });

  it('shows national modules only when no province is saved', async () => {
    mockProvince = null;
    respondWith(ranked('banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
  });

  it('shows national modules only for unmatched free text', async () => {
    mockProvince = 'Somewhere Else';
    respondWith(ranked('banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
  });

  it('keeps an authoritative empty ranking empty when only other-province modules exist', async () => {
    mockProvince = 'Ontario';
    mockSanityModules = [module('sfu', BC), module('healthcare', BC)];
    respondWith([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modules).toEqual([]);
  });

  it('keeps a successful empty ranking empty even with eligible national modules', async () => {
    mockProvince = 'Ontario';
    respondWith([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modules).toEqual([]);
    expect(result.current.isPersonalized).toBe(true);
  });

  it.each([BC, null])(
    'keeps a successful empty ranking empty for province %s',
    async province => {
      mockProvince = province;
      respondWith([]);
      const { result } = setup();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.modules).toEqual([]);
    }
  );

  it('does not restore a filtered module when the ranking is empty', async () => {
    mockProvince = 'Ontario';
    respondWith([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).not.toContain('sfu');
    expect(ids(result.current.modules)).not.toContain('healthcare');
    expect(ids(result.current.modules)).not.toContain('uofa');
    expect(ids(result.current.modules)).not.toContain('newbc');
  });

  it('falls back to eligible modules when the ranking request fails', async () => {
    mockProvince = 'Ontario';
    mockEdgeResponse = async () => ({ ok: false });
    mockProgressRows = [
      { module_id: 'sfu', status: 'in_progress' },
      { module_id: 'banking', status: 'completed' },
    ];
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPersonalized).toBe(false);
    expect(
      result.current.modules?.map(m => [m._id, m.progress])
    ).toEqual([
      ['banking', 'completed'],
      ['newmod', 'not_started'],
    ]);
  });

  it('shows only eligible modules while the ranking is still loading', async () => {
    mockProvince = 'Ontario';
    // A request that has not answered yet; it is released after the check so
    // the hook's 3 s abort timer is cleared.
    let release!: () => void;
    mockEdgeResponse = () =>
      new Promise(resolve => {
        release = () => resolve({ ok: false });
      });
    const { result } = setup();
    await waitFor(() => expect(result.current.modules).toBeDefined());
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
    await act(async () => release());
  });

  it('shows no province-tagged module while the user profile is loading', async () => {
    mockUserLoading = true;
    respondWith(ranked('sfu', 'banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.modules).toBeDefined());
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the saved progress of eligible modules the ranking left out', async () => {
    mockProvince = 'Ontario';
    mockProgressRows = [{ module_id: 'newmod', status: 'in_progress' }];
    respondWith(ranked('banking'));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() =>
      expect(
        result.current.modules?.find(m => m._id === 'newmod')?.progress
      ).toBe('in_progress')
    );
  });

  it('removes BC modules when the profile province changes to Ontario', async () => {
    mockProvince = BC;
    respondWith(ranked('sfu', 'banking'));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).toContain('sfu');

    mockProvince = 'Ontario';
    respondWith(ranked('banking'));
    rerender({});
    await waitFor(() =>
      expect(ids(result.current.modules)).not.toContain('sfu')
    );
    expect(ids(result.current.modules)).toEqual(['banking', 'newmod']);
  });

  it('adds BC modules when the profile province changes to British Columbia', async () => {
    mockProvince = 'Ontario';
    respondWith(ranked('banking'));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(ids(result.current.modules)).not.toContain('sfu');

    mockProvince = BC;
    respondWith(ranked('sfu', 'banking'));
    await act(async () => {
      rerender({});
    });
    await waitFor(() => expect(ids(result.current.modules)).toContain('sfu'));
  });
});
