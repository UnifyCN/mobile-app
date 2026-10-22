// Named `_test.ts` (Deno convention) so the repo's jest run, which globs
// `*.test.ts`, does not try to execute it.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aiPlatformProperties, resolveAiPlatform } from './aiPlatform.ts';

Deno.test('resolveAiPlatform accepts ios, android and web', () => {
  assertEquals(resolveAiPlatform({ platform: 'ios' }), 'ios');
  assertEquals(resolveAiPlatform({ platform: 'android' }), 'android');
  assertEquals(resolveAiPlatform({ platform: 'web' }), 'web');
});

Deno.test('resolveAiPlatform ignores a missing or unknown platform', () => {
  assertEquals(resolveAiPlatform({}), undefined);
  assertEquals(resolveAiPlatform({ platform: 'mobile' }), undefined);
  assertEquals(resolveAiPlatform({ platform: 'IOS ' }), undefined);
  assertEquals(resolveAiPlatform({ platform: 42 }), undefined);
  assertEquals(resolveAiPlatform(null), undefined);
  assertEquals(resolveAiPlatform('ios'), undefined);
});

Deno.test('aiPlatformProperties adds platform only when known', () => {
  assertEquals(aiPlatformProperties({ platform: 'android' }), {
    platform: 'android',
  });
  // Old app builds send no platform: the event keeps today's shape (no key).
  assertEquals(aiPlatformProperties({ term: 'SIN' }), {});
  assertEquals(
    Object.hasOwn(aiPlatformProperties({ platform: 'x' }), 'platform'),
    false
  );
});
