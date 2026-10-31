"""Run one selected rendered-client gate against the exact owned local service."""
from pathlib import Path
import json, os, subprocess, sys, time
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
STACK = ROOT / 'build/profile-371-r1/supabase/tests/companion-actions'
subprocess.run([sys.executable, str(HERE / 'run.py'), '--preflight'], check=True)
env = {k:v for k,v in os.environ.items() if not k.startswith('ACTIONS_') and k not in {
    'EXPO_ACCESS_TOKEN','OPENAI_API_KEY','ANTHROPIC_API_KEY','SANITY_API_TOKEN','SANITY_READ_TOKEN','SANITY_WRITE_TOKEN'}}
raw = subprocess.check_output(['supabase', 'status', '--workdir', str(STACK), '-o', 'env'], stderr=subprocess.DEVNULL, text=True)
for line in raw.splitlines():
    if '=' in line:
        key, value = line.split('=', 1)
        env['ACTIONS_' + key] = value.strip('"')
env.update(ACTIONS_DB_CONTAINER='supabase_db_unify-profile-371-r1',
           ACTIONS_REST_CONTAINER='supabase_rest_unify-profile-371-r1', ACTIONS_STACK_WORKDIR=str(STACK))
label = sys.argv[1]
if label.startswith('mobile-live'):
    command = ['npx', 'jest', '--runInBand', '--watchAll=false', '--runTestsByPath', '__tests__/companionActions/profileLocalStack.test.tsx']
    command += sys.argv[2:]
    cwd = ROOT / 'unify-front-end'
else:
    raise SystemExit('Unknown client gate')
start = time.monotonic()
with (HERE / (label + '.log')).open('w') as log:
    result = subprocess.run(command, env=env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
(HERE / (label + '-command.json')).write_text(json.dumps({'command': command, 'cwd': str(cwd), 'exit': result.returncode,
    'seconds': round(time.monotonic()-start, 3)}, indent=2)+'\n')
print((HERE / (label + '.log')).read_text()[-5000:])
raise SystemExit(result.returncode)
