"""Normal gates with command, exit and duration receipts. No force exit."""
from pathlib import Path
import json,os,subprocess,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root')
kind=sys.argv[1];cwd=ROOT/'unify-front-end' if kind=='mobile' else WEB
commands=([['npm','run','lint'],['npm','run','check-i18n'],['npm','run','typecheck'],['npx','expo','export','--platform','ios','--platform','android']] if kind=='mobile' else [['npm','run','lint'],['npm','run','check-i18n'],['npx','tsc','--noEmit'],['npm','run','build']])
env=dict(os.environ);env['CI']='true'
if kind=='web':
 raw=subprocess.check_output(['supabase','status','--workdir',str(ROOT/'build/profile-371-r1/supabase/tests/companion-actions'),'-o','env'],stderr=subprocess.DEVNULL,text=True)
 values={k:v.strip('"') for k,v in (line.split('=',1) for line in raw.splitlines() if '=' in line)}
 assert values['API_URL']=='http://127.0.0.1:64510'
 env.update(NEXT_PUBLIC_SUPABASE_URL=values['API_URL'],NEXT_PUBLIC_SUPABASE_ANON_KEY=values['ANON_KEY'],SUPABASE_SERVICE_ROLE_KEY=values['SERVICE_ROLE_KEY'],NEXT_PUBLIC_SANITY_PROJECT_ID='profile371fixture',SANITY_PROJECT_ID='profile371fixture',NEXT_PUBLIC_POSTHOG_KEY='',NEXT_PUBLIC_SENTRY_DSN='')
results=[]
for i,command in enumerate(commands):
 label=kind+'-quality-'+str(i+1)
 started=time.monotonic()
 with (HERE/(label+'.log')).open('w') as log:r=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 results.append({'command':command,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.monotonic()-started,3),'log':label+'.log'})
 (HERE/(kind+'-quality-results.json')).write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
