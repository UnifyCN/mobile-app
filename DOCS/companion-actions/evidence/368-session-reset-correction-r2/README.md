R368-SPEC-2 is corrected in the account-session store. Independent recheck is required. No ticket or release is accepted.

The registry now requires the account session epoch. It replaces private drafts, local removal requests and action results when that epoch changes. It retains one shared store for all surfaces of the same account session. Both mobile and web adapters pass their existing owner epoch. A token refresh keeps the epoch and the store. A batched sign-out/sign-in or A/B/A transition returns to the same account ID with a new epoch and gets an empty store.

The old store can finish a captured callback, but that object is no longer the current account-session store. Existing transport and editor owner checks remain. No request, SQL, migration, rollback, reminder scheduler, operation ID, or authorization rule changed. The caller sheet key from R368-SPEC-1 remains.

Written falsifiers: a stored reminder date after the batched reset, a lost draft within the same session, a late old-store write reaching the replacement store, a new service input, or a mismatched mobile/web mirror.

Test order and results:

- Before the product fix, the two new rendered mobile cases failed at the expected restored-date assertions. The reviewer's exact unchanged file also failed its two batched-reset assertions. Two adversarial controls passed. The first combined run has four failures, two passes and 24 exclusions. The final two permanent tests also ran alone on unchanged code and failed twice. Their zone assertion uses the initial device zone rather than assuming a host zone.
- The new shared-store test failed on the old implementation. Its same-session sharing control passed. It was written before the shared-store fix.
- After the fix, the permanent mobile file and exact reviewer copy pass all 30 cases. These counts overlap: the copy includes the original 12 permanent cases. They are not 30 unique acceptance cases. The temporary executable copy was verified against the saved text and removed before the full main suite.
- Web focused: 21 pass in four files, including the two store cases, existing reminder editor/navigation cases and presentation cases. The pure shared-store cases prove registry behavior. They do not prove web SDK auth-event ordering or that every page renders between auth events.
- Three deliberate faults each fail at assertions: the mobile adapter omits its epoch, the store ignores epoch changes, or the store clears work within the same session. Source bytes were restored after every run. After these runs, the registry's epoch field became required in the function type. That refinement changes types only. Three existing ownership-test callers now pass the current owner epoch. No assertion changed.

The first mobile review report, its exact retained reproduction and raw failures remain read-only in /Users/savargupta/.t3/worktrees/Unify/t3-d660eece/DOCS/companion-actions/evidence/review-368-SPEC-r2. The original report identifies no cross-account row disclosure. This correction closes a private cached-draft reset gap.

All 163 prior executed service inputs retain their exact hashes. All 21 mobile/web mirrors match each other. Sixteen SQL pairs and the other four shared pairs retain their prior hashes. Only the shared taskActionStore pair changes. Prior service, Cron, cancellation-race, mutation and rollback results remain supplied evidence. No service runtime ran in this correction. See service-and-mirror-audit.json.

The web presentation source is unchanged from b90c28ed. Prior Standards S1/S2/S3 approval and its 38/70 browser checks remain supplied, exact-source proof. They were not rerun here. Advisory H1 is unchanged.

Proof limits: mobile checks use rendered native components with scripted Auth/endpoint/content replies. The web unit checks use a scripted or empty client. They do not prove actual SDK token timing, native frames or screen-reader behavior. No native, hosted, live provider, delivery, service or container operation ran. iOS N01/N02/N03 and criterion 8 remain separate. The independent native worker is not part of this correction.

This correction changes no integration branch, previous fixed review commit, or native resource. Useful installed dependencies and ignored build output remain. No push, PR, hosted, instruction-file, ticket or acceptance change occurred.

Final checks on the committed source bytes: mobile test:ci exits naturally with 0 in 63.312 seconds. Main: 145 passed suites, two skipped; 1,523 passed tests and 24 skipped. DST: two suites and 13 tests pass. Mobile types, translations, changed-file lint and both exports exit0. Changed lint has eleven warnings and no errors. Full mobile lint was not repeated. Web: 69 files, 734 tests pass, 13 skipped; types, translation parity, changed-file lint and build pass. Full web lint fails with the same twelve errors in three unchanged files, recorded in lint-baseline-files.json. Counts overlap with the focused checks.

No service or native job was started by this correction. The independent native reviewer is a different active task. The existing SDK-order and native evidence limits remain. No ticket acceptance follows.

All logs are saved losslessly as gzip files. The compression map records their original byte counts and SHA-256 values.

COMPANION_REMINDER_368_SESSION_RESET_CORRECTION_R2_DONE
