# #367 implementation handoff (r1, resumed on Claude Personal)

Implementation of mobile-app#367 only. Not ticket acceptance, integration or release:
independent review must follow. Design and order: `DOCS/companion-actions/367-task-remove.md`.

## Checkouts and pins

| | Mobile primary | Web secondary |
|---|---|---|
| Path | `/Users/savargupta/.t3/worktrees/Unify/t3-9fce36e0` | `/tmp/unify-merge-361-web` |
| Branch | `t3/companion-367-implementation` | `t3/companion-367-implementation-web` |
| Base (accepted integration) | `e30c1902280f3b127ff6231358d4d6883686b748` | `269a5b9334caac72a32e6a340bf9b3a37b247c26` |
| Code candidate | `3b98a9a3` (feat, #367) | `9c48776abda3b46f468b8b4599602f43c5e07cc1`, tree `5a3568be96ea919837055ed9be53df8392da2ac7` |
| Evidence | the commit after `3b98a9a3` (this file) | none |

- Both bases are ancestors of the candidates (`git merge-base --is-ancestor`).
- Integration tips read before return: mobile `e30c1902`, web `269a5b93`, unchanged from
  the bases, so no merge was needed. No unreviewed sibling (#365, #370) was imported.
- Migration and rollback mirror byte for byte (git blobs): migration `308eeed3`,
  rollback `1dacca6a`.

## Finding ledger (defects found by my own tests during this work; all fixed)

| # | Defect | Found by | Fix |
|---|---|---|---|
| 1 | Mobile review passed `count` but the strings interpolate `{{n}}` (i18next `count` is reserved): "Steps kept as history: " with no number. | reading the code; then mutation m9 proves the test binds | `{ n: ... }` |
| 2 | Mobile removal command sent before the Checklist read finished replied "I couldn't find a task named ..." (false). | m1/m2 (card missing; reply shown) | titles are `null` until read; the send waits up to 5 s, then says it could not open the review |
| 3 | A review opened just before another device removed the task stayed visible (confirm disabled). | m7 red (assertion), web mutation w3 | a removed task shows no review and no removal control (both clients) |
| 4 | Two "Remove task" controls while an Undo conflict offered its own reviewed removal. | accepted mobile `taskCreate.test.tsx` in g-m-testci | the removal entry hides during `undo_review` (both clients) |
| 5 | Web review buttons were 32 px tall. | browser b1 | `min-h-11` (44 px) |
| 6 | Accessible name "Remove task: X" while the visible text read "Try again". | review of the code | the name follows the visible text after a failure (both clients) |

Not a defect, test changed: m4/m5 expected the conversation card to lose its Review
control after a removal through a separate panel review and its Undo. Cancel writes
nothing by design, so that card's review stays open; the test now confirms through the
card's own review (m5 green).

## Test order and raw results (logs here; ANSI stripped)

Backend (web repo, real local stack, `run.sh`):
- `s1-red-remove.log`: 15/15 red by assertion (`unsupported_operation`), no crash.
- `s1-green-remove-run1.log`: 15/15 green.
- `s2-red-rollback-empty-down.log`: the empty-placeholder red **crashed** instead of
  failing on an assertion; not counted as red evidence. `s2-green-rollback.log`: 2/2.
- `s3-backend-all-1.log`: **invalid**. It overlapped with edits to the same files
  (stale source); its 3 failures (`boundary_test`, `create_test` used `task.remove` as an
  unregistered example; `remove_test` bare-command assertion) did not reproduce.
- `s4-fix3.log`: sequential rerun of the 3 files after the 2 test updates: 43/43.
- `f1-backend-all.log` (final, after all code): 21 files, **172 passed, 0 failed**.

Mobile real stack (`planLocalStack.test.tsx`, #367 block):
- m1-m4 red (card missing: titles race and fixture; text expectations), m5 3/3, m6 red
  (new stale-card test, text), **m7 red** on defect 3 (assertion), m8 4/4 green,
  **m9 mutation** (`count` restored): fails on "Steps kept as history: 1" as intended.
- `f2-mobile-planlocal.log` (final, fresh reset, whole file): **14/14**.
- `f5-mobile-actionslocal.log` (accepted file, after its own reset): **3/3**.

Web real stack (`TaskRemovalLocalStack.test.tsx`, mounted pages, real function and DB):
- w1 2/3 (fixture revision 0 vs 1, a test error), w2 3/3, **w3 mutation** (stale-review
  guard reverted) fails as intended, w4 3/3 from a fresh reset.
- `f3-web-localstack.log` (final, with the accepted `PlanLocalStack`): **12/12**.

Web browser (`scripts/verify-companion-task-remove.mjs`, headless Chromium, keyboard):
- b1 10/12 (defect 5; focus fell to `<body>` because the fixture had no drawer), b2 12/12
  with the real `TaskDrawer`. `f4-browser.log` / `f4-browser.json` (final): **12/12**.

## Final gates (after the last code change)

| Gate | Result |
|---|---|
| Mobile `tsc --noEmit` | exit 0 (`f9-m-tsc.log`) |
| Mobile `expo lint` | 0 errors, 85 warnings, none in a changed file (`f9-m-lint.log`) |
| Mobile `check-i18n` | parity OK, 1961 keys per locale |
| Mobile `test:ci` | main 137 suites passed, 1 skipped; 1451 passed, 19 skipped. DST 13 passed. Natural exit 0, no forceExit (`f10-m-testci.log`). Local-stack files skip without the environment. |
| Web `eslint` | 12 errors, the known baseline (context_rls_test 7, rollback_test 1, support.ts 4, all pre-existing lines); 0 warnings after removing the gitignored function copies run.sh makes (`f6-web-lint.log`) |
| Web `tsc --noEmit` | exit 0 |
| Web `check-i18n` | parity OK, 2639 EN keys |
| Web `npm test` | 58 files; 678 passed, 12 skipped (`f7-web-test.log`) |
| Web `npm run build` | exit 0 (`f8-web-build.log`) |

## Proof limits

- Jest/RNTL and jsdom: rendered components with the real client, store, contract and
  query cache. Model stream, Sanity content and (mobile) Checklist rows are stand-ins.
- Real local database: the real edge function, migrations, RLS and HTTP on my disposable
  stack. Not hosted Supabase; no hosted permission was proven.
- Browser: headless Chromium, the real panel in the real drawer, keyboard only, 390 px,
  Arabic RTL. Not the Next.js app shell, Safari/Firefox, 200 % zoom or a screen reader.
- **No native or device proof**: no iOS/Android build, simulator, VoiceOver or TalkBack
  run. Mobile focus moves call `AccessibilityInfo.setAccessibilityFocus`, untested on a
  device. Mobile mounted tests do not observe AT focus.
- Old-conversation detection on mobile happens on the next progress read (opening the
  task, focus, refresh); a card that has not re-read still offers its review, which then
  opens on current progress and offers nothing for a removed task. Proven in m8/f2.
- The Undo `not_removed` and `removed_again` replies are proven at the HTTP boundary
  (remove_test); the mounted clients prove only `already_undone` for a stale Undo.
- #368 reminders are out of scope: no reminder schedule exists; "Reminders stopped" is 0
  in every client run. The trigger stopping pending reminders is proven in remove_test.

## Shared-function composition (for #365 / #370)

Eight shared functions are replaced from their #366 bodies plus marked #367 lines (list
in the design doc). A later migration replacing any of them must start from the #367
body. Rollback order: #367 before #366.

## Owned-resource cleanup

- Stack `unify-actions-367-r1` stopped with `supabase stop --no-backup` after checking
  its labels: 0 containers, 0 volumes. Ports 61571-61574, 3232, 3190, 8096 free. No
  Metro, simulator or native tool was started.
- Web `supabase/tests/companion-actions/supabase/config.toml` restored byte for byte
  (no diff); the gitignored function copies removed. Pre-existing `.branches/` and
  `.temp/` (dated before this work) left in place.
- No push, PR, issue, watch, integration, hosted, deploy, paid-service or live-model
  action. Shared roots and integration checkouts untouched.

COMPANION_367_IMPLEMENTATION_DONE
