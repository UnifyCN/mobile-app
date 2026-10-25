-- Candidate additive migration for the shared Companion/Checklist action contract.
-- PROBE ARTIFACT (#360): proven on a local stack only. The dependent task-state
-- ticket promotes this file to unify-front-end/supabase/migrations/ and applies
-- it to hosted through the normal release path. Nothing here is applied to hosted.
--
-- Design rules (see DOCS/companion-actions/360-compatibility-decision.md):
--   * Legacy columns stay authoritative for "completed" and "removed". Rich state
--     is a refinement of "not completed", so a legacy write can never contradict it.
--   * Every new column is nullable or defaulted. No backfill. No legacy column changes.
--   * Companion tables are written only by the action service (service role).
--   * Old clients keep using the old tables and see no behaviour change, except
--     that soft-removed custom tasks are hidden from them.

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

create table public.companion_action_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null,
  contract_version integer not null,
  authorization_evidence jsonb not null,
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

create table public.companion_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1,
  operations jsonb not null,
  operations_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  created_at timestamptz not null default now()
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

-- ------------------------------------------------ recovery after a rollback (down.sql)
-- down.sql archives everything it drops. Re-applying this file puts it back, so operation
-- identity (receipts, consumed approvals) and rich task state survive a rollback and a
-- re-application. Without this, a client retrying an old operation would write it twice.
-- It runs before the triggers below exist, so it writes the archived values as they were.
-- Rows of accounts deleted while rolled back are dropped, not restored.
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
  -- down.sql stops every pending reminder before it archives it. An archive written by the
  -- earlier candidate still holds 'pending' rows: restore those stopped at the time of that
  -- rollback. No schedule is restarted from an archive.
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

  -- Custom tasks removed by the user were deleted by down.sql; bring them back as removed.
  insert into public.custom_checklist_tasks
    select (jsonb_populate_record(null::public.custom_checklist_tasks, a.row_data)).*
      from public.companion_rollback_archive a
     where a.source = 'custom_checklist_tasks' and a.restored_at is null
       and a.row_data->>'removed_at' is not null
     order by a.id
    on conflict do nothing;

  -- Legacy writes made while rolled back had no triggers. A custom delete then left its plan
  -- references; drop them now, as the delete trigger would have. (No reminder is pending here:
  -- the rollback stopped them all, see above.)
  delete from public.companion_plan_tasks pt using public.companion_plans p
   where p.id = pt.plan_id and pt.task_ref like 'custom:%'
     and not exists (select 1 from public.custom_checklist_tasks c
                      where 'custom:' || c.id = pt.task_ref and c.user_id = p.user_id);

  -- Revisions. Nothing counted writes while the candidate was rolled back, so any revision a
  -- client or approval holds from before the rollback is stale. Every task row moves one past
  -- its last known revision (1 for rows that had no rich state), so all of them conflict.
  update public.user_tasks set revision = 2;
  update public.custom_checklist_tasks set revision = 2;

  -- Rich state of surviving tasks. Legacy columns stay authoritative: a task an old client
  -- completed while rolled back stays completed.
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
language sql stable as $$
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
-- Rejects fractions, exponents, negatives, strings and anything that could overflow the target type.
create function public.companion_nonneg_int(p_val jsonb, p_max_digits integer) returns bigint
language sql immutable as $$
  select case when jsonb_typeof(p_val) = 'number' and (p_val #>> '{}') ~ '^[0-9]+$'
               and char_length(p_val #>> '{}') <= p_max_digits
              then (p_val #>> '{}')::bigint end
$$;

create function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql as $$
declare
  v_op jsonb; v_type text; v_ref text;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) not between 1 and 20 then
    perform public.companion_fail('CA422', 'invalid_operations');
  end if;
  for v_op in select * from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(v_op) <> 'object' then
      perform public.companion_fail('CA422', 'invalid_operations');
    end if;
    v_type := v_op->>'type';
    if v_type is null or v_type not in ('task.set_state', 'task.create_custom', 'task.remove', 'task.restore', 'reminder.schedule') then
      perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
    end if;
    if v_type <> 'task.create_custom' then
      -- Only the canonical spelling of a reference is accepted, so one task has one identity.
      -- Custom ids have no sign, no padding and no more digits than a bigint holds. Sanity ids
      -- use Sanity's id characters and are published ids: 'drafts.x' would alias 'x'.
      -- Every stored hosted key matched this grammar on 2026-10-25 (hosted-read evidence).
      v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
      if v_ref is null or v_ref !~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$' then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
        perform public.companion_fail('CA422', 'expected_revision_required');
      end if;
    end if;
    if v_type = 'task.set_state' then
      if jsonb_typeof(v_op->'state') is distinct from 'string'
         or (v_op->>'state') not in ('not_started', 'in_progress', 'waiting', 'completed') then
        perform public.companion_fail('CA422', 'invalid_state');
      end if;
      if v_op ? 'waiting_reason' and jsonb_typeof(v_op->'waiting_reason') not in ('string', 'null') then
        perform public.companion_fail('CA422', 'invalid_waiting_reason');
      end if;
    elsif v_type = 'task.create_custom' then
      if jsonb_typeof(v_op->'title') is distinct from 'string' or btrim(v_op->>'title') = '' then
        perform public.companion_fail('CA422', 'invalid_title');
      end if;
      if jsonb_typeof(v_op->'priority') is distinct from 'string'
         or (v_op->>'priority') not in ('Do now', 'Do soon', 'Explore and connect', 'Optional / later') then
        perform public.companion_fail('CA422', 'invalid_priority');
      end if;
      if v_op ? 'description' and jsonb_typeof(v_op->'description') not in ('string', 'null') then
        perform public.companion_fail('CA422', 'invalid_description');
      end if;
    elsif v_type = 'reminder.schedule' then
      if jsonb_typeof(v_op->'remind_at') is distinct from 'string' then
        perform public.companion_fail('CA422', 'invalid_remind_at');
      end if;
      begin
        perform (v_op->>'remind_at')::timestamptz;
      exception when others then
        perform public.companion_fail('CA422', 'invalid_remind_at');
      end;
      if jsonb_typeof(v_op->'time_zone') is distinct from 'string' then
        perform public.companion_fail('CA422', 'invalid_time_zone');
      end if;
    end if;
  end loop;
end $$;

create function public.companion_check_authorization(p_user uuid, p_ops jsonb, p_auth jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := p_auth->>'kind';
  v_has_removal boolean := exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' = 'task.remove');
  v_msg bigint;
  v_rev bigint;
  v_prop uuid;
begin
  if v_has_removal and (v_kind = 'direct_command' or coalesce(p_auth->>'removal_confirmed', '') <> 'true') then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if v_kind = 'ui_control' then
    return;
  elsif v_kind = 'direct_command' then
    v_msg := public.companion_nonneg_int(p_auth->'message_id', 9);   -- messages.id is an int
    if v_msg is null or not exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
       where m.id = v_msg::int and c.user_id = p_user and m.role = 'user') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
  elsif v_kind = 'approved_proposal' then
    v_rev := public.companion_nonneg_int(p_auth->'proposal_revision', 9);
    if v_rev is null or jsonb_typeof(p_auth->'proposal_id') is distinct from 'string'
       or (p_auth->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    -- Check and consume in one statement. The UPDATE takes the row lock, so a second request
    -- with another operation id waits, then re-reads the row: 'applied' no longer matches and
    -- it is refused. A later failure in this transaction rolls the consume back with the rest.
    update public.companion_proposals p set status = 'applied'
     where p.id = (p_auth->>'proposal_id')::uuid and p.user_id = p_user
       and p.revision = v_rev::int
       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'
     returning p.id into v_prop;
    if v_prop is null then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
  else
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
end $$;

create function public.companion_apply_one(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := p_op->>'type';
  v_ref text := p_op->>'task_ref';
  v_source text := split_part(coalesce(v_ref, ''), ':', 1);
  v_key text := substr(coalesce(v_ref, ''), position(':' in coalesce(v_ref, '')) + 1);
  v_expected bigint := (p_op->>'expected_revision')::bigint;
  v_state text := p_op->>'state';
  v_completed boolean;
  v_progress text;
  v_reason text;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_before bigint;
  v_after bigint;
  v_new_id bigint;
  v_rem uuid;
begin
  if v_type = 'task.create_custom' then
    insert into public.custom_checklist_tasks (user_id, priority, title, description)
    values (p_user, p_op->>'priority', btrim(p_op->>'title'), coalesce(btrim(p_op->>'description'), ''))
    returning id, revision into v_new_id, v_after;
    return jsonb_build_object('type', v_type, 'task_ref', 'custom:' || v_new_id, 'before_revision', 0, 'after_revision', v_after);
  end if;

  if v_type in ('task.set_state', 'task.remove', 'task.restore', 'reminder.schedule') then
    if v_source = 'sanity' then
      select * into v_us from public.user_tasks where user_id = p_user and sanity_checklist_id = v_key for update;
      if not found then
        if v_expected <> 0 then
          perform public.companion_fail('CA409', 'revision_conflict', jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', 0));
        end if;
        if v_type = 'task.restore' then perform public.companion_fail('CA404', 'task_not_found'); end if;
        if v_type = 'reminder.schedule' then perform public.companion_fail('CA404', 'task_not_found'); end if;
        v_before := 0;
      else
        v_before := v_us.revision;
        if v_us.revision <> v_expected then
          perform public.companion_fail('CA409', 'revision_conflict', jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_us.revision));
        end if;
      end if;
    elsif v_source = 'custom' then
      select * into v_ct from public.custom_checklist_tasks where id = v_key::bigint and user_id = p_user for update;
      if not found then perform public.companion_fail('CA404', 'task_not_found'); end if;
      v_before := v_ct.revision;
      if v_ct.revision <> v_expected then
        perform public.companion_fail('CA409', 'revision_conflict', jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_ct.revision));
      end if;
    else
      perform public.companion_fail('CA422', 'invalid_task_ref');
    end if;
  end if;

  if v_type = 'task.set_state' then
    v_completed := (v_state = 'completed');
    v_progress := case when v_state in ('in_progress', 'waiting') then v_state end;
    v_reason := case when v_state = 'waiting' then left(btrim(p_op->>'waiting_reason'), 500) end;
    if v_source = 'sanity' then
      if v_us.user_task_id is not null and v_us.dismissed_at is not null then perform public.companion_fail('CA422', 'task_removed'); end if;
      begin
        if v_us.user_task_id is null then
          insert into public.user_tasks (user_id, sanity_checklist_id, completed, completed_at, progress_state, waiting_reason)
          values (p_user, v_key, v_completed, case when v_completed then now() end, v_progress, v_reason)
          returning revision into v_after;
        else
          update public.user_tasks
             set completed = v_completed, completed_at = case when v_completed then now() end,
                 progress_state = v_progress, waiting_reason = v_reason
           where user_task_id = v_us.user_task_id returning revision into v_after;
        end if;
      exception when unique_violation then
        perform public.companion_fail('CA409', 'revision_conflict', jsonb_build_object('task_ref', v_ref, 'expected', v_expected));
      end;
    else
      if v_ct.removed_at is not null then perform public.companion_fail('CA422', 'task_removed'); end if;
      update public.custom_checklist_tasks
         set completed = v_completed, completed_at = case when v_completed then now() end,
             progress_state = v_progress, waiting_reason = v_reason
       where id = v_ct.id returning revision into v_after;
    end if;
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'state', v_state, 'before_revision', v_before, 'after_revision', v_after);

  elsif v_type = 'task.remove' then
    if v_source = 'sanity' then
      begin
        if v_us.user_task_id is null then
          insert into public.user_tasks (user_id, sanity_checklist_id, dismissed_at) values (p_user, v_key, now())
          returning revision into v_after;
        else
          if v_us.dismissed_at is not null then perform public.companion_fail('CA422', 'already_removed'); end if;
          update public.user_tasks set dismissed_at = now() where user_task_id = v_us.user_task_id returning revision into v_after;
        end if;
      exception when unique_violation then
        perform public.companion_fail('CA409', 'revision_conflict', jsonb_build_object('task_ref', v_ref, 'expected', v_expected));
      end;
    else
      if v_ct.removed_at is not null then perform public.companion_fail('CA422', 'already_removed'); end if;
      update public.custom_checklist_tasks set removed_at = now() where id = v_ct.id returning revision into v_after;
    end if;
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'before_revision', v_before, 'after_revision', v_after);

  elsif v_type = 'task.restore' then
    if v_source = 'sanity' then
      if v_us.dismissed_at is null then perform public.companion_fail('CA422', 'not_removed'); end if;
      update public.user_tasks set dismissed_at = null where user_task_id = v_us.user_task_id returning revision into v_after;
    else
      if v_ct.removed_at is null then perform public.companion_fail('CA422', 'not_removed'); end if;
      update public.custom_checklist_tasks set removed_at = null where id = v_ct.id returning revision into v_after;
    end if;
    -- Reminders cancelled by the removal stay cancelled.
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'before_revision', v_before, 'after_revision', v_after);

  elsif v_type = 'reminder.schedule' then
    if not exists (select 1 from pg_timezone_names where name = p_op->>'time_zone') then
      perform public.companion_fail('CA422', 'invalid_time_zone');
    end if;
    if (p_op->>'remind_at')::timestamptz <= now() then
      perform public.companion_fail('CA422', 'reminder_in_past');
    end if;
    if (v_source = 'sanity' and (v_us.completed is true or v_us.dismissed_at is not null))
       or (v_source = 'custom' and (v_ct.completed is true or v_ct.removed_at is not null)) then
      perform public.companion_fail('CA422', 'task_not_open');
    end if;
    insert into public.companion_task_reminders (user_id, task_ref, remind_at, time_zone)
    values (p_user, v_ref, (p_op->>'remind_at')::timestamptz, p_op->>'time_zone') returning id into v_rem;
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'reminder_id', v_rem, 'time_zone', p_op->>'time_zone', 'before_revision', v_before, 'after_revision', v_before);
  end if;
  perform public.companion_fail('CA422', 'unsupported_operation');
  return null;
end $$;

create function public.companion_apply_actions(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_operations jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(p_operations);
  v_receipt public.companion_action_receipts%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_op jsonb;
begin
  -- One writer per (account, operation). A concurrent duplicate waits here, then
  -- reads the committed receipt instead of writing again.
  perform set_config('lock_timeout', '3s', true);   -- a stuck writer must not hold callers for the 2 min statement timeout
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));
  select * into v_receipt from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      perform public.companion_fail('CA410', 'operation_id_reused');
    end if;
    return jsonb_build_object('status', 'applied', 'replayed', true, 'operation_id', p_operation_id,
                              'results', v_receipt.outcome->'results');
  end if;
  perform public.companion_validate_operations(p_operations);
  perform public.companion_check_authorization(p_user_id, p_operations, p_authorization);
  for v_op in select * from jsonb_array_elements(p_operations) loop
    v_results := v_results || jsonb_build_array(public.companion_apply_one(p_user_id, v_op));
  end loop;
  insert into public.companion_action_receipts (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
  values (p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization,
          jsonb_build_object('results', v_results));
  return jsonb_build_object('status', 'applied', 'replayed', false, 'operation_id', p_operation_id, 'results', v_results);
end $$;

create function public.companion_action_status(p_user_id uuid, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_receipt public.companion_action_receipts%rowtype;
begin
  select * into v_receipt from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('status', 'applied', 'operation_id', p_operation_id, 'results', v_receipt.outcome->'results');
  end if;
  -- A writer that holds the lock has not committed yet: the outcome is not known.
  if not pg_try_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id)) then
    return jsonb_build_object('status', 'pending', 'operation_id', p_operation_id);
  end if;
  return jsonb_build_object('status', 'not_applied', 'operation_id', p_operation_id);
end $$;

create function public.companion_prepare_proposal(p_user_id uuid, p_operations jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_rev integer;
begin
  perform public.companion_validate_operations(p_operations);
  insert into public.companion_proposals (user_id, operations, operations_hash)
  values (p_user_id, p_operations, public.companion_ops_hash(p_operations))
  returning id, revision into v_id, v_rev;
  return jsonb_build_object('proposal_id', v_id, 'proposal_revision', v_rev,
                            'operations_hash', public.companion_ops_hash(p_operations));
end $$;

create function public.companion_read_tasks(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(t order by t->>'task_ref'), '[]'::jsonb) from (
    select jsonb_build_object(
      'task_ref', 'sanity:' || u.sanity_checklist_id, 'source', 'sanity',
      'state', case when u.completed then 'completed' else coalesce(u.progress_state, 'not_started') end,
      'waiting_reason', u.waiting_reason, 'revision', u.revision, 'removed', u.dismissed_at is not null,
      'reminders', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'remind_at', r.remind_at, 'time_zone', r.time_zone, 'status', r.status)), '[]'::jsonb)
                      from public.companion_task_reminders r where r.user_id = u.user_id and r.task_ref = 'sanity:' || u.sanity_checklist_id)
    ) t
    from public.user_tasks u where u.user_id = p_user_id and u.sanity_checklist_id is not null
    union all
    select jsonb_build_object(
      'task_ref', 'custom:' || c.id, 'source', 'custom', 'title', c.title, 'priority', c.priority,
      'state', case when c.completed then 'completed' else coalesce(c.progress_state, 'not_started') end,
      'waiting_reason', c.waiting_reason, 'revision', c.revision, 'removed', c.removed_at is not null,
      'reminders', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'remind_at', r.remind_at, 'time_zone', r.time_zone, 'status', r.status)), '[]'::jsonb)
                      from public.companion_task_reminders r where r.user_id = c.user_id and r.task_ref = 'custom:' || c.id)
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
  public.companion_nonneg_int(jsonb, integer),
  public.companion_validate_operations(jsonb), public.companion_check_authorization(uuid, jsonb, jsonb),
  public.companion_apply_one(uuid, jsonb),
  public.companion_apply_actions(uuid, uuid, integer, jsonb, jsonb),
  public.companion_action_status(uuid, uuid), public.companion_prepare_proposal(uuid, jsonb),
  public.companion_read_tasks(uuid)
  from public, anon, authenticated;
grant execute on function
  public.companion_apply_actions(uuid, uuid, integer, jsonb, jsonb),
  public.companion_action_status(uuid, uuid), public.companion_prepare_proposal(uuid, jsonb),
  public.companion_read_tasks(uuid), public.companion_op_lock_key(uuid, uuid)
  to service_role;
