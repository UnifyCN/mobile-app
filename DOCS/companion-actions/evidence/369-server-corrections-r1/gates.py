"""Current service type and lint gates. Every invocation has a new record."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
env=os.environ.copy()
env.update(DENO_DIR=str(HERE/'private/deno'),XDG_CACHE_HOME=str(HERE/'private/cache'))
files=sorted(str(p) for p in (WEB/'supabase/tests/companion-actions').glob('push*.ts'))+[str(WEB/'supabase/workers/companion-push/supervisor.ts')]
def gate(label,cmd):
    path=HERE/(label+'.log');assert not path.exists()
    start=time.time()
    with path.open('w') as out:r=subprocess.run(cmd,cwd=WEB,env=env,stdout=out,stderr=subprocess.STDOUT)
    (HERE/(label+'-command.json')).write_text(json.dumps({'cmd':cmd,'cwd':str(WEB),'exit':r.returncode,'seconds':time.time()-start},indent=2)+'\n')
    print(label,r.returncode,flush=True)
    return r.returncode
inputs=[{'path':str(Path(p).relative_to(WEB)),'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in files]
(HERE/'type-gate-inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
codes=[gate('push-check-correction',['deno','check','--node-modules-dir=none','--lock='+str(HERE/'private/deno.lock'),*files]),
       gate('push-check-correction-frozen',['deno','check','--frozen','--node-modules-dir=none','--lock='+str(HERE/'private/deno.lock'),*files]),
       gate('changed-deno-lint',['deno','lint','supabase/tests/companion-actions/push_authority_races_test.ts','supabase/tests/companion-actions/push_isolation_test.ts','supabase/workers/companion-push/worker.ts'])]
raise SystemExit(any(codes))
