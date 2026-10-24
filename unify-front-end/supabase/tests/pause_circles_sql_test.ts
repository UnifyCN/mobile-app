// Runs the shipped migration in PostgreSQL. Cron and the five old RPC bodies
// are narrow stand-ins. This tests SQL, roles, policies, guards, and restoration.
// It does not test pg_cron scheduling or the hosted Edge Function.
import { PGlite } from 'npm:@electric-sql/pglite@0.4.6';
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyMigration, rows } from './support/sharedDb.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TABLES = [
  'community_circles',
  'community_circle_members',
  'community_match_waitlist',
  'community_match_history',
  'community_messages',
  'community_matching_runs',
];
const RPCS = [
  'join_community_waitlist',
  'create_circle_match',
  'close_expired_circles_cron',
  'delete_expired_community_circles',
  'trigger_matchmake_circles',
];

Deno.test(
  'Circle pause preserves data, enforces roles, and restores the saved jobs',
  async t => {
    const db = new PGlite();
    async function asRole(role: string, action: () => Promise<void>) {
      await db.exec(
        `begin; set local role ${role}; set local request.jwt.claim.sub = '${USER_ID}';`
      );
      try {
        await action();
      } finally {
        await db.exec('rollback');
      }
    }
    async function snapshot() {
      return await rows(
        db,
        `select jsonb_build_object(${TABLES.map(
          name =>
            `'${name}', (select jsonb_agg(to_jsonb(t) order by id) from ${name} t)`
        ).join(
          ','
        )}, 'notifications', (select jsonb_agg(to_jsonb(t) order by id) from community_notifications t)) as data`
      );
    }
    try {
      await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create schema cron;
      create table cron.job (jobid bigint primary key, jobname text, active boolean, schedule text, command text);
      insert into cron.job values
        (1, 'community-matching-schedule', true, '*/3 * * * *', 'select matching()'),
        (2, 'close-expired-circles', true, '*/3 * * * *', 'select closing()'),
        (3, 'community-matching-cron', false, '*/5 * * * *', 'select legacy()'),
        (4, 'learn-reminders-daily', true, '0 14 * * *', 'select learning()');
      create function cron.alter_job(job_id bigint, schedule text default null, command text default null,
        database text default null, username text default null, active boolean default null)
      returns void language sql as $$ update cron.job set active = $6 where jobid = $1; $$;
      create table public.rpc_calls (name text);
      create table public.community_notifications (
        id uuid primary key default gen_random_uuid(), user_id uuid, type text, data jsonb, read_at timestamptz
      );
      alter table public.community_notifications enable row level security;
      create policy baseline on public.community_notifications for all to authenticated
        using (user_id = auth.uid()) with check (user_id = auth.uid());
      insert into public.community_notifications (user_id,type,data) values
        ('${USER_ID}', 'circle_matched', '{"circle_id":"original"}'),
        ('${USER_ID}', 'liked', '{"post_id":1}');
    `);
      for (const table of TABLES) {
        await db.exec(`
        create table public.${table} (id uuid primary key default gen_random_uuid(), user_id uuid, circle_id uuid, content text);
        alter table public.${table} enable row level security;
        create policy baseline on public.${table} for all to authenticated
          using (user_id = auth.uid()) with check (user_id = auth.uid());
        insert into public.${table} (user_id,circle_id,content) values ('${USER_ID}', gen_random_uuid(), 'retained');
      `);
      }
      await db.exec(`alter table community_circle_members add column left_at timestamptz;
      create function public.get_my_circle_ids() returns table(circle_id uuid)
      language sql security definer as $$ select circle_id from community_circle_members where user_id = auth.uid(); $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant all on all tables in schema public to anon, authenticated, service_role;`);
      for (const rpc of RPCS) {
        await db.exec(`create function public.${rpc}() returns void language plpgsql security definer
        set search_path = public as $$ begin insert into public.rpc_calls values ('${rpc}'); end; $$;
        revoke all on function public.${rpc}() from public;
        grant execute on function public.${rpc}() to service_role;`);
      }
      // Use real FK actions for account cleanup. The retained message has no
      // sender, so this does not test the older user-message sender constraint.
      await db.exec(`
        create table public.users (id uuid primary key);
        insert into public.users values ('${USER_ID}'), ('${OTHER_USER_ID}');
        alter table public.community_circle_members add foreign key (user_id) references public.users on delete cascade;
        alter table public.community_match_waitlist add foreign key (user_id) references public.users on delete cascade;
        alter table public.community_match_history add column user_a uuid references public.users on delete cascade;
        alter table public.community_match_history add column user_b uuid references public.users on delete cascade;
        update public.community_match_history set user_a='${USER_ID}',user_b='${OTHER_USER_ID}';
        alter table public.community_messages add column sender_user_id uuid references public.users on delete set null;
        alter table public.community_notifications add foreign key (user_id) references public.users on delete cascade;
        alter table public.community_notifications add column triggered_by_user_id uuid references public.users on delete cascade;
        insert into public.community_notifications (user_id,type,data) values ('${OTHER_USER_ID}','liked','{}');
        insert into public.community_notifications (user_id,type,data,triggered_by_user_id)
          values ('${OTHER_USER_ID}','followed','{}','${USER_ID}');
      `);
      const originalData = await snapshot();
      const originalJobs = await rows(
        db,
        'select * from cron.job order by jobid'
      );
      const originalAcls = await rows(
        db,
        `select proname,proacl::text from pg_proc where proname in (${RPCS.map(n => `'${n}'`).join(',')}) order by proname`
      );

      await applyMigration(db, 'pause_circles');

      await t.step(
        'pause changes no stored Circle rows or job definitions',
        async () => {
          assertEquals(await snapshot(), originalData);
          assertEquals(
            await rows(
              db,
              'select public.circles_feature_enabled() as enabled'
            ),
            [{ enabled: false }]
          );
          assertEquals(
            await rows(db, 'select jobid,active from cron.job order by jobid'),
            [
              { jobid: 1, active: false },
              { jobid: 2, active: false },
              { jobid: 3, active: false },
              { jobid: 4, active: true },
            ]
          );
          assertEquals(
            await rows(
              db,
              `select proname,proacl::text from pg_proc where proname in (${RPCS.map(n => `'${n}'`).join(',')}) order by proname`
            ),
            originalAcls
          );
        }
      );

      await t.step(
        'old clients cannot read Circle rows, but can read their social notifications',
        async () => {
          await asRole('authenticated', async () => {
            for (const table of TABLES)
              assertEquals(await rows(db, `select * from ${table}`), []);
            assertEquals(
              await rows(db, 'select * from public.get_my_circle_ids()'),
              []
            );
            assertEquals(
              await rows(db, 'select type from community_notifications'),
              [{ type: 'liked' }]
            );
            assertEquals(
              await rows(
                db,
                'select public.circles_feature_enabled() as enabled'
              ),
              [{ enabled: false }]
            );
          });
        }
      );

      await t.step(
        'service-role writes and all five RPCs stop before their first action',
        async () => {
          for (const table of TABLES) {
            await assertRejects(
              () =>
                asRole('service_role', async () => {
                  await db.exec(
                    `insert into ${table} (user_id) values ('${USER_ID}')`
                  );
                }),
              Error,
              'Circles are paused'
            );
            await assertRejects(
              () =>
                asRole('service_role', async () => {
                  await db.exec(`update ${table} set content = 'changed'`);
                }),
              Error,
              'Circles are paused'
            );
          }
          for (const rpc of RPCS) {
            await assertRejects(
              () =>
                asRole('service_role', async () => {
                  await db.exec(`select public.${rpc}()`);
                }),
              Error,
              'Circles are paused'
            );
          }
          assertEquals(await rows(db, 'select * from rpc_calls'), []);
        }
      );

      await t.step(
        'Circle notification writes stop while social writes still work',
        async () => {
          for (const [type, data] of [
            ['circle_matched', '{}'],
            ['circle_ending_soon', '{}'],
            ['circle_ended', '{}'],
            ['new_message', '{}'],
            ['liked', '{"circle_id":"old"}'],
          ]) {
            await assertRejects(
              () =>
                asRole('service_role', async () => {
                  await db.query(
                    'insert into community_notifications (type,data) values ($1,$2)',
                    [type, data]
                  );
                }),
              Error,
              'Circles are paused'
            );
          }
          await assertRejects(
            () =>
              asRole('service_role', async () => {
                await db.exec(
                  "update community_notifications set type='liked',data='{}' where type='circle_matched'"
                );
              }),
            Error,
            'Circles are paused'
          );
          await asRole('authenticated', async () => {
            await db.exec(`insert into community_notifications (user_id,type,data) values ('${USER_ID}','followed','{}');
          update community_notifications set read_at=now();`);
            assertEquals(
              await rows(
                db,
                'select type from community_notifications order by type'
              ),
              [{ type: 'followed' }, { type: 'liked' }]
            );
          });
        }
      );

      await t.step(
        'clients and the service role cannot change the pause control',
        async () => {
          for (const role of ['anon', 'authenticated', 'service_role']) {
            await assertRejects(
              () =>
                asRole(role, async () => {
                  await db.exec('select public.set_circles_enabled(true)');
                }),
              Error,
              'permission denied'
            );
            await assertRejects(
              () =>
                asRole(role, async () => {
                  await db.exec(
                    'update public.circles_feature_state set enabled=true'
                  );
                }),
              Error,
              'permission denied'
            );
          }
        }
      );

      await t.step(
        "account cleanup cascades remain available and preserve another user's social row",
        async () => {
          await asRole('postgres', async () => {
            await db.exec(`delete from public.users where id='${USER_ID}'`);
            for (const table of [
              'community_circle_members',
              'community_match_waitlist',
              'community_match_history',
            ]) {
              assertEquals(await rows(db, `select * from ${table}`), []);
            }
            assertEquals(
              await rows(
                db,
                'select user_id,type from community_notifications'
              ),
              [{ user_id: OTHER_USER_ID, type: 'liked' }]
            );
            assertEquals(
              (await rows(db, 'select * from community_circles')).length,
              1
            );
            assertEquals(
              (await rows(db, 'select * from community_messages')).length,
              1
            );
          });
          assertEquals(await snapshot(), originalData);
        }
      );

      await t.step(
        'repeat pause preserves the snapshot; resume restores original jobs, reads, writes, and RPCs',
        async () => {
          await db.exec(
            'select public.set_circles_enabled(false); select public.set_circles_enabled(true);'
          );
          assertEquals(
            await rows(db, 'select * from cron.job order by jobid'),
            originalJobs
          );
          assertEquals(await snapshot(), originalData);
          await asRole('authenticated', async () => {
            assertEquals(
              (await rows(db, 'select * from public.get_my_circle_ids()'))
                .length,
              1
            );
            for (const table of TABLES) {
              assertEquals(
                (await rows(db, `select * from ${table}`)).length,
                1
              );
              await db.exec(`update ${table} set content='resumed'`);
            }
          });
          await asRole('service_role', async () => {
            for (const rpc of RPCS) await db.exec(`select public.${rpc}()`);
            assertEquals(
              (await rows(db, 'select * from rpc_calls')).length,
              RPCS.length
            );
          });
          await db.exec('select public.set_circles_enabled(false);');
          assertEquals(await snapshot(), originalData);
        }
      );
    } finally {
      await db.close();
    }
  }
);
