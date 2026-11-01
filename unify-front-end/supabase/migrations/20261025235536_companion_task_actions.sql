-- Companion task actions: shared task state, receipts and receipt-specific Undo
-- (mobile-app#361; contract and compatibility decided in #360, see
-- DOCS/companion-actions/360-compatibility-decision.md and
-- DOCS/companion-actions/361-task-actions.md).
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte
-- for byte with the same timestamp. Rollback script:
-- supabase/rollbacks/20261025235536_companion_task_actions.down.sql (mirrored too).
-- Apply through the normal release path with the feature gate off. Never db push.
--
-- Design rules (accepted in #360):
--   * Legacy columns stay authoritative for "completed" and "removed". Rich state
--     refines "not completed", so a legacy write can never contradict it.
--   * Every new column is nullable or defaulted. No backfill. No legacy column changes.
--   * Companion tables are written only by the action service (service role).
--   * Old clients keep using the old tables and see no behaviour change, except
--     that soft-removed custom tasks are hidden from them.
--   * A full schema rollback stops every pending reminder; re-application restarts
--     none. A gate-only disable/enable stops nothing.
--
-- This slice registers one operation, task.set_state. The validator refuses every
-- other type, so a later slice adds an operation together with its executor and tests.

-- ---------------------------------------------------------------- task columns
alter table public.user_tasks
  add column progress_state text,
  add column waiting_reason text,
  add column revision bigint not null default 1,
  add column state_updated_at timestamptz,
  add constraint user_tasks_progress_state_check
    check (progress_state is null or progress_state in ('in_progress', 'waiting')),
  add constraint user_tasks_waiting_reason_check
    check (waiting_reason is null or (progress_state = 'waiting' and char_length(waiting_reason) <= 500));

alter table public.custom_checklist_tasks
  add column progress_state text,
  add column waiting_reason text,
  add column revision bigint not null default 1,
  add column state_updated_at timestamptz,
  add column removed_at timestamptz,
  add constraint custom_checklist_tasks_progress_state_check
    check (progress_state is null or progress_state in ('in_progress', 'waiting')),
  add constraint custom_checklist_tasks_waiting_reason_check
    check (waiting_reason is null or (progress_state = 'waiting' and char_length(waiting_reason) <= 500));

-- Old clients must not see soft-removed custom tasks (they select with '*').
drop policy "Users can read own custom checklist tasks" on public.custom_checklist_tasks;
create policy "Users can read own custom checklist tasks" on public.custom_checklist_tasks
  for select using (auth.uid() = user_id and removed_at is null);

-- --------------------------------------------------------------- companion tables
create table public.companion_feature_gate (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  min_contract_version integer not null default 1,
  max_contract_version integer not null default 1,
  allowed_platforms text[] not null default '{ios,android,web}',
  updated_at timestamptz not null default now()
);
insert into public.companion_feature_gate default values;

-- One row per (account, operation identity). Holds identifiers, states and revisions.
-- `inverse` holds the exact operations that reverse this receipt, including the earlier
-- waiting reason, so Undo restores it. It is the account's own data and is deleted with
-- the account. Never sent to analytics.
create table public.companion_action_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  contract_version integer not null,
  authorization_evidence jsonb not null,
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  task_ref text,
  inverse jsonb,
  undo_of uuid,
  primary key (user_id, operation_id)
);
create index companion_action_receipts_task_idx
  on public.companion_action_receipts (user_id, task_ref, created_at desc);
-- A receipt is reversed at most once, by a direct Undo or by an approved compensating change.
create unique index companion_action_receipts_undo_once
  on public.companion_action_receipts (user_id, undo_of) where undo_of is not null;

create table public.companion_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1,
  operations jsonb not null,
  operations_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  created_at timestamptz not null default now(),
  -- Set when the proposal is the reviewed compensating change for a conflicting Undo.
  undo_of uuid
);
create index companion_proposals_user_idx on public.companion_proposals (user_id);

create table public.companion_task_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_ref text not null check (task_ref ~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'),
  remind_at timestamptz not null,
  time_zone text not null,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'sent')),
  cancelled_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index companion_task_reminders_task_idx on public.companion_task_reminders (user_id, task_ref, status);

create table public.companion_task_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_ref text not null check (task_ref ~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'),
  title text not null check (char_length(title) between 1 and 200),
  completed boolean not null default false,
  position integer not null default 0,
  revision bigint not null default 1,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index companion_task_steps_task_idx on public.companion_task_steps (user_id, task_ref);

create table public.companion_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now()
);
create table public.companion_plan_tasks (
  plan_id uuid not null references public.companion_plans(id) on delete cascade,
  task_ref text not null check (task_ref ~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'),
  position integer not null default 0,
  primary key (plan_id, task_ref)
);

alter table public.companion_feature_gate enable row level security;
alter table public.companion_action_receipts enable row level security;
alter table public.companion_proposals enable row level security;
alter table public.companion_task_reminders enable row level security;
alter table public.companion_task_steps enable row level security;
alter table public.companion_plans enable row level security;
alter table public.companion_plan_tasks enable row level security;
-- Clients may read their own rows. Nobody but the service role writes.
create policy companion_reminders_select_own on public.companion_task_reminders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy companion_steps_select_own on public.companion_task_steps
  for select to authenticated using ((select auth.uid()) = user_id);
create policy companion_plans_select_own on public.companion_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy companion_plan_tasks_select_own on public.companion_plan_tasks
  for select to authenticated using (exists (
    select 1 from public.companion_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
-- Defence in depth: the default Supabase grants hand write privileges to API roles.
revoke insert, update, delete, truncate on
  public.companion_feature_gate, public.companion_action_receipts, public.companion_proposals,
  public.companion_task_reminders, public.companion_task_steps, public.companion_plans,
  public.companion_plan_tasks from anon, authenticated;
revoke all on public.companion_feature_gate, public.companion_action_receipts,
  public.companion_proposals from anon, authenticated;

-- ------------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives everything it drops. Re-applying this file puts it back,
-- so operation identity (receipts, consumed approvals) and rich task state survive a
-- rollback and a re-application. It runs before the triggers below exist, so it writes
-- the archived values as they were. Rows of accounts deleted while rolled back are
-- dropped, not restored. No reminder schedule is restarted from an archive.
do $recover$
begin
  if to_regclass('public.companion_rollback_archive') is null then
    return;
  end if;
  alter table public.companion_rollback_archive add column if not exists restored_at timestamptz;

  delete from public.companion_rollback_archive a
   where a.row_data ? 'user_id'
     and not exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid);

  insert into public.companion_action_receipts
    select (jsonb_populate_record(null::public.companion_action_receipts, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_action_receipts' and a.restored_at is null order by a.id
    on conflict do nothing;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_proposals' and a.restored_at is null order by a.id
    on conflict do nothing;
  -- The rollback script stops every pending reminder before it archives it. An archive
  -- that still holds 'pending' rows restores them stopped at the time of that rollback.
  insert into public.companion_task_reminders
    select (jsonb_populate_record(null::public.companion_task_reminders,
              case when a.row_data->>'status' = 'pending'
                   then a.row_data || jsonb_build_object('status', 'cancelled', 'cancelled_reason', 'schema_rollback',
                                                         'cancelled_at', a.archived_at)
                   else a.row_data end)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_task_reminders' and a.restored_at is null order by a.id
    on conflict do nothing;
  insert into public.companion_task_steps
    select (jsonb_populate_record(null::public.companion_task_steps, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_task_steps' and a.restored_at is null order by a.id
    on conflict do nothing;
  insert into public.companion_plans
    select (jsonb_populate_record(null::public.companion_plans, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_plans' and a.restored_at is null order by a.id
    on conflict do nothing;
  insert into public.companion_plan_tasks
    select (jsonb_populate_record(null::public.companion_plan_tasks, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'companion_plan_tasks' and a.restored_at is null
       and exists (select 1 from public.companion_plans p where p.id = (a.row_data->>'plan_id')::uuid)
     order by a.id
    on conflict do nothing;

  -- Custom tasks removed by the user were deleted by the rollback; bring them back as removed.
  insert into public.custom_checklist_tasks
    select (jsonb_populate_record(null::public.custom_checklist_tasks, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'custom_checklist_tasks' and a.restored_at is null
       and a.row_data->>'removed_at' is not null
     order by a.id
    on conflict do nothing;

  -- Legacy deletes made while rolled back had no trigger; drop their plan references now.
  delete from public.companion_plan_tasks pt using public.companion_plans p
   where p.id = pt.plan_id and pt.task_ref like 'custom:%'
     and not exists (select 1 from public.custom_checklist_tasks c
                      where 'custom:' || c.id = pt.task_ref and c.user_id = p.user_id);

  -- Nothing counted writes while rolled back, so every revision held from before the
  -- rollback is stale. Every task row moves one past its last known revision.
  update public.user_tasks set revision = 2;
  update public.custom_checklist_tasks set revision = 2;

  -- Rich state of surviving tasks. Legacy columns stay authoritative: a task an old
  -- client completed while rolled back stays completed.
  update public.user_tasks t set
      progress_state = case when t.completed is true then null else r.progress_state end,
      waiting_reason = case when t.completed is true then null else r.waiting_reason end,
      revision = r.revision + 1,
      state_updated_at = r.state_updated_at
    from (select distinct on (x.user_task_id) x.*
            from (select (jsonb_populate_record(null::public.user_tasks, a.row_data)).*, a.id as archive_id
                    from public.companion_rollback_archive a
                   where a.source = 'user_tasks' and a.restored_at is null) x
           order by x.user_task_id, x.archive_id desc) r
   where t.user_task_id = r.user_task_id;
  update public.custom_checklist_tasks t set
      progress_state = case when t.completed is true then null else r.progress_state end,
      waiting_reason = case when t.completed is true then null else r.waiting_reason end,
      revision = r.revision + 1,
      state_updated_at = r.state_updated_at
    from (select distinct on (x.id) x.*
            from (select (jsonb_populate_record(null::public.custom_checklist_tasks, a.row_data)).*, a.id as archive_id
                    from public.companion_rollback_archive a
                   where a.source = 'custom_checklist_tasks' and a.restored_at is null) x
           order by x.id, x.archive_id desc) r
   where t.id = r.id;

  delete from public.companion_rollback_archive a
   where a.source = 'companion_plan_tasks'
     and not exists (select 1 from public.companion_plans p where p.id = (a.row_data->>'plan_id')::uuid);
  update public.companion_rollback_archive set restored_at = now() where restored_at is null;
end $recover$;

-- ----------------------------------------------- triggers: legacy writes keep invariants
create function public.companion_user_tasks_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    if new.completed is true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    new.state_updated_at := now();
  else
    new.revision := old.revision + 1;
    if new.completed is true and old.completed is distinct from true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    if new.completed is distinct from old.completed
       or new.progress_state is distinct from old.progress_state then
      new.state_updated_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger companion_user_tasks_before before insert or update on public.user_tasks
  for each row execute function public.companion_user_tasks_before();

create function public.companion_custom_tasks_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    if new.completed is true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    new.state_updated_at := now();
  else
    new.revision := old.revision + 1;
    if new.completed is true and old.completed is distinct from true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    if new.completed is distinct from old.completed
       or new.progress_state is distinct from old.progress_state then
      new.state_updated_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger companion_custom_tasks_before before insert or update on public.custom_checklist_tasks
  for each row execute function public.companion_custom_tasks_before();

-- Completion or removal stops pending reminders in the same transaction, whoever wrote it.
create function public.companion_cancel_reminders(p_user uuid, p_ref text, p_reason text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.companion_task_reminders
     set status = 'cancelled', cancelled_reason = p_reason, cancelled_at = now()
   where user_id = p_user and task_ref = p_ref and status = 'pending';
$$;

create function public.companion_user_tasks_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.sanity_checklist_id is null or new.user_id is null then return new; end if;
  if new.completed is true and (tg_op = 'INSERT' or old.completed is distinct from true) then
    perform public.companion_cancel_reminders(new.user_id, 'sanity:' || new.sanity_checklist_id, 'task_completed');
  end if;
  if new.dismissed_at is not null and (tg_op = 'INSERT' or old.dismissed_at is null) then
    perform public.companion_cancel_reminders(new.user_id, 'sanity:' || new.sanity_checklist_id, 'task_removed');
  end if;
  return new;
end $$;
create trigger companion_user_tasks_after after insert or update on public.user_tasks
  for each row execute function public.companion_user_tasks_after();

create function public.companion_custom_tasks_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.companion_cancel_reminders(old.user_id, 'custom:' || old.id, 'task_deleted');
    delete from public.companion_plan_tasks pt using public.companion_plans p
     where p.id = pt.plan_id and p.user_id = old.user_id and pt.task_ref = 'custom:' || old.id;
    return old;
  end if;
  if new.completed is true and (tg_op = 'INSERT' or old.completed is distinct from true) then
    perform public.companion_cancel_reminders(new.user_id, 'custom:' || new.id, 'task_completed');
  end if;
  if new.removed_at is not null and (tg_op = 'INSERT' or old.removed_at is null) then
    perform public.companion_cancel_reminders(new.user_id, 'custom:' || new.id, 'task_removed');
  end if;
  return new;
end $$;
create trigger companion_custom_tasks_after after insert or update or delete on public.custom_checklist_tasks
  for each row execute function public.companion_custom_tasks_after();

-- --------------------------------------------------------------- action service SQL
create function public.companion_ops_hash(p_ops jsonb) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_ops::text, 'UTF8')), 'hex')
$$;

create function public.companion_op_lock_key(p_user uuid, p_op uuid) returns bigint
language sql immutable as $$
  select hashtextextended(p_user::text || ':' || p_op::text, 360)
$$;

create function public.companion_fail(p_code text, p_message text, p_detail jsonb default '{}') returns void
language plpgsql as $$
begin
  raise exception using errcode = p_code, message = p_message, detail = p_detail::text;
end $$;

-- A JSON number that is a plain non-negative integer of at most p_max_digits digits, else null.
create function public.companion_nonneg_int(p_val jsonb, p_max_digits integer) returns bigint
language sql immutable as $$
  select case when jsonb_typeof(p_val) = 'number' and (p_val #>> '{}') ~ '^[0-9]+$'
               and char_length(p_val #>> '{}') <= p_max_digits
              then (p_val #>> '{}')::bigint end
$$;

create function public.companion_task_ref_valid(p_ref text) returns boolean
language sql immutable as $$
  select p_ref ~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'
$$;

-- The one canonical spelling of a set_state operation. Proposals and receipts store
-- this form, so the hash of a client's resubmitted operations matches byte for byte.
create function public.companion_set_state_op(p_ref text, p_state text, p_reason text, p_expected bigint) returns jsonb
language sql immutable as $$
  select jsonb_build_object('type', 'task.set_state', 'task_ref', p_ref, 'state', p_state, 'expected_revision', p_expected)
         || case when p_state = 'waiting' and nullif(btrim(coalesce(p_reason, '')), '') is not null
                 then jsonb_build_object('waiting_reason', btrim(p_reason)) else '{}'::jsonb end
$$;

-- Registry check. Only implemented operation types pass. Refused input writes nothing.
create function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql as $$
declare
  v_op jsonb; v_type text; v_ref text; v_key text;
begin
  -- One operation per request in this slice; a receipt summarizes exactly one task change.
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) <> 1 then
    perform public.companion_fail('CA422', 'invalid_operations');
  end if;
  for v_op in select * from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(v_op) <> 'object' then
      perform public.companion_fail('CA422', 'invalid_operations');
    end if;
    v_type := case when jsonb_typeof(v_op->'type') = 'string' then v_op->>'type' end;
    if v_type is null or v_type <> 'task.set_state' then
      perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
    end if;
    for v_key in select jsonb_object_keys(v_op) loop
      if v_key not in ('type', 'task_ref', 'state', 'waiting_reason', 'expected_revision') then
        perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
      end if;
    end loop;
    v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
    if v_ref is null or not public.companion_task_ref_valid(v_ref) then
      perform public.companion_fail('CA422', 'invalid_task_ref');
    end if;
    if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
      perform public.companion_fail('CA422', 'expected_revision_required');
    end if;
    if jsonb_typeof(v_op->'state') is distinct from 'string'
       or (v_op->>'state') not in ('not_started', 'in_progress', 'waiting', 'completed') then
      perform public.companion_fail('CA422', 'invalid_state');
    end if;
    if v_op ? 'waiting_reason' and (jsonb_typeof(v_op->'waiting_reason') <> 'string'
       or (v_op->>'state') <> 'waiting'
       or char_length(btrim(v_op->>'waiting_reason')) not between 1 and 500) then
      perform public.companion_fail('CA422', 'invalid_waiting_reason');
    end if;
  end loop;
end $$;

-- Authorization evidence. ui_control: the signed-in user's own explicit control.
-- approved_proposal: a draft proposal of this account with this revision whose hash
-- equals the submitted operations; checked and consumed in one statement. Any other
-- kind (including a model-supplied approval flag) is refused. Returns the consumed
-- proposal's undo_of, if any.
create function public.companion_check_authorization(p_user uuid, p_ops jsonb, p_auth jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := case when jsonb_typeof(p_auth) = 'object' and jsonb_typeof(p_auth->'kind') = 'string' then p_auth->>'kind' end;
  v_rev bigint;
  v_prop uuid;
  v_undo_of uuid;
begin
  if v_kind = 'ui_control' then
    return null;
  elsif v_kind = 'approved_proposal' then
    v_rev := public.companion_nonneg_int(p_auth->'proposal_revision', 9);
    if v_rev is null or jsonb_typeof(p_auth->'proposal_id') is distinct from 'string'
       or (p_auth->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    update public.companion_proposals p set status = 'applied'
     where p.id = (p_auth->>'proposal_id')::uuid and p.user_id = p_user
       and p.revision = v_rev::int
       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'
     returning p.id, p.undo_of into v_prop, v_undo_of;
    if v_prop is null then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return v_undo_of;
  end if;
  perform public.companion_fail('CA403', 'invalid_authorization');
  return null;
end $$;

create function public.companion_task_state(p_completed boolean, p_progress text) returns text
language sql immutable as $$
  select case when p_completed is true then 'completed' else coalesce(p_progress, 'not_started') end
$$;

-- Executes one registered operation. Returns its result, with the exact inverse.
create function public.companion_apply_one(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := p_op->>'task_ref';
  v_source text := split_part(v_ref, ':', 1);
  v_key text := substr(v_ref, position(':' in v_ref) + 1);
  v_expected bigint := (p_op->>'expected_revision')::bigint;
  v_state text := p_op->>'state';
  v_completed boolean := (v_state = 'completed');
  v_progress text := case when v_state in ('in_progress', 'waiting') then v_state end;
  v_reason text := case when v_state = 'waiting' then nullif(btrim(coalesce(p_op->>'waiting_reason', '')), '') end;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_before bigint;
  v_after bigint;
  v_before_state text;
  v_before_reason text;
begin
  if v_source = 'sanity' then
    select * into v_us from public.user_tasks where user_id = p_user and sanity_checklist_id = v_key for update;
    if not found then
      v_before := 0; v_before_state := 'not_started'; v_before_reason := null;
    else
      v_before := v_us.revision;
      v_before_state := public.companion_task_state(v_us.completed, v_us.progress_state);
      v_before_reason := v_us.waiting_reason;
      if v_us.dismissed_at is not null then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
    end if;
    if v_before <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_before));
    end if;
    begin
      if v_before = 0 then
        insert into public.user_tasks (user_id, sanity_checklist_id, completed, completed_at, progress_state, waiting_reason)
        values (p_user, v_key, v_completed, case when v_completed then now() end, v_progress, v_reason)
        returning revision into v_after;
      else
        update public.user_tasks
           set completed = v_completed,
               completed_at = case when v_completed then coalesce(case when v_us.completed then v_us.completed_at end, now()) end,
               progress_state = v_progress, waiting_reason = v_reason
         where user_task_id = v_us.user_task_id returning revision into v_after;
      end if;
    exception when unique_violation then
      -- A legacy client inserted the row after our read: the caller's revision is stale.
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', null));
    end;
  elsif v_source = 'custom' then
    select * into v_ct from public.custom_checklist_tasks where id = v_key::bigint and user_id = p_user for update;
    if not found then
      perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
    end if;
    v_before := v_ct.revision;
    v_before_state := public.companion_task_state(v_ct.completed, v_ct.progress_state);
    v_before_reason := v_ct.waiting_reason;
    if v_ct.removed_at is not null then
      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_before <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_before));
    end if;
    update public.custom_checklist_tasks
       set completed = v_completed,
           completed_at = case when v_completed then coalesce(case when v_ct.completed then v_ct.completed_at end, now()) end,
           progress_state = v_progress, waiting_reason = v_reason
     where id = v_ct.id returning revision into v_after;
  else
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;

  return jsonb_build_object(
    'type', 'task.set_state', 'task_ref', v_ref,
    'before_state', v_before_state, 'state', v_state,
    'before_revision', v_before, 'after_revision', v_after,
    'inverse', public.companion_set_state_op(v_ref, v_before_state, v_before_reason, v_after));
end $$;

-- Current revision of a task, 0 when a content-backed task has no row. Null when missing.
create function public.companion_task_revision(p_user uuid, p_ref text) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case split_part(p_ref, ':', 1)
    when 'sanity' then coalesce((select u.revision from public.user_tasks u
                                  where u.user_id = p_user and u.sanity_checklist_id = substr(p_ref, 8)), 0)
    when 'custom' then (select c.revision from public.custom_checklist_tasks c
                         where c.user_id = p_user and c.id = substr(p_ref, 8)::bigint)
  end
$$;

-- Public summary of a receipt. No waiting reason, title or note leaves through here.
create function public.companion_receipt_summary(p_receipt public.companion_action_receipts) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'operation_id', p_receipt.operation_id,
    'created_at', p_receipt.created_at,
    'kind', case when p_receipt.undo_of is null then 'change' else 'undo' end,
    'undo_of', p_receipt.undo_of,
    'task_ref', p_receipt.task_ref,
    'before_state', r->>'before_state',
    'after_state', r->>'state',
    'before_revision', (r->>'before_revision')::bigint,
    'after_revision', (r->>'after_revision')::bigint,
    'undone_by', u.operation_id,
    'current', u.operation_id is null
               and public.companion_task_revision(p_receipt.user_id, p_receipt.task_ref) = (r->>'after_revision')::bigint,
    'undoable', p_receipt.inverse is not null and u.operation_id is null)
  from (select p_receipt.outcome->'results'->0 as r) x
  left join public.companion_action_receipts u
    on u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id
$$;

create function public.companion_reply(p_receipt public.companion_action_receipts, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', 'applied', 'replayed', p_replayed, 'operation_id', p_receipt.operation_id,
    'results', (select coalesce(jsonb_agg(e - 'inverse'), '[]'::jsonb) from jsonb_array_elements(p_receipt.outcome->'results') e),
    'receipt', public.companion_receipt_summary(p_receipt))
$$;

-- Takes the operation lock and replays a recorded outcome. Null when nothing is recorded.
create function public.companion_replay(p_user uuid, p_op uuid, p_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_receipt public.companion_action_receipts%rowtype;
begin
  -- One writer per (account, operation). A concurrent duplicate waits here, then reads the
  -- committed receipt. A stuck writer must not hold callers for the statement timeout.
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user, p_op));
  select * into v_receipt from public.companion_action_receipts where user_id = p_user and operation_id = p_op;
  if not found then return null; end if;
  if v_receipt.request_hash <> p_hash then
    perform public.companion_fail('CA410', 'operation_id_reused');
  end if;
  return public.companion_reply(v_receipt, true);
end $$;

create function public.companion_record(
  p_user uuid, p_op uuid, p_hash text, p_version integer, p_auth jsonb, p_results jsonb, p_undo_of uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_receipt public.companion_action_receipts%rowtype;
  v_refs text[] := array(select distinct e->>'task_ref' from jsonb_array_elements(p_results) e);
begin
  begin
    insert into public.companion_action_receipts
      (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome, task_ref, inverse, undo_of)
    values (p_user, p_op, p_hash, p_version, p_auth,
            jsonb_build_object('results', (select jsonb_agg(e - 'inverse') from jsonb_array_elements(p_results) e)),
            case when cardinality(v_refs) = 1 then v_refs[1] end,
            -- A reversal is final: it is not itself offered for Undo.
            case when p_undo_of is null then (select jsonb_agg(e->'inverse') from jsonb_array_elements(p_results) e) end,
            p_undo_of)
    returning * into v_receipt;
  exception when unique_violation then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_undo_of));
  end;
  return public.companion_reply(v_receipt, false);
end $$;

create function public.companion_apply_actions(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_operations jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(p_operations);
  v_replay jsonb;
  v_undo_of uuid;
  v_results jsonb := '[]'::jsonb;
  v_op jsonb;
begin
  v_replay := public.companion_replay(p_user_id, p_operation_id, v_hash);
  if v_replay is not null then return v_replay; end if;
  perform public.companion_validate_operations(p_operations);
  v_undo_of := public.companion_check_authorization(p_user_id, p_operations, p_authorization);
  -- Any failure below raises and rolls back every operation, the consumed approval and the receipt.
  for v_op in select * from jsonb_array_elements(p_operations) loop
    v_results := v_results || jsonb_build_array(public.companion_apply_one(p_user_id, v_op));
  end loop;
  return public.companion_record(p_user_id, p_operation_id, v_hash, p_contract_version,
                                 p_authorization, v_results, v_undo_of);
end $$;

-- Undo of one named receipt. Applies the receipt's recorded inverse when every affected
-- task is still at the revision the receipt produced. Otherwise nothing changes: the newer
-- edit is kept and a draft compensating proposal at the current revisions is returned for
-- review. Returns { conflict: true, ... } in that case, else the applied reply.
create function public.companion_undo_action(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_receipt_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(jsonb_build_object('undo', p_receipt_operation_id));
  v_replay jsonb;
  v_target public.companion_action_receipts%rowtype;
  v_inv jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_current jsonb := '[]'::jsonb;
  v_conflict boolean := false;
  v_rev bigint;
  v_results jsonb := '[]'::jsonb;
  v_prop public.companion_proposals%rowtype;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_ref text;
begin
  v_replay := public.companion_replay(p_user_id, p_operation_id, v_hash);
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'ui_control' then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  select * into v_target from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_receipt_operation_id;
  if not found then
    perform public.companion_fail('CA404', 'receipt_not_found');
  end if;
  if v_target.inverse is null then
    perform public.companion_fail('CA422', 'not_undoable');
  end if;
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;

  -- Lock every affected task, then compare revisions.
  for v_inv in select * from jsonb_array_elements(v_target.inverse) loop
    v_ref := v_inv->>'task_ref';
    if split_part(v_ref, ':', 1) = 'sanity' then
      select * into v_us from public.user_tasks
       where user_id = p_user_id and sanity_checklist_id = substr(v_ref, 8) for update;
      v_rev := case when found then v_us.revision else 0 end;
      v_current := v_current || jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_rev,
        'state', case when found then public.companion_task_state(v_us.completed, v_us.progress_state) else 'not_started' end,
        'waiting_reason', case when found then v_us.waiting_reason end,
        'removed', found and v_us.dismissed_at is not null));
    else
      select * into v_ct from public.custom_checklist_tasks
       where user_id = p_user_id and id = substr(v_ref, 8)::bigint for update;
      if not found then
        perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
      end if;
      v_rev := v_ct.revision;
      v_current := v_current || jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_rev,
        'state', public.companion_task_state(v_ct.completed, v_ct.progress_state),
        'waiting_reason', v_ct.waiting_reason, 'removed', v_ct.removed_at is not null));
    end if;
    if v_rev <> (v_inv->>'expected_revision')::bigint then
      v_conflict := true;
    end if;
    v_ops := v_ops || jsonb_build_array(public.companion_set_state_op(
      v_ref, v_inv->>'state', v_inv->>'waiting_reason', v_rev));
  end loop;

  -- A concurrent Undo of the same receipt may have committed while this one waited for the
  -- row locks. Re-check under the locks so it reads as already undone, not as a conflict.
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;

  if v_conflict then
    -- Reuse an unconsumed compensating draft for the same operations, else create one.
    select * into v_prop from public.companion_proposals
     where user_id = p_user_id and undo_of = p_receipt_operation_id and status = 'draft'
       and operations_hash = public.companion_ops_hash(v_ops)
     order by created_at desc limit 1;
    if not found then
      insert into public.companion_proposals (user_id, operations, operations_hash, undo_of)
      values (p_user_id, v_ops, public.companion_ops_hash(v_ops), p_receipt_operation_id)
      returning * into v_prop;
    end if;
    return jsonb_build_object('conflict', true, 'receipt_operation_id', p_receipt_operation_id,
      'current', v_current,
      'proposal', jsonb_build_object('proposal_id', v_prop.id, 'proposal_revision', v_prop.revision,
                                     'operations', v_prop.operations));
  end if;

  for v_inv in select * from jsonb_array_elements(v_ops) loop
    v_results := v_results || jsonb_build_array(public.companion_apply_one(p_user_id, v_inv));
  end loop;
  return public.companion_record(p_user_id, p_operation_id, v_hash, p_contract_version,
    jsonb_build_object('kind', 'ui_control', 'undo_of', p_receipt_operation_id), v_results, p_receipt_operation_id);
end $$;

create function public.companion_action_status(p_user_id uuid, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_receipt public.companion_action_receipts%rowtype;
begin
  select * into v_receipt from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    return public.companion_reply(v_receipt, true) - 'replayed';
  end if;
  -- A writer that holds the lock has not committed yet: the outcome is not known.
  if not pg_try_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id)) then
    return jsonb_build_object('status', 'pending', 'operation_id', p_operation_id);
  end if;
  return jsonb_build_object('status', 'not_applied', 'operation_id', p_operation_id);
end $$;

create function public.companion_read_tasks(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(t order by t->>'task_ref'), '[]'::jsonb) from (
    select jsonb_build_object(
      'task_ref', 'sanity:' || u.sanity_checklist_id, 'source', 'sanity',
      'state', public.companion_task_state(u.completed, u.progress_state),
      'waiting_reason', u.waiting_reason, 'revision', u.revision, 'removed', u.dismissed_at is not null,
      'state_updated_at', u.state_updated_at,
      'last_receipt', (select public.companion_receipt_summary(r) from public.companion_action_receipts r
                        where r.user_id = u.user_id and r.task_ref = 'sanity:' || u.sanity_checklist_id
                        order by r.created_at desc limit 1)
    ) t
    from public.user_tasks u where u.user_id = p_user_id and u.sanity_checklist_id is not null
    union all
    select jsonb_build_object(
      'task_ref', 'custom:' || c.id, 'source', 'custom', 'title', c.title,
      'state', public.companion_task_state(c.completed, c.progress_state),
      'waiting_reason', c.waiting_reason, 'revision', c.revision, 'removed', c.removed_at is not null,
      'state_updated_at', c.state_updated_at,
      'last_receipt', (select public.companion_receipt_summary(r) from public.companion_action_receipts r
                        where r.user_id = c.user_id and r.task_ref = 'custom:' || c.id
                        order by r.created_at desc limit 1)
    )
    from public.custom_checklist_tasks c where c.user_id = p_user_id
  ) s(t)
$$;

-- The action service is the only caller. API roles cannot execute any of it.
revoke all on function
  public.companion_user_tasks_before(), public.companion_custom_tasks_before(),
  public.companion_cancel_reminders(uuid, text, text), public.companion_user_tasks_after(),
  public.companion_custom_tasks_after(), public.companion_ops_hash(jsonb),
  public.companion_op_lock_key(uuid, uuid), public.companion_fail(text, text, jsonb),
  public.companion_nonneg_int(jsonb, integer), public.companion_task_ref_valid(text),
  public.companion_set_state_op(text, text, text, bigint),
  public.companion_validate_operations(jsonb), public.companion_check_authorization(uuid, jsonb, jsonb),
  public.companion_task_state(boolean, text), public.companion_apply_one(uuid, jsonb),
  public.companion_task_revision(uuid, text),
  public.companion_receipt_summary(public.companion_action_receipts),
  public.companion_reply(public.companion_action_receipts, boolean),
  public.companion_replay(uuid, uuid, text),
  public.companion_record(uuid, uuid, text, integer, jsonb, jsonb, uuid),
  public.companion_apply_actions(uuid, uuid, integer, jsonb, jsonb),
  public.companion_undo_action(uuid, uuid, integer, jsonb, uuid),
  public.companion_action_status(uuid, uuid), public.companion_read_tasks(uuid)
  from public, anon, authenticated;
grant execute on function
  public.companion_apply_actions(uuid, uuid, integer, jsonb, jsonb),
  public.companion_undo_action(uuid, uuid, integer, jsonb, uuid),
  public.companion_action_status(uuid, uuid), public.companion_read_tasks(uuid),
  public.companion_op_lock_key(uuid, uuid)
  to service_role;
