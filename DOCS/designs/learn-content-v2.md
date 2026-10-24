# Learn design and content contract

Status: app changes implemented locally; reviewed English content and database corrections published on 2026-10-22. Selected resume option: A (2026-10-21). Current verification and limits: [audit status](learn-audit-status.md).

## Reference and scope

Figma file `ogEzPZmWDVLmZl3D0R0VCW`:

- `8888:207`: Learn and category list. Replace its large resume card with selected prototype A.
- `8889:687`: category title, description, and module progress cards.
- `8889:773`: module description, progress, and lesson rows.
- `8889:855`: lesson reader with Concept, Example, Quick check, Visual, FAQ, and Citations.

Use system typography, white surfaces, 16-17 point overview gutters, 16 point card corners, and 44 point minimum controls. Lesson readers use 18 point body text, 27 point line height, 10 point paragraph and bullet spacing, and 20 point side padding. These lesson values follow the user's requested original reading styles. Use actual content and progress. Figma titles, durations, and percentages are sample content. A new learner has no resume row. Returning learners see their latest unfinished lesson. Other active lessons remain available in a sheet. Keep the Resources view, existing task/practice flows, saved pages, highlights, and analytics.

The existing application allows access to all categories and lessons. The redesign does not add locks based on the gray sample rows in Figma. The existing bottom tab bar remains shared app navigation.

## Category symbols

Use SF Symbols on iOS through `expo-image`. Use Material Community outline equivalents on Android. Map stable Sanity document IDs, not translated titles or the current ambiguous icon field. The implementation is `components/learn/CategorySymbol.tsx`.

| Topic | SF Symbol |
| --- | --- |
| Documentation | person.text.rectangle |
| Employment | briefcase |
| Housing | house |
| Healthcare | cross.case |
| Scam prevention | checkmark.shield |
| Education | graduationcap |
| Finance | banknote |
| Canadian culture | globe.americas |
| Permanent residence | person.crop.rectangle |
| Mental health | brain.head.profile |
| Taxes and benefits | doc.text |
| Transportation | tram |
| Universities and colleges | building.columns |
| Unknown future topic | book.closed |

## Content contract

The canonical Studio source is `UnifyCN/unify-sanity`, project `fercgabp`, dataset `production`. Both mobile and web read this dataset.

Add optional `contentVersion: 2`, `sections`, and `readingMinutes` to each existing `pages[]` entry. Each section has a stable `_key` and an optional translated `title`. Supported types:

| Type | Fields |
| --- | --- |
| lessonConcept | content: Portable Text |
| lessonExample | theory, practice: Portable Text |
| lessonVisual | image with alternative text, optional content and caption |
| lessonQuickCheck | question, options with one correct answer, explanation |
| lessonFaq | items with question and Portable Text answer |
| lessonCitations | sources with title, publisher, year, and HTTP(S) URL |

New lessons can use one content page with all sections. Existing multi-page lessons retain their pages. Do not flatten or reorder published pages. The Back/Next flow, activity pages, quizzes, ending pages, and completion rules remain in effect. The Next lesson label applies only when the action actually opens the next lesson.

Quick checks give local feedback and allow a retry. They do not replace scored quizzes or write quiz progress. FAQ disclosures and example tabs use local state. Citation links open their source. The visual image comes from authored Sanity content. The water image in Figma is sample lesson media, not app chrome.

## Compatibility and migration

Keep `pages[].content` as a readable projection for older clients and for search, read-time, and retrieval consumers. Studio provides a **Sync legacy content** action. The action saves a draft only and uses a revision guard. Validation blocks publication when the projection differs from the new sections.

The migration adds one Concept section containing each existing page's unchanged content. It does not infer educational meaning, fabricate FAQs, answers, sources, or reading times. Editors can then split the content into the appropriate section types. The migration preserves document IDs, references, page order, page keys, block keys, span boundaries, text, links, and assets. It is idempotent. Its output is an inspectable set of revision-guarded patches. It does not publish content.

Migrate each language document from its own content. Do not copy English content into translated documents. Two published Punjabi documents had page keys that differed from their English source: `7277fa7d-f24f-4faa-8c21-49dfb25b2a5e-pa` and `a3584573-51db-4c69-b0cd-bcddb3aaaa16-pa`. The separate reviewed correction on 2026-10-22 reconciled five page keys. It preserved text and page positions. Both published records were read back and verified.

Mobile selects translated sections by the stable page key, independently from the English section tree. If translated sections are absent, it uses the translated legacy content. Section keys can change independently across languages without replacing Spanish text with English. Mobile and web choose the new sections only when version 2 and a nonempty section array are present. Otherwise they use the existing content. Retain legacy content until older mobile versions are no longer supported and all retrieval/search consumers have moved.

## Authoring and translation

Create sections in the Studio, then run **Sync legacy content** on the draft. Validation prevents publication while the older-reader projection differs. Keep page and block keys when moving existing content into sections. The translation script now supports all six target languages. For new structured translations, it checks array structure, keys, references, URLs, numbers, and answer flags. It derives the legacy projection from translated sections. It leaves drafts for editorial review. Existing linked translations are preserved. A structural failure requires correction of the draft before publication. Automated translation quality and hosted execution are not verified by the local tests.

From the canonical Studio directory, generate a dry run from a fresh dataset export:

```sh
node --experimental-strip-types scripts/migrate-lesson-sections.mts export.ndjson patches.json
node --experimental-strip-types --test scripts/lessonContent.test.mts scripts/translatedLesson.test.mts scripts/lessonSchema.test.mts
```

The first command writes patches to disk. It sends no mutations. The initial conversion preserves all existing text in Concept sections. Splitting that text into Example, Quick check, FAQ, and Citations is a separate editorial operation.

## Acceptance evidence

- Resume excludes untouched/completed lessons and keeps lesson/activity/quiz/ending destinations.
- Migration preserves the complete original content and every page identity, including localized documents.
- Category icons remain correct across languages.
- Concept text keeps selection, highlights, and Ask AI. Saved page routes keep their page number.
- Examples switch; quick checks give feedback; FAQs expand; source links open safe URLs.
- Small screens, long titles, text scaling, and safe areas remain usable.
- Loading, empty, progress failure, refresh, completed, and multiple active lesson states remain available.
- Mobile typecheck, tests, translation parity, and native export pass. Studio typecheck/build and migration tests pass. Web tests/build and translation parity pass.
- Capture native Simulator evidence. Distinguish native fixture proof from authenticated account data.

## Rollout order

1. Review the app, web, and Studio changes together.
2. Deploy compatible readers and the Studio schema.
3. Export the dataset and generate guarded additive migration patches.
4. Review preservation checks and language exceptions.
5. Apply the reviewed migration. Re-read the affected documents and verify revisions and content.
6. Edit lesson sections with content review. Keep the legacy projection synchronized.

Local implementation verification alone does not prove hosted publication. The 2026-10-22 correction pass separately verified its hosted content and database writes.

## Local verification, 2026-10-21

- Mobile: 328 tests passed in 40 suites. TypeScript, changed-source lint, all seven locale files, and iOS/Android exports passed.
- Studio: typecheck and production build passed. Six migration, translation, and schema validation tests passed. No Studio deployment or hosted mutation was performed.
- Web: typecheck, changed-source lint, production build, and 15 existing tests passed. Those unit tests cover email filtering. A separate browser check used the real structured reader at 360 and 1280 px. It passed Example switching, wrong/correct answer retry, FAQ disclosure, safe source links, section anchors, keyboard focus, and overflow checks. Existing unrelated translation fallbacks remain; every new Learn key has all seven translations.
- Data: a public read exported 1,456 lessons with 208 per language. The dry run preserved 2,856 content pages, all original fields, keys, spans, links, assets, endings, and activities. It was idempotent.
- Native: the authenticated Learn, category, module, and legacy lesson screens rendered in an iPhone 17 Pro Simulator. A temporary native fixture used the actual resume and structured reader components with sample text. Taps verified Example, FAQ, and wrong/correct Quick check feedback. The fixture wrote no progress and was removed after capture. At the user request, the development-only preview route was restored for interactive Simulator review.
- Text scaling: module content remained readable at iOS extra-extra-extra-large. The existing shared bottom tab labels become crowded at that size.
- Evidence: `.design/learn-evidence/` in the mobile worktree. Sample content screenshots are labeled as fixtures. No claim of hosted migration, TestFlight distribution, VoiceOver end-to-end testing, or saved-highlight runtime verification is made.
- At this initial snapshot, ending-page position persistence remained a gap. The 2026-10-22 correction adds position saves and the database constraint. Native Save and leave and resume from Learn now pass.

## Work locations

- Mobile: `/Users/savargupta/.t3/worktrees/Unify/prototype-learn-resume-options`, branch `prototype/learn-resume-options`.
- CMS: `/Users/savargupta/Github/unify-sanity/.claude/worktrees/learn-content-v2`, branch `feat/learn-content-v2`.
- Web: `/Users/savargupta/Github/Unify-Web-App/.claude/worktrees/learn-content-v2`, branch `feat/learn-content-v2`.

## Final visual corrections

The user requested Figma category colors. Documentation uses coral, employment blue, housing peach, and healthcare plum. Other topics use coordinated soft colors. All 14 symbol color pairs exceed 4.6:1 contrast. Cards remain white. The Courses header now uses the Figma 16 point heading, 12 point plain filter labels, and a thin divider. All and Started retain 44 point touch areas.

The development-only route `myapp:///learn-design-preview` shows the real compact resume and structured reader with sample content. It redirects to Learn in production. The user requested this route for Simulator inspection; it is not a published lesson.

## Audit corrections, 2026-10-22

All 401 English teaching pages now include structured content, FAQ, and citations. Seven completion pages remain separate. The catalog contains 208 English lessons and 408 content pages. Reviewed repairs cover missing content, stale factual claims, source links, placeholders, text joins, cost comparison groups, and the Punjabi page-key exceptions. Four existing drafts retain their separate metadata.

A saved highlight must match its saved text at the stored range before the mobile or web reader displays or merges it. A stale record remains available in saved content. It is not moved to a guessed range. This protection is source-verified; it still requires an app/web release for existing production clients.

Lesson reviews use owner-only database access. The ending reader waits for position and completion writes before navigation. Its review sheet exposes labeled rating controls and remains usable with the keyboard open. The native test review was verified and removed.

The latest editorial changes are English-only. Translation completion remains separate work because the Sanity generation quota was exhausted. The local app and web builds have not been released to production. See the audit status for exact test counts and native proof limits.

## Current reader presentation

Section headings use 20/26 semibold text. Body text remains 18/27 with 10 point paragraph and bullet spacing. Section gaps are 32 points and heading-to-content gaps are 12 points. FAQs start closed. Example tab labels use dark text. FAQ questions, captions, citation links, and navigation labels use the reviewed larger sizes.

Known issue: a retained empty content block and dropdown margin can add to the section gap before Quick check. Trailing blank-space normalization remains pending.
