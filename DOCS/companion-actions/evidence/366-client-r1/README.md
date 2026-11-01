# Ticket 366 client corrections, root pass 1

This corrects SPEC F2 and Standards S366-1/S366-2. The SQL parent-state race F1 remains with a separate worker. These checks do not accept ticket366.

## Behavior

Both clients compare a confirmed-not-applied step operation with the visible draft. An edited draft disables the old Retry. An explicit Save or Add supersedes only that confirmed-not-applied intent and creates a new operation identity. Restoring the reviewed draft permits the unchanged same-operation retry. Pending and failed lookups keep the old intent; editing cannot authorize another write until lookup confirms not applied. Existing store rules and transport contracts are unchanged.

On web, enabled icon controls use shared press feedback and a pointer cursor. Step and proposal checkbox rows use shared press-dim feedback. Rename and removal disclosures use shared Reveal. Pointer activation uses the shared entrance. Keyboard activation uses the new optional instant property. Existing Reveal callers retain their default. The application MotionConfig still governs reduced motion. This source check is not observed reduced-motion browser proof.

## Falsifiers and results

- Client recovery: a changed title still sent by old Retry, a reused operation id on a new explicit save, a changed identity on unchanged Retry, or any new write while outcome is unknown would refute the correction. Six permanent cases per client cover rename/add across changed, restored and pending drafts. Before source edits, four failed by assertion and two positive controls passed on EACH client. After: six pass on each. Native fixtures now use the accepted managed query-client cleanup helper; no existing assertion changed.
- Web disclosure: pointer activation without the shared initial opacity, or keyboard activation retaining that initial hidden/moved state, refutes the correction. Two new cases failed by assertion before the fix and now pass. The first green run exposed a test label error: Cancel editing was not the actual Cancel label. Correcting only that test label completed the keyboard branch. The original red failures were both at the earlier binding opacity assertion. No false regression claim is made for the label.
- Local harness isolation: missing container configuration reaching a container command refutes the guard. A probe intercepts child_process.execFileSync and substitutes every HTTP response. Before: all three incomplete configurations reached old361default names; those are intercepted attempts, NOT actual Docker operations. After: neither, DB-only and REST-only configurations fail before any command. The explicit-both control reaches only its two supplied probe names, then the interceptor stops it. All four probe assertions pass. The inner Jest commands intentionally exit1 on the configuration guard or interceptor; those are not application test passes. The outer probe exits0.

## Local incident and guard

The364worker reported an old local361gate update and PostgREST signal from the existing harness's implicit defaults. Previous values are unknown. Root made one read-only observation of the current gate and did not guess a restoration. The localStack test now requires both ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER before enabled tests start. Ordinary no-environment runs still skip it. This guard does not verify that explicitly supplied names belong to the loopback API; the caller must select its own project. It makes implicit selection impossible.

Reproduce the intercepted guard probe from unify-front-end: copy check-container-guard.py and container-guard-setup.cjs from this directory into node_modules/.cache/366-client-root-r1, then run python3 node_modules/.cache/366-client-root-r1/check-container-guard.py. It intercepts all subprocess commands and uses dummy credentials. No real database is required.

## Gates and limits

- Mobile exact npm run test:ci exited0 naturally, with no forceExit: main135suites/1428tests pass,5tests skipped; DST2suites/13tests pass. Main43.163seconds; DST0.768seconds. Both new366fixture files use createTestQueryClient. The local-stack suites are skipped without their explicit environment.
- Mobile typecheck, seven-locale parity and changed-file eslint exit0. Eslint reports41warnings in pre-existing fixture patterns and no errors. No claim that the warning count is a new baseline measurement.
- iOS and Android bundle export exit0. This is compilation proof, not device input, screen-reader or native layout proof.
- Web npm test exits0:53files/642tests pass. Build, TypeScript, locale parity and changed-file eslint exit0. Fourteen step component cases pass, including six recovery and two disclosure cases. Sets overlap and must not be added.
- The client tests use scripted authentication, transport and action responses. They prove current-draft/operation behavior and rendered controls, not server authorization, persistence, SDK token ordering, hosted behavior or universal phrasing. No database, Docker operation, native device, live provider, browser Preview, or hosted write ran for this correction.

Raw gate logs remain in each root's node_modules/.cache/366-client-root-r1. Selected JSON and command probe artifacts are tracked here and in web docs/evidence/366-client-r1. No previous366evidence count is replaced by these counts.
