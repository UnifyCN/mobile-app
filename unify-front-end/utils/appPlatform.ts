import { Platform } from 'react-native';

/**
 * The mobile platform tag used across analytics:
 * - PostHog super property `platform` on every client event
 * - request body field `platform` on every AI edge-function call, which the
 *   functions copy onto their `$ai_generation` event
 *
 * Only `ios` and `android` are valid here. Any other OS (Expo web in dev)
 * gets no tag rather than a wrong one; the web app sets its own `web`.
 */
export type AppPlatform = 'ios' | 'android';

export function toAppPlatform(os: string): AppPlatform | null {
  return os === 'ios' || os === 'android' ? os : null;
}

export const APP_PLATFORM: AppPlatform | null = toAppPlatform(Platform.OS);

/** Adds `platform` to an AI edge-function request body. */
export function withAppPlatform<T extends object>(
  body: T,
  platform: AppPlatform | null = APP_PLATFORM
): T & { platform?: AppPlatform } {
  return platform ? { ...body, platform } : body;
}

interface SuperPropertyClient {
  reset: () => void;
  register: (properties: Record<string, string>) => unknown;
}

/** Registers the `platform` super property on the PostHog client. */
export function registerAppPlatform(
  client: SuperPropertyClient | undefined | null,
  platform: AppPlatform | null = APP_PLATFORM
): void {
  if (!client || !platform) return;
  void client.register({ platform });
}

/**
 * PostHog `reset()` clears every registered super property, so register
 * `platform` again at once. Events sent after sign-out keep the tag.
 */
export function resetAnalyticsKeepingPlatform(
  client: SuperPropertyClient | undefined | null,
  platform: AppPlatform | null = APP_PLATFORM
): void {
  if (!client) return;
  client.reset();
  registerAppPlatform(client, platform);
}
