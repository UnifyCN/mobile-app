"""Three bounded faults on the owned local project. Restore all inputs in finally."""
from pathlib import Path
import difflib,hashlib,json,subprocess,sys
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
UP=WEB/'supabase/migrations/20261030181040_companion_reminder_push.sql'
WORKER=WEB/'supabase/workers/companion-push/worker.ts'
PROJECT='unify-push-369-correction-r1'
original=UP.read_text()
helper=original.split('create or replace function companion_push_private.require_enrollment_authority',1)[1].split('create function public.companion_push_apply',1)[0]
helper='create or replace function companion_push_private.require_enrollment_authority'+helper
apply=original.split('create function public.companion_push_apply',1)[1].split('create function ',1)[0]
apply='create or replace function public.companion_push_apply'+apply
def digest(data):return hashlib.sha256(data.encode()).hexdigest()
def load(label,text):
    path=HERE/(label+'.sql');assert not path.exists();path.write_text(text)
    result=subprocess.run(['docker','exec','-i','supabase_db_'+PROJECT,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True)
    (HERE/(label+'-apply.json')).write_text(json.dumps({'sha256':digest(text),'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},indent=2)+'\n')
    assert result.returncode==0,result.stderr
def run(label,file):
    return subprocess.run([sys.executable,str(HERE/'runtime.py'),'test',label,file],cwd=HERE.parents[3]).returncode
name=sys.argv[1]
if name=='token':
    before=WORKER.read_text()
    needle='and n.token_id is not null '
    assert before.count(needle)==1
    broken=before.replace(needle,'')
    (HERE/'fault-token.diff').write_text(''.join(difflib.unified_diff(before.splitlines(True),broken.splitlines(True),fromfile='fixed-worker.ts',tofile='fault-worker.ts')))
    WORKER.write_text(broken)
    try:code=run('fault-token','push_isolation_test.ts')
    finally:WORKER.write_text(before)
    assert WORKER.read_text()==before
elif name=='locks':
    broken=helper
    for line in [' perform 1 from auth.users where id=p_user for share;\n',' perform 1 from auth.sessions where id=p_session and user_id=p_user for share;\n',' perform 1 from companion_push_private.settings where singleton for share;\n']:
        assert broken.count(line)==1;broken=broken.replace(line,'')
    load('fault-locks',broken)
    try:code=run('fault-locks','push_authority_races_test.ts')
    finally:load('restore-locks',helper)
elif name=='expiry':
    needle='  perform companion_push_private.require_enrollment_authority(p_user,p_session);'
    assert apply.count(needle)==3
    pieces=apply.split(needle)
    broken=pieces[0]+needle+''.join(pieces[1:])
    load('fault-expiry',broken)
    try:code=run('fault-expiry','push_authority_races_test.ts')
    finally:load('restore-expiry',apply)
else:raise ValueError(name)
(HERE/('fault-'+name+'-result.json')).write_text(json.dumps({'fault':name,'test_exit':code,'restored':True,'migration_sha256':digest(UP.read_text()),'worker_sha256':digest(WORKER.read_text())},indent=2)+'\n')
assert code!=0,'fault survived'
print(name,'caught; restored',flush=True)
