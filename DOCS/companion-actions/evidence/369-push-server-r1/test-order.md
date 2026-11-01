# Test order and retained failures

The named logs and command/input records control the result. Intermediate runs do not establish the final source. Every new behavior case prints its falsifier. The two final complete runs use the same final source and input inventory. No manual database reset occurs between those two runs. The suite itself tests rollback/reapply. The runner restarts only its owned Edge container before each invocation.

## Binding tests written before implementation

- `red-enrollment`: the unchanged handler returned HTTP 400 instead of HTTP 503 `push_disabled`. `green-disabled` passes after the authenticated push action adapter is added.
- `red-save`: both requests returned 503 instead of 200. `green-save` passes after the authoritative migration adds enrollment, revisions, common receipts, and replay.
- `red-disabled-delivery`: the due event had no durable suppression. `green-disabled-delivery` passes after enqueue consumes it without a send.
- `red-dispatch` first failed because the dispatch export did not exist. This is setup evidence. `red-dispatch-binding` then failed at the send-count assertion against a no-op dispatch. `green-dispatch` passes after the worker commits intent and performs one provider request under competing callers.
- `red-rollback`: enrollment stayed enabled. `green-rollback` passes after stop-first rollback and terminal credential revocation.
- `red-session-expiry`: a session expired during controlled content I/O, but the old worker sent once. The SQL policy check now uses `clock_timestamp()`, and the worker checks it again immediately before POST. `green-session-expiry` sends zero times.
- `red-account-delete`: Auth could not delete the synthetic account after an attempt existed. The new attempt foreign key now cascades when its delivery is deleted. `green-account-delete` removes the account, delivery, and attempt.

Additional scenario coverage was written after the corresponding implementation unless listed above. It is coverage, not test-first evidence. No failing assertion was removed.

## Setup and expectation corrections

`enrollment-expanded` expected HTTP 403 after sign-out. GoTrue rejected the old bearer first with HTTP 401. The final test accepts either rejection and still requires no enrollment write.

`worker-expanded` contained one invalid budget fixture and two unsuitable advisory-lock fixtures. The budget fixture tried to put 600 into a column capped at 599. The revised fixture has no residual send capacity within valid bounds. The two legacy lifecycle paths did not take the advisory lock the fixture held. The revised races hold the actual lifecycle write before commit and start dispatch concurrently. They retain public intermediate-state and blocker assertions.

`process-first` could not send SIGSTOP under the restricted Deno run permission. The owned test process now has the run permission needed to signal only the child it created. No unrelated process is signalled.

The first web test run used an empty Sanity project ID. It failed during module configuration. The final run uses a synthetic project ID and blocks external network access. It passes 776 tests, with 13 existing skips.

The first worker type check found missing reserved-record fields. The next found missing Deno namespace types. Both were corrected without no-check type gates. A later new-test type error came from using the npm SupabaseClient where the handler uses the JSR client. The test now creates the real JSR client. `type-evidence-recovery.md` records one overwritten log pair and the exact recovery of the first normal-check log from the tool transcript. The first frozen log and original command JSON were not recovered. Their failing statuses remain recorded. All later gate labels are distinct.

## Existing backend campaign

The first attempt omitted the quota tripwire migration. `regression-02-boundary` therefore failed before the intended quota assertion. The attempt was stopped, and the complete fixture migrations were restored.

The next 38-file attempt passed 37 files. `edit_published_test.ts` could not load the generated service copies that its original runner supplies. An exact source export now supplies those copies outside application build paths.

The first exported attempt then failed frozen-lock setup because Deno used the MOBILE working directory with a WEB workspace lock. The corrected runner records and uses the WEB working directory. The exact WEB package declaration is also retained with the export. The normal import graph then reaches only six unchanged older-test type errors.

The corrected ordered 38-file campaign retains two missing-locale-asset failures. The source export now includes the exact WEB locale assets. The joint language recheck passes all 13 selected tests. The separate priority-label recheck also passes all ten tests with both assigned MOBILE and WEB locale inputs. The final per-file result set uses those corrected runs for the two affected files. It does not count the failed attempts as passing. All other files use their original successful corrected-campaign result. `summary.json` records that exact selected set and the original failure fields.

Existing tests use their accepted per-file schema setup. The new suite applies final #369 and checks the accepted lifecycle writers, current task access, and full reverse rollback on that schema. The existing campaign alone is not proof of #369 behavior.

## Faults and restoration

Four faults run only in owned source exports after the complete final runs: uncertain send made retryable; lifecycle cancellation ignored; late-error generation isolation removed; and retained intent returned to queued. Each must reach a binding assertion. `mutation-results.json` records every result and any survivor. The recovery fault stops at its earlier unknown-state assertion; the uncertain-send fault separately checks duplicate I/O. A restored original-source control follows the faults.

No real provider, hosted, native, model, or allowance operation is inferred from these local tests. The actual quota tripwires remain at zero. No device display follows from a ticket or receipt.

## Cleanup check

The first exact-owned-ID predicate failed because the CLI reset recreated the owned database container. Four other owned container IDs still match startup. The last full-A reset log explicitly records database recreation. `owned-id-replacement.json` retains the old/current IDs and creation time. Before stop, every current resource had the exact project and owned-workdir labels and no ID overlapped the protected set. Protected container, mount, volume, and nondefault-network checks passed before and after cleanup. No failed predicate is reported as a strict identity pass.

The unfiltered Git whitespace check reports tool formatting in raw `.log` files. All notices are confined to those raw logs. Authored files pass the check with raw logs excluded. Log bytes remain unchanged. `evidence-whitespace.json` records this distinction.
