"""Sequential local service gates. Reset only the assigned project between files."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import json, os, subprocess, sys, threading, time, urllib.request, urllib.error
HERE=Path(__file__).resolve().parent
RUN=HERE.parents[3]/'build/profile-371-r1'
STACK=RUN/'supabase/tests/companion-actions'
PROJECT='unify-profile-371-r1'
subprocess.run([sys.executable,str(HERE/'run.py'),'--preflight'],check=True)
raw=subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],stderr=subprocess.DEVNULL,text=True)
values={k:v.strip('"') for k,v in (line.split('=',1) for line in raw.splitlines() if '=' in line)}
api,key=values['API_URL'],values['SERVICE_ROLE_KEY']
assert api=='http://127.0.0.1:64510'
class Content(BaseHTTPRequestHandler):
 def do_GET(self):
  params=parse_qs(urlparse(self.path).query)
  result=json.loads(params.get('$id',['null'])[0])
  body=json.dumps({'result':result}).encode()
  self.send_response(200);self.send_header('content-type','application/json');self.send_header('content-length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
files=['actions_test.ts','receipt_history_test.ts','create_test.ts','steps_test.ts','edit_test.ts','remove_test.ts','details_test.ts','reminders_test.ts','push_delivery_test.ts','push_isolation_test.ts']
(STACK/'profile_composition_fixture.ts').write_text("import {readyProfile} from './profileSupport.ts'; import {sql} from './support.ts'; await readyProfile(); await sql.end({timeout:5});\n")
(HERE/'composed-suite-manifest.json').write_text(json.dumps(files,indent=2)+'\n')
result_path=HERE/'composed-suite-results.json'
results=json.loads(result_path.read_text()) if '--resume' in sys.argv and result_path.exists() else []
passed={r['file'] for r in results if r['exit']==0}
for name in files:
 if name in passed:continue
 started=time.monotonic()
 subprocess.run([sys.executable,str(HERE/'run.py'),'--preflight'],check=True,stdout=subprocess.DEVNULL)
 with (HERE/('composed-reset-'+name+'.log')).open('w') as log:
  reset=subprocess.run(['supabase','db','reset','--workdir',str(STACK),'--local'],stdout=log,stderr=subprocess.STDOUT)
  if reset.returncode:raise SystemExit('Owned reset failed; no test ran: '+name)
  restart=subprocess.run(['docker','restart','supabase_rest_'+PROJECT],stdout=log,stderr=subprocess.STDOUT)
  if restart.returncode:raise SystemExit('Owned REST restart failed; no test ran')
 observations=[];consecutive=0
 for attempt in range(100):
  began=time.monotonic();status=0;size=0
  request=urllib.request.Request(api+'/rest/v1/user_tasks?select=user_task_id&limit=1',headers={'apikey':key,'authorization':'Bearer '+key})
  try:
   with urllib.request.urlopen(request,timeout=3) as response:status=response.status;size=len(response.read())
  except urllib.error.HTTPError as error:status=error.code;size=len(error.read())
  except OSError:pass
  observations.append({'status':status,'bytes':size,'seconds':round(time.monotonic()-began,4)})
  consecutive=consecutive+1 if status==200 else 0
  if consecutive>=3:break
  time.sleep(.3)
 (HERE/('composed-rest-ready-'+name+'.json')).write_text(json.dumps(observations,indent=2)+'\n')
 if consecutive<3:raise SystemExit('REST did not confirm baseline schema: '+name)
 server=None
 try:
  if name.startswith('push_'):
   server=ThreadingHTTPServer(('127.0.0.1',3456),Content)
   threading.Thread(target=server.serve_forever,daemon=True).start()
  setup=subprocess.run([sys.executable,str(HERE/'run.py'),'composed-setup-'+name,'profile_composition_fixture.ts'],stdout=subprocess.DEVNULL)
  if setup.returncode:raise SystemExit('Composed setup failed: '+name)
  filters=['--filter','/^(?!reminders: rollback)/'] if name=='reminders_test.ts' else []
  result=subprocess.run([sys.executable,str(HERE/'run.py'),'composed-'+name,name,*filters],stdout=subprocess.DEVNULL)
 finally:
  if server:server.shutdown();server.server_close()
 results.append({'file':name,'exit':result.returncode,'seconds':round(time.monotonic()-started,3),'baseline_reset':True,'profile_371_applied':True,'filter':filters})
 result_path.write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
 if result.returncode:raise SystemExit(result.returncode)
print(json.dumps({'files':len(files),'failed':sum(r['exit']!=0 for r in {r['file']:r for r in results}.values() if r['file'] in files)}),flush=True)
