-- Companion settlement plans: a reviewed plan reuses existing Checklist tasks, adds the
-- selected missing ones, and stays available across conversations and platforms
-- (mobile-app#364). Builds on 20261025235536_companion_task_actions.sql (#361) and
-- 20261026165156_companion_task_create.sql (#363) and keeps their rules: legacy columns
-- stay authoritative, only the action service writes, a full schema rollback stops
-- pending reminders and a re-application restarts none.
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for
-- byte with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261027183338_companion_settlement_plan.down.sql. Run it before
-- the #363 and #361 rollback scripts. Apply through the normal release path with the
-- gate off.
--
-- Additive and plan-only: new plan columns, one new table and new companion_plan_*
-- functions. No shared #361/#363 function is replaced, so a sibling slice that extends
-- the shared registry composes with this one. Added tasks reuse the #363 executor
-- (companion_apply_one) and receipt writer (companion_record): each has its own
-- task.create_custom receipt and the #363 revision-checked Undo.

-- ------------------------------------------------------------------ plans
-- A plan holds its goal and ordered references (companion_plan_tasks) to shared Checklist
-- tasks. It never copies task progress: every read joins the task rows.
alter table public.companion_plans
  -- Profile values and task availability the approved draft was reviewed against.
  add column context jsonb,
  -- { conversation_id, message_id } of the caller's own conversation it came from.
  add column source jsonb,
  add column proposal_id uuid,
  add column operation_id uuid,
  add column updated_at timestamptz,
  -- Set by the Undo of the approval that created the plan. History is kept.
  add column removed_at timestamptz;
create index companion_plans_user_idx on public.companion_plans (user_id, updated_at desc);

-- Plan drafts. A separate table from companion_proposals so the plan domain does not
-- widen shared constraints that sibling slices also extend.
create table public.companion_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1,
  -- 'plan': a new plan for review. 'undo': the reviewed compensating change of a plan
  -- Undo that conflicted with newer edits. 'retry': the revised review of the failed
  -- additions of a saved plan whose relevant context changed before a Retry.
  kind text not null check (kind in ('plan', 'undo', 'retry')),
  goal text not null check (char_length(goal) between 1 and 120),
  -- The ordered draft the user reviews (canonical form, see companion_plan_canonical).
  items jsonb not null,
  items_hash text not null,
  -- The draft as first prepared. Edits may reorder, exclude or swap in a candidate
  -- match; they cannot introduce tasks the preparation did not name.
  original_items jsonb not null,
  context jsonb,
  previous_context jsonb,
  review_reason text check (review_reason is null or review_reason in ('edited', 'context_changed', 'restored')),
  source jsonb,
  status text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  receipt_operation_id uuid,
  -- kind 'undo': the plan receipt this change reverses.
  undo_of uuid,
  -- kind 'retry': the saved plan and the plan approval receipt whose failed additions
  -- it reviews again.
  plan_id uuid,
  retry_of uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companion_plan_proposals_user_idx on public.companion_plan_proposals (user_id, status, updated_at desc);
create index companion_plan_proposals_source_idx
  on public.companion_plan_proposals (user_id, (source->>'conversation_id')) where source is not null;
create index companion_plan_proposals_retry_idx
  on public.companion_plan_proposals (user_id, retry_of) where retry_of is not null;
alter table public.companion_plan_proposals enable row level security;
-- Only the action service reads and writes drafts. No client policy.
revoke all on public.companion_plan_proposals from anon, authenticated;
grant select, insert, update, delete on public.companion_plan_proposals to service_role;

-- ------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives what only this migration understands into
-- companion_rollback_archive_364. Re-applying puts it back: plan drafts and the plan
-- columns. Every restored open draft moves to a new revision that needs review, so no
-- approval captured before the rollback is used. Rows of deleted accounts or deleted
-- plans are not restored.
do $recover364$
begin
  if to_regclass('public.companion_rollback_archive_364') is null then
    return;
  end if;
  insert into public.companion_plan_proposals
    select (jsonb_populate_record(null::public.companion_plan_proposals,
              case when a.row_data->>'status' = 'draft'
                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::integer + 1,
                                                         'review_reason', 'restored', 'previous_context', null,
                                                         'updated_at', now())
                   else a.row_data end)).*
      from public.companion_rollback_archive_364 a
     where a.source = 'companion_plan_proposals' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  update public.companion_plans p set
      context = nullif(a.row_data->'context', 'null'::jsonb),
      source = nullif(a.row_data->'source', 'null'::jsonb),
      proposal_id = (a.row_data->>'proposal_id')::uuid,
      operation_id = (a.row_data->>'operation_id')::uuid,
      updated_at = (a.row_data->>'updated_at')::timestamptz,
      removed_at = (a.row_data->>'removed_at')::timestamptz
    from public.companion_rollback_archive_364 a
   where a.source = 'companion_plans' and a.restored_at is null
     and p.id = (a.row_data->>'id')::uuid and p.user_id = (a.row_data->>'user_id')::uuid;
  update public.companion_rollback_archive_364 set restored_at = now() where restored_at is null;
end $recover364$;

-- ------------------------------------------------------------------ helpers
create function public.companion_plan_plain(p_val jsonb, p_max integer) returns text
language sql immutable as $$
  select case when jsonb_typeof(p_val) = 'string' and (p_val #>> '{}') = btrim(p_val #>> '{}')
               and char_length(p_val #>> '{}') between 1 and p_max and (p_val #>> '{}') !~ '[[:cntrl:]]'
              then p_val #>> '{}' end
$$;

-- Whether the caller can still use a task: a custom task of theirs that is not removed,
-- or a published content task they have not removed.
create function public.companion_plan_task_available(p_user uuid, p_ref text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case split_part(p_ref, ':', 1)
    when 'custom' then exists (select 1 from public.custom_checklist_tasks c
                                where c.user_id = p_user and c.id = substr(p_ref, 8)::bigint and c.removed_at is null)
    when 'sanity' then not exists (select 1 from public.user_tasks u
                                    where u.user_id = p_user and u.sanity_checklist_id = substr(p_ref, 8)
                                      and u.dismissed_at is not null)
    else false end
$$;

-- Current progress of one referenced task, read from the task rows (never copied).
create function public.companion_plan_task_now(p_user uuid, p_ref text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case split_part(p_ref, ':', 1)
    when 'custom' then (
      select jsonb_build_object('task_ref', p_ref, 'source', 'custom', 'exists', c.id is not null,
               'title', c.title, 'state', public.companion_task_state(c.completed, c.progress_state),
               'waiting_reason', c.waiting_reason, 'revision', c.revision,
               'removed', c.id is null or c.removed_at is not null)
        from (select 1) one
        left join public.custom_checklist_tasks c on c.user_id = p_user and c.id = substr(p_ref, 8)::bigint)
    else (
      select jsonb_build_object('task_ref', p_ref, 'source', 'sanity', 'exists', true,
               'state', case when u.user_task_id is null then 'not_started'
                             else public.companion_task_state(u.completed, u.progress_state) end,
               'waiting_reason', u.waiting_reason, 'revision', coalesce(u.revision, 0),
               'removed', u.dismissed_at is not null)
        from (select 1) one
        left join public.user_tasks u on u.user_id = p_user and u.sanity_checklist_id = substr(p_ref, 8))
  end
$$;

-- Validates and canonicalizes prepared items. Existing: { kind, task_ref, label? }.
-- New: { kind, key, title, priority, include, candidates? } with keys n1, n2, ... in
-- order. Refuses what the registry does not allow; writes nothing.
create function public.companion_plan_canonical(p_user uuid, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_item jsonb; v_key text; v_out jsonb := '[]'::jsonb; v_refs text[] := '{}'; v_titles text[] := '{}';
  v_ref text; v_title text; v_label text; v_new integer := 0; v_cand jsonb; v_cands jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12 then
    perform public.companion_fail('CA422', 'invalid_items');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      perform public.companion_fail('CA422', 'invalid_items');
    end if;
    if v_item->>'kind' = 'existing' then
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key not in ('kind', 'task_ref', 'label') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_ref := case when jsonb_typeof(v_item->'task_ref') = 'string' then v_item->>'task_ref' end;
      if v_ref is null or not public.companion_task_ref_valid(v_ref) then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      if v_ref = any(v_refs) then
        perform public.companion_fail('CA422', 'duplicate_task_ref');
      end if;
      if v_ref like 'custom:%' and not exists (select 1 from public.custom_checklist_tasks c
                                                where c.user_id = p_user and c.id = substr(v_ref, 8)::bigint) then
        perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
      end if;
      if not public.companion_plan_task_available(p_user, v_ref) then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
      v_label := null;
      if v_item ? 'label' then
        v_label := public.companion_plan_plain(v_item->'label', 160);
        if v_label is null then
          perform public.companion_fail('CA422', 'invalid_label');
        end if;
      end if;
      v_refs := v_refs || v_ref;
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'existing', 'task_ref', v_ref)
                 || case when v_label is null then '{}'::jsonb else jsonb_build_object('label', v_label) end);
    elsif v_item->>'kind' = 'new' then
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key not in ('kind', 'title', 'priority', 'candidates') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_title := public.companion_plan_plain(v_item->'title', 200);
      if v_title is null then
        perform public.companion_fail('CA422', 'invalid_title');
      end if;
      if public.companion_title_key(v_title) = any(v_titles) then
        perform public.companion_fail('CA422', 'duplicate_title');
      end if;
      if v_item ? 'priority' and (jsonb_typeof(v_item->'priority') <> 'string'
         or (v_item->>'priority') not in ('Do now', 'Do soon', 'Explore and connect', 'Optional / later')) then
        perform public.companion_fail('CA422', 'invalid_priority');
      end if;
      -- Possible matches named by the suggestion (published content tasks with the same
      -- title). Custom-task matches are found here, from the caller's own rows.
      v_cands := '[]'::jsonb;
      if v_item ? 'candidates' then
        if jsonb_typeof(v_item->'candidates') <> 'array' or jsonb_array_length(v_item->'candidates') > 3 then
          perform public.companion_fail('CA422', 'invalid_candidates');
        end if;
        for v_cand in select * from jsonb_array_elements(v_item->'candidates') loop
          if jsonb_typeof(v_cand) <> 'string' or not public.companion_task_ref_valid(v_cand #>> '{}')
             or (v_cand #>> '{}') not like 'sanity:%' or v_cands @> jsonb_build_array(v_cand) then
            perform public.companion_fail('CA422', 'invalid_candidates');
          end if;
          v_cands := v_cands || jsonb_build_array(v_cand);
        end loop;
      end if;
      v_new := v_new + 1;
      v_titles := v_titles || public.companion_title_key(v_title);
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'kind', 'new', 'key', 'n' || v_new, 'title', v_title,
        'priority', coalesce(v_item->>'priority', 'Do soon'), 'include', true)
        || case when jsonb_array_length(v_cands) > 0 then jsonb_build_object('candidates', v_cands) else '{}'::jsonb end);
    else
      perform public.companion_fail('CA422', 'invalid_items');
    end if;
  end loop;
  if v_new > 5 then
    perform public.companion_fail('CA422', 'too_many_additions');
  end if;
  return v_out;
end $$;

-- The relevant context of a plan draft, read now: the profile values shown in review,
-- whether each referenced task is still available, and the possible matches of each
-- included addition (the caller's live custom tasks with the same title, and named
-- content tasks still available). Task progress is not part of it: a state change on a
-- reused task does not change what approval writes.
create function public.companion_plan_context(p_user uuid, p_items jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'profile', public.companion_profile_context(p_user),
    'existing', coalesce((select jsonb_agg(jsonb_build_object('task_ref', i->>'task_ref',
                            'available', public.companion_plan_task_available(p_user, i->>'task_ref')) order by n)
                            from jsonb_array_elements(p_items) with ordinality e(i, n) where i->>'kind' = 'existing'), '[]'::jsonb),
    'matches', coalesce((select jsonb_object_agg(i->>'key', (
                            select coalesce(jsonb_agg(m order by m->>'task_ref'), '[]'::jsonb) from (
                              select jsonb_build_object('task_ref', 'custom:' || c.id, 'title', c.title) m
                                from public.custom_checklist_tasks c
                               where c.user_id = p_user and c.removed_at is null
                                 and public.companion_title_key(c.title) = public.companion_title_key(i->>'title')
                              union all
                              select jsonb_build_object('task_ref', x #>> '{}', 'title', null)
                                from jsonb_array_elements(coalesce(i->'candidates', '[]'::jsonb)) x
                               where public.companion_plan_task_available(p_user, x #>> '{}')) s))
                            from jsonb_array_elements(p_items) i
                           where i->>'kind' = 'new' and (i->>'include')::boolean), '{}'::jsonb))
$$;

-- ------------------------------------------------------------------ views
-- Included additions with a possible match the user has not resolved: approval waits
-- until each is replaced by the existing task or explicitly kept as a new task.
create function public.companion_plan_unresolved(p_items jsonb, p_context jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(i->>'key' order by n), '[]'::jsonb)
    from jsonb_array_elements(p_items) with ordinality e(i, n)
   where i->>'kind' = 'new' and (i->>'include')::boolean and not coalesce((i->>'confirm_new')::boolean, false)
     and jsonb_array_length(coalesce(p_context->'matches'->(i->>'key'), '[]'::jsonb)) > 0
$$;

-- Additions of a plan approval that failed and that no later retry or reviewed retry has
-- settled (added, replaced by an existing task, or left out). An addition waiting in an
-- open revised review is not retryable: only approving that review can add it.
create function public.companion_plan_retryable(p_receipt public.companion_action_receipts) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_receipt.outcome->>'kind' <> 'plan' then '[]'::jsonb else coalesce((
    select jsonb_agg(r->>'key' order by n)
      from jsonb_array_elements(p_receipt.outcome->'results') with ordinality e(r, n)
     where r->>'outcome' = 'failed'
       and not exists (select 1 from public.companion_action_receipts x, jsonb_array_elements(x.outcome->'results') xr
                        where x.user_id = p_receipt.user_id and x.outcome->>'retry_of' = p_receipt.operation_id::text
                          and xr->>'key' = r->>'key' and xr->>'outcome' in ('created', 'reused', 'excluded'))
       and not exists (select 1 from public.companion_plan_proposals pp
                        where pp.user_id = p_receipt.user_id and pp.kind = 'retry' and pp.status = 'draft'
                          and pp.retry_of = p_receipt.operation_id
                          and pp.original_items @> jsonb_build_array(jsonb_build_object('key', r->>'key')))), '[]'::jsonb) end
$$;

create function public.companion_plan_receipt_view(p_receipt public.companion_action_receipts) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'operation_id', p_receipt.operation_id,
    'created_at', p_receipt.created_at,
    'kind', p_receipt.outcome->>'kind',
    'plan_id', p_receipt.outcome->>'plan_id',
    'status', case when exists (select 1 from jsonb_array_elements(p_receipt.outcome->'results') r
                                where r->>'outcome' in ('failed', 'needs_review')) then 'partial' else 'applied' end,
    'results', p_receipt.outcome->'results',
    'retry_of', p_receipt.outcome->>'retry_of',
    'plan_proposal_id', p_receipt.outcome->>'plan_proposal_id',
    'undo_of', p_receipt.undo_of,
    'retryable', public.companion_plan_retryable(p_receipt),
    'undone_by', (select u.operation_id from public.companion_action_receipts u
                   where u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id),
    'undoable', p_receipt.outcome->>'kind' = 'plan'
                and not exists (select 1 from public.companion_action_receipts u
                                 where u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id)
                and exists (select 1 from public.companion_plans p where p.user_id = p_receipt.user_id
                              and p.id = (p_receipt.outcome->>'plan_id')::uuid and p.removed_at is null),
    'removal_count', (select count(*) from jsonb_array_elements(p_receipt.outcome->'results') r
                       where p_receipt.outcome->>'kind' = 'plan' and r->>'outcome' = 'created'))
$$;

create function public.companion_plan_proposal_view(p_prop public.companion_plan_proposals) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'plan_proposal_id', p_prop.id, 'proposal_revision', p_prop.revision,
    'status', p_prop.status, 'kind', p_prop.kind, 'goal', p_prop.goal,
    'items', p_prop.items, 'context', p_prop.context, 'previous_context', p_prop.previous_context,
    'review_reason', p_prop.review_reason, 'source', p_prop.source, 'undo_of', p_prop.undo_of,
    'retry_of', p_prop.retry_of,
    'change_count', (select count(*) from jsonb_array_elements(p_prop.items) i
                      where (i->>'kind' = 'new' and (i->>'include')::boolean) or i->>'kind' = 'remove_task'),
    'unresolved', public.companion_plan_unresolved(p_prop.items, p_prop.context),
    'tasks', coalesce((select jsonb_agg(public.companion_plan_task_now(p_prop.user_id, x.ref) order by x.ref)
                         from (select distinct coalesce(i->>'task_ref', c #>> '{}') ref
                                 from jsonb_array_elements(p_prop.items) i
                                 left join lateral jsonb_array_elements(coalesce(i->'candidates', '[]'::jsonb)) c on true
                                where i->>'task_ref' is not null or c is not null) x), '[]'::jsonb),
    'created_at', p_prop.created_at, 'updated_at', p_prop.updated_at,
    'plan_id', coalesce(p_prop.plan_id, (select p.id from public.companion_plans p
                                          where p.user_id = p_prop.user_id and p.proposal_id = p_prop.id)),
    'receipt', (select public.companion_plan_receipt_view(r) from public.companion_action_receipts r
                 where r.user_id = p_prop.user_id and r.operation_id = p_prop.receipt_operation_id))
$$;

create function public.companion_plan_view(p_plan public.companion_plans) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'plan_id', p_plan.id, 'goal', p_plan.goal, 'revision', p_plan.revision,
    'created_at', p_plan.created_at, 'updated_at', coalesce(p_plan.updated_at, p_plan.created_at),
    'removed', p_plan.removed_at is not null, 'context', p_plan.context, 'source', p_plan.source,
    'proposal_id', p_plan.proposal_id,
    'items', coalesce((
      select jsonb_agg(public.companion_plan_task_now(p_plan.user_id, pt.task_ref)
               || jsonb_build_object('position', pt.position)
               || coalesce((select jsonb_build_object('label', i->>'label')
                              from public.companion_plan_proposals pp, jsonb_array_elements(pp.items) i
                             where pp.id = p_plan.proposal_id and i->>'task_ref' = pt.task_ref and i ? 'label'
                             limit 1), '{}'::jsonb)
               order by pt.position, pt.task_ref)
        from public.companion_plan_tasks pt where pt.plan_id = p_plan.id), '[]'::jsonb),
    'receipt', (select public.companion_plan_receipt_view(r) from public.companion_action_receipts r
                 where r.user_id = p_plan.user_id and r.operation_id = p_plan.operation_id),
    -- The latest revised review of this plan's failed additions (open, approved or
    -- closed), so a later visit can reach it without the message that started it.
    'review', (select public.companion_plan_proposal_view(pp) from public.companion_plan_proposals pp
                where pp.user_id = p_plan.user_id and pp.kind = 'retry' and pp.plan_id = p_plan.id
                order by pp.created_at desc, pp.id desc limit 1))
$$;

-- ------------------------------------------------------------------ prepare
create function public.companion_plan_prepare(p_user_id uuid, p_goal jsonb, p_items jsonb, p_source jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_goal text := public.companion_plan_plain(p_goal, 120);
  v_items jsonb;
  v_prop public.companion_plan_proposals%rowtype;
begin
  if v_goal is null then
    perform public.companion_fail('CA422', 'invalid_goal');
  end if;
  v_items := public.companion_plan_canonical(p_user_id, p_items);
  insert into public.companion_plan_proposals
    (user_id, kind, goal, items, items_hash, original_items, context, source)
  values (p_user_id, 'plan', v_goal, v_items, public.companion_ops_hash(v_items), v_items,
          public.companion_plan_context(p_user_id, v_items), public.companion_check_source(p_user_id, p_source))
  returning * into v_prop;
  return public.companion_plan_proposal_view(v_prop);
end $$;

create function public.companion_plan_get_proposal(p_user_id uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_plan_proposals%rowtype;
begin
  select * into v_prop from public.companion_plan_proposals where id = p_id and user_id = p_user_id;
  if not found then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  return public.companion_plan_proposal_view(v_prop);
end $$;

-- ------------------------------------------------------------------ edit
-- Rebuilds an edited draft from the client's item list: { kind: 'existing', task_ref }
-- or { kind: 'new', key, include, confirm_new? }. Titles, priorities and labels come
-- from the original draft, never from the edit. An existing reference must be one the
-- preparation named, a candidate match it named, or a current same-title match of one
-- of its additions ("use the existing task").
create function public.companion_plan_edited_items(p_user uuid, p_prop public.companion_plan_proposals, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_item jsonb; v_key text; v_orig jsonb; v_out jsonb := '[]'::jsonb; v_seen text[] := '{}'; v_ref text; v_label text;
  v_matches jsonb := (public.companion_plan_context(p_user, (
    select jsonb_agg(i || jsonb_build_object('include', true)) from jsonb_array_elements(p_prop.original_items) i)))->'matches';
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12 then
    perform public.companion_fail('CA422', 'invalid_items');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      perform public.companion_fail('CA422', 'invalid_items');
    end if;
    if v_item->>'kind' = 'existing' then
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key not in ('kind', 'task_ref') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_ref := case when jsonb_typeof(v_item->'task_ref') = 'string' then v_item->>'task_ref' end;
      if v_ref is null or not public.companion_task_ref_valid(v_ref) then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      select o into v_orig from jsonb_array_elements(p_prop.original_items) o
       where o->>'kind' = 'existing' and o->>'task_ref' = v_ref;
      if v_orig is not null then
        v_label := v_orig->>'label';
      else
        -- A candidate match of an addition: labelled with that addition's title.
        select o->>'title' into v_label from jsonb_array_elements(p_prop.original_items) o
         where o->>'kind' = 'new'
           and (coalesce(o->'candidates', '[]'::jsonb) @> jsonb_build_array(v_ref)
                or coalesce(v_matches->(o->>'key'), '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('task_ref', v_ref))
                or exists (select 1 from jsonb_array_elements(coalesce(v_matches->(o->>'key'), '[]'::jsonb)) m
                            where m->>'task_ref' = v_ref))
         limit 1;
        if v_label is null then
          perform public.companion_fail('CA422', 'item_not_in_draft');
        end if;
      end if;
      if ('ref:' || v_ref) = any(v_seen) then
        perform public.companion_fail('CA422', 'duplicate_task_ref');
      end if;
      if not public.companion_plan_task_available(p_user, v_ref) then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
      v_seen := v_seen || ('ref:' || v_ref);
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'existing', 'task_ref', v_ref)
                 || case when v_label is null then '{}'::jsonb else jsonb_build_object('label', v_label) end);
      v_orig := null;
    elsif v_item->>'kind' = 'new' then
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key not in ('kind', 'key', 'include', 'confirm_new') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      select o into v_orig from jsonb_array_elements(p_prop.original_items) o
       where o->>'kind' = 'new' and o->>'key' = v_item->>'key' and jsonb_typeof(v_item->'key') = 'string';
      if v_orig is null then
        perform public.companion_fail('CA422', 'item_not_in_draft');
      end if;
      if jsonb_typeof(v_item->'include') <> 'boolean'
         or (v_item ? 'confirm_new' and v_item->'confirm_new' <> 'true'::jsonb) then
        perform public.companion_fail('CA422', 'invalid_items');
      end if;
      if ('key:' || (v_item->>'key')) = any(v_seen) then
        perform public.companion_fail('CA422', 'duplicate_item');
      end if;
      v_seen := v_seen || ('key:' || (v_item->>'key'));
      v_out := v_out || jsonb_build_array((v_orig || jsonb_build_object('include', (v_item->>'include')::boolean))
                 || case when v_item ? 'confirm_new' then jsonb_build_object('confirm_new', true) else '{}'::jsonb end);
      v_orig := null;
    else
      perform public.companion_fail('CA422', 'invalid_items');
    end if;
  end loop;
  return v_out;
end $$;

-- Edit a draft: a new revision that needs its own approval. A request naming an older
-- revision, or a draft that is no longer open, changes nothing and returns the current
-- draft ({ changed: true, plan_proposal }). Task progress is never touched.
create function public.companion_plan_revise(p_user_id uuid, p_id uuid, p_revision integer, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_plan_proposals%rowtype;
  v_items jsonb;
begin
  select * into v_prop from public.companion_plan_proposals where id = p_id and user_id = p_user_id for update;
  if not found or v_prop.kind not in ('plan', 'retry') then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  if v_prop.status <> 'draft' or v_prop.revision <> p_revision then
    return jsonb_build_object('changed', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  v_items := public.companion_plan_edited_items(p_user_id, v_prop, p_items);
  update public.companion_plan_proposals
     set items = v_items, items_hash = public.companion_ops_hash(v_items), revision = revision + 1,
         context = public.companion_plan_context(p_user_id, v_items), previous_context = null,
         review_reason = 'edited', updated_at = now()
   where id = v_prop.id
  returning * into v_prop;
  return jsonb_build_object('plan_proposal', public.companion_plan_proposal_view(v_prop));
end $$;

-- Not now: closes the displayed draft revision without saving anything.
create function public.companion_plan_cancel(p_user_id uuid, p_id uuid, p_revision integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_plan_proposals%rowtype;
begin
  select * into v_prop from public.companion_plan_proposals where id = p_id and user_id = p_user_id for update;
  if not found then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  if v_prop.status <> 'draft' or v_prop.revision <> p_revision then
    return jsonb_build_object('changed', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  update public.companion_plan_proposals set status = 'cancelled', updated_at = now()
   where id = v_prop.id returning * into v_prop;
  return jsonb_build_object('plan_proposal', public.companion_plan_proposal_view(v_prop));
end $$;

-- ------------------------------------------------------------------ apply
-- One approval of the displayed draft revision and exact items. Each included addition
-- is an independent write with its own operation identity (derived from the approval's
-- operation id and the item key), its own task.create_custom receipt and #363 Undo.
-- The plan and each reference to a task added here commit only with that task.
create function public.companion_plan_item_operation(p_user uuid, p_op uuid, p_key text) returns uuid
language sql immutable as $$
  select md5(p_user::text || ':' || p_op::text || ':' || p_key)::uuid
$$;

-- One included addition, as an independent write: the task, its own receipt (identity
-- derived from the approval and the item key) and the plan reference commit together
-- or not at all. A failure is recorded as this item's outcome and the others go on.
-- p_op is the plan approval the item belongs to (its identity); p_approval, when given,
-- is the reviewed retry approval that authorized this write.
create function public.companion_plan_add_item(
  p_user uuid, p_op uuid, p_version integer, p_prop public.companion_plan_proposals, p_plan uuid, p_item jsonb, p_pos integer,
  p_approval uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_create jsonb := public.companion_create_op(p_item->>'title', p_item->>'priority');
  v_item_op uuid := public.companion_plan_item_operation(p_user, p_op, p_item->>'key');
  v_done public.companion_action_receipts%rowtype;
  v_res jsonb;
begin
  begin
    -- A retry after an unknown outcome: the item's own receipt is the answer.
    select * into v_done from public.companion_action_receipts where user_id = p_user and operation_id = v_item_op;
    if found then
      v_res := v_done.outcome->'results'->0;
    else
      v_res := public.companion_apply_one(p_user, v_create);
      perform public.companion_record(p_user, v_item_op, public.companion_ops_hash(jsonb_build_array(v_create)),
        p_version, jsonb_build_object('kind', 'approved_plan', 'plan_proposal_id', p_prop.id,
          'proposal_revision', p_prop.revision, 'plan_operation_id', p_op)
          || case when p_approval is null then '{}'::jsonb else jsonb_build_object('approval_operation_id', p_approval) end,
        jsonb_build_array(v_res), null);
    end if;
    insert into public.companion_plan_tasks (plan_id, task_ref, position) values (p_plan, v_res->>'task_ref', p_pos)
      on conflict do nothing;
    return jsonb_build_object('kind', 'new', 'key', p_item->>'key', 'title', p_item->>'title',
      'task_ref', v_res->>'task_ref', 'outcome', 'created', 'item_operation_id', v_item_op,
      'after_revision', (v_res->>'after_revision')::bigint);
  exception when others then
    return jsonb_build_object('kind', 'new', 'key', p_item->>'key', 'title', p_item->>'title', 'outcome', 'failed',
      'reason', case when sqlstate like 'CA%' then sqlerrm else 'write_failed' end, 'item_operation_id', v_item_op);
  end;
end $$;

create function public.companion_plan_reply(p_receipt public.companion_action_receipts, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', (public.companion_plan_receipt_view(p_receipt))->>'status',
    'replayed', p_replayed, 'operation_id', p_receipt.operation_id,
    'receipt', public.companion_plan_receipt_view(p_receipt),
    'plan', (select public.companion_plan_view(p) from public.companion_plans p
              where p.user_id = p_receipt.user_id and p.id = (p_receipt.outcome->>'plan_id')::uuid))
$$;

create function public.companion_plan_apply(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text;
  v_receipt public.companion_action_receipts%rowtype;
  v_prop public.companion_plan_proposals%rowtype;
  v_plan public.companion_plans%rowtype;
  v_item jsonb; v_pos integer; v_res jsonb; v_create jsonb; v_item_op uuid; v_now jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'approved_proposal'
     or jsonb_typeof(p_authorization->'proposal_id') is distinct from 'string'
     or (p_authorization->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or public.companion_nonneg_int(p_authorization->'proposal_revision', 9) is null then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  v_hash := public.companion_ops_hash(jsonb_build_object('plan_apply', p_authorization->>'proposal_id',
              'revision', p_authorization->'proposal_revision', 'items', p_items));
  -- One writer per (account, operation); a duplicate waits, then replays the receipt.
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));
  select * into v_receipt from public.companion_action_receipts where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      perform public.companion_fail('CA410', 'operation_id_reused');
    end if;
    return public.companion_plan_reply(v_receipt, true);
  end if;

  select * into v_prop from public.companion_plan_proposals
   where id = (p_authorization->>'proposal_id')::uuid and user_id = p_user_id for update;
  -- Approved already under another operation id (a competing tap): nothing is written
  -- and the caller gets the saved draft with its receipt.
  if found and v_prop.kind in ('plan', 'retry') and v_prop.status = 'applied' then
    return jsonb_build_object('changed', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  if not found or v_prop.status <> 'draft'
     or v_prop.revision <> (p_authorization->>'proposal_revision')::integer
     or v_prop.items_hash <> public.companion_ops_hash(p_items) then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  if v_prop.kind = 'undo' then
    return public.companion_plan_apply_undo(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_prop);
  end if;
  if v_prop.kind = 'retry' then
    return public.companion_plan_apply_review(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_prop);
  end if;
  -- Read the relevant context again. When it changed, the approval is not used: the
  -- draft moves to a new revision with the current context for a new review, and
  -- nothing is written (no receipt either, so the operation stays not applied).
  v_now := public.companion_plan_context(p_user_id, v_prop.items);
  if v_now is distinct from v_prop.context then
    update public.companion_plan_proposals
       set revision = revision + 1, previous_context = context, context = v_now,
           review_reason = 'context_changed', updated_at = now()
     where id = v_prop.id returning * into v_prop;
    return jsonb_build_object('needs_review', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  -- A reference to a task removed since preparation is never saved: the user drops it.
  if exists (select 1 from jsonb_array_elements(v_now->'existing') x where not (x->>'available')::boolean) then
    perform public.companion_fail('CA422', 'task_removed');
  end if;
  if jsonb_array_length(public.companion_plan_unresolved(v_prop.items, v_prop.context)) > 0 then
    perform public.companion_fail('CA422', 'match_unresolved');
  end if;

  update public.companion_plan_proposals set status = 'applied', receipt_operation_id = p_operation_id, updated_at = now()
   where id = v_prop.id;
  insert into public.companion_plans (user_id, goal, context, source, proposal_id, operation_id, updated_at)
  values (p_user_id, v_prop.goal, v_prop.context, v_prop.source, v_prop.id, p_operation_id, now())
  returning * into v_plan;

  for v_item, v_pos in select i, n::integer from jsonb_array_elements(v_prop.items) with ordinality e(i, n) loop
    if v_item->>'kind' = 'existing' then
      insert into public.companion_plan_tasks (plan_id, task_ref, position) values (v_plan.id, v_item->>'task_ref', v_pos);
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', 'existing', 'task_ref', v_item->>'task_ref',
                     'outcome', 'reused') || case when v_item ? 'label' then jsonb_build_object('label', v_item->>'label')
                                                  else '{}'::jsonb end);
    elsif (v_item->>'include')::boolean then
      v_results := v_results || jsonb_build_array(
        public.companion_plan_add_item(p_user_id, p_operation_id, p_contract_version, v_prop, v_plan.id, v_item, v_pos));
    end if;
  end loop;

  insert into public.companion_action_receipts
    (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
  values (p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization,
          jsonb_build_object('kind', 'plan', 'plan_id', v_plan.id, 'goal', v_prop.goal, 'results', v_results))
  returning * into v_receipt;
  return public.companion_plan_reply(v_receipt, false);
end $$;

-- Retry of the failed additions of one plan approval. Only items still failed run,
-- each with its original identity. An item whose possible matches or whose profile
-- context changed since it was approved is not written: it moves to one revised review
-- (kind 'retry', linked to the plan and this receipt) that shows the remaining change
-- with the approved and current context and needs its own approval. Saved items, reused
-- tasks and the plan's other references are untouched.
create function public.companion_plan_retry(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_receipt_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(jsonb_build_object('plan_retry', p_receipt_operation_id));
  v_receipt public.companion_action_receipts%rowtype;
  v_target public.companion_action_receipts%rowtype;
  v_plan public.companion_plans%rowtype;
  v_prop public.companion_plan_proposals%rowtype;
  v_keys jsonb; v_item jsonb; v_pos integer; v_now jsonb; v_base jsonb; v_res jsonb; v_results jsonb := '[]'::jsonb;
  v_review_items jsonb := '[]'::jsonb; v_before jsonb; v_review_id uuid; v_written boolean := false;
begin
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'ui_control' then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));
  select * into v_receipt from public.companion_action_receipts where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      perform public.companion_fail('CA410', 'operation_id_reused');
    end if;
    return public.companion_plan_reply(v_receipt, true);
  end if;
  select * into v_target from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_receipt_operation_id and outcome->>'kind' = 'plan';
  if not found then
    perform public.companion_fail('CA404', 'receipt_not_found');
  end if;
  select * into v_plan from public.companion_plans
   where id = (v_target.outcome->>'plan_id')::uuid and user_id = p_user_id for update;
  if not found or v_plan.removed_at is not null then
    perform public.companion_fail('CA422', 'plan_removed');
  end if;
  v_keys := public.companion_plan_retryable(v_target);
  if jsonb_array_length(v_keys) = 0 then
    perform public.companion_fail('CA422', 'nothing_to_retry');
  end if;
  select * into v_prop from public.companion_plan_proposals where id = v_plan.proposal_id and user_id = p_user_id;
  v_now := public.companion_plan_context(p_user_id, v_prop.items);
  for v_item, v_pos in select i, n::integer from jsonb_array_elements(v_prop.items) with ordinality e(i, n)
                         where v_keys @> jsonb_build_array(i->>'key') loop
    -- The context this item was last approved against: a reviewed retry that approved it
    -- (and then failed to write) or the plan approval.
    v_base := null;
    select pp.context into v_base from public.companion_plan_proposals pp
     where pp.user_id = p_user_id and pp.kind = 'retry' and pp.retry_of = p_receipt_operation_id and pp.status = 'applied'
       and pp.original_items @> jsonb_build_array(jsonb_build_object('key', v_item->>'key'))
     order by pp.updated_at desc, pp.id desc limit 1;
    v_base := coalesce(v_base, v_prop.context);
    if v_now->'profile' is distinct from v_base->'profile'
       or (not coalesce((v_item->>'confirm_new')::boolean, false)
           and v_now->'matches'->(v_item->>'key') is distinct from v_base->'matches'->(v_item->>'key')) then
      v_review_items := v_review_items || jsonb_build_array(v_item);
      v_before := coalesce(v_before, jsonb_build_object('profile', v_base->'profile', 'existing', '[]'::jsonb,
                                                        'matches', '{}'::jsonb));
      v_before := jsonb_set(v_before, '{matches}', (v_before->'matches')
                    || jsonb_build_object(v_item->>'key', coalesce(v_base->'matches'->(v_item->>'key'), '[]'::jsonb)));
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', 'new', 'key', v_item->>'key',
                     'title', v_item->>'title', 'outcome', 'needs_review', 'reason', 'context_changed'));
    else
      v_res := public.companion_plan_add_item(
        p_user_id, p_receipt_operation_id, p_contract_version, v_prop, v_plan.id, v_item, v_pos);
      v_written := v_written or v_res->>'outcome' = 'created';
      v_results := v_results || jsonb_build_array(v_res);
    end if;
  end loop;
  if jsonb_array_length(v_review_items) > 0 then
    insert into public.companion_plan_proposals
      (user_id, kind, goal, items, items_hash, original_items, context, previous_context, review_reason, source,
       plan_id, retry_of)
    values (p_user_id, 'retry', v_plan.goal, v_review_items, public.companion_ops_hash(v_review_items), v_review_items,
            public.companion_plan_context(p_user_id, v_review_items), v_before, 'context_changed', v_plan.source,
            v_plan.id, p_receipt_operation_id)
    returning id into v_review_id;
    v_results := (select jsonb_agg(case when r->>'outcome' = 'needs_review'
                                        then r || jsonb_build_object('plan_proposal_id', v_review_id) else r end
                                   order by n)
                    from jsonb_array_elements(v_results) with ordinality e(r, n));
  end if;
  -- Only a saved addition changes the plan (and makes a later plan Undo a reviewed one).
  if v_written then
    update public.companion_plans set revision = revision + 1, updated_at = now() where id = v_plan.id;
  end if;
  insert into public.companion_action_receipts
    (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
  values (p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization,
          jsonb_build_object('kind', 'plan_retry', 'plan_id', v_plan.id, 'retry_of', p_receipt_operation_id,
                             'goal', v_plan.goal, 'results', v_results))
  returning * into v_receipt;
  return public.companion_plan_reply(v_receipt, false);
end $$;

-- Approval of a revised retry review (kind 'retry'), at its displayed revision and exact
-- items. Reads the relevant context again: when it changed once more, nothing is written
-- and the review moves to a new revision. Otherwise each remaining addition is written
-- with the identity it had in the plan approval (so a task is never added twice, whatever
-- path reaches it), at its original place in the plan; an addition replaced by an
-- existing task becomes a reference to it; one left out is recorded as left out. One
-- plan_retry receipt names the reviewed proposal and what actually happened.
create function public.companion_plan_apply_review(
  p_user uuid, p_op uuid, p_hash text, p_version integer, p_auth jsonb, p_prop public.companion_plan_proposals
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan public.companion_plans%rowtype;
  v_orig public.companion_plan_proposals%rowtype;
  v_prop public.companion_plan_proposals%rowtype := p_prop;
  v_receipt public.companion_action_receipts%rowtype;
  v_now jsonb; v_item jsonb; v_key text; v_pos integer; v_res jsonb; v_results jsonb := '[]'::jsonb;
  v_written boolean := false;
begin
  select * into v_plan from public.companion_plans where id = p_prop.plan_id and user_id = p_user for update;
  if not found or v_plan.removed_at is not null then
    perform public.companion_fail('CA422', 'plan_removed');
  end if;
  v_now := public.companion_plan_context(p_user, p_prop.items);
  if v_now is distinct from p_prop.context then
    update public.companion_plan_proposals
       set revision = revision + 1, previous_context = context, context = v_now,
           review_reason = 'context_changed', updated_at = now()
     where id = p_prop.id returning * into v_prop;
    return jsonb_build_object('needs_review', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  if exists (select 1 from jsonb_array_elements(v_now->'existing') x where not (x->>'available')::boolean) then
    perform public.companion_fail('CA422', 'task_removed');
  end if;
  if jsonb_array_length(public.companion_plan_unresolved(p_prop.items, p_prop.context)) > 0 then
    perform public.companion_fail('CA422', 'match_unresolved');
  end if;
  select * into v_orig from public.companion_plan_proposals where id = v_plan.proposal_id and user_id = p_user;

  update public.companion_plan_proposals set status = 'applied', receipt_operation_id = p_op, updated_at = now()
   where id = p_prop.id;
  for v_item in select i from jsonb_array_elements(p_prop.items) with ordinality e(i, n) order by n loop
    -- An existing task chosen instead of an addition carries that addition's title as label.
    v_key := case when v_item->>'kind' = 'new' then v_item->>'key'
                  else (select o->>'key' from jsonb_array_elements(p_prop.original_items) o
                         where o->>'title' = v_item->>'label' limit 1) end;
    select n::integer into v_pos from jsonb_array_elements(v_orig.items) with ordinality e(i, n) where i->>'key' = v_key;
    if v_item->>'kind' = 'existing' then
      insert into public.companion_plan_tasks (plan_id, task_ref, position) values (v_plan.id, v_item->>'task_ref', v_pos)
        on conflict do nothing;
      v_written := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', 'existing', 'key', v_key,
                     'task_ref', v_item->>'task_ref', 'label', v_item->>'label', 'outcome', 'reused'));
    elsif (v_item->>'include')::boolean then
      v_res := public.companion_plan_add_item(p_user, p_prop.retry_of, p_version, p_prop, v_plan.id, v_item, v_pos, p_op);
      v_written := v_written or v_res->>'outcome' = 'created';
      v_results := v_results || jsonb_build_array(v_res);
    else
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', 'new', 'key', v_key,
                     'title', v_item->>'title', 'outcome', 'excluded'));
    end if;
  end loop;
  if v_written then
    update public.companion_plans set revision = revision + 1, updated_at = now() where id = v_plan.id;
  end if;
  insert into public.companion_action_receipts
    (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
  values (p_user, p_op, p_hash, p_version, p_auth,
          jsonb_build_object('kind', 'plan_retry', 'plan_id', v_plan.id, 'retry_of', p_prop.retry_of,
                             'plan_proposal_id', p_prop.id, 'goal', v_plan.goal, 'results', v_results))
  returning * into v_receipt;
  return public.companion_plan_reply(v_receipt, false);
end $$;


-- ------------------------------------------------------------------ undo
-- What reversing one plan approval would do now. Reads (and locks) the plan and every
-- task that approval added. A task already removed (for example by its own Undo) is
-- left alone; a task changed since (newer revision) is kept and makes it a conflict; a
-- later change of the plan itself (a retry) is a conflict too. Reused tasks are never
-- part of it.
create function public.companion_plan_undo_scan(p_user uuid, p_target public.companion_action_receipts) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan public.companion_plans%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_r jsonb; v_remove jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb; v_keep jsonb := '[]'::jsonb;
begin
  select * into v_plan from public.companion_plans
   where id = (p_target.outcome->>'plan_id')::uuid and user_id = p_user for update;
  for v_r in select r from jsonb_array_elements(p_target.outcome->'results') r where r->>'outcome' = 'created' loop
    select * into v_ct from public.custom_checklist_tasks
     where user_id = p_user and id = substr(v_r->>'task_ref', 8)::bigint for update;
    if not found or v_ct.removed_at is not null then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('task_ref', v_r->>'task_ref', 'title', v_r->>'title'));
    elsif v_ct.revision <> (v_r->>'after_revision')::bigint then
      v_keep := v_keep || jsonb_build_array(jsonb_build_object('task_ref', v_r->>'task_ref', 'title', v_r->>'title',
                  'revision', v_ct.revision, 'state', public.companion_task_state(v_ct.completed, v_ct.progress_state)));
    else
      v_remove := v_remove || jsonb_build_array(jsonb_build_object('task_ref', v_r->>'task_ref', 'title', v_r->>'title',
                    'expected_revision', v_ct.revision));
    end if;
  end loop;
  return jsonb_build_object('plan_id', v_plan.id, 'plan_revision', v_plan.revision,
    'plan_removed', v_plan.removed_at is not null, 'remove', v_remove, 'skip', v_skip, 'keep', v_keep);
end $$;

-- Applies a reversal: soft-removes each listed task at its expected revision (pending
-- reminders stop in the same transaction by the #361 trigger) and removes the plan.
-- Records one plan_undo receipt; the shared unique index lets a receipt be reversed once.
create function public.companion_plan_undo_write(
  p_user uuid, p_op uuid, p_hash text, p_version integer, p_auth jsonb, p_undo_of uuid, p_plan uuid,
  p_remove jsonb, p_skip jsonb, p_keep jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t jsonb; v_res jsonb; v_results jsonb := '[]'::jsonb; v_receipt public.companion_action_receipts%rowtype;
begin
  for v_t in select * from jsonb_array_elements(p_remove) loop
    v_res := public.companion_apply_one(p_user, jsonb_build_object('type', 'task.remove_created',
               'task_ref', v_t->>'task_ref', 'expected_revision', (v_t->>'expected_revision')::bigint));
    -- The title recorded when the plan added the task (history, not the current row).
    v_results := v_results || jsonb_build_array(jsonb_build_object('task_ref', v_t->>'task_ref', 'title', v_t->>'title',
                   'outcome', 'removed', 'before_revision', (v_res->>'before_revision')::bigint,
                   'after_revision', (v_res->>'after_revision')::bigint));
  end loop;
  for v_t in select * from jsonb_array_elements(p_skip) loop
    v_results := v_results || jsonb_build_array(jsonb_build_object('task_ref', v_t->>'task_ref', 'title', v_t->>'title',
                   'outcome', 'already_removed'));
  end loop;
  for v_t in select * from jsonb_array_elements(p_keep) loop
    v_results := v_results || jsonb_build_array(jsonb_build_object('task_ref', v_t->>'task_ref', 'title', v_t->>'title',
                   'outcome', 'kept'));
  end loop;
  update public.companion_plans set removed_at = now(), revision = revision + 1, updated_at = now()
   where id = p_plan and user_id = p_user;
  -- A revised retry review of a removed plan can no longer be approved.
  update public.companion_plan_proposals set status = 'cancelled', updated_at = now()
   where user_id = p_user and kind = 'retry' and plan_id = p_plan and status = 'draft';
  begin
    insert into public.companion_action_receipts
      (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome, undo_of)
    values (p_user, p_op, p_hash, p_version, p_auth,
            jsonb_build_object('kind', 'plan_undo', 'plan_id', p_plan, 'results', v_results), p_undo_of)
    returning * into v_receipt;
  exception when unique_violation then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_undo_of));
  end;
  return public.companion_plan_reply(v_receipt, false);
end $$;

-- Undo of one named plan approval receipt. Without conflicts it applies at once (a
-- removal of an added task needs removal_confirmed). With conflicts nothing changes:
-- the newer edits are kept and a compensating draft is returned for review
-- ({ conflict: true, current, plan_proposal }).
create function public.companion_plan_undo(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_receipt_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(jsonb_build_object('plan_undo', p_receipt_operation_id));
  v_receipt public.companion_action_receipts%rowtype;
  v_target public.companion_action_receipts%rowtype;
  v_scan jsonb; v_items jsonb; v_prop public.companion_plan_proposals%rowtype;
begin
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'ui_control' then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));
  select * into v_receipt from public.companion_action_receipts where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      perform public.companion_fail('CA410', 'operation_id_reused');
    end if;
    return public.companion_plan_reply(v_receipt, true);
  end if;
  select * into v_target from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_receipt_operation_id;
  if not found then
    perform public.companion_fail('CA404', 'receipt_not_found');
  end if;
  if v_target.outcome->>'kind' is distinct from 'plan' then
    perform public.companion_fail('CA422', 'not_undoable');
  end if;
  if exists (select 1 from public.companion_action_receipts where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;
  v_scan := public.companion_plan_undo_scan(p_user_id, v_target);
  -- A concurrent Undo may have committed while this one waited for the locks.
  if exists (select 1 from public.companion_action_receipts where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;
  if (v_scan->>'plan_removed')::boolean then
    perform public.companion_fail('CA422', 'plan_removed');
  end if;
  if jsonb_array_length(v_scan->'keep') > 0 or (v_scan->>'plan_revision')::bigint <> 1 then
    v_items := jsonb_build_array(jsonb_build_object('kind', 'remove_plan', 'plan_id', v_scan->>'plan_id',
                 'expected_revision', (v_scan->>'plan_revision')::bigint))
               || coalesce((select jsonb_agg(jsonb_build_object('kind', 'remove_task', 'task_ref', t->>'task_ref',
                              'title', t->>'title', 'expected_revision', (t->>'expected_revision')::bigint))
                              from jsonb_array_elements(v_scan->'remove') t), '[]'::jsonb)
               || coalesce((select jsonb_agg(jsonb_build_object('kind', 'keep_task', 'task_ref', t->>'task_ref',
                              'title', t->>'title'))
                              from jsonb_array_elements(v_scan->'keep') t), '[]'::jsonb);
    select * into v_prop from public.companion_plan_proposals
     where user_id = p_user_id and kind = 'undo' and undo_of = p_receipt_operation_id and status = 'draft'
       and items_hash = public.companion_ops_hash(v_items)
     order by created_at desc limit 1;
    if not found then
      insert into public.companion_plan_proposals
        (user_id, kind, goal, items, items_hash, original_items, context, undo_of)
      values (p_user_id, 'undo', v_target.outcome->>'goal', v_items, public.companion_ops_hash(v_items), v_items,
              jsonb_build_object('skip', v_scan->'skip'), p_receipt_operation_id)
      returning * into v_prop;
    end if;
    return jsonb_build_object('conflict', true, 'receipt_operation_id', p_receipt_operation_id,
      'current', v_scan->'keep', 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  if jsonb_array_length(v_scan->'remove') > 0 and p_authorization->'removal_confirmed' is distinct from 'true'::jsonb then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  return public.companion_plan_undo_write(p_user_id, p_operation_id, v_hash, p_contract_version,
    jsonb_build_object('kind', 'ui_control', 'undo_of', p_receipt_operation_id) || p_authorization,
    p_receipt_operation_id, (v_scan->>'plan_id')::uuid, v_scan->'remove', v_scan->'skip', '[]'::jsonb);
end $$;

-- Approval of a reviewed compensating change (kind 'undo'). Checks again that the plan
-- and every listed task are at the reviewed revisions; otherwise the draft is refreshed
-- for a new review and nothing changes.
create function public.companion_plan_apply_undo(
  p_user uuid, p_op uuid, p_hash text, p_version integer, p_auth jsonb, p_prop public.companion_plan_proposals
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_target public.companion_action_receipts%rowtype;
  v_scan jsonb; v_reviewed jsonb; v_prop public.companion_plan_proposals%rowtype := p_prop;
begin
  select * into v_target from public.companion_action_receipts where user_id = p_user and operation_id = p_prop.undo_of;
  if exists (select 1 from public.companion_action_receipts where user_id = p_user and undo_of = p_prop.undo_of) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_prop.undo_of));
  end if;
  v_scan := public.companion_plan_undo_scan(p_user, v_target);
  v_reviewed := jsonb_build_object(
    'plan_revision', (select (i->>'expected_revision')::bigint from jsonb_array_elements(p_prop.items) i where i->>'kind' = 'remove_plan'),
    'remove', coalesce((select jsonb_agg(i->>'task_ref' order by i->>'task_ref') from jsonb_array_elements(p_prop.items) i
                         where i->>'kind' = 'remove_task'), '[]'::jsonb));
  if (v_scan->>'plan_removed')::boolean
     or (v_scan->>'plan_revision')::bigint is distinct from (v_reviewed->>'plan_revision')::bigint
     or coalesce((select jsonb_agg(t->>'task_ref' order by t->>'task_ref') from jsonb_array_elements(v_scan->'remove') t), '[]'::jsonb)
        is distinct from v_reviewed->'remove' then
    update public.companion_plan_proposals set status = 'cancelled', updated_at = now() where id = p_prop.id;
    return jsonb_build_object('needs_review', true,
      'plan_proposal', public.companion_plan_proposal_view(v_prop) || jsonb_build_object('status', 'cancelled'));
  end if;
  if jsonb_array_length(v_scan->'remove') > 0 and p_auth->'removal_confirmed' is distinct from 'true'::jsonb then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  update public.companion_plan_proposals set status = 'applied', receipt_operation_id = p_op, updated_at = now()
   where id = p_prop.id;
  return public.companion_plan_undo_write(p_user, p_op, p_hash, p_version, p_auth, p_prop.undo_of,
    (v_scan->>'plan_id')::uuid, v_scan->'remove', v_scan->'skip', v_scan->'keep');
end $$;

-- The durable outcome of a plan operation (approval, retry or Undo). Pending while a
-- writer holds the operation lock; not applied when nothing was recorded.
create function public.companion_plan_status(p_user_id uuid, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_receipt public.companion_action_receipts%rowtype;
begin
  select * into v_receipt from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_operation_id and outcome ? 'plan_id';
  if found then
    return public.companion_plan_reply(v_receipt, true) - 'replayed';
  end if;
  if not pg_try_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id)) then
    return jsonb_build_object('status', 'pending', 'operation_id', p_operation_id);
  end if;
  return jsonb_build_object('status', 'not_applied', 'operation_id', p_operation_id);
end $$;

-- ------------------------------------------------------------------ reads
-- The persistent plan entry: saved plans (newest first) and open plan drafts.
create function public.companion_plans_read(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(public.companion_plan_view(p) order by coalesce(p.updated_at, p.created_at) desc, p.id)
                         from public.companion_plans p where p.user_id = p_user_id and p.removed_at is null), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(public.companion_plan_proposal_view(pp) order by pp.updated_at desc, pp.id)
                          from public.companion_plan_proposals pp
                         where pp.user_id = p_user_id and pp.status = 'draft' and pp.kind = 'plan'), '[]'::jsonb))
$$;

-- The plan drafts a conversation produced (any status), so a reopened conversation shows
-- its plan card with the current draft, receipt and plan.
create function public.companion_plan_conversation(p_user_id uuid, p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.conversations c
                  where c.conversation_identifier = p_conversation_id and c.user_id = p_user_id) then
    perform public.companion_fail('CA404', 'conversation_not_found');
  end if;
  return jsonb_build_object('plan_proposals', coalesce((
    select jsonb_agg(public.companion_plan_proposal_view(pp) order by pp.created_at, pp.id)
      from public.companion_plan_proposals pp
     where pp.user_id = p_user_id and pp.kind = 'plan' and pp.source->>'conversation_id' = p_conversation_id::text), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_plan_unresolved(jsonb, jsonb), public.companion_plan_plain(jsonb, integer), public.companion_plan_task_available(uuid, text),
  public.companion_plan_task_now(uuid, text), public.companion_plan_canonical(uuid, jsonb),
  public.companion_plan_context(uuid, jsonb),
  public.companion_plan_receipt_view(public.companion_action_receipts),
  public.companion_plan_view(public.companion_plans),
  public.companion_plan_proposal_view(public.companion_plan_proposals),
  public.companion_plan_prepare(uuid, jsonb, jsonb, jsonb), public.companion_plan_get_proposal(uuid, uuid),
  public.companion_plan_item_operation(uuid, uuid, text),
  public.companion_plan_reply(public.companion_action_receipts, boolean),
  public.companion_plan_apply(uuid, uuid, integer, jsonb, jsonb), public.companion_plans_read(uuid),
  public.companion_plan_edited_items(uuid, public.companion_plan_proposals, jsonb),
  public.companion_plan_revise(uuid, uuid, integer, jsonb), public.companion_plan_cancel(uuid, uuid, integer),
  public.companion_plan_status(uuid, uuid),
  public.companion_plan_add_item(uuid, uuid, integer, public.companion_plan_proposals, uuid, jsonb, integer, uuid),
  public.companion_plan_retryable(public.companion_action_receipts),
  public.companion_plan_retry(uuid, uuid, integer, jsonb, uuid),
  public.companion_plan_apply_review(uuid, uuid, text, integer, jsonb, public.companion_plan_proposals),
  public.companion_plan_undo_scan(uuid, public.companion_action_receipts),
  public.companion_plan_undo_write(uuid, uuid, text, integer, jsonb, uuid, uuid, jsonb, jsonb, jsonb),
  public.companion_plan_undo(uuid, uuid, integer, jsonb, uuid),
  public.companion_plan_apply_undo(uuid, uuid, text, integer, jsonb, public.companion_plan_proposals),
  public.companion_plan_conversation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.companion_plan_prepare(uuid, jsonb, jsonb, jsonb), public.companion_plan_get_proposal(uuid, uuid),
  public.companion_plan_apply(uuid, uuid, integer, jsonb, jsonb), public.companion_plans_read(uuid),
  public.companion_plan_revise(uuid, uuid, integer, jsonb), public.companion_plan_cancel(uuid, uuid, integer),
  public.companion_plan_status(uuid, uuid), public.companion_plan_retry(uuid, uuid, integer, jsonb, uuid),
  public.companion_plan_undo(uuid, uuid, integer, jsonb, uuid), public.companion_plan_conversation(uuid, uuid)
  to service_role;
