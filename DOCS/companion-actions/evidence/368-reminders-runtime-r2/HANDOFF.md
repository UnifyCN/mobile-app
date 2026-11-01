# Ticket 368 runtime continuation r2

Status: HOLD. The requested runtime proof is incomplete. No ticket, integration or release acceptance is given.

The brief explicitly says to stop the runtime check if startup fails again. The owned Edge container remained in Created state. Its inspect and log requests each exceeded eight seconds. The owned stop command exceeded 30 seconds. Exact Edge removal exceeded ten seconds. No replacement resource or Docker Desktop restart was attempted. No reminder assertion ran.

## Candidates

| Candidate | Branch | Source commit | Source tree |
| --- | --- | --- | --- |
| Mobile | t3/ticket368-runtime-completion-r2 | 5c1320e46771fa1e823918c3724fc2c6f5448e93 | 1faf5eb5d030dbd3363d60e7daaa7f1f5f5c8444 |
| Web | feat/companion-reminders-368-r1 | 941e8cabb86ae11e4523854d9c8e7320c171663f | 1ea72aba1606b48b3e99387ea3cffecc84075286 |

The final mobile evidence commit follows the mobile source pin. It adds only this evidence directory. Resolve HEAD on the named mobile branch for that evidence commit and tree. The final response gives its exact hash. candidate-source-pins.json records the source pins, physical paths, clean states and integration pins.

Mobile primary: /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-0a487678.
Assigned web secondary: /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/fix-removed-receipt-view-359.
Web pointer: docs/companion-reminders-runtime-r2.md.

The primary started clean at 61a4134c786c37f65a02baca2364fd7e18ea2509. Separate identity/cleanliness and ancestry commands passed before git merge --ff-only ff8da13d60d4cff403f6b2fa49f7e1ebd021bb8f. No branch switch, reset, stash or checkout creation occurred. The web secondary started clean at 1b2cfdcc91de93961ce89dbade101b754c6dd91e. Its branch name is unchanged.

The original mobile source remains clean and read-only at ff8da13d60d4cff403f6b2fa49f7e1ebd021bb8f, tree 850cb562a523bb55232bbe7ad6962404cf09f8ac. All r1 evidence remains unchanged. The entire approved probes/reminder-368-r1 subtree remains unchanged. The integration worktrees remain clean at mobile 61a4134c786c37f65a02baca2364fd7e18ea2509 and web 914e4f54b08deaa9cf48e25aa86041720e6296db. No later integration change needed composition.

## Changes

Product source, migrations, rollbacks, locale files, ACLs and accepted SQL bodies remain unchanged. No binding ticket368 product defect was established because runtime setup failed before assertions.

Both live-client guards accept ACTIONS_STACK_WORKDIR from the owned driver. They still assert exact project, DB/REST names, running state and content URL. The old fallback remains. This is a test-driver portability correction. The browser and mobile live branches remain unexecuted.

Seven r1 drivers were copied into this evidence directory. Their paths resolve runtime and output under this primary. The suite now places reminders_test.ts, reminders_commands_test.ts and reminders_races_test.ts first. It excludes those files from the later regression sweep. It retains sequential resets and five successful REST replies after each reset. checks.json records the exact 38-file order: three new reminder files and 35 existing regression files. This is planned order, not executed order.

Optional ACTIONS_COMPOSITION_EVIDENCE is cleared by each runner. ACTIONS_CONTENT_QUERY_URL was set before container creation. Mobile and browser runners use explicit owned DB and REST names. No generated runtime entered application build, type or lint paths. Required mobile/web locales were retained.

## Binding falsifiers and actual sequence

A duplicate schedule/event, foreign-account disclosure/write, stopped reminder returned as due, inverted parent lock order, starvation, silent time normalization, restarted stopped work, blind unknown-result retry or wrong task reference must fail the feature. The primary boundary remains authenticated shared actions with committed outcomes. HTTP reply order is not commit proof.

1. Read the task briefs, SPEC, ticket, r1 handoff, Docker recovery record, repository instructions and relevant skills. The runtime is implementation continuation. It is not independent review.
2. Verified the assigned branches, heads, trees, cleanliness and ancestry. Fast-forwarded only the primary.
3. Verified no owned container, volume or network existed. All six reserved ports were free on IPv4 and IPv6. initial-preflight.json records all 12 checks.
4. Copied the source into this primary's .runtime. Verified 162 candidate files against pinned Git objects before startup. All copied Edge service files, tests, migrations, rollbacks and required locale inputs matched. Both service copies matched. executed-source-pins-before.json records hashes.
5. Started only project unify-reminders-368-r1 on 63081-63084 with content 3385 and browser 3390 reserved. Docker started the database and applied both baseline migrations. Auth, REST and Kong reached running state. Edge remained Created. No function request or test preflight ran.
6. Recorded the exact container list and project/workdir labels. Edge inspect and logs each exceeded eight seconds. Therefore actual Edge environment and complete mounts could not be inspected. The content URL was supplied at creation but is not claimed as verified inside Edge. The required preflight did not pass.
7. Sent SIGTERM to the owned startup client and stopped an owned hung inspect client. The startup client began graceful cleanup but remained pending. The separately bounded owned stop command exceeded 30 seconds. SIGKILL ended the remaining owned startup client. Its final exit was 137. The inspect client exited 143. These are controlled process termination results, not assertion failures.
8. Exact Edge removal exceeded ten seconds. No replacement Edge container or project was created. Verified the four other owned containers had exited and matched this primary's project/workdir labels. Removed those four by exact IDs.
9. Ran the independent source checks below. Retained all observed setup errors. evidence-script-errors.md records one failed evidence summary that used a nonexistent contracts.ts filename. The corrected summary uses the prior exact 21-path manifest.

The SELECT 1 probe in startup-db-state.json ran after SIGTERM began cleanup. It returned database system is shutting down. That result does not show that the database failed during startup. The prior health records and applied baseline log show a separate earlier state. The exact cause of the unresolved Edge start remains unproven.

## Fresh checks

| Subsystem | Result | What it proves and what it does not prove |
| --- | --- | --- |
| Full Edge workflow fixtures | 277 pass, zero fail, 19 files | Complete local fixture file set. No real Auth/Edge/Postgres/Cron boundary. |
| Normal Deno source checks | Pass | 10 entrypoints, 11 shared files and all three reminder service test files compile. No runtime assertions. |
| Normal Deno Edge test checks | Pass | All 19 executed Edge test files compile. No additional runtime class. |
| Mobile normal types | Pass | The changed guarded test compiles with the complete mobile program. No mounted live path. |
| Mobile default guard | One test skipped, natural exit | The default remains disabled without the owned local environment. No live result. |
| Mobile/browser changed-driver lint | Pass | Driver source passes ESLint. No live behavior. |
| Browser Node syntax | Pass | The script parses. No browser execution. |
| Copied Python drivers | Pass | All six Python files compile. Their dependent runtime paths remain unexecuted. |
| Exact source preservation | Pass | 162 staged files and 21 cross-repo mirrors retain their input hashes. The historical probe is unchanged. |

edge-workflow-files.json records the complete machine-filtered workflow file set and actual commands. The exact workflow test command was deno test --no-check --node-modules-dir=auto supabase/functions/. It had no net, env, read or write runtime permissions. External responses were fixtures. Live model/provider and AI quota calls stayed at zero.

The supplied r1 log ran five rag-query index handler files and reported 157 passes. This complete workflow adds 14 files and 120 tests. edge-workflow-counts.json records each file's count and verifies the sum is 277. Installed Deno is 2.7.14. The workflow selects floating v2.x. No exact Deno version from a hosted workflow run was supplied. Supabase CLI is 2.118.0. No tool or Impeccable upgrade occurred.

Normal Deno check used the same workflow entrypoint/shared glob plus the three reminder service tests. A second normal check covered all 19 Edge test files. Both exited zero.

## Reused exact-source client gates

reused-client-source-hashes.json verifies 1264 unchanged mobile input files and 752 unchanged web input files against the supplied pins. Only the mobile guarded test's workdir option and browser driver's workdir option changed outside those reused product inputs. The changed guard received fresh normal types, lint and its natural default skip. The changed browser driver received fresh syntax and lint checks.

The r1 report/checks.json remain the source for these supplied results. They were not rerun here: mobile 1516 main passes and 24 skips, 13 DST passes; web 720 passes and 13 skips; both i18n checks; web production build/types; changed product-file lint; iOS and Android Hermes exports; four scripted Chromium scenarios. Full web lint still has 12 mapped baseline errors. That command is not green. Exports and scripted/RNTL results establish no observed native workflow.

## Missing runtime proof and verdicts

Zero real service files ran. Zero reminder runtime assertions passed or failed. Zero mutations ran. There is no kill or survivor count. There is no race result. No real Cron, operation replay, scheduler/read outage, bounded/fair scan, full rollback/reapply or live-client result was obtained. The ten required race orders remain written, not observed. No deadline, crash or setup failure is labelled assertion RED.

The prepared live schema, mounted mobile test and live Chromium adapters did not run. Persistence, schedule execution, server visibility, rendered display and observed delivery all remain unproved in this continuation. A due event would not establish delivery even if observed. The prior RED and failed GREEN attempts remain unchanged.

SPEC: HOLD because the required runtime proof is incomplete.
STANDARDS: HOLD for the runtime/evidence gap. Fresh source gates pass. This main-session check is not independent review. No child or provider/model run was permitted.

Native iOS/Android create/change/cancel/Undo, due navigation, keyboard clearance, text scaling, focus and VoiceOver/TalkBack remain open. Native criterion 8 and tickets 367/370 remain unaccepted. Hosted migration/grants, Cron service-account installation/execution, schema-cache and deployment qualification remain open. No hosted action occurred.

## Cleanup and continuation

cleanup-final.json records zero running owned containers and zero owned client jobs. All six reserved ports are free on IPv4 and IPv6. Four stopped owned containers were removed.

Cleanup is incomplete. One unresolved Created Edge container remains: 91f09e93156c, supabase_edge_runtime_unify-reminders-368-r1. The owned database volume, Edge cache volume and network remain. Their exact names are in cleanup-final.json. Exact removal timed out. The Docker daemon may still hold the unresolved start/removal operation. Do not replace that resource or start another project until it is settled under separate root recovery authority.

The primary retains .runtime with copied sources, locales, Deno caches and public documentation. It also retains ignored mobile dependencies. The web retains its existing dependencies and useful caches. No temporary application configuration needs restoration. No owned listener, browser, test or CLI job remains. The prior Android resources, custom:1 history, iOS worker project/ports, simulator and Metro were not used or changed.

No Docker Desktop restart, global setting change, hosted action, provider/model call, push, PR/issue edit, integration change or acceptance occurred. Review these clean committed candidates independently after the missing runtime work can proceed. This handoff reports a blocked continuation, not a completed runtime qualification.
