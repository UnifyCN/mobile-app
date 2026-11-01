# #370 evidence

Logs are gzip-compressed (`*.log.gz`, `*.json.gz`); `SHA256SUMS` lists each file's size and
hash. Credentials were never written to a log (the stack env was evaluated in the shell only;
a grep for JWTs and secret names over every log found none). Failed and superseded runs are
kept under their own names.

Stack: disposable local Supabase project `unify-details-370-r1` (API 61331, DB 61332, shadow
61333, inspector 61334), content stand-in port 3188, through a temporary edit of the web repo's
`supabase/tests/companion-actions/supabase/config.toml` (restored before the commit). Mobile
real-stack runs named `ACTIONS_DB_CONTAINER=supabase_db_unify-details-370-r1` and
`ACTIONS_REST_CONTAINER=supabase_rest_unify-details-370-r1`.

## Test order, honestly

| # | Slice | Red | Green |
|---|---|---|---|
| 1 | Backend public boundary, `details_test.ts` (12) | `b1-red-details`: 12/12 fail on the unchanged schema with an empty placeholder migration. 5 fail by assertion; 7 fail inside the `rememberedBy` helper, which throws on the unchanged service's `422 unsupported_operation` (setup-level, not an assertion) | `b1-green-details-run1`: 11/12, the failure was a test-helper defect (postgres returns `bigint` as a string; helper now casts), no product change. `b1-green-details`: 12/12 |
| 2 | Rollback, `details_rollback_test.ts` (2) | Not red-first: written after the rollback script. First run passed (`b2-rollback-run1`) | same |
| 3 | Whole backend suite | `b3-backend-all-run1-red-gate-grant`: 123/124. The accepted #361 test "API roles cannot execute the action SQL" found a real conflict: the first design's RLS gate function was executable by `authenticated`. Redesigned: RLS is owner + live only; rag-query checks the gate with its service-role client | `b3-backend-all-run2` 124/124; final `b5-backend-all-final` 14 files, 124 passed, exit 0 |
| 4 | rag-query saved-details read and `[REMEMBER]` (3, then 4) | Written after the implementation; red verified by running the new tests against the base source files (`rq-red-details-base-source`): 2 fail by assertion, the failed-read guard passes on base | `rq-green-details` 36/36, then 37/37 with the gate-off case (in `g7-edge-deno-test`) |
| 5 | Mobile stand-in, `savedDetails.test.tsx` (7) | Not red-first (written after the components). `m1-mobile-details-run1` 6/7: a real defect, the sheet header and the review panel both rendered "Remember this detail?" as a header (panel copy removed). A second failing run (test defect: the second send legitimately clears the composer) was overwritten and is not preserved | `m1-mobile-details` 7/7 |
| 6 | Mobile real local stack, `companionActionsLocalStack.test.tsx` (+1 #370 case) | Not red-first | `m2-mobile-localstack-run1` 4/4; final bytes `m2-mobile-localstack` 4/4 |
| 7 | Web mounted, `SavedDetails.test.tsx` (6) | Not red-first. `w1-web-details-run1` 5/6: test isolation (the offline case left React Query's online manager off; fixed as in the #366 tests) | `w1-web-details` 6/6 |
| 8 | Real browser (Chromium) against the real stack, `scripts/verify-companion-saved-details.mjs` (11 checks) | `w3-browser-details-run1-32px`: 10/11, a real defect: web detail buttons measured 32px tall | `min-h-11` added: `w3-browser-details` 11/11 |

## Deliberate faults (each restored; must fail by its named test)

- Backend (`b4-backend-faults`): removal without confirmation, no revision check, RLS reading
  removed details, and the handler without the profile-fact check each fail their named
  test. Two survive, with reasons: `ui_control` may create a detail (SQL) is masked by the
  edge registry, which refuses it first (403); removing the details lock from the draft
  re-check only changes which refusal a racing approval gets (`detail_exists` instead of
  `needs_review`) because the insert takes the same lock, so one detail is still saved.
- Mobile (`m3-mobile-faults`): removal without confirmation, edit at the next revision, blind
  retry after an unknown outcome, Undo of a save without confirmation, and detail text reaching
  analytics (store and builder together) fail. Each analytics half alone survives because the
  other half (no text in the event; allowlisted builder) still protects it.
- Web (`w2-web-faults`): the same five, all fail. The draft-not-in-store fault may fail by a
  runtime error rather than an assertion; not separated.

## Final gates (after the last code change)

- Backend real local stack: `b5-backend-all-final` 14 files, 124 passed, exit 0 (12 + 2 new;
  110 accepted #361/#363/#366 tests whose `migrate()` now also rolls #370 down and up).
- Edge (Deno 2.7.14): `g7-edge-deno-check` all entrypoints + `_shared` exit 0;
  `g7-edge-deno-test` 270 passed, exit 0.
- Web: `g2-web-npm-test` 55 files, 670 passed, exit 0; `g5-web-tsc` (incremental off) exit 0;
  `g5-web-i18n` parity OK; `g5-web-lint-changed` 17 changed app/test/script files, 0
  problems; `g6-web-build` exit 0. Full lint `g5-web-lint-full`: 21 errors, 1 warning, the
  tracked baseline (12 base + 9 #366 Supabase-test diagnostics); earlier runs with 26 errors
  (my test `any`s) and one new warning are kept and were fixed without rule changes.
- Mobile: `g1-mobile-test-ci` main 136 suites passed (1 skipped), 1,449 passed, 6 skipped,
  then DST 2 suites, 13 passed; natural exit 0, no forceExit, `ACTIONS_*` unset (the one new
  skip is the #370 local-stack case); `g3-mobile-typecheck` exit 0; `g3-mobile-i18n` parity OK (1900 keys);
  `g3-mobile-lint-changed` 14 files, 0 errors (warnings are the existing `jest.mock`
  `require()`/import-order pattern; the local-stack file is back to its base count);
  `g4-mobile-expo-export` iOS and Android Hermes bundles exit 0 (both contain the new copy).
  The export proves bundling only, not device behaviour.

## Not proven

Hosted schema/deploy/RLS, a live model, store binaries, simulators or devices, VoiceOver or
TalkBack, Safari/Firefox, 200% zoom, the Next.js shell and cookie proxy in a browser.
