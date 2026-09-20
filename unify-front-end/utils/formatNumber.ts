import i18n from '@/i18n';

/**
 * Formats a number for display using the active i18n language.
 *
 * Locale-aware grouping matters for the languages Unify ships: Hindi groups
 * by lakh/crore (1,00,000) and Arabic may render Eastern Arabic digits, so a
 * raw `String(n)` is wrong for those users. Falls back to `String(n)` if
 * `Intl.NumberFormat` throws on an unexpected locale tag.
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(i18n.language, options).format(value);
  } catch {
    return String(value);
  }
}
