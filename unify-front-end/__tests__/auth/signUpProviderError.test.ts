import { getProviderSignUpErrorType } from '@/utils/signUpProviderError';

const GOOGLE_IGNORED = ['SIGN_IN_CANCELLED', 'IN_PROGRESS'];
const APPLE_IGNORED = ['ERR_REQUEST_CANCELED'];

describe('getProviderSignUpErrorType', () => {
  it('returns null when the user cancels the Google sheet', () => {
    expect(
      getProviderSignUpErrorType({ code: 'SIGN_IN_CANCELLED' }, GOOGLE_IGNORED)
    ).toBeNull();
  });

  it('returns null when a Google sign-in is already in progress', () => {
    expect(
      getProviderSignUpErrorType({ code: 'IN_PROGRESS' }, GOOGLE_IGNORED)
    ).toBeNull();
  });

  it('returns null when the user cancels the Apple sheet', () => {
    expect(
      getProviderSignUpErrorType(
        { code: 'ERR_REQUEST_CANCELED' },
        APPLE_IGNORED
      )
    ).toBeNull();
  });

  it('uses the provider error code for a real provider failure', () => {
    expect(
      getProviderSignUpErrorType(
        { code: 'PLAY_SERVICES_NOT_AVAILABLE' },
        GOOGLE_IGNORED
      )
    ).toBe('PLAY_SERVICES_NOT_AVAILABLE');
  });

  it('falls back to provider_error when there is no code', () => {
    expect(getProviderSignUpErrorType(new Error('boom'), APPLE_IGNORED)).toBe(
      'provider_error'
    );
    expect(getProviderSignUpErrorType(undefined, APPLE_IGNORED)).toBe(
      'provider_error'
    );
    expect(getProviderSignUpErrorType({ code: 12 }, APPLE_IGNORED)).toBe(
      'provider_error'
    );
  });
});
