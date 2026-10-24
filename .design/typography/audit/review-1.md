# App-wide typography review

REVIEW_DONE_TYPOGRAPHY_APPWIDE_1

Changes required. Four finding groups remain in the inspected source. Native clipping is unverified.

Worktree: /Users/savargupta/.t3/worktrees/Unify/app-typography-experiment
Branch: design/app-typography
Base HEAD: a3b39161e8a51707e5f7d329af11d86317715a1a
Comparison: uncommitted changes against HEAD, including the new Typography.ts.
Hash check time: 2026-10-23T19:35:19.195572+00:00

The parent changed source during this review. File hashes below identify the inspected versions. This report does not approve later edits. I wrote no source files. I did not use the Simulator, install packages, change hosted data, or delegate work.

## Confirmed findings

All paths below are relative to unify-front-end/.

### F1. P2: Restore the compact Checklist task metrics

Location: components/checklist/ChecklistItem.tsx:69.

taskName now spreads typography.label. This changes the font from 15/20 to 17/24. numberOfLines={2} remains at line 27, but two text lines now require 48 points instead of 40 points. The larger font also reduces the text that fits before truncation. This conflicts with the instruction to preserve the compact task layout.

Minimal fix: retain the system font and weight 500, but override fontSize to 15 and lineHeight to 20 for taskName. Keep the two-line limit and the current row spacing.

Source proof: the role and component values confirm the metric change. Native truncation for specific task names was not tested.

### F2. P2: Update the month picker scroll geometry

Locations: components/onboarding/MonthPicker.tsx:58, :59, :242, :254, :263.

The picker calculates scroll positions with ITEM_HEIGHT=45 and a list viewport of 267 points. The new body role has a 24-point line height. Each item now requires 49 points: 24 text + 24 padding + 1 border. The column title requires 46 points: 21 text + 24 padding + 1 border. The 300-point container therefore leaves a 254-point list viewport.

Opening the picker uses the old measurements in scrollTo. At item index 20, the requested position differs from the correct centering position by 88.5 points before end clamping. The selected item can appear near the viewport edge instead of the expected position.

Minimal fix: derive the scroll calculations from the rendered item and column-title dimensions. If fixed dimensions remain, use 49 and 46 at default font scale. Measurement also handles text scaling.

Source proof: the AST check read the style and constant values directly. Modal timing and native scroll behavior were not tested.

### F3. P2: Give fixed controls enough room for the new line heights

Primary location: components/sanity/RichTextRenderer.tsx:952, :957, :964.

small_input_box receives a 27-point reading line height, 20-point top and bottom padding, a 1-point border, and a fixed height of 60. Its text viewport is only 18 points high. It cannot contain one complete 27-point line box. The existing tight input geometry becomes more restrictive with the explicit line height.

Minimal fix: increase the small input height to at least 69 points at default font scale, or reduce its vertical padding. Prefer a minimum height that can grow.

Related source conflicts:

- components/home/PostDetails.tsx:403: the 44-point comment input has 10-point vertical padding and a 1-point border. It leaves 22 points for a 24-point body line. Increase its height to at least 46, or reduce the padding.
- app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum].tsx:692: the review submit button has height 46 and 12-point top and bottom padding. It leaves 22 points for the new 24-point button line. Use minHeight 48, or reduce the padding.

Source proof: dimensions establish the line-box shortfalls. They do not establish which glyphs each native platform clips or draws outside the box. Native checks remain required.

### F4. P2: Complete the visible text role mappings

The remaining mappings include concrete departures from the selected roles:

- components/learn/PathwayCard.tsx:286: the card title uses typography.label, which has weight 500. The selected card title requires weight 600. Use typography.cardTitle.
- components/onboarding/MonthPicker.tsx:96: the visible date value and placeholder specify only color. They have no text parent from which to inherit the body role. Apply typography.body before the color override.
- app/followers-following.tsx:199 and app/see-more-groups.tsx:137: visible tab labels remain at fontSize 16 with no selected line height. Apply the selected label role and retain the active-state weight override.

These are source mapping gaps. This finding does not include avatar initials, OTP digits, scaled onboarding illustrations, or SpotlightRow.

## Contrast gap retained from HEAD

components/learn/SearchBar.tsx:34, :39 retains text #9F9D9D on #EEEEEE. The computed contrast is 2.33:1. The new 15/21 role does not correct that pair. Use typographyColors.secondary for the visible label.

This pair already exists in HEAD. It is a remaining contrast issue, not a new color regression.

## Checks and limits

- TypeScript: npm run typecheck -- --incremental false passed with exit 0. It checked types while the parent was changing the worktree. It did not test native layout.
- Source dimensions: an AST check confirmed the Checklist metrics, month picker mismatch, small-input shortfall, and comment-input shortfall. These checks used source values. The event-date shortfall found in that run was corrected before the final report.
- Diff whitespace: git diff --check passed at the check time. It did not check rendering.
- Compact partner row: SpotlightRow.tsx matches HEAD byte for byte. Its original 15/13/13/11 sizes remain.
- Reading layout: inspected margins, side padding, paragraph spacing, and bullet spacing remain unchanged in RichTextRenderer and the inspected reading screens.
- Reading corrections: news-detail, tip-detail, Learn task content, lesson activity answer blocks, and practice activity prose changed from body back to reading during this review. I read those corrections and excluded the earlier 17/24 findings.
- Event date correction: EventCard.tsx now uses minimum dimensions and padding for the date pill. It can grow to contain both lines. I excluded the earlier fixed-height finding.
- Text inheritance: inspected nested Text styles and the strong-span path. I found no additional new inheritance defect that I could prove within this review.
- No native proof: no device rendering, Dynamic Type, translated-label clipping, or Simulator checks were performed. The parent owns those checks.
- Scope: this is a focused regression review, not an exhaustive visual audit or a final full-suite gate.

## Inspected hashes

First hash capture:
```text
HEAD a3b39161e8a51707e5f7d329af11d86317715a1a
DIFF_SHA256 e89bfd9e12cc89551d31e9d8c995082a955daf15042d1e2f17c921d8f099b688
MANIFEST_SHA256 566848ab720faaad97ee62496d1c377d75d76a4ab24ba248bda2f3cff0af828f
```

Later tracked diff SHA-256: 51f40fab106df8db43f4cbea790c97c6d1dfd710478e4d342d28b9a32520e3f0

The tracked diff hash excludes untracked files. Typography.ts is included in the file hashes below.

```text
8763f3d25b6c4ee69e8a42e52694677d922f6fc3df58c372dd74398bb97ffc45  unify-front-end/constants/Typography.ts
67670782a1aca62a5523e587071bfc31bdb812db88afff69a5001768f8d470ad  unify-front-end/components/checklist/ChecklistItem.tsx
f27f411709122006218ba11d33c56082abcf240d8ca5e9aa4436357b58129410  unify-front-end/components/partners/SpotlightRow.tsx
8b8c3c07ce35a25021ac8e80e74774fe7656e0371b508b248d754e1413c62a09  unify-front-end/components/onboarding/MonthPicker.tsx
2dca705f43d72321a6e6e6b25723720a637cc09501b7a639d5d3a7f352089cfd  unify-front-end/components/sanity/RichTextRenderer.tsx
ecad69ef59df35a3145806fc5199c113e16e063d8d67fd47c473750d153466e9  unify-front-end/components/home/PostDetails.tsx
200125b21c9ac99fe791d9d94b5b54e5f0d4c4bc176165e6ac6278a8eab423f0  unify-front-end/components/events/EventCard.tsx
7035a1f14e050bc51acf04b5216ffdcb88c934e7173ef3f5126119ef19bd7dfa  unify-front-end/app/news-detail.tsx
509cdfc19cc81a1c8aecfcf7b3024c2a09e80d532a5f367147aeeeddfb7dfa62  unify-front-end/app/tip-detail.tsx
fbef85510dbf2cb088b7a35076c1be5268b324bda5fe89d1d0ac8eab3509a925  unify-front-end/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/activities/[pageNum].tsx
5aee41191aa188ce99e5e144a1db890fe44132fed11e6ae22062495bcef06333  unify-front-end/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice/[practiceId]/activity/[pageNum].tsx
726785692cb7876aca5efad0c9461c83a6dab8ea463f90e0851b2850439c6db9  unify-front-end/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/tasks/[taskId]/index.tsx
92a44ff72bcae7c9cfdbe3e8a9f8993d9a3f4a8b640e5e6932530e3959744ce4  unify-front-end/components/learn/PathwayCard.tsx
928e27902ff02d24285b9bae36f7c32003d59603338e7884d26f0fb048616aee  unify-front-end/app/followers-following.tsx
ccae298b4542a7b546d20dca1711f1e435fac91f3942c5aa7968d8cf1ec5d4d7  unify-front-end/app/see-more-groups.tsx
d81f3793e26351e306f3bbed0a2463498c483fc46eeeecd36d7fe21cc67fbf1c  unify-front-end/components/learn/SearchBar.tsx
d8e37d7b84e8ee3bbda91913612fea543986d5ee40555eafcb970b3488e126f7  unify-front-end/components/ThemedText.tsx
```

Later inspected correction and additional finding file:

```text
c11b8a4230c28c902ef1d42988eff0b58ccaa8099bd70416ac13873d64dffe65  unify-front-end/components/events/EventCard.tsx
b98098ee4dff3a44fe370aed8a2b68d1f165deba45a3e454ea2c3db389c97310  unify-front-end/app/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum].tsx
```

REVIEW_DONE_TYPOGRAPHY_APPWIDE_1
