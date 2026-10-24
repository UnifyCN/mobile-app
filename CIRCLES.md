# Circle pause and restoration

Circles remains in the repository. The pause preserves the stored Circle rows.
The Community tab keeps its events, news, and groups.

## Controls

- `unify-front-end/constants/Features.ts`: `CIRCLES_ENABLED` controls the Circle card, onboarding card, routes, and notification links in new app builds.
- `public.set_circles_enabled(boolean)`: the database admin control stops or restores the Circle jobs and database access. Only `postgres` can call it.
- `public.circles_feature_enabled()`: the Edge Function reads this control before it starts a matching run. An unavailable control stops the worker.

The database pause hides Circle rows from client roles. It blocks Circle inserts
and updates, including service-role writes. It stops the five Circle work RPCs
before they act. It hides Circle notifications and leaves social notifications
available. DELETE cascades remain available for account cleanup.

The matching worker also handles daily prompts, day 13 reminders, expiry, and
old Circle deletion. Its pause stops all these tasks. The Edge Function remains
deployed so restoration does not require a server deployment.

Each push batch checks the control again. A notification write that rejects the
pause also stops delivery. A request can hold an earlier enabled response and
start a batch after the database pause starts. Treat these requests as active
until the drain period ends. A push already accepted by Expo cannot be recalled.

## Apply the pause

1. Deploy `matchmake-circles` with the flag checks. Keep its existing `verify_jwt = false` setting. The handler checks its scheduler key or service-role authorization. Before the control exists, it returns 503 and performs no matching work.
2. Apply `unify-front-end/supabase/migrations/20261024185043_pause_circles.sql` to the intended project.
3. Verify the deployed function, the disabled control, and the inactive Circle jobs. Record the UTC time after all three checks pass.
4. Allow at least seven minutes after that time for active requests to end. Do not report the pause complete before this period ends.
5. Check the control and jobs again. Verify an authorized worker request returns paused. Verify the stored Circle rows and unrelated jobs remain intact.
6. Release the app changes. A database pause cannot remove a card from an already installed app build.

The seven-minute period exceeds the current hosted worker limit of 400 seconds.
The limit includes waits for HTTP responses and background work. Check the
[Supabase runtime limits](https://supabase.com/docs/guides/functions/limits)
before using this procedure again. Increase the period if that limit increases.

The migration calls this command:

```sql
select public.set_circles_enabled(false);
```

It saves the current activity settings for `community-matching-schedule`,
`close-expired-circles`, and the legacy `community-matching-cron`, if present.
It then deactivates those jobs. It preserves their schedules and commands.
A repeated pause does not replace the saved activity settings.

The shared Supabase project, shared notification service, and other jobs remain
active. There is no separate Circle server in `unify-back-end`.

## Restore Circles

Review the retained waitlist and Circle end dates first. The pause does not extend
deadlines. After restoration, the worker can match the retained waitlist, close
expired Circles, and delete ended Circles under its existing rules.

1. Run this command as the database admin:

   ```sql
   select public.set_circles_enabled(true);
   ```

2. Set `CIRCLES_ENABLED` to `true` in `unify-front-end/constants/Features.ts`.
3. Test the app and release the app update.

The database command restores the saved job activity settings. It keeps a job
inactive if that job was inactive before the pause. It does not enable unrelated
jobs. The original membership policies still control access after restoration.

## Verify the database state

```sql
select public.circles_feature_enabled();

select jobname, schedule, active
from cron.job
where jobname in (
  'community-matching-schedule',
  'community-matching-cron',
  'close-expired-circles'
)
order by jobname;
```

Check client access with an authenticated session. While paused, Circle queries
must return no rows. A waitlist RPC must reject the request. Social notifications
must remain visible to their recipient. An authorized matching request must
return `{"ok":true,"paused":true}` without creating a matching run.

## Verification commands

From `unify-front-end`:

```sh
npm run test:ci
npm run typecheck
npm run lint
npm run check-i18n
npx expo export --platform ios --platform android
```

From the repository root:

```sh
deno test --node-modules-dir=none --allow-read --allow-env \
  unify-front-end/supabase/tests/pause_circles_sql_test.ts \
  unify-front-end/supabase/functions/matchmake-circles/index_test.ts
```

The SQL test uses PostgreSQL through PGlite. It substitutes the cron module and
the old RPC bodies. The handler test uses the real handler and Supabase query
builder with HTTP responses supplied by the test. These tests do not prove a
production deployment or native screen appearance.

The account cleanup test covers a user with memberships, a waitlist row, match
history, and recipient and actor notifications. It preserves another user's
social notification. It does not cover deletion of a user who authored a retained
Circle message. The existing database sender constraint rejects that deletion
even before this pause change.

## Verified production state on 2026-10-24

The server pause completed after the seven-minute drain. The final checks ran
after 18:58 UTC. Production project: `wrbauxutkysljmsqojts`.

- `matchmake-circles` version 47 matches the repository files. Its JWT gateway setting remains false. The handler still checks authorization.
- The control is false. Both Circle jobs are inactive. Their schedules and commands remain intact. All ten unrelated jobs retain their activity, schedules, and command hashes.
- Before and after row hashes match for two Circles, eight memberships, 63 waitlist rows, 87 match-history rows, 30 messages, and eight Circle notifications.
- The matching-run count stayed at 93,854 through the drain period and the final authorized HTTP probe.
- All 14 original Community policies and all six original Circle RPC permission lists remain intact. The five worker RPC bodies equal their earlier bodies plus the pause check.
- Hosted authenticated-role checks block Circle reads and writes while preserving social notification access. A rollback-only restoration check restores saved job activity and member access. It preserves nonmember restrictions and leaves production paused.
- The final scheduler-auth probe, request `145017`, returned HTTP 200 with 25 response bytes: `{"ok":true,"paused":true}`. The earlier two-header probe was request `145016`. Credentials stayed in Vault.

Local validation passed: 1,209 main app tests, 13 DST tests, 217 server tests,
TypeScript, lint with zero errors, translation parity, and iOS and Android bundle
exports. Independent review accepted the corrected pause and restoration cases.
The web preview stopped on the existing SecureStore server-rendering error.
Native appearance was not verified.

The app changes are on `feat/pause-circles`. They have not been released to users.
Existing installed builds can still show the old Circle card until an app update.
