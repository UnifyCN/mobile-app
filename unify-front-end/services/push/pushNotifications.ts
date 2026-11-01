import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { CIRCLES_ENABLED, isCircleNotification } from '@/constants/Features';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const data = notification.request.content.data;
    const show = CIRCLES_ENABLED || !isCircleNotification(data?.type, data);
    return {
      shouldPlaySound: show,
      shouldSetBadge: show,
      shouldShowBanner: show,
      shouldShowList: show,
    };
  },
});

/** Token facility only. Companion supplies captured ownership checks around this wait. */
export function getExpoPushToken() {
  return Notifications.getExpoPushTokenAsync({
    projectId: '3772d4d9-79dd-4848-9691-bae1b19eefb8',
  });
}

export interface PushRegistrationResult {
  token: string | null;
  /** Permission status BEFORE we asked (used to detect first-prompt). */
  previousPermission: Notifications.PermissionStatus | 'unsupported';
  /** Permission status AFTER our request (or existing if no request was made). */
  permission: Notifications.PermissionStatus | 'unsupported';
  /** True iff we actually showed the system prompt this call. */
  prompted: boolean;
}

/**
 * Register for push notifications and store the token in Supabase.
 * Returns a result describing the permission flow + the token (when granted).
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.warn('[Push] Skipped: not a physical device');
    return {
      token: null,
      previousPermission: 'unsupported',
      permission: 'unsupported',
      prompted: false,
    };
  }

  // Check existing permission status
  const { status: existingStatus, canAskAgain } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  let prompted = false;

  // Only request when the OS will actually show a prompt. On iOS a denied
  // permission has canAskAgain=false and requestPermissionsAsync() resolves
  // to 'denied' instantly with no dialog. Before this guard that resolved
  // path fired a "prompted + denied" pair on every app launch, which is why
  // analytics showed 0 grants and 3.6 denials per user.
  if (existingStatus !== 'granted' && canAskAgain) {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    prompted = true;
  }

  if (finalStatus !== 'granted') {
    console.warn(
      '[Push] Skipped: permission not granted, status:',
      finalStatus
    );
    return {
      token: null,
      previousPermission: existingStatus,
      permission: finalStatus,
      prompted,
    };
  }

  // Create Android notification channels
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('social', {
      name: 'Social Activity',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('circles', {
      name: 'Community Circles',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('learn', {
      name: 'Learning Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  try {
    // Get Expo push token
    const tokenData = await getExpoPushToken();

    const token = tokenData.data;
    // A raw push token must never enter logs.

    // Store token in Supabase
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[Push] No authenticated user, skipping token storage');
      return {
        token,
        previousPermission: existingStatus,
        permission: finalStatus,
        prompted,
      };
    }

    if (!token) {
      console.warn('[Push] Token is empty, skipping storage');
      return {
        token: null,
        previousPermission: existingStatus,
        permission: finalStatus,
        prompted,
      };
    }

    // First try to update existing token for this user on this platform
    const { data: existing } = await supabase
      .from('push_tokens')
      .select('id, token')
      .eq('user_id', user.id)
      .eq('platform', Platform.OS)
      .maybeSingle();

    if (existing && existing.token === token) {
      // Token unchanged, just update timestamp
      await supabase
        .from('push_tokens')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      console.log('[Push] Token unchanged, updated timestamp');
    } else if (existing) {
      // Token changed - delete old and insert new
      await supabase.from('push_tokens').delete().eq('id', existing.id);
      const { error } = await supabase.from('push_tokens').insert({
        user_id: user.id,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error(
          '[Push] Failed to store updated token:',
          'Storage request failed'
        );
      } else {
        console.log('[Push] Token updated successfully');
      }
    } else {
      // No existing token - insert new
      const { error } = await supabase.from('push_tokens').insert({
        user_id: user.id,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error(
          '[Push] Failed to store new token:',
          'Storage request failed'
        );
      } else {
        console.log('[Push] Token registered successfully');
      }
    }

    return {
      token,
      previousPermission: existingStatus,
      permission: finalStatus,
      prompted,
    };
  } catch {
    console.error('[Push] Registration failed');
    return {
      token: null,
      previousPermission: existingStatus,
      permission: finalStatus,
      prompted,
    };
  }
}

/**
 * Unregister the current push token from Supabase.
 * Call this when user logs out.
 */
export async function unregisterPushToken(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const tokenData = await getExpoPushToken();

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', tokenData.data);

    console.log('Push token unregistered');
  } catch {
    console.error('Failed to unregister push token');
  }
}

/**
 * Add a listener for when a notification is received while app is foregrounded.
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for when user taps on a notification.
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
