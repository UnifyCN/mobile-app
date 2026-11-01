begin;
drop function if exists public.get_chatbot_allowance();
alter table public.companion_feature_gate drop column if exists account_allowlist;
notify pgrst, 'reload schema';
commit;
