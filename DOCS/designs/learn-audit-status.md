# Learn audit corrections - 2026-10-22

The English catalog corrections are published. App changes run in the local development build. No App Store, TestFlight, or hosted web release was made.

## Completed findings

| Written finding | Correction | Evidence |
| --- | --- | --- |
| Source F01-F02 | Short-answer quizzes accept input. Failed quiz reads remain errors and allow retry. | Native answer check; regression tests; code review 2 |
| Source F03, F08-F09 | Intros retain a return action. Quiz Back opens the preceding content page. Reader and practice failures have Retry. | 117 related-route open checks; code review 2 |
| Source F04; visual text joins | Whitespace spans remain intact. Reviewed content repairs restore missing separators. | Preservation tests; published content review |
| Source F05; visual placeholders | Empty decorative images and authoring placeholders are removed or hidden. Completion text matches the course. | Reviewed cleanup and fresh Sanity reads |
| Source F06 | Ending pages save their position. Concurrent writes retain invocation order. | Native Save and leave; database read; real Learn resume action; three ordering tests |
| Source F07 | Reviews save rating and comment with owner-only access. Pending writes prevent repeated actions. | Hosted RLS checks; native submission; test review removed |
| Source F10-F11 | Section labels have readable contrast. Disclosures expose expanded state. | Source review and native screenshots |
| Source F12 | Five Punjabi page-key exceptions are reconciled without changing page text or order. | Two published records, exact fresh reads |
| Source F13-F15 | Reader bottom content clears the footer. Matching controls can shrink. Document previews preserve the image and offer full-image opening. | Native citation/footer and image checks; source tests |
| Visual cost comparisons | Langara costs use labeled groups. Transit costs use readable text with current source links. | Content reviews; published arrays; native screenshots |
| Visual legacy cards and quizzes | Legacy example/citation blocks use the reader styles. Quiz text uses consistent reading styles. | Shared renderer changes; source and native checks |
| Visual numbering | Main and nested lists have separate numbering. Nested descriptions use bullets where required. | Regression and native checks; reviewed content |
| Additional highlight risk | A saved range must still match its saved text before display or overlap merging. Stale records remain stored. | Independent mobile/web review; controlled rendering and mutation tests |
| Additional review-sheet defects | Controls have labels and radio checked state. The sheet moves above the keyboard and scrolls. | Native labeled controls and submission; targeted accessibility review |

## Published data

- 188 distinct published documents changed in this audit correction pass. Some records occur in more than one transaction.
- Four pre-existing drafts received only page updates. Their order, slug, and other fields remain unchanged. The drafts remain drafts.
- Fresh catalog read: 208 English lessons and 408 content pages. All 401 teaching pages have structured content, FAQ, and citations. Seven pages are completion messages.
- The final pending set contained eight saved highlights. All eight ranges still match their saved text in the published candidate.
- Revision guards and backups protected each publication. Fresh reads matched every changed array.
- Migration 20261023000000 is installed and recorded on the linked Supabase project. Review-table RLS and the ending resume constraint are verified.

## Verification

- Mobile: 45 suites and 359 tests pass. Typecheck and seven-locale key parity pass. iOS and Android exports pass. An export is not an Xcode binary build.
- Web: 19 tests, TypeScript, and production build pass. Four new tests cover highlight preservation; the other 15 cover existing email filtering.
- Native: 117 related-route and 37 ending open checks pass. Targeted checks cover citations, image opening, short answers, ending Save and leave, resume from Learn, review input/submission, and cost groups.
- The stored test review matched rating 4 and the test comment. Exactly one test review was then removed.
- Independent code and content review reports are in reviews/. Screenshots are in evidence/.

## Limits and remaining release work

- This audit and the new editorial content cover the English catalog. Existing translations remain available. The latest English additions and factual corrections are not fully translated. A no-write translation request on October 23 returned HTTP 429 with `AI Usage quota limit reached`. No budget change or content write was made.
- The mobile and web source protections are not released to existing production clients. Older clients can still have their previous display behavior.
- VoiceOver announcements, all large-text sizes, and every lesson interaction were not tested end to end. Opening every page does not prove every interaction.
- Historical audit captures describe the pre-fix state. Do not use them as evidence of the final UI.

## Translation readiness, October 23

A direct production read returned 1,456 published lesson documents. Each of the six non-English languages has 208 lessons and 408 pages. Of the 401 teaching pages per language, 38 use the new structure and 363 still need the new sections. This gives 2,178 page updates across six languages. The seven completion pages per language are separate.

Local unpublished files contain 287 candidate lesson records covering 431 page updates. Of these records, 251 still match both source and target revisions; 36 need comparison with current content. All candidates need semantic review before publication. At least 1,747 page updates still need preparation. Previously reviewed additions are already live.

These counts measure structure, not semantic correctness. Later English corrections to original teaching text require separate translation work. The current additions script does not perform that work. It also cannot refresh an already structured target and assumes deterministic translation IDs; four Getting Support translations use metadata-linked IDs instead.

The live read and revision recheck returned the same document revisions. Public reads do not prove that authenticated drafts are absent. Before publication, check drafts and both revisions, review meaning, validate the legacy projection, and publish only the approved changes. The current generation check is blocked by HTTP 429, as recorded above. No translations were published during this check.
