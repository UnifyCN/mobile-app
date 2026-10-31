# Mobile implementation ledger

Approved parent and both source trees, five authority hashes and two review hashes verified at entry. Integrations match. Primary is the T3-prepared checkout. Direction B is fixed.

Public test boundaries: mounted ReminderSection, root notification hook and Companion caller; authenticated shared action transport and current persisted service outcomes. These boundaries are authorized by the implementation brief. SDK mocks are not native evidence.

Falsifiers: enabling before explicit action, a request after ownership loss, missing secure persistence before dispatch, retry before confirmed not_applied, trusting a historical receipt as current, unverified task navigation, duplicate navigation, private data in logs, or impaired in-app reminders.

Setup: the repo-relative Impeccable context command failed with MODULE_NOT_FOUND before dependencies or product edits. The installed skill lives in ~/.agents/skills/impeccable. The corrected command uses that directory. Impeccable stays 3.9.1.

The first account restart test required all same-account subscription restarts to invalidate work. The complete unchanged assertions require a confirmed same-session restart to preserve drafts and continue owned work. The implementation now retains that behavior. It increments the common epoch when the same account has a different actual Auth session ID. Unknown ownership still blocks work. The new restart test now binds to that session replacement. No legacy assertion changed.

The first complete mobile run failed 7 suites. Three were missing push SDK fixtures in old reminder tests. One was an incomplete Auth mock in old Circle routing tests. Their new fixture exclusions do not change assertions. The separate real root and reminder tests cover the new behavior. The Auth lock test had a virtual mock for an installed module; its setup now uses a normal mock. Two old draft tests and the same-account restart positive control exposed the overbroad epoch change described above. Raw output is retained.

The mounted navigation test exposed duplicate warm/cold routing. A late bootstrap response captured with unknown account ownership escaped the receive-time deduplication. The dispatch boundary now checks the current account+epoch+delivery identity again.

Local bootstrap R1 failed on frozen lock workspace metadata. The adapter removes only the old WEB package workspace section. All dependency resolution sections remain equal. No server code or dependency selection changes.

## Terminal findings

- MC-01 closed: the approved source, integration, review and authority identities match. No source parent or integration changed.
- MC-02 closed: the mounted reminder control is present. Actual editor/client/store tests save and cancel under six independent push states.
- MC-03 closed: strict push parsing has its own module. The approved types remain byte-identical. The initial parent parsing test used the types-only namespace; the final test imports the separate parser.
- MC-04 closed: the actual root warm/cold caller no longer navigates twice. Process-time identity checks cover a cold reply captured before ownership was known.
- MC-05 closed: confirmed-unapplied retries recheck the current token and locale. A changed token clears the unapplied request and requires a new operation ID. The assertion RED and green runs are retained.
- MC-06 closed: a new owner's queued notification is processed after an old owner's held resolver ends. The old result makes no navigation or UI write. The assertion RED and green runs are retained.
- MC-07 closed: SDK rotation fetches an Expo token and uses current revision. Foreground denial removes local eligibility. A held cold SDK response is refused after account replacement. Same-session refresh is a positive control.
- MC-08 bounded: old sign-in operations and retired installations remain unavailable. Their secure cleanup intent does not authorize the next sign-in. No automatic transfer or credential-loss recovery is offered. No server revocation claim is made.

## Additional setup corrections and proof limits

The first type gate found a test mock's widened string literals and a push status union that needed explicit applied narrowing. A later type gate found an over-narrow notification fixture type. These diagnostics are retained. Typecheck now passes.

The first added cancellation cases selected the original control before the review arrived. The next version supplied stopped=true instead of the contract's scheduling=stopped receipt field. Only the new test fixture and its wait condition changed. Both failed logs remain. All twelve mounted save/cancel cases pass.

The first root lifecycle fixture returned no AppState subscription in later cases. It then failed cleanup and the positive control. The corrected SDK fixture returns a removable subscription in each case. The actual root lifecycle tests now pass.

Changed-file lint first rejected untranslated helper arguments in JSX. The helper now receives translated labels. The final gate has zero errors and 68 warnings. Most warnings concern retained/copied test fixture import patterns and the existing notification-hook dependencies. They are disclosed, not described as a warning-free result.

The first frozen cleanup comparison refused a changed default bridge. No protected container, state, complete mount object, volume or nondefault network changed. The fresh host record places the bridge creation inside this run's Resource Saver startup interval and records both resync IDs. Verification uses only the frozen before/after resource captures. Strict network identity stays false. Four mount arrays changed order only.

The scoped input scan found one preserved em dash in a touched legacy comment. It now uses a hyphen. Common account-service comments now describe session identity accurately. These final comment changes do not change runtime behavior. The committed-source manifest matches all 38 recorded input files.

## Test chronology and sensitivity

The parent mounted-control and types-only parser assertions are saved RED. The first general restart assertion was replaced with the binding new-session case after retained tests established the same-session positive control. The client controller tests were written before its implementation, but their first execution was green. No assertion RED is claimed for them. The later warm/cold, token-change retry and held-resolver failures are binding behavior RED. SDK/localization additions without earlier failing executions are later coverage.

The four sensitivity runs remove owner checks, omit first secure persistence, alter secure authentication options and remove deduplication. All fail assertions. None fails module setup. No fault survives. Every mutated source restores to its saved SHA-256 before the final complete and focused suites.

The final full mobile run exits naturally: 1,597 main tests and 13 DST tests pass; 25 main tests are skipped. The final selected new set has 65 passing tests and one opt-in local skip across eleven files. The local opt-in case passes separately on the approved real service with real JWTs and persisted readbacks. SDK/proof storage remain stand-ins in that case. Its first incorrect SQL fixture is a setup failure. The approved 68-case service campaign was not rerun.

All actual local startup credentials were removed from public startup output and the raw private copy was deleted with the owned runtime. The credential scan finds no literal working local JWT or secret key in this evidence. Failed stand-in assertion logs can contain visibly synthetic fixture token/proof constants. They are not live device or service credentials. Production code has no token, proof, request-body or private-error logger. Existing broad-suite React act and SDK notices remain disclosed.

## Terminal state

Code commit 964990d7d5e0891a089c97909c2d7b1c99f768b4 is clean. Its parent is the approved MOBILE server source. The final evidence-only child contains this ledger and handoff. No instruction, skill, global setting, protected source, integration, ticket, PR or hosted state was changed. No child agent, provider switch, real push send or retained native data use occurred. The own local project, temporary exact WEB export and private keys are removed. The owned ports are free on both address families. Installed dependencies and export bundles remain ignored in this primary.

The last application gates were repeated on the committed code HEAD and tree. Each pinned command record confirms an empty application status. Full CI, types, both exports, changed-file lint and i18n pass on that exact code tree. No application file changed after those runs. The evidence-only whitespace failure is retained separately.
