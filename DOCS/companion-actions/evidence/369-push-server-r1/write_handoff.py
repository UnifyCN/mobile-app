from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
pins={r['name']:r for r in json.loads((HERE/'implementation-pins.json').read_text())}
summary=json.loads((HERE/'summary.json').read_text());mirrors=json.loads((HERE/'mirrors.json').read_text());contract=json.loads((HERE/'client-contract-mirror.json').read_text());cleanup=json.loads((HERE/'cleanup-comparison.json').read_text())
m=pins['mobile'];w=pins['web'];migration=next(r for r in mirrors if r['path']=='migrations/20261030181040_companion_reminder_push.sql');rollback=next(r for r in mirrors if r['path']=='rollbacks/20261030181040_companion_reminder_push.down.sql');deadlines=[d['ms'] for r in summary['new'] for d in r['deadlines']]
text=f'''# Companion 369 server-stage handoff

The server/schema stage is implemented and committed. This is a candidate for independent review. It does not accept ticket 369, the MOBILE client stage, native criterion 8, hosted behavior, provider behavior, or a release.

## Fixed candidates

| Repository | Worktree and branch | Implementation HEAD | Tree | Base and base tree |
|---|---|---|---|---|
| MOBILE | `/Users/savargupta/.t3/worktrees/Unify/t3-56bad9ac`, `{m['branch']}` | `{m['head']}` | `{m['tree']}` | `{m['base']}`, `{m['base_tree']}` |
| WEB | `/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root`, `{w['branch']}` | `{w['head']}` | `{w['tree']}` | `{w['base']}`, `{w['base_tree']}` |

MOBILE resolves to `{m['path']}`. WEB retains its assigned branch and every earlier commit. Both began clean at the exact required pins. No checkout was created or switched. The disposable probe is a read-only reference, not an integration parent.

The MOBILE implementation commit above contains the SQL and shared types. The enclosing final evidence commit adds this handoff and evidence only. A file cannot contain its own enclosing commit hash. The ignored terminal `final-pins.json` and final response record the final MOBILE evidence HEAD/tree and the unchanged final WEB HEAD/tree. `implementation-pins.json` records the fixed code pins above.

## Fixed contract for the later MOBILE stage

Read [CLIENT_CONTRACT.md](CLIENT_CONTRACT.md) for complete request/response examples and errors. Its authoritative WEB copy is `supabase/functions/companion-actions/PUSH_CONTRACT.md`. Both clients use the existing authenticated `companion-actions` version 1 endpoint. Account and session come from the validated JWT.

- `push_apply` accepts `push.enroll`, `push.disable`, or terminal `push.revoke`. It requires an operation ID, `ui_control` authority, installation proof, and the expected enrollment revision. It uses the common operation lock, receipt table, replay, conflict, and `status` rules.
- `push_read` returns only the current owned, proved enrollment. It returns no token, proof, or session ID. Historical receipts are not current enrollment state.
- `push_resolve` accepts only a delivery ID and language. It checks account-owned delivery first, then current task access. Another account's shared published task ID supplies no authority. Removed or inaccessible targets return unavailable.
- Payload data contains only `type=companion_reminder` and the delivery UUID. Generic translated title/body text supports all seven locales. No private task title or reason enters the provider payload.

Client types are exact byte mirrors at MOBILE `unify-front-end/services/companionActions/pushContract.ts` and WEB `lib/companionActions/pushContract.ts`. Their SHA-256 is `{contract['sha256']}`. The later client must parse push receipts separately from the old task-only receipt parser.

Before registration, persist an independent random installation UUID and 256-bit secret together in SecureStore. Use device-only iOS accessibility and Android backup exclusion. Do not require biometrics. Missing or unreadable credentials fail closed. Do not reclaim a known ID without proof. Transfer also needs removal of the previous server session. Revoked credentials cannot enroll again.

The later stage owns permission/channel/token handling, captured account and session-epoch checks, SecureStore loss/restore behavior, warm/cold notification responses, account-scoped deduplication, last-response clearing, normal sign-in, and existing Companion task-sheet navigation. It must preserve drafts and focus. Offline sign-out clears local ownership immediately but cannot claim confirmed server revocation before the server receives it. Push permission never blocks an in-app reminder save. Keep `wants_reminders` for learn.

## Migration and worker

MOBILE generated one identity through Supabase CLI: `20261030181040_companion_reminder_push`. WEB mirrors that identity and exact bytes. No accepted migration was renumbered or replaced. All 18 relevant migration/rollback mirrors match.

| Artifact | SHA-256 |
|---|---|
| New migration | `{migration['sha256']}` |
| New rollback | `{rollback['sha256']}` |

The additive private schema keeps enrollment, consumed-event tombstones, deliveries, attempts, settings, and provider budget separate from task progress and #368 scheduler history. It stores only the secret hash. Client grants are absent; private tables have RLS; public push RPCs are service-role only. Account deletion cascades through attempt history. Rollback stops execution first, revokes credentials, and retains immutable delivery identities. Full reverse rollback/reapply restarts no old schedule or attempt.

WEB worker source is `supabase/workers/companion-push/`. Read its README before any future enablement. Enrollment and dispatch ship disabled. Policy values and verification dates are absent by default. There is no foreground lease and no permissive production Auth-policy fallback. Production needs verified lifetime/inactivity settings, current grants, PostgreSQL 17, verified DB TLS, bounded content access, an operator-managed service, and verified aggregate Expo capacity including existing social/learn senders. No send Cron, dedicated login, or grants are created automatically. The aggregate hosted budget remains unproved.

The worker commits durable intent before external I/O. It holds the accepted parent/task/reminder/enrollment authorization boundary through a bounded POST. One 2.2-second deadline covers the locked I/O/callback work. PostgreSQL limits the transaction, including commit, to 2.5 seconds. Each operation runs in a separate process with a four-second supervisor kill limit. This is not a whole-cycle latency claim. The last POST check uses the current database clock. Unknown transport, parsing, commit, or process outcomes cannot resend. Only definite rejection permits bounded backoff/cap. Tickets, provider receipts, and device display remain separate. A late invalid-token error affects only its original tuple.

## Final local evidence

`summary.json` derives counts from the exact named log set. Counts below are separate scopes and must not be added as one acceptance result.

| Check | Result |
|---|---|
| Final new suite A | 58 selected, 58 passed, zero failed |
| Final new suite B | 58 selected, 58 passed, zero failed; no manual DB reset after A |
| Final source identity | 307 identical executed input entries; 26 frozen implementation/test paths unchanged |
| Case distribution in each new run | 56 behavior cases and two fixture-cleanup cases; 29 loopback provider sends |
| Concurrent observations in each run | Ten lifecycle races, three enrollment races, five deadline observations; these overlap the selected cases |
| Deadline range across both runs | {min(deadlines):.3f} to {max(deadlines):.3f} ms; public cancellation HTTP 200 and one public reminder row are recorded |
| Existing backend final per-file set | {summary['legacy']['passed']} passed across all 38 files; two locale-asset setup failures have successful corrected rechecks |
| Edge tests | 277 passed |
| WEB tests | 776 passed; 13 existing skips across 72 files |
| WEB build, types, i18n, changed lint | Passed |
| Edge and new-service normal frozen types | Passed; distinct from runtime no-check |
| Older service-test normal types | Six unchanged baseline errors, mapped in `type-baseline-map.json` |
| Full WEB lint | 12 unchanged baseline errors; actual source lines match the base in `lint-baseline-final.json` |
| Fault checks | Four isolated source faults reached binding assertions; zero survivors |
| Restored source control | One passed after the faults |

Each run's fixture mode distribution is `body=1, hold=12, invalid=1, lost=1, ok=8, rate=3, reject=3`. No fixture forwards to Expo. Real Auth/JWTs, Postgres, RLS, Cron, shared actions, receipts/status, and current task reads supply identity and persisted outcomes. Direct SQL is limited to fixtures, lock coordination, fault injection, and private persisted outcomes. It does not bypass public identity. Quota tripwires stay at zero.

The suite tests a real lost PostgreSQL COMMIT acknowledgement, a forced database connection close, a killed sender after durable intent, a stopped event loop, and the actual supervisor kill/restart boundary. It tests content/provider headers and bodies, final-write timeout, proof/transfer/collision/revocation, session expiry during content I/O, generation isolation, account-owned resolution, and account deletion.

[ test-order.md ](test-order.md) retains red/green order, setup errors, corrected expectations, source epochs, and all failed runs. One original type-check log was recovered exactly from the tool transcript. Its original command JSON and first frozen log were not recovered. The later normal/frozen gates pass. No failed run is relabelled green. The existing per-file campaign uses its accepted schema setup; the new suite applies final #369 and exercises the lifecycle writers and full reverse rollback on it.

## Proof classes and remaining conditions

| Subsystem | Proved here | Passed through or still open |
|---|---|---|
| Shared service and schema | Real local Auth/JWT, privileged RPC boundary, RLS/grants, receipts/retry/conflicts, task/reminder outcomes, mirrored SQL | Hosted gateway, migration/deploy, exact production grants and policy |
| Worker and recovery | Durable intent, unique identity, competing senders, bounded locks, unknown no-resend, actual process/connection/commit faults | Production process manager, network latency, deployed DB login and TLS |
| Provider adapter | Loopback tickets/receipts, rejection/backoff/cap, missing/late receipts, generic payload, old-generation isolation | Real Expo/APNs/FCM operations, aggregate hosted budget, device display |
| Lifecycle and target | Ten public intermediate-state/blocker observations, current owned target, shared published IDs, removed/inaccessible target | Actual mobile response intake and navigation |
| Client regression | Existing WEB tests/build/types/i18n, unchanged UI callers | New MOBILE rendered push flow, SecureStore, iOS/Android, VoiceOver/TalkBack, native criterion 8 |
| Rollback and privacy | No restarted schedules/attempts, terminal credentials, retained identities, Auth deletion | Future hosted rollback, production retention and mixed deployed versions |

No exactly-once display or cancellation after provider acceptance is claimed. Hosted Auth settings, including any single-session policy, were not queried. Verify the complete effective policy before enablement. The local policy record explicitly uses the verified local default limits only.

Primary sources checked include [Expo send/receipt API](https://docs.expo.dev/push-notifications/sending-notifications/), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), and [PostgreSQL 17 timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html). The current Supabase changelog and relevant database/TLS notices were checked. The migration uses SHA-256 digest, not legacy PGP decryption. These reads do not qualify a hosted deployment.

## Cleanup, scope, and handback

Owned project `unify-push-369-server-r1` is removed with no backup. All ports 63610-63616 are free on IPv4 and IPv6. All 33 protected container IDs/states/full mount sets, all 18 protected volume names, and all seven nondefault network IDs match. No owned background job remains. Temporary stack config stayed in the ignored owned runtime. No application config or service URL needs restoration.

`strict_network_ids_unchanged=false`. [bridge-exception.md](bridge-exception.md) records the one default bridge replacement during the exact current Resource Saver startup interval. Its cause is supported as an inference by host startup/registry records, creation time, inactive protected resources, and matching official engine source. The VM startup lines had rotated before the later audit. No current VM initialization proof or continuous inactivity is claimed. Root/review must assess this narrow exception. Historical HOLD reports and historical false predicates remain unchanged.

The first exact-owned-container-ID predicate also failed because local reset recreated only the owned DB container. The corrected pre-stop check verified the exact project/workdir labels and disjoint protected IDs. The raw difference and reset log remain. Protected resource comparisons passed.

Ignored retained paths are this directory's `private/stack`, `private/legacy-export`, `private/mutations`, `private/edge-gate`, `private/deno`, `private/cache`, raw startup/log copies, and generated secrets. WEB retains its existing `node_modules` and ignored `.next`, type/build caches, and generated `next-env.d.ts`. Runtime source copies are outside application build/type paths. The normal lockfiles are retained in this evidence directory and the production worker.

Both canonical integrations remain clean at their required bases. Recorded authority-file hashes match. Impeccable remains 3.9.1 with its original hash. Only the assigned MOBILE and WEB worktrees received task writes. No child agent, manual provider/model/account change, real provider/model/native/hosted operation, push/PR/watch/integration action, instruction/global-setting write, control-file write, or ticket acceptance occurred. The T3 watchdog retained sole ownership of any usage-limit recovery; no limit action was needed.

COMPANION_PUSH_369_SERVICE_R1_REVIEW_READY
'''
(HERE/'HANDOFF.md').write_text(text)
(HERE/'README.md').write_text('''# Companion 369 push server stage

Read [HANDOFF.md](HANDOFF.md) for the fixed candidates, contracts, proof classes, and remaining conditions. Read [CLIENT_CONTRACT.md](CLIENT_CONTRACT.md) for the later MOBILE request/response contract.

The authoritative MOBILE migration and exact WEB mirror are committed. Enrollment and dispatch remain disabled by default. No disposable probe was merged. No ticket or release is accepted.

Final local results are 58/58 new tests in each of two runs with 307 matching inputs, 254 existing backend tests across 38 files in the final per-file result set, 277 Edge tests, and 776 WEB tests with 13 existing skips. Four faults reach binding assertions. The restored control passes. Build, type, i18n, and changed-lint gates pass. Six older type errors and 12 full-lint errors remain mapped baseline limits.

The owned runtime is removed. Protected resources match except the recorded automatic default bridge replacement. Keep `strict_network_ids_unchanged=false`. Root and independent review must assess that narrow exception.

Evidence: `summary.json`, `test-order.md`, `self-check.md`, `mirrors.json`, `frozen-source.json`, `implementation-pins.json`, `cleanup-comparison.json`, and `bridge-exception.md`. The final enclosing evidence commit is recorded after commit in ignored `final-pins.json` and the final response. Private runtime/cache/log copies remain stopped and ignored.

COMPANION_PUSH_369_SERVICE_R1_REVIEW_READY
''')
