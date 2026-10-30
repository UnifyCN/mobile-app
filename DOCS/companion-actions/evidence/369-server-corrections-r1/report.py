"""Recount the saved final records and verify mirrors before the handoff."""
from pathlib import Path
import collections,hashlib,json,subprocess
HERE=Path(__file__).resolve().parent
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve()
MOBILE=HERE.parents[3]
report={}
for name in ['full-correction-a','full-correction-b']:
    text=(HERE/(name+'.log')).read_text()
    results=[line.split('|') for line in text.splitlines() if line.startswith('ok | ')]
    assert len(results)==1 and results[0][1].strip()=='68 passed'
    assert results[0][2].strip().split(' (')[0]=='0 failed'
    command=json.loads((HERE/(name+'-command.json')).read_text());assert command['exit']==0
    rows=[json.loads(line) for line in text.splitlines() if line.startswith('{"kind":"provider_fixture_distribution"')]
    distribution=collections.Counter()
    for row in rows:distribution.update(row['modes'])
    assert sum(row['total'] for row in rows)==sum(distribution.values())==29
    report[name]={'passed':68,'failed':0,'exit':0,'seconds':command['seconds'],'fixture_requests':29,'fixture_distribution':dict(distribution)}
a=json.loads((HERE/'full-correction-a-inputs.json').read_text())
b=json.loads((HERE/'full-correction-b-inputs.json').read_text())
assert a==b and len(a)==311
report['runtime_inputs']={'count':311,'equal_between_runs':True,'sha256':hashlib.sha256((HERE/'full-correction-a-inputs.json').read_bytes()).hexdigest()}
mirrors=[]
for directory in ['migrations','rollbacks']:
    for mobile in sorted((MOBILE/'unify-front-end/supabase'/directory).glob('*companion*.sql')):
        web=WEB/'supabase'/directory/mobile.name
        if web.exists():mirrors.append({'path':str(web.relative_to(WEB)),'equal':mobile.read_bytes()==web.read_bytes(),'sha256':hashlib.sha256(mobile.read_bytes()).hexdigest()})
assert all(x['equal'] for x in mirrors)
report['mirrors']=mirrors
report['gate_exits']={p.name:json.loads(p.read_text())['exit'] for p in HERE.glob('*-command.json') if any(x in p.name for x in ['push-check-correction','changed-repo-eslint','new-tests-deno','local-advisors','owned-stop'])}
report['findings']={'369-SPEC-01':'corrected; independent review pending','369-SPEC-02':'corrected; independent review pending','369-STD-01':'explicit root exception; independent review pending'}
report['faults']=[json.loads((HERE/('fault-'+name+'-result.json')).read_text()) for name in ['token','locks','expiry']]
assert all(x['test_exit']==1 and x['restored'] for x in report['faults'])
report['cleanup']=json.loads((HERE/'cleanup-verification.json').read_text())
critical=[]
for repo,paths,root in [
    ('mobile',['unify-front-end/supabase/migrations/20261030181040_companion_reminder_push.sql'],MOBILE),
    ('web',['supabase/migrations/20261030181040_companion_reminder_push.sql','supabase/workers/companion-push/worker.ts','supabase/tests/companion-actions/push_authority_races_test.ts','supabase/tests/companion-actions/push_isolation_test.ts'],WEB)]:
    for path in paths:critical.append({'repo':repo,'path':path,'sha256':hashlib.sha256((root/path).read_bytes()).hexdigest()})
report['critical_sources']=critical
report['acceptance']=False
(HERE/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
for root in [MOBILE,WEB]:print(str(root),subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip())
public=[p for p in HERE.iterdir() if p.is_file()]
bad=[]
for path in public:
    for word in path.read_text(errors='replace').split():
        if word.startswith('eyJ') and len(word.split('.'))>=3 and len(word.split('.')[0])>20:bad.append(path.name)
assert not bad,bad
print(json.dumps({'full_runs':[68,68],'identical_inputs':len(a),'matching_sql_mirrors':len(mirrors),'gate_exits':report['gate_exits'],'public_evidence_files':len(public),'token_pattern_matches':len(bad)},indent=2))
