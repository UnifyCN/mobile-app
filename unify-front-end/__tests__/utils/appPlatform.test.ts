import {
  resetAnalyticsKeepingPlatform,
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

describe('resetAnalyticsKeepingPlatform', () => {
  it('registers platform again after reset clears super properties', () => {
    const calls: string[] = [];
    const registered: Record<string, unknown>[] = [];
    const client = {
      reset: () => {
        calls.push('reset');
      },
      register: (props: Record<string, unknown>) => {
        calls.push('register');
        registered.push(props);
      },
    };

    resetAnalyticsKeepingPlatform(client, 'android');

    expect(calls).toEqual(['reset', 'register']);
    expect(registered).toEqual([{ platform: 'android' }]);
  });

  it('does not register anything when the platform is unknown', () => {
    const register = jest.fn();
    const reset = jest.fn();
    resetAnalyticsKeepingPlatform({ reset, register }, null);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it('tolerates a missing client', () => {
    expect(() => resetAnalyticsKeepingPlatform(undefined, 'ios')).not.toThrow();
  });
});
