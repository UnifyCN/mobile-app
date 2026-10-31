# Hosted read evidence for #360 (observed 2026-10-25)

Project: the shared hosted Supabase backend (web + mobile; project reference omitted from this public repo). **Read-only.** No hosted write, deploy, branch, or account was made. Aggregates only; no user content is recorded here.

Sources:
- Parent-provided column inventory: `/tmp/unify-companion-359/hosted-schema.json` (md5 `e49fb6ed904d8b71e85d51ce587c398e`, 60 columns of the checklist, conversation and message tables).
- Read-only `SELECT` queries run by the #360 implementer through the repo-local `supabase` MCP: policies, constraints, triggers, grants, counts, function and migration lists, version.

## Task sources and shape

| Table | Key | Columns that matter | Notes |
|---|---|---|---|
| `user_tasks` | PK `user_task_id integer`; `UNIQUE (user_id, sanity_checklist_id)` | `user_id uuid NULL`, `task_id integer NULL` (FK `personalized_checklist_tasks`), `sanity_checklist_id text NULL`, `completed bool NULL`, `completed_at timestamp WITHOUT tz`, `dismissed_at timestamptz` | Content-backed tasks. FK `user_id -> public.users(id)` (not `auth.users`). No triggers. |
| `custom_checklist_tasks` | PK `id bigint` | `user_id uuid NOT NULL -> auth.users`, `priority` CHECK 4 values, `title`, `description`, `completed`, `completed_at`, `created_at`, `updated_at` | User-created tasks. Trigger `custom_checklist_tasks_updated_at` (BEFORE UPDATE). |
| `checklist_task_order` | PK `(user_id, priority)` | `ordered_keys text[]` holding `sanity:<id>` / `custom:<id>` | Existing stable task keys. The proposed `task_ref` reuses this format. |
| `checklist_completions` | `UNIQUE (user_id, checklist_item_id)` | FK `personalized_checklist_tasks` | Empty (0 rows). Not a live task source. |

Counts (2026-10-25): `user_tasks` 357 rows over 65 users (221 completed, 0 dismissed, 132 with `sanity_checklist_id IS NULL` and a `task_id`, 0 duplicate sanity keys); `custom_checklist_tasks` 25 rows (1 completed); `user_tasks` 168 kB, `custom_checklist_tasks` 64 kB.

Finding: 132 of 357 `user_tasks` rows are old `task_id`-only rows. The current Checklist ignores them (`mergeChecklistWithUserTasks` only maps rows that have `sanity_checklist_id`). The contract excludes them. The first dismissal on hosted has not happened yet (0 rows with `dismissed_at`), so the legacy dismissal mapping has no production history to migrate.

## Access rules (RLS)

All four checklist tables have RLS enabled, not forced.

- `user_tasks`: policies `Users can view own tasks` (SELECT), `insert own` (INSERT), `update own` (UPDATE), all `TO authenticated`, `(SELECT auth.uid()) = user_id`. **There is no DELETE policy.** `deleteUserTasks` (and the "uncheck deletes the row" comment in `20250201_user_tasks_sanity_unique.sql`) is therefore a silent no-op on hosted.
- `custom_checklist_tasks`: SELECT, INSERT, UPDATE, DELETE policies, role `public`, `auth.uid() = user_id`.
- `checklist_task_order`: same four policies, role `public`.
- `conversations`: four own-row policies. `messages`: select and insert through the owning conversation.
- Grants: `anon`, `authenticated` and `service_role` hold full table privileges on all four tables. RLS is the only gate. New tables must revoke write privileges explicitly.

## Other facts the design uses

- Postgres `17.4` hosted. The local stack runs `17.6.1.143`. Same major version.
- `statement_timeout` 2 min, `lock_timeout` 0 (none).
- `delete_user()` exists, `SECURITY DEFINER`, body `DELETE FROM auth.users WHERE id = auth.uid()`. It is the account-deletion path. Every user table cascades from it.
- Trigger `on_auth_user_created` exists on `auth.users` (fills `public.users`).
- No relation or function named `companion_*` exists (no name collision). `pg_timezone_names` has 1194 entries.
- Tables are not in any realtime publication.
- Edge functions (39 deployed). Relevant: `rag-query` v138, `verify_jwt = true`. No action function exists. The `rag-query` deploy authority is the web repo (`supabase/config.toml` comment).
- Migration history: the checklist tables come from the **mobile** repo migrations (`20250201000003_user_tasks_sanity_checklist_id`, `20260215000001_custom_checklist_tasks`, `20260413153634_20260329_checklist_task_order`, `20261012192046_checklist_task_dismissals`). Recent shared migrations were applied by name (`companion_177_*`) from the mobile repo. The web repo `20260518100400_checklist.sql` was never applied and conflicts with hosted types (it declares `custom_checklist_tasks.id uuid` and `user_tasks.user_task_id uuid`; hosted has `bigint` and `integer`).

## Correction round reads (2026-10-25, read-only, aggregates only)

Run inside `begin read only` for the #360 review corrections.

- Task reference grammar. All 225 non-null `user_tasks.sanity_checklist_id` values match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; none starts with `drafts.` or `versions.`; the longest is 36 characters. All 61 keys in `checklist_task_order.ordered_keys` match `^(sanity:<that grammar>|custom:[1-9][0-9]{0,17})$`. The canonical `task_ref` grammar therefore rejects no stored identity.
- Column metadata of `public.users` (19 columns) and `public.user_onboarding_profiles` (24 columns; `stage` is enum `stage_enum` with labels `0`..`4`). Used only by `historical/simulator_fixture.sql`, so the released app can sign in on the local stack.

## What this evidence does not establish

Reads show configuration, not behavior. No hosted request was made with a synthetic account, so hosted isolation, the hosted edge gateway with a new function, and PostgREST behavior on the hosted project are not demonstrated here. See the decision record, section "Unmet evidence".
