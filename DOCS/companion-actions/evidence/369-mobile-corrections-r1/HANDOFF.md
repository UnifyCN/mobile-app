# Mobile push correction R1

COMPANION_PUSH_369_MOBILE_CORRECTIONS_READY_FOR_REVIEW

The three findings from the first mobile client review are corrected. Independent review is still required. No ticket, native, integration, hosted, provider or release acceptance is given.

## Source

The primary is `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-1f65b158`, also available at `/Users/savargupta/.t3/worktrees/Unify/t3-1f65b158`. Its branch is `t3/mobile-client-implementation`.

The correction base is `116ce513803e6646d02dd394c8b76342d2b98624`, tree `bf5be7bda5a59f82749decde186ed7c4ebdcd8ff`. Code commit `1cc35ab83e4f90a3630afc8c95f15dd7cd1d0a73` has tree `5d04d63ee3185931353e7067c8e65d653507bef7`. The final evidence commit changes no application file. The root READY packet records that final commit and tree.

WEB remains unchanged at `8f3720af36c50768ff05d25804a69d28d36fd5c4`. Both integrations remain at mobile `19c2d0d6ea9d7b90d1bb0b10ae345cf6f2cbe83c` and web `623179cee615057de2c20c8c6216e192891dab4b`. No SQL, contract, dependency, configuration, locale or instruction file changed.

## Findings and repairs

| ID | Repair | Binding falsifier |
| --- | --- | --- |
| R369-MC-SPEC-01 | A session-ended control offers explicit Enable. This fresh consent retains the installation proof, reads current owned enrollment, and creates a new revision-checked operation for the current session. Old pending cleanup is archived securely and is never dispatched as the new account. | Normal online sign-out prevents a new explicit enable, old consent is replayed, or a transfer bypasses the service's current session/revision checks. |
| R369-MC-SPEC-02 | A notification ID resets the sheet mode and selects its stable reference. The internal saved-details view cannot take priority. Acknowledgment moves from the screen's sheet-state effect to the committed task/result body. | Saved details remains visible or the SDK response clears before the requested task or terminal result is committed. |
| R369-MC-SPEC-03 | Each new notification waits for an explicit refetch of the exact Checklist query. Cached absence cannot establish unavailable. A failed read shows the existing generic retry state. | A stale mounted list reports unavailable without a completed current read, or acknowledgment occurs during that read. |

The common account service is unchanged in this correction. The old one-argument enable path still refuses to replay retired consent. The new UI supplies the fresh-consent flag only on the explicit session-ended Enable action. Background refresh cannot transfer an installation. Missing/corrupt proof and revoked installations remain closed. The service still decides whether the previous session is removed and whether the expected revision is current.

The secure record retains old pending operations with their original account and session. It validates archived envelopes with the same proof and operation checks. The archive is not a dispatch queue. A transfer with no owned read uses its last known revision as an expectation, not as proof that the revision is current. The service validates it atomically. A rejected transfer keeps the cleanup archive. It needs another explicit consent; it does not retry automatically.

## Test order and sensitivity

The retained reviewer navigation cases were copied into a permanent acceptance file. Before the fix, two failed at assertions while three controls passed. The new session cases were written before their fix. All three failed at assertions on the unchanged candidate. All pass after the correction. No existing assertion was changed.

The held-read acknowledgment case and real-service user-action extension were written after the first fix. They are later coverage, not test-first proof. Restoring the old device/control code makes both local session recovery cases fail at the missing Enable assertion while the local baseline passes. Removing the details reset fails one acceptance assertion. Replacing the fresh read with a successful empty wait fails two acceptance assertions. Each controlled fault restores exact saved source bytes. The details fault first fails the acknowledgment assertion; do not describe it as a later visibility assertion.

An additional test found a defect in the first correction: after repeated enrollment and token rotation, an older revision hint took priority over the latest saved enrollment. The first simpler test passed because it did not create that hint. The expanded test failed with expected revision 3 and actual 1. The corrected priority passes. The real service also accepts the rotated installation's fresh consent at revision 4. These failed and passing records remain separate.

## Final checks

- Full CI on the committed code exits naturally with 0: main 1,607 passed, 29 skipped; DST 13 passed. No forceExit.
- The focused push set passes 75 cases, with five local opt-in cases skipped. It spans 14 files, including two skipped files. These results overlap the full suite.
- The owned real-service run passes four cases: one retained baseline and three actual rendered recovery flows. They use real local JWTs, the exact approved Edge code and persisted revisions. SDK permissions, tokens and SecureStore remain stand-ins. No provider request occurs.
- Normal types, locale parity and both native exports pass. No translation changed.
- Changed-file ESLint exits 0 with 27 warnings in the new copied test fixtures. This is not a warning-free or global lint result.
- The initial type run failed on an overly narrow inferred test transport return type. The test now declares the actual TransportReply type. No product assertion changed.
- The first formatter pass followed the repository ignore rule for test.tsx files. The final pass explicitly formats those owned files. They are force-added as permanent tests; the ignore file is unchanged.

Types and focused checks ran on the same source bytes before the code commit. Full CI, exports and locale parity name the committed code identity with an empty application status. `summary.json` and the input manifest provide exact counts and hashes. Failed records retain unique names. The earlier implementation and rejected review remain unchanged.

## Resources and limits

The only local project was `unify-push-369-mobile-correction-r1`, on ports 63610-63616. The root checked project/workdir identities before use and stop. Its exact readonly WEB export, runtime, caches and private credentials are removed. Successful startup output has an explicit local-key redaction receipt. Public failed logs are retained. Existing node_modules and the ignored dist export remain in the owned primary.

The single frozen cleanup capture confirms zero owned containers, volumes or networks. All 33 protected identities, states and complete mount objects match. Two arrays changed order only. All 18 volume names and seven nondefault network IDs match. All 14 IPv4/IPv6 binds pass. Strict network identity remains false.

The default bridge changed during the captured Resource Saver startup. The new bridge creation is inside `21:59:40.676772Z` to `21:59:42.060527Z`. The exact old/new IDs appear in the resync log. The first copied verifier assumed resync occurred after engine readiness. This run records resync just before readiness. Its failure is preserved, including a labeled replay. The corrected frozen verifier permits resync within that same startup interval through two seconds after readiness. It does not extend the resource interval or take another Docker snapshot. No manual Docker restart or prune occurred.

Native permission/storage, measured text layout, keyboard/focus, observed screen readers, actual iOS/Android delivery and hosted behavior remain unverified. The scoped correction is ready for a new two-axis review. Ticket #369 and native criterion 8 remain open.
