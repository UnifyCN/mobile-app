-- Rollback of migrations/20261027183338_companion_settlement_plan.sql (mobile-app#364).
-- Not a migration: an operator runs it by hand, in one transaction, after the feature
-- gate is off and action traffic has stopped, and before the #363 rollback script
-- (20261026165156_companion_task_create.down.sql) and the #361 rollback script when
-- those are rolled back too. Mirrored byte for byte in the web repo.
--   * Plan actions are refused afterwards (the service answers feature_unavailable).
--     #361 task controls and #363 task creation keep working unchanged.
--   * Tasks a plan added stay in Checklist with their own task receipts and Undo
--     (those are #363 receipts and need nothing from this migration).
--   * Plans and their ordered task references stay in the #361 tables. Plan receipts
--     stay in companion_action_receipts, so their operation identity survives.
--   * Data only #364 understands is archived to companion_rollback_archive_364 (no other
--     script touches that table) and comes back when the migration is applied again:
--     plan drafts, and the plan columns (context, source, draft, approval, removal).
--     Re-application marks every restored open draft for a new review, as #361 and #363
--     do for approvals captured before a rollback.
--   * No reminder is touched here; the #361 rollback owns the reminder policy.
--   * Archive rows hold account data: drop the table by hand once the rollback window
--     (longer than the client retry and Undo windows) is over.
create table if not exists public.companion_rollback_archive_364 (
  id bigint generated always as identity primary key,
  archived_at timestamptz not null default now(),
  source text not null,
  row_data jsonb not null,
  restored_at timestamptz
);
alter table public.companion_rollback_archive_364 enable row level security;
revoke all on public.companion_rollback_archive_364 from anon, authenticated;

insert into public.companion_rollback_archive_364 (source, row_data)
  select 'companion_plan_proposals', to_jsonb(p) from public.companion_plan_proposals p;
insert into public.companion_rollback_archive_364 (source, row_data)
  select 'companion_plans', jsonb_build_object('id', p.id, 'user_id', p.user_id, 'context', p.context,
           'source', p.source, 'proposal_id', p.proposal_id, 'operation_id', p.operation_id,
           'updated_at', p.updated_at, 'removed_at', p.removed_at)
    from public.companion_plans p
   where p.context is not null or p.source is not null or p.proposal_id is not null
      or p.operation_id is not null or p.updated_at is not null or p.removed_at is not null;

drop function
  public.companion_plan_conversation(uuid, uuid),
  public.companion_plan_apply_undo(uuid, uuid, text, integer, jsonb, public.companion_plan_proposals),
  public.companion_plan_undo(uuid, uuid, integer, jsonb, uuid),
  public.companion_plan_undo_write(uuid, uuid, text, integer, jsonb, uuid, uuid, jsonb, jsonb, jsonb),
  public.companion_plan_undo_scan(uuid, public.companion_action_receipts),
  public.companion_plan_retry(uuid, uuid, integer, jsonb, uuid),
  public.companion_plan_status(uuid, uuid),
  public.companion_plans_read(uuid),
  public.companion_plan_apply(uuid, uuid, integer, jsonb, jsonb),
  public.companion_plan_reply(public.companion_action_receipts, boolean),
  public.companion_plan_add_item(uuid, uuid, integer, public.companion_plan_proposals, uuid, jsonb, integer),
  public.companion_plan_item_operation(uuid, uuid, text),
  public.companion_plan_cancel(uuid, uuid, integer),
  public.companion_plan_revise(uuid, uuid, integer, jsonb),
  public.companion_plan_edited_items(uuid, public.companion_plan_proposals, jsonb),
  public.companion_plan_get_proposal(uuid, uuid),
  public.companion_plan_prepare(uuid, jsonb, jsonb, jsonb),
  public.companion_plan_proposal_view(public.companion_plan_proposals),
  public.companion_plan_view(public.companion_plans),
  public.companion_plan_receipt_view(public.companion_action_receipts),
  public.companion_plan_retryable(public.companion_action_receipts),
  public.companion_plan_unresolved(jsonb, jsonb),
  public.companion_plan_context(uuid, jsonb),
  public.companion_plan_canonical(uuid, jsonb),
  public.companion_plan_task_now(uuid, text),
  public.companion_plan_task_available(uuid, text),
  public.companion_plan_plain(jsonb, integer);

drop table public.companion_plan_proposals;
drop index public.companion_plans_user_idx;
alter table public.companion_plans
  drop column removed_at, drop column updated_at, drop column operation_id, drop column proposal_id,
  drop column source, drop column context;
