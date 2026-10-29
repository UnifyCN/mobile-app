# Bounded ownership experiment

Base: 9bd5ddefb8f7af2e94ac72c2af8d1a808db100ea.
Base tree: ed26d0b67e5cf3a0ec4e78786f6c021ddc21b1f1.
Branch: t3/reminder-scheduler-probe-368.

## Binding falsifiers, before code

- Concurrent retries of the same authenticated operation create more than one reminder or due event.
- A real pg_cron run cannot make a saved future reminder due without a test calling the worker.
- A due event appears before its UTC instant, or an account can read another account's event.
- A completion, removal or explicit cancellation commits, but a later due read still returns its event.
- A worker takes reminder locks before task locks and deadlocks with existing lifecycle triggers.
- Reopen, removal Undo or an old operation retry restarts a stopped schedule.
- A persistence failure looks like a saved schedule, or a scheduler/read failure changes task progress.
- A time zone change changes the stored instant, or a DST gap silently changes the requested wall time.

## Options

| Owner | Existing capability | Constraint |
| --- | --- | --- |
| Supabase Postgres and companion-actions | Existing pg_cron jobs, shared receipts, task locks and cancellation triggers | Needs hosted Cron permissions and a due read. Must retain cancellation after a due event exists. |
| Expo device scheduling | Existing expo-notifications use on native clients | Needs a separate web owner. An offline device cannot observe server cancellation at once. |
| Cron calling an Edge worker over HTTP | Existing learn reminder job uses pg_net and a service key | Adds an HTTP failure boundary and secret management for a database-only in-app result. |

Test the first option. One periodic SQL job scans UTC instants. Keep the reminder pending until it stops. Store a unique due event separately. A claim is not delivery. A due read joins current reminder and task state. It never completes the task. This permits existing completion/removal triggers to cancel even after the worker has claimed the reminder.

The prototype adds two explicit local test-control operations to a private copy of companion-actions. They use the existing authenticated apply, operation lock and receipt transaction. They are not a proposed full reminder API. No assistant proposal, UI, push, client cache, recurrence or native display is implemented.

Use actual Postgres, pg_cron, GoTrue, PostgREST and Edge runtime. Use synthetic accounts. Read the existing schema, #360 rollback policy and seven merged migrations. Copy all tracked service files and both locale inputs from fixed commits. Keep runtime files here. Do not change web or application source.

The database clock is authoritative. Store a UTC instant and an IANA zone. Require an explicit offset and matching wall time. Reject a DST gap. Accept either fold instant only with its explicit offset. Changing the device zone does not reschedule an existing reminder. A changed schedule needs a new authorized operation. Use New York DST fixtures. Record actual zone-rule behavior.

Stop after this wave and one local commit. Root must review the result before implementation. Tickets 367 and 370 remain unaccepted for native criterion 8. No ticket acceptance or hosted qualification follows from this probe.
