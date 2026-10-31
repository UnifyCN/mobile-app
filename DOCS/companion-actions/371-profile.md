# Companion profile changes #371

Status: local implementation candidates for independent review. Native acceptance remains incomplete. This report grants no ticket, native, hosted or release acceptance. Nothing was pushed or integrated.

## Candidate scope and authority

The authority file was verified before implementation. Its six file sizes and SHA-256 values matched. `authority-verified.json` records the first check. `frontier-current.json` records the later check and fresh ancestry. The approved #364 and #370 source commits belong to both candidate histories. The #370 native criteria remain open.

| Candidate | Worktree | Branch | Implementation commit | Tree |
| --- | --- | --- | --- | --- |
| Mobile | `/Users/savargupta/.t3/worktrees/Unify/t3-06529381` | `t3/profile-371-companion-implementation` | `286e941d47f57ecaa551ccde226dbcbe3de56098` | `eaa8096c1cc7148397a476f75194e1fb0c46530d` |
| Web and common service | `/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root` | `fix/profile-changes-371-r1` | `dd4aac9cc567cac13b5a4a987539f548a2dcb038` | `f1d2a191bfe9dcf05a9ebd21fea45a1b6bbc459d` |

The mobile base is `1f736dd2dc2a543cf10803a8a8069834d62becaf`, tree `082f1cda23d15436743eb173c2aba34b2ce9ad58`. The web base is `8f3720af36c50768ff05d25804a69d28d36fd5c4`, tree `c05d364f28618edf949e7bbdf404fb99d1b2394e`. Both assigned checkouts were clean before the first write. Only the assigned current web branch was renamed. No checkout was switched or created.

The mobile #364/#370 prerequisite commits are `b15d7e4b86bd4384dab15a7ca8f86f9ede950694` and `eb61581f1ef3855646616564036ce94197f3a64c`. The web prerequisites are `a914019c74932486754ac16bbd591c30593d2703` and `05ab5299deeea43eee892e11ef1e98ff31f16d8b`.

The final source pins include the fresh mobile integration tip `7d711ae12f23005cb25a10ecc6be5040ddfb8752`. Its accepted Cancel focus fix and CodeRabbit config correction were merged into this candidate. Mobile CI, lint, normal types, i18n and both exports were repeated after that merge. The web integration tip remains `8f3720af36c50768ff05d25804a69d28d36fd5c4`. Both integration tips and all four prerequisites are ancestors of the candidates. The later mobile evidence commit changes only this report and its evidence. It does not grant the earlier work native acceptance.

## Profile owner and behavior

`public.user_onboarding_profiles`, keyed by the authenticated account, remains the only durable profile owner. Province and arrival date are the two supported fields. The field map, existing writers, normalization rules, date range and exact commands for all seven locales are in [field-map.md](evidence/371-profile-r1/field-map.md).

A discussion about a different province or date does not save the profile. A direct command must come from the caller's saved user message. The handler checks the exact resolved field and value. An assistant suggestion can prepare a typed draft only. The user must review the authoritative old and proposed values before approval. Unsupported fields, cities used as provinces, combined choices, invalid dates and relative dates ask for clarification and save nothing. The manual editor also resolves the existing province aliases and localized names before it creates a review. Apply and replay still use the exact canonical operation bound to the reviewed proposal.

Each save uses the existing authenticated action contract, operation identity, status lookup, replay and specific receipt. The receipt names the field and exact before/after values. Current Undo uses the saved inverse and its field revision. A newer field edit produces a durable compensation review and requires fresh approval. A verified inverse can restore a legitimate older custom value or an older arrival date. New proposals cannot introduce those unsupported values.

The profile editor reuses the existing compact cards, mobile bottom sheet and web overlay drawer. The direct `/design` route retained the fixed existing-system direction B. There is no new destination. Impeccable remains version 3.9.1. The new controls use the existing target-size helper or 44 CSS pixel minimum, delayed loading, press behavior, drawer focus and reduced-motion behavior. Copy is present in en, fr-CA, es, vi, hi, pa and ar.

## Revisions, concurrency and rollback

The CLI-generated migration is `20261031055422_companion_profile_changes.sql`. The paired rollback has the same stem. Both mirrors are byte-identical. `mirrors.json` verifies all current Companion SQL mirrors, the five common client files and all seven new locale objects.

The migration builds on the installed function composition through push #369. It renames the current functions and delegates their other branches. It does not replace the service with an older task or plan implementation.

The existing profile row gains revision metadata for province, arrival date and city. A trigger replaces client-supplied metadata. Existing PostgREST writers remain valid. A changed tracked field increments only its counter. A return to an earlier value still increments the counter. Unrelated preferences and task progress do not change it.

Reviewed task and plan transactions take KEY SHARE on the account row and SHARE on the existing profile row. They hold both through commit. A profile action takes KEY SHARE on the account row before UPDATE on the profile row. An existing legacy UPDATE already owns the profile row. Its revision trigger does not take a second profile lock.

A legacy INSERT or UPSERT takes UPDATE on the account row in its insert trigger, before it waits for a profile row. This also guards the first profile insert when no profile row exists. KEY SHARE permits ordinary Auth metadata updates. No Auth fact is changed. Tests inspect blocked transactions and committed state in both orders. They also run a legacy UPDATE and UPSERT together and verify that both commit, the final province is Quebec, and the revision reaches three. A first INSERT cannot commit between a missing-profile context read and the held plan insert.

The stored relevant-context values gain the tracked revisions. The HTTP serializer omits the internal `_revisions` key so the existing public profile-fact shape remains exact. The dedicated new profile read still exposes its explicit field revisions for authorized controls. Old approval after a relevant change returns a durable revised review and requires new approval. An unrelated progress change does not require redundant review. The profile update never deletes progress. A new-conversation request prepares its task draft against the newly saved province. A positive arrival-date case uses a date 400 days in the past, verifies derived stage 3, and verifies that current Undo restores the original missing date and stage 0 in the local schema.

The rollback restores the complete previous function definitions. It retains saved profile facts. It archives revision metadata, proposals and receipts for recovery. Reapplication advances the restored counters and revises open drafts. It does not restore archived profile facts over newer values. The rollback test compares the previous function definitions, performs a legacy write while down, and verifies history recovery after reapplication.

New RPCs and helpers revoke PUBLIC, anon and authenticated execution. The service retains the existing authenticated account boundary. The new private schema has no client usage grant. The rollback archive has RLS and no client grants. The action analytics allow only the categorical operation type. New web profile panels, reviews, receipts and suggestion cards also block automatic analytics and recording. The actual installed PostHog SDK captured a positive control. It captured four private profile interaction events before this guard and zero after it. The SDK bot filter was disabled only in the headless fixture so the positive control could be binding. The fixture drops all events before send and serves transport locally. No analytics provider received a request.

## Reconciliation and account ownership

The mobile save invalidates profile, task, plan, conversation and personalization queries. It also publishes the existing arrival reconciliation event. Checklist, UserContext and stage consumers reload the current account. The initial UserContext read cannot restore an account after a later auth event.

The web save invalidates the current profile and existing action queries. The real browser exposed a missing Checklist province filter. The Checklist read now selects province and filters the published rows with the existing canonical province helper. National tasks remain. Saved progress rows remain. The browser checks the new Ontario task, absence of the old BC task, retained completed progress, and rejection of old plan approval.

Profile drafts stay in the existing account-owned action store. Closing and reopening the surface keeps valid drafts. The asynchronous prepare and cancel paths check the captured account and epoch before each result write. Sign-out or account replacement clears private views and queries. A same-account refresh keeps valid work. Both mounted clients exercise the profile path. The mobile case uses real local Auth, HTTP actions and persistence. The web case uses a scripted service boundary. The real browser also replaces the authenticated cookie and verifies that the next account sees its own profile.

## Evidence and falsifiers

The evidence directory is [371-profile-r1](evidence/371-profile-r1/). Logs retain failures as well as passes. A label that contains `green` is not itself a pass claim. Use the exit receipt and the final result.

| Check | Result that would disprove the claim | Evidence |
| --- | --- | --- |
| Discussion and exact direct command | Discussion changes a fact, or exact command saves another field/value | `red-direct.log`, `green-direct.log`, final `service-profile_test.ts.log` |
| Reviewed save | Preparing writes the profile, or the old/proposed values are not authoritative | `red-profile-review.log`, `green-profile-review.log` |
| Relevant context | Old approval executes after a change and return to the same value | `red-relevant-revisions.log`, corrected-fixture green and final profile suite |
| Retry and concurrency | Two receipts, lost identity, stale committed context, deadlock or lost progress | `profile-concurrency-both-orders.log`, final profile races log |
| Validation and isolation | Forged/foreign authorization, malformed value or unsupported field writes | `profile_validation_test.ts`, final service log |
| Undo and rollback | Newer profile is overwritten without review, history is lost, or prior definitions differ | red/green Undo and rollback logs, final rollback service log |
| Rendered reconciliation | Persisted province changes but the mounted Checklist reader stays on the old province | `mobile-live-final.log`, `mobile-live-fault-context.log` |
| Browser views | Old Checklist province remains, draft/focus changes, stale approval creates a task, a control leaves the viewport | browser JSON, logs and screenshots |

Four final deliberate faults produced assertion failures. Removing the profile row share lock allowed the waiting UPDATE to commit before the held task. Removing the account guard allowed a first profile INSERT to commit before the held plan. Removing the revisions allowed old approval after an ABA change. Removing the mobile reconciliation event left the rendered Checklist reader stale. The earlier advisory-lock probes remain as prior evidence. The final probes target the corrected row-lock implementation. `fault-results.json` records restoration of the exact function or source bytes after each fault.

The browser uses the actual Next.js page, actual cookie proxy, local GoTrue and SQL. Only Sanity content transport is synthetic. It blocks model requests. The matrix checks en/ar, LTR/RTL, widths 1280/390, actual Chrome zoom 100/200 percent, reduced motion, draft/focus retention and 44 pixel controls. It uses a private extension to call Chrome's zoom API. A first full-page capture at zoom 200 percent clipped the screenshot. DOM bounds were valid. Viewport captures corrected the evidence. No product layout change was needed for that capture error.

## Gates

`gates.json` records the commands, exits and proof limits. All final test commands ended naturally. No command used `forceExit`.

| Gate | Result | Proof and limit |
| --- | --- | --- |
| Mobile `npm run test:ci`, after integration merge | Pass: 157 suites, 1,616 tests; 31 tests and five suites skipped | Client regression behavior. Its ordinary run does not enable the separately observed local-service mounted cases. |
| Mobile DST, included in CI | Pass: two suites, 13 tests | Existing stored arrival-date and calendar behavior. Not hosted time-zone behavior. |
| Mobile full lint, normal types and i18n | Pass | Static checks. The full lint retains 85 prior warnings. |
| Mobile iOS and Android exports | Pass | Both bundles export. No device or native acceptance. |
| Web `npm test`, locked dependencies | Pass: 72 files, 778 tests; 13 skipped | Rendered and service caller regression behavior. Not native behavior. |
| Web build, normal types and i18n | Pass | Production build and static checks. Not hosted deployment. |
| Web changed-file lint | Pass | Current changed TypeScript files, including the final race fixture. |
| Web full lint | Fail: 12 prior errors, eight prior warnings | Every error maps to the starting integration in `lint-baseline-map.json`. No new error is called green. |
| Actual Deno CI workflow, Deno 2.7.14 | Pass: 457 tests and seven steps | Exact mobile workflow paths. The final run uses the owned cache. |
| Changed Edge entrypoint and frozen worker checks | Pass | Type checks for the action handler, RAG handler and unchanged worker dependency composition. Not a deployed gateway. |
| Complete local service suite | Pass: all 53 files on their final attempts | Each file uses its required isolated historical fixture. Three earlier setup failures remain. This run preceded the final profile corrections. |
| Final profile service files | Pass: 17 cases in four files | Final SQL and handler: behavior, validation, seven race/isolation cases, and rollback/reapply. |
| Final complete-composition compatibility | Pass: ten selected files | Final #371 SQL installed over the complete #369/#370 frontier. One historical reminder rollback is excluded only in this supplemental run. Two incompatible historical probes remain failed. |
| Mounted mobile profile boundary | Pass: two cases | Real local Auth, action HTTP and committed profile, rendered reconciliation, draft and account safety. Not a device. |
| Actual web page | Pass | Real cookie proxy, local Auth and persistence; keyboard, preserved draft/focus, Checklist, stale approval, account replacement, English/Arabic, narrow layout, 200 percent zoom and reduced motion. CMS is synthetic. Model attempts: zero. |
| Deliberate faults | Four assertion failures; all restored | The tests detect missing row locks, missing revisions and missing rendered reconciliation. |
| New and retained function metadata | Pass | Local ACL, private schema, stored definitions and fixed search paths. No hosted authorization claim. |
| Local security advisor | Fail: two errors, 26 warnings | All 28 objects map to existing fixture or accepted source in `local-advisors-map.json`. Not a hosted scan. |
| Mirrors, cleanup and outgoing scan | Pass | 32 mirror checks; own resources absent; nine ports free on both address families; raw and compressed evidence scanned. |

## Failures and proof limits

- The staged whitespace check reports preserved terminal whitespace in raw logs. The check excluding raw `.log` files passes. No source or report whitespace failure remains. The raw check output and classification are retained in `git-whitespace-check.json`.
- Early direct/review/Undo/context/rollback tests failed on missing behavior. Later tests and the final suite cover the implemented behavior.
- The first arrival save failed on an ambiguous SQL variable. The variable was renamed. The next failure then exposed the missing profile Undo branch. Both failures remain in the evidence.
- One new ABA test passed `setState` arguments in the wrong order. Its 422 was a fixture error. The new test was corrected. No existing test assertion was weakened or removed.
- The first full mobile focused run exposed a new import path that initialized Supabase in a receipt-only test. The pure mobile result components were separated from the editor. The affected suite and full CI then passed.
- The first added mobile lint run rejected field identifier literals inside JSX. Moving the field list outside JSX removed the error. Full mobile lint then passed with its 85 prior warnings.
- The first web changed-file lint command used logical absolute paths. ESLint ignored them as outside its physical base. That output is retained as invalid proof. The actual check used relative paths and passed.
- The first full web lint run had the 12 prior errors and three new unused-import warnings. The imports were removed. Final full lint retains 12 prior errors and eight prior warnings. `lint-baseline-map.json` lists every error by file and line. This gate is failed, not green.
- A later real-service manual-editor check showed that direct commands normalized province aliases but prepare rejected them. The prepare handler now normalizes these new values before it binds the review. Its three validation tests pass, including direct RPC denial for both current and retained privileged functions. The new local test changed its `AB` refusal input to the invalid name `Mars` and added explicit accepted-alias assertions. No accepted existing test was changed.
- Early client type checks found missing handling of the new command kind. The callers were corrected. The normal type checks then passed.
- The first SDK privacy check failed its positive control because the SDK filters the headless browser user agent. That is a setup failure. Disabling that filter in the test produced a real privacy assertion failure. Adding the profile capture blocks made the same browser check pass.
- The first preservation comparison treated Docker mount-array order as meaningful. Only array order differed. The corrected comparison sorts complete mount objects and still compares every field. Both raw snapshots remain.
- The first browser setup acted before the authenticated page settled. A later matrix reload had the same setup problem. The final script waits for the account-owned greeting. Both setup failures remain in the evidence.
- The first push service file failed before provider transport because its staged worker allowlist still named old ports. Only the disposable copies of the test and fixture guards were remapped to the assigned ports. Production worker source and existing assertions remain unchanged. The failed run recorded zero fixture sends.
- The first process test could not start its frozen worker because the disposable test directory lacked the web package workspace metadata expected by the unchanged worker lock. Its second case waited for an exited process. The run was interrupted and retained as a setup failure. Copying the source `package.json` into the disposable command directory made the same frozen check pass. The lock and production worker were not edited.
- The process signal cases initially lacked Deno's unscoped run permission. The scoped command allowlist permits spawn but rejects `Deno.kill`. Only the existing owned process suite now receives that permission. Its SQL fixture supplies the owned child PIDs. The corrected suite passed all five cases. Both permission failures remain in the evidence.
- A later rollback repetition found a stale REST schema-cache observation in the new fixture. The fixture now observes both absent and restored RPC states and checks the older public read while down. No product assertion was removed. The repeated rollback passed.
- One browser-fixture startup overlapped a mounted mobile run. Both passed, but that run did not meet the requested sequencing rule. Both were then repeated in sequence before the final browser check. SQL function suites remained serial throughout.
- The unchanged #363 creation test found internal `_revisions` in its public context object when #371 was applied. The HTTP projection now omits only that internal key. The stored counters still reject old approval after an ABA change. The unchanged creation suite and the final profile suites pass together. No existing test assertion was changed.
- The web Deno check with automatic Node dependency installation replaced installed versions with newer range resolutions. The dependency check detected the mismatch. The lockfile was unchanged. The final web install was restored with `npm ci`; the web gates and real browser were then repeated with the locked versions.
- A supplemental full-composition run of the unchanged historical #361 boundary file passed ten cases and failed its old SQL assertion that `reminder.schedule` is unsupported. The approved reminder schema instead returns `explicit_instant_and_zone_required`. The file passed in its required historical fixture. That supplemental failure is retained and is not called green. Receipt history replaces that incompatible file in the selected composition run. No assertion was changed or skipped inside either file.
- The supplemental full-composition reminder file passed nine cases and failed its historical #368-only rollback, which attempted to drop functions beneath the installed #369/#371 dependencies. The final composition run excludes that one rollback case. The full historical-fixture run includes it and passed. The #371 rollback independently restores the complete current #369 frontier. Both the supplemental failure and the exact final filter are retained.
- A final legacy-writer probe found a real deadlock in the first lock design. UPDATE held the profile row while UPSERT held the profile advisory lock. One request failed with `40P01`. The final design uses account/profile row locks and no profile advisory lock. Both legacy requests now commit. Seven race/isolation cases and four restored deliberate faults cover the final design. A foreign or anonymous UPSERT must be refused before it can wait on the target account row. The insert trigger checks the existing owner rule before its privileged row lock. The held-row probe first exposed that missing early check. The corrected test distinguishes authenticated 403 from anonymous 401, both with database code 42501.
- The first standalone Deno gates used the default dependency cache. The final workflow run uses the owned build cache. Shared caches were not removed because another worker can use them.
- The explicit local security advisor returned exit 1. The existing small baseline `public.users` and test-only `public.quota_tripwire_calls` tables have no RLS. It also reported mutable search paths on 26 existing helpers. `local-advisors-map.json` maps every object to source present at the starting web integration. No unrelated schema was changed to make this gate green. The separate new/retained profile function metadata check verifies the scoped grants and search paths.
- Local Auth, PostgREST, SQL and Edge Runtime are real. CMS, model, search and delivery transports are fixtures or blocked. The mounted mobile renderer is not a device or native-input test. Native exports prove bundling only.
- The browser shell fixture adds existing product columns and a read policy absent from the small action-test baseline. This fixture change is local to the disposable database. It is not a production migration or proof of hosted schema parity.

The Supabase changelog and current [function security](https://supabase.com/docs/guides/database/functions) and [Data API security](https://supabase.com/docs/guides/api/securing-your-api) documentation were checked. The implementation accounts for the documented stored arrival timestamp and stage enum shapes through the existing calendar normalization and typed record conversion. The action baseline is intentionally separate from the stale web migration history. Hosted grants, permission to take the scoped Auth account row lock, Auth metadata contention, schema cache, stage enum behavior, time-zone boundaries and deployed gateway behavior still need authorized hosted verification. No hosted project was changed or private production row read.

Required #371 native work remains open: observed iOS/Android profile review, save and Undo; keyboard overlap and focus restoration; VoiceOver/TalkBack reading of old/proposed values and receipts; 44/48 target sizes; large text, Arabic RTL and reduced motion; immediate Checklist/profile refresh; new conversations; account replacement during delayed requests. The separate Android verifier's older native setup does not qualify this UI. These criteria remain part of #371 and are not deferred or granted here.

## Cleanup and handoff

The CLI stopped only `unify-profile-371-r1` with `--no-backup`. Its five containers, two volumes and network are absent. The private build root, local credentials, browser session/extension copies, owned Deno cache, source copies, mobile export output, owned Expo cache, web build output and 37 indexed temporary logs were removed. Failed logs remain in the bounded evidence directory. Temporary configuration bytes match the original snapshot.

The final preservation check compares every older unrelated container state, every complete mount field, network metadata and volume name. It found no violation. Only the named concurrent native project lifecycle is excluded. All nine assigned ports are free on IPv4 and IPv6. No protected native project, physical Metro project, device, SDK, signing data or credentials were used or changed.

Ignored installed dependencies remain in both assigned clients. The pre-existing web incremental TypeScript cache remains. Shared tool caches remain because another worker can use them. `cleanup.json`, `resources-after.json` and `preservation-result.json` record the exact disposition. These retained caches contain no owned service credential copy.

The final handoff supplies the final mobile evidence commit and web candidate head/tree. No integration checkout, parent brief, instruction file, issue, PR or watch was edited. No child agent was started. No provider/model/account was switched. Independent SPEC and STANDARDS review and integration remain with the root agent.

COMPANION_PROFILE_371_IMPLEMENTATION_R1_DONE
