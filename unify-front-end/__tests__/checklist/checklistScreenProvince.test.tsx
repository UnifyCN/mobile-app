import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockProfileProvince: string | null = 'Ontario';
let mockUserId = 'user-0';
let mockLatestFocus: (() => void) | null = null;
const mockPush = jest.fn();
let mockDocuments: any[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void) => {
      mockLatestFocus = callback;
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
  };
});

jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

jest.mock('react-native-gesture-handler', () => ({
  TouchableOpacity: require('react-native').TouchableOpacity,
}));

jest.mock('react-native-draggable-flatlist', () => ({
  __esModule: true,
  default: ({ data, renderItem, ListHeaderComponent, ListFooterComponent }: any) =>
    require('react').createElement(
      require('react-native').View,
      null,
      ListHeaderComponent,
      data.map((item: any, index: number) =>
        require('react').createElement(
          require('react').Fragment,
          { key: item.key },
          renderItem({ item, drag: () => {}, isActive: false, getIndex: () => index })
        )
      ),
      ListFooterComponent
    ),
  ScaleDecorator: ({ children }: any) => children,
}));

jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/HapticsContext', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: false }),
}));
jest.mock('@/utils/analytics', () => {
  const analytics = {
    trackScreen: jest.fn(),
    trackChecklistTaskCompleted: jest.fn(),
    trackChecklistTaskUncompleted: jest.fn(),
    trackChecklistCustomTaskDeleted: jest.fn(),
  };
  return { useAnalytics: () => analytics };
});
jest.mock('@/hooks/onboarding/useUserStage', () => ({
  useUserStage: () => ({
    currentStage: 1,
    stageChanged: false,
    isLoading: false,
  }),
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } } }),
      getSession: async () => ({
        data: { session: { user: { id: mockUserId } } },
      }),
    },
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: jest.fn(async () => ({
    persona: 'international_student',
    province: mockProfileProvince,
  })),
}));
jest.mock('@/sanity-custom', () => ({ sanityClient: { fetch: jest.fn() } }));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
  deleteCustomChecklistTask: jest.fn(),
  setCustomChecklistTaskCompletion: jest.fn(),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: jest.fn().mockResolvedValue([]),
  upsertChecklistTaskOrder: jest.fn(),
}));
jest.mock('@/services/checklist/setChecklistItemCompletion', () => ({
  setChecklistItemCompletion: jest.fn(),
}));
jest.mock('@/services/checklist/setChecklistItemDismissed', () => ({
  setChecklistItemDismissed: jest.fn(),
}));

// Presentational children are stubbed to the one control this test needs.
jest.mock('@/components/home/HomeHeader', () => () => null);
jest.mock('@/components/LoadingScreen', () => () => null);
jest.mock('@/components/checklist/ChecklistSectionHeader', () => ({
  ChecklistSectionHeader: () => null,
}));
jest.mock('@/components/checklist/ChecklistItem', () => ({
  ChecklistItem: ({ task, onPress }: any) =>
    require('react').createElement(
      require('react-native').Pressable,
      { onPress, accessibilityLabel: `task ${task.task.task_name}` },
      null
    ),
}));
jest.mock('@/components/checklist/TaskDetailModal', () => ({
  TaskDetailModal: ({ visible, onLearnHow }: any) =>
    visible
      ? require('react').createElement(
          require('react-native').Pressable,
          { onPress: onLearnHow, accessibilityLabel: 'learn how' },
          null
        )
      : null,
}));

import { sanityClient } from '@/sanity-custom';
import ChecklistScreen from '@/app/(tabs)/Checklist/index';

const mockFetch = sanityClient.fetch as jest.Mock;
const fetchedProvinces = () => mockFetch.mock.calls.map(call => call[1].province);

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <ChecklistScreen />
    </QueryClientProvider>
  );
  return { ...view, client };
}

let userCounter = 0;

const clients: QueryClient[] = [];
afterEach(() => {
  // Query garbage-collection timers would keep the Jest process alive.
  clients.splice(0).forEach(client => client.clear());
});

describe('Checklist screen and the profile province', () => {
  beforeEach(() => {
    mockUserId = `user-${++userCounter}`;
    mockProfileProvince = 'Ontario';
    mockPush.mockReset();
    mockLatestFocus = null;
    mockDocuments = [
      {
        _id: 'plain',
        _type: 'checklist',
        title: 'Get a SIN',
        class: 'do_now',
        class_order: 1,
      },
    ];
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => mockDocuments);
  });

  const settle = () =>
    act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
    });

  it('fetches the checklist for the profile province on mount', async () => {
    renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await settle();
    expect(new Set(fetchedProvinces())).toEqual(new Set(['Ontario']));
  });

  it('fetches with the new province, never the old one, when the profile changed before the tab is focused again', async () => {
    renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await settle();
    const callsBefore = mockFetch.mock.calls.length;

    mockProfileProvince = 'British Columbia';
    await act(async () => {
      mockLatestFocus!();
    });
    await waitFor(() =>
      expect(fetchedProvinces()).toContain('British Columbia')
    );
    await settle();
    expect(new Set(fetchedProvinces().slice(callsBefore))).toEqual(
      new Set(['British Columbia'])
    );
  });

  it('refetches with the same province when the profile is unchanged', async () => {
    renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await settle();
    const callsBefore = mockFetch.mock.calls.length;

    await act(async () => {
      mockLatestFocus!();
    });
    await waitFor(() =>
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore)
    );
    expect(new Set(fetchedProvinces())).toEqual(new Set(['Ontario']));
  });

  describe('"Learn how" on a national task linked to a BC module', () => {
    beforeEach(() => {
      mockDocuments = [
        {
          _id: 'join-group',
          _type: 'checklist',
          title: 'Join your school group',
          class: 'do_now',
          class_order: 1,
          module: { _id: 'sfu', title: 'SFU', province: 'British Columbia' },
        },
      ];
    });

    it('opens the Learn tab for an Ontario user', async () => {
      renderScreen();
      fireEvent.press(await screen.findByLabelText('task Join your school group'));
      fireEvent.press(screen.getByLabelText('learn how'));
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/Learn');
    });

    it('opens the module for a BC user', async () => {
      mockProfileProvince = 'British Columbia';
      renderScreen();
      fireEvent.press(await screen.findByLabelText('task Join your school group'));
      fireEvent.press(screen.getByLabelText('learn how'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ params: { moduleId: 'sfu', origin: 'checklist' } })
      );
    });
  });
});
