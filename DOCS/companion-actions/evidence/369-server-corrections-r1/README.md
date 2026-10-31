# Push service corrections after review R1

This candidate addresses 369-SPEC-01, 369-SPEC-02, and 369-STD-01. It requires a new independent SPEC and STANDARDS review. No integration, ticket, native, hosted, provider, or release approval is claimed.

## Changes and falsifiers

| Finding | Change | Result that would disprove the fix |
| --- | --- | --- |
| 369-SPEC-01 | Enqueue excludes an enrollment with no token link from delivery insertion. It still records the consumed due event. | Account A's JWT token deletion stops B's delivery, or A's later enrollment revives that consumed event. |
| 369-SPEC-02 | After installation contention, enrollment takes shared locks on the user, session, and settings rows. It checks the gate and current session policy. It repeats the clock checks after the common operation lock and the token lock. | A committed invalidation permits the later enrollment, an invalidation commits through an earlier protected write, or expiry during a later wait permits a write or replay. |
| 369-STD-01 | The root records a specific historical evidence exception in `type-record-exception.md`. New normal and frozen type gates retain separate complete records. | The record presents a reconstructed file as an original artifact, or either present compiler gate fails. |

The pending migration keeps its identity. Both repository copies remain equal. The rollback, contract, Edge action handler, worker deadline, payload, grants, deployment defaults, and client files are unchanged. The private helper has a fixed search path. The migration's existing final revoke includes the helper. No public client role gains its execution permission.

The authorization locks order enrollment against sign-out, an account ban, and a settings change until commit. Clock-based expiry is checked after waits. These checks do not promise that wall-clock expiry can never occur in the final instructions between a check and commit. No provider call occurs during enrollment.

## Test order

- `push_isolation_test.ts` was written before the filter. The unchanged worker failed with SQLSTATE 23502. It consumed no event and queued nothing for B. The fixed worker passes. Removing the filter reproduced that assertion failure.
- The first four cases in `push_authority_races_test.ts` were written before the SQL fix. All four unchanged-code requests returned 200 after a committed invalidation. The fixed SQL returns 403 for sign-out, expiry and ban, and 503 for a gate stop. It writes no enrollment.
- The three opposite-order cases and two later-expiry cases were written after the SQL fix. They passed first. Their sensitivity is established by separate faults, not by a test-first claim. Removing the shared locks fails three assertions because invalidation commits too early. Removing the two later checks fails both expiry assertions with 200 instead of 403.
- All three faults were restored. Each fault has its changed SQL or source diff, command, output, input inventory and restoration receipt. No source file was changed during a running test.

## Current results

Both complete runs pass 68 cases with zero failures and natural exit 0. They selected the same 311 recorded runtime inputs. There was no manual database reset between the two runs. Each run records 29 local provider-fixture requests: 8 ok, 12 hold, 1 lost, 3 reject, 3 rate, 1 invalid and 1 body. The counts add to 29. No real provider received a request.

Normal Deno type checking and a separate frozen type check pass for the push test/support files and worker supervisor. Their output is not the runtime suite's `--no-check` result. The runtime uses a frozen dependency lock and only the five listed loopback network destinations.

Repository ESLint passes the two new files. The worker is excluded by the existing repository configuration and produces one ignored-file warning. An extra default Deno lint run reports four diagnostics: three pinned import prefixes and the worker's existing `Record<string,any>`. The unchanged worker reproduces its same two diagnostics. The two new tests pass Deno lint with only `no-import-prefix` excluded to retain the repository's explicit versioned import convention. No lint configuration or dependency changed. Do not describe the extra default Deno lint run as passing.

The earlier web app, Edge fixture, mobile client and accepted service regression results remain supplied evidence. They were not rerun for this SQL and enqueue correction. The final service runs cover all 58 earlier push cases plus ten new cases. Full application and native checks remain separate.

The local advisor command exits 0 with `--fail-on none`. It reports 41 warnings and two errors. No finding names the new authority helper. The two RLS errors name `public.users` and `public.quota_tripwire_calls`, created by the unchanged hosted-baseline and quota-tripwire test fixtures. This is not a clean advisor result or hosted permission proof. The final catalog read confirms that anon, authenticated and service_role cannot execute the private helper directly.

## What each subsystem proves

| Subsystem | Proved locally | Passed through or not proved |
| --- | --- | --- |
| Token isolation | A real JWT deletes the shared token. Real Cron due events are consumed independently. B gets one queued delivery. Re-enrollment does not restart A's old event. | No real push provider or device delivery. |
| Enrollment authorization | Real local Auth sign-out, SQL gate/ban changes, database time, persisted row counts and observed lock blockers establish the tested orders. | No hosted Auth configuration or remote service guarantee. |
| Worker and recovery | The complete retained suite exercises the real local database, worker process, bounded fixture transport, recovery and rollback. | Provider ticket, receipt, native display and human observation remain separate. |
| Compiler and lint | The selected current files compile normally and with the frozen lock. The new tests satisfy the stated lint commands. | No claim that all repository lint or all historical type records pass or survive. |

## Evidence and cleanup

The old implementation evidence and failed R1 review remain unchanged. `type-record-search.json` records the bounded historical search. `type-record-exception.md` names the two irretrievable files. The new review must assess that exception. Fresh compiler success does not recover old data.

The root-owned local project `unify-push-369-correction-r1` is removed. No owned container, volume or network remains. All seven reserved ports bind on IPv4 and IPv6. All 33 protected container identities and states match. Their complete mount objects match, including multiplicity. All 18 protected volume names and seven nondefault network identities match.

The first cleanup assertion compared raw mount arrays. It failed because three arrays changed order. The full saved objects show no mount-content change. `cleanup.json` preserves that failed raw comparison. `cleanup-projection-analysis.json` and `cleanup-verification.json` retain the order-independent comparison of every complete mount object. The default bridge also changed. The exact old/new IDs appear in the Docker host startup/resync log. Its new creation time is inside the captured 20:05:23.259997Z to 20:05:24.881248Z engine-start interval. `startup-network-lines.txt` and its extraction receipt preserve those lines. This is the same bounded Resource Saver startup disposition as the approved prerequisite record. Historical and current raw strict network identity remain false. No general Docker restart or prune occurred.

One earlier read-only catalog probe failed because shell quoting produced invalid SQL. Its empty output remains as `catalog-first-empty-output.txt`. The file-based `catalog.py` probe then passed with complete command, query and result records. This setup failure is not a product failure or a green first run.

The first summary parser also stopped on an incorrectly escaped separator. It wrote no summary. `report.py` corrects the parser and recounts the retained logs. The complete staged whitespace check fails on the preserved raw logs and one deliberate SQL fault. Those bytes are not cleaned or rewritten. The separate authored-file check excludes those immutable raw artifacts.

The handoff records the source pins and measured totals. Impeccable remains 3.9.1. No frontend, native app, real provider, hosted service, PR, push, integration, or ticket acceptance action occurred.
