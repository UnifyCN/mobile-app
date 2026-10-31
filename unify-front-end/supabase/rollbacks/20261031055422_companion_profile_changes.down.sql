-- #371 rollback. Keep saved profile values and recoverable receipts. No profile fact is copied.
create table if not exists public.companion_rollback_archive_371 (
  id bigint generated always as identity primary key, source text not null, row_data jsonb not null,
  archived_at timestamptz not null default now(), restored_at timestamptz
);
alter table public.companion_rollback_archive_371 enable row level security;
revoke all on public.companion_rollback_archive_371 from public,anon,authenticated;
insert into public.companion_rollback_archive_371(source,row_data)
  select 'revisions',jsonb_build_object('id',id,'revisions',companion_field_revisions) from public.user_onboarding_profiles;
insert into public.companion_rollback_archive_371(source,row_data)
  select 'receipt',to_jsonb(r) from public.companion_action_receipts r where r.outcome->'results'->0->>'type'='profile.update';
insert into public.companion_rollback_archive_371(source,row_data)
  select 'proposal',to_jsonb(p) from public.companion_proposals p where p.kind='profile_update';
delete from public.companion_action_receipts where outcome->'results'->0->>'type'='profile.update';
delete from public.companion_proposals where kind='profile_update';
drop trigger companion_profile_track on public.user_onboarding_profiles;
drop schema companion_profile_private cascade;
drop function public.companion_read_profile(uuid);
do $restore$
declare r record;
begin
  for r in select * from (values
    ('companion_validate_operations','companion_before371_validate','jsonb'),
    ('companion_check_authorization','companion_before371_authorization','uuid,jsonb,jsonb'),
    ('companion_apply_one','companion_before371_apply_one','uuid,jsonb'),
    ('companion_receipt_summary','companion_before371_receipt','public.companion_action_receipts'),
    ('companion_prepare_proposal','companion_before371_prepare','uuid,jsonb,jsonb'),
    ('companion_recheck_proposal','companion_before371_recheck','uuid,jsonb,jsonb'),
    ('companion_cancel_proposal','companion_before371_cancel','uuid,uuid,integer'),
    ('companion_conversation_actions','companion_before371_conversation','uuid,uuid'),
    ('companion_profile_context','companion_before371_context','uuid'),
    ('companion_undo_action','companion_before371_undo','uuid,uuid,integer,jsonb,uuid')
  ) as t(current_name,old_name,args) loop
    if to_regprocedure('public.'||r.old_name||'('||r.args||')') is not null then
      execute 'drop function public.'||r.current_name||'('||r.args||')';
      execute 'alter function public.'||r.old_name||'('||r.args||') rename to '||r.current_name;
    end if;
  end loop;
end $restore$;
alter table public.user_onboarding_profiles drop column companion_field_revisions;
alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check(kind is null or kind in ('compensation','task_create','step_create','task_edit','detail_create','task_remove','reminder'));
notify pgrst,'reload schema';
