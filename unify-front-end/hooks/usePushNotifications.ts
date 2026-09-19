import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCurrentUser } from '@/context/UserContext';
import {
  registerForPushNotifications,
  addNotificationResponseListener,
} from '@/services/push/pushNotifications';
import { useAnalytics } from '@/utils/analytics';
import type { Subscription } from 'expo-notifications';

/**
 * Validates that a circle_id is a non-empty string
 */
const isValidCircleId = (id: unknown): id is string =>
  typeof id === 'string' && id.trim() !== '';

/**
 * Hook to initialize push notifications.
 * Should be called once in a component that has access to UserContext and router.
 */
export function usePushNotifications() {
  const { currentUser } = useCurrentUser();
  const router = useRouter();
  const responseListenerRef = useRef<Subscription>(null);
  const {
    trackPushPermissionPrompted,
    trackPushPermissionGranted,
    trackPushPermissionDenied,
    trackNotificationOpened,
  } = useAnalytics();

  // Clear badge count when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        Notifications.setBadgeCountAsync(0);
      }
    });
    // Also clear on mount
    Notifications.setBadgeCountAsync(0);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Always register for push — social notifications always send.
    // Users control notification preferences via iOS/Android system settings.
    // The wants_reminders toggle only controls learn reminders (server-side).
    registerForPushNotifications()
      .then(result => {
        if (result.permission === 'unsupported') return;
        if (result.prompted) {
          trackPushPermissionPrompted({ prompted_in: 'in_app' });
          if (result.permission === 'granted') {
            trackPushPermissionGranted({ prompted_in: 'in_app' });
          } else if (result.permission === 'denied') {
            trackPushPermissionDenied({ prompted_in: 'in_app' });
          }
        }
      })
      .catch(err => {
        console.error('Push notification registration failed:', err);
      });

    // Handle notification taps
    responseListenerRef.current = addNotificationResponseListener(response => {
      const data = response.notification.request.content.data;
      const notificationType =
        typeof data?.type === 'string' ? data.type : 'unknown';

      let deepLinkTarget: string | null = null;

      // Navigate based on notification type (with circle_id validation)
      if (data?.type === 'circle_matched' && isValidCircleId(data?.circle_id)) {
        deepLinkTarget = '/community-matching/circle';
        router.push(`/community-matching/circle/${data.circle_id}` as const);
      } else if (
        data?.type === 'circle_ending_soon' &&
        isValidCircleId(data?.circle_id)
      ) {
        deepLinkTarget = '/community-matching/circle/chat';
        router.push(
          `/community-matching/circle/${data.circle_id}/chat` as const
        );
      } else if (
        data?.type === 'new_message' &&
        isValidCircleId(data?.circle_id)
      ) {
        deepLinkTarget = '/community-matching/circle/chat';
        router.push(
          `/community-matching/circle/${data.circle_id}/chat` as const
        );
      } else if (
        (data?.type === 'liked' ||
          data?.type === 'commented' ||
          data?.type === 'comment_liked' ||
          data?.type === 'comment_reply') &&
        data?.post_id != null
      ) {
        deepLinkTarget = '/post-details';
        router.push({
          pathname: '/post-details',
          params: { postId: String(data.post_id) },
        } as Href);
      } else if (data?.type === 'followed' && data?.actor_user_id != null) {
        deepLinkTarget = '/profile';
        router.push({
          pathname: '/profile',
          params: { userId: String(data.actor_user_id) },
        } as Href);
      } else if (data?.type === 'deadline') {
        deepLinkTarget = '/(tabs)/Checklist';
        router.push({
          pathname: '/(tabs)/Checklist',
          params:
            data?.deadline_id != null
              ? { deadlineId: String(data.deadline_id) }
              : undefined,
        } as Href);
      } else if (
        data?.type === 'learn_reminder' &&
        data?.lesson_id &&
        data?.submodule_id &&
        data?.module_id
      ) {
        deepLinkTarget = '/(tabs)/Learn/lesson';
        router.push({
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]',
          params: {
            moduleId: String(data.module_id),
            submoduleId: String(data.submodule_id),
            lessonId: String(data.lesson_id),
          },
        } as Href);
      }

      trackNotificationOpened(notificationType, deepLinkTarget);
    });

    return () => {
      if (responseListenerRef.current) {
        responseListenerRef.current.remove();
      }
    };
  }, [currentUser, router]);
}
