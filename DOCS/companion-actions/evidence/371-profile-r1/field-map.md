# Profile owners before implementation

- `public.user_onboarding_profiles`, keyed by account `id`, owns durable province, city, arrival_date, persona and personalization preferences.
- Mobile `services/onboarding/{getOnboardingProfile,saveOnboardingProfile}.ts` reads and upserts it. `UserContext` reads `userInfo`; Checklist reads `useChecklistProfile`; stage derives from the calendar arrival date.
- Province normalization uses the shared province list and aliases. Arrival normalization uses `_shared/arrivalStage.ts` and rejects impossible calendar dates. Stage is a derived value, not a separate user choice.
- Existing Companion proposal contexts read city, province and arrival_date through `companion_profile_context`. Plan context also reads referenced task availability. Task edit relevance compares only changed task fields. Saved details remain in their existing owner and must not copy profile facts.
- Existing installed clients can write the profile through PostgREST. A database trigger must track their changes without requiring a new client field.
- This slice supports province and arrival_date commands and proposals. Other fields stay in their existing product controls. Unsupported fields and ambiguous values produce no profile write.
- Exact commands use a saved user message. Reviewed proposals bind old/proposed values and a field revision. The shared action service owns receipt identity, lookup, replay and Undo.
- Approved test boundary: authenticated shared action requests plus observable committed state, with a small rendered mobile/web layer. No new helper-unit boundary.
- Design route: direct, existing-system, product/native improvement. Direction B remains fixed. Reuse cards, mobile bottom sheet, web overlay drawer, target sizes, delayed loading, motion and focus behavior.

## Supported contract

| Field | Durable owner | Input | Relevant revision |
| --- | --- | --- | --- |
| Province | `user_onboarding_profiles.province` | One exact Canadian province or territory. Existing localized names and abbreviations resolve to the existing canonical name. Cities and combined choices do not resolve. | `province` |
| Arrival date | `user_onboarding_profiles.arrival_date` | A valid `YYYY-MM-DD` date from five years before today through three years after today. The existing calendar-month stage thresholds remain 3, 12 and 36 months. | `arrival_date` |
| City | Existing profile column and existing controls only | No new Companion command or write. Existing writers remain valid. | `city`, for existing plan/task relevance |
| Other profile and preference fields | Existing profile controls | No new Companion write. | Existing context values still apply. Unrelated preferences do not revise these three counters. |

The SQL trigger replaces client-supplied revision metadata. A write that restores an earlier value still advances the field revision. A write to unrelated preferences does not advance a tracked revision. No saved detail row is created for a profile change.

Exact command forms:

| Locale | Province | Arrival date |
| --- | --- | --- |
| en | `Update my profile province to Ontario` | `Update my profile arrival date to 2026-11-07` |
| fr-CA | `Mets à jour la province de mon profil à Ontario` | `Mets à jour la date d'arrivée de mon profil à 2026-11-07` |
| es | `Actualiza la provincia de mi perfil a Ontario` | `Actualiza la fecha de llegada de mi perfil a 2026-11-07` |
| vi | `Cập nhật tỉnh bang trong hồ sơ của tôi thành Ontario` | `Cập nhật ngày đến trong hồ sơ của tôi thành 2026-11-07` |
| hi | `मेरी प्रोफ़ाइल का प्रांत ओंटारियो करें` | `मेरी प्रोफ़ाइल में आगमन की तारीख 2026-11-07 करें` |
| pa | `ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ ਦਾ ਪ੍ਰਾਂਤ ਓਨਟਾਰੀਓ ਕਰੋ` | `ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ ਵਿੱਚ ਪਹੁੰਚਣ ਦੀ ਤਾਰੀਖ 2026-11-07 ਕਰੋ` |
| ar | `حدّث مقاطعة ملفي الشخصي إلى أونتاريو` | `حدّث تاريخ الوصول في ملفي الشخصي إلى 2026-11-07` |

An owned saved user message is required for a direct command. Discussion and a model suggestion cannot execute an action. The optional typed `[PROFILE]` suggestion creates a draft for later review only. It cannot be combined with another suggested action.

The shared function composition at the start includes task progress, creation, plans, steps, edits, details, removal, reminders and push. The new migration renames the installed functions and delegates their other branches. The rollback restores those installed function definitions. The migration and rollback have byte-identical mobile and web mirrors.
