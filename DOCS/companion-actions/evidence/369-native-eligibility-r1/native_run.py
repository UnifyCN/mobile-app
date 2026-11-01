"""Record owned native setup commands without exporting credential values."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys
import time

E = Path(__file__).resolve().parent
R = E.parents[3]
B = R / 'build/369-native-eligibility-r1'
name, directory, *command = sys.argv[1:]
assert not (E / (name + '-command.json')).exists()
env = {k: v for k, v in os.environ.items() if not k.startswith((
    'EXPO_PUBLIC_', 'SUPABASE_', 'ACTIONS_', 'COMPANION_',
    'SANITY_', 'POSTHOG_', 'OPENAI_', 'OPENROUTER_', 'EXPO_TOKEN',
))}
env.update(EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', EXPO_NO_DOTENV='1', CI='1')
env.update(npm_config_cache=str(B / 'npm-cache'), CP_HOME_DIR=str(B / 'cocoapods-home'),
           CP_CACHE_DIR=str(B / 'cocoapods-cache'))
print('FALSIFIER: A failed setup command blocks the dependent native cells.', flush=True)
start = time.time()
raw = B / 'private' / (name + '.private.log')
with raw.open('wb') as f:
    result = subprocess.run(command, cwd=R / directory, env=env,
                            stdout=f, stderr=subprocess.STDOUT)
text = raw.read_text(errors='replace')
text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', text)
text = re.sub(r'(?:Expo|Exponent)PushToken\[[^\]]+\]', '[REDACTED_PUSH_TOKEN]', text)
text = re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[REDACTED_SERVICE_KEY]', text)
text = re.sub(r'(?im)^.*(?:anon.key|service.role.key|secret.key|publishable.key|JWT.secret|database.password|postgres(?:ql)?://).*$','[REDACTED_CREDENTIAL_LINE]', text)
(E / (name + '.txt')).write_text('REDACTED LOG. Credential patterns removed.\n' + text)
raw.write_text('REDACTED LOG. Credential patterns removed.\n' + text)
(E / (name + '-command.json')).write_text(json.dumps(dict(
    command=command, cwd=str(R / directory), exit=result.returncode,
    seconds=time.time()-start, redacted=True,
    redacted_log_retained_in_ignored_private_path=True,
), indent=2) + '\n')
print(name, 'exit', result.returncode, flush=True)
print(text[-3500:])
sys.exit(result.returncode)
