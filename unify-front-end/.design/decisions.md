# Design decisions — Checklist 2.0

Reverse-chronological. `DESIGN.md` holds current truth only; this file holds the reasoning.

## 2026-09-03 — Workspace placed at `unify-front-end/`, not the repo root

The repo-root `DESIGN.md` and `.design/` belong to the Resources directory work (focused route, build phase, two blocking open decisions). Checklist 2.0 is a separate surface with its own contract, so it gets its own workspace one level down. Both are tracked in git.

## 2026-09-03 — Baseline scored before exploration

Weighted 4.7/10 on the native rubric; limiting dimension is task fit. See `.design/reviews/baseline-2026-09-03.md`. Diagnosis: structural (no concept of time), not visual. Exploration therefore varies information hierarchy, holding tokens and components constant.

## 2026-09-03 — Store dates only

Deadline items hold a type, a label, and a date. No document numbers, scans, or photos. Reason: the app has no compliance posture for identity documents, and the mobile-fit feedback on record says sensitive document storage does not belong in this product.

## 2026-09-03 — Contract approved (gate 1)

Savar approved the DESIGN.md contract as written, including the three assumptions: bank tasks may take a user-set date but are not deadlines by default; reminders are local-only this round; web parity is out of scope for the build. Exploration round 1 varies D1 (how time organizes the screen) across three options: Timeline, Horizons, Dates board.

## 2026-09-03 — Direction gate: Option B "Horizons" selected (D1 resolved)

Savar chose B over A (Timeline) and C (Dates board), reason given: "much more organized". Resolution of D1: **time horizons group the list** (This week, Next 30 days, Later); **buckets become tags** on each card. Undated editorial tasks land in a horizon by bucket: Do now → This week, Do soon → Next 30 days, Explore and connect and Optional → Later. A user-set date overrides the bucket rule.

Rejected:
- A Timeline — the editorial structure vanished and day one looked unfinished.
- C Dates board — two systems on one screen; items due in 8–90 days never reached the list.

Carried into the build from the round's invariants: the deadline sheet (days left, 90/30/7 reminders, edit, mark done), the add sheet (type chips, date, "only the date is saved"), and the task sheet's Why and Learn how.

Known cost accepted: the bucket-to-horizon rule is invisible. Mitigation in build: undated cards in "This week" show the bucket tag and a "Set a date" affordance so the user can see the item has no real deadline.

## 2026-09-03 — Build decisions and defects fixed on the simulator

- **Drag-to-reorder removed.** Manual order was stored per urgency bucket; with time as the grouping, a hand-ordered list would fight the date sort and the persisted order had no home. Time orders the list now. `checklist_task_order` stays in the schema, unused by the mobile client.
- **Leading horizon header hidden.** The screen title names the leading horizon, so the first section header is skipped and its date range and count move under the subtitle. Seen as a duplicate "This week" three lines apart on the first render.
- **Deadline sheet chips.** "90 days before" ×3 overflowed the row at 372pt; the sheet now shows "90d / 30d / 7d" and the sheet height dropped from 0.62 to 0.5 of the screen.
- **Inline "Set a date" on cards.** A nested Text press inside the gesture-handler touchable was swallowed; the card is now a react-native TouchableOpacity with a nested Pressable.
- **Linked-date sheet height** sized to its content (0.56) instead of the full add sheet (0.86).
- **JS date picker** instead of `@react-native-community/datetimepicker`: no new native dependency, and the onboarding MonthPicker already set the precedent for a JS picker in this app.
- **Reminders on the simulator** report `unsupported` (not a physical device) and schedule nothing; the scheduling path is covered by unit tests and needs a device pass before ship.

## 2026-09-03 — Independent review R1: 6.8/10 (+2.1), gates pass

Fresh-context reviewer (Sonnet 5) scored the build against the native rubric. No blocker. Follow-ups accepted: re-capture of the deadline sheet after the chip fix (done, `checklist2-deadline-sheet-done`), Dynamic Type evidence (done, `checklist2-dynamic-type-ax-xl`), reminder behaviour on a physical device (open), offline and caught-up captures (open). Deferred as polish: a stronger visual cue separating dated from undated rows inside "Later".
