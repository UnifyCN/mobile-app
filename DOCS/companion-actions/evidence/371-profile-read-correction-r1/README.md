R371-SPEC-01 is corrected in the mobile candidate. Independent review is still required. Native and full ticket #371 acceptance remain INCOMPLETE.

The base is `3f6ddbae8c477225e472a9de5519465e2d583240`, which contains the two Standards recovery corrections. Those corrections have independent Standards approval at that exact base and Web `5b27d12c6c7b8d5e93343b24ff5f027d4fd4c02d`. Web is unchanged by this read correction.

The SPEC finding is R371-SPEC-01, P2, in `review-371-SPEC-r1/report.md`, independent evidence commit `3f40e2b56738fe9ac8fceccbc0bf7dfa8601b10c`. Its report hash is `5e6db3099af1bec329219d8b6977a635aca0fe0bc5a83a88555f91bcb0ecf4ab`. The original feature mobile candidate is `586339c27a553a39157cc6661c8932f9f21c8cd8`. Its service and SQL bytes remain unchanged here.

The requirement is: Reconcile affected profile-driven views on both clients. The original fresh local-service reproduction saved Ontario, then a delayed initial UserContext read restored British Columbia. The installed query library reuses an in-flight initial read during invalidation when the cache has no data.

The correction changes only `useTaskActionStore` reconciliation. It cancels each affected `onboardingProfile` and `userInfo` query before invalidating it. The invalidation starts a fresh read. A new ownership check after cancellation prevents an old account/session from starting this later work. All other invalidations and profile consumers remain unchanged. The query library excludes a canceled result from its cache even when the underlying SDK request finishes. The SDK itself is unchanged.

Permanent tests use the actual UserProvider/UserContext, useUserInfo, getUserInfo, useOnboardingProfile, getOnboardingProfile, profile panel, action hook/store/transport and installed query library. The SDK row responses and authenticated-action HTTP responses are scripted. Each read captures its old row before it is held. Saving changes the scripted authoritative row and returns a receipt through the real client parser.

Before the production correction, the two initial-read cases failed on the expected rendered Ontario value. The cached background-read control passed. After the correction, all three passed. Additional same-account Auth refresh and held-cancellation/account-replacement controls were added after the fix. The final file has four passing cases. It also checks both query caches, the retained draft and exactly one explicit profile write. Releasing an old read cannot restore its old province.

The owner-check fault removes only the post-cancellation ownership check. Its account-replacement case fails because one extra old-account invalidation occurs after B signs in (10 before release, 11 after). This is a cache-scope assertion, not proof of cross-account data disclosure. The original source bytes were restored exactly before the full gates.

Final results are separate and overlap:

| Gate | Result |
| --- | --- |
| New mounted file | Four passed, exit 0 |
| Mobile test:ci | Main 1,623 passed, 31 skipped; DST 13 passed; natural exit 0 |
| TypeScript | Passed |
| Changed-file ESLint | Passed with zero warnings |
| Translation parity | Passed; no translation changed |
| iOS and Android export | Passed; bundling only |
| Web and service suites | Not rerun for this mobile-only change |

All test logs, including invalid setup runs, remain compressed in this directory. Important failed/setup records:

- `mounted-red` called a private helper as an exported hook. It is invalid red evidence. The helper call was removed because the real useTaskProgress hook already performs that scope cleanup. Only `mounted-red-corrected-driver` is the valid two-failure/one-control red.
- `mounted-lifecycle-green` had two fixture failures after new Auth controls were added. Scripted session events lacked the email required by the real UserProvider. No production fix was made for that fixture error.
- `mounted-final` and `mounted-lifecycle-corrected-driver` also retain renderer setup failures from wrapping the synchronous native render inside an asynchronous act. The final helper renders synchronously and flushes the Auth effects immediately afterward. No defect assertion was removed or relaxed.
- Earlier successful runs retain their React act warnings. The final four-case standalone run has no console output. The full suite retains existing console warnings from other fixtures.
- The first mutation-log scan assumed absolute counts zero and one. The actual assertion compares before and after counts, ten and eleven. `mutation-result.json` records the corrected scan. This evidence-scan error changed no product or test assertion.
- The first worktree precheck ran before WTB completed. A later read started before Git finished populating the new root. Both setup errors preceded dependency or product writes. The completed worktree and dependency equality checks passed before any test.

No existing test was edited by this correction. The new test file is force-added because the existing app ignore rule matches new test.tsx names. No ignore rule changed. The earlier successful-save test readiness changes belong to the preceding Standards correction.

Proof limits:

- The new tests prove query result reconciliation, cache ownership, draft retention and explicit client request count through scripted boundaries. They do not prove RLS, real Supabase SDK Auth order, provider behavior, hosted schema or a device.
- The original SPEC review's 20 service cases and actual browser/mounted Web checks remain supplied evidence. No service, SQL, Web or data-service source changed here. Exact service-byte preservation is recorded. No Docker or native runtime was used by this correction.
- The original review's Docker bridge identity comparison remains unresolved and false for strict preservation. This correction does not normalize or close that result.
- Native criterion 8 and #371 native flows remain part of the ticket. No acceptance or release is granted.
- Earlier source candidates and all 134 previous authority files remain exact. The root-owned dependency copy and generated bundle output remain ignored in this correction worktree. All owned check jobs exited naturally. No push, PR mutation, integration edit or hosted write occurred.

HANDOFF: COMPANION_PROFILE_371_READ_CORRECTION_R1_READY
