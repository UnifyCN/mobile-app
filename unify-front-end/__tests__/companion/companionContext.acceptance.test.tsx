import React from 'react';
import { View, Linking } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import vi from '@/i18n/locales/vi/translation.json';
import es from '@/i18n/locales/es/translation.json';
import hi from '@/i18n/locales/hi/translation.json';
import ar from '@/i18n/locales/ar/translation.json';
import frCA from '@/i18n/locales/fr-CA/translation.json';
import pa from '@/i18n/locales/pa/translation.json';
import vancouverStream from './fixtures/rag-query-context-vancouver.sse.json';
import provinceConflict from './fixtures/rag-query-context-province-conflict.json';
import unavailable from './fixtures/rag-query-context-unavailable.json';

import { useSendMessage } from '@/hooks/companion/useSendMessage';
import { useConversationMessages } from '@/hooks/companion/useConversationMessages';
import { formatMessagesForUI } from '@/helpers/companion/messageHelpers';
import { MessageWithSources } from '@/components/companion/MessageWithSources';

// Spec UnifyCN/mobile-app#359, ticket #362: a Companion answer shows the
// context it used and the official pages it checked, while it streams and
// after the conversation is reopened, in a bottom sheet (direction B).
//
// Drives the real useSendMessage hook, streamGeminiAPI and SSE parser,
// saveMessage, getConversationMessages, formatMessagesForUI and
// MessageWithSources, composed the way the Companion screen composes them.
// The rag-query responses are the exact bodies the web repo's Deno handler
// test produces with controlled providers (copied from UnifyCN/web-app
// supabase/functions/rag-query/fixtures; the handler test fails there if they
// drift, this copy must be refreshed by hand). Stubbed: the network (expo/fetch
// returns the recorded stream), the Supabase client (an in-memory messages
// table, no RLS), analytics, usage, the bottom sheet animation and icons.

const mockDb = {
  messages: [] as Record<string, unknown>[],
  columnMissing: false,
};
const mockFetch = jest.fn();
const mockTrackResponse = jest.fn();
const mockTrackSent = jest.fn();

jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'anon' },
    },
  },
}));
jest.mock('@/i18n', () => {
  const i18n = require('i18next');
  return { __esModule: true, default: i18n.default ?? i18n };
});
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({
    trackCompanionMessageSent: mockTrackSent,
    trackCompanionResponseReceived: mockTrackResponse,
  }),
}));
jest.mock('@/hooks/companion/useChatbotUsage', () => ({
  useChatbotUsage: () => ({ data: undefined }),
}));
jest.mock('@/hooks/companion/useCreateConversation', () => ({
  useCreateConversation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/components/common/BottomSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? createElement(View, { testID: 'sheet' }, children) : null,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/components/companion/MarkdownText', () => {
  const { Text } = require('react-native');
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ text }: { text: string }) => createElement(Text, null, text),
    hexToRgba: () => 'rgba(0,0,0,0.1)',
  };
});
jest.mock('@/components/companion/SourceViewer', () => () => null);

function mockMissingColumn() {
  return {
    data: null,
    error: { code: '42703', message: 'column messages.companion_context does not exist' },
  };
}

jest.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    if (table === 'conversations') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { id: 7 }, error: null }),
      };
      return chain;
    }
    return {
      insert: async (values: Record<string, unknown>) => {
        if (mockDb.columnMissing && 'companion_context' in values) {
          return mockMissingColumn();
        }
        mockDb.messages.push({
          ...values,
          id: mockDb.messages.length + 1,
          created_at: `2026-10-25T17:3${mockDb.messages.length}:00Z`,
        });
        return { data: null, error: null };
      },
      select: (columns: string) => {
        const chain: any = {
          eq: () => chain,
          order: async () => {
            if (mockDb.columnMissing && columns.includes('companion_context')) {
              return mockMissingColumn();
            }
            return {
              data: mockDb.messages.map(row => {
                const copy = { ...row };
                if (!columns.includes('companion_context')) delete copy.companion_context;
                return copy;
              }),
              error: null,
            };
          },
        };
        return chain;
      },
    };
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'jwt-vancouver' } } }),
        getUser: async () => ({ data: { user: { id: 'user-vancouver' } } }),
      },
      from: builder,
    },
  };
});

const CONV = '11111111-1111-4111-8111-111111111111';
const QUESTION =
  'I arrive in Vancouver next week as a new permanent resident. What should I do first?';
const SIN_URL =
  'https://www.canada.ca/en/employment-social-development/services/sin.html';

type StreamEvent = { name: string; data: Record<string, unknown> };

/** The same events as an SSE body; pauses after `metadata` until released. */
function sseResponse(events: StreamEvent[], gate?: Promise<void>) {
  const encoder = new TextEncoder();
  const chunks = events.map(e =>
    encoder.encode(`event: ${e.name}\ndata: ${JSON.stringify(e.data)}\n\n`)
  );
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (index === 1 && gate) await gate;
          if (index >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[index++] };
        },
        releaseLock: () => undefined,
      }),
    },
  };
}

/** A JSON fixture body as the stream rag-query sends for it. */
function asStream(body: Record<string, any>): StreamEvent[] {
  return [
    {
      name: 'metadata',
      data: { queryType: body.queryType, disclaimer: body.disclaimer, context: body.context },
    },
    { name: 'token', data: { delta: body.answer } },
    { name: 'complete', data: { cleanAnswer: body.answer, topic: body.topic } },
  ];
}

let send: ReturnType<typeof useSendMessage>;

/** The Companion screen's composition: saved messages, then the live bubble. */
function Conversation() {
  send = useSendMessage({
    messages: [],
    currentConversationId: CONV,
    isHistoryLoaded: true,
    setCurrentConversationId: () => undefined,
    isPremium: false,
  });
  const { data } = useConversationMessages(CONV);
  const saved = formatMessagesForUI(data);
  return (
    <View>
      {saved
        .filter(m => !m.isUser)
        .map(m => (
          <View key={m.id} testID='saved-answer'>
            <MessageWithSources item={m} />
          </View>
        ))}
      {send.streamingBotMessage && (
        <View testID='live-answer'>
          <MessageWithSources item={send.streamingBotMessage} />
        </View>
      )}
    </View>
  );
}

function renderConversation() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Conversation />
    </QueryClientProvider>
  );
}

type RenderedNode = { children: (RenderedNode | string)[] };

/** All text rendered under a node, in order. */
function textOf(node: RenderedNode): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textOf(child)))
    .join(' ');
}

/** Ask, with the stream paused after metadata so the live bubble can be read. */
async function ask(events: StreamEvent[]) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  mockFetch.mockResolvedValueOnce(sseResponse(events, gate));
  renderConversation();
  let sending!: Promise<void>;
  act(() => {
    sending = send.sendMessage(QUESTION);
  });
  await waitFor(() => expect(screen.getByTestId('live-answer')).toBeTruthy());
  const live = textOf(screen.getByTestId('live-answer'));
  await act(async () => {
    release();
    await sending;
  });
  const saved = await waitFor(() => screen.getByTestId('saved-answer'));
  return { live, saved };
}

const savedAnswerRow = () => mockDb.messages.find(m => m.role === 'assistant');

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      vi: { translation: vi },
      es: { translation: es },
      hi: { translation: hi },
      ar: { translation: ar },
      'fr-CA': { translation: frCA },
      pa: { translation: pa },
    },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });
});

beforeEach(async () => {
  mockDb.messages = [];
  mockDb.columnMissing = false;
  mockFetch.mockReset();
  mockTrackResponse.mockReset();
  mockTrackSent.mockReset();
  await i18next.changeLanguage('en');
});

describe('Companion context on mobile: Vancouver arrival', () => {
  it('the streaming answer shows the place, arrival, Checklist count and check time before the text finishes', async () => {
    const { live: text } = await ask(vancouverStream as StreamEvent[]);
    expect(text).toContain('Vancouver, British Columbia');
    expect(text).toContain('next week');
    expect(text).toContain('Checklist tasks used: 3');
    expect(text).toMatch(/Official pages checked Oct 25, 2026/);
  });

  it('saves the context with the answer, unchanged, and the reopened answer shows the same', async () => {
    const { saved } = await ask(vancouverStream as StreamEvent[]);
    expect(savedAnswerRow()?.companion_context).toEqual(
      (vancouverStream[0].data as Record<string, unknown>).context
    );
    expect(mockDb.messages.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(mockDb.messages[0]).not.toHaveProperty('companion_context');
    const answer = within(saved);
    expect(answer.getByText('Vancouver, British Columbia')).toBeTruthy();
    expect(answer.getByText('Checklist tasks used: 3')).toBeTruthy();
    expect(answer.getByRole('button', { name: 'Sources and context' })).toBeTruthy();
  });

  it('Sources and context opens a sheet with each page, publisher, address and read time, and the context used', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { saved } = await ask(vancouverStream as StreamEvent[]);
    fireEvent.press(within(saved).getByRole('button', { name: 'Sources and context' }));
    const sheet = within(screen.getByTestId('sheet'));
    expect(sheet.getByRole('header', { name: 'Sources and context' })).toBeTruthy();
    expect(sheet.getByText('Government of Canada')).toBeTruthy();
    expect(sheet.getByText('Government of British Columbia')).toBeTruthy();
    expect(sheet.getByText(SIN_URL)).toBeTruthy();
    expect(sheet.getAllByText(/^Checked Oct 25, 2026/)).toHaveLength(2);
    expect(sheet.getByText('From this conversation (not saved)')).toBeTruthy();
    expect(sheet.getByText('Get your SIN')).toBeTruthy();
    expect(sheet.getByText('Open a bank account')).toBeTruthy();
    expect(sheet.getByText('In progress')).toBeTruthy();
    expect(
      sheet.getByText(
        'Companion read this information to answer. It did not change your Checklist, profile or saved details.'
      )
    ).toBeTruthy();
    fireEvent.press(sheet.getByRole('link', { name: /Social Insurance Number/ }));
    expect(openURL).toHaveBeenCalledWith(SIN_URL);
    fireEvent.press(sheet.getByRole('button', { name: 'Close sources and context' }));
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('analytics never receive the context: no place, task title, URL or publisher', async () => {
    await ask(vancouverStream as StreamEvent[]);
    expect(mockTrackResponse).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify([mockTrackResponse.mock.calls, mockTrackSent.mock.calls]);
    for (const secret of [
      'Vancouver',
      'British Columbia',
      'Get your SIN',
      'canada.ca',
      'Government of Canada',
      'next_week',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });

  it('every locale shows the context control in its own language, with no raw keys', async () => {
    const { saved } = await ask(vancouverStream as StreamEvent[]);
    const labels: Record<string, string> = {
      en: 'Sources and context',
      vi: 'Nguồn và bối cảnh',
      es: 'Fuentes y contexto',
      hi: 'स्रोत और संदर्भ',
      ar: 'المصادر والسياق',
      'fr-CA': 'Sources et contexte',
      pa: 'ਸਰੋਤ ਅਤੇ ਸੰਦਰਭ',
    };
    for (const [lang, label] of Object.entries(labels)) {
      await act(async () => {
        await i18next.changeLanguage(lang);
      });
      const answer = within(screen.getByTestId('saved-answer'));
      expect(answer.getByRole('button', { name: label })).toBeTruthy();
      expect(JSON.stringify(screen.toJSON())).not.toContain('companion.context.');
    }
    expect(saved).toBeTruthy();
  });
});

describe('Companion context on mobile: missing, conflicting and unavailable information', () => {
  it('a stated province that differs from the profile is shown in words, and the profile is said to be unchanged', async () => {
    const { saved } = await ask(asStream(provinceConflict));
    expect(
      within(saved).getByText(
        'Your profile says Ontario, but in this conversation you said British Columbia. Your profile was not changed.'
      )
    ).toBeTruthy();
  });

  it('guidance that could not be checked says so and shows no check time', async () => {
    const { saved } = await ask(asStream(unavailable));
    const answer = within(saved);
    expect(
      answer.getByText(
        'Official guidance could not be checked for this answer. Confirm on the government website before you act.'
      )
    ).toBeTruthy();
    expect(answer.queryByText(/Official pages checked/)).toBeNull();
  });

  it('an older rag-query with no context: the answer saves and renders as before, with no context control', async () => {
    const older = (vancouverStream as StreamEvent[]).map(e =>
      e.name === 'metadata' ? { ...e, data: { ...e.data, context: undefined } } : e
    );
    const { saved } = await ask(older);
    expect(within(saved).getByText('Start with your SIN, then your bank account.')).toBeTruthy();
    expect(within(saved).queryByRole('button', { name: 'Sources and context' })).toBeNull();
    expect(savedAnswerRow()?.companion_context ?? null).toBeNull();
  });

  it('before the column is migrated, the answer still saves and reopens, without its context', async () => {
    mockDb.columnMissing = true;
    const { saved } = await ask(vancouverStream as StreamEvent[]);
    expect(savedAnswerRow()).not.toHaveProperty('companion_context');
    expect(within(saved).getByText('Start with your SIN, then your bank account.')).toBeTruthy();
    expect(within(saved).queryByRole('button', { name: 'Sources and context' })).toBeNull();
  });
});
