# #361 Task state actions: mobile and web

Spec: UnifyCN/mobile-app#359. Ticket: #361. Contract and compatibility: `360-compatibility-decision.md`. Date: 2026-10-25.

A user opens an existing Checklist task in the mobile bottom sheet or the web overlay drawer, sets one of four states (Not started, In progress, Waiting, Completed) and an editable waiting reason, and sees the same saved result in Checklist, in Companion, in a new conversation and on the other platform. Each save shows its exact receipt with Undo for that receipt only. No AI planning, steps, reminders or task creation UI is in this slice.

## What ships

| Part | Where | Notes |
|---|---|---|
| Migration | `unify-front-end/supabase/migrations/20261025235536_companion_task_actions.sql` (this repo, authority) and the web repo `supabase/migrations/` (byte-identical, sha256 `8f368d52...402111`) | Promotes the #360 candidate. Registers one operation, `task.set_state`; the SQL validator refuses every other type. Gate ships off. Legacy columns stay authoritative. |
| Rollback | `unify-front-end/supabase/rollbacks/20261025235536_companion_task_actions.down.sql` (mirrored, sha256 `33aebda5...8c001`) | Keeps the accepted policy: full schema down stops every pending reminder (`schema_rollback`), re-application restarts none, gate-only toggles stop nothing. |
| Endpoint | web repo `supabase/functions/companion-actions` (deploy authority: web), `verify_jwt = true` in `supabase/config.toml` | Account from the JWT only. Service-role SQL. Never calls `rag-query`, a model or `check_and_increment_chatbot_usage`. No probe fault hooks. |
| Web proxy | web `app/api/companion/actions/route.ts` | Same-origin, forwards the cookie JWT, passes status and JSON through, 5xx when the function is unreachable. |
| Typed client | mobile `services/companionActions/*`, web `lib/companionActions/*` (mirrors) | Contract version 1; unknown response fields ignored, missing or mistyped fields are an unknown outcome. |
| Mobile UI | Checklist task sheet: "Track progress" swaps the same sheet to the controls (no stacked modal). Companion: compact "Your tasks" card above the conversation opens a bottom sheet with the task list and the same controls. | `components/companion/tasks/*`, `components/checklist/TaskDetailModal.tsx`, `ChecklistItem.tsx` (In progress / Waiting label and reason). |
| Web UI | Checklist rows get a task progress control; Companion gets a compact entry; both open the overlay drawer (full width on narrow screens, app navigation kept). | `components/companion/tasks/*`, `components/checklist/TaskRow.tsx`. |
| Telemetry | `companion_action_result` on both platforms | Properties: `operation_type`, `action`, `outcome`, `entry_surface`, `to_state`. Built from an allowlist; never a title, reason, task reference, receipt id or message text. |
| i18n | `taskActions.*` in all 7 locales (ar, en, es, fr-CA, hi, pa, vi) on both platforms | Real translations; mobile parity check passes; web keys checked by script (no key missing, none identical to English). |

### Behaviour rules (all tested)

- One operation id per user intent. A reply that may hide a committed write (network error, timeout, 5xx, 503 in flight, malformed reply) is looked up with `status` before anything else. `applied` shows the recorded receipt. `pending` and `lookup failed` stay visible and allow only another lookup. `not applied` allows a retry with the same id and payload; the server re-checks authorization and revisions.
- Undo names one receipt. When the task moved on, nothing changes: the newer state is kept, and a draft compensating proposal at the current revision is offered. Applying it sends `approved_proposal` evidence bound to that proposal. There is no global Undo.
- A receipt shown from this screen's save turns historical ("This task changed after this") as soon as the saved revision moves on, here or on another platform.
- Writes are allowed only right after a successful read. Web uses the browser online state and re-reads on reconnect and focus. Mobile has no OS network signal in this app (adding one needs a native module, which is not OTA-safe), so a failed read is the offline signal: progress is marked stale, controls turn off, and the read repeats every 5 s and on return to the foreground.
- Task progress is held in memory only, keyed by account. Sign-out and account change drop every other account's drafts, results and cached progress.
- Composer drafts stay: the sheet and drawer sit over a mounted conversation.

## How to run

Backend (web repo, disposable local stack `unify-actions-361`, ports 59371-59374, refuses non-127.0.0.1):

```
supabase/tests/companion-actions/run.sh                 # all Deno suites, DB reset per file
python3 -I supabase/tests/companion-actions/mutation_check.py
```

Web client:

```
npm test && npm run build
python3 components/companion/tasks/client_mutation_check.py
```

Mobile (from `unify-front-end`):

```
npx jest __tests__/companionActions __tests__/checklist __tests__/arrival --watchAll=false
npm run typecheck && npm run check-i18n
python3 __tests__/companionActions/client_mutation_check.py
# Real local stack (skipped unless ACTIONS_* is set; needs --forceExit, Kong keep-alive holds sockets ~60 s):
eval "$(cd <web>/supabase/tests/companion-actions && supabase status --workdir . -o env | sed 's/^/export ACTIONS_/')"
npx jest __tests__/companionActions/companionActionsLocalStack.test.tsx --watchAll=false --forceExit
npx expo export --platform ios --platform android
```

## Evidence (2026-10-25)

Proof classes: **scripted-client** (mounted screens with a contract stand-in for the network), **local-stack** (real Postgres 17, GoTrue, PostgREST, Kong and edge runtime, real JWTs and RLS), **bundle** (Hermes export), **not proven**.

| Check | Result | Class |
|---|---|---|
| Backend Deno suites (`actions` 4, `boundary` 11, `rollback` 6, `undo` 8, each including one cleanup step) | 29 passed. The first run of this session failed once in `rollback_test` with PostgREST "Database client error" right after a DB reset (harness race, not product); `run.sh` now restarts PostgREST after each reset and waits for 5 good replies; every later run green | local-stack |
| Backend mutation check (11 mutations of migration, rollback and handler) | First run 9 of 11 red; `registry_accepts_any_type` and `rollback_keeps_pending` survived. Two assertions added (direct service-role call with unregistered types; archive rows read while rolled back); both now red, so 11 of 11 | local-stack |
| Mobile mounted tests (Checklist 10, Companion 3) | 13 passed | scripted-client |
| Mobile local-stack mounted test | passed: Checklist save -> web read, legacy `user_tasks` row, Companion new mount, Undo, second account sees nothing | local-stack |
| Mobile baseline (integration `962c516f`, production code unchanged, only these test files and `testSupport/` added) | 13 of 13 fail by assertion (`Unable to find ... Track progress` / `Your tasks`, `toBeSelected`) | scripted-client |
| Mobile client mutations (run at `89ed4930`) | 10 of 10 red by assertion | scripted-client |
| Mobile full Jest (`__tests__`, final) | 125 suites passed, 1324 tests passed, 3 skipped (the local-stack suite without `ACTIONS_*`); 4 existing suites needed mock updates for the new auth/keyboard/AppState dependencies (listed below) | - |
| Mobile typecheck, i18n parity | pass | - |
| Mobile `expo export` iOS + Android | Hermes bundles built | bundle |
| Web mounted tests (Checklist 10, Companion 1) and proxy route (5) | 16 passed; full `npm test` 46 files, 557 tests passed; `npm run build` and `tsc` pass; eslint clean on changed files | scripted-client |
| Web baseline (integration `8c9ecbf`, only the test file, harness and vitest config added) | 11 of 11 fail by assertion | scripted-client |
| Web client and proxy mutations (run at `49a20db`) | 12 of 12 red by assertion | scripted-client |

Existing mobile tests changed (mocks only, no assertion changed): `checklistScreenProvince` and `arrival/ChecklistScreen` gain `getSession`/`onAuthStateChange`; `TaskDetailModalLinks` mocks `react-native-keyboard-controller`; `arrival/checklistRollover` now calls every AppState listener instead of the last one registered (the progress hook adds a foreground listener).

### Test order (honest record)

- Written test-first in this session, red by assertion before the code: the mobile Checklist save/receipt/row test, the three mobile Companion tests, the historical-receipt test, and the reason-only receipt assertion (the last two were red on the candidate, then fixed on both platforms; the matching web assertions were added after the fix).
- Written after the code (implementation-first): the backend Deno suites, the web client and UI, and their tests came from the first implementation session; the other mobile Checklist tests, the mobile local-stack test, all web mounted tests and the proxy route test were written after the code they cover. Their binding is shown by the baseline runs and the mutation checks above, not by test order.

### What this does not prove

1. **Hosted:** no hosted write, deploy or migration. Hosted gateway acceptance of the function, hosted PostgREST schema reload and hosted isolation are deployment qualification (same as #360 unmet item 1).
2. **Native:** no simulator or device run of the new UI. Real VoiceOver/TalkBack, keyboard avoidance with a real keyboard, Dynamic Type, safe areas on notched devices and RTL rendering are not exercised. The mobile tests use accessibility roles and labels; the export proves bundling only.
3. **Browser:** jsdom only. No real browser focus, zoom to 200 %, narrow-viewport layout or screen reader. Focus return was tested through keyboard activation; Safari does not focus a clicked button, so focus return after a mouse click there is not proven.
4. **Older clients:** unchanged from #360 (released-source and dev-shell proof of the same schema). This slice adds no legacy behaviour change.
5. **Mixed versions of this client:** the contract version gate is tested at the boundary; no older build of this new client exists yet.
6. The scripted stand-in is not the server. Server rules are proven only by the local-stack suites.
7. Skills `/design`, `frontend-design`, `ui-ux-pro-max`, `vercel-react-native-skills` and the Supabase skill were not available in this session. The UI reuses the existing sheet, drawer, typography and colour tokens; the brand orange marks selection, and text or filled buttons use `#9A4A00` for at least 4.5:1 contrast.
