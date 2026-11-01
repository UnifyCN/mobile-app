import os,sys,subprocess,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
RUN=HERE/'.runtime';STACK=RUN/'supabase/tests/companion-actions';PROJECT='unify-reminders-368-r1'
env=dict(os.environ);env.pop('ACTIONS_COMPOSITION_EVIDENCE',None)
env.update(DENO_DIR=str(RUN/'deno-cache'),ACTIONS_CONTENT_PORT='3385',ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3385/content',ACTIONS_MOBILE_LOCALES=str(RUN/'unify-front-end/i18n/locales'),ACTIONS_DB_CONTAINER='supabase_db_'+PROJECT,ACTIONS_REST_CONTAINER='supabase_rest_'+PROJECT,ACTIONS_REMINDER_EVIDENCE=str(HERE/'race-results.jsonl'))
raw=subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],stderr=subprocess.DEVNULL,text=True)
for line in raw.splitlines():
 if '=' in line:
  k,v=line.split('=',1);env['ACTIONS_'+k]=v.strip('"')
assert env['ACTIONS_API_URL']=='http://127.0.0.1:63081'
assert '@127.0.0.1:63082/' in env['ACTIONS_DB_URL']
if '--preflight' in sys.argv:
 cs=json.loads(subprocess.check_output(['docker','inspect','--type','container',*['supabase_'+n+'_'+PROJECT for n in ['db','auth','rest','kong','edge_runtime']]],text=True));out=[]
 for c in cs:
  labels=c['Config']['Labels'];assert labels['com.supabase.cli.project']==PROJECT;assert labels['com.supabase.cli.workdir']==str(STACK);assert c['State']['Running']
  row={'name':c['Name'],'labels':labels,'image':c['Image']}
  if 'edge_runtime' in c['Name']:
   values=dict(x.split('=',1) for x in c['Config']['Env']);assert values['COMPANION_CONTENT_QUERY_URL']==env['ACTIONS_CONTENT_QUERY_URL'];row['actual_content_url']=values['COMPANION_CONTENT_QUERY_URL']
  out.append(row)
 (HERE/'container-preflight.json').write_text(json.dumps(out,indent=2)+'\n');print('PASS actual labels, loopback URLs and content environment')
else:
 args=sys.argv[1:] or ['reminders_test.ts']
 command=['deno','test','--no-check','--node-modules-dir=none','--allow-net=127.0.0.1:63081,127.0.0.1:63082,127.0.0.1:3385','--allow-env','--allow-read','--allow-write='+str(HERE),*args]
 raise SystemExit(subprocess.call(command,env=env,cwd=STACK))
