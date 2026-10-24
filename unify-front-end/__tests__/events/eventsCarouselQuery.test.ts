import React from 'react';
import { render } from '@testing-library/react-native';
import { EventsCarousel } from '@/components/EventsCarousel';

const mockUseEvents = jest.fn();
jest.mock('@/hooks/events/useEvents', () => ({
  useEvents: (limit: number) => mockUseEvents(limit),
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

test('requests an extra event and retains three cards and View more', () => {
  mockUseEvents.mockReturnValue({
    isLoading: false,
    data: Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      title: `Event ${index + 1}`,
      eventDatetime: new Date(
        Date.now() + 86400000 + index * 1000
      ).toISOString(),
    })),
  });
  const screen = render(React.createElement(EventsCarousel));
  expect(mockUseEvents).toHaveBeenCalledWith(4);
  expect(screen.getByText('Event 1')).toBeTruthy();
  expect(screen.getByText('Event 3')).toBeTruthy();
  expect(screen.queryByText('Event 4')).toBeNull();
  expect(screen.getByText(/events.viewMore/)).toBeTruthy();
});
