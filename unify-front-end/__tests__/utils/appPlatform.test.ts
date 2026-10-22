import { PostHog } from 'posthog-react-native';
import {
  buildPostHogOptions,
  toAppPlatform,
  withAppPlatform,
} from '@/utils/appPlatform';

describe('toAppPlatform', () => {
  it('maps the two mobile OS values', () => {
    expect(toAppPlatform('ios')).toBe('ios');
    expect(toAppPlatform('android')).toBe('android');
  });

  it('returns null for any other OS', () => {
    expect(toAppPlatform('web')).toBeNull();
    expect(toAppPlatform('macos')).toBeNull();
    expect(toAppPlatform('windows')).toBeNull();
  });
});

describe('withAppPlatform', () => {
  it('adds platform to an AI request body', () => {
    expect(withAppPlatform({ term: 'SIN' }, 'android')).toEqual({
      term: 'SIN',
      platform: 'android',
    });
  });

  it('leaves the body unchanged when the platform is unknown', () => {
    expect(withAppPlatform({ term: 'SIN' }, null)).toEqual({
      term: 'SIN',
    });
  });

  it('defaults to the running platform (jest-expo runs as ios)', () => {
    expect(withAppPlatform({ message: 'hi' })).toEqual({
      message: 'hi',
      platform: 'ios',
    });
  });
});

describe('buildPostHogOptions', () => {
  it('adds platform to the SDK app properties and keeps the defaults', () => {
    const options = buildPostHogOptions('https://example.test', 'android');
    expect(options.host).toBe('https://example.test');
    const appProps = (
      options.customAppProperties as (p: object) => Record<string, unknown>
    )({ $app_build: '42', $app_version: '1.4.0', $os_name: 'Android' });
    expect(appProps).toEqual({
      $app_build: '42',
      $app_version: '1.4.0',
      $os_name: 'Android',
      platform: 'android',
    });
  });

  it('keeps the SDK app properties unchanged when the platform is unknown', () => {
    const options = buildPostHogOptions('https://example.test', null);
    const appProps = (
      options.customAppProperties as (p: object) => Record<string, unknown>
    )({ $app_build: '42' });
    expect(appProps).toEqual({ $app_build: '42' });
  });
});

describe('PostHog client built with buildPostHogOptions', () => {
  it('puts platform on the first event, and on events after reset()', async () => {
    const client = new PostHog('phc_test', {
      ...buildPostHogOptions('https://example.test', 'android'),
      persistence: 'memory',
      // Nothing leaves the test: no flush by count or by timer.
      flushAt: 1000,
      flushInterval: 600_000,
      captureAppLifecycleEvents: false,
      preloadFeatureFlags: false,
    });
    const captured: { event: string; properties: Record<string, unknown> }[] =
      [];
    client.on('capture', (message: (typeof captured)[number]) => {
      captured.push(message);
    });

    // Sent before init completes: the very first event on a fresh install.
    client.capture('first_event');
    await client.ready();
    client.reset();
    client.capture('after_sign_out');

    expect(captured.map(m => m.event)).toEqual([
      'first_event',
      'after_sign_out',
    ]);
    for (const message of captured) {
      expect(message.properties.platform).toBe('android');
    }
  });
});
