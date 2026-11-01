The mobile and web composition candidates are committed and clean. The required local gates pass. Full web lint remains a failing baseline with 12 mapped prior errors. These candidates need a fresh independent review and focused native validation. This task grants no ticket acceptance.

The mobile primary is `/Users/savargupta/.t3/worktrees/Unify/t3-c68f1368`, on `t3/compose-companion-367-370-native`. Its code commit is `b1c53b5c5e9468bb1bd683c0e54d9ab1037db2d5`. Its code tree is `309f4ba581fe9ee03ea59b3fa55f368e8fff60e1`.

The transferred web secondary is `/tmp/unify-review-actions-361-web-r5-deno-base-9d05`, on `t3/compose-companion-367-370-native-web`. Its code commit is `5795d95969dcc332c5eb08b6da21c708479021f2`. Its code tree is `a2387d2454a2f7a6a144ebd639c080edd57b4b8f`. The earlier branch `feat/companion-compose-365-370-r1` still names `d859fbf913e923f960a16562abd556723d67b0ec`.

The final commits after these code pins add evidence only. The final tool receipt supplies their HEAD and tree values. [pins-code.json](pins-code.json) records the code pins and ancestry. Both candidates have all their reviewed parents as ancestors.

| Candidate | Required parent | Result |
| --- | --- | --- |
| Mobile | Accepted layout `205e623a82e7777cae2291c721a2f63957948a51` | Ancestor |
| Mobile | Reviewed saved-detail composition `69d27bca8ef51c7770fadbc3e858cbcad03cb3f9` | Ancestor |
| Mobile | Reviewed removal `3b4af41e1add4b48b929e331a39d2ac2fbe22006` | Ancestor |
| Web | Accepted hydration `edcc47a3f9003c6eacb4f2a3c02da6039d9e9bec` | Ancestor |
| Web | Reviewed saved-detail composition `d859fbf913e923f960a16562abd556723d67b0ec` | Ancestor |
| Web | Reviewed removal `c022bb48e61b5195ce3d22e5e9190b4d8b2920a9` | Ancestor |

The mobile primary started clean at the accepted layout tip. It needed no initial fast-forward. It merged the saved-detail parent and then the removal parent. The web secondary started clean at the transferred saved-detail pin. A distinct branch retained the old branch. It merged the accepted hydration tip and then the removal parent. No reset, stash, additional checkout, root A1 branch import, or integration write occurred.

The rejection conditions were a lost operation or panel route, changed receipt, cross-account access, duplicate replay write, overwritten newer revision, lost draft, wrong migration predecessor, changed rollback definition or grant, missing reviewed ancestor, source mismatch, or new required gate failure. The tests observed persisted outcomes. The race tests also observed lock waits and intermediate state. Response order alone supplied no concurrency claim.

[conflict-resolution-ledger.json](conflict-resolution-ledger.json) records all 19 conflicted files and 85 text conflict sections. It records before and after hashes and the decision for each file. The registry, parsers, stores, cards, panel targets, analytics allowlists and test helpers retain both domains. The proposal guards exclude both detail and removal kinds from the task proposal route. The receipt parser keeps detail and removal fields. The mobile sheet keeps LiveText and its stable state owner. The web online hook retains the accepted useSyncExternalStore correction. Both send hooks retain task edits, remember commands and removal reviews.

All seven locales retain the reviewed `savedDetails` and `taskRemove` namespaces without value changes. [locale-preservation.json](locale-preservation.json) records the 28 namespace comparisons. The ordinary i18n gates also pass. This is preservation and key-parity evidence. It does not repeat a semantic translation audit.

The actual migration order is #361, #363, #364, #366, #365, #370, #367. Rollback uses the reverse order. The pending #367 migration and its down script retain their original filenames and timestamps. No second replacement migration was added.

The #367 up script now retains the eight shared #370 function bodies plus the reviewed removal branches. Its proposal-kind constraint includes `task_edit`, `detail_create` and `task_remove`. The conversation reader keeps detail proposals and commands separate from task proposals and commands. The #364 plan writer retains the reviewed #367 plan-reference lock. The step-parent lock, receipt snapshots, archive recovery and conservative reminder policy remain.

The #367 down script restores those eight #370 statements exactly. It restores the #364 plan writer without the removal lock. It retains `detail_create` and the earlier proposal kinds. The unchanged #370 down script restores the accepted #365/#366 definitions and grants. Shared CREATE OR REPLACE statements retain the existing ACLs. New removal helpers deny PUBLIC, anon and authenticated access.

[sql-function-ledger.json](sql-function-ledger.json) records the nine before/after function entries and rollback predecessor hashes. [live-stage-definitions-grants.json](live-stage-definitions-grants.json) retains complete live definitions, signatures, raw ACLs, effective execute permissions, proposal constraints, saved-detail table grants and RLS flags at every relevant down/up stage. The stage test compares the full records, not function counts. [live-final-functions-grants.json](live-final-functions-grants.json) also confirms that all 105 final live function bodies equal the final statements in actual migration order. [sql-mirrors.json](sql-mirrors.json) records byte equality for all 14 mobile/web migration and rollback copies.

The new service composition test was written after the client text merge and before the shared SQL correction. It first failed at the public authenticated prepare request with HTTP 422. The later #367 registry had lost `detail.create`. The final case passes. It creates and approves a detail, edits it, removes a task in a saved plan, replays concurrent identical requests, checks exact receipts and lookup, restores the task, retains steps, leaves reminders stopped and checks another account's access.

The full-schema stage test, combined recovery test and mounted composition cases were written after the SQL correction. They are regression checks. They are not test-first evidence. The existing removal rollback expectation now names its actual #370 predecessor. Its body assertions remain. No authentication bypass was added.

The first attempted green run used a two-title direct step control. The existing authorization rule correctly returned HTTP 403. The fixture now creates one step per direct control. The next run found an extra detail proposal in the task proposal list because my constraint edit also changed that list. I corrected that SQL list and retained the failed run. The first mobile mounted case used `Saved details` as the accessible name. The actual control is `View saved details`. Only the test locator changed. These failures remain in the raw logs.

The initial service-file list named a nonexistent `details_undo_test.ts`. No tests ran in that command. The corrected explicit file set passed. An unavailable Prettier binary, an early output-path error and an initial SQL-extraction expression were setup failures. They did not supply behavior evidence.

The transferred web node_modules tree had 24 installed versions that differed from the lockfile. Its first web gates are retained under `superseded-unlocked-*`. A local npm ci restored the locked dependency tree. [installed-dependencies.json](installed-dependencies.json) verifies all 1,994 installed mobile packages and 678 installed web packages against their respective lockfiles. No required nonoptional package is missing. Neither tree is a symlink or contains `.deno`. [configuration-integrity.json](configuration-integrity.json) confirms unchanged package, lockfile, TypeScript, app and test configuration bytes. No temporary tracked configuration needed restoration.

| Final check | Result | What it proves and its limit |
| --- | --- | --- |
| Required authenticated service run | 90 passed in 14 files | Both domains, removal plan races, retained step races, edits, lookup, replay, Undo and rollback through local real Auth/JWT/HTTP/PostgREST/PostgreSQL. Controlled content. |
| Full live definition/grant stages | 1 passed | Exact #367 down to #370, #370 down to #365, and both reapplications. No hosted claim. |
| Combined archive recovery | 1 passed | Detail and removal receipt identity, open draft re-review, retained plan/steps and stopped reminders after full reverse rollback. |
| Mobile mounted local service | 21 passed in 2 files | Actual Companion and Checklist callers, sheets, stores and persisted outcomes. Native modules and content remain controlled. |
| Web mounted local service, locked packages | 4 passed in 1 file | Actual pages, hook, cards and drawer with real local JWT requests. jsdom is not a browser or screen reader. |
| Full mobile npm run test:ci | Main 1,500 passed, 23 skipped; DST 13 passed | Natural exit 0. These are separate main and DST sets. No installed native workflow follows. |
| Full locked web npm test | 710 passed, 13 skipped | Final complete suite. The enabled local service runs remain separate. |
| Mobile and web types | Exit 0 on each | Static type checking. |
| Mobile and web i18n | Exit 0 on each | Key-parity script checks. |
| Changed-file lint | Mobile 23 files, 0 errors, 47 warnings; web 25 files, 0 errors, 0 warnings | Full changed client source/test sets. Mobile warnings remain visible. |
| Full web lint | 12 errors, 0 warnings | Failing prior baseline. Every error maps to an identical accepted-parent line. |
| Locked web npm run build | Exit 0 | Local production compilation and page generation. No deployment claim. |
| Edge workflow check and tests | Check exit 0; 276 passed in 19 files | Exact current workflow commands on byte-equal copied source outside Next input. Controlled external I/O. |
| iOS and Android exports | Exit 0; one nonempty Hermes bundle per platform | JavaScript bundle generation only. No native resource was used. |

[final-counts.json](final-counts.json) takes counts from the actual filtered logs and JSON result sets. Overlapping commands are not added together. [web-full-lint-baseline-map.json](web-full-lint-baseline-map.json) maps all 12 current errors to accepted web `edcc47a3`. No new lint error is exempt. [bundle-proof.json](bundle-proof.json) gives retained local bundle paths, sizes and hashes. Generated bundles remain ignored local output.

The only local project was `unify-compose-367-370-r1`. API 62111, DB 62112, shadow 62113, inspector 62114 and content 3340 were assigned. Next 3260 was checked and remained unused. Both DB and REST container names were explicit. The owned wrapper verified the project and workdir labels of db, rest, kong, auth and edge_runtime before fixture work. The current Supabase help, changelog and local/API documentation were read. Local security checks covered explicit grants, RLS and schema-cache refresh. They do not establish hosted permissions.

The served 33-file source copy equaled the web candidate. The 85-file edge workflow copy also equaled it. Both copied function inputs were removed before the final web gates. They did not enter Next compilation or duplicate lint. The final build used the owned loopback API and synthetic configuration. No live model request ran.

[cleanup.json](cleanup.json) confirms no owned container, volume or assigned listener remains. Each assigned port accepts a loopback bind. All initial foreign container IDs remain. Only the owned project received stop/remove operations. All test and build runners ended naturally. No server, browser tab, native driver, simulator, emulator, Android SDK, ADB service or native port was used. Owned temporary runtime and function copies were removed. Ignored dependency and build output remains local.

[integration-and-parents-final.json](integration-and-parents-final.json) rechecks the accepted targets and immutable sources. Mobile integration remains `205e623a82e7777cae2291c721a2f63957948a51`, tree `e160023c8453f5121b4c6460d44f46ad38ef1e1c`. Web integration remains `edcc47a3f9003c6eacb4f2a3c02da6039d9e9bec`, tree `048a90ac105afd411d9b865bdcd03cc93abe3b58`. Both integrations and all immutable source branches remain clean and unchanged. Canonical /tmp inputs and state.json received no write. Only the copied brief marker was consumed.

Native criterion 8 remains INCOMPLETE for both tickets. The root owns Android A1 diagnosis and correction. This composition does not claim to fix the live font-scale composer loss. The retained real-config app was not enabled. No app.config.js change, Android plugin, font cap, global rendering flag, blanket remount, profile mutation, new destination, child, provider fallback, push, PR/issue/watch change, integration write, hosted action, deployment, paid service or ticket acceptance occurred. Impeccable 3.9.1 was not changed.

The next owner must obtain a fresh independent composition review. The root must then run focused native validation on the approved candidates. Local mounted tests, build output and exports do not close keyboard, native scaling, VoiceOver, TalkBack or release criteria.

/Users/savargupta/.t3/worktrees/Unify/t3-c68f1368/DOCS/companion-actions/evidence/compose-367-370-native-r1/HANDOFF.md
COMPANION_367_370_NATIVE_COMPOSITION_DONE
