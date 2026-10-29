"""Run the live headless reminder path only after the owned stack preflight passes."""
from pathlib import Path
import os,subprocess,sys
HERE=Path(__file__).resolve().parent
STACK=HERE/'.runtime/supabase/tests/companion-actions'
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-removed-receipt-view-359')
subprocess.run([sys.executable,str(HERE/'run.py'),'--preflight'],check=True)
env=dict(os.environ);env.pop('ACTIONS_COMPOSITION_EVIDENCE',None)
env['ACTIONS_STACK_WORKDIR']=str(STACK)
raw=subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],stderr=subprocess.DEVNULL,text=True)
for line in raw.splitlines():
 if '=' in line:
  key,value=line.split('=',1);env['ACTIONS_'+key]=value.strip('"')
env.update(ACTIONS_DB_CONTAINER='supabase_db_unify-reminders-368-r1',ACTIONS_REST_CONTAINER='supabase_rest_unify-reminders-368-r1',REMINDER_BROWSER_MODE='live',REMINDER_BROWSER_OUT=str(HERE/'browser-live'))
raise SystemExit(subprocess.call(['node','scripts/verify-companion-reminders.mjs'],cwd=WEB,env=env))
