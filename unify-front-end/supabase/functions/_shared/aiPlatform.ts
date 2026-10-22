/**
 * Client platform for `$ai_generation` events.
 *
 * Clients send a request body field `platform` (`ios` | `android` from the
 * mobile app, `web` from the web app). Anything else, including a missing
 * field from an old app build, resolves to undefined so the event keeps its
 * previous shape (no `platform` key) instead of a guessed value.
 */

export type AiPlatform = 'ios' | 'android' | 'web';

const AI_PLATFORMS: readonly AiPlatform[] = ['ios', 'android', 'web'];

export function resolveAiPlatform(body: unknown): AiPlatform | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as { platform?: unknown }).platform;
  return typeof value === 'string' &&
    (AI_PLATFORMS as readonly string[]).includes(value)
    ? (value as AiPlatform)
    : undefined;
}

/** Spread into `captureAiGeneration` properties: `{ platform }` or `{}`. */
export function aiPlatformProperties(body: unknown): {
  platform?: AiPlatform;
} {
  const platform = resolveAiPlatform(body);
  return platform ? { platform } : {};
}
