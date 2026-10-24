import { createElement } from 'react';
import { render, renderHook } from '@testing-library/react-native';
import {
  CIRCLE_NOTIFICATION_TYPES,
  isCircleNotification,
} from '@/constants/Features';

const mockStack = jest.fn(() => null);
const mockRedirect = jest.fn((_props: unknown) => null);
const mockPush = jest.fn();
const mockTrackOpened = jest.fn();
const mockSetNotificationHandler = jest.fn();
let mockCirclesEnabled = false;
let mockPushResponse:
  | ((response: {
      notification: { request: { content: { data: Record<string, unknown> } } };
    }) => void)
  | undefined;

jest.mock('expo-router', () => ({
  Stack: Object.assign(() => mockStack(), { Screen: () => null }),
  Redirect: (props: unknown) => {
    mockRedirect(props);
    return null;
  },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/context/UserContext', () => ({
  useCurrentUser: () => ({ currentUser: { id: 'user' } }),
}));
jest.mock('@/utils/analytics', () => ({
  useAnalytics: () => ({ trackNotificationOpened: mockTrackOpened }),
}));
jest.mock('@/constants/Features', () =>
  Object.defineProperty(
    { ...jest.requireActual('@/constants/Features') },
    'CIRCLES_ENABLED',
    { get: () => mockCirclesEnabled }
  )
);
jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: jest.fn(),
  setNotificationHandler: (handler: unknown) =>
    mockSetNotificationHandler(handler),
}));
jest.mock('expo-device', () => ({}));
jest.mock('expo-application', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/services/push/pushNotifications', () => ({
  registerForPushNotifications: async () => ({ permission: 'unsupported' }),
  addNotificationResponseListener: (callback: typeof mockPushResponse) => {
    mockPushResponse = callback;
    return { remove: jest.fn() };
  },
}));

describe.each([false, true])('Circles enabled = %s', enabled => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCirclesEnabled = enabled;
  });

  it('mounts the Circle stack only when enabled', () => {
    const Layout = require('@/app/community-matching/_layout').default;
    render(createElement(Layout));
    if (enabled) {
      expect(mockStack).toHaveBeenCalledTimes(1);
      expect(mockRedirect).not.toHaveBeenCalled();
    } else {
      expect(mockRedirect).toHaveBeenCalledWith({
        href: '/(tabs)/Gather/gather',
      });
      expect(mockStack).not.toHaveBeenCalled();
    }
  });

  it('controls Circle push targets and preserves social and Learn targets', () => {
    const { usePushNotifications } = require('@/hooks/usePushNotifications');
    renderHook(() => usePushNotifications());
    const tap = (data: Record<string, unknown>) => {
      expect(mockPushResponse).toBeDefined();
      mockPushResponse?.({ notification: { request: { content: { data } } } });
    };
    for (const type of CIRCLE_NOTIFICATION_TYPES)
      tap({ type, circle_id: 'retained-circle' });
    tap({ type: 'unknown', circle_id: 'retained-circle' });
    expect(mockPush).toHaveBeenCalledTimes(enabled ? 3 : 0);
    tap({ type: 'liked', post_id: 12 });
    tap({ type: 'followed', actor_user_id: 'actor' });
    tap({
      type: 'learn_reminder',
      lesson_id: 'lesson',
      submodule_id: 'sub',
      module_id: 'module',
    });
    expect(mockPush).toHaveBeenCalledTimes(enabled ? 6 : 3);
  });

  it('controls foreground Circle notifications and preserves shared notifications', async () => {
    jest.isolateModules(() => {
      jest.requireActual('@/services/push/pushNotifications');
    });
    const { handleNotification } = mockSetNotificationHandler.mock.calls[0][0];
    for (const type of [
      ...CIRCLE_NOTIFICATION_TYPES,
      'liked',
      'followed',
      'learn_reminder',
    ]) {
      const result = await handleNotification({
        request: { content: { data: { type } } },
      });
      expect(Object.values(result)).toEqual(
        Array(4).fill(enabled || !isCircleNotification(type))
      );
    }
  });

  it('keeps social notifications available and recognizes Circle payloads', () => {
    for (const type of CIRCLE_NOTIFICATION_TYPES)
      expect(isCircleNotification(type)).toBe(true);
    expect(isCircleNotification('unknown', { circle_id: null })).toBe(true);
    for (const type of [
      'liked',
      'followed',
      'commented',
      'comment_reply',
      'comment_liked',
      'invite_redeemed',
      'learn_reminder',
    ]) {
      expect(isCircleNotification(type, { post_id: 12 })).toBe(false);
    }
  });
});
