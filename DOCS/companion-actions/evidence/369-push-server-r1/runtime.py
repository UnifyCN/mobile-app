"""Owned local 369 stack. No canonical or hosted operations."""
from pathlib import Path
import datetime,hashlib,json,os,shutil,subprocess,sys,time
HERE=Path(__file__).resolve().parent
MOBILE=HERE.parents[3]
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
PRIVATE=HERE/'private'; STACK=PRIVATE/'stack'; PROJECT='unify-push-369-server-r1'
ENV=os.environ.copy();ENV.update(DENO_DIR=str(PRIVATE/'deno'),XDG_CACHE_HOME=str(PRIVATE/'cache'),ACTIONS_DB_CONTAINER='supabase_db_'+PROJECT,ACTIONS_REST_CONTAINER='supabase_rest_'+PROJECT,ACTIONS_CONTENT_PORT='63614',ACTIONS_MOBILE_LOCALES=str(MOBILE/'unify-front-end/i18n/locales'),ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:63614/content')
def run(*cmd):return subprocess.check_output(cmd,text=True,env=ENV).strip()
def log(label,cmd):
 start=time.time()
 with (HERE/(label+'.log')).open('w') as f:r=subprocess.run(cmd,cwd=WEB,env=ENV,stdout=f,stderr=subprocess.STDOUT)
 (HERE/(label+'-command.json')).write_text(json.dumps({'cmd':cmd,'cwd':str(WEB),'exit':r.returncode,'seconds':time.time()-start},indent=2)+'\n')
 print(label,r.returncode,flush=True);return r.returncode
def refresh():
 target=STACK/'supabase/functions'
 if target.exists():shutil.rmtree(target)
 target.mkdir(parents=True)
 shutil.copytree(WEB/'supabase/functions/companion-actions',target/'companion-actions')
 (target/'rag-query').mkdir()
 shutil.copytree(WEB/'supabase/functions/rag-query/lib',target/'rag-query/lib')
def env():
 for line in run('supabase','status','--workdir',str(STACK),'-o','env').splitlines():
  if '=' in line:
   k,v=line.split('=',1);ENV['ACTIONS_'+k]=v.strip('"')
 assert ENV['ACTIONS_API_URL']=='http://127.0.0.1:63610'
 assert '@127.0.0.1:63611' in ENV['ACTIONS_DB_URL']
def identities():
 rows=[]
 for kind in ['db','rest','edge_runtime','auth','kong']:
  c=json.loads(run('docker','inspect','supabase_'+kind+'_'+PROJECT))[0]
  assert c['Config']['Labels']['com.supabase.cli.project']==PROJECT and c['State']['Running']
  rows.append({'Id':c['Id'],'Name':c['Name'],'labels':c['Config']['Labels']})
  if kind=='edge_runtime':assert 'COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:63614/content' in c['Config']['Env']
 return rows
def reset(label):
 assert log(label+'-reset',['supabase','db','reset','--local','--workdir',str(STACK)])==0
 run('docker','restart','supabase_rest_'+PROJECT)
 # API readiness uses the authorized role and checks a real baseline rowset.
 import urllib.request
 for _ in range(80):
  try:
   req=urllib.request.Request(ENV['ACTIONS_API_URL']+'/rest/v1/user_tasks?select=user_task_id&limit=1',headers={'apikey':ENV['ACTIONS_SERVICE_ROLE_KEY'],'authorization':'Bearer '+ENV['ACTIONS_SERVICE_ROLE_KEY']})
   with urllib.request.urlopen(req) as r:
    if r.status==200 and isinstance(json.load(r),list):return
  except Exception:pass
  time.sleep(.2)
 raise RuntimeError('owned PostgREST readiness')
action=sys.argv[1]
if action=='prepare':
 assert not STACK.exists()
 (STACK/'supabase/migrations').mkdir(parents=True)
 for fixture in (WEB/'supabase/tests/companion-actions/supabase/migrations').glob('*.sql'):shutil.copyfile(fixture,STACK/'supabase/migrations'/fixture.name)
 text=(WEB/'supabase/tests/companion-actions/supabase/config.toml').read_text().replace('unify-actions-363',PROJECT)
 for a,b in [(60671,63610),(60672,63611),(60673,63612),(60674,63613)]:text=text.replace(str(a),str(b))
 (STACK/'supabase/config.toml').write_text(text)
 shutil.copyfile(HERE/'service.lock',PRIVATE/'deno.lock')
 refresh()
 assert log('startup',['supabase','start','--workdir',str(STACK)])==0
 env();(HERE/'started-identities.json').write_text(json.dumps(identities(),indent=2)+'\n')
elif action=='test':
 env();identities();label=sys.argv[2];assert not (HERE/(label+'.log')).exists(), 'use a new evidence label';refresh();run('docker','restart','supabase_edge_runtime_'+PROJECT)
 if '--reset' in sys.argv:reset(label)
 test_root=Path(ENV.get('ACTIONS_TEST_ROOT',str(WEB/'supabase/tests/companion-actions'))).resolve()
 assert test_root==WEB/'supabase/tests/companion-actions' or test_root.is_relative_to(PRIVATE)
 files=[str(test_root/x) for x in sys.argv[3:] if not x.startswith('--')]
 inputs=[{'path':'owned/runtime.py','sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
  {'path':'web/package.json','sha256':hashlib.sha256((WEB/'package.json').read_bytes()).hexdigest()}]
 for root in [WEB/'supabase/functions',WEB/'supabase/tests/companion-actions',WEB/'supabase/migrations',WEB/'supabase/rollbacks',WEB/'supabase/workers']:
  if not root.exists():continue
  for p in sorted(root.rglob('*')):
   if p.is_file() and p.suffix in ['.ts','.sql','.lock'] and '/supabase/tests/companion-actions/supabase/functions/' not in str(p):inputs.append({'path':str(p.relative_to(WEB)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 for root in [STACK/'supabase',test_root]:
  for path in sorted(root.rglob('*')):
   if path.is_file() and path.suffix in ['.ts','.sql','.toml']:
    inputs.append({'path':'owned-executed/'+str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 lock=PRIVATE/'deno.lock'
 if lock.exists():inputs.append({'path':'owned-runtime/deno.lock','sha256':hashlib.sha256(lock.read_bytes()).hexdigest()})
 (HERE/(label+'-inputs.json')).write_text(json.dumps(inputs,indent=2)+'\n')
 code=log(label,['deno','test','--no-check','--node-modules-dir=none','--lock='+str(PRIVATE/'deno.lock'),'--frozen','--allow-net=127.0.0.1:63610,127.0.0.1:63611,127.0.0.1:63614,127.0.0.1:63615,127.0.0.1:63616','--allow-env','--allow-read='+str(WEB)+','+str(MOBILE),'--allow-run','--allow-write='+str(PRIVATE),*files]);sys.exit(code)
