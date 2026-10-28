"""Runs a command against this worker's own local stack (unify-details-370-corrections-r1).

Usage: run_checks.py sync            copy the current function source and restart the edge runtime
       run_checks.py clean           remove that copy (before app type and build gates)
       run_checks.py reset           db reset to the hosted-shape baseline, wait for PostgREST
       run_checks.py <command...>    run with ACTIONS_* env loaded in memory (never written)
Refuses unless both containers carry this project's label and this workdir.
"""
import json, os, shlex, shutil, subprocess, sys, time, urllib.request
from pathlib import Path
STACK = Path(__file__).resolve().parent
ROOT = STACK.parents[1]
PROJECT = 'unify-details-370-corrections-r1'
DB, REST, EDGE = (f'supabase_{k}_{PROJECT}' for k in ('db', 'rest', 'edge_runtime'))

def check_labels():
    for name in (DB, REST, EDGE):
        labels = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]['Config']['Labels']
        assert labels['com.supabase.cli.project'] == PROJECT, name
        assert Path(labels['com.supabase.cli.workdir']).resolve() == STACK, name

def env():
    e = dict(os.environ)
    out = subprocess.check_output(['supabase', 'status', '--workdir', str(STACK), '-o', 'env'], stderr=subprocess.DEVNULL, text=True)
    for line in out.splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            e['ACTIONS_' + k] = shlex.split(v)[0]
    assert e['ACTIONS_API_URL'].startswith('http://127.0.0.1:61531'), 'not this stack'
    e.update(ACTIONS_DB_CONTAINER=DB, ACTIONS_REST_CONTAINER=REST, ACTIONS_CONTENT_PORT='3224',
             COMPANION_SAVED_DETAILS_PORT='3186')
    return e

def rest_ready(e):
    subprocess.check_call(['docker', 'restart', REST], stdout=subprocess.DEVNULL)
    ok = 0
    for _ in range(120):
        req = urllib.request.Request(e['ACTIONS_API_URL'] + '/rest/v1/user_tasks?select=user_task_id&limit=1',
                                     headers={'apikey': e['ACTIONS_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + e['ACTIONS_SERVICE_ROLE_KEY']})
        try:
            code = urllib.request.urlopen(req, timeout=5).status
        except Exception:
            code = 0
        if code == 200:
            ok += 1
            if ok >= 5: return
        else:
            ok = 0; time.sleep(0.5)
    raise SystemExit('PostgREST never saw the reset schema')

check_labels()
cmd = sys.argv[1:]
print('COMMAND', cmd, flush=True)
if cmd == ['sync']:
    fn = STACK / 'supabase/functions'
    shutil.rmtree(fn, ignore_errors=True)
    (fn / 'rag-query').mkdir(parents=True)
    shutil.copytree(ROOT / 'supabase/functions/companion-actions', fn / 'companion-actions')
    shutil.copytree(ROOT / 'supabase/functions/rag-query/lib', fn / 'rag-query/lib')
    subprocess.check_call(['docker', 'restart', EDGE], stdout=subprocess.DEVNULL)
    raise SystemExit(0)
if cmd == ['clean']:
    # Remove the copied Deno sources so the app's tsc and build do not scan them.
    shutil.rmtree(STACK / 'supabase/functions', ignore_errors=True)
    raise SystemExit(0)
e = env()
if cmd == ['migrate']:
    # The shipped migrations (#361, #363, #364, #366, #370) in order, then the gate on.
    for f in ['20261025235536_companion_task_actions', '20261026165156_companion_task_create',
              '20261027183338_companion_settlement_plan',
              '20261027183644_companion_task_steps', '20261028004902_companion_saved_details']:
        sql = (ROOT / f'supabase/migrations/{f}.sql').read_text()
        subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'postgres',
                        '-1'], input=sql, text=True, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', 'postgres'],
                   input="update public.companion_feature_gate set enabled = true, min_contract_version = 1, max_contract_version = 1, allowed_platforms = '{ios,android,web}';",
                   text=True, check=True, stdout=subprocess.DEVNULL)
    subprocess.check_call(['docker', 'kill', '--signal=SIGUSR1', REST], stdout=subprocess.DEVNULL)
    time.sleep(2)
    raise SystemExit(0)
if cmd == ['reset']:
    subprocess.check_call(['supabase', 'db', 'reset', '--workdir', str(STACK), '--local'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rest_ready(e)
    raise SystemExit(0)
raise SystemExit(subprocess.call(cmd, cwd=os.environ.get('RUN_CWD', ROOT), env=e))
