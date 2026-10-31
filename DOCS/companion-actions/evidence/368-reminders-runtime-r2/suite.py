"""Sequential service suite on the exact owned disposable project. No stack creation."""
from pathlib import Path
import subprocess,json,time,sys,os,urllib.request,urllib.error
HERE=Path(__file__).resolve().parent
STACK=HERE/'.runtime/supabase/tests/companion-actions'
PROJECT='unify-reminders-368-r1'
# This command must pass separately before this runner can change the owned DB.
subprocess.run([sys.executable,str(HERE/'run.py'),'--preflight'],check=True)
raw=subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],stderr=subprocess.DEVNULL,text=True)
values=dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
api=values['API_URL'].strip('"');key=values['SERVICE_ROLE_KEY'].strip('"')
assert api=='http://127.0.0.1:63081'
results=[]
new_files = ['reminders_test.ts', 'reminders_commands_test.ts', 'reminders_races_test.ts']
ordered = [STACK/name for name in new_files] + [p for p in sorted(STACK.glob('*_test.ts')) if p.name not in new_files]
assert len(ordered) == len(set(ordered)) == len(list(STACK.glob('*_test.ts')))
for source in ordered:
 started=time.monotonic()
 with (HERE/('service-'+source.stem+'.log')).open('w') as log:
  reset=subprocess.run(['supabase','db','reset','--workdir',str(STACK),'--local'],stdout=log,stderr=subprocess.STDOUT)
  if reset.returncode:raise SystemExit('Owned reset failed; no test ran')
  restart=subprocess.run(['docker','restart','supabase_rest_'+PROJECT],stdout=log,stderr=subprocess.STDOUT)
  if restart.returncode:raise SystemExit('Owned REST restart failed; no test ran')
  consecutive=0;observations=[]
  for attempt in range(60):
   began=time.monotonic();status=0;size=0
   request=urllib.request.Request(api+'/rest/v1/user_tasks?select=user_task_id&limit=1',headers={'apikey':key,'Authorization':'Bearer '+key})
   try:
    with urllib.request.urlopen(request,timeout=3) as response:status=response.status;size=len(response.read())
   except urllib.error.HTTPError as failure:status=failure.code;size=len(failure.read())
   except OSError:pass
   observations.append({'status':status,'bytes':size,'seconds':round(time.monotonic()-began,4)})
   consecutive=consecutive+1 if status==200 else 0
   if consecutive>=5:break
   time.sleep(.5)
  (HERE/('rest-ready-'+source.stem+'.json')).write_text(json.dumps(observations,indent=2)+'\n')
  if consecutive<5:raise SystemExit('REST did not confirm the reset schema; no test ran')
  result=subprocess.run([sys.executable,str(HERE/'run.py'),source.name],stdout=log,stderr=subprocess.STDOUT)
 results.append({'file':source.name,'exit':result.returncode,'seconds':round(time.monotonic()-started,3)})
 (HERE/'service-suite-results.json').write_text(json.dumps(results,indent=2)+'\n')
 if result.returncode:raise SystemExit(result.returncode)
print(json.dumps({'files':len(results),'failed':sum(r['exit']!=0 for r in results)}))
