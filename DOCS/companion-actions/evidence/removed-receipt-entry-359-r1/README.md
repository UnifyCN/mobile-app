# Removed receipt entry correction

A failed native Undo left custom:1 removed at revision4. The server still returns its last removal receipt as current and undoable. The native continuation could not open that receipt from the reloaded removal-request card. It correctly kept that case unresolved, even though a new task passed native removal, Undo, TalkBack, focus and composer-scale controls.

Both rendered-card regressions fail on the unchanged approved code at the missing View task button. Neither failure is a setup error. With no in-memory saved phase and no receipt attached to the older proposal, removedNow suppresses its review control and also suppresses all navigation.

The small correction retains View task on a removed card. It uses the existing onViewTask path, not onReviewRemoval. Normal removal drafts still use the review path. Saved receipt cards also use read-only navigation. The existing task panel reads current progress and owns receipt-specific Undo, revision checks and disabled editing. No server, SQL, contract, analytics, copy, locale, style, dependency or lockfile changed.

Seam: the existing rendered-client layer specified by tickets367 and359. Both new tests render the actual TaskActionCards. Their idle store/progress hooks are controlled fixtures. Pressing View task names the task and never invokes the removal-review callback. These tests prove card navigation, not persistence, authorization, native speech or the original task restore. Native proof on the corrected code remains required.

Both tests were written and failed before their implementation. Mobile main CI passes1509 and skips23; separate DST13 passes, natural exit0. Web full suite passes711 and skips13, natural exit0. Normal type checks and changed-file lint pass on both clients, with no lint messages. Web build passed. Both iOS and Android bundle exports also exit0 naturally. Exports are bundling proof only. Original native evidence and failed commands remain unchanged. No old assertion changed.

The new Android native evidence at t3-4f3d53f3 proves only its named custom:2 control and bounded focus/composer controls. The old task remains unchanged with its saved-plan reference history. This correction must be reviewed and tested against that original retained case before it can be marked resolved. iOS/native criterion8 and ticket acceptance remain open. Existing integrations and draft PRs are unchanged by this candidate.
