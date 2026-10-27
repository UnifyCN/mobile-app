# #364 Settlement plans: review, approve, reopen (mobile and web)

Spec: UnifyCN/mobile-app#359. Ticket: #364. Builds on #360-#363. Work in progress;
this file is kept current while the slice is built.

## Shared-contract interface (recorded early for the #366 sibling)

The plan domain is kept out of every shared #361/#363 function so the step slice
(#366) can extend the shared registry without either migration overwriting the
other's dispatch snapshot.

- SQL: migration `20261027183338_companion_settlement_plan.sql` only *adds*:
  columns on `companion_plans`, the table `companion_plan_proposals`, and functions
  named `companion_plan_*` / `companion_plans_read`. It does **not** `create or replace`
  `companion_validate_operations`, `companion_check_authorization`,
  `companion_apply_one`, `companion_apply_actions`, `companion_undo_action`,
  `companion_receipt_summary` or `companion_conversation_actions`.
- It *calls* the shared `companion_apply_one` (task.create_custom) and
  `companion_record` for each added task, so every added task has the normal
  task receipt and #363 Undo. If #366 replaces `companion_apply_one` it must keep
  the `task.create_custom` branch (it already has to, to keep #363).
- Plan receipts live in `companion_action_receipts` (shared operation-id space)
  with `task_ref` null, `inverse` null and `outcome.plan_id` set. The shared Undo
  answers `not_undoable` for them; plan Undo is its own action.
- Proposal statuses/kinds are not widened in `companion_proposals` (plan drafts
  have their own table), so no shared check constraint is replaced.
- Edge function: new module files `plans.ts` (parsing) and `planHandler.ts`; in
  `handler.ts` one import and one dispatch block before `parseAction`, plus the
  `ResultLine.action` type widened. `contract.ts` is unchanged.
- Rollback: `rollbacks/20261027183338_companion_settlement_plan.down.sql` must run
  before the #363 and #361 rollback scripts.

No shared conflict currently blocks a mutation.
