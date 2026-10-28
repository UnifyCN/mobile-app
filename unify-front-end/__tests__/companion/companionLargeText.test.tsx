// Native large-text layout of the Companion screen (#359 native follow-ups N1, N2).
// The real Companion screen, its task entry and its real starter cards, mounted with the
// text size the system reports (Dimensions fontScale), changed live without a remount.
//
// What this proves: which container each piece of content lives in (a clipped, scrollable
// region or not), the declared bar-label scaling and that a live size change keeps the
// mounted screen and the typed message. It does not prove native geometry, touch or text
// measurement: those are checked on the iOS simulator (DOCS/companion-actions/evidence/
// native-layout-r1).
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { Dimensions, StyleSheet } from 'react-native';
import en from '@/i18n/locales/en/translation.json';
import { scriptedServer } from '@/testSupport/companionActionsServer';

type ReactTestInstance = ReturnType<typeof screen.getByText>;

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59371';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mockUserId = 'user-1';
let mockMessages: unknown[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => {
        const cleanup = callback();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [callback]);
    },
    useIsFocused: () => true,
  };
});
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const identity = (value: unknown) => value;
  const fade = { duration: () => undefined };
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: identity,
    Easing: { out: identity, in: identity, cubic: identity },
    runOnJS: identity,
    interpolate: identity,
    Extrapolate: { CLAMP: 'clamp' },
    FadeIn: fade,
    FadeOut: fade,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity } = require('react-native');
  const gesture: any = {
    onUpdate: () => gesture,
    onEnd: () => gesture,
    enabled: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
    TouchableOpacity,
  };
});
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return {
    KeyboardAvoidingView: View,
    useReanimatedKeyboardAnimation: () => ({
      height: { value: 0 },
      progress: { value: 0 },
    }),
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Feather: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '9.9.9', extra: {} } },
}));
const mockPostHog = { capture: () => {}, screen: () => {} };
jest.mock('posthog-react-native', () => ({ usePostHog: () => mockPostHog }));
jest.mock('@/context/HapticsContext', () => ({
  useHapticsPreference: () => ({ hapticsEnabled: false }),
}));
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: { id: mockUserId, isPremium: false },
    refreshUser: jest.fn(),
  }),
}));
jest.mock('@/hooks/companion/useConversationMessages', () => ({
  useConversationMessages: () => ({ data: mockMessages, isLoading: false }),
}));
jest.mock('@/hooks/companion/useChatbotUsage', () => ({
  useChatbotUsage: () => ({ data: { message_count: 0 } }),
}));
jest.mock('@/hooks/companion/useCompanionReviewPrompt', () => ({
  useCompanionReviewPrompt: () => {},
}));
jest.mock('@/hooks/companion/usePersonalizedStarters', () => ({
  usePersonalizedStarters: () => ({ data: undefined }),
}));
jest.mock('@/hooks/companion/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: jest.fn(),
    isLoading: false,
    isWaitingForBot: false,
    lastSuggestedNextSteps: [],
    lastVerified: null,
    streamingBotMessage: null,
  }),
}));
jest.mock('@/utils/gemini', () => ({
  AICompanionBusyError: class extends Error {},
  AICompanionLimitError: class extends Error {},
}));
jest.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/components/companion/AnimatedDottedBackground', () => ({
  AnimatedDottedBackground: () => null,
}));
jest.mock('@/components/companion/MessageWithSources', () => {
  const { Text } = require('react-native');
  return {
    MessageWithSources: ({ item }: { item: { text: string } }) => <Text>{item.text}</Text>,
  };
});
jest.mock('@/components/companion/PartnerSpotlightBanner', () => () => null);
jest.mock('@/components/icons/SendIcon.svg', () => () => null);
jest.mock('lucide-react-native', () => ({ History: () => null, Plus: () => null }));
jest.mock('@/components/common/BottomSheet', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } } }),
      getSession: async () => ({
        data: {
          session: { user: { id: mockUserId }, access_token: `jwt-${mockUserId}` },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));
jest.mock('@/services/onboarding/getOnboardingProfile', () => ({
  getOnboardingProfile: jest.fn(async () => ({ province: 'British Columbia' })),
}));
jest.mock('@/sanity-custom', () => ({ sanityClient: { fetch: jest.fn(async () => []) } }));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: jest.fn().mockResolvedValue([]),
}));

import CompanionScreen from '@/app/(tabs)/companion/index';
import CompanionHeader from '@/components/CompanionHeader';
import { TabIcon } from '@/components/navigation/TabIcon';
import { getTabBarHeight, BAR_LABEL_MAX_SCALE } from '@/utils/textScale';
import { TAB_HEADER_METRICS } from '@/constants/TabHeader';

// iOS content size multipliers that React Native reports (RCTFontSizeMultiplier).
const DEFAULT = 1;
const XXXL = 1.353;
const AX_MEDIUM = 1.786;
const AX_XXXL = 3.12;

function setFontScale(fontScale: number) {
  const window = { width: 393, height: 852, scale: 3, fontScale };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
}

function testI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return i18n;
}

const clients: QueryClient[] = [];
function renderScreen() {
  const client = createTestQueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={testI18n()}>
        <CompanionScreen />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

/** Host scroll containers above a node, innermost first. */
function scrollAncestors(node: ReactTestInstance) {
  const found: ReactTestInstance[] = [];
  for (let p = node.parent; p; p = p.parent) {
    if (typeof p.type === 'string' && p.type === 'RCTScrollView') found.push(p);
  }
  return found;
}
const isVertical = (scroll: ReactTestInstance) => !scroll.props.horizontal;
/** The vertical scroll region that clips and scrolls a node, if any. */
const verticalScrollOf = (node: ReactTestInstance) =>
  scrollAncestors(node).find(isVertical) ?? null;

const realFetch = global.fetch;
let userCounter = 0;
beforeEach(() => {
  mockUserId = `layout-user-${++userCounter}`;
  mockMessages = [];
  const server = scriptedServer({ 'custom:1': { state: 'in_progress', revision: 1 } });
  global.fetch = server.fetch as unknown as typeof fetch;
  setFontScale(DEFAULT);
});
afterEach(() => {
  // Unmount first, so no query of this screen (and its 5 s retry of a failed read)
  // outlives the test and its scripted network.
  cleanup();
  global.fetch = realFetch;
  clients.splice(0).forEach(client => {
    client.clear();
    client.unmount();
  });
});

describe('N1: the empty welcome never draws over the task entry', () => {
  it.each([
    ['default', DEFAULT],
    ['XXXL', XXXL],
    ['accessibility medium', AX_MEDIUM],
    ['AX XXXL', AX_XXXL],
  ])('at %s text, the welcome is inside a vertical scroll region below the entry', async (_, scale) => {
    setFontScale(scale);
    renderScreen();
    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    const welcome = screen.getByText(en.companion.welcomeTitle);
    const region = verticalScrollOf(welcome);
    // Before the correction the welcome sat in a plain, unclipped View: when the
    // bottom section took the height, it overflowed upward onto "Your tasks" and its
    // touch area took the tap.
    expect(region).not.toBeNull();
    // The entry is either above that region (default sizes) or the first item in it
    // (large text). In both cases it is never painted under the welcome.
    const entryRegion = verticalScrollOf(entry);
    if (entryRegion) expect(entryRegion).toBe(region);
  });
});

describe('N2: at accessibility text sizes content reflows into one scroll', () => {
  it.each([
    ['accessibility medium', AX_MEDIUM],
    ['AX XXXL', AX_XXXL],
  ])('at %s, entry, welcome and starters scroll together; the composer stays pinned', async (_, scale) => {
    setFontScale(scale);
    renderScreen();
    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    const welcome = screen.getByText(en.companion.welcomeTitle);
    const startersLabel = screen.getByText(en.companion.tryOneOfThese);
    const factCheck = screen.getByText(en.companion.starters.factCheck);
    const region = verticalScrollOf(welcome)!;
    expect(region).not.toBeNull();
    for (const node of [entry, startersLabel, factCheck]) {
      expect(verticalScrollOf(node)).toBe(region);
    }
    // Starter cards stack vertically at full width: no horizontal strip of fixed-width
    // cards that breaks words letter by letter.
    expect(scrollAncestors(factCheck).some(s => s.props.horizontal)).toBe(false);
    const composer = screen.getByPlaceholderText(en.companion.inputPlaceholder);
    expect(verticalScrollOf(composer)).toBeNull();
    // The disclaimer follows the content instead of pinning several lines of large
    // text under the composer, where it took the conversation's height.
    expect(verticalScrollOf(screen.getByText(en.companion.disclaimer))).toBe(region);
  });

  it('at default text, the existing direction-B layout stays: a horizontal starter strip above the composer', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Your tasks/ });
    const factCheck = screen.getByText(en.companion.starters.factCheck);
    expect(scrollAncestors(factCheck)[0].props.horizontal).toBe(true);
    expect(verticalScrollOf(factCheck)).toBeNull();
    expect(verticalScrollOf(screen.getByRole('button', { name: /Your tasks/ }))).toBeNull();
    expect(verticalScrollOf(screen.getByText(en.companion.disclaimer))).toBeNull();
  });

  it('in a populated conversation at AX XXXL, the entry scrolls with the messages', async () => {
    mockMessages = [
      { id: 1, role: 'user', content: 'Which bank should I use?', created_at: '2026-10-27T10:00:00Z' },
      { id: 2, role: 'assistant', content: 'Compare the newcomer accounts.', created_at: '2026-10-27T10:00:05Z' },
    ];
    setFontScale(AX_XXXL);
    renderScreen();
    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    const message = await screen.findByText('Compare the newcomer accounts.');
    expect(verticalScrollOf(entry)).not.toBeNull();
    expect(verticalScrollOf(entry)).toBe(verticalScrollOf(message));
    expect(verticalScrollOf(screen.getByText(en.companion.disclaimer))).toBe(
      verticalScrollOf(message)
    );
  });

  it('in a populated conversation at default text, the entry stays fixed above the messages', async () => {
    mockMessages = [
      { id: 1, role: 'user', content: 'Which bank should I use?', created_at: '2026-10-27T10:00:00Z' },
    ];
    renderScreen();
    const entry = await screen.findByRole('button', { name: /Your tasks/ });
    await screen.findByText('Which bank should I use?');
    expect(verticalScrollOf(entry)).toBeNull();
    expect(verticalScrollOf(screen.getByText(en.companion.disclaimer))).toBeNull();
  });
});

describe('N2: the welcome title scales like a title, not like body text', () => {
  it('uses the iOS Title 1 ramp, so a long word still fits at AX XXXL', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Your tasks/ });
    const title = screen.getByText(en.companion.welcomeTitle);
    // 28 pt is Title 1's default size: the default rendering is unchanged.
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(28);
    expect(title.props.dynamicTypeRamp).toBe('title1');
  });
});

// Fabric keeps the old measurement of mounted text that React does not re-create after
// a live size change (React's next commit re-uses its older shadow nodes). The static text
// blocks are created again; the screen, composer and draft stay mounted.
describe('N2: a live size change measures the static text again', () => {
  it('re-creates welcome, entry, header and starter text but keeps the composer and draft', async () => {
    setFontScale(AX_MEDIUM);
    renderScreen();
    await screen.findByRole('button', { name: /Your tasks/ });
    const composer = screen.getByPlaceholderText(en.companion.inputPlaceholder);
    fireEvent.changeText(composer, 'Where do I get a SIN?');
    const before = [
      screen.getByText(en.companion.welcomeTitle),
      screen.getByText(en.companion.welcomeCaption),
      screen.getByText(en.taskActions.entryTitle),
      screen.getByText(en.companion.title),
      screen.getByText(en.companion.starters.factCheck),
      screen.getByText(en.companion.disclaimer),
    ];
    // Same layout mode (both large): only the size changes.
    setFontScale(AX_XXXL);
    const after = [
      screen.getByText(en.companion.welcomeTitle),
      screen.getByText(en.companion.welcomeCaption),
      screen.getByText(en.taskActions.entryTitle),
      screen.getByText(en.companion.title),
      screen.getByText(en.companion.starters.factCheck),
      screen.getByText(en.companion.disclaimer),
    ];
    after.forEach((node, i) => expect(node).not.toBe(before[i]));
    expect(screen.getByPlaceholderText(en.companion.inputPlaceholder)).toBe(composer);
    expect(composer.props.value).toBe('Where do I get a SIN?');
  });

  it('keeps the composer mounted and sizes it for the current text size', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Your tasks/ });
    const composer = screen.getByPlaceholderText(en.companion.inputPlaceholder);
    const minHeight = () => StyleSheet.flatten(composer.props.style).minHeight;
    // One body line (24 pt) and 12 pt padding above and below: its natural height.
    expect(minHeight()).toBe(48);
    setFontScale(AX_MEDIUM);
    expect(screen.getByPlaceholderText(en.companion.inputPlaceholder)).toBe(composer);
    expect(minHeight()).toBe(Math.ceil(24 * AX_MEDIUM) + 24);
  });

  it('re-creates message rows in place, without a new list', async () => {
    mockMessages = [
      { id: 1, role: 'user', content: 'Which bank should I use?', created_at: '2026-10-27T10:00:00Z' },
    ];
    renderScreen();
    const message = await screen.findByText('Which bank should I use?');
    const list = verticalScrollOf(message);
    setFontScale(XXXL);
    const again = screen.getByText('Which bank should I use?');
    expect(again).not.toBe(message);
    expect(verticalScrollOf(again)).toBe(list);
  });
});

describe('N2: a live text-size change reflows the mounted screen', () => {
  it('switches layout without a remount and keeps the typed message', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Your tasks/ });
    const composer = screen.getByPlaceholderText(en.companion.inputPlaceholder);
    fireEvent.changeText(composer, 'Where do I get a SIN?');

    setFontScale(AX_XXXL);
    const factCheck = await screen.findByText(en.companion.starters.factCheck);
    expect(scrollAncestors(factCheck).some(s => s.props.horizontal)).toBe(false);
    const after = screen.getByPlaceholderText(en.companion.inputPlaceholder);
    // Same mounted input (no remount), same draft.
    expect(after).toBe(composer);
    expect(after.props.value).toBe('Where do I get a SIN?');

    setFontScale(DEFAULT);
    const back = await screen.findByText(en.companion.starters.factCheck);
    expect(scrollAncestors(back)[0].props.horizontal).toBe(true);
    expect(screen.getByPlaceholderText(en.companion.inputPlaceholder)).toBe(composer);
    expect(composer.props.value).toBe('Where do I get a SIN?');
  });
});

describe('N2: bar chrome (screen title, tab labels) follows UIKit bar scaling', () => {
  it('the header title keeps one line and stops at a size that fits the bar row', () => {
    render(<CompanionHeader title='Companion' showBackButton={false} />);
    const title = screen.getByText('Companion');
    expect(title.props.maxFontSizeMultiplier).toBe(BAR_LABEL_MAX_SCALE);
    expect(title.props.numberOfLines).toBe(1);
    const { lineHeight } = StyleSheet.flatten(title.props.style);
    expect(lineHeight * BAR_LABEL_MAX_SCALE).toBeLessThanOrEqual(
      TAB_HEADER_METRICS.rowHeight
    );
  });

  it('a tab label keeps one line at the bar maximum and offers the large content viewer', () => {
    const Icon = () => null;
    render(<TabIcon IconComponent={Icon} title='Communauté' focused={false} />);
    const label = screen.getByText('Communauté');
    expect(label.props.maxFontSizeMultiplier).toBe(BAR_LABEL_MAX_SCALE);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
    const tab = screen.getByTestId('tab-icon');
    expect(tab.props.accessibilityShowsLargeContentViewer).toBe(true);
    expect(tab.props.accessibilityLargeContentTitle).toBe('Communauté');
  });

  it('the tab bar grows with its label up to the bar maximum', () => {
    expect(getTabBarHeight(0, DEFAULT)).toBe(68);
    expect(getTabBarHeight(34, DEFAULT)).toBe(102);
    const atMax = getTabBarHeight(34, BAR_LABEL_MAX_SCALE);
    expect(atMax).toBeGreaterThan(102);
    expect(getTabBarHeight(34, AX_XXXL)).toBe(atMax);
    expect(getTabBarHeight(34, 0.823)).toBe(102);
  });
});
