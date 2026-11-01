HANDOFF: REMINDER_368_CANDIDATES_SERVICE_HOLD

# Ticket 368 implementation handoff

The source candidates are committed and clean. Required service qualification is blocked. Do not integrate or accept this ticket from these results. A separate evidence commit follows the mobile source pin below. It changes no application or service source.

## Falsifiers and verdicts

PLAN.md records the binding falsifiers before implementation. A duplicate schedule/event, foreign-account read/write, due result after a committed stop, parent-lock inversion, silently normalized time, restarted stopped work, stale account result, blind retry, or wrong task reference must fail the feature.

SPEC: HOLD. The client and static checks pass. The final production service, scheduler, race, fault, mutation and rollback assertions have not run.

STANDARDS: HOLD for the missing runtime proof. Changed-file lint and types pass. Full web lint retains its 12 mapped baseline errors. This is a main-agent source review. No independent review or child agent ran. The code-review procedure's parallel-agent step was not used because the task explicitly forbids children.

## Fixed source inputs

| Candidate | Branch | Source commit | Source tree |
| --- | --- | --- | --- |
| Mobile | t3/companion-reminders-ticket-368 | b788e31d73e78031ccadb86260a727910652ca5a | 4fcaf06827bf40aa661c531c4a45b91c56807b6c |
| Web | feat/companion-reminders-368-r1 | 1b2cfdcc91de93961ce89dbade101b754c6dd91e | 8f8486385c87b63f5ec3d3b937d609030cf51610 |

Mobile path: /Users/savargupta/.t3/worktrees/Unify/t3-abe3435e.
Web path: /Users/savargupta/.t3/worktrees/Unify-Web-App/fix-removed-receipt-view-359.
The web branch was renamed only in its assigned existing worktree. No new checkout was created.

Mobile retains every ancestor of 61a4134c786c37f65a02baca2364fd7e18ea2509. Web retains every ancestor of 914e4f54b08deaa9cf48e25aa86041720e6296db. integration-ancestors.json records the complete sets. source-pins.json records the fresh ancestry checks, trees, branches and integration states. Both integration worktrees remained clean at those exact base heads. No later accepted change needed composition.

The mobile composition commit is b29e9346e0f26809cc0ebc71a77fc90ff0cc9460. It merges approved probe 559b56d99e21c0bd9f30928245a1d6a53e85bbe6. Its entire probes/reminder-368-r1 subtree is unchanged. The independent prerequisite report hash was checked as d90f1eddffda4948669dd2b82e4b7176e37342ed269bf08310788f50156f7a60. That probe approval supplies the ownership decision. It is not final-product evidence.

## Changes and design

The primary implementation record is ../../368-reminders.md. The web pointer is docs/companion-reminders-368.md. The direction B contract and reviewed board were read from the main repository's DOCS/design/companion-actions directory. Existing sheet/drawer components, state and tokens were read. The direct design route retained those containers and navigation. No skill or design-system version changed.

The new migration and rollback preserve the seven accepted foundation migrations and their grants. One minute-based Cron job attempts up to 50 due schedules per run. A circular cursor advances even across locked items. Parent locks precede reminder/event locks. Item failures are isolated and observable. Claims stay pending, so the existing lifecycle triggers can stop them. Due events are history, not delivery. Shared typed contracts and all eight migration/rollback pairs are byte-identical across the two repositories. mirror-hashes.json records 21 comparisons.

Schedules use exact UTC instants, explicit wall times and named zones. DST gaps fail. Fold choices need offsets. A changed schedule creates a new identity and stops its predecessor. Confirmation, operation IDs, revisions, receipt lookup and safe retries use the existing action store. Undo stops only the receipt's own schedule. Cancellation Undo leaves work stopped. Full rollback preserves history and receipts and requires new explicit scheduling.

The clients show persisted and due reminders, retain full source references, and open an owned reminder task even without an active Checklist/progress row. Both transports reject late results from another account or epoch. Private drafts use the existing per-account store. No action waits for a model or AI allowance. The new strings have real translations in all seven locales. A machine comparison found every pre-existing locale value unchanged.

## Fresh results

| Check | Result | Proof class and limit |
| --- | --- | --- |
| Mobile test:ci | 1516 main tests pass, 24 skip; 13 DST tests pass | Natural main and DST exits. RNTL/fixtures. The real-stack tests are skipped. |
| Web npm test | 720 pass, 13 skip | 733 total tests. Rendered/jsdom and unit evidence. |
| Edge workflow | 157 pass, 0 fail | Every rag-query handler test file. Network fixtures. Only loopback network access was permitted. No provider call. |
| New reminder controls | 7 mobile cases; 5 web control cases; 2 web navigation cases | Scripted rendered clients. Includes explicit review, gap/fold refusal, lookup-before-retry, delayed account change, draft retention, stale due state and full references. |
| Existing removed-receipt correction | 2 existing web cases pass | Original assertions remain. One mock export was added for the new child section. |
| AI-limit controls | Focused mobile and web files pass | Two additional availability assertions per platform. Existing save/Undo/model-spy assertions remain unchanged. This does not prove a live quota state. |
| Headless Chromium | 4 scenarios pass | English/Arabic, 390/1280 px, actual drawer/controls/client/store/CSS, scripted service. Keyboard save, focus inside drawer, Escape, composer retention, full reference, no overflow and 44 px CSS targets. |
| Mobile types | Pass | Includes the guarded local-stack reminder test. |
| Web types and production build | Pass | Normal tsc and Next build. No hosted observation. |
| Edge/service-test types | Pass | Service and all three new Deno service-test files. Typechecking does not execute their assertions. |
| i18n | Both parity checks pass | Seven supported locales. Existing key/value preservation checked independently. |
| Changed-file lint | Pass | 18 mobile files and 28 web files. Zero errors. Mobile emits 11 warnings, including require/import-order warnings in the guarded test and the existing unused-usage warning. Web emits five ignored-file warnings for service source covered by Deno checks. Guarded driver checks also pass. |
| Full web lint | 12 errors | Exactly the accepted baseline map in web-baseline-lint.json. No config or suppression changed. |
| iOS and Android exports | Pass | One Hermes bundle per platform. Bundles do not prove a native workflow. |
| New final service assertions | Not run | Blocked setup. No GREEN claim. |
| New service mutations | Not run | Three written binding mutations. No kill or survivor count is claimed. |
| Live mobile/browser runners | Preflight fails | No synthetic account or fixture was created by either runner. Their live paths remain unexecuted. |

checks.json holds the machine-filtered counts. The final focused AI-limit files ran after the full client runs. The final full mobile run includes the new guarded test as one of its skips. The later timeout guard changes only that unexecuted test's HTTP setup; its default skip and final typecheck also exited naturally. The browser live-mode adapter was added after the app build. Its scripted mode, syntax and lint pass. Its live branch did not run.

## Test order, RED and retained failures

1. The owned project and ports were absent before the first stage. All tracked service files and the required locale inputs were copied outside app build/type/lint paths. The content URL was set before creation. A separate preflight checked all five actual container project/workdir labels and the actual content URL. Optional composition evidence was cleared. The DB and REST names in every live runner are explicit and owned.
2. red-save.log contains one assertion RED: an authenticated concurrent reminder request returned 422 unsupported_operation while the test expected 200. The other passing case was cleanup. This is not a product pass.
3. The first GREEN attempt did not reach an assertion. The owned Edge worker did not reach authentication after restart. Docker reported its PID as a zombie. Exact-container removal succeeded. The next owned database container remained Created. The start process was stopped. Both owned stop/cleanup commands completed. No daemon restart occurred. The observed failures do not establish a product regression or the underlying Docker cause.
4. Type, lint and rendered failures were retained and corrected. These include a missing new mock export, account clearing tied to an unstable mocked store, a duplicate test-only mock declaration, new literal-string lint errors, and an incorrectly matched fixture hook import. No old assertion was weakened.
5. The first browser setup failures were retained. The target check initially used a transformed DOM rectangle. One 44 px target measured 43.999996185302734 px. The driver now checks integer CSS layout height and retains both the raw rectangle and layout height. This was a measurement correction, not a product target change. The failed records remain.
6. All final passing gate logs remain. No force-exit option was used. New backend tests, real Cron orders, faults, mutations and rollback/reapply remain unexecuted. Historical probe passes and mutations are kept separate.

The new service files define authenticated duplicate waits, status while pending, owner isolation, both task sources, no-progress content parents, schedule changes, changed review, immutable receipts, safe Undo, time validation, real worker/read outages, bounded batches and full rollback/reapply. The race file defines ten real worker/stop orders: shared completion, removal, explicit cancellation, legacy custom completion and legacy first content completion, each in both orders. It checks directed waits and intermediate committed state. These are test definitions, not observed results.

## Reproduction after the external blocker is removed

Do not start the owned stack while its reserved ports remain occupied. Confirm the project, containers, volumes and network are absent and all six ports are free. Restore a healthy Docker runtime only under separate authorization. Do not reset another project's resources.

Run each command separately from the mobile root and read its output before the next command:

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/stage.py
```

```sh
ACTIONS_CONTENT_QUERY_URL=http://host.docker.internal:3385/content supabase start --workdir DOCS/companion-actions/evidence/368-reminders-r1/.runtime/supabase/tests/companion-actions
```

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/run.py --preflight
```

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/suite.py
```

The suite runs files sequentially, resets only the owned project and confirms five successful REST replies after each reset. Prepare the final live schema and local gate after the suite:

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/prepare_live.py
```

This is setup, not a passing acceptance test. It applies missing migrations in timestamp order and waits for the new read RPC. Then run the guarded clients separately:

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/mobile_live.py
```

```sh
python3 DOCS/companion-actions/evidence/368-reminders-r1/browser_live.py
```

The live browser mode creates only its own synthetic accounts, uses the exact owned action endpoint, waits for actual Cron due state, reads saved and stopped outcomes, checks task state and foreign-account reads, and removes its accounts. It uses fixture adapters around real components. It does not claim the Next app shell or native behavior. The local mobile path uses RNTL with real action persistence. It does not claim a native device.

## Remaining qualification and cleanup

Before acceptance, execute the missing real-service checks and review their full distributions. Keep persistence, worker execution, server visibility, rendered display and user observation separate. Run observed iOS and Android reminder create/change/cancel/Undo, due navigation, live text scaling, keyboard clearance, focus return and screen-reader checks. Verify all new controls with VoiceOver and TalkBack, including RTL and long text. Existing native criterion 8 and tickets 367/370 remain unaccepted.

Hosted grants, Cron installation/execution permissions, actual service-account execution, schema-cache behavior and deployment remain open. No hosted action is authorized by this handoff.

cleanup-final.json records zero owned containers, volumes and networks. Ports 63083, 63084, 3385 and 3390 are free. The Docker backend still holds 63081 and 63082 after the project resources disappeared. That global process was not killed. No owned job, browser or test process remains. The retained native projects, emulators, old ports and original custom task were not used or changed.

The ignored .runtime directory retains copied source, Deno caches and native exports. Each app retains its ignored dependency/build caches. No temporary app config needs restoration. Only owned temporary documentation reads were removed. The evidence credential-pattern check found no local credential value in committed evidence. New analytics fields remain categorical; no final reminder execution telemetry is claimed because that runtime path did not run.

No push, PR/issue edit, integration-pointer change, hosted action, skill upgrade, provider/model run, child agent or ticket acceptance occurred.

Raw command logs retain their original trailing spaces and blank lines. Source and non-log evidence pass git diff --check. whitespace-check.json records this distinction.
