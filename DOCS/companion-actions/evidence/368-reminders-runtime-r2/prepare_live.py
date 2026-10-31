"""Prepare only the owned local migrations, gate and schema cache for live clients."""
from pathlib import Path
import os,subprocess,sys
HERE=Path(__file__).resolve().parent
STACK=HERE/'.runtime/supabase/tests/companion-actions'
subprocess.run([sys.executable,str(HERE/'run.py'),'--preflight'],check=True)
env=dict(os.environ);env.pop('ACTIONS_COMPOSITION_EVIDENCE',None)
raw=subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],stderr=subprocess.DEVNULL,text=True)
for line in raw.splitlines():
 if '=' in line:
  key,value=line.split('=',1);env['ACTIONS_'+key]=value.strip('"')
assert env['ACTIONS_API_URL']=='http://127.0.0.1:63081'
env['DENO_DIR']=str(HERE/'.runtime/deno-cache')
raise SystemExit(subprocess.call(['deno','run','--node-modules-dir=none','--allow-env','--allow-read='+str(HERE),'--allow-net=127.0.0.1:63081,127.0.0.1:63082',str(HERE/'prepare_live.ts')],env=env))
