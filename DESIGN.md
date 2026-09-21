# DESIGN.md — Resources directory (Learn tab)

> Status: current
> Last updated: 2026-09-01
> Scope of this contract: all three Resources screens — the landing screen, the
> category detail screen, and the partner detail screen.

## Job

**User:** People who recently arrived in Canada — immigrants, international
students, and refugees — using the app in British Columbia.

**Situation:** They open the Learn tab and switch to Resources. They may know
exactly what they need ("a job", "my permit") or nothing beyond "I need help".

**Job to be done:** Reach a real organization that will serve them, and know why
that organization can be trusted.

**Success evidence:** A person finds a relevant organization without scrolling
past the fold, and can answer "why is this list trustworthy?" without leaving
the screen.

## Scope

**In:** The landing screen — segmented toggle, header block, search, category
grid, and the "How we choose these" sheet. The category detail screen — back
nav, title block, and the partner list. The partner detail screen — back nav,
identity block, tags, About, Programs, Contact, and the pinned action bar.

**Out:** The Lessons view, touched only where the two views must align. The
partner data model, which is fixed; the redesign fills its fields rather than
changing its shape.

## Source constraints

- React Native / Expo, iOS and Android. Renders inside the Learn tab under a
  shared `TabHeader variant='minimal'`.
- The segmented control sits above **both** views, so any change to it affects
  Lessons as well.
- Directory data is local (`constants/Partners.ts`), 20 organizations across 9
  categories, all BC. One is held inactive pending verification, so 19 render.
- Four locales in lockstep: `en`, `es`, `hi`, `vi`.
- Colour pairs must clear WCAG AA and are covered by
  `__tests__/resources/partnerCategories.test.ts`.

## Current decisions

- **Typeface:** the app's system face (SF Pro), set with `fontWeight`. Funnel
  Sans is reserved for auth and pre-login onboarding.
- **Gutter:** 16pt, matching the Lessons body and Checklist.
- **Header block:** question heading → supporting line → trust link → search.
  No page title; the active segment already names the screen.
- **Header rhythm:** 8 / 6 / 18 / 12. Gaps widen as the relationship between
  elements weakens.
- **Type scale:** heading 24/600, supporting line 16/400 on `#000` — both
  matched to the Lessons greeting and subtitle.
- **Category card:** white fill, 1pt `#E7E4DE` border, radius 20, PathwayCard's
  shadow, soft-tinted icon chip. It must not compete with the Lessons cards.
- **Icons:** committed SVGs in `assets/icons/resources/`, exported from Figma.
  Not an icon font — `passport` has no MaterialIcons equivalent.
- **Search:** inline client-side filter, not a route. It never goes in the nav,
  where the same pill navigates to global search on Social.
- **Trust link:** its own line under the supporting copy, opening a bottom sheet.
- **Partner card:** the same card as a category tile — white fill, 1pt `#E7E4DE`
  border, radius 20, the shared Learn shadow. A partner list is a list of cards,
  not divided rows, so the two Resources screens use one card language.
- **Cost chip:** colour-carrying. Free and mixed take their own pair; paid takes
  the neutral of the service-area chip beside it, leaving "Free" as the only chip
  in a row that draws the eye.
- **Category detail title:** 24/600, the landing heading's size and weight, not
  the spec's 24/700.
- **Partner detail keeps the tab chrome.** It renders under the shared
  `TabHeader variant='minimal'` with the tab bar visible, and opens with a back
  nav, exactly like the category detail it comes from. The old hero banner and
  floating back button are gone; an organization page is a reference page, not
  an immersive one.
- **Partner detail structure:** back nav → identity (54pt logo, name, tagline) →
  category and service-area tags → About → Programs → Contact → pinned actions.
- **Programs replace the highlights bullets.** "How they help newcomers" is off
  the screen; the program cards carry what an organization does, in the
  organization's own named terms. `highlights` stays in the model because search
  indexes it.
- **Programs collapse after three,** with a "Show N more programs" disclosure.
  Five-program organizations otherwise push Contact off the second screen.
- **Contact is a data-driven list of labelled rows.** Every populated field
  renders and nothing is inferred, so two organizations rarely show the same
  rows. Eligibility leads it as "Who it's for".
- **Actions are pinned above the tab bar,** not inline at the end of a long
  scroll: primary "Visit website" plus icon buttons for call and directions.
  Email lives as a trailing link on its own Contact row, the same slot the
  address uses for "Map".

See `.design/decisions.md` for rejected options and why.

## Content and hierarchy

1. The question a newcomer is holding — "Where can I get help?"
2. What the list is, and why it can be trusted.
3. Search, for people who arrived with a specific need.
4. The nine categories, for people who did not.

## Visual language

**Direction:** Quiet and civic. The directory is a reference, not a destination —
it should read as calmer than the Lessons cards one toggle away.

**Typography:** System face throughout. 24/600 heading, 16/400 body, 13.5/700
card titles, 11.5/500 counts.

**Colour:** `RESOURCE_THEME` is the single source. Nine category tints pair with
a darker glyph of the same hue; the contrast suite reads each glyph fill out of
its SVG so the pair cannot drift. Cost is the one other field that carries
colour, through `COST_CHIP`.

**Spacing and density:** 16pt gutter, 10pt grid gap, two columns. Card labels
reserve two lines so a wrapping title does not make its row taller.

**Iconography:** One committed SVG per category at 20pt inside a 32pt chip. Every
other glyph is Feather — unlike the category set, each one the spec asks for has
a Feather equivalent.

**Motion:** None beyond the bottom sheet's existing spring and pan-to-dismiss.

## Behaviour and states

- Default: category grid.
- Typing: grid is replaced by matching partners across all categories, with a
  result count. Every whitespace token must match; accents are stripped. The
  index is the copy on screen, so a query matches in the language being read.
- No matches: empty state echoing the query.
- No partners at all: "We're adding partners" empty state.
- Non-English locale: nothing special. Partner copy is translated like the rest
  of the app, so the old "English only" notice is gone.
- Category tapped: detail renders in place, not pushed. Back nav returns to the
  grid and reads "Resources", the segment it returns to.
- Category with no active partners: "No active partners" empty state.
- Partner tapped: pushes `app/(tabs)/Learn/resources/[slug]`. Its back nav names
  the category, except when the person arrived from search — the push then
  carries `?from=search` and back reads "Resources", the screen it returns to.
- Partner with more than three programs: the rest are behind a disclosure.
- Partner with no programs: About runs straight into Contact.
- Partner with no website: the pinned bar promotes Call to the primary slot.
- Unknown slug: "no longer available", with the back nav still present.

## Responsive and accessibility

- Every `RESOURCE_THEME` foreground/background pair clears AA, enforced by test.
  Three swatches ship a step darker than Figma for this reason.
- The segmented control is 37pt with `hitSlop` to clear 44pt.
- The trust link and the category-detail back nav are `TouchableOpacity` sized to
  their label and grown to 44pt with `hitSlop`. A 44pt `minHeight` would centre
  the label and leave dead space above it.
- Heading carries `accessibilityRole='header'`; tiles announce label + count.

## Tokens and components

- `constants/ResourceTheme.ts` — surfaces, text, accents, `COST_CHIP`
- `components/learn/Resources/PartnerRow.tsx` — the partner card. It renders in
  the category detail list **and** in the landing screen's search results, so it
  carries its own bottom margin and any change lands on both.
- `app/(tabs)/Learn/resources/[slug].tsx` — the partner detail screen
- `types/partner.ts` — category order, labels, colours, tints, and the
  `LocalizedPartner` shape components render
- `constants/Partners.ts` — the directory's **structure only**: slugs, category,
  contact values, logos, ordering. Every displayed string lives in the locale
  files under `learn.resources.partners.<slug>`.
- `utils/localizePartner.ts` — resolves a record's copy for the active language.
  Keys are derived from the slug and the program id, so a record cannot drift
  from its copy; `__tests__/resources/partnerCopy.test.ts` asserts both
  directions.
- `components/common/BottomSheet.tsx` — the sheet (**not** `@gorhom/bottom-sheet`,
  which is not installed despite what CLAUDE.md says)

## What this is not

- Not a search product. With 20 organizations, browsing stays the primary path.
- Not a task router. Leading with three "I need…" shortcuts was explored and
  rejected for want of data on which three actually lead.
- Not a place for the nav search pill. That pill means "global search" elsewhere.

## Acceptance criteria

- [x] Six category cards above the fold on iPhone 17 Pro
- [x] Search filters name, tagline, service area, programs, highlights, category
      — against the translated copy, in whatever language is active
- [x] Empty and no-result states render
- [x] All six locales in parity, partner copy included
- [x] Contrast suite passes for every token pair, every category glyph, and all
      three cost chips
- [x] Partner cards render in both the category list and the search results
- [x] Partner detail renders every populated field and infers none
- [x] Program disclosure, missing-website, and unknown-slug states render
- [ ] Every organization's contact details and programs verified from its own
      site
- [ ] Verified on Android
- [ ] Verified at the largest Dynamic Type setting

## Open decisions

- Whether the Lessons view adopts the same 16pt subtitle treatment, or keeps its
  24pt greeting over 16pt copy as-is.
- Whether search queries that return nothing should be tracked, to reveal which
  organizations are missing from the directory.
