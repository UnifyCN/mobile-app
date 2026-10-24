import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventsCarousel } from '@/components/EventsCarousel';
import { useEvents } from '@/hooks/events/useEvents';
import { getAllEvents } from '@/services/events/getAllEvents';

jest.mock('@/services/events/getAllEvents', () => ({
  getAllEvents: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/components/icons/ViewMoreCardEvents.svg', () => () => null);
jest.mock('@/components/events/EventCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ event }: { event: { title: string } }) =>
    React.createElement(Text, null, event.title);
});

const fetchEvents = jest.mocked(getAllEvents);

function EventReaders() {
  const list = useEvents();
  const detail = useEvents();
  return (
    <>
      <Text>{`list:${list.isLoading}:${list.data?.length ?? 0}`}</Text>
      <Text>{`detail:${detail.isLoading}:${detail.data?.length ?? 0}`}</Text>
    </>
  );
}

test.each([false, true])(
  'shares the full event read with list and detail subscribers (concurrent: %s)',
  async concurrent => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    fetchEvents.mockReset();
    fetchEvents.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      title: `Event ${index + 1}`,
      eventDatetime: new Date(
        Date.now() + 86400000 + index * 1000
      ).toISOString(),
      description: null,
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
    const tree = (showReaders: boolean) => (
      <QueryClientProvider client={client}>
        <EventsCarousel />
        {showReaders && <EventReaders />}
      </QueryClientProvider>
    );
    const screen = render(tree(concurrent));
    try {
      await waitFor(() => expect(screen.getByText('Event 1')).toBeTruthy());
      expect(screen.getByText('Event 3')).toBeTruthy();
      expect(screen.queryByText('Event 4')).toBeNull();
      expect(screen.getByText(/events.viewMore/)).toBeTruthy();
      if (!concurrent) screen.rerender(tree(true));
      expect(screen.getByText('list:false:8')).toBeTruthy();
      expect(screen.getByText('detail:false:8')).toBeTruthy();
      expect(fetchEvents).toHaveBeenCalledTimes(1);
      expect(fetchEvents).toHaveBeenCalledWith();
    } finally {
      screen.unmount();
      client.clear();
    }
  }
);
