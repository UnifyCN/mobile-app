from lab import *
import threading

number = int(sys.argv[1])
assert number in [1, 2, 3]  # Initial launch and explicit cold/restart test launches only.
assert json.loads((E / 'native-network-r2.json').read_text())['passed']
assert json.loads((E / 'metro-http.json').read_text())['passed']
assert not (E / f'launch-{number}.json').exists()
A = Path((B / 'private/probe-installed.txt').read_text())
env = dict(os.environ, SIMCTL_CHILD_IOS359_PROFILE=str(A / 'local-only.bytecode'),
           SIMCTL_CHILD_DYLD_PRINT_INITIALIZERS='1', SIMCTL_CHILD_RCT_METRO_PORT='8371')
p = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console', U, APP,
                      '-RCT_jsLocation', '127.0.0.1:8371'], env=env,
                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(B / 'private' / f'launch-{number}.pid').write_text(str(p.pid))
raw = (B / 'private' / f'launch-{number}.private.log').open('wb')
out = (E / f'launch-{number}.redacted.txt').open('w')
out.write('REDACTED LOG. Tokens and credential patterns removed.\n')
for line in iter(p.stdout.readline, b''):
    s = line.decode(errors='replace')
    s = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', s)
    s = re.sub(r'(?:Expo|Exponent)PushToken\[[^\]]+\]', '[REDACTED_PUSH_TOKEN]', s)
    s = re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[REDACTED_SERVICE_KEY]', s)
    if any(word in s.lower() for word in ['installation_secret', 'access_token', 'refresh_token', 'password']):
        s = '[REDACTED_CREDENTIAL_LINE]\n'
    raw.write(s.encode())
    raw.flush()
    out.write(s)
    out.flush()
p.wait()
raw.close()
out.close()
(E / f'launch-{number}.json').write_text(json.dumps(dict(exit=p.returncode,
    method='normal simctl console, current locally built app, intended static test guard; check the separate load-order result'), indent=2) + '\n')
