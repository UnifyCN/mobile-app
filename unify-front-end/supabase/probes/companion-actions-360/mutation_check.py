#!/usr/bin/env python3
"""Proves the probe tests can fail. Each mutation breaks one mechanism of
candidate/up.sql (or, when marked 'down', candidate/down.sql); the named test file
must go red. A mutation that leaves the
suite green means the tests do not bind to that mechanism.

Only an assertion-level failure counts as RED: a test that failed with an
AssertionError. Everything else is UNRESOLVED and makes the run exit nonzero:
a timeout, a stack that did not start or reset (run.sh exit 2), a run with no
test summary, or a test that failed with any other error (connection refused,
TypeError, ...). On a timeout the runner stops only the process group it
started, never another task's processes.

Usage: ./mutation_check.py [mutation-name ...]   (default: all, about 10 minutes)
       PROBE_MUTATION_TIMEOUT=<seconds>          per mutation, default 300
Tests: python3 -I mutation_check_test.py
"""
import os, re, signal, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
up = open(os.path.join(here, 'candidate/up.sql')).read()
TIMEOUT_S = float(os.environ.get('PROBE_MUTATION_TIMEOUT', '300'))

USER_TASKS_BEFORE_COMPLETION = """    if new.completed is true and old.completed is distinct from true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    if new.completed is distinct from old.completed
       or new.progress_state is distinct from old.progress_state then
      new.state_updated_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger companion_user_tasks_before"""

CUSTOM_BEFORE = """    new.revision := old.revision + 1;
    if new.completed is true and old.completed is distinct from true then
      new.progress_state := null; new.waiting_reason := null;
    end if;
    if new.completed is distinct from old.completed
       or new.progress_state is distinct from old.progress_state then
      new.state_updated_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger companion_custom_tasks_before"""

SELECT_POLICY = ("create policy \"Users can read own custom checklist tasks\" on public.custom_checklist_tasks\n"
                 "  for select using (auth.uid() = user_id and removed_at is null);")

CANONICAL_REF = r"'^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'"
LOOSE_REF = r"'^(sanity:.{1,200}|custom:[0-9]{1,18})$'"

MUTATIONS = [
    ('no-advisory-lock',
     lambda s: s.replace("  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));\n", ""),
     'actions_test.ts'),
    ('no-lock-timeout',
     lambda s: s.replace("  perform set_config('lock_timeout', '3s', true);   -- a stuck writer must not hold callers for the 2 min statement timeout\n", ""),
     'actions_test.ts'),
    ('no-row-lock-on-custom-task',
     lambda s: s.replace("where id = v_key::bigint and user_id = p_user for update;", "where id = v_key::bigint and user_id = p_user;"),
     'actions_test.ts'),
    ('no-revision-check-on-custom-task',
     lambda s: s.replace("      if v_ct.revision <> v_expected then", "      if false then"),
     'actions_test.ts'),
    ('reminders-not-cancelled',
     lambda s: s.replace("set status = 'cancelled', cancelled_reason = p_reason", "set status = 'pending', cancelled_reason = p_reason"),
     'actions_test.ts'),
    ('removed-tasks-visible-to-old-clients',
     lambda s: s.replace("for select using (auth.uid() = user_id and removed_at is null);", "for select using (auth.uid() = user_id);"),
     'actions_test.ts'),
    ('approval-not-bound-to-operations',
     lambda s: s.replace("       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'\n     returning p.id into v_prop;",
                         "       and p.status = 'draft'\n     returning p.id into v_prop;"),
     'actions_test.ts'),
    ('operation-id-global-not-per-account',
     lambda s: s.replace("  primary key (user_id, operation_id)\n", "  primary key (operation_id)\n"),
     'actions_test.ts'),
    ('legacy-completion-keeps-waiting-detail',
     lambda s: s.replace(USER_TASKS_BEFORE_COMPLETION, USER_TASKS_BEFORE_COMPLETION.replace(
         "    if new.completed is true and old.completed is distinct from true then\n      new.progress_state := null; new.waiting_reason := null;\n    end if;\n", "")),
     'actions_test.ts'),
    ('legacy-write-does-not-bump-revision',
     lambda s: s.replace(CUSTOM_BEFORE, CUSTOM_BEFORE.replace("    new.revision := old.revision + 1;\n", "")),
     'actions_test.ts'),
    ('migration-hides-all-custom-tasks-from-old-clients',
     lambda s: s.replace(SELECT_POLICY, SELECT_POLICY.replace("auth.uid() = user_id and removed_at is null", "false")),
     'migration_test.ts'),
    # Review findings of #360 round 1.
    ('proposal-checked-without-consuming',   # finding 1: check, then mark applied later
     lambda s: s.replace("    update public.companion_proposals p set status = 'applied'\n     where p.id = (p_auth->>'proposal_id')::uuid",
                         "    select p.id into v_prop from public.companion_proposals p\n     where p.id = (p_auth->>'proposal_id')::uuid")
                .replace("       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'\n     returning p.id into v_prop;",
                         "       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft';")
                .replace("  insert into public.companion_action_receipts (user_id, operation_id, request_hash,",
                         "  if p_authorization->>'kind' = 'approved_proposal' then\n"
                         "    update public.companion_proposals set status = 'applied' where id = (p_authorization->>'proposal_id')::uuid;\n"
                         "  end if;\n"
                         "  insert into public.companion_action_receipts (user_id, operation_id, request_hash,"),
     'regressions_test.ts'),
    ('receipts-not-restored-after-rollback',   # finding 2
     lambda s: s.replace("     where a.source = 'companion_action_receipts' and a.restored_at is null order by a.id",
                         "     where false"),
     'rollback_test.ts'),
    ('revisions-kept-after-rollback',   # finding 2: pre-rollback revisions must go stale
     lambda s: s.replace("  update public.user_tasks set revision = 2;\n  update public.custom_checklist_tasks set revision = 2;\n", "")
                .replace("      revision = r.revision + 1,", "      revision = r.revision,"),
     'rollback_test.ts'),
    ('set-state-without-state',   # finding 3
     lambda s: s.replace("      if jsonb_typeof(v_op->'state') is distinct from 'string'\n         or (v_op->>'state') not in",
                         "      if (v_op->>'state') not in"),
     'regressions_test.ts'),
    ('loose-task-ref-grammar',   # finding 4
     lambda s: s.replace(CANONICAL_REF, LOOSE_REF),
     'regressions_test.ts'),
    # Spec review round 2: legacy writes made while rolled back.
    ('restore-keeps-deleted-plan-references',
     lambda s: s.replace("   where p.id = pt.plan_id and pt.task_ref like 'custom:%'\n     and not exists", "   where false\n     and not exists", 1),
     'rollback_test.ts'),
    # Spec review round 3, rollback reminder policy: a full rollback stops every pending
    # reminder; re-application restarts none, also from an archive of the earlier candidate.
    ('rollback-keeps-reminders-pending',
     lambda s: s.replace("   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now()\n where status = 'pending';\n",
                         "   set status = status\n where status = 'pending';\n", 1),
     'rollback_test.ts', 'down'),
    ('rollback-rewrites-stopped-history',
     lambda s: s.replace("   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now()\n where status = 'pending';\n",
                         "   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now();\n", 1),
     'rollback_test.ts', 'down'),
    ('older-archive-restored-pending',
     lambda s: s.replace("              case when a.row_data->>'status' = 'pending'\n", "              case when false\n", 1),
     'rollback_test.ts'),
    ('older-archive-stopped-at-restore-time',
     lambda s: s.replace("                                                         'cancelled_at', a.archived_at)\n",
                         "                                                         'cancelled_at', now())\n", 1),
     'rollback_test.ts'),
]

UNRESOLVED = 'UNRESOLVED'
FAILED_TEST = re.compile(r'^(.*?) \.\.\. FAILED', re.M)
ERROR_HEAD = re.compile(r'^(.*?) => \./\S+:\d+:\d+$')
ERROR_KIND = re.compile(r'^error: (\w+)')
SUMMARY = re.compile(r'^(ok|FAILED) \| \d+ passed', re.M)


def classify(returncode, output, timed_out):
    """One result line for a mutation run. Pure: unit-tested in mutation_check_test.py."""
    if timed_out:
        return f'{UNRESOLVED}: timed out after {TIMEOUT_S:g}s (no assertion-level result)'
    text = re.sub(r'\x1b\[[0-9;]*m', '', output)
    if returncode == 2:
        return f'{UNRESOLVED}: stack did not start or reset (run.sh exit 2)'
    if not SUMMARY.search(text):
        return f'{UNRESOLVED}: no test summary (exit {returncode})'
    failed = sorted(set(FAILED_TEST.findall(text)))
    if not failed:
        return 'STILL GREEN (tests do not bind)' if returncode == 0 else f'{UNRESOLVED}: exit {returncode} with no failed test'
    kinds, current = {}, None   # test name -> error class, from the ERRORS section
    for line in text.splitlines():
        head = ERROR_HEAD.match(line)
        if head:
            current = head.group(1)
            continue
        kind = ERROR_KIND.match(line)
        if kind and current is not None:
            kinds.setdefault(current, kind.group(1))
            current = None
    asserted = [n for n in failed if kinds.get(n) == 'AssertionError']
    other = [f'{n} ({kinds.get(n, "no error block")})' for n in failed if n not in asserted]
    if not asserted:
        return f'{UNRESOLVED}: failures are not assertion-level: ' + ' | '.join(other)
    return 'RED: ' + ' | '.join(asserted) + (f'  [also failed, not counted: {" | ".join(other)}]' if other else '')


def run_isolated(cmd, env, timeout_s):
    """Runs cmd in its own process group. On timeout, stops that group only."""
    p = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, start_new_session=True)
    try:
        out, _ = p.communicate(timeout=timeout_s)
        return p.returncode, out, False
    except subprocess.TimeoutExpired:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(p.pid, sig)
            except ProcessLookupError:
                break
            try:
                out, _ = p.communicate(timeout=5)
                break
            except subprocess.TimeoutExpired:
                out = ''
        return p.returncode, out or '', True


def main(only):
    results = []
    for name, mutate, test, *target in MUTATIONS:
        if only and name not in only:
            continue
        which = target[0] if target else 'up'
        source = up if which == 'up' else open(os.path.join(here, 'candidate/down.sql')).read()
        mutated = mutate(source)
        if mutated == source:
            results.append((name, 'MUTATION DID NOT APPLY'))
            continue
        path = os.path.join(tempfile.gettempdir(), f'{which}_mut_{name}.sql')
        open(path, 'w').write(mutated)
        env = dict(os.environ, **{f'PROBE_CANDIDATE_{which.upper()}': path})
        code, out, timed_out = run_isolated([os.path.join(here, 'run.sh'), test], env, TIMEOUT_S)
        results.append((name, classify(code, out, timed_out)))
        print(f'progress {name} -> {results[-1][1][:60]}', file=sys.stderr, flush=True)

    for name, r in results:
        print(f'{name}: {r}')
    red = sum(r.startswith('RED') for _, r in results)
    print(f'total={len(results)} red={red} not_red={len(results) - red}')
    return 0 if results and red == len(results) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
