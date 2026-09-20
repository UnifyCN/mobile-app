// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  plugins: ['i18next'],
  rules: {
    // Guards the i18n contract in CLAUDE.md: user-facing copy must go through
    // t(), never a literal. Scoped to rendered markup — JSX text plus the
    // attributes that reach the screen or a screen reader — so style values,
    // icon names and route paths stay untouched.
    'i18next/no-literal-string': [
      'error',
      {
        mode: 'jsx-only',
        'jsx-attributes': {
          include: [
            'title',
            'placeholder',
            'accessibilityLabel',
            'accessibilityHint',
            'label',
            'headerTitle',
          ],
          exclude: [],
        },
        'object-properties': {
          include: [],
          exclude: [
            '[A-Z_-]+',
            // Intl.DateTimeFormat / NumberFormat option values are API
            // constants, not copy.
            'year',
            'month',
            'day',
            'weekday',
            'era',
            'hour',
            'minute',
            'second',
            'timeZone',
            'timeZoneName',
            'dateStyle',
            'timeStyle',
            'hourCycle',
            'style',
            'currency',
            'notation',
          ],
        },
        words: {
          exclude: [
            // Digits, punctuation, separators and whitespace only
            /^[\s0-9!-\/:-@[-`{-~\u00A1-\u00BF\u00D7\u00F7]+$/,
            // SCREAMING_CASE identifiers
            /^[A-Z_-]+$/,
            // HTML entities
            /^&[a-zA-Z]+;$/,
            // Dingbats, arrows, geometric shapes and emoji (✓, ✕, ⏱️, …)
            /^[\s -⯿️‍\uD800-\uDFFF]+$/,
            // Hex colour literals
            /^#[0-9a-fA-F]{3,8}$/,
          ],
        },
      },
    ],
  },
  overrides: [
    {
      // Tests assert on English copy, and the locale catalogues are the
      // literals themselves.
      files: [
        '__tests__/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        'i18n/**',
        'evals/**',
        'scripts/**',
      ],
      rules: { 'i18next/no-literal-string': 'off' },
    },
  ],
};
