# App-wide typography

Status: Approved Option A implemented on design/app-typography. Base: main at a3b39161. This work is separate from the Learn redesign PR.

## Contract

Use the native system font and shared roles in unify-front-end/constants/Typography.ts. The role table and coverage are documented in docs/designs/app-typography.md.

Preserve compact Checklist task text at 15/20, weight 500, with the approved two-line limit. SpotlightRow remains unchanged. Preserve lesson body text at 18/27, paragraph margin 10, side padding 20, and existing bullet spacing. Keep geometric text and monospace exceptions explicit.

## Changes

Shared roles now cover the app routes and shared controls. Supporting text has darker contrast. Social card titles use 17/24 semibold. Fields, event cards, date pills, and several action controls can grow with text. Settings labels can wrap. MonthPicker centers the selected row from measured row and viewport geometry.

The temporary preview route and sample translation keys were removed. Local native evidence is ignored by git because screenshots can contain account data. The original inventory and migration JSON files describe the initial migration, before manual corrections.

## Verification

- Jest: 47 suites and 401 tests passed.
- TypeScript passed.
- Translation key parity passed: 1610 keys in each of seven locales.
- Lint: zero errors and 94 warnings.
- Expo exports passed for iOS and Android.
- git diff --check passed.
- Independent correction review passed. Reports are in audit/review-1.md and audit/review-2.md.

Tests establish code behavior and type compatibility. Exports establish bundle generation. They do not establish all native layouts.

## Native evidence

Simulator: iPhone 17 Pro, iOS 26.4. Final normal-size run passed for Learn, Checklist, Companion, Community, Social, Account, Notifications, Saved Lessons, and one lesson page. Nine captures are under evidence/final-medium/2026-10-23_124117/appwide/takeScreenshot.

Large-text captures cover the five main tabs, Account, Notifications, Saved Lessons, and the Checklist form. The form opened and its Cancel action worked. An event card clipping issue was corrected and its large-text capture was inspected. The Simulator was restored to medium text size.

Some earlier flows failed on route assertions or development-client loading. Those failures are not evidence of successful screen checks. Final normal-size assertions passed.

## Limits

Native checks sample English iOS screens. Android rendering, VoiceOver, all translated layouts, and every app route remain unverified. MonthPicker geometry has controlled tests; native modal reopening timing remains unverified. This branch uses the main-based lesson reader, not the separate structured Learn reader. No production release occurred.
