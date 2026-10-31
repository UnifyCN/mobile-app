from pathlib import Path
import hashlib
import json
import os
import shlex
import subprocess
import sys

E = Path(__file__).resolve().parent
R = E.parents[3]
B = R / 'build/369-native-eligibility-r1'
S = B / 'stack'
W = B / 'web'
PROJECT = 'unify-push-369-native-r1'
env = dict(os.environ, ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3396/content',
           ACTIONS_CONTENT_PORT='3396', ACTIONS_DB_CONTAINER='supabase_db_' + PROJECT,
           ACTIONS_REST_CONTAINER='supabase_rest_' + PROJECT,
           ACTIONS_MOBILE_LOCALES=str(R / 'unify-front-end/i18n/locales'),
           DENO_DIR=str(B / 'deno'), XDG_CACHE_HOME=str(B / 'cache'))

def out(*args):
    return subprocess.check_output(args, text=True, env=env).strip()

def identities():
    protected = {c['Id'] for c in json.loads((E / 'preflight.json').read_text())['containers']}
    rows = []
    for kind in ['db', 'rest', 'edge_runtime', 'auth', 'kong']:
        c = json.loads(out('docker', 'inspect', 'supabase_' + kind + '_' + PROJECT))[0]
        assert c['Id'] not in protected
        assert c['Config']['Labels']['com.supabase.cli.project'] == PROJECT
        assert Path(c['Config']['Labels']['com.supabase.cli.workdir']).resolve() == S.resolve()
        assert c['State']['Running']
        row = dict(Id=c['Id'], Name=c['Name'], Labels=c['Config']['Labels'], Mounts=c['Mounts'])
        if kind == 'edge_runtime':
            assert 'COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:3396/content' in c['Config']['Env']
            row['content_url'] = 'http://host.docker.internal:3396/content'
        rows.append(row)
    return rows

def credentials():
    for line in out('supabase', 'status', '--workdir', str(S), '-o', 'env').splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            env['ACTIONS_' + k] = shlex.split(v)[0]
    assert env['ACTIONS_API_URL'] == 'http://127.0.0.1:63710'
    assert '@127.0.0.1:63711' in env['ACTIONS_DB_URL']
    return env

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'start':
        sys.exit(subprocess.run(['supabase', 'start', '--workdir', str(S)], env=env).returncode)
    if mode == 'bootstrap':
        credentials()
        rows = identities()
        for f in (S / 'supabase/functions').rglob('*'):
            if f.is_file():
                relative = f.relative_to(S / 'supabase/functions')
                assert f.read_bytes() == (W / 'supabase/functions' / relative).read_bytes()
        (E / 'started-identities.json').write_text(json.dumps(rows, indent=2) + '\n')
        lock = json.loads((E.parent / '369-server-corrections-r1/service.lock').read_text())
        lock.pop('workspace', None)
        (B / 'deno.lock').write_text(json.dumps(lock, indent=2) + '\n')
        script = B / 'bootstrap.ts'
        script.write_text("import {readyPush, localPolicy} from './web/supabase/tests/companion-actions/pushSupport.ts';\n"
                          "import {sql} from './web/supabase/tests/companion-actions/support.ts';\n"
                          "await readyPush(); await localPolicy(); await sql.end(); console.log('Approved local schema and policy ready');\n")
        command = ['deno', 'run', '--no-check', '--node-modules-dir=none',
                   '--lock=' + str(B / 'deno.lock'), '--frozen',
                   '--allow-net=127.0.0.1:63710,127.0.0.1:63711,127.0.0.1:3396',
                   '--allow-env', '--allow-read=' + str(R), '--allow-run',
                   '--allow-write=' + str(B), str(script)]
        sys.exit(subprocess.run(command, env=env).returncode)
