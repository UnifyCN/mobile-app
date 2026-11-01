# Reminder scheduler ownership probe

This is a local prerequisite probe for ticket 368. It contains no production migration, client UI or deployable reminder path. Independent root review must follow this commit.

## Proposed decision

Use the existing Supabase Postgres service as the schedule and due-event owner. Use `companion-actions` as the authenticated write and due-read owner. Add one periodic database job. Do not create one Cron job per reminder. Keep AI generation and push delivery outside this path.

Keep each reminder `pending` after the worker creates its due event. This status means that the schedule can still be stopped. The event has a unique reminder identity. Existing task completion and removal triggers can then stop both waiting and claimed reminders. A due read joins the event to the current reminder and task. It returns only the current owner's live due events. A claim does not mean that a user saw a reminder.

Do not reuse `sent` to mean claimed. The existing lifecycle trigger cancels only `pending` rows. Moving a claimed row to `sent` would remove that cancellation protection. The final product must define visible history and any delivery acknowledgment separately.

The prototype covers existing custom tasks only. The content-backed task path, including a task without a progress row, requires its published-content check and parent lock before implementation. The #366 parent-lock helper already supplies the required task serialization pattern. This probe does not prove that second task path.

## Local contract and failures

The private copied registry permits `probe.reminder_schedule` and `probe.reminder_cancel` only with an explicit `ui_control`. The shared endpoint derives the account from GoTrue authentication. The existing operation lock, payload identity, revision checks and receipt transaction handle retries. SQL validates the prototype again. These operations are test controls. They do not define assistant interpretation, approval UI, schedule editing or schedule Undo.

A saved receipt proves persistence. Its `registered_in_due_scan` field identifies the selected scheduler mechanism. It is not a scheduler-health or delivery claim. An inactive or failed job can leave a saved reminder overdue. Cron history records worker failures. A persisted due event proves worker execution. An authenticated due-read response proves server visibility for that account and request. It does not prove rendering, display, user observation or navigation.

Cancellation has a commit boundary. If the worker commits first, its event stays as history, and the later stop hides it. If the stop commits first, the worker cannot create an event. A read that started before cancellation can return the earlier committed state. The server cannot recall that response. The final clients need account/epoch checks and reconciliation after task changes before they display or use a cached result.

The SQL worker takes the parent lock, then the task row lock, then the reminder/event boundary. It does not lock a reminder before its task. That order avoids a cycle with the existing legacy custom-task update and its cancellation trigger. This prototype scans in stable account/task/id order. A production worker still needs bounded batches, fair retry behavior, error isolation and outage monitoring. No throughput or commercial threshold is set here.

## Clock policy

Postgres uses its actual clock in UTC. The job runs once each second for this experiment. That frequency is a test setting, not a release choice. The worker compares `remind_at` against `clock_timestamp()`. It does not trust a client clock or client zone for due selection.

The local schedule control requires a UTC instant with an explicit offset, an IANA zone and a matching wall time. An invalid zone or mismatch fails before persistence. The New York spring gap fails. The two New York fold instants need explicit offsets and differ by 3,600 seconds in storage. A database session zone change to Tokyo leaves their epochs and intended zone unchanged. The final review UI must show the selected instant, offset and named zone. A device zone change must not move a saved instant. A user who wants a different time must review a new schedule change. No recurring wall-clock schedule is proposed.

## Rollback policy

Stop the worker before removing its schema. Apply the seven merged rollbacks in reverse order. The #361 rollback stops pending reminders with `schema_rollback` before it archives them. Reapplication keeps them stopped. An old operation retry replays its historical receipt and creates no schedule. A new schedule needs a new explicit authorization. A future product must show the service-interruption reason in its history. Gate-only disable/enable and full schema rollback are different operations under the accepted #360 policy.

## Reproduce

Use Docker 29.6.2, Supabase CLI 2.118.0 and Deno 2.7.14. The run evidence also pins image IDs, Postgres 17.6, pg_cron 1.6.4 and dependency resolutions. No hosted credentials are needed. The private runtime must not already exist. `stage.py` refuses to overwrite it or reuse a project with the owned name. It verifies ports 63061-63064 and 3383 before creation.

Run each command separately from the repository root. Read each result before the next command.

```sh
python3 probes/reminder-368-r1/stage.py
```

```sh
ACTIONS_CONTENT_QUERY_URL=http://host.docker.internal:3383/content supabase start --workdir probes/reminder-368-r1/.runtime/supabase/tests/companion-actions
```

```sh
python3 probes/reminder-368-r1/run.py --preflight
```

```sh
python3 probes/reminder-368-r1/run.py
```

The content URL is set before container creation. The preflight reads the actual container environment and all project/workdir labels. No test starts a content server. These custom-task operations do not call content. All tracked service files and required web/mobile locale inputs remain in the private runtime. The optional composition export is removed from the test environment.

For a repeat after a failed run, reset only this stack. Then restart only its REST container to clear the old database pool. Run the preflight again before the tests. Never reset the retained native project.

```sh
supabase db reset --workdir probes/reminder-368-r1/.runtime/supabase/tests/companion-actions --local
```

```sh
docker restart supabase_rest_unify-reminder-probe-368-r1
```

Stop and remove only the owned stack and its local volumes after evidence capture.

```sh
supabase stop --workdir probes/reminder-368-r1/.runtime/supabase/tests/companion-actions --no-backup
```

## Evidence and limits

The final local run passed 11 tests. Three deliberate mutations failed at assertion level. They removed the due-read owner filter, removed the cancellation/task filter, and removed the worker's due-time comparisons. The test restored each function. It removed all future events created by the due-time mutation. No mutation survived. The run recorded both claim-first and stop-first orders for completion and removal. Each order included committed intermediate state and lock waits.

Persistence and identity: two simultaneous authenticated retries produced one schedule and one event. Changed-payload reuse failed. A foreign account could not schedule, inspect the receipt or read the due event. Scheduler: actual pg_cron runs created due events. A stopped job and an injected failed run left persistence intact. Delivery boundary: a failed due read returned HTTP 500 without changing task state. A recovered read returned the due event. These checks prove server visibility only.

Cancellation and recovery: completion, approved removal and explicit cancellation stopped schedules after a claim. The worker could not claim after a stop committed. Reopen, Undo and old retry left schedules stopped. Full merged rollback archived the pending schedule as `cancelled/schema_rollback`. Reapplication and old retry restarted zero schedules. Time conversion: the gap and offset-free fold failed; the two explicit fold instants stayed one hour apart after the session zone change.

The copied operation registry typecheck passed. The probe typecheck passed after an explicit `string[]` annotation. The behavioral run used the same runtime statements before that type-only correction. Python compilation also passed. No application source changed, so app tests and native exports were not run for this prototype.

The console telemetry check inspected 82 matching action-result events from the final run window. It found only the six allowed event fields. It found no owner or private-content field. This checks that console event schema. It does not prove any client analytics behavior.

Cleanup removed the owned containers, volumes and network. All five reserved ports are free. The six retained native containers remain stopped or created. The web reference remains clean at its fixed base and tree. The ignored private source/cache runtime remains available for review. No scheduler remains active for this probe.

`PLAN.md` lists the falsifiers and options before code. `evidence/source-manifest.json` pins the merged foundations and every copied service file before the local patch. `stage.py` holds the complete patch. `evidence/container-preflight.json` records the actual runtime location and content environment. `evidence/results.json` holds assertion results and intermediate lock observations. Failed attempts and setup errors remain in `evidence/`. Only deliberate mutations that fail with `AssertionError` count as RED. A deadline, crash or setup error stays unresolved.

The test uses real local GoTrue JWTs, PostgREST, Edge runtime, PostgreSQL transactions and the pg_cron background worker. Synthetic fixture creation uses existing Checklist table access. Shared `apply`, `status`, `read`, task removal review and Undo requests exercise the actual merged service. SQL supplies fixtures, barriers, controlled faults and readback. The barriers pause real transactions. They do not call the worker. No test calls `probe368.tick()` to produce a due event.

The three client platform values pass through the shared service. They are not three rendered clients. The prototype proves no native behavior, accessibility, push, user-visible display, deep link, full reminder authorization flow or account-switch cache behavior. Tickets 367 and 370 remain unaccepted for native criterion 8. This probe accepts no ticket.

Hosted grants, Cron installation and scheduler permissions, service account execution, PostgREST cache behavior, deployment, client delivery and operational limits remain unproved. Local scheduler permission errors are retained. No hosted or provider call, web edit, deployment, push, PR change or integration change is authorized or made.

## Official references checked in this wave

- [Supabase Cron](https://supabase.com/docs/guides/cron) describes SQL jobs, the pg_cron engine and its job/run tables.
- [pg_cron primary documentation](https://github.com/citusdata/pg_cron) describes real background execution, named schedules and `cron.alter_job`.
- [PostgreSQL row and advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html) supplies the lock semantics checked by the barriers.
- [PostgreSQL ambiguous timestamps](https://www.postgresql.org/docs/17/datetime-invalid-input.html) explains why bare local timestamps need explicit handling at DST boundaries.
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) supplies the native scheduling alternative. This probe makes no Expo scheduling call.
- [Supabase changelog](https://supabase.com/changelog.md) was checked on 2026-10-29. The current TLS notice concerns hosted HTTP endpoints. The experiment uses loopback HTTP only. The initial web-tool fetch rejected Markdown, so a direct read fetched the index.
