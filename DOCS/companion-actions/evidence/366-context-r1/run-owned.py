"""Runs deno test files of the web companion-actions suite against the owned stack only.
Usage: python3 -I run-owned.py <log-name> <test file>... ; env overrides pass through
(ACTIONS_MIGRATION_366_FILE etc.). Checks project labels/ports before any request.
No db reset, no container restart. Writes <log-name>.log and appends to exits.json."""
import subprocess, os, json, sys, pathlib, time, re
R = pathlib.Path('/tmp/unify-merge-362-web')
T = R / 'supabase/tests/companion-actions'
E = pathlib.Path('/Users/savargupta/.t3/worktrees/Unify/t3-8e4ba83b/DOCS/companion-actions/evidence/366-context-r1')
PROJECT = 'unify-actions-366-context-race-r1'
st = json.loads(subprocess.run(['supabase', 'status', '--workdir', str(T), '-o', 'json'], capture_output=True, text=True, check=True).stdout)
assert st['API_URL'] == 'http://127.0.0.1:61031' and '@127.0.0.1:61032/' in st['DB_URL'], st['API_URL']
for c, port in (('db', '61032'), ('kong', '61031')):
    ins = json.loads(subprocess.run(['docker', 'inspect', f'supabase_{c}_{PROJECT}'], capture_output=True, text=True, check=True).stdout)[0]
    assert ins['Config']['Labels'].get('com.supabase.cli.project') == PROJECT, ins['Config']['Labels']
    ports = json.dumps(ins['HostConfig']['PortBindings'])
    assert f'"HostPort": "{port}"' in ports, ports
env = os.environ.copy()
env.update({'ACTIONS_' + k: str(v) for k, v in st.items()})
env.update(ACTIONS_CONTENT_PORT='3118', NO_COLOR='1')
name, files = sys.argv[1], sys.argv[2:]
cmd = ['deno', 'test', '--no-check', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read'] + [str(T / f) if not f.startswith('/') else f for f in files]
start = time.time()
with open(E / f'{name}.log', 'w') as f:
    try:
        code = subprocess.run(cmd, cwd=R, env=env, stdout=f, stderr=subprocess.STDOUT, timeout=900).returncode
    except subprocess.TimeoutExpired:
        code = 'TIMEOUT'
text = (E / f'{name}.log').read_text()
m = re.findall(r'^(ok|FAILED) \| (\d+) passed \| (\d+) failed', text, re.M)
summary = {'name': name, 'files': files, 'exit': code, 'seconds': round(time.time() - start, 1),
           'summaries': [{'result': a, 'passed': int(b), 'failed': int(c)} for a, b, c in m],
           'overrides': {k: v for k, v in os.environ.items() if k.startswith('ACTIONS_MIGRATION') or k.startswith('ACTIONS_ROLLBACK')}}
ex = E / 'exits.json'
prev = json.loads(ex.read_text()) if ex.exists() else []
ex.write_text(json.dumps(prev + [summary], indent=1))
print(json.dumps(summary))
