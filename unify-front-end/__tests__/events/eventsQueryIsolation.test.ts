import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEvents } from '@/hooks/events/useEvents';
import { getAllEvents } from '@/services/events/getAllEvents';

jest.mock('@/services/events/getAllEvents', () => ({
  getAllEvents: jest.fn(),
}));
const fetchEvents = jest.mocked(getAllEvents);
afterEach(() => {
  jest.useRealTimers();
  fetchEvents.mockReset();
});

test('keeps discovery cards separate from the full list when both hooks mount together', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  fetchEvents.mockImplementation(async options =>
    Array.from({ length: options?.upcomingLimit ?? 8 }, (_, index) => ({
      id: index,
      title: `Event ${index}`,
      description: null,
      eventDatetime: '2026-11-10T12:00:00Z',
      eventEndDatetime: null,
      location: 'Library',
      address: null,
      hostedBy: null,
      eventType: 'in-person',
      genre: 'Language',
      coverPhotoUrl: null,
      externalLink: null,
      maxAttendees: null,
      source: null,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
    }))
  );
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(
    () => ({ cards: useEvents(3), all: useEvents(), moreCards: useEvents(5) }),
    { wrapper }
  );
  await waitFor(() => {
    expect(result.current.cards.data).toHaveLength(3);
    expect(result.current.all.data).toHaveLength(8);
    expect(result.current.moreCards.data).toHaveLength(5);
  });
  expect(fetchEvents).toHaveBeenCalledWith({ upcomingLimit: 3 });
  expect(fetchEvents).toHaveBeenCalledWith(undefined);
  expect(fetchEvents).toHaveBeenCalledWith({ upcomingLimit: 5 });
  expect(client.getQueryData(['events'])).toHaveLength(8);
  unmount();
  client.clear();
});

test('refills the discovery cache when its first event starts', async () => {
  const now = new Date('2026-10-24T12:00:00Z').getTime();
  jest.useFakeTimers({ now });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const events = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    title: `Event ${index + 1}`,
    description: null,
    eventDatetime: new Date(now + 100 + index * 1000).toISOString(),
    eventEndDatetime: null,
    location: 'Library',
    address: null,
    hostedBy: null,
    eventType: 'in-person' as const,
    genre: 'Language' as const,
    coverPhotoUrl: null,
    externalLink: null,
    maxAttendees: null,
    source: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }));
  fetchEvents
    .mockResolvedValueOnce(events.slice(0, 4))
    .mockResolvedValue(events.slice(1));
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(() => useEvents(4), { wrapper });
  try {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(result.current.data?.map(e => e.id)).toEqual([1, 2, 3, 4]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(110);
    });
    expect(fetchEvents).toHaveBeenCalledTimes(2);
    expect(result.current.data?.map(e => e.id)).toEqual([2, 3, 4, 5]);
  } finally {
    unmount();
    client.clear();
  }
});

test('retries an expired discovery cache after a failed replacement', async () => {
  const now = new Date('2026-10-24T12:00:00Z').getTime();
  jest.useFakeTimers({ now });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const events = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    title: `Event ${index + 1}`,
    description: null,
    eventDatetime: new Date(
      now + (index < 2 ? 100 + index * 1000 : index * 100000)
    ).toISOString(),
    eventEndDatetime: null,
    location: 'Library',
    address: null,
    hostedBy: null,
    eventType: 'in-person' as const,
    genre: 'Language' as const,
    coverPhotoUrl: null,
    externalLink: null,
    maxAttendees: null,
    source: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }));
  fetchEvents
    .mockResolvedValueOnce(events.slice(0, 4))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(events.slice(2));
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(() => useEvents(4), { wrapper });
  try {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(110);
    });
    expect(fetchEvents).toHaveBeenCalledTimes(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30001);
    });
    expect(fetchEvents).toHaveBeenCalledTimes(3);
    expect(result.current.data?.slice(0, 3).map(e => e.id)).toEqual([3, 4, 5]);
  } finally {
    unmount();
    client.clear();
  }
});

test('continues a deadline that exceeds one maximum-size timeout', async () => {
  const now = new Date('2026-10-24T12:00:00Z').getTime();
  const maximum = 0x7fffffff;
  jest.useFakeTimers({ now });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  fetchEvents
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Future event',
        description: null,
        eventDatetime: new Date(now + maximum + 1000).toISOString(),
        eventEndDatetime: null,
        location: 'Library',
        address: null,
        hostedBy: null,
        eventType: 'in-person',
        genre: 'Language',
        coverPhotoUrl: null,
        externalLink: null,
        maxAttendees: null,
        source: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      },
    ])
    .mockResolvedValue([]);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(() => useEvents(4), { wrapper });
  try {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(maximum);
    });
    expect(fetchEvents).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1001);
    });
    expect(fetchEvents).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual([]);
  } finally {
    unmount();
    client.clear();
  }
});
