import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  accountSessionIdentity,
  assertOwned,
  ownAccountWork,
} from '@/services/account/accountSession';
import { mobileTransportFor } from './transport';
import { getExpoPushToken } from '@/services/push/pushNotifications';
import { createPushClient } from './pushClient';
import { CompanionPushDevice } from './pushDevice';
import type { PushLocale } from './pushContract';
import { pushLocale } from './pushParsing';
const KEY = 'companion.push.installation.v1';
// This non-secret marker detects proof loss. It provides no installation authority.
const MARKER = 'companion.push.created.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};
export function securePushUuid() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const currentPushLocale = (language: string): PushLocale =>
  pushLocale(language) ? language : 'en';
export const mobilePushClient = (owner: ReturnType<typeof ownAccountWork>) =>
  createPushClient({
    owner,
    transport: mobileTransportFor(owner),
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  });
export const companionPushDevice = new CompanionPushDevice({
  async read(owner) {
    if (owner) assertOwned(owner);
    const raw = await SecureStore.getItemAsync(KEY, options);
    if (owner) assertOwned(owner);
    if (raw === null) {
      const created = await AsyncStorage.getItem(MARKER);
      if (owner) assertOwned(owner);
      if (created !== null) throw new Error('Installation proof unavailable');
    }
    return raw;
  },
  async write(value, owner) {
    if (owner) assertOwned(owner);
    // Mark before creation. A failed secure write fails closed on the next attempt.
    await AsyncStorage.setItem(MARKER, '1');
    if (owner) assertOwned(owner);
    await SecureStore.setItemAsync(KEY, value, options);
    if (owner) assertOwned(owner);
  },
  async permission(ask) {
    const owner = ownAccountWork();
    assertOwned(owner);
    if (Platform.OS !== 'ios' && Platform.OS !== 'android')
      return 'unsupported';
    // Android 13 needs a channel before the permission/token flow.
    if (ask && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('companion', {
        name: 'Companion',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      assertOwned(owner);
    }
    let result = await Notifications.getPermissionsAsync();
    assertOwned(owner);
    if (ask && result.status !== 'granted' && result.canAskAgain) {
      result = await Notifications.requestPermissionsAsync();
      assertOwned(owner);
    }
    return result.status;
  },
  async token() {
    const owner = ownAccountWork();
    assertOwned(owner);
    const result = await getExpoPushToken();
    assertOwned(owner);
    return result.data;
  },
  proof() {
    const installation_id = securePushUuid();
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return {
      installation_id,
      installation_secret: Array.from(bytes, b =>
        b.toString(16).padStart(2, '0')
      ).join(''),
    };
  },
  uuid: securePushUuid,
  session: accountSessionIdentity,
  client: mobilePushClient,
});
