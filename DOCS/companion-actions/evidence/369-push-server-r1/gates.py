"""Local gates with owned caches and no hosted environment."""
from pathlib import Path
import concurrent.futures,json,os,subprocess,time,sys
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
env=os.environ.copy();env.update(DENO_DIR=str(HERE/'private/deno'),XDG_CACHE_HOME=str(HERE/'private/cache'),NEXT_PUBLIC_SUPABASE_URL='',NEXT_PUBLIC_SUPABASE_ANON_KEY='',NEXT_PUBLIC_SANITY_PROJECT_ID='',SANITY_PROJECT_ID='',SENTRY_AUTH_TOKEN='',SENTRY_UPLOAD_DISABLED='true')
def gate(label,cmd,cwd=WEB):
 if (HERE/(label+'.log')).exists():
  index=2
  while (HERE/(label+'-r'+str(index)+'.log')).exists():index+=1
  label+='-r'+str(index)
 start=time.time()
 with (HERE/(label+'.log')).open('w') as out:r=subprocess.run(cmd,cwd=cwd,env=env,stdout=out,stderr=subprocess.STDOUT)
 (HERE/(label+'-command.json')).write_text(json.dumps({'cmd':cmd,'cwd':str(cwd),'exit':r.returncode,'seconds':time.time()-start},indent=2)+'\n');print(label,r.returncode,flush=True)
if sys.argv[1]=='web-final':
 env.update(NEXT_PUBLIC_SANITY_PROJECT_ID='fixture369',NODE_OPTIONS='--require='+str(HERE/'private/no-external-network.cjs'))
 gate('web-tests-final',['npm','test'])
 env.update(NEXT_PUBLIC_SANITY_PROJECT_ID='');env.pop('NODE_OPTIONS',None)
 gate('web-build-final',['npm','run','build']);gate('web-types-final',['npx','tsc','--noEmit'])
 gate('web-lint-final',['npx','eslint','.','--format','json'])
 gate('changed-lint-final',['npx','eslint','lib/companionActions/pushContract.ts','eslint.config.mjs'])
elif sys.argv[1]=='web-tests-only':
 env.update(NEXT_PUBLIC_SANITY_PROJECT_ID='fixture369',NODE_OPTIONS='--require='+str(HERE/'private/no-external-network.cjs'))
 gate('web-tests-configured',['npm','test'])
elif sys.argv[1]=='web':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  futures=[pool.submit(gate,*x) for x in [('web-tests',['npm','test']),('web-i18n',['npm','run','check-i18n']),('web-lint',['npx','eslint','.','--format','json'])]]
  for f in futures:f.result()
 gate('web-build',['npm','run','build']);gate('web-types',['npx','tsc','--noEmit']);gate('changed-lint',['npx','eslint','lib/companionActions/pushContract.ts','tsconfig.json','eslint.config.mjs'])
elif sys.argv[1]=='edge':
 import shutil
 export=HERE/'private/edge-gate';export.mkdir(exist_ok=True)
 shutil.copytree(WEB/'supabase/functions',export/'functions',dirs_exist_ok=True)
 files=sorted(str(p.relative_to(export)) for p in (export/'functions').glob('*/index.ts'))+sorted(str(p.relative_to(export)) for p in (export/'functions/_shared').glob('*.ts'))
 gate('edge-check',['deno','check','--node-modules-dir=auto','--lock='+str(HERE/'private/edge.lock'),*files],export)
 gate('edge-check-frozen',['deno','check','--frozen','--node-modules-dir=auto','--lock='+str(HERE/'private/edge.lock'),*files],export)
 gate('edge-tests',['deno','test','--no-check','--node-modules-dir=auto','--frozen','--lock='+str(HERE/'private/edge.lock'),'functions/'],export)
 # New service tests use the same normal compiler, without runtime no-check.
 files=sorted(str(p) for p in (WEB/'supabase/tests/companion-actions').glob('push*.ts'))+[str(WEB/'supabase/workers/companion-push/supervisor.ts')]
 gate('push-check',['deno','check','--node-modules-dir=none','--lock='+str(HERE/'private/deno.lock'),*files])
 gate('push-check-frozen',['deno','check','--frozen','--node-modules-dir=none','--lock='+str(HERE/'private/deno.lock'),*files])
