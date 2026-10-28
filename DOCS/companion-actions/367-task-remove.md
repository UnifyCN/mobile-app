# #367 Confirm and recover task removal across plans and steps

Implementation record for mobile-app#367 (parent #359). Blockers #364 (plans) and #366
(steps) were accepted and integrated at mobile `e30c1902`, web `269a5b93`; this work
starts from those exact commits. Not ticket acceptance: independent review follows.

## What ships

- **One removal path for every entry.** A panel control ("Remove task"), the Checklist
  delete control (when shared task actions are on) and a clear chat command ("Remove
  task: Get a phone plan", 7 languages) all open the same server-owned **removal review**
  (`prepare` with `task.remove`). The review names the task, its current state, the saved
  plans that refer to it, the steps kept as history and the pending reminders that stop.
  Only "Remove task" in that review removes it: an `approved_proposal` bound to the
  review's revision with `removal_confirmed: true`. A command, a control, model output or
  any other evidence never authorizes a removal. Cancel sends nothing.
- **Approved mapping (decided in #360, unchanged).** Content-backed task: the legacy
  dismissal (`user_tasks.dismissed_at`, also when the task has no progress row). Custom
  task: reversible soft removal (`custom_checklist_tasks.removed_at`), hidden from older
  readers by the #361 policy. No row is deleted and no delete trigger is added (the
  rejected #360 trigger broke account deletion). Steps, plan references, receipts and
  reminder history stay; plans read their references through the task rows, so a removed
  task shows as removed in every plan.
- **Undo names the removal receipt** and checks current revisions. Same revision:
  restore. The task was restored elsewhere: `undo_conflict` / `not_removed`, nothing
  changes, nothing offered. It was removed again later: `removed_again`, nothing changes;
  use the newer receipt. A newer edit of the removed task: a reviewed `task.restore`
  (keeps the edit). A plan removed separately is never brought back.
- **Stale views.** An old conversation card or another device: the removal card turns
  historical when the task reads as removed; the task panel shows no review and no
  removal control for a removed task (also an already open review); a stale review
  approval is refused (`task_removed`) and a changed one returns a revised review
  (`needs_review`). Refresh never recreates a removed task.
- **Lifecycle.** Removal sets the legacy removal column, so the #361 trigger stops pending
  reminders in the same transaction (reason `task_removed`). That trigger is the single
  task-lifecycle hook a later reminder schedule (#368) joins. Restore, reopen and Undo
  never restart a stopped reminder. No schedule, notification UI or reminder setting here.
- **Clients (direction B).** Mobile: the review is inline in the task panel of the
  existing Checklist and Companion bottom sheets (progressive disclosure, no new screen).
  Web: the same panel in the existing overlay drawer. Both use one typed contract
  (`task.remove`, `task.restore`, `RemovalProposal`, receipt `plans`/`steps_kept`/
  `reminders_stopped`, `undo_blocked`) and the existing store, retry, lookup and conflict
  paths. All copy is in the `taskRemove` namespace of all 7 locales (real translations).

## Representation decisions

| Question | Decision |
|---|---|
| Removal draft | `companion_proposals.kind = 'task_remove'`, prepared with the current revision bound server-side; never revised (`revise` refuses it). |
| Effects | `companion_remove_effects(user, ref)`: title (custom only), state, revision, removed, plans `{plan_id, goal}`, live steps, pending reminders. Read again at approval; any change returns `needs_review` with the earlier effects as `previous_context`. |
| Removal receipt | outcome result `task.remove` with `removed_at`, `plans`, `steps_kept`, `reminders_stopped`; inverse `task.restore` at the after-revision. |
| Title matching of a command | the client resolves the title against its live Checklist titles (`titleKey` = server `companion_title_key`); none or several: a reply, nothing prepared. Mobile waits up to 5 s for an unread Checklist and otherwise says it could not open the review (never "no such task"). |

## Migration, functions and order

`20261028025026_companion_task_remove.sql` (identity from `supabase migration new`),
mirrored byte for byte in both repos with its rollback
`supabase/rollbacks/20261028025026_companion_task_remove.down.sql`.

- Apply order: #361 `20261025235536` → #363 `20261026165156` → #364 `20261027183338` →
  #366 `20261027183644` → #367 `20261028025026`. Rollback in reverse: #367 before #366.
- New functions: `companion_remove_effects`, `companion_remove_lock`,
  `companion_remove_prepare`, `companion_remove_recheck`, `companion_remove_task`,
  `companion_restore_task`, `companion_undo_remove`.
- **Shared functions replaced** (each keeps its accepted #366 body verbatim and adds marked
  #367 lines; the rollback restores the #366 bodies verbatim):
  `companion_validate_operations`, `companion_check_authorization`, `companion_apply_one`,
  `companion_receipt_summary`, `companion_undo_action`, `companion_prepare_proposal`,
  `companion_recheck_proposal`, `companion_conversation_actions`.
  **Composition note for #365 / #370:** a later migration that replaces any of these must
  start from the #367 body, not the #366 one, or it silently drops removal.
- Widened constraint: `companion_proposals_kind_check` adds `task_remove`.
- Rollback archives removal receipts and drafts to `companion_rollback_archive_367`;
  re-applying restores them (an open review then needs a new review). Removed tasks stay
  removed through a rollback.
- Edge function (web `supabase/functions/companion-actions`): registry entries
  `task.remove` / `task.restore` (approval only), `prepare` for `task.remove`, removal
  command parsing in `commands.ts` (`{kind: 'remove', title}`, `clarify` with
  `intent: 'remove'`).

## How to run

Backend (web repo): `ACTIONS_CONTENT_PORT=<port> supabase/tests/companion-actions/run.sh`
(own project id/ports in its `supabase/config.toml`). Client local-stack checks: after
`ACTIONS_KEEP=1 ./run.sh`, export the printed `ACTIONS_*` plus `ACTIONS_DB_CONTAINER`,
`ACTIONS_REST_CONTAINER`, `ACTIONS_CONTENT_PORT`, then

- mobile: `npx jest __tests__/companionActions/planLocalStack.test.tsx --runInBand`
  (its earlier blocks apply #361-#366; the #367 block applies #367 and refuses an
  out-of-order stack);
- web: `npx vitest run components/companion/tasks/TaskRemovalLocalStack.test.tsx`
  (applies the missing chain in order, refuses an out-of-order stack);
- web browser: `COMPANION_TASK_REMOVE_PORT=<content port> node scripts/verify-companion-task-remove.mjs`.

Both client local-stack files skip without the environment.

## Evidence

See `DOCS/companion-actions/evidence/367/HANDOFF.md` for the test order, red/green runs,
deliberate faults, final gates and proof limits.
