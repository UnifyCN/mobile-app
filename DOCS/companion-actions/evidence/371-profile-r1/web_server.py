"""Run only the assigned web candidate on its assigned loopback port."""
from pathlib import Path
import hashlib, json, os, subprocess, sys
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
WEB = Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root')
RUN = ROOT / 'build/profile-371-r1'
STACK = RUN / 'supabase/tests/companion-actions'
subprocess.run([sys.executable, str(HERE/'run.py'), '--preflight'], check=True)
raw = subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'], stderr=subprocess.DEVNULL,text=True)
values = dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
env = dict(os.environ)
env.update(NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:64510', NEXT_PUBLIC_SUPABASE_ANON_KEY=values['ANON_KEY'].strip('"'),
  SUPABASE_SERVICE_ROLE_KEY=values['SERVICE_ROLE_KEY'].strip('"'), NEXT_PUBLIC_SANITY_PROJECT_ID='profile371fixture',
  NEXT_PUBLIC_SANITY_DATASET='production',NEXT_PUBLIC_SANITY_PREVIEW_DRAFTS='false',NEXT_PUBLIC_SANITY_PREVIEW_TOKEN='',
  NEXT_PUBLIC_POSTHOG_KEY='',NEXT_PUBLIC_SENTRY_DSN='',SENTRY_DSN='',NEXT_TELEMETRY_DISABLED='1')
files={str(p.relative_to(WEB)): {'bytes':len(p.read_bytes()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  for p in WEB.glob('.env*') if p.is_file()}
(HERE/'web-config-before.json').write_text(json.dumps(files,indent=2)+'\n')
print('Starting assigned candidate on http://127.0.0.1:3487',flush=True)
with (RUN/'web-server.log').open('w') as log:
  raise SystemExit(subprocess.call(['npm','run','dev','--','--hostname','127.0.0.1','--port','3487'],cwd=WEB,env=env,stdout=log,stderr=subprocess.STDOUT))
