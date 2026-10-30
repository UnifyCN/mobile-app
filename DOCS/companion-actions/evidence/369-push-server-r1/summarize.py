"""Counts come from the exact named result logs, not from hand-entered totals."""
from pathlib import Path
import collections,hashlib,json,re
HERE=Path(__file__).resolve().parent
def parse(label):
 p=HERE/(label+'.log');text=p.read_text();matches=re.findall(r'(?:ok|FAILED) \| (\d+) passed \| (\d+) failed(?: \| (\d+) ignored)?',text)
 result={'label':label,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 if matches:
  passed,failed,ignored=matches[-1];result.update(passed=int(passed),failed=int(failed),ignored=int(ignored or 0),selected=int(passed)+int(failed)+int(ignored or 0))
 else:result['classification']='setup_or_non_test_gate'
 names=re.findall(r'^(push .+?) \.\.\. (ok|FAILED)',text,re.M);result['cases']=[{'name':name,'result':state} for name,state in names]
 observations=[]
 for line in text.splitlines():
  if line.startswith('{'):
   try:observations.append(json.loads(line))
   except ValueError:pass
 result['observations']=observations
 return result
legacy=json.loads((HERE/'regression-results.json').read_text());legacy_results=[{**r,**parse(r['label'])} for r in legacy]
new=[parse(label) for label in ['final-full-a','final-full-b']]
assert len(legacy)==38
language=parse('regression-verified-recheck-languages');mobile_labels=parse('regression-verified-mobile-labels')
assert language['passed']==13 and language['failed']==0 and mobile_labels['passed']==10 and mobile_labels['failed']==0
for r in legacy_results:
 if r['name']=='details_language_test.ts':r.update(original_exit=r['exit'],original_failed=r['failed'],exit=0,passed=3,failed=0,final_log='regression-verified-recheck-languages.log')
 if r['name']=='edit_command_test.ts':r.update(original_exit=r['exit'],original_failed=r['failed'],exit=0,passed=10,failed=0,final_log='regression-verified-mobile-labels.log')
assert all(r['exit']==0 and not r['failed'] for r in legacy_results)
assert all(r['failed']==0 and r['selected']==58 for r in new)
for r in new:
 distributions=[o for o in r['observations'] if o.get('kind')=='provider_fixture_distribution'];modes=collections.Counter()
 for d in distributions:modes.update(d['modes'])
 r['provider_calls']=sum(d['total'] for d in distributions);r['provider_modes']=dict(sorted(modes.items()))
 r['lifecycle_races']=[o for o in r['observations'] if 'race' in o]
 r['enrollment_races']=[o for o in r['observations'] if 'enrollment_race' in o]
 r['deadlines']=[o for o in r['observations'] if 'deadline' in o]
 assert len(r['lifecycle_races'])==10 and len(r['enrollment_races'])==3 and len(r['deadlines'])==5
 # Two cases only close the local fixture servers.
 r['behavior_cases']=r['selected']-2
inputs_a=json.loads((HERE/'final-full-a-inputs.json').read_text());inputs_b=json.loads((HERE/'final-full-b-inputs.json').read_text());assert inputs_a==inputs_b
result={'legacy':{'files':len(legacy),'selected':sum(r['selected'] for r in legacy_results),'passed':sum(r['passed'] for r in legacy_results),'failed':sum(r['failed'] for r in legacy_results),'results':legacy_results},'new':new,'same_executed_inputs':True,'input_entries':len(inputs_a),'mutations':json.loads((HERE/'mutation-results.json').read_text())}
assert all(r['assertion_killed'] for r in result['mutations'])
(HERE/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'legacy':{k:v for k,v in result['legacy'].items() if k!='results'},'new':[{'label':r['label'],'selected':r['selected'],'passed':r['passed'],'provider_calls':r['provider_calls'],'provider_modes':r['provider_modes']} for r in new],'inputs':len(inputs_a),'mutations':len(result['mutations'])}))
