# Design decisions

Keep history here; keep `DESIGN.md` current.

| ID | Date | Status | Decision | Why | Evidence | Supersedes |
|---|---|---|---|---|---|---|
| D-001 | 2026-08-28 | proposed | {{decision}} | {{reason}} | {{links}} | - |

## R1 — Entry model for the Resources header band

**Date:** 2026-08-28
**Decision:** Option B, "Orientation" — a 22pt question heading plus one supporting
grey line, then the search field.

**Accepted because:** the band should orient a newcomer who does not yet know the
vocabulary. B is the only option that answers the question the person is actually
holding when they open the tab.

**Rejected:**
- **A, Nav search** — biggest density win (30pt band, 8 cards above fold) but the
  nav pill would filter on Learn and navigate on Social. One shape, two meanings.
- **C, Search first** — good chips, but with 23 organizations a specific query
  often returns little.
- **D, Proof bar** — same height as today and carries real evidence; still live as
  a mix candidate with B.
- **E, Needs first** — best task-fit, costs 140pt and needs data on the top three
  jobs that we do not have.

**Open (R2):** where the "How we choose these" trust link goes, now that B's
heading and grey line replaced the sentence that used to carry it.

## R2 — Placement of the "How we choose these" trust link

**Date:** 2026-08-28
**Decision:** B1, inside the supporting-copy block, but on its own line rather
than inline in the sentence.

Final band, top to bottom: 24pt question heading → 16pt supporting line → teal
underlined trust link → search field. 141pt, matching the 140pt held constant
across the R2 bench.

**Accepted because:** the link keeps a full line of its own, so it is a real tap
target and cannot blend into grey body text, and it needs no new string —
`learn.resources.howWeChoose.link` already ships in all four locales.

**Rejected:**
- **B2, heading row** — highest contrast, but needs a shorter label added to four
  locales, and a terse action beside a question can read as help about the
  question rather than about the list.
- **B3, after the grid** — free above the fold, but invisible to anyone who taps
  straight into a category, which is when the trust claim matters most.

**Deviation from the R2 mock:** the mock set the heading at 22pt and the
supporting line at 15pt grey. Shipped at 24pt / 16pt black instead, carrying
forward the earlier decision to match the Lessons greeting and subtitle. The mock
predated that alignment; this is the correction, not an override.

**New string:** `learn.resources.heading` in en/es/hi/vi. Parity holds at 971.

## R3 — Vertical rhythm in the header block

**Date:** 2026-08-28
**Decision:** S3, "Stepped" — 8 / 6 / 18 / 12.

heading →8→ subtitle →6→ trust link →18→ search →12→ grid. Band 155pt, 14pt
taller than shipped. Still six cards above the fold, so the choice cost nothing
in density.

**Accepted because:** gaps widen as the relationship between elements weakens.
The shipped block had subtitle→link at 0pt, which made the link read as a third
line of the paragraph rather than a tap target. 6pt lifts it clear while keeping
it in the copy group it explains; 18pt closes the block before the input.

**Rejected:**
- **S2, two groups (10/2/16/12)** — 2pt is a hairline and does not fix the defect.
- **S4, open (12/8/22/14)** — calmer, but sparse against the dense Lessons view
  one toggle away.
- **S5, link with search (8/14/10/12)** — groups the link with the input, which
  misreads it. It opens a sheet of vetting criteria; it does not filter anything.

**Implementation note:** the gap sits on the TouchableOpacity wrapper
(`styles.linkButton`), not on the Text, because the link shares `styles.subtitle`.

## R4 — Category detail screen (Figma 8129:32881)

**Date:** 2026-08-30
**Decision:** Build the node as drawn, with four corrections carried forward from
the landing screen and one addition.

**The change that matters** is the partner row. It was a hairline-divided list
row; it is now a card — white fill, 1pt `#E7E4DE`, the shared Learn shadow. The
node draws radius 16; shipped at 20, matching the category tile the list sits one
tap behind. A partner list is a list of cards, not divided rows.

**Corrections carried forward:**
- **Funnel Sans and Nunito Sans → the system face.** The node sets the title,
  description, tagline and chips in Funnel Sans and the card name in Nunito Sans
  ExtraBold. Same correction as the landing screen; same reason.
- **20pt gutter → 16pt.** `CategoryDetail` renders inside `ResourcesView`'s
  padding, so it inherits this rather than setting it.
- **Title 24/700 → 24/600.** The landing heading's weight, so the two Resources
  screens read as one.
- **Material Symbols → Feather.** Unlike the category glyphs, every icon this
  node asks for (`location_on`, `chevron_right`, `arrow_back_ios_new`) has a
  Feather equivalent, so no new committed SVGs.

**Addition — the cost chip carries colour.** Free takes `#0F766E` on `#E6F7F4`,
mixed `#9A6318` on `#FDF1E2`, both straight from the node. All three pairs clear
WCAG AA unaltered, which is a first for this feature — the landing screen needed
three swatches darkened.

**`paid` is ours.** The node draws free and mixed only. Paid takes the neutral of
the service-area chip beside it (`#6F6C64` on `#F4F2EE`, 4.69:1), which leaves
"Free" as the only chip in a row that draws the eye. Cost is the field a newcomer
scans a directory for, and "free" is the answer that changes what they do next.

**Rejected:**
- **A third hue for `paid`** — colour-codes all three states, but then every row
  carries two coloured chips and nothing stands out. Colour should mark the
  exception, not the enumeration.
- **The node's flatter shadow** (`0 1px 1px rgba(30,25,15,0.04)`) — the tiles one
  tap back use PathwayCard's, and two shadow depths inside one feature read as an
  error rather than a hierarchy.

**Copy change:** `learn.resources.cost.mixed` shortened from "Free + paid options"
to "Free + paid" in all four locales, so the chip fits beside the service area
instead of wrapping the row. It also appears on the partner detail screen, where
the shorter form reads no worse. Parity holds at 971.

**Blast radius:** `PartnerRow` renders in the category list **and** in the landing
screen's search results. Both were verified on an iPhone 17 Pro; the search
results are where all three cost chips appear together.

**Not fixed here — two data gaps the node exposes:**
- The node draws "Free" on DIVERSEcity and Burnaby Neighbourhood House. Neither
  carries an org-level `cost`; the value sits on their programs. `types/partner.ts`
  states that an absent value means the partner does not publish one, and must
  never be inferred — routing someone to a service they cannot afford or qualify
  for is this feature's main failure mode. The cards ship without a cost chip.
- The node draws real partner logos. No partner in `constants/Partners.ts` has a
  `logo`, so every card falls back to a monogram. That is an asset task, not a
  design one.

**Correction after review (2026-08-30):** the back nav shipped with
`minHeight: 44`, which centred its label and left ~14pt of dead space between the
segmented control and the label — Savar flagged it on device. It now sizes to its
label with `paddingVertical: 2` and reaches 44pt through `hitSlop`, the pattern
the landing screen's trust link already uses. The label now starts the same
distance below the segmented control as the landing heading does.

## R5 — Partner logos as square symbol marks

**Date:** 2026-09-01
**Decision:** Ship each partner's symbol, not its horizontal wordmark lockup.
17 of 20 partners now carry a logo; 3 keep the monogram.

**Why the wordmark fails.** The card gives the logo a 44pt square box. Measured
against the assets each organization actually publishes, 13 of 20 are horizontal
lockups between 2.7:1 and 7.5:1. With `contentFit: 'contain'` those render 6 to
16pt tall — a grey smudge, not a logo. Only YMCA BC filled the box, and only
because its lockup happens to be stacked.

Re-reading the Figma node settled it: the designer used squarish marks on all
three cards. The card prints the organization name in text beside the logo, so
the mark has to be recognisable, not legible.

**Sourcing.** Every one of the 20 has a symbol somewhere, but only 8 publish it
as a standalone file. Five were isolated from a lockup — DIVERSEcity, Surrey
LIP, Surrey Libraries and Desjardins by clipping the SVG viewBox, Delta LIP by
cropping the raster. Two came from another domain: YMCA BC publishes no clean Y,
so the mark comes from YMCA Canada, and SFU's comes from sfu.ca rather than the
ISS page.

**Three are genuinely wordmark-only** and keep the monogram: IEC-BC, Fraser
International College, AMSSA. None of the three owns a pictorial element. Their
own site icons are centre-crops of the wordmark — IEC-BC's reads "NEC BC".

**Normalisation.** 256px, covering the 44pt card and the 62pt partner detail at
@3x. Transparent padding is trimmed so every mark fills its box. Four are left
untrimmed because the coloured ground is part of the mark: SFU, Desjardins, TuGo
and Trout Lake. `Monogram` drops its `#F2F2F2` plate for the same reason — a
plate here would double the two that carry their own.

**Rejected:**
- **Widening the logo box** to fit horizontal lockups — a 4:1 mark still renders
  short, and it breaks from the node for no gain.
- **Keeping SVG as SVG.** Metro's transformer makes `.svg` a component, so it
  would need a second path through `Monogram` and a union type. At 44 and 62pt a
  256px PNG is indistinguishable, and brand SVGs (22-55KB, gradients and clip
  paths) are a real `react-native-svg` risk that our 9 hand-made glyphs are not.

**Traps caught by inspection, not by metadata** — each of these has a plausible
filename and correct dimensions, and each is wrong:
- Delta LIP's site icon is the Karbon theme's demo favicon: a black square with
  a white "K". Trout Lake's is the web agency's "RB" monogram.
- `Temp-Delta-LIP-Insta-Logo-3-1.png` is a photograph of three people.
- Desjardins' colour PNG symbol is a hollow hexagon whose interior is white — it
  would have vanished on the white card. Their header SVG is all-white knockout.
- Global Connect's `gcm_logo_square.png` is 512x422 and stacked; VPL's
  `vpl-logo-white-blocks-200x200.png` is 200x60 and entirely white.

**Open, pending Savar seeing them on device:**
- Trout Lake ships with its `#EFF5F9` ground. A knocked-out version is generated.
- Burnaby Neighbourhood House ships cropped to its illustration. Trimming made
  the crop 2.1:1, so it renders smaller than its neighbours; the uncropped icon
  fills the box but buries its wordmark. Neither is good.


## R6 — Partner detail: the organization page

**Date:** 2026-09-01
**Figma:** `8134:34041` ("org page")
**Decision:** Rebuild `[slug].tsx` as a reference page inside the tab chrome.

**The hero goes.** The old screen opened with a 180pt photo or category gradient
and a floating back button over it. No partner ships a `heroImage`, so every one
of the 20 rendered the gradient — 180pt of colour carrying no information, above
the fold, on every organization. The node replaces it with the tab header and a
back nav, which is what the two screens behind it already do. `Partner.heroImage`
is deleted rather than left as a hook nothing fills.

**Programs replace the highlights bullets.** The node has no "How they help
newcomers" section. It is the right cut: `highlights` is our prose about an
organization, `programs` is the organization's own named services, and the second
is both more useful and more defensible. `highlights` stays in the model because
`selectPartnersMatching` indexes it.

**Three programs, then a disclosure.** Five organizations run five or more
programs. Listing them all pushes Contact past a second screen of scrolling on an
iPhone 17 Pro, and Contact is the part someone came for.

**Contact renders what is populated, in a fixed order.** The node shows exactly
the five rows DIVERSEcity has data for — the designer was rendering real data, so
the block is a data-driven list, not a fixed five. Hours, languages and cost take
the same row treatment; an organization that publishes none of them simply has a
shorter block.

**Eligibility is a row, not a callout.** It keeps the first slot in Contact,
because routing someone to a service they are not eligible for stays this
feature's main failure mode. It loses the tinted box: on a page whose only other
tint is the category tag, a second tinted block reads as an alert.

**Actions pin above the tab bar.** The primary CTA used to sit at the bottom of a
scroll that can run 1200pt. Pinned, "Visit website" is reachable at any scroll
position, and the two 48pt icon buttons beside it cover call and directions.

**Email keeps an action.** The node's contact rows are `justify-between` with a
link slot on the right, used for the address's "Map". Email takes the same slot
rather than a fourth button in the bar.

**Back names where you came from.** From a category the nav reads the category,
as drawn. From the landing screen's search results the same label would be wrong,
so that push carries `?from=search` and the nav reads "Resources".

**Rejected:**
- **Keeping the hero as a category gradient.** It is decoration that costs the
  fold, and it made the partner detail the only Resources screen with a coloured
  header.
- **Dropping hours, languages and cost** to match the five rows drawn in the
  node. The node is one organization's data, not the schema.
- **Rendering `highlights` only for organizations with no programs.** A section
  that appears for 2 of 20 records is a hole in the layout, not a fallback. Those
  organizations get real programs instead.
- **A fourth icon button for email.** Four buttons in a 393pt bar leaves the
  primary CTA too narrow for "Book a free assessment".

## 2026-09-18 — Canada Shaws listing: brand resolved by the partner

**Canada Shaws Consulting Inc. is the brand.** The open question was which of
the two live sites (immshaws.com vs canadashaws.ca) the directory shows. The
partner settled it on a call and by email on 2026-09-18: Canada Shaws Consulting
Inc. holds the licensed consultants and signed the agreement, so the listing
carries that name, the 672 number, `info@canadashaws.com`, and the Cooney Rd
address. The referral link stays on `immshaws.com/unify/` — clients land there
and sign with Canada Shaws.

**Logo stays.** The partner reviewed the shipped "S" mark and asked to keep it
for now, reversing the change-to-CanadaShaws request from the call.

**Cost is `mixed`.** Initial assessment is free; everything after is paid.

**Three of five programs link out.** The partner sent name + description only;
the Study, Work and PR programs map to the hub pages on canadashaws.ca (the
firm's English site), opened in the in-app browser. Visas & Extensions and
Other Services have no page there, so they stay display-only. Those links
bypass the `immshaws.com/unify/` referral page; the primary CTA still goes
through it, and our own analytics count program taps.

**Rejected:**
- **Renaming the slug** to match the new name. It is the route and analytics
  key; a rename would split the referral funnel across two identifiers.
