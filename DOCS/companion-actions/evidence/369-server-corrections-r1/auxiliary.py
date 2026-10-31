"""Separate lint and advisor records. No change to repository lint configuration."""
from pathlib import Path
import json,os,subprocess,sys,time
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
def gate(label,cmd,input=None):
    target=HERE/(label+'.log');assert not target.exists()
    start=time.time()
    with target.open('w') as out:r=subprocess.run(cmd,cwd=WEB,input=input,text=True,stdout=out,stderr=subprocess.STDOUT)
    (HERE/(label+'-command.json')).write_text(json.dumps({'cmd':cmd,'cwd':str(WEB),'exit':r.returncode,'seconds':time.time()-start},indent=2)+'\n')
    print(label,r.returncode,flush=True)
    return r.returncode
if sys.argv[1]=='lint':
    gate('changed-repo-eslint',['npx','eslint','supabase/tests/companion-actions/push_authority_races_test.ts','supabase/tests/companion-actions/push_isolation_test.ts','supabase/workers/companion-push/worker.ts'])
    gate('new-tests-deno-lint-pinned-imports',['deno','lint','--rules-exclude=no-import-prefix','supabase/tests/companion-actions/push_authority_races_test.ts','supabase/tests/companion-actions/push_isolation_test.ts'])
    gate('base-worker-deno-lint',['deno','lint','--ext=ts','-'],(HERE/'base-worker.ts').read_text())
elif sys.argv[1]=='advisors':
    gate('local-advisors',['supabase','db','advisors','--local','--workdir',str(HERE/'private/stack'),'--output-format','json','--fail-on','none'])
elif sys.argv[1]=='stop':
    raise SystemExit(gate('owned-stop',['supabase','stop','--project-id','unify-push-369-correction-r1','--no-backup','--workdir',str(HERE/'private/stack')]))
else:raise ValueError(sys.argv[1])
