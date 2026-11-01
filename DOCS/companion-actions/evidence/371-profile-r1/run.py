"""Check owned container identity before each real-service test. Never print keys."""
from pathlib import Path
import json, os, subprocess, sys, time

HERE = Path(__file__).resolve().parent
RUN = HERE.parents[3] / 'build/profile-371-r1'
STACK = RUN / 'supabase/tests/companion-actions'
PROJECT = 'unify-profile-371-r1'
env = {k:v for k,v in os.environ.items() if not k.startswith('ACTIONS_') and k not in {
    'EXPO_ACCESS_TOKEN','OPENAI_API_KEY','ANTHROPIC_API_KEY','SANITY_API_TOKEN','SANITY_READ_TOKEN','SANITY_WRITE_TOKEN'}}
env.update(DENO_DIR=str(RUN / 'deno-cache'), ACTIONS_CONTENT_PORT='3456',
           ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3456/content',
           ACTIONS_MOBILE_LOCALES=str(RUN / 'unify-front-end/i18n/locales'),
           ACTIONS_PROFILE_PRIVATE_FIXTURE=str(RUN / 'browser-private.json'),
           ACTIONS_DB_CONTAINER='supabase_db_' + PROJECT,
           ACTIONS_REST_CONTAINER='supabase_rest_' + PROJECT)
raw = subprocess.check_output(['supabase', 'status', '--workdir', str(STACK), '-o', 'env'],
                              stderr=subprocess.DEVNULL, text=True)
for line in raw.splitlines():
    if '=' in line:
        key, value = line.split('=', 1)
        env['ACTIONS_' + key] = value.strip('"')
assert env['ACTIONS_API_URL'] == 'http://127.0.0.1:64510'
assert '@127.0.0.1:64511/' in env['ACTIONS_DB_URL']
rows = []
for kind in ['db', 'auth', 'rest', 'kong', 'edge_runtime']:
    name = 'supabase_' + kind + '_' + PROJECT
    info = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]
    labels = info['Config']['Labels']
    assert labels['com.supabase.cli.project'] == PROJECT
    assert labels['com.supabase.cli.workdir'] == str(STACK)
    assert info['State']['Running']
    row = {'name': name, 'labels': labels, 'mounts': info['Mounts']}
    if kind == 'edge_runtime':
        values = dict(v.split('=', 1) for v in info['Config']['Env'])
        assert values['COMPANION_CONTENT_QUERY_URL'] == env['ACTIONS_CONTENT_QUERY_URL']
        row['content_url'] = values['COMPANION_CONTENT_QUERY_URL']
    rows.append(row)
(HERE / 'container-preflight.json').write_text(json.dumps(rows, indent=2) + '\n')
if sys.argv[1:] == ['--preflight']:
    print('PASS owned labels, workdir, content URL, database and REST containers')
    raise SystemExit(0)
label, *args = sys.argv[1:]
command = ['deno', 'test', '--no-check', '--node-modules-dir=none',
           '--allow-net=127.0.0.1:64510,127.0.0.1:64511,127.0.0.1:64514,127.0.0.1:64515,127.0.0.1:64516,127.0.0.1:3456',
           '--allow-run' if 'push_process_test.ts' in args else '--allow-run=deno,docker',
           '--allow-env', '--allow-read', '--allow-write=' + str(HERE) + ',' + str(RUN), *args]
start = time.time()
with (HERE / (label + '.log')).open('w') as log:
    result = subprocess.run(command, cwd=STACK, env=env, stdout=log, stderr=subprocess.STDOUT)
(HERE / (label + '-command.json')).write_text(json.dumps({
    'command': command, 'cwd': str(STACK), 'exit': result.returncode,
    'seconds': round(time.time() - start, 3), 'db_container': env['ACTIONS_DB_CONTAINER'],
    'rest_container': env['ACTIONS_REST_CONTAINER']}, indent=2) + '\n')
print((HERE / (label + '.log')).read_text()[-6000:])
raise SystemExit(result.returncode)
