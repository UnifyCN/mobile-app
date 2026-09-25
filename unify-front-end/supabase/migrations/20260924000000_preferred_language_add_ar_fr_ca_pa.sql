-- Widen preferred_language to every language the apps ship.
--
-- The CHECK still listed only the original four (en/vi/es/hi), so a user who
-- picked Arabic, Canadian French or Punjabi had the cross-device sync UPDATE
-- rejected — the choice lived only in local storage, and server-rendered copy
-- (push notifications, the welcome email) fell back to English.
--
-- Keep in lockstep with SUPPORTED_LANGUAGES in i18n/index.ts (mobile) and
-- lib/i18n/config.ts (web).

alter table public.user_onboarding_profiles
  drop constraint if exists user_onboarding_profiles_preferred_language_check;

alter table public.user_onboarding_profiles
  add constraint user_onboarding_profiles_preferred_language_check
  check (preferred_language = any (array['en', 'vi', 'es', 'hi', 'ar', 'fr-CA', 'pa']));
