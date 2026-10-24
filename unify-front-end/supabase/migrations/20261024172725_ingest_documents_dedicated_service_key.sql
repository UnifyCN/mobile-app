-- ingest-documents authenticates the scheduled driver with its own Vault key.
--
-- The ingest-documents guard rejects the shared Vault key 'service_role_key'
-- with HTTP 401, and that key must stay unchanged because other jobs read it.
-- The driver now reads the dedicated Vault entry 'ingest_documents_service_key'
-- first and falls back to the shared 'service_role_key' only when the dedicated
-- entry is missing or empty (deployments whose guard still accepts it).
--
-- Everything else is the reviewed single-call driver, unchanged: one
-- empty-body request, the supabase_url lookup, the Authorization Bearer header,
-- the 120000 ms timeout, SECURITY DEFINER, the search_path and the grants.
-- This migration does not call cron.schedule; the schedule is untouched.
--
-- Before the cron job can authenticate, a Vault secret named
-- ingest_documents_service_key must exist. This migration does not create it.
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

  _service_key := coalesce(
    (
      select nullif(decrypted_secret, '') from vault.decrypted_secrets
      where name = 'ingest_documents_service_key' limit 1
    ),
    (
      select nullif(decrypted_secret, '') from vault.decrypted_secrets
      where name = 'service_role_key' limit 1
    )
  );

  if _supabase_url is null or _service_key is null then
    raise warning 'trigger_crawl_all: missing supabase_url or ingest_documents_service_key/service_role_key in vault';
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
  'Scheduled driver: one empty-body call to ingest-documents, authenticated with Vault ingest_documents_service_key (falls back to service_role_key), which picks up to two due sources itself.';

revoke execute on function public.trigger_crawl_all() from public, anon, authenticated;
grant execute on function public.trigger_crawl_all() to service_role;
