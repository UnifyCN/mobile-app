"""Builds one-mechanism faults of the composed #370 migration/rollback (copies under
faults/), runs the two compose test files against the owned stack with each, and records
pass/fail counts and the first failure line. A fault must fail by assertion."""
import json, os, re, subprocess, sys
E = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = '/tmp/unify-review-actions-361-web-r5-deno-base-9d05'
MIG = open(f'{W}/supabase/migrations/20261028004902_companion_saved_details.sql').read()
DOWN = open(f'{W}/supabase/rollbacks/20261028004902_companion_saved_details.down.sql').read()
REVIEWED_DOWN = subprocess.check_output(['git', '-C', W, 'show',
    '05ab5299:supabase/rollbacks/20261028004902_companion_saved_details.down.sql']).decode()
def cut(src, a, b=''):
    assert src.count(a) == 1, a[:60]
    return src.replace(a, b)
waiting = re.search(r"    -- #365: a state change saved with its waiting reasons names them\..*?else '\{\}'::jsonb end\n", MIG, re.S).group(0)
faults = {
  'F1-365-receipt-waiting-reasons': ('mig', cut(MIG, waiting)),
  'F2-365-validate-edit': ('mig', cut(MIG, "'task.remove_created', 'task.edit_details') then", "'task.remove_created') then")),
  'F3-370-apply-detail-dispatch': ('mig', cut(MIG, "  if p_op->>'type' like 'detail.%' then\n    return public.companion_apply_detail(p_user, p_op);\n  end if;\n")),
  'F4-rollback-restores-366-bodies': ('down', REVIEWED_DOWN),
  'F5-kind-check-drops-task_edit': ('mig', cut(MIG, "'step_create', 'task_edit', 'detail_create'));", "'step_create', 'detail_create'));")),
  'F6-370-undo-detail-dispatch': ('mig', cut(MIG, "  if v_target.outcome->'results'->0->>'type' like 'detail.%' then\n    return public.companion_undo_detail(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_target);\n  end if;\n")),
}
results = {}
for name, (kind, text) in faults.items():
    path = f'{E}/faults/{name}.sql'
    open(path, 'w').write(text)
    env = dict(os.environ, **({'ACTIONS_MIGRATION_370_FILE': path} if kind == 'mig' else {'ACTIONS_ROLLBACK_370_FILE': path}))
    r = subprocess.run([f'{E}/tools/owned.sh', 'timeout', '900', './run.sh', 'compose_365_370_test.ts', 'compose_rollback_test.ts'],
        cwd=f'{W}/supabase/tests/companion-actions', env=env, capture_output=True, text=True)
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    open(f'{E}/faults/{name}.log', 'w').write(out)
    counts = re.findall(r'^(ok|FAILED) \| (\d+) passed \| (\d+) failed', out, re.M)
    errors = re.findall(r'^error: (AssertionError[^\n]*|(?!Test failed)[^\n]*)', out, re.M)
    results[name] = {'exit': r.returncode, 'files': counts, 'first_errors': errors[:4],
        'assertion_only': all(e.startswith('AssertionError') for e in errors if e != 'Test failed')}
    print(name, results[name]['exit'], counts, results[name]['assertion_only'], flush=True)
json.dump(results, open(f'{E}/faults/sql-faults-results.json', 'w'), indent=1)
