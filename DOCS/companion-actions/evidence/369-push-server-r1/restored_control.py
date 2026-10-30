from pathlib import Path
import hashlib,json,os,subprocess,time
HERE=Path(__file__).resolve().parent;WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root');STACK=HERE/'private/stack';env=os.environ.copy();env.update(DENO_DIR=str(HERE/'private/deno'),ACTIONS_DB_CONTAINER='supabase_db_unify-push-369-server-r1',ACTIONS_REST_CONTAINER='supabase_rest_unify-push-369-server-r1',ACTIONS_CONTENT_PORT='63614')
for line in subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'],text=True).splitlines():
 if '=' in line:
  k,v=line.split('=',1);env['ACTIONS_'+k]=v.strip('"')
cmd=['deno','test','--no-check','--node-modules-dir=none','--frozen','--lock='+str(HERE/'private/deno.lock'),'--allow-env','--allow-run','--allow-net=127.0.0.1:63610,127.0.0.1:63611,127.0.0.1:63614,127.0.0.1:63615,127.0.0.1:63616','--allow-read='+str(HERE.parents[3])+','+str(WEB),'--filter','unknown transport',str(WEB/'supabase/tests/companion-actions/push_worker_test.ts')];start=time.time()
with (HERE/'restored-control.log').open('w') as out:r=subprocess.run(cmd,cwd=WEB,env=env,stdout=out,stderr=subprocess.STDOUT)
(HERE/'restored-control-command.json').write_text(json.dumps({'cmd':cmd,'cwd':str(WEB),'exit':r.returncode,'seconds':time.time()-start,'worker_sha256':hashlib.sha256((WEB/'supabase/workers/companion-push/worker.ts').read_bytes()).hexdigest()},indent=2)+'\n');print('restored-control',r.returncode);raise SystemExit(r.returncode)
