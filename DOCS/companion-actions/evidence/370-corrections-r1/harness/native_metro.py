"""Metro for the #370 corrections native check, bound to this worker's local stack only.

Usage: native_metro.py <port>
Serves the mobile primary's JS to the own simulator's Debug app. The app's Supabase URL
and anon key come from `supabase status` of unify-details-370-corrections-r1, in memory
only. Sanity stays on its 'placeholder' project; PostHog has a fake key and a loopback sink (analytics_sink.py);
Expo runs offline. Nothing here can reach a hosted Supabase project.
"""
import os, shlex, subprocess, sys
from pathlib import Path

STACK = Path(__file__).resolve().parent
MOB = Path('/Users/savargupta/.t3/worktrees/Unify/t3-a768fdfa/unify-front-end')
port = sys.argv[1]
out = subprocess.check_output(['supabase', 'status', '--workdir', str(STACK), '-o', 'env'],
                              stderr=subprocess.DEVNULL, text=True)
vals = {k: shlex.split(v)[0] for k, v in (l.split('=', 1) for l in out.splitlines() if '=' in l)}
assert vals['API_URL'] == 'http://127.0.0.1:61531', 'not this stack'
env = {k: v for k, v in os.environ.items()
       if not k.startswith(('EXPO_PUBLIC_', 'SANITY_', 'POSTHOG', 'SUPABASE_', 'ACTIONS_'))}
env.update(
    EXPO_PUBLIC_SUPABASE_URL=vals['API_URL'],
    EXPO_PUBLIC_SUPABASE_ANON_KEY=vals['ANON_KEY'],
    # A fake key (the provider throws on an empty one); its host is the loopback sink.
    EXPO_PUBLIC_POSTHOG_API_KEY='phc_local_unroutable_370c', EXPO_PUBLIC_POSTHOG_HOST='http://127.0.0.1:61539',
    EXPO_OFFLINE='1', EXPO_NO_TELEMETRY='1', CI='1',
)
# The mobile checkout's own Expo CLI, in that checkout (never an npx download).
expo = MOB / 'node_modules/.bin/expo'
assert expo.exists(), expo
os.chdir(MOB)
os.execve(str(expo), [str(expo), 'start', '--dev-client', '--clear', '--localhost', '--port', port], env)
