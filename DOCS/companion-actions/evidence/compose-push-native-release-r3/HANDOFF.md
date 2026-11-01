# Companion release composition R3

Both local candidates are committed for one fresh independent SPEC/STANDARDS review. No ticket or release is accepted. No push, PR write, production connection, provider send, deployment, account switch, child agent or native service ran. Impeccable remains 3.9.1. All 99 skill file hashes match.

## Exact candidates

Mobile path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-33359ffe`. Branch: `t3/compose-push-native-release`.

- Base: `17a12a7f75477f33f93805fe9894a61847ed538f`, tree `d33770a5abe253cf6b9de858a6fe142dd76105a0`.
- Composition merge: `150c759abe6bedf919eaf0b7559b59803a0adb30`, tree `d9d23632d9b09821b69618e30dd0ab18940e1793`.
- Merge parents: Node `4358432cdd02d0cc01fba6d15d7e9813dd44fb97` and Android `0e8af1dc8b4efb307047c364d186b0f178d1d732`. Both remain ancestors. The source branches remain intact and clean.
- Final Mobile code head: `dfcb860c9d5c04f5578bab245076cb1cf36e6bdd`, tree `7419f870cc6f4674d9cc10ddac68dd00946c30ae`, parent `150c759abe6bedf919eaf0b7559b59803a0adb30`.
- This handoff is in an evidence-only child of that code head. The final response names the wrapper head. Resolve its exact head/tree/parent with `git log -1 --format='%H %T %P'`. No self-referential commit hash is asserted here.

Web path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359`. Branch: `fix/companion-push-operation-release-root`.

- Base: `fff4a93ae58c9505f166b2188f7456e7435dc824`, tree `fcc6d22f277129f45a27c8f59db528f5b383a1f4`.
- Final Web code head: `c3635c77b20df22923d07b267a4a0aa60245fe54`, tree `2d49436a996c3e205b2c78a88a6807ed4591fd1f`, parent `fff4a93ae58c9505f166b2188f7456e7435dc824`.
- Final Web evidence head: `da2260ab7ea858ad91b9280d1f565cb27159428d`, tree `9b21408df9bfba07f6f44310e7557f1e422ed37b`, parent `c3635c77b20df22923d07b267a4a0aa60245fe54`. Its only change is the short Web evidence pointer.

`code-candidates.json` and `changed-mobile.txt` / `changed-web.txt` record the code sets. Mobile has 512 changed paths from its base, including 46 non-evidence paths. Web has 39 code paths from its base. The final evidence wrappers add reports only. The final staged Mobile candidate has 606 changed paths, including 94 new R3 evidence paths. The final Web candidate has 40 changed paths. `integrations-at-handoff.json` records a fresh read of both actual integrations. They remain clean at the exact two base heads. Neither integration changed.

## Final changes

The primary fast-forwarded to the Node source and merged the Android source with both parents retained. The tracked worker closure, new migration and rollback mirror Web. All 27 worker files match. All twelve Companion migration/rollback pairs match. All eleven deployed migrations remain byte-identical to both base authorities. All 92 pre-existing Mobile migrations remain byte-identical. The frozen worker lock had been ignored in Mobile; its source hash `7264c84a0808153ed2eec3db856de15423766c0c1f8379823cc7c6b556d51717` was verified and the file is now tracked.

The worker now reads one fixed packaged CA and verifies its SHA-256 before connection. Postgres.js receives `ca` and `rejectUnauthorized: true`. Hostname verification remains active. There is no request-selected trust path or new environment forwarding. The public CA hash is `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. Its supplied file matched before use. The public source is [Supabase's CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). Driver behavior was checked against the pinned 3.4.9 source and [Postgres.js SSL documentation](https://github.com/porsager/postgres#ssl).

The first real login audit proved that PUBLIC granted the worker account-deletion authority despite NOINHERIT. The new undeployed migration now removes effective PUBLIC SECURITY DEFINER calls outside the required helpers. It retains access for the three existing API roles and records only added direct grants for rollback. The local fixture changed two PUBLIC ACLs: `delete_user()` and its fixture-only trigger helper. The final audit exposes only `lock_session_authorized`, `session_authorized` and `companion_step_parent` as callable definer functions. Hosted function ownership and ACLs are not inferred from this fixture. Root must audit them before any hosted migration or LOGIN enablement.

Reminder entry validates its explicit offset, calendar and zone name without using device rules to override the selected instant. The server still strictly validates the approved zone/instant/wall tuple. Review cards, the editor, saved reminders and receipts use the existing canonical wall and instant together. Their difference supplies the displayed UTC offset. Historical rows are not rewritten. A legacy receipt without wall data shows its exact UTC instant and saved zone. No time-zone SQL migration was added. A stale Android large-text assertion now checks the R15 radio's `checked` state.

## Fresh local checks

The falsifiers were unauthorized access, failed required queries, stale authorization after lock waits, changed approval identity/instant, incorrect review or receipt time, missing frozen files, invalid TLS acceptance, an oversized package or changed protected resources.

| Subsystem | Result and proof boundary |
| --- | --- |
| Exact SQL login | Required read, row-lock, enqueue, recovery and finalization query shapes pass. Auth/history/conversation reads, enable-column writes, deletes, truncation, fabricated-claim writes and account deletion are denied. Numeric sequence nextval/setval probes are denied too. No provider or hosted path runs. |
| Session races | The test observes real database blockers for helper-first deletion, deletion-first refusal and expiry during a lock wait. All three pass. This does not verify hosted Auth configuration. |
| Rollback/reapply | Exact unknown delivery, attempt, event, suppressed delivery and revoked-enrollment rows match before and after. PUBLIC function grants restore and reapply correctly. The role returns to NOLOGIN with no password. |
| Permission inventory | 67 relations and 216 non-system functions are inventoried. Raw PUBLIC sequence privileges exist on two Cron sequences, but the login cannot use them, including by numeric ID. Grant existence alone was not treated as access. |
| TLS | Production options pin the supplied CA. Real local driver handshakes accept a trusted synthetic certificate, reject that certificate with the production CA, and reject a wrong hostname. The positive server is a synthetic PostgreSQL-protocol TLS fixture. No hosted TLS connection is claimed. |
| Reminder compatibility | Both clients test the binding Vancouver case: an old device maps 17:30Z to 09:30, but a canonical server-approved wall of 10:30 with that instant displays 10:30 UTC-07:00 in review and saved receipt text. The submitted instant is unchanged. A historical 18:30Z / 10:30 wall displays UTC-08:00. These are controlled client/transport tests, not hosted time-zone proof. |
| Strict SQL time validation | The unchanged real local validator rejects a New York DST gap and a wall/instant mismatch, and accepts a valid tuple. The local PG17.6 image still maps Vancouver's sample to 18:30Z. It does not prove the prepared hosted 17.11.0.011 update. |
| Mobile normal tests | Main: 161 suites pass, five skipped; 1,637 tests pass, 40 skipped. DST: two suites and 13 tests pass. The first full run's stale selected-state assertion failed and remains recorded. |
| Web normal tests | 82 files pass; 847 tests pass and 19 are skipped. |
| Normal static checks | Both client type checks and locale checks pass. Changed-file lint has zero errors. Mobile retains 80 warnings on the measured changed set. Web full lint retains twelve errors in unchanged probe/support files. `web-full-lint-errors.json` maps every error and the base-byte comparison confirms those files are unchanged. |
| Native exports | Both iOS and Android JS/assets exports pass. No simulator, emulator, TTS, ADB or native product run occurs. |
| Node and frozen packages | All nine Node configuration/process tests pass. Deno supervisor types pass with frozen cached dependencies. Both runtime manifests pass binary/hash/path integrity and corruption refusal controls. |

The supplied Auth management values remain supplied facts: maximum lifetime 0, inactivity 0, single-session false, JWT 3,600 seconds. No new expiry value, policy gate, renewal contract or capacity reservation was introduced. The actual values still require root's later live verification and policy renewal before activation.

## Complete local function packages

`npm run build` remains ordinary `next build`. Runtime preparation is a separate command. The Vercel build command prepares the runtime before the build. The existing Sentry Cron is unchanged. No push Cron is added.

Final frozen Linux Deno 2.9.8 runtime: 105,840,961 bytes, 621 files. The executable is 96,055,992 bytes, mode 0755, SHA-256 `368bca08999e02c6911b8f248167b582276b1f547db5712b6e736d7eda1dbda7`.

| Route | Complete local trace, route and manifest files | Bytes | Headroom below 250,000,000 |
| --- | ---: | ---: | ---: |
| Dispatch | 785 | 107,840,376 | 142,159,624 |
| Readiness | 785 | 107,840,440 | 142,159,560 |

Each package contains all 635 required runtime/source entries. All staged Linux file hashes match. Neither trace contains the macOS test package, SQL cache, test source or environment files. `audit-packages.py` measures all traced files plus route and trace files, not only Deno. The full per-file hashes and sizes are retained. These are complete local Next trace packages. Managed Vercel packaging, Linux execution and descendant cleanup on Vercel remain unproved.

## Supplied evidence and retained failures

R15 HANDOFF, REUSE and raw evidence were imported with unchanged bytes from the exact Android parent. They supply bounded earlier native speech and cleanup evidence. New time labels have no fresh native speech proof. No iOS, provider, hosted, full orientation/locale or release result is inferred. Historical SDK and default-bridge evidence gaps stay open.

Raw command logs retain their original whitespace. The unrestricted Git whitespace check reports that log whitespace. Source and authored-report whitespace checks pass. All failures remain. `setup-failures.md` explains the path mistakes, absent Auth migration, system-Deno/frozen-lock refusal, failed PUBLIC access control, stale large-text assertion, TLS fixture hang/type error, package trace failures and invalid array-order audit. The final package was prepared again after the source correction. The native test cache was preserved and hash-compared in Mobile before removal from Web. No failed run was replaced in place.

The later sequence test named red-r2 passed: it disproved the suspected numeric-ID access problem. Its first attempt refused the CLI's postgresql URL scheme before connection; the test's required postgres spelling then passed. No extra permission change was made. A status query was attempted before startup completed and returned no JSON. Its ignored raw output remains.

## Cleanup and review reuse

Only the leased `unify-companion-push-vercel-r2` project ran. Its database, Auth migration helper, network and volumes are absent. All ten IPv4/IPv6 reserved binds pass. All 33 protected containers retain their exact IDs, labels, complete mount objects and runtime states. Only mount-array order differed in the first audit. `cleanup.json` records the canonical object comparison.

The default Docker bridge changed from `98f249abd8919a2e783823086a9e125a160d70faee25d9cbfa995d1be612acef` to `3e96b364911d96fb5094cffe74aa6babc8c71494a3a4e27a84347a8760ede993` during this task. No Docker reset/restart or direct bridge operation ran. Its cause is not assigned. The before/after records and the first-project stop record remain. This is a fresh unresolved infrastructure transition. It does not erase the local SQL observations or close the older bridge gap.

Ignored caches remain in Mobile `.runtime/linux-x64`, `.runtime/darwin-arm64` and the owned probe directory. Web retains `.runtime/linux-x64` and the pinned native builder executable only. The probe's ignored local logs and test environment remain private. No local credentials enter this report or these commits. A later SQL run requires a fresh owned project bootstrap, Auth migrations, the baseline, the prerequisite and the ordered files listed in `sql-applied-files.json`. No resource starts automatically from this handoff.

Read-only/runtime checks from the Mobile root:

```sh
node unify-front-end/supabase/workers/companion-push/check-package.mjs
COMPANION_TEST_DENO=/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-33359ffe/unify-front-end/supabase/workers/companion-push/.runtime/darwin-arm64/deno node --test unify-front-end/supabase/workers/companion-push/node-adapter.test.mjs unify-front-end/supabase/workers/companion-push/owned-process.test.mjs
python3 DOCS/companion-actions/evidence/compose-push-native-release-r3/audit-packages.py
```

The package checker temporarily corrupts and restores only its owned manifest as a refusal control. The audit writes only its own evidence output. Use the Mobile local runtime for worker tests. Do not create the Web local test cache before a release package build. From Web, `npm run prepare:companion-push` followed by `npm run build` recreates the final Linux preparation/build sequence without a native service.

A fresh independent SPEC/STANDARDS review must inspect both final candidate heads and the PUBLIC ACL correction. Root still owns hosted ownership/ACL checks, policy renewal, verified aggregate provider capacity, production CA connectivity, the server time-zone update and later platform/native/provider proof. No independent verdict or acceptance is asserted here.

COMPANION_RELEASE_COMPOSITION_R3_DONE
