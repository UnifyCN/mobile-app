/**
 * Client-side sign-up form validation. These are form problems the user can
 * fix, not failures of the server or an auth provider, so they are reported as
 * `sign_up_validation_error { reason, method }` and never as `sign_up_failed`.
 */
export type SignUpValidationReason =
  | 'empty_fields'
  | 'passwords_mismatch'
  | 'invalid_email'
  | 'terms_not_accepted';

export interface SignUpValidationInput {
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Returns the first failing check, or null when the form can be submitted.
 * Order matches the order the form reports errors to the user.
 */
export function getSignUpValidationReason({
  email,
  password,
  confirmPassword,
  termsAccepted,
}: SignUpValidationInput): SignUpValidationReason | null {
  if (!email.trim() || !password || !confirmPassword) return 'empty_fields';
  if (password !== confirmPassword) return 'passwords_mismatch';
  if (!isValidEmail(email)) return 'invalid_email';
  if (!termsAccepted) return 'terms_not_accepted';
  return null;
}
