"""Faults in isolated source exports inside this primary. No production source edit."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,time
HERE=Path(__file__).resolve().parent;WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve();STACK=HERE/'private/stack'
project='unify-push-369-server-r1';env=os.environ.copy();env.update(DENO_DIR=str(HERE/'private/deno'),XDG_CACHE_HOME=str(HERE/'private/cache'),ACTIONS_DB_CONTAINER='supabase_db_'+project,ACTIONS_REST_CONTAINER='supabase_rest_'+project,ACTIONS_CONTENT_PORT='63614')
for line in subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],text=True).splitlines():
 if '=' in line:
  k,v=line.split('=',1);env['ACTIONS_'+k]=v.strip('"')
assert env['ACTIONS_API_URL']=='http://127.0.0.1:63610'
worker='supabase/workers/companion-push/worker.ts'
changes=[('unknown',worker,"let state='unknown',ticket:string|null=null", "let state='retry_wait',ticket:string|null=null",'push_worker_test.ts','unknown transport'),
 ('cancel',worker,"if(!available || !r || r.status!=='pending' || !n || !p || !budgetReady(p))", "if(!n || !p || !budgetReady(p))",'push_worker_test.ts','complete action-first'),
 ('generation',worker,"where installation_id=${d.installation_id}::uuid and user_id=${d.user_id}::uuid and generation=${d.generation}::uuid and token_id=${d.token_id}::uuid", "where installation_id=${d.installation_id}::uuid and user_id=${d.user_id}::uuid",'push_worker_test.ts','late receipt preserves'),
 ('recovery',worker,"set state='unknown' where", "set state='queued' where",'push_process_test.ts','kill after durable intent')]
results=[]
for label,path,old,new,test,selection in changes:
 root=HERE/'private/mutations'/label
 assert not root.exists()
 for directory in ['functions','migrations','rollbacks','workers']:
  shutil.copytree(WEB/'supabase'/directory,root/'supabase'/directory)
 shutil.copytree(WEB/'supabase/tests/companion-actions',root/'supabase/tests/companion-actions',ignore=shutil.ignore_patterns('supabase','node_modules'))
 shutil.copyfile(WEB/'package.json',root/'package.json')
 p=root/path;text=p.read_text();assert old in text;occurrences=text.count(old);p.write_text(text.replace(old,new))
 (HERE/('fault-'+label+'-change.json')).write_text(json.dumps({'path':path,'old':old,'new':new,'occurrences':occurrences,'base_sha256':hashlib.sha256((WEB/path).read_bytes()).hexdigest(),'fault_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'filter':selection},indent=2)+'\n')
 cmd=['deno','test','--no-check','--node-modules-dir=none','--frozen','--lock='+str(HERE/'private/deno.lock'),'--allow-env','--allow-run','--allow-net=127.0.0.1:63610,127.0.0.1:63611,127.0.0.1:63614,127.0.0.1:63615,127.0.0.1:63616','--allow-read='+str(HERE.parents[3])+','+str(WEB),'--filter',selection,str(root/'supabase/tests/companion-actions'/test)]
 start=time.time()
 with (HERE/('fault-'+label+'.log')).open('w') as out:r=subprocess.run(cmd,cwd=WEB,env=env,stdout=out,stderr=subprocess.STDOUT)
 body=(HERE/('fault-'+label+'.log')).read_text();killed=r.returncode!=0 and 'AssertionError' in body
 results.append({'name':label,'exit':r.returncode,'assertion_killed':killed,'seconds':time.time()-start})
 (HERE/'mutation-results.json').write_text(json.dumps(results,indent=2)+'\n');print(label,r.returncode,killed,flush=True)
assert all(r['assertion_killed'] for r in results)
