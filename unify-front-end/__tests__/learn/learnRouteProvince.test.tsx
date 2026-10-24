import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockProvince: string | null = null;
let mockUserLoading = false;
let mockParams: { moduleId?: string } = {};
let mockModuleProvinces: Record<string, string | null> = {};
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: () => null,
  useGlobalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

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
  getModuleProvince: jest.fn(async (id: string) =>
    id in mockModuleProvinces
      ? { found: true, province: mockModuleProvinces[id] }
      : { found: false, province: null }
  ),
}));

import LearnStackLayout from '@/app/(tabs)/Learn/_layout';

const BC = 'British Columbia';

function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <LearnStackLayout />
    </QueryClientProvider>
  );
}

const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });

const clients: QueryClient[] = [];
afterEach(() => {
  // Query garbage-collection timers would keep the Jest process alive.
  clients.splice(0).forEach(client => client.clear());
});

describe('Learn routes for a module tagged with a province', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockProvince = null;
    mockUserLoading = false;
    mockParams = {};
    mockModuleProvinces = {
      sfu: BC,
      banking: null,
      nationalEmpty: '',
    };
  });

  it('sends an Ontario user who opens the SFU module to the Learn tab', async () => {
    mockProvince = 'Ontario';
    mockParams = { moduleId: 'sfu' };
    renderLayout();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/Learn')
    );
  });

  it('sends a user with no province away from a BC module', async () => {
    mockProvince = null;
    mockParams = { moduleId: 'sfu' };
    renderLayout();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/Learn')
    );
  });

  it('lets a BC user open the SFU module', async () => {
    mockProvince = BC;
    mockParams = { moduleId: 'sfu' };
    renderLayout();
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(['banking', 'nationalEmpty'])(
    'lets an Ontario user open the national module %s',
    async moduleId => {
      mockProvince = 'Ontario';
      mockParams = { moduleId };
      renderLayout();
      await settle();
      expect(mockReplace).not.toHaveBeenCalled();
    }
  );

  it('leaves routes without a module, such as Resources, alone', async () => {
    mockProvince = 'Ontario';
    mockParams = {};
    renderLayout();
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('leaves a module that does not exist to the screen not-found state', async () => {
    mockProvince = 'Ontario';
    mockParams = { moduleId: 'missing' };
    renderLayout();
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('waits for the profile before deciding on a BC module', async () => {
    mockUserLoading = true;
    mockParams = { moduleId: 'sfu' };
    renderLayout();
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
