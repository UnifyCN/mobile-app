# App typography

This change applies the approved system-font option to the mobile app. It starts from main at a3b39161. It is separate from the structured Learn reader PR.

## Shared roles

Use `constants/Typography.ts` for text styles. Keep layout properties in the component.

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| title | 28 / 34 | 600 | Page titles |
| section | 20 / 26 | 600 | Section and navigation headings |
| cardTitle | 17 / 24 | 600 | Card titles, including Social posts |
| body | 17 / 24 | 400 | UI copy and text entry |
| label | 17 / 24 | 500 | Control labels |
| secondary | 15 / 21 | 400 | Supporting text |
| caption | 13 / 18 | 400 | Small metadata |
| button | 17 / 24 | 600 | Actions |
| reading | 18 / 27 | 400 | Lesson reading text |
| tab | 10 / 14 | 400 | Compact bottom navigation labels |

The font is System on iOS and sans-serif on Android. React Native retains user font scaling. No global Text defaults or font-scaling limits are changed.

## Coverage

The shared roles cover Learn, Resources, Checklist, Companion, Community, Social, settings, profile, saved content, search, notifications, groups, events, news, referrals, giveaways, onboarding, sign-in and account recovery, dialogs, and shared controls. ThemedText also uses these roles. Supporting text on light surfaces uses darker colors where the previous color was too pale.

## Preserved exceptions

- Checklist task names retain 15 / 20 text at weight 500 and the approved two-line limit. SpotlightRow retains its compact text sizes.
- Lesson body text remains 18 / 27. Paragraph margin remains 10. Reader side padding remains 20. The change does not alter authored content, keys, or selection behavior.
- Avatar initials, monograms, symbol glyphs, OTP digits, and scaled onboarding illustrations retain their geometric sizing.
- Invitation codes and code content retain monospace fonts.
- External legal pages and email templates are outside the native app text system.
- Font-weight-only inline styles retain inherited size and line height.

## Layout

Text fields and action labels use the UI roles. Sign-in and sign-up fields use minimum heights. The OTP action can grow. Learn pathway cards can grow with text. Settings labels can wrap next to controls. Navigation headings use the section role. Badge containers account for caption line height. Event cards and date pills can grow with text. MonthPicker uses measured row and viewport geometry to center the selected month and year.

## Verification

See `.design/typography/DESIGN.md` for current checks and local native evidence. Source and build checks do not establish every translated layout, VoiceOver output, or Android rendering.
