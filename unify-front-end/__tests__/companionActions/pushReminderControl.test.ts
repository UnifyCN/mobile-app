import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ReminderSection } from '@/components/companion/tasks/ReminderSection';

const mockPrepare = jest.fn();
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
jest.mock('@/hooks/companion/useReminderEditor', () => ({
  useReminderEditor: () => ({
    draft: { instant: '', zone: 'America/Vancouver' },
    phase: { phase: 'idle' },
    canSchedule: true,
    canWrite: true,
    prepare: mockPrepare,
    change: jest.fn(),
    isOwned: () => true,
  }),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

it('shows a device-wide Companion control while in-app reminder review remains independent', () => {
  const ui = render(
    React.createElement(ReminderSection, {
      taskRef: 'custom:7',
      view: {
        status: 'ready',
        canWrite: true,
        byRef: new Map(),
        stepsByRef: new Map(),
        details: [],
        stale: false,
        readAt: 1,
        refetch() {},
      },
      store: null,
    })
  );
  expect(ui.getByText('companionPush.scope')).toBeTruthy();
  fireEvent.press(ui.getByText('reminders.review'));
  expect(mockPrepare).toHaveBeenCalledTimes(1);
});
