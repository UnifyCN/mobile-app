from pathlib import Path
import datetime
import json
import os
import re
import subprocess
import sys
import time

E = Path(__file__).resolve().parent
R = E.parents[3]
B = R / 'build/369-native-eligibility-r1'
U = (B / 'private/device.txt').read_text().strip()
APP = 'com.anonymous.unifyfrontend'
AXE = Path('/Users/savargupta/.npm/_npx/b998b4270960e258/node_modules/mobilebuildmcp/bundled/axe')

def run(args, private=False, timeout=40, env=None):
    start = time.monotonic()
    p = subprocess.run(list(map(str, args)), capture_output=True, timeout=timeout, env=env)
    row = dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(),
               command=list(map(str, args)), exit=p.returncode, seconds=time.monotonic()-start,
               stdout='[private]' if private else p.stdout.decode(errors='replace'),
               stderr='[private]' if private else p.stderr.decode(errors='replace'))
    with (E / 'native-commands.jsonl').open('a') as f:
        f.write(json.dumps(row) + '\n')
    if p.returncode:
        raise RuntimeError(json.dumps(row))
    return p

def axe(*args, private=False):
    return run([AXE, *args, '--udid', U], private=private,
               env=dict(os.environ, DYLD_FRAMEWORK_PATH=str(AXE.parent / 'Frameworks')))

def cap(name):
    (E / 'screenshots').mkdir(exist_ok=True)
    (E / 'ui').mkdir(exist_ok=True)
    # simctl writes within the owned guest, then the host copies the PNG.
    devices=json.loads(run(['xcrun', 'simctl', 'list', 'devices', '--json'], private=True).stdout)
    guest=next(d for ds in devices['devices'].values() for d in ds if d['udid']==U)
    path=Path(guest['dataPath']) / 'tmp' / (name + '.png')
    run(['xcrun', 'simctl', 'io', U, 'screenshot', path])
    (E / 'screenshots' / (name + '.png')).write_bytes(path.read_bytes())
    path.unlink()
    data=axe('describe-ui').stdout
    (E / 'ui' / (name + '.json')).write_bytes(data)
    print(data.decode()[:12000])

if __name__ == '__main__':
    mode,*args=sys.argv[1:]
    if mode=='cap': cap(args[0])
    elif mode=='input': print(axe(*args).stdout.decode()[:2000])
    elif mode=='credential':
        value=json.loads((B / 'private/account.json').read_text())[args[0]]
        path=B/'private/hid.txt'
        for c in value:
            path.write_text(c)
            axe('type', '--file', str(path), private=True)
        path.unlink()
        print('Private native credential input completed.')
