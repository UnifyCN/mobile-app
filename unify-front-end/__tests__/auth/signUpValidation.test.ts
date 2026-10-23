import {
  getSignUpValidationReason,
  SignUpValidationInput,
} from '@/utils/signUpValidation';
import { POSTHOG_ERROR_TRACKING_OPTIONS } from '@/utils/posthogOptions';

const valid: SignUpValidationInput = {
  email: 'new@user.ca',
  password: 'hunter2hunter2',
  confirmPassword: 'hunter2hunter2',
  termsAccepted: true,
};

describe('getSignUpValidationReason', () => {
  it('returns null when the form is valid', () => {
    expect(getSignUpValidationReason(valid)).toBeNull();
  });

  it('maps unaccepted terms to terms_not_accepted', () => {
    expect(getSignUpValidationReason({ ...valid, termsAccepted: false })).toBe(
      'terms_not_accepted'
    );
  });

  it('maps differing passwords to passwords_mismatch', () => {
    expect(
      getSignUpValidationReason({ ...valid, confirmPassword: 'different' })
    ).toBe('passwords_mismatch');
  });

  it('maps a malformed email to invalid_email', () => {
    expect(getSignUpValidationReason({ ...valid, email: 'not-an-email' })).toBe(
      'invalid_email'
    );
  });

  it('maps empty fields to empty_fields', () => {
    expect(getSignUpValidationReason({ ...valid, email: '  ' })).toBe(
      'empty_fields'
    );
    expect(
      getSignUpValidationReason({
        ...valid,
        password: '',
        confirmPassword: '',
      })
    ).toBe('empty_fields');
  });

  it('keeps the existing check order: mismatch, then email, then terms', () => {
    expect(
      getSignUpValidationReason({
        email: 'bad',
        password: 'a',
        confirmPassword: 'b',
        termsAccepted: false,
      })
    ).toBe('passwords_mismatch');
    expect(
      getSignUpValidationReason({
        ...valid,
        email: 'bad',
        termsAccepted: false,
      })
    ).toBe('invalid_email');
  });
});

describe('POSTHOG_ERROR_TRACKING_OPTIONS', () => {
  it('turns on uncaught exception and unhandled rejection autocapture', () => {
    expect(POSTHOG_ERROR_TRACKING_OPTIONS).toEqual({
      autocapture: { uncaughtExceptions: true, unhandledRejections: true },
    });
  });
});
