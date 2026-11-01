# Companion push Vercel operation R2 handoff

Implementation candidate prepared. SQL runtime, Web build, Vercel execution, provider delivery, native behavior, and acceptance remain unverified.

## Source and scope

- Prepared Mobile path: `/Users/savargupta/.t3/worktrees/Unify/t3-c45760c0`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-c45760c0`.
- Actual branch: `t3/mobile-node-auth-adapter`.
- Mobile base: `17a12a7f75477f33f93805fe9894a61847ed538f`. The prepared checkout already had this commit. No fast-forward was needed.
- Read-only Web source: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359`, commit `fff4a93ae58c9505f166b2188f7456e7435dc824`.
- Read-only proposal: Mobile commit `69c2c26c3696f08c11f0912eb71e4ab357f90aae`, `DOCS/companion-actions/evidence/push-production-operation-plan-r1`.
- Task: `/tmp/unify-companion-359/one-day-delivery-20261031/push-vercel-operation-r2.md`.

The prepared Mobile base did not contain a push worker directory or the RAG content helper. This candidate adds the six reviewed Web worker files. It adds the exact five-file local import closure of the content helper under the worker's `content-source` directory. No Edge Function was added or modified. `source-pins.json` records the original bytes. `worker-from-web.diff` contains the complete worker logic diff. Only the content import path and the Auth session-lock expression change. The supervisor, operation process, copy table, and frozen lock remain byte-identical to Web. `worker-policy-integrity.json` records those comparisons.

The eleven deployed Companion migrations remain byte-identical. All 92 pre-existing Mobile migrations remain byte-identical. `old-migration-integrity.json` records the full machine-filtered set and hashes.

No secondary checkout was created. No Web source was written. No child agents or provider changes occurred. No Docker, native resource, production, provider, secret, paid host, push, deployment, PR, ticket, or acceptance operation occurred. Impeccable was not changed. Existing Mobile npm dependencies were installed only in this prepared checkout with `npm ci --ignore-scripts`. No dependency manifest changed in Mobile.

## Implementation

`node-adapter.mjs` authenticates an operator request before it reads runtime files or starts a process. It requires a separate `COMPANION_PUSH_OPERATOR_SECRET`, an explicit enable flag, and the dedicated database username. It refuses fixture overrides and URLs without `sslmode=verify-full`. It does not accept executable names, arguments, environment names, paths, or provider destinations from the request. It forwards only fixed worker environment names. It discards all worker stdout and stderr. Its HTTP response contains a fixed boolean result.

`owned-process.mjs` creates a detached POSIX process group. It sends SIGKILL to the entire group after timeout, cancellation, Node termination signals, Node exit, or supervisor exit. It also kills descendants when the supervisor exits normally. The outer cycle deadline is 110 seconds from handler setup. The proposed Next route allows 180 seconds. The existing supervisor still selects at most 20 operations and kills each child at four seconds. The worker still uses a 2.2-second JavaScript deadline and a 2.5-second PostgreSQL transaction timeout. Retry, cancellation, provider limits, and unknown-intent recovery remain unchanged.

`readiness.ts` creates a harmless Deno parent, child, and grandchild. It has no database, network, environment, or provider access. The preview-only readiness handler checks Deno 2.9.8 and proves that all three processes stopped after the group kill. It returns only `{ok, deno, descendantCleanup}`. It requires `VERCEL_ENV=preview`, `COMPANION_PUSH_READINESS_ENABLED=true`, and the operator secret. It refuses production scope even when the flag is true. No readiness route is active in this task.

`prepare-runtime.mjs` is a separate preparation command. It verifies the official archive checksum and the official extracted-binary checksum. It stages the Linux x64 executable and frozen dependencies. It rejects a runtime package over 200,000,000 bytes. `runtime-package.mjs` checks the manifest, lock hash, file sizes, paths, and each staged file hash before execution. The cycle copies the dependency cache into a new temporary directory. It removes that copy after process cleanup. An ordinary Next build has no runtime download step.

The CLI generated `20261101042015_companion_push_worker_session_lock.sql` with Supabase CLI 2.118.0. It creates `companion_push_worker` with NOLOGIN, NOINHERIT, NOBYPASSRLS, and no administrative role attributes. It creates the private postgres-owned helper with a fixed search path and explicit function grants. The helper locks the exact session row and then calls the existing current-time authorization function in the same transaction. It uses postgres's existing Auth privilege. It does not grant that privilege onward. The worker receives no Auth schema usage, Auth table grant, service_role membership, or settings enable-column write grant. RLS remains enabled. Restrictive UPDATE policies protect the lock-only columns when PUBLIC policies or fabricated JWT claims are present.

The rollback removes only this migration's helper, policies, grants, and role. It requires the operator route and dedicated sessions to stop first. It preserves all delivery, event, attempt, and suppression identities. No migration or rollback ran against a database.

The role can read full enrollment and profile rows. Enrollment rows include credential hashes. NOINHERIT does not remove PUBLIC privileges. Root must audit effective inherited PUBLIC privileges before LOGIN enablement. The grant map below is a source review, not a SQL runtime result.

## Query and privilege review

| Actual worker path | New authority |
| --- | --- |
| supervisor ready selection and recoverUnknown | SELECT deliveries; UPDATE state; SELECT attempts id/delivery_id/outcome; UPDATE outcome |
| enqueue settings FOR SHARE | SELECT settings; lock-only UPDATE singleton; explicit SELECT and restrictive write policy |
| enqueue due event join FOR UPDATE OF e | SELECT due events and reminders; lock-only UPDATE due_at |
| enqueue event consumption | INSERT event reminder_id/user_id/reason; SELECT reminder_id; UPDATE reason |
| enqueue installation selection and delivery insert | SELECT enrollments; EXECUTE session_authorized; INSERT the exact delivery columns |
| dispatch reservation | SELECT/UPDATE deliveries; INSERT attempt id/delivery_id/number |
| budget | SELECT settings and budget; UPDATE the six existing budget counters/times |
| parent authorization | EXECUTE the two existing parent functions; no direct task-table grant |
| reminder lock | SELECT reminders; lock-only UPDATE created_at |
| enrollment/token/session lock | SELECT enrollments and token id/user_id/token; lock-only token UPDATE updated_at; EXECUTE private helper |
| published content | SELECT/lock profiles; unchanged content helper and HTTPS policy |
| finalization/receipt | UPDATE the exact existing delivery, attempt, enrollment, and budget columns |
| operation server version | Built-in current_setting; no new table grant |

The SQL tests use a real dedicated login after a temporary local-only LOGIN change. They cover the actual read and row-lock shapes, dark enqueue, recovery, finalization column grants, and denied Auth/history/conversation reads. They reject settings writes, deletes, truncation, and lock-only UPDATE with fabricated claims. Three concurrent tests cover helper-first deletion blocking, deletion-first authorization refusal, and session expiry during a real lock wait. They observe `pg_blocking_pids` before releasing the held transaction. These tests have not executed against PostgreSQL in this task.

## Runtime packaging

| Item | Exact result |
| --- | --- |
| Deno | 2.9.8 |
| Deployment target | x86_64-unknown-linux-gnu |
| Linux archive bytes | 41,963,064 |
| Linux archive SHA-256 | e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609 |
| Linux executable bytes | 96,055,992 |
| Linux executable SHA-256 | 368bca08999e02c6911b8f248167b582276b1f547db5712b6e736d7eda1dbda7 |
| Linux runtime and cache bytes | 105,912,216 |
| Linux staged files | 623 |
| Frozen deno.lock SHA-256 | 7264c84a0808153ed2eec3db856de15423766c0c1f8379823cc7c6b556d51717 |
| Local fixture runtime | Deno 2.9.8 aarch64-apple-darwin |
| Node used for local tests | 22.23.1 |
| Proposed Vercel Node major | 22.x |
| Complete Next function bytes | Not measured. Root must build and inspect. |

`runtime-packaging.json` records both packages and their manifest hashes. `.runtime` is ignored by git. No binary or dependency cache is committed. The Linux package leaves 144,087,784 bytes of the documented 250,000,000-byte function limit before application files. This arithmetic does not prove the final function fits. Preparation enforces a smaller runtime-only limit so at least 50 MB remains for the application.

## Verification and limits

Falsifiers were stated before checks. A surviving descendant disproves cleanup. A configuration refusal that starts a process disproves the refusal boundary. A denied query that succeeds, an allowed query that fails, or a deletion that commits through the session lock disproves the SQL proposal. A hash mismatch or an offline dependency-resolution failure disproves the package result.

| Check | Result | What it proves and what it does not prove |
| --- | --- | --- |
| Pinned Node adapter/process tests | 9 passed, 0 failed, 0 skipped | Local configuration refusal and real macOS Deno process-tree cleanup. No Linux or Vercel execution. |
| Parent-only kill mutation | Two descendants survived; control removed them | The fixture detects a failing cleanup implementation. |
| Worker and readiness typecheck | Exit 0 | Local static types. No SQL, provider, or hosted execution. |
| Linux cache offline worker typecheck | Exit 0 | The staged frozen dependency cache resolves after relocation. Runs the local macOS runtime. Does not execute the Linux binary. |
| SQL test file typecheck | Exit 0 | Test code types only. No permissions or race proof. |
| SQL runtime without lease | 0 passed, 1 failed with separate_local_SQL_lease_required | Refusal before a database connection. No SQL test is counted as passed. |
| Package inventory and rejection checks | Exit 0 | Both manifests verify. Corrupt binary hash and path traversal are rejected. No final Next package measurement. |
| Mobile npm typecheck | Exit 0 | Normal Mobile types. Worker files use their separate Deno check. No native build or behavior. |
| Proposed Web patch | git apply --check exit 0 | The patch applies to the pinned Web source. No Web build or source edit occurred. |
| Existing migration hash comparison | 92 of 92 unchanged, including 11 Companion files | Existing migration bytes remain intact. No hosted schema proof. |

The original 2.7.14 Deno fixture run is retained as fixture-initial.log. Only the later 2.9.8 run supplies pinned fixture proof. `failed-controls.md` preserves the initial local-cache integrity failure, the parent-only kill control, the missing Mobile source observation, and the SQL lease refusal. No assertion was removed or weakened. Raw command logs and the exact unified patch retain their original formatting. The full artifact diff check reports whitespace in those tool outputs and in one blank patch-context line. The source-only diff check passes.

## Root's proposed review and deployment sequence

These steps are proposals. None ran here.

1. Review this Mobile commit and the complete worker/migration diff.
2. Mirror the worker directory, new migration, and matching rollback into the root-owned Web checkout. Do not copy `.runtime`.
3. Check the Web head against `fff4a93ae58c9505f166b2188f7456e7435dc824` before using `web-route-and-build.proposed.patch`. Reconcile any changed base explicitly. Apply that patch only in root's Web task.
4. Run the actual Web type checks and Next build. Verify both route trace manifests and the complete uncompressed function sizes. Confirm the Linux executable mode and all frozen dependency files. The patch excludes local macOS/test caches. Ordinary `npm run build` stays independent of runtime preparation. Deployment builds run `npm run prepare:companion-push && npm run build`.
5. Obtain the separate SQL resource lease described below. Run the exact-login permission and race tests. Review rollback/reapply behavior in that lease. Keep hosted schema work stopped until those results and the complete review pass.
6. Use the existing GitHub/Vercel integration for an owner-approved preview only. Supply a preview-scoped operator secret through the approved secret channel. Set only the preview readiness flag. Do not supply a database URL or Expo token for the probe. The cycle flag and all database gates stay off.
7. Observe the authenticated readiness route. Require `deno=2.9.8` and `descendantCleanup=true`. Confirm missing/wrong credentials refuse. Confirm a production-scoped readiness request refuses. Record the deployment identity and actual result. A green Next build alone cannot establish process support.
8. Confirm the current Vercel plan, Linux architecture, function duration, and full package size. No host-plan metadata or Vercel execution was read in this task. Do not infer support or zero cost from local results.
9. Before any separate production operation, verify the current Auth lifetime/inactivity policy, aggregate Expo sender capacity, policy renewal owner, dedicated login, TLS, and effective PUBLIC privileges. Review the migration and login enablement as distinct operations. Never use postgres, service_role, or a user JWT as the worker login.
10. Use existing Supabase Cron/pg_net for one-minute invocation if the verified Vercel plan cannot schedule each minute. Keep operator authentication on the route. No scheduler SQL, secret entry, endpoint activation, or cron change is included here.
11. Verify synthetic queue state, ticket, receipt, and device display as separate results under later explicit authority. Preserve all existing release gates. No ticket or release acceptance follows from this candidate.

The patch adds `/api/cron/companion-push` with GET/POST and `/api/cron/companion-push-readiness` with GET. It retains the existing Sentry cron without adding a push schedule. Existing JWT action/RAG endpoints and frontend behavior are unchanged.

## Separate SQL lease request

Proposed project: `unify-companion-push-vercel-r2`.
Proposed workdir: this prepared checkout's `unify-front-end/supabase/probes/companion-push-vercel-r2`.
Proposed ports: API 63620, database 63621, shadow database 63622. Disable studio, mail, realtime, storage, and edge runtime for this SQL-only lease. Use PostgreSQL 17. Root must confirm that these ports are free before it grants the lease.

After root prepares the owned hosted-shape fixture schema and applies the eleven unchanged Companion migrations plus this new migration, the proposed start command is:

```sh
supabase start --workdir /Users/savargupta/.t3/worktrees/Unify/t3-c45760c0/unify-front-end/supabase/probes/companion-push-vercel-r2
```

No probe project was created or started here. Root must supply the fixture schema and config in its later leased task. Do not use the current R15 project, its port 63611, or its copied guest. Do not reset the existing app project. An isolated project is a prerequisite, not a passed check.

The test command after that setup is:

```sh
cd /Users/savargupta/.t3/worktrees/Unify/t3-c45760c0/unify-front-end
COMPANION_PUSH_SQL_TEST_LEASE=unify-companion-push-vercel-r2 \
  supabase/workers/companion-push/.runtime/darwin-arm64/deno test \
  --no-config --node-modules-dir=none --frozen \
  --lock=supabase/workers/companion-push/deno.lock \
  --allow-env --allow-net=127.0.0.1:63621 \
  supabase/workers/companion-push/role-and-session.test.ts
```

The owner must supply `COMPANION_PUSH_SQL_TEST_URL` through the local test process environment. The test accepts only `postgres` at `127.0.0.1:63621/postgres`. It creates synthetic local rows and a temporary synthetic worker password. It uses no Auth API, provider, or hosted connection. Its cleanup restores NOLOGIN, clears that password, removes synthetic rows, and restores the prior policy values. Run this command only after the lease is granted.

## Proposed disable sequence

1. Stop the owned scheduler from issuing new requests.
2. Set the route's process enable flag false.
3. Set database enrollment and dispatch gates false through the operator role.
4. Stop active owned cycles and verify all owned processes stopped.
5. Set the dedicated role NOLOGIN and clear its password through the approved channel.
6. Terminate remaining dedicated sessions through the authorized owner. NOLOGIN alone does not stop an existing session.
7. Remove the worker's host secret access. Record zero dedicated sessions.
8. Keep unknown intents and suppression identities. Never requeue them.
9. Use the new rollback before older rollbacks only under separate schema rollback authority.

## Primary documents checked

- https://github.com/denoland/deno/releases/tag/v2.9.8
- https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-unknown-linux-gnu.zip.sha256sum
- https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-unknown-linux-gnu.sha256sum
- https://docs.deno.com/runtime/packages/supply_chain
- https://nodejs.org/api/child_process.html
- https://vercel.com/docs/functions/configuring-functions/duration
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://www.postgresql.org/docs/17/sql-createpolicy.html
- https://supabase.com/changelog.md

The current Supabase changelog includes the scheduled November 10 HTTP TLS cipher removal. This candidate changes neither the HTTP client TLS configuration nor the direct PostgreSQL TLS requirement. No related breaking change was inferred to require a source change.

COMPANION_PUSH_VERCEL_OPERATION_R2_DONE
