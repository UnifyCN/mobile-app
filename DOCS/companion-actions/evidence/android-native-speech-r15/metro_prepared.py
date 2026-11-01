from stack import credentials, env, R, E, B
import json
from pathlib import Path
import os

credentials()
keys = {k: v for k, v in env.items() if not k.startswith((
    'ACTIONS_', 'COMPANION_', 'SUPABASE_',
    'EXPO_PUBLIC_', 'SANITY_', 'POSTHOG_', 'OPENAI_', 'OPENROUTER_',
))}
keys.update(EXPO_PUBLIC_SUPABASE_URL=env['ACTIONS_API_URL'],
            EXPO_PUBLIC_SUPABASE_ANON_KEY=env['ACTIONS_ANON_KEY'],
            EXPO_PUBLIC_POSTHOG_API_KEY='local-native-369',
            EXPO_PUBLIC_POSTHOG_HOST='http://127.0.0.1:3516',
            EXPO_PUBLIC_SANITY_PROJECT_ID='placeholder',
            EXPO_PUBLIC_SANITY_DATASET='native369',
            EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', EXPO_NO_DOTENV='1',
            CI='1', TMPDIR=str(B/'tool-cache/tmp'), XDG_CACHE_HOME=str(B/'tool-cache/xdg'), npm_config_cache=str(B/'tool-cache/npm'), NODE_OPTIONS='--dns-result-order=ipv4first')
from preflight import prepare_caches
keys.update(prepare_caches(B))
(E / 'metro-environment.json').write_text(json.dumps(dict(
    supabaseUrl=keys['EXPO_PUBLIC_SUPABASE_URL'],
    keySource='owned local supabase status, value withheld',
    analyticsHost=keys['EXPO_PUBLIC_POSTHOG_HOST'],
    dotenvDisabled=True, source=str(Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-bb8e7547/build/android-native-speech-r15/mobile')), port=8351,
), indent=2) + '\n')
os.chdir(Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-bb8e7547/build/android-native-speech-r15/mobile'))
args = [str(Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-bb8e7547/build/android-native-speech-r15/mobile/node_modules/.bin/expo')), 'start', '--dev-client',
        '--clear', '--localhost', '--port', '8351']
import subprocess
from probe import redact
proc = subprocess.Popen(args, env=keys, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(E/'owned-metro-pid.json').write_text(json.dumps(dict(pid=proc.pid,args=args)))
with (E/'metro.redacted.txt').open('w') as f:
    for line in iter(proc.stdout.readline,b''):
        f.write(redact(line.decode(errors='replace'))); f.flush()
proc.wait()
