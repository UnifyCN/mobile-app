-- ingest-documents picks its own due sources.
--
-- The scheduled driver now makes ONE empty-body call. The function selects at
-- most two due sources (never-attempted first, then oldest attempt) and
-- processes them one after the other. Manual single-source calls
-- ({"crawl_source_id": N} or {"url": "<allowlisted url>"}) are unchanged and
-- need the same service role authorization.
--
-- The cron job 'rag-crawl-batch' keeps its current schedule. This migration
-- does not call cron.schedule. Deploy the new ingest-documents function BEFORE
-- applying this migration: the previous function version rejects an empty body.
create or replace function public.trigger_crawl_all()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _supabase_url text;
  _service_key text;
begin
  _supabase_url := current_setting('app.settings.supabase_url', true);
  if _supabase_url is null then
    _supabase_url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'supabase_url' limit 1
    );
  end if;

  _service_key := (
    select decrypted_secret from vault.decrypted_secrets
    where name = 'service_role_key' limit 1
  );

  if _supabase_url is null or _service_key is null then
    raise warning 'trigger_crawl_all: missing supabase_url or service_role_key in vault';
    return;
  end if;

  perform net.http_post(
    url := _supabase_url || '/functions/v1/ingest-documents',
    body := '{}'::jsonb,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.trigger_crawl_all() is
  'Scheduled driver: one empty-body call to ingest-documents, which picks up to two due sources itself.';

revoke execute on function public.trigger_crawl_all() from public, anon, authenticated;
grant execute on function public.trigger_crawl_all() to service_role;
