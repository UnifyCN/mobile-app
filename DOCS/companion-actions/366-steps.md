# #366 Track one level of task steps without automatic parent completion

Spec: UnifyCN/mobile-app#359. Ticket: #366. Builds on #360-#363 (accepted, integrated at
mobile `0d941015`, web `02377a33`). Started 2026-10-27. Work in progress; the final
evidence section is filled in at handoff.

## Shared-interface needs (recorded first, for #364 plans)

#366 and #364 both extend the same database action functions. These are concrete, not
hypothetical: the #361/#363 functions below are one SQL body each, and each later
migration that adds an operation must `create or replace` them. Whichever of #364/#366 is
accepted second must re-compose these bodies so that both domains survive. #366 keeps
every accepted #361/#363 branch verbatim and only adds a narrow dispatch to step-owned
functions, so a re-composition is a merge of added branches, not a rewrite.

| Shared function (current owner) | What #366 adds | Composition rule for #364 |
| --- | --- | --- |
| `companion_validate_operations` (#363) | `step.*` types call `companion_step_validate(op)` | add a `plan.*` dispatch next to it; keep the `step.*` line |
| `companion_check_authorization` (#363) | step removal confirmation; `ui_control` step rules; compensation check for `step.remove_created` | add plan rules as separate branches; keep the step block |
| `companion_apply_one` (#363) | `step.*` types call `companion_apply_step(user, op)`; a completion result records the step counts | add a `plan.*` dispatch; keep the step dispatch and counts |
| `companion_receipt_summary` (#363) | step receipts (`steps`, historical titles, per-step `current`) | add plan fields as another `case`; keep the step case |
| `companion_undo_action` (#363) | a receipt of a `step.*` operation goes to `companion_undo_step` | add a plan dispatch; keep the step dispatch |
| `companion_read_tasks` (#361) | `last_receipt` excludes step receipts (a step change is not the task's last state change) | keep the filter |
| `companion_prepare_proposal`, `_revise_`, `_cancel_`, `_recheck_`, `companion_conversation_actions` (#363) | proposal kind `step_create` with its own context function `companion_step_context` | add plan kinds beside it; keep `step_create` |
| `companion_proposals.kind` check (#363) | adds `step_create` | the constraint must list both new kinds |

Edge handler (`supabase/functions/companion-actions/contract.ts`, `handler.ts`): step
operation registry entries are separate objects; `parseAction` `prepare`/`revise` accept
`step.create` in addition to `task.create_custom`; `read` also returns `steps`. Plans can add
their entries and kinds the same way. rag-query `lib/actions/proposals.ts`: a `[STEP <task
id>]` line is a new registry entry; `extractActionProposal` keeps the `[TASK]` behaviour
unchanged and returns at most one suggestion per answer.

No actual conflict blocked a #366 mutation so far. If #364 lands first, #366 re-composes
on top of it before handoff (and vice versa).
