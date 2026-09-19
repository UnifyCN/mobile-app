# DESIGN.md — Checklist 2.0 (Checklist tab)

> Status: current, built on branch feat/checklist-2, in review
> Last updated: 2026-09-03
> Scope of this contract: the Checklist tab screen, its task sheet, the add
> flow, and the reminder behaviour behind it. Separate from the repo-root
> `DESIGN.md`, which covers the Resources directory.

## Job

**User:** A newcomer in their first three years in Canada, most often an
international student or skilled worker in BC or Ontario, holding one or more
documents that expire: study permit, work permit, PR card, health card,
insurance. They open the Checklist tab between other things, on a phone, often
weeks apart.

**Situation:** Today the tab is a flat list of persona-and-stage tasks in four
urgency buckets. Nothing on it carries a date, so it cannot answer the question
that brings them back: "what do I have to do next, and by when?"

**Job to be done:** Know the next thing I must do and its deadline, be told
before it is too late, and tick it off.

**Success evidence:**
- A user can add a document expiry in under 30 seconds from the tab.
- Any item due within 7 days is visible without scrolling.
- Users who complete at least one task rise from 6 of 69 tab visitors
  (PostHog, 90 days to 2026-09-03) to a majority of visitors.
- `push_permission_granted` and reminder taps appear in PostHog after the
  1.6.1 binary ships.

## Scope

**In:** The Checklist tab screen. The task detail sheet. The add flow,
extended with a date. A new "deadline" item type (document or event with a due
date, stored as a date only). Reminders at 90, 30, and 7 days before a
deadline. A "due this week" grouping. Overdue, due-soon, upcoming, done, and
empty states.

**Out:** Storing document scans or numbers. Authoring new Sanity checklist
content. Changing onboarding. The web app (the design must be portable, the
build is mobile only). Calendar sync. Sharing.

## Source constraints

- **Layered UI first.** Sub-tasks use bottom sheets and inline expansion, not
  new screens (`Unify/CLAUDE.md`, "UI patterns"). The add flow is currently a
  full screen (`app/(tabs)/Checklist/create-custom-item.tsx`); the redesign
  may keep or fold it.
- **Existing components:** `components/checklist/ChecklistItem.tsx` (white
  card, radius 12, border `#D6D5D5`, title 15pt `#0F172A`, meta `#94A3B8`),
  `ChecklistSectionHeader.tsx` (icon tile radius 10, 16pt title, 14pt count),
  `TaskDetailModal.tsx` (bottom sheet: bucket pill, title, "Why", green
  complete button, "Learn how" link), `components/common/BottomSheet.tsx`,
  `TabHeader`. Screen uses the system font (no `fontFamily` set), 24pt title,
  progress bar radius 5 on `#eaeaea`, "+ Add" pill radius 20 in black.
- **Bucket palette** (`constants/ChecklistPriority.ts`): Do now `#E03B3B` on
  `#FBCFCF`; Do soon `#F47734` on `#FBE4CF`; Explore and connect `#F49E34` on
  `#FFEDBD`; Optional / later `#5E8651` on `#CDE9D2`. Brand orange
  `#f68b26` (`constants/Theme.ts`). Destructive `#FF3B30`.
- **Data model:** tasks come from Sanity `checklist` documents (class, stage,
  personas, link) joined to `user_tasks` for completion; custom tasks live in
  `custom_checklist_tasks` with the same four buckets; order in
  `checklist_task_order`. No date column exists anywhere today.
  `personalized_checklist_tasks` carries unused `show_after_days` and
  `show_before_days` columns. Deadlines need a new user-owned table.
- **Bucket vocabulary is load-bearing.** It is in Sanity, the custom-task form,
  the personalize edge function, and all four locales. It must survive as a
  facet even if it stops being the primary grouping.
- **Notifications:** push tokens and an Expo-push edge function pattern exist
  (`send-learn-reminders`, cron-driven tiers). Nothing schedules local
  notifications. `expo-notifications` is already in the binary, so local
  scheduling needs no native change. PR #293 fixed permission tracking.
- **i18n:** en, es, hi, vi. Every new string lands in all four.
- **Ship path:** 1.6.1 binary, so no OTA constraint on this work.
- **Store dates only.** Never a scan, a number, or a photo of a document.

## Current decisions

- **Time horizons group the list; buckets are tags.** Three groups: This week
  (due within 7 days, plus overdue at the top), Next 30 days, Later. Undated
  tasks land by bucket: Do now → This week, Do soon → Next 30 days, Explore
  and connect and Optional / later → Later. A user-set date overrides the rule.
- **Undated cards show their bucket tag and a "Set a date" affordance** so
  the invisible bucket-to-horizon rule is discoverable.
- **The screen title is the first horizon** ("This week") with the persona
  and month as subtitle.
- **Deadline sheet** shows days left as the primary figure, the date, the
  90/30/7 reminder pills (past ones struck), Edit date, Mark as done.
- **Add flow is a bottom sheet**, not the current full screen: type chips,
  name, date, reminders, "only the date is saved" note.
- History and rejected options: `.design/decisions.md`.

## Content and hierarchy

1. What is overdue or due within 7 days, with the date and days left.
2. The next actions after that, in time order.
3. Everything else, still findable by bucket.
4. Add a deadline or a task.

## Visual language

**Direction:** Same system as the rest of the app. The change is structural,
not cosmetic. Time gets a visual grammar (countdown, date, overdue) that the
bucket palette does not currently provide; this must be added without a new
colour family beyond destructive red for overdue.

**Typography:** system font; 24pt screen title, 16pt section, 15pt card title,
13 to 14pt meta, as today.

**Color:** bucket palette as tags. Overdue uses `#FF3B30`. Due-soon reuses Do
now red `#E03B3B`. Done uses the existing green.

**Spacing and density:** card rhythm as today (12pt radius, 16pt horizontal
gutter). Denser than today is acceptable if titles stop truncating.

**Iconography:** MaterialIcons, as the bucket headers use.

**Motion:** completion tick and the existing milestone celebration. Reduced
motion: no confetti, tick still animates opacity only.

## Behavior and states

- Deadline item: type (permit, PR card, health card, SIN, tax, insurance,
  other), label, date. Edit and delete from its sheet. Mark done.
- Reminders scheduled locally at 90, 30, 7 days, 9:00 local, cancelled on
  done or delete. Tapping a reminder opens the tab with the item highlighted.
- States: no deadlines yet (empty, with a prompt to add the first); overdue;
  due within 7 days; upcoming; done; all caught up; notifications denied
  (inline note with a path to Settings); offline (cached list, add queued).
- Existing tasks keep complete, undo, "Learn how", custom add. Drag reorder is
  removed: time orders the list (see `.design/decisions.md`).

## Responsive and accessibility

- iPhone SE through Pro Max widths. Titles never clamp below 3 lines.
- Dynamic Type up to accessibility sizes without overlap.
- Every card is one accessible element with a label that includes the date
  and days left. No drag handles remain (reorder removed).
- Contrast: all text on bucket tints at 4.5:1 or better.

## Tokens and components

- `constants/Theme.ts`, `constants/ChecklistPriority.ts`
- `components/checklist/*`, `components/common/BottomSheet.tsx`

## What this is not

- Not a document wallet. No scans, numbers, or uploads.
- Not a calendar. No month grid.
- Not a new tab or a new full-screen destination for deadlines.
- Not a restyle of the same flat list.

## Acceptance criteria

- [x] From the tab, a user adds a study permit expiry and sees it in the
      right time group without leaving the tab.
- [x] An item due in 5 days is visible at the top of the screen on launch.
- [ ] Reminders are scheduled, visible in the OS, and cancelled on completion.
      (unit-tested; needs a physical-device pass, simulator reports unsupported)
- [ ] All states above render on the simulator with real data shapes.
      (captured: empty dates, add, deadline, done, linked date, Dynamic Type AX;
      not captured: caught-up week, offline)
- [x] Every new string exists in en, es, hi, vi.
- [x] Existing Jest suites pass; new logic (time grouping, reminder dates) has
      pure-logic tests.

## Open decisions

- None.
