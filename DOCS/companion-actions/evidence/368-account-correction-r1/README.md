# Mobile reminder account boundary correction

The root corrected R368-SPEC-1. The mounted task sheet now belongs to the signed-in account and its session epoch. Its selected task and private title cache reset when that owner changes. A token refresh keeps the same sheet and drafts. This implementation still needs independent review. No ticket, native criterion or release is accepted.

Primary: `/Users/savargupta/.t3/worktrees/Unify/fix-reminder-account-isolation-368-r1-root`. Verified branch: `fix/reminder-account-isolation-368-r1-root`. Base: `157081d3d5b0aaca10b06f9b2456c504f4b9d5df`. The canonical mobile candidate remains unchanged. Web candidate `b90c28ed1915f9b42ec8bbae5e748ec175ffab93` and both integrations are unchanged.

The report is `/Users/savargupta/.t3/worktrees/Unify/t3-e59a8219/DOCS/companion-actions/evidence/review-368-SPEC-r1/report.md`. Its original test failed on the unchanged candidate. Account B had finished its reads and had no custom tasks, but A's private title remained visible. That proves rendered disclosure. It does not prove foreign database access.

## Cause and correction

The screen retained the task-list sheet across account changes. Selecting a reminder inside that sheet set a local task reference. The sheet body cached the task title so a removed task could keep its receipt view. Both local values survived the account change. The editor's request-owner checks could not clear that caller state.

The existing account snapshot already supplies the account ID and epoch. The Companion caller now keys TaskActionsSheet with both values. React replaces that state owner before rendering the new session's sheet. The task list can remain open, but its selection and private cache are new. The same account's token refresh keeps the same key. The two-line product diff contains the key and its comment. No request, transport, query policy, shared contract, migration, rollback, string or dependency changed.

The three ranked explanations were retained sheet state, stale account query data, and retained opening props. The failing case reached B's completed empty task read. Its sheet selection and title cache remained, which binds the first explanation. The correction resets their actual state owner. It does not add a title filter or hide one test string.

The falsifiers were A's private title after B signs in, a selected view retained across a new epoch, an old selection restored when A returns, a reused synthetic task identity opening without a new selection, or lost same-account drafts after a token refresh.

## Results

| Check | Before | After | Boundary |
| --- | --- | --- | --- |
| Unchanged reviewer case | One assertion failure | One pass | Actual rendered Companion and sheet; scripted Auth and endpoint |
| Five permanent owner cases | Four assertion failures; token-refresh control passes | All five pass | Replacement, batched sign-out/sign-in, return to A, synthetic identity reuse and token refresh |
| Entire task-sheet file | Prior assertions unchanged | 12 pass | Includes the older ownership and task-control checks |
| Fault: no account key | Not applicable | Assertion RED | Reproduces the title disclosure |
| Fault: account ID without epoch | Not applicable | Assertion RED | Catches same-account sign-out/sign-in in one batch |
| Full mobile CI | Supplied base proof | Main 1,521 pass, 24 skipped; DST 13 pass | Natural exit 0 in 56.99 seconds; no force exit |
| TypeScript, locale parity | Not repeated on the base | Pass | Final client checks |
| Full mobile lint | Not repeated on the base | 0 errors, 85 warnings, exit 0 | Changed-file lint has 0 errors and 10 warnings |
| iOS and Android exports | Supplied base proof | Exit 0 | Bundle compilation only |

The five permanent tests were written and run before the product fix. The same-account control passed before and after. The original reviewer test copy was byte-identical in its failing and passing runs. Its SHA-256 is `9b18d7be5e7c8e24d1d5c04851d29b835f0e29b29069282cb0db17afa65c1f42`. It is saved as `reviewer-original.test.tsx.txt`. The temporary executable copy is removed so the full suite does not duplicate those cases.

Both deliberate faults failed at assertions. The mutation runner restores the exact source in a finally block. `mutation-results.json` records the restored hash. The full CI ran after restoration. No timeout or setup error is counted as a mutation kill. The synthetic same-ID response is a caller test. It does not establish that two real database rows can share a primary key.

## Failed helper checks retained

The first complete sheet run had two older tests querying an unmounted sheet instance. Their failure log remains. The account boundary now replaces that instance. Only their post-change query target was updated to the current sheet. Their privacy assertions are unchanged. Three new helper type errors were then corrected: the scripted server requires a string URL and JSON body, and its parsed reply is unknown. The temporary reviewer file also had an existing unknown-reply type error. It was removed after its unchanged passing Jest run. Both failed type logs remain. Final types and the full sheet suite pass.

React act warnings remain in the rendered logs. The export retains missing ignored Android configuration and asset warnings where emitted. No native application ran here. The raw failures are not renamed into green results.

## Scope and cleanup

The screen, sheet, account session, action client/store and parser are real client code. Auth events, Checklist results and the action endpoint are scripted. This proves the client state owner and rendered content. It does not prove SDK token timing, RLS, hosted behavior or native Modal frames. No service, Cron, database, simulator, Metro, provider or model call ran. The earlier 24 independent service passes, ten race orders and three assertion mutations remain exact unchanged-source evidence for the service. They were not repeated for this caller-only change.

The separate native R5 report passed real consent and records three open product findings: N01 clipped removal text, N02 draft loss during history navigation, and N03 duplicate live-text sibling keys. This correction does not claim to resolve them. VoiceOver and native criterion 8 remain incomplete.

All owned checks ended naturally. The temporary reviewer test is gone. The exact source is restored after fault testing. Installed dependencies and export output remain ignored. No push, integration, PR, ticket, provider or acceptance state changed. The former reviewers completed and were held. Fresh review must use the committed correction.

`gate-summary.json` records the exact source hashes and machine-derived final counts. Every failure log and final result remains in this directory. Large raw logs use byte-verified gzip archives. `compressed-logs.json` maps their original names, lengths and SHA-256 values. The test commands are:

```sh
npx jest __tests__/companionActions/companionTaskSheet.test.tsx --runInBand --watchAll=false
```

```sh
python3 DOCS/companion-actions/evidence/368-account-correction-r1/mutation_check.py
```

Run Jest from `unify-front-end`. Run the mutation helper from the mobile repository root. It edits only this owned source while it runs. Do not run it beside another check in the same checkout.

COMPANION_REMINDER_368_ACCOUNT_CORRECTION_R1_DONE
