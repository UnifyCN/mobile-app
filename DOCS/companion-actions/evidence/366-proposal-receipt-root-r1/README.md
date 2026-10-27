# Root correction of #366 SPEC r4 F5

## Claim and falsifiers

A saved suggested-step action exposes its own ReceiptBlock and Undo in both result panels. Undo must ask before removing steps, Keep must send nothing, the inverse must use that receipt's operation id, and a later unrelated step must survive. A lost reply must be looked up, and a confirmed non-applied retry must reuse its operation id. A refreshed historical receipt must not still say it is current. A newer step must survive a conflicting Undo until a reviewed new action is approved.

## Production change

Both StepProposalPanel components render the existing ReceiptBlock at proposal:<id>. General recovery eligibility still requires a bound account/store, a fresh task read and an open parent. Draft editing additionally requires draft status. Receipt Undo is disabled while a write is unresolved, a draft request runs or a compensation review is open. The same eligibility now permits lookup/retry and compensation for an already-applied proposal. The added-count line applies only to a step.create receipt, so a completed Undo displays its removal receipt instead of reporting an addition again.

When the proposal read returns the same receipt identity as the saved phase, its refreshed current/undoable flags win. An immediate save receipt or a later Undo receipt with a different identity still displays immediately. This preserves the distinction between historical saved text and current receipt metadata.

The web shared ReceiptBlock now uses the existing Reveal for removal confirmation. Pointer clicks enter through shared motion; keyboard click detail0 sets instant. Reduced motion remains controlled by the shared MotionConfig. This change also applies to the existing task-add removal confirmation. No mobile receipt style or target changed. No SQL, contract, store, service, locale, font, dependency or native module changed.

## Test sequence and exact results

1. Initial permanent receipt test, before any product edit: mobile1fail/2unselected and web1fail/16unselected. Both reach the missing specific Undo assertion after successful suggested approval. No setup error counts as red.
2. The first product patch exposes the receipt and completes its Undo. Two assertions in the new test needed correction: the fixture steps() includes removed history, so active rows need removed=false; the wire confirmation is authorization.removal_confirmed, not a top-level field. The unchanged new test was also moved below the existing mobile suite. Both intermediate failing runs remain archived. These were test faults, not extra product defects. The final normal-flow cases pass on both clients.
3. Lost-reply and pending/failure/confirmed-not-applied variants were added after the initial receipt patch. They pass first run. They are regression coverage, not red-first claims. They check one applied inverse after a lost reply, no removal while pending/failing, the same operation id on explicit retry, original receipt identity/confirmation, Keep and preservation of another action's step.
4. A new reopened-history test fails on each client before metadata reconciliation: the historical label is absent. The initial reconciliation green reaches conflict but the test assumed the generic Apply label. The actual removal compensation is named Remove step. The test now first waits for the exact removal-conflict text, then checks the actual Remove control and Keep current. That intermediate failure is retained as a test fault. Both final cases pass and the newer title survives.
5. Before the web Reveal patch: pointer test1assertion failure, keyboard control1pass,20unselected. After the patch both pass. These are rendered motion declarations and control selection, not measured full-browser timing.
6. Final focused runs: mobile22passed in2suites; web22passed. Natural exits0. Existing assertions are unchanged.

## Final application gates

- Mobile exact test:ci: natural exit0, main1434passed/5skipped; DST13passed. No forceExit, timeout or stopped process. Typecheck, parity, changed-file lint and combined iOS/Android export all exit0. Lint has0errors/16warnings; no claim that every warning is newly audited.
- Web npm test:650passed in53files. Types, parity, changed-file eslint and normal production build all exit0. This does not qualify separate font work or establish the cause of older unsaved CSS failures.
- Diff whitespace checks pass for both product changes. Archived logs use gzip so their original output whitespace stays intact. log-manifest.json records byte lengths and SHA-256. Gate JSON files record exact commands and exits.

## Proof limits

Rendered tests use the actual Companion/sheet/drawer/panels/client/store and scripted HTTP/auth. They prove selected controls, client payloads and recovery state, not real authentication token order, RLS, persistence or native geometry/AT. The server SQL and action service are unchanged; prior independently exercised local110backend cases remain prior proof, not new executions. Full exports are bundle proof only. No stack, real generation, hosted service, native device, Safari, screen reader, paid provider or Preview operation occurred. No new native-language or RTL-layout qualification is claimed. No mutation campaign was run or claimed.

The F4 exact-title correction remains in the full focused and application gates. Both prior immutable r4 candidate sources remain unchanged. All root commands ended naturally after the disclosed test corrections. No integration, push, PR or hosted change occurred. Fresh independent Standards and behavior review are required; this is not acceptance.
