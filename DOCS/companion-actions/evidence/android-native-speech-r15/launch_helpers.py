"""Use the fixed APK's URI and read-only resolver before a native URL launch."""
import json
import shlex
import subprocess
import time
from pathlib import Path
from preflight import DEVELOPMENT_URI, require_bootstrap, validate_uri

PACKAGE = 'com.anonymous.unifyfrontend'
COMPONENTS = {PACKAGE + '/.MainActivity', PACKAGE + '/' + PACKAGE + '.MainActivity'}


def call(prefix, label, argv, evidence, timeout=30):
    args = list(prefix) + ['shell', shlex.join(argv)]
    folder = Path(evidence)
    folder.mkdir(parents=True, exist_ok=True)
    if any((folder / (label + suffix)).exists() for suffix in ['.stdout', '.stderr', '.json']):
        raise RuntimeError('The native command would overwrite a saved result')
    started = time.monotonic()
    p = subprocess.run(args, capture_output=True, timeout=timeout)
    (folder / (label + '.stdout')).write_bytes(p.stdout)
    (folder / (label + '.stderr')).write_bytes(p.stderr)
    record = {'label': label, 'command': args, 'exit': p.returncode,
              'seconds': time.monotonic() - started,
              'stdout_bytes': len(p.stdout), 'stderr_bytes': len(p.stderr)}
    (folder / (label + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    return p, record


def resolve(prefix, evidence):
    uri = validate_uri(DEVELOPMENT_URI)
    p, record = call(prefix, 'resolve-correct-uri',
        ['cmd', 'package', 'resolve-activity', '--brief',
         '-a', 'android.intent.action.VIEW', '-c', 'android.intent.category.BROWSABLE',
         '-p', PACKAGE, '-d', uri], evidence)
    matches = [line.strip() for line in p.stdout.decode().splitlines() if line.strip() in COMPONENTS]
    if p.returncode != 0 or len(matches) != 1:
        raise RuntimeError('The fixed development URI does not resolve to the fixed MainActivity')
    return {'passed': True, 'uri': uri, 'component': matches[0], 'record': record}


def normal_cold_launcher(prefix, evidence):
    before, _ = call(prefix, 'cold-initial-pid', ['pidof', PACKAGE], evidence)
    stop, _ = call(prefix, 'cold-force-stop', ['am', 'force-stop', PACKAGE], evidence)
    absent, _ = call(prefix, 'cold-stopped-pid', ['pidof', PACKAGE], evidence)
    if stop.returncode != 0 or absent.stdout.strip():
        raise RuntimeError('The owned app did not stop before normal cold launch')
    launch, _ = call(prefix, 'cold-main-launch', ['am', 'start', '-W', '-n', PACKAGE + '/.MainActivity'], evidence)
    after, _ = call(prefix, 'cold-new-pid', ['pidof', PACKAGE], evidence)
    if launch.returncode != 0 or not after.stdout.strip():
        raise RuntimeError('The normal cold launcher did not start')
    if before.stdout.strip() and before.stdout.strip() == after.stdout.strip():
        raise RuntimeError('The normal cold launcher kept the old PID')
    return {'passed': True, 'previous_pid': before.stdout.decode().strip(),
            'stopped_pid_absent': True, 'new_pid': after.stdout.decode().strip(),
            'scope': 'native launcher only; no product bundle selected'}


def start_resolved_product(prefix, evidence, resolution_file):
    folder = Path(evidence)
    require_bootstrap(folder / 'bootstrap-complete.json')
    for name in ['binding-fixture-gate.json', 'metro-gate.json', 'guest-gate.json']:
        if json.loads((folder / name).read_text()).get('passed') is not True:
            raise RuntimeError('A required pre-launch gate is incomplete: ' + name)
    resolution = json.loads(Path(resolution_file).read_text())
    if (resolution.get('passed') is not True
            or resolution.get('uri') != validate_uri(DEVELOPMENT_URI)
            or resolution.get('component') not in COMPONENTS):
        raise RuntimeError('The separate development URI resolver result is invalid')
    recorded = (folder / 'resolve-correct-uri.stdout').read_text().splitlines()
    if len([line for line in recorded if line.strip() == resolution['component']]) != 1:
        raise RuntimeError('The resolver output does not support its saved result')
    p, record = call(prefix, 'launch-correct-development-uri',
        ['am', 'start', '-W', '-a', 'android.intent.action.VIEW',
         '-c', 'android.intent.category.BROWSABLE', '-p', PACKAGE,
         '-d', resolution['uri']], evidence, timeout=45)
    if p.returncode != 0:
        raise RuntimeError('The fixed development URI failed to start')
    return {'resolution': resolution, 'launch': record,
            'product_loading_requires_separate_native_get_and_visible_scene': True}
