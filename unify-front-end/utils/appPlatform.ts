import { Platform } from 'react-native';
import type {
  PostHogCustomAppProperties,
  PostHogOptions,
} from 'posthog-react-native';

/**
 * The mobile platform tag used across analytics:
 * - PostHog property `platform` on every client event
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

/**
 * Options for `PostHogProvider`. `platform` goes in through
 * `customAppProperties`, not `register()`: the SDK merges app properties into
 * every event from construction on (so `Application Installed`, which fires
 * during init before any effect can run, has it too), and `reset()` does not
 * clear them (so events after sign-out keep it). The SDK defaults ($app_build,
 * $app_version, ...) are kept; its lifecycle events need them.
 */
export function buildPostHogOptions(
  host: string,
  platform: AppPlatform | null = APP_PLATFORM
): Pick<PostHogOptions, 'host' | 'customAppProperties'> {
  return {
    host,
    customAppProperties: (defaults: PostHogCustomAppProperties) => {
      if (!platform) return defaults;
      const withPlatform: PostHogCustomAppProperties & {
        platform: AppPlatform;
      } = { ...defaults, platform };
      return withPlatform;
    },
  };
}
