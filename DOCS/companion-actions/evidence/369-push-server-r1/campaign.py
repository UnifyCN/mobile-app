"""Every existing backend service test, one ordered file per reset."""
from pathlib import Path
import json,subprocess,sys,time
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
raw=subprocess.check_output(['git','-C',str(WEB),'ls-tree','-r','--name-only','623179cee615057de2c20c8c6216e192891dab4b','supabase/tests/companion-actions'],text=True)
files=sorted(Path(s).name for s in raw.splitlines() if s.endswith('_test.ts'))
(HERE/'regression-selection.json').write_text(json.dumps({'base':'623179cee615057de2c20c8c6216e192891dab4b','files':files,'count':len(files)},indent=2)+'\n')
results=[]
for i,name in enumerate(files):
 label='regression-verified-'+str(i+1).zfill(2)+'-'+name.removesuffix('_test.ts');start=time.time()
 import os
 env=os.environ.copy();env['ACTIONS_TEST_ROOT']=str(HERE/'private/legacy-export/supabase/tests/companion-actions')
 result=subprocess.run([sys.executable,str(HERE/'runtime.py'),'test',label,name,'--reset'],env=env)
 results.append({'name':name,'label':label,'exit':result.returncode,'seconds':time.time()-start})
 (HERE/'regression-results.json').write_text(json.dumps(results,indent=2)+'\n')
 if result.returncode and ('lockfile is out of date' in (HERE/(label+'.log')).read_text() or 'Module not found' in (HERE/(label+'.log')).read_text()):raise RuntimeError('setup failure; stop before another file')
print(json.dumps({'selected_files':len(files),'passed_files':sum(r['exit']==0 for r in results),'failed_files':sum(r['exit']!=0 for r in results)}))
sys.exit(any(r['exit']!=0 for r in results))
