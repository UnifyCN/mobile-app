import type { PostHogOptions } from 'posthog-react-native';

/**
 * Exception autocapture for the PostHog provider (posthog-react-native 4.x).
 * It is off by default. This turns on uncaught JS errors and unhandled promise
 * rejections; console capture stays off to avoid noise.
 */
export const POSTHOG_ERROR_TRACKING_OPTIONS: NonNullable<
  PostHogOptions['errorTracking']
> = {
  autocapture: { uncaughtExceptions: true, unhandledRejections: true },
};
