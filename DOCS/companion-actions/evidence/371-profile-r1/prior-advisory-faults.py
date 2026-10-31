"""Deliberate faults on the owned DB or candidate, with byte/definition restoration."""
from pathlib import Path
import hashlib, json, subprocess, sys
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DB = 'supabase_db_unify-profile-371-r1'
subprocess.run([sys.executable, str(HERE/'run.py'), '--preflight'], check=True)
def sql(text):
    return subprocess.check_output(['docker','exec','-i',DB,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],input=text,text=True)
def definition():
    return sql("select pg_get_functiondef('public.companion_profile_context(uuid)'::regprocedure);").strip()
original = definition()
records = []
faults = [
    ('context-lock', "perform pg_advisory_xact_lock_shared(hashtextextended(p_user::text || ':profile',371));", 'perform 1;',
     'profile_races_test.ts', 'a task transaction holds'),
    ('relevant-revision', "value || jsonb_build_object('_revisions',revisions)", 'value',
     'profile_test.ts', 'relevant revisions invalidate'),
]
for label, before, after, file, selector in faults:
    assert original.count(before) == 1
    try:
        sql(original.replace(before, after))
        result = subprocess.run([sys.executable,str(HERE/'run.py'),'fault-'+label,file,'--filter',selector],capture_output=True,text=True)
        log=(HERE/('fault-'+label+'.log')).read_text()
        assert result.returncode != 0 and 'AssertionError' in log, 'Fault did not fail a behavior assertion'
    finally:
        sql(original)
        assert definition() == original
    records.append({'fault':label,'exit':result.returncode,'assertion_red':True,'restored':True,
                    'restored_definition_sha256':hashlib.sha256(original.encode()).hexdigest()})
source=ROOT/'unify-front-end/hooks/companion/useTaskActions.ts'
original_bytes=source.read_bytes()
before='        notifyArrivalReconciliation(userId);'
assert original_bytes.decode().count(before) == 1
try:
    source.write_text(original_bytes.decode().replace(before,'        // Deliberate fault: omit profile-reader reconciliation.'))
    result=subprocess.run([sys.executable,str(HERE/'clients.py'),'mobile-live-fault-context','--testNamePattern=rendered review saves'],capture_output=True,text=True)
    log=(HERE/'mobile-live-fault-context.log').read_text()
    assert result.returncode != 0 and 'Checklist province: Ontario' in log, 'Rendered fault did not find stale Checklist state'
finally:
    source.write_bytes(original_bytes)
assert source.read_bytes() == original_bytes
records.append({'fault':'rendered-client-reconciliation','exit':result.returncode,'assertion_red':True,'restored':True,
                'restored_source_sha256':hashlib.sha256(original_bytes).hexdigest()})
(HERE/'fault-results.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records))
