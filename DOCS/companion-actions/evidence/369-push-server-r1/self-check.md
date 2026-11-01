# Implementation self-check

This is the implementation agent's own check. It is not independent review or ticket acceptance. The user prohibited child agents. The code-review checklist was applied without its child-agent procedure.

## SPEC

The implemented scope is server/schema only. It adds a private enrollment/delivery schema, three authenticated actions, common operation receipts and status recovery, generic translated payloads, an account-owned target resolver, and a separate disabled worker. It does not change the accepted reminder scheduler, task lifecycle writers, `wants_reminders`, social/learn senders, WEB reminder UI, or native notification handlers.

The binding falsifiers are a write through a disabled gate; foreign or unproved installation transfer; duplicate delivery identity or POST; resend after uncertainty; a provider POST after an earlier committed lifecycle stop; a lock held beyond the public action budget; a foreign, removed, or inaccessible target; restarted work after rollback; or a generation/allowance change caused by delivery. Each new case states its relevant falsifier before the check.

The self-check found the session-expiry gap. The red test sent after a session expired during content I/O. The fix uses the current database clock and a last-boundary session check. The green test sends nothing. The self-check also found that retained attempts blocked account deletion. The binding test failed before the new attempt foreign key was changed to cascade on delivery deletion. Its green run deletes the Auth account, delivery, and attempts.

The two final 58-case runs pass with 307 matching input entries. All four faults reach binding assertions, and the restored control passes. The final per-file backend set has 254 passes across 38 files, including the recorded locale-asset rechecks. Earlier 44- and 53-case runs remain intermediate results. They do not establish the final source.

Native SecureStore, permission/token handling, warm/cold response intake, account epochs, drafts/focus, and task-sheet navigation belong to the next MOBILE stage. Hosted policy/grants, aggregate provider capacity, service deployment, actual Expo/APNs/FCM behavior, and native delivery/accessibility remain open. No acceptance follows.

## STANDARDS

The MOBILE CLI generated one migration identity. WEB mirrors its SQL and rollback. The new functions use the existing account/operation namespace and immutable receipts. They do not replace accepted lifecycle functions. Private tables have RLS and no client grants. Public push RPCs are service-role only. Normal request authentication supplies the account and session.

The worker has one bounded locked transaction. It uses the established parent check and current Checklist content filters. A separate process isolates each operation. The supervisor emits a categorical failure and returns a failing cycle status after child failure. It quarantines retained intent instead of resending. Its database connection requires verified production TLS. It does not create a login, grants, or a Cron send schedule.

The repeated immutable delivery tuple is kept in one reserved record. SQL validation and HTTP validation are separate trust checks. The two client type files and SQL files are intentional byte mirrors. The worker retains a single transaction body because its lock order and deadline form one safety boundary. These choices do not justify a speculative refactor during this stage.

The normal Edge and new-service checks are distinct from runtime `--no-check`. The six older service-test type errors and 12 full-lint errors are baseline limits. Their exact source lines must match the base. The final application build and tests remain separate gates.

The strict network predicate is false. `bridge-exception.md` records one current automatic-start interval. It does not alter either historical HOLD report or historical exception. Root and independent review must assess the narrow exception.

No child agent, provider/account change, push/PR/watch/integration action, native operation, hosted operation, real push/model call, instruction edit, or control-file write occurred. Only the two assigned worktrees received task writes. The retained private runtime/cache is stopped. The owned project resources are removed, and all assigned ports are free.
