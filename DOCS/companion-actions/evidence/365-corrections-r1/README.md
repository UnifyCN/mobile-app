# #365 corrections r1 - report and handoff (2026-10-27)

Implementation of review findings S365-001 and S365-002, with root corrections S365-003 and
T365-001 kept and verified. This is not acceptance. An independent review must follow.

Raw outputs are under `logs/` and `browser/` (ANSI colour removed, JWTs replaced by `<jwt>`,
gzip). `MANIFEST.txt` lists sha256, stored and raw sizes. `brief.md` and `resume-brief.md`
are the consumed copies of the root briefs (the account changed from Claude Second to Claude
Personal Opus 5.5 at high effort after a usage limit; the work continued in the same checkouts).

## Pins

| | Mobile primary | Web secondary |
|---|---|---|
| Path | `/Users/savargupta/.t3/worktrees/Unify/t3-67d6fc19` | `/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05` |
| Branch (verified) | `t3/companion-365-corrections-r1` | `feat/companion-task-edit-365-r1` |
| Start of this work | `2b930c2150ecf6451ed26e8bcb5eab5b6d533111` (merge of #365 candidate `f19298f5` into accepted `e30c1902`) | `aad7926beb0eca950f61d4ca212f4c41ba919d8a` (merge of accepted `269a5b93` into `00ff1c4c`) |
| Candidate commit | the commit that holds this file (parent `2b930c21`) | `21df0701f12f99b5d1dd8af246fa4b5f8acb41ae`, tree `b6808bd89e338c6b40fce5dae0218c511abdb669` |
| Accepted integration | `e30c1902280f3b127ff6231358d4d6883686b748`, ancestor | `269a5b9334caac72a32e6a340bf9b3a37b247c26`, ancestor |

Integration tips and `state.json` were read again just before the commits: unchanged, so no
merge was necessary. Nothing from #367, #370 or main outside integration was imported. The
root-owned source `t3-9f078e30` is still `f19298f5`, clean.

## Findings ledger

| ID | Severity | State | Where |
|---|---|---|---|
| S365-001 | blocker | fixed, test-first | web `commands.ts`: a line that has more quote marks than its one change uses is `multiple_changes` (a question, no write). Apply resolves the message again with the same rule, so a forged operation under it is 403. |
| S365-002 | should | fixed, test-first | migration (both mirrors): a `task.set_state` result records `before_waiting_reason` and `after_waiting_reason`; the receipt summary returns them only when recorded. Clients parse them as `waitingReasons` and show a `Waiting for: “Friday” → “Monday”` line on the command card and the drawer receipt when the reason changed. |
| S365-003 | (root) | kept, verified | the root's historical command card tests pass in the final runs on both platforms (mobile test:ci, web npm test). |
| T365-001 | (root) | kept, verified | the full service suite ran on a fresh owned stack with the committed `config.toml` (only project id and ports changed in a disposable copy, now removed): 184/184. The committed config is unchanged. |

No new copy was needed: the reply uses the existing `multiple_changes` text and the reason
line uses the existing `taskEdit.receiptChange`, `taskEdit.field.waitingReason` and
`taskEdit.empty` keys in all seven languages.

## Test order (red before green unless marked)

S365-001 (service boundary, real stack; run in the first session, logs kept):
1. `s001-red`: the new test failed by assertion on unchanged code (`Rename task "Phone" to "Mobile" and rename task "Bank" to "Credit union"` was interpreted as an edit).
2. `s001-green`: `edit_command_test.ts` 9/9 after the fix, including the seven-language documented examples, a plain quoted rename and a plain waiting reason as positive controls.
3. `s001-mutation-quotes`: `mutation_check.py` entry `commands_quotes_unchecked` (check removed) is RED.
4. `s001-mutation-apply-only` (+ `.diff`): interpret keeps the rule but apply skips it; the test fails by assertion because apply saved the forged compound title. This proves the test binds the apply path, not only the UI interpretation.

S365-002:
1. `s002-server-red`: new service test failed by assertion (`[undefined, undefined]` where `[null, "Appointment on Friday"]` was expected).
2. `s002-server-green`: 1/1 after the migration change. It covers apply, replay, status lookup, Undo, the conversation read after a later edit (receipt `current: false`, reasons kept) and a receipt with the fields removed (no invented fields).
3. `s002-mobile-red-setup-error`: the first mobile run failed because the primary had no `node_modules` (setup, not counted). `npm ci` from the committed lockfile (`mobile-npm-ci`).
4. `s002-mobile-red`: mounted test failed by assertion (`Unable to find ... Waiting for: (empty) → “Appointment on Friday”`).
5. `s002-mobile-green`: `taskEdit.test.tsx` 7/7.
6. `s002-web-red`: mounted test failed by assertion (same text). `s002-web-green`: 8/8 with the contract test.
7. Contract tests `receiptReasons.test.ts` (mobile and web): written after the code, not red-first. They cover a changed, a cleared, an unchanged and a legacy receipt.
8. Analytics assertion added to both mounted tests after green: capture calls are non-empty and contain no reason text.
9. `s002-client-mutations` (`s002_client_mutations.py`): four mutations (display rule removed, reasons not parsed, on each platform) are all RED by assertion; each file was restored byte for byte.

## Final gates (on the committed trees, natural exit)

| Gate | Result |
|---|---|
| Service suite, fresh stack `unify-edits-365-corrections-r1` (API 61611, DB 61612, shadow 61613, inspector 61614, content 3240) | 184 passed, 0 failed, 24 files, exit 0 (`final-service-suite`) |
| Web edge workflow steps: `deno check` of all entrypoints + shared, `deno test` of `supabase/functions/` | exit 0; 272 passed |
| Mobile `npm run test:ci` with `ACTIONS_DB_CONTAINER`/`ACTIONS_REST_CONTAINER` set to this project | 139 suites passed, 1 skipped (legacy probe); 1471 passed, 2 skipped; DST 13/13; exit 0. Both local-stack suites ran against the stack (not skipped). |
| Mobile typecheck, check-i18n, changed-file lint | 0; parity OK; 0 errors (11 earlier warnings). The first lint attempt passed no files (zsh word splitting) and is kept as `gate-mobile-changed-lint-zsh-quoting-error`. |
| Mobile iOS + Android bundle export | exit 0 (Android 5574, iOS 5709 modules); output removed |
| Web `npm test` | 59 files, 685 passed, 9 skipped, exit 0 |
| Web `tsc --noEmit`, `npm run build`, check-i18n, changed-file lint | 0, 0, OK, 0 errors |
| Web full lint | 12 errors, the same 12 as the integration baseline (`supabase/tests/companion-actions/support.ts` 4, `rollback_test.ts` 1, `supabase/probes/companion-context-362` 7). A first run while my disposable test copy existed showed 17 (5 duplicates through its symlinks); kept as `gate-web-full-lint-with-probe-copy`. |
| Migration mirrors | `20261028001530_companion_task_edit.sql` and its rollback byte-identical across repos (`cmp`). Chronological apply and reverse rollback ran in the real suite (`edit_rollback_test`, `steps_rollback_test`, `plan_rollback_test`, `create_rollback_test`, `rollback_test`); the #366 step functions and #364 plan functions were present on the stack after the suite (12 step functions). |

## Real web app in headless Chromium (`browser/`)

`next dev` on 127.0.0.1:3194 against the owned stack, disposable app-only columns
(`app-columns.sql`, never hosted), synthetic `.invalid` account (`seed.mjs`), `check.cjs`.
Commands typed with the keyboard in the real composer; model requests blocked and counted: 0.

- Desktop 1280: card 1 `Get a phone plan: Not started → Waiting` / `Waiting for: (empty) → “Appointment on Friday”`; card 2 `Get a phone plan: Waiting → Waiting` / `Waiting for: “Appointment on Friday” → “Appointment on Monday”`. Database row after each command matches (revision 2, 3). View task by keyboard (focus, Enter) opens the drawer, whose receipt shows `Updated the waiting reason` and the same reason line; Escape returns focus to `View task Get a phone plan`. After a rename command the card shows `This task changed after this` and keeps the reason line. No horizontal overflow.
- Reopened conversation at 390 px and at 200 % zoom (640 css px, scale 2): the card from the conversation read shows the same reason line and history notice; card inside the viewport (24-366 and 24-616), no overflow. Screenshots `narrow390-reason-card.png`, `zoom200-reason-card.png`, `desktop-reason-cards.png`.
- Run history: run 1 timed out on the reopen locator; run 2 recorded the cause (`*-failure.png`, `browser-results-run2-reopen-locator.json`); run 3 is final.
- Observation (earlier behaviour, not changed, not part of S365-002): a state-change receipt records no task title, so a reopened state card is named by the task's current title (`Prepaid plan: Waiting → Waiting`), while the same card in the live session keeps the title it was saved with. The saved values on the card (states, reasons) do not change. A reviewer may decide whether state receipts should record their title.
- Console: the known dev-mode hydration warning in `CompanionTasksEntry` (#361) and three 404 resource loads in dev; none from the changed components.

## Proof limits

- **local-stack**: disposable Supabase project only; no hosted schema, deploy, gateway, PostgREST cache or hosted RLS proof. No migration was applied outside the disposable stack.
- **scripted-client**: mounted Jest and Vitest tests use the contract stand-ins (both stand-ins now return the reason fields as the service does); they are not evidence of server rules.
- **browser**: one Chromium, local `next dev`, no Safari or Firefox, no screen reader. 200 % zoom is emulated by a half-size viewport at scale 2.
- **native**: no simulator, device, VoiceOver, TalkBack, Dynamic Type or native keyboard run (#370 owns the simulator now). The bundle export proves only that both bundles build.
- No live model, no paid service, no push, PR, issue or watch change, no integration write.
- Full `mutation_check.py` was not rerun; only the new entry was run (`s001-mutation-quotes`).
- Local Deno and Supabase CLI 2.118.0, not the CI versions. The Supabase changelog and CLI help were read before the first local write (`supabase-changelog.md.gz`).

## Resources

Owned stack stopped with `--no-backup` (0 containers, 0 volumes left); `next dev` on 3194
stopped; disposable test copies `supabase/probes/c365r1` and `supabase/probes/mut365`
removed; temporary env and seed files removed. Ports 61611-61614, 3240 and 3194 are free.
Other workers' stacks (#367, #370 and earlier) were not touched. `node_modules` installed in
the mobile primary by `npm ci` is gitignored and kept.

COMPANION_365_CORRECTIONS_R1_DONE
