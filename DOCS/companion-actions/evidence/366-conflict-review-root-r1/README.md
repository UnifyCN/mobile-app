# Root correction for #366 SPEC r3 F4

## Claim and falsifier

Both review panels display the exact proposed step text before the user can approve a conflicting rename Undo. An enabled approval with the target absent would disprove this claim. Keep current must send no step write and preserve the newer title.

The permanent tests mount the actual Checklist and task controls. They seed a step in the scripted server before mounting, so there is no incidental current-session creation receipt containing its title. Each test renames it, makes a newer remote edit, and selects the receipt-specific Undo. Both clients must display `Proposed step text: Gather the original papers` beside the current checkbox before either approval or Keep. Approval sends that exact proposed title. Keep sends no write.

## Change

TaskStatePanel adds one text paragraph for the server's `step.update` proposal. It uses the existing text tokens and wrapping. The existing approval, revision, operation identity, offline rules and removal confirmation are unchanged. One new taskSteps.proposedText value is translated in all seven locales on each platform. No SQL, contract, action service, layout, font, dependency or native module changed.

## Test order and results

- Before any product edit, both new parameter cases fail on each unchanged candidate: mobile 2 failed / 14 deliberately unselected, web 2 failed / 14 unselected. All four fail at the exact proposed-text visibility assertion, after the enabled approval and current newer title are present. No setup error or timeout counts as red.
- After the correction: mobile steps and suggestions 18/18, web steps 16/16, all natural exits 0. Existing assertions are unchanged.
- A first mobile typecheck found a possibly undefined last write in the new test. Optional access corrects the test's type. No defect assertion changed. The first check log was overwritten by the successful rerun; first-typecheck-result.txt records that observed result, not a recovered log.
- Final exact mobile test:ci exits 0 normally: main 1430 passed / 5 skipped, DST 13 passed. No forceExit, timeout or process termination.
- Mobile typecheck, translation parity, changed-file lint and combined iOS/Android export exit 0. Lint: 0 errors / 13 existing warnings in the existing test file. No locale native-speaker qualification is claimed.
- Final web npm test: 644 passed in 53 files. Types, parity, changed-file eslint and normal production build all exit 0. The normal build does not prove the separately owned font correction or resolve earlier failing-response provenance.
- Git diff --check passes on both roots.

## Proof limits

Client tests prove rendered text, selected controls and exact client writes through scripted auth/HTTP. They do not prove server authorization, database persistence, real SDK token ordering, native geometry/focus, browser motion timing or screen readers. The prior independent r3 public control already proved that the service supplies this title and saves it only after approval. No backend test was rerun for this text-only correction; the prior 110-case local result remains prior evidence. No hosted, paid/live provider, Safari or device operation occurred. Full font work and #364 are excluded.

## Artifacts

The *.log.gz files contain exact command output after gzip decompression. log-manifest.json gives the original byte lengths and SHA-256 values. Compression preserves raw whitespace and keeps it outside source whitespace checks. mobile-gates.json and web-gates.json record command exits. Counts above were reread from these same logs. run-gates.py stays in the root scratch directory; it is only a subprocess logger, not a product test harness.

All owned commands exited naturally after the optional-access test correction. No stack or server was started. No source integration, push, PR action or hosted write occurred. Both immutable r3 source candidates remain untouched.
