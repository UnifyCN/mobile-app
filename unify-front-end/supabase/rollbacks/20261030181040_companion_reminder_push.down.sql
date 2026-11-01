-- #369 stop-first rollback. Stop the operator-managed worker before this script.
-- Retain private identities, attempts, receipts and suppression tombstones. No old
-- intent or credential can restart after rollback, restore, or schema reapplication.
update companion_push_private.settings set enrollment_enabled=false,dispatch_enabled=false,
 policy_verified_at=null,policy_valid_until=null,aggregate_verified_at=null,aggregate_valid_until=null;
update companion_push_private.enrollments set enabled=false,revoked_at=coalesce(revoked_at,now()),
 generation=gen_random_uuid(),revision=revision+1;
update companion_push_private.deliveries set state=case when state='dispatching' then 'unknown' else 'cancelled' end
 where state in ('queued','retry_wait','dispatching');
update companion_push_private.attempts set outcome='unknown' where outcome='dispatching';
insert into companion_push_private.events(reminder_id,user_id,reason)
 select reminder_id,user_id,'schema_rollback' from companion_reminder_private.events on conflict do nothing;
drop function public.companion_push_apply(uuid,uuid,uuid,integer,text,jsonb);
drop function public.companion_push_read(uuid,uuid,uuid,text);
drop function public.companion_push_target(uuid,uuid,uuid);
revoke all on schema companion_push_private from public,anon,authenticated,service_role;
revoke all on all tables in schema companion_push_private from public,anon,authenticated,service_role;
revoke all on all functions in schema companion_push_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
