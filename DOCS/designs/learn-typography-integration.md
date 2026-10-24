# Learn typography integration

PR #334 incorporates main through b857ed7f, which contains the app-wide typography work from PR #335.

## Shared styles

Learn home, category and module screens, resume rows, retry actions, reader navigation, and structured content use constants/Typography.ts. Titles use 28/34 semibold. Section headings use 20/26 semibold. Card titles use 17/24 semibold. Supporting text and controls use the corresponding shared roles.

Lesson body text remains 18/27 with paragraph margin 10 and reader side padding 20. Existing section gaps, FAQ spacing, closed initial FAQ state, category colors, and section navigation remain. FAQ questions and quick-check prompts retain semibold emphasis. The unregistered Inter requests are replaced with the shared system font.

## Integration behavior

Preserve the redesigned Learn layouts, cached progress reads, resume destinations, ending-page position writes, and saved-highlight protections. Retain current main checklist-origin navigation and text-answer support. The Learn grading helper handles short_answer, fill_blank, and long_answer while retaining numeric normalization and collapsing repeated whitespace. Text-answer inputs retain multiline entry, a minimum height of 140, and Learn retry behavior.

## Checks

- TypeScript and seven-locale key parity pass, with 1644 keys per locale.
- All 473 tests in 59 suites pass.
- iOS and Android Expo bundle exports pass.
- Lint reports zero errors and 85 warnings.
- Independent merge review found three issues. A bounded correction review verified all three fixes, including 21 focused tests and 33 additional grading cases.
- iOS Simulator checks opened Learn home, Finance, and a structured lesson. Section navigation reached FAQ and Citations. The citation links and bottom actions were visible. FAQ open and close actions passed.

Native checks use English on iPhone 17 Pro, iOS 26.4. These checks do not establish every locale, Android rendering, VoiceOver, or release-device behavior. Local account screenshots remain outside git. No content publication or production release is included.

## Quick check spacing correction

The structured reader removes trailing blank paragraph spacers and the final paragraph, list item, or dropdown bottom margin. The existing 32-point section gap controls the space before Quick check. Interior paragraph and bullet spacing, body size 18/27, and side padding 20 remain unchanged. The old reader keeps its previous spacing.

The renderer retains the original block array and indices. It does not change content keys or saved-highlight coordinates. Six regression tests cover empty trailing blocks, interior whitespace, original indices, legacy defaults, bullet margins, and the final dropdown in both states. The iOS Simulator check shows the corrected gap in Finance lesson 1.2, Budgeting Methods and Categories.
