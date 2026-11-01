"""Local Android test prerequisites. No native process starts on import."""
from pathlib import Path
import json
import select
import sys
import time
from urllib.parse import parse_qs, urlencode, urlparse

SCHEME = 'exp+unify-front-end'
METRO_URL = 'http://127.0.0.1:8351'
DEVELOPMENT_URI = SCHEME + '://expo-development-client/?' + urlencode({'url': METRO_URL})


def validate_uri(uri):
    parsed = urlparse(uri)
    if (parsed.scheme != SCHEME or parsed.netloc != 'expo-development-client'
            or parsed.path != '/' or parsed.fragment
            or parse_qs(parsed.query) != {'url': [METRO_URL]}):
        raise ValueError('The development URI does not match the fixed APK and local Metro')
    return uri


def prepare_caches(owned_build):
    base = Path(owned_build).resolve() / 'tool-cache'
    result = {'TMPDIR': str(base / 'tmp'), 'XDG_CACHE_HOME': str(base / 'xdg'),
              'npm_config_cache': str(base / 'npm')}
    for path in result.values():
        Path(path).mkdir(mode=0o700, parents=True, exist_ok=True)
        if not Path(path).is_dir():
            raise RuntimeError('A required owned cache directory is unavailable')
    return result


def require_bootstrap(receipt):
    record = json.loads(Path(receipt).read_text())
    if (record.get('exit') != 0 or record.get('complete') is not True
            or record.get('project') != 'unify-native-speech-374-r15'):
        raise RuntimeError('The owned bootstrap has not completed successfully')
    return record


class StopGate:
    def __init__(self, stop_file):
        self.stop_file = Path(stop_file)
        if self.stop_file.exists():
            raise RuntimeError('A stale stop file must not control a new runtime')

    def wait(self, timeout, stream=None, ready_file=None):
        deadline = time.monotonic() + timeout
        active_stream = stream
        eof_ignored = False
        if ready_file:
            Path(ready_file).write_text(json.dumps({'ready': True, 'eof_ignored': False}) + '\n')
        print('CONTROL_READY', flush=True)
        while True:
            if self.stop_file.exists():
                if self.stop_file.read_text().strip() != 'STOP':
                    raise RuntimeError('The stop file has invalid content')
                return {'reason': 'stop_file', 'eof_ignored': eof_ignored}
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return {'reason': 'deadline', 'eof_ignored': eof_ignored}
            ready, _, _ = select.select([active_stream] if active_stream else [], [], [], min(.1, remaining))
            if ready:
                line = active_stream.readline()
                if line == '':
                    active_stream = None
                    eof_ignored = True
                    if ready_file:
                        Path(ready_file).write_text(json.dumps({'ready': True, 'eof_ignored': True}) + '\n')
                    print('STDIN_EOF_IGNORED', flush=True)
                elif line.strip() == 'STOP':
                    return {'reason': 'stdin_stop', 'eof_ignored': eof_ignored}


if __name__ == '__main__':
    stop = Path(sys.argv[1])
    result = StopGate(stop).wait(float(sys.argv[2]), sys.stdin)
    print(json.dumps(result), flush=True)
