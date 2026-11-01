# Ticket 368 reminders

Status: HOLD for independent review and the remaining native and hosted checks. The local service and rendered-client checks have finished. This implementation does not accept ticket 368, tickets 367 or 370, native criterion 8, or a release.

The root restored the local test boundary with an internal-disk source copy. The R3 continuation used that running service. It made no product change. The earlier failed attempts remain in their original evidence directories. See [the R3 handoff](evidence/368-reminders-internal-r3/HANDOFF.md) for source pins, results, limits and cleanup.

## Ownership and composition

Postgres owns one-shot schedules and unique due events. The authenticated companion-actions service owns writes and reads. One named pg_cron job scans schedules. No service key, external scheduler, model call, push, email or recurrence was added.

The mobile base is 61a4134c786c37f65a02baca2364fd7e18ea2509. The web base is 914e4f54b08deaa9cf48e25aa86041720e6296db. Both include the accepted removed-receipt correction. Mobile merged approved probe 559b56d99e21c0bd9f30928245a1d6a53e85bbe6 in composition commit b29e9346e0f26809cc0ebc71a77fc90ff0cc9460. The historical probe files and evidence did not change.

The accepted foundation order remains 361, 363, 364, 366, 365, 370, 367. The CLI generated 20261029175439_companion_task_reminders.sql as the next migration. Its down script is mirrored in both repositories. No applied foundation migration or rollback changed. The new wrappers preserve the preceding function bodies and ACLs under fixed names. Rollback restores those names and bodies. The shared client contract, client, store, analytics and reminder contract are byte-identical. The deployed action service remains in the web repository.

The evidence includes the full ancestor sets of both integration bases. A fresh read of both integration worktrees found the same clean base commits. No later accepted integration change required composition.

## Authorization and time

The operation registry adds reminder.schedule and reminder.cancel. Both use operation IDs, task revisions, reminder revisions where relevant, immutable receipts and the existing lookup-before-retry store. The owner comes only from authentication.

A direct schedule command names one task title, an ISO date and time with an explicit UTC offset, and an IANA zone. The service reads the caller's own user message. It resolves one exact authorized target. A foreign or assistant message cannot authorize it. One message can authorize one committed operation. The seven deterministic command forms are in the service's reminders.ts. A missing value, ambiguous target or different submitted time cannot authorize a write.

An assistant reminder tag is proposal data only. It must name a task shown to that answer. It carries no approval. The action service prepares a server-owned draft. Approval must name that exact draft revision and operations hash. Changed task or reminder context requires a new review. An unchanged safe retry retains the same operation ID and approval.

The review shows the date, time, UTC offset and named zone. SQL validates that the explicit instant maps to the exact requested wall time in that zone. A DST gap fails. A repeated time requires its explicit offset. The UI also rejects an offset-free value. The saved instant is UTC. Rendering always uses the saved zone, so a device-zone change does not reschedule it.

Published-content parents require a successful current content read before preparation and execution. The shared parent helper serializes the task even when no progress row exists. A replay of an already saved reminder does not need a new content lookup; SQL still checks its exact request hash.

## Persistence, cancellation and Undo

There is at most one pending reminder per task and account. A schedule change cancels its predecessor and inserts a new identity with replaces_id. It does not edit the old instant. Status changes increase the reminder revision and append private history. Due events are unique by reminder identity.

A due claim leaves the schedule pending. The accepted lifecycle triggers can therefore cancel both claimed and unclaimed schedules in the same transaction as completion or removal. A due read joins current task and reminder state. Opening, reading or claiming a reminder changes no task state.

Cancellation requires explicit confirmation. A receipt names the exact saved reminder action. Undo of scheduling stops only the identity that receipt created. It leaves later schedules and stopped predecessors unchanged. Undo of cancellation records the stopped result and leaves the schedule stopped. The interface explains that starting again requires a new time review. Task reopen, task Undo and removal recovery do not restart reminders.

Full rollback unschedules the worker first. It cancels pending reminders with schema_rollback. Private history and due events remain. Reminder receipts and proposals are archived before the preceding contract is restored. Reapplication restores receipts and time metadata, keeps drafts cancelled and keeps schedules stopped. Archive receipt identity includes the account, so identical operation IDs in different accounts cannot overwrite each other. New explicit scheduling is required after a service interruption.

A gate-only disable does not perform this schema rollback. Existing schedules are not restarted or rewritten by a gate flip.

## Worker and failures

The production cadence is one minute. Each worker transaction attempts at most 50 candidates. A private circular cursor advances before each attempt, including a busy attempt. A locked group therefore cannot prevent later due work from receiving an attempt. Unlocked failures receive a 30-second retry delay.

The worker takes the accepted parent boundary before the reminder/event boundary. A 200 ms lock timeout bounds a busy parent wait. A failed item's subtransaction releases its locks before retry metadata is written. Normal completion or removal races are skipped. Other item failures retain only a SQLSTATE and an error count. One failed item does not abort later items.

The read distinguishes saved schedules, due events and scheduler readiness. Readiness uses job activity, a recent heartbeat, the last completed Cron run, pending errors for the caller and the last worker error count. A saved receipt proves persistence. An event proves worker execution. A due read proves server visibility. None proves display, observation or delivery. The service returns not_observed for delivery. No delivery acknowledgement was added.

## Clients and privacy

The existing mobile task sheet and web overlay drawer contain the controls. Compact proposal cards open the task review there. The task lists show persisted and due reminders. Navigation retains the full custom: or sanity: reference, including a content-backed task that has no active Checklist or progress row. It does not reduce identity to a numeric ID.

The action path is independent of AI allowance. Drafts remain in the account's existing action store. Pending reminders and failed reads refresh every five seconds. Foreground/reconnect and task changes also refresh progress. Offline or stale reads block writes. The store never queues an approval for silent execution on reconnect.

Both transports check the captured account and epoch after a response. Review callbacks check ownership before display. An account change clears private query/store work and reminder navigation. A same-account token refresh retains drafts. Server due state is reconciled after task changes; stale due labels and reminder navigation are withheld after a read failure.

New copy has real strings in all seven existing locales. Existing locale values remain unchanged. Mobile controls use 44 pt iOS and 48 dp Android minima. The sheet retains keyboard avoidance and live text sizing. Web retains its shared drawer, Reveal, keyboard/focus and reduced-motion rules. A saved result receives native accessibility focus after layout, subject to the account check. These code paths still need observed native checks.

Analytics use the existing categorical action event with reminder_change and the registered operation types. No reminder time, zone, task reference, title, message text, owner or account field was added to analytics.

## Validation and qualification

The R3 continuation ran the remaining 37 service files: 244 passed, zero final failures. The root supplied the unchanged reminders_test.ts result: 10 passed and three assertion-level mutations. The combined service set has 254 passes across 38 files. The continuation did not repeat the root-passed file. The handoff retains the complete file distribution and every failed attempt.

All ten cancellation orders passed with actual Cron workers, observed lock waits, intermediate committed reads and final public reads. The supplied reminder file covers duplicate retry, unknown results, owner isolation, content parents, revisions, schedule changes, Undo, clock boundaries, worker/read failures, bounded scans and rollback/reapply. The older regression files retain their existing foundation and migration fixtures. They do not each exercise the full reminder schema.

The mobile rendered test and the English 390-pixel Chromium path each passed against real local Auth, JWT, actions and Cron. The browser record includes persisted readbacks and HTTP status, size and timing. These checks establish rendered controls and local persistence. They do not establish a native workflow, the actual Next.js shell, observed delivery or screen-reader behavior.

Both corrected service test files pass normal Deno checks. A broader normal check of all 37 files fails with six errors in three unchanged older tests. Those test and support inputs match the accepted integration. No suppression or unrelated fix was made. The exact-source client gates and complete 277-test, 19-file Edge fixture result remain supplied evidence.

The assigned service, data volumes and network were removed. All six reserved ports are free on IPv4 and IPv6. The internal source and useful caches remain. The 33 protected container identities and mount sets and all 18 protected volume names remain unchanged.

Required follow-up: fresh independent SPEC and STANDARDS review, review of the recorded normal-type failure, hosted Cron/grants/cache/deployment checks, and observed iOS/Android keyboard, text scale, focus, VoiceOver and TalkBack checks. Native exports and rendered fixtures do not replace these checks.
