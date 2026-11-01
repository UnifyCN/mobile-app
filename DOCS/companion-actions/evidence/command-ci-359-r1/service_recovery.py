"""Run the exact reviewed service tests with their tracked locale inputs."""
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import time

E = Path(__file__).resolve().parent
M = E.parents[3] / 'unify-front-end'
W = Path('/tmp/unify-review-363-spec-web-06216662')
PIN = 'e8b99343b307a0f7bfa2f99ef74657e97b4f0154'
RUNTIME = E / 'runtime'
STACK = RUNTIME / 'supabase/tests/companion-actions'
PROJECT = 'unify-recover-367-370-ci-r1'
DENO = Path('/tmp/unify-361-r4-deno-latest/deno')


def write_json(name, value):
    (E / 'raw' / name).write_text(json.dumps(value, indent=2) + '\n')


def labels():
    result = []
    for kind in ['db', 'rest', 'auth', 'kong', 'edge_runtime']:
        name = f'supabase_{kind}_{PROJECT}'
        row = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
        assert row['Config']['Labels']['com.supabase.cli.project'] == PROJECT
        assert Path(row['Config']['Labels']['com.supabase.cli.workdir']).resolve() == STACK
        result.append({'name': name, 'id': row['Id'], 'running': row['State']['Running']})
    return result


def prepare():
    assert subprocess.check_output(['git', '-C', str(W), 'rev-parse', 'HEAD'], text=True).strip() == PIN
    assert not subprocess.check_output(['git', '-C', str(W), 'status', '--porcelain'], text=True)
    assert not RUNTIME.exists(), 'Refuse an existing runtime.'
    for port in [62291, 62292, 62293, 62294, 3354]:
        p = subprocess.run(['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN'], capture_output=True)
        assert not p.stdout, f'Port {port} is occupied.'
    data = subprocess.check_output(['git', '-C', str(W), 'archive', PIN, 'supabase', 'lib/i18n/locales'])
    RUNTIME.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        archive.extractall(RUNTIME, filter='data')
    paths = subprocess.check_output(['git', '-C', str(W), 'ls-tree', '-r', '--name-only', PIN, '--', 'supabase', 'lib/i18n/locales'], text=True).splitlines()
    records = []
    for relative in paths:
        expected = subprocess.check_output(['git', '-C', str(W), 'show', f'{PIN}:{relative}'])
        copied = (RUNTIME / relative).read_bytes()
        assert expected == copied, relative
        records.append({'file': relative, 'sha256': hashlib.sha256(copied).hexdigest()})
    for language in ['en', 'ar', 'es', 'fr-CA', 'hi', 'pa', 'vi']:
        assert (RUNTIME / f'lib/i18n/locales/{language}/translation.json').is_file()
        assert (M / f'i18n/locales/{language}/translation.json').is_file()
    config = STACK / 'supabase/config.toml'
    text = config.read_text()
    assert text.count('project_id = "unify-actions-363"') == 1
    text = text.replace('project_id = "unify-actions-363"', f'project_id = "{PROJECT}"')
    for old, new in [('60671', '62291'), ('60672', '62292'), ('60673', '62293'), ('60674', '62294')]:
        assert f'port = {old}' in text
        text = text.replace(f'port = {old}', f'port = {new}')
    config.write_text(text)
    write_json('service-source-inputs.json', records)
    print('Copied and checked', len(records), 'tracked service and locale files.', flush=True)


def run(files=None):
    assert RUNTIME.is_dir()
    version = subprocess.check_output([str(DENO), '--version'], text=True)
    assert 'deno 2.9.8' in version
    env = {k: v for k, v in os.environ.items() if not k.startswith(('ACTIONS_', 'EXPO_PUBLIC_', 'NEXT_PUBLIC_'))}
    for folder in ['tmp', 'npm-cache', 'tool-cache']:
        (E / folder).mkdir(exist_ok=True)
    env.update(CI='1', EXPO_NO_TELEMETRY='1', NEXT_TELEMETRY_DISABLED='1',
               npm_config_cache=str(E / 'npm-cache'), TMPDIR=str(E / 'tmp'),
               XDG_CACHE_HOME=str(E / 'tool-cache'),
               DENO_DIR=str(E.parent / 'merge-367-370-native-code-r1/deno-cache'),
               PATH=str(DENO.parent) + os.pathsep + env['PATH'],
               ACTIONS_CONTENT_PORT='3354',
               ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3354/content',
               ACTIONS_DB_CONTAINER=f'supabase_db_{PROJECT}',
               ACTIONS_REST_CONTAINER=f'supabase_rest_{PROJECT}',
               ACTIONS_MOBILE_LOCALES=str(M / 'i18n/locales'))
    # The normal runner does not grant filesystem writes. Leave the optional
    # post-assertion JSON export off; all schema and grant assertions still run.
    name = 'service-stage-retry' if files else 'service-full'
    command = ['bash', 'run.sh', *(files or [])]
    record = {'command': command, 'cwd': str(STACK), 'project': PROJECT,
              'started': time.time(), 'falsifier': 'Any missing input, wrong local target, or failed service assertion.'}
    write_json(name + '-running.json', record)
    with (E / 'raw' / (name + '.log')).open('w') as output:
        process = subprocess.Popen(command, cwd=STACK, env=env,
                                   stdout=output, stderr=subprocess.STDOUT)
        record['pid'] = process.pid
        write_json(name + '-running.json', record)
        code = process.wait()
    record.update(exit=code, seconds=time.time() - record['started'], natural_exit=code >= 0)
    write_json(name + '-result.json', record)
    (E / 'raw' / (name + '-running.json')).unlink()
    print(json.dumps(record), flush=True)
    raise SystemExit(code)


if sys.argv[1] == 'prepare':
    prepare()
elif sys.argv[1] == 'run':
    run()
elif sys.argv[1] == 'run-stage':
    labels()
    run(['compose_367_370_rollback_test.ts'])
elif sys.argv[1] == 'stop':
    write_json('service-labels-before-stop.json', labels())
    raise SystemExit(subprocess.call(['supabase', 'stop', '--project-id', PROJECT, '--no-backup', '--workdir', str(STACK)]))
else:
    raise SystemExit('Unknown mode')
