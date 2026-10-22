/**
 * Classifies an error thrown by a Google or Apple sign-up sheet.
 * Returns null when the user dismissed the sheet (or one is already open):
 * that is not a failure and must not fire `sign_up_failed`. Otherwise returns
 * the `error_type` to report.
 */
export function getProviderSignUpErrorType(
  error: unknown,
  ignoredCodes: readonly string[]
): string | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string') return 'provider_error';
  if (ignoredCodes.includes(code)) return null;
  return code;
}
