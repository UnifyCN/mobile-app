The two Standards recovery findings are corrected on both clients. Fresh review is required. SPEC review of the original feature candidate continues separately. No ticket, native or release acceptance is claimed.

Bases: mobile `586339c27a553a39157cc6661c8932f9f21c8cd8`; web `dd4aac9cc567cac13b5a4a987539f548a2dcb038`.

Finding authority: `review-371-STANDARDS-r1/report.md`, evidence commit `d96b7e91b2d403e6d2b84b2310bf47d7de09a1f9` in the independent review worktree. R371-STANDARDS-01 is P2. R371-STANDARDS-02 is P3.

R371-STANDARDS-01: the editor keeps the existing control lock for all unresolved outcomes. It now displays a loading message only during a request. Proposal reads use the existing Loading string. Local preparation/cancellation and saves use Saving. Result lookups use Checking. An idle pending, failed-lookup or confirmed-not-applied result keeps its recovery control without a false Saving message. The shared 300 ms delay is unchanged.

R371-STANDARDS-02: when the panel has a receipt, that receipt owns the recovery controls. The panel provides recovery only when it has no receipt. Standalone receipt cards retain their recovery controls.

The new tests use the actual Companion screen, task sheet/drawer, query cache, action store and transport. Scripted HTTP replies model failed apply/status and Undo/status requests. Each defect failed by assertion before its correction on both clients. The corrected tests check one recovery control, immutable receipt text, no extra apply/Undo, a preserved composer draft and locked approval while the result is unknown. A further test holds the proposal, apply and status requests in turn. It confirms distinct active loading messages. This active-stage control was added after the fix. Existing successful-save controls remain.

Fresh results, with overlapping focused counts kept separate:

| Gate | Result |
| --- | --- |
| Mobile test:ci | 1,619 passed, 31 skipped; DST 13 passed; natural exit 0 |
| Web full suite | 781 passed, 13 skipped; exit 0 |
| Final web edited test file | 24 passed; exit 0 |
| Normal types | Passed on both clients |
| Changed-file lint | No errors; mobile test retains the same 10 warnings as its base |
| i18n checks | Passed on both clients; no translation changed |
| Web build | Passed |
| iOS and Android bundle export | Passed; this is bundling proof only |
| Full web lint | Exit 1, 12 errors and 8 warnings; all five named files are byte-identical to the base |

Failures and changes to tests are retained:

- `mobile-01-red` and `web-01-red` fail on false Saving. `mobile-02-red-corrected-driver` and `web-02-red-corrected-driver` fail on two recovery controls instead of one.
- The first `mobile-02-red` and `web-02-red` are invalid red evidence. The test used the name Undo, but the existing control is named Undo this change. Only that driver name was corrected before the valid red runs.
- `web-changed-lint` found one new test-helper error. Calling the existing useServer helper inside an ordinary helper violated the hook naming rule. The fixture now assigns its server directly. The final edited file passes all 24 tests and lint.
- The first full mobile CI run failed in the existing successful profile-save test before its review opened. Its feature assertions were not changed. Review and Save now wait for their controls to be enabled. The next complete CI run passes. This does not establish the historical intermittent cause.
- Raw stage-control warnings and other fixture console output remain in the compressed logs. The three held-request releases were subsequently wrapped in act before the full runs.

Proof boundaries:

- The client tests prove rendered recovery states and the client request sequence. They do not prove database authorization, real Auth event ordering, native input, screen-reader speech or provider behavior.
- No SQL, migration, action store, service transport, dependencies, translation, CI, instruction file or native source changed in this correction.
- No local database, native runtime, provider, hosted write, deployment, PR mutation or push was used for this correction.
- All 90 original review authority files remain exact. The running SPEC reviewer retains its original source and runtime ownership.
- Owned client check processes exit normally. New dependency directories are independent copy-on-write copies with equal package files. They remain ignored in the root correction worktrees. Build outputs are local and ignored.

Run metadata and complete compressed logs are in this directory. The temporary root driver executed each listed command with its natural exit code. The initial full web run precedes the fixture-helper lint correction; the edited web file was run again after that correction. The production code was unchanged between those runs.

HANDOFF: COMPANION_PROFILE_371_RECOVERY_CORRECTIONS_READY
