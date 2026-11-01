import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import {
  ownAccountWork,
  subscribeAccount,
} from '@/services/account/accountSession';
import {
  companionPushDevice,
  currentPushLocale,
  mobilePushClient,
} from '@/services/companionActions/pushNative';
import { CompanionPushIntents } from '@/services/companionActions/pushIntents';

export const companionPushIntents = new CompanionPushIntents({
  resolve: (owner, id, locale) => mobilePushClient(owner).resolve(id, locale),
  navigate: () => router.navigate('/(tabs)/companion'),
  last: () =>
    Notifications.getLastNotificationResponse()?.notification.request.content
      .data,
  clear: () => Notifications.clearLastNotificationResponse(),
});
export function useCompanionPushDevice() {
  const owner = useAccountSnapshot();
  const { i18n } = useTranslation();
  const locale = currentPushLocale(i18n.language);
  const view = useSyncExternalStore(
    companionPushDevice.subscribe,
    companionPushDevice.snapshot,
    companionPushDevice.snapshot
  );
  useEffect(() => {
    void companionPushDevice.refresh(locale);
  }, [owner.accountId, owner.epoch, locale]);
  return { view, locale, device: companionPushDevice };
}
export function useCompanionPushSelection() {
  useAccountSnapshot();
  return useSyncExternalStore(
    companionPushIntents.subscribe,
    companionPushIntents.snapshot,
    companionPushIntents.snapshot
  );
}
/** Root listener also runs before sign-in. Social/learn retain their existing handler. */
export function useCompanionPushNotifications() {
  const owner = useAccountSnapshot();
  const { i18n } = useTranslation();
  const locale = currentPushLocale(i18n.language);
  useEffect(() => {
    let active = true;
    const stopDevice = companionPushDevice.connect();
    const stopAccount = subscribeAccount(() =>
      companionPushIntents.invalidate()
    );
    const receive = (
      response: Notifications.NotificationResponse | null,
      captured = ownAccountWork()
    ) => {
      if (!active || !response) return;
      companionPushIntents.receive(
        response.notification.request.content.data,
        captured
      );
      void companionPushIntents.process(locale);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(
      response => receive(response)
    );
    const captured = ownAccountWork();
    void Notifications.getLastNotificationResponseAsync()
      .then(response => receive(response, captured))
      .catch(() => {});
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void companionPushDevice.refresh(locale);
        void companionPushIntents.process(locale);
      }
    });
    // This listener emits APNs/FCM device tokens. Fetch a fresh Expo token through the adapter.
    const tokens = Notifications.addPushTokenListener(() => {
      void companionPushDevice.refresh(locale);
    });
    return () => {
      active = false;
      listener.remove();
      foreground.remove();
      tokens.remove();
      stopAccount();
      stopDevice();
    };
  }, [locale]);
  useEffect(() => {
    void companionPushDevice.refresh(locale);
    void companionPushIntents.process(locale);
  }, [owner.accountId, owner.epoch, locale]);
}
