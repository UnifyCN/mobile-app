from pathlib import Path
import hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[3]; FRONT=ROOT/'unify-front-end'
cases=[
 ('ownership','services/companionActions/pushDevice.ts',lambda s:s.replace('assertOwned(owner);','/* sensitivity: captured owner checks removed */'),'pushDevice.test.ts'),
 ('persist','services/companionActions/pushDevice.ts',lambda s:s.replace('await this.save(owner, value);','/* sensitivity: first durable write omitted */',1),'pushDevice.test.ts'),
 ('secure-options','services/companionActions/pushNative.ts',lambda s:s.replace('requireAuthentication: false','requireAuthentication: true'),'pushNative.test.ts'),
 ('dedup','services/companionActions/pushIntents.ts',lambda s:s.replace('if (owner && this.handled.has(this.key(owner, intent.delivery_id))) return;','/* sensitivity: receive dedup removed */').replace('if (this.handled.has(this.key(owner, entry.deliveryId)))','if (false)').replace('if (!this.routed.has(key))','if (true)'),'pushNavigation.test.tsx'),
]
results=[]
for name,file,mutate,test in cases:
 path=FRONT/file;before=path.read_bytes();changed=mutate(before.decode()).encode();assert changed!=before
 print('FALSIFIER: fault '+name+' survives, fails setup instead of assertions, or restoration differs.',flush=True)
 try:
  path.write_bytes(changed)
  run=subprocess.run(['python3',str(HERE/'run.py'),'fault-'+name,'npx','jest','__tests__/companionActions/'+test,'--runInBand','--watchAll=false'],cwd=ROOT,stdout=subprocess.DEVNULL)
  log=(HERE/('fault-'+name+'.log')).read_text()
  binding=run.returncode!=0 and re.search(r'Tests:\s+\d+ failed',log) is not None and 'Test suite failed to run' not in log
  results.append({'fault':name,'file':file,'unfaulted_sha256':hashlib.sha256(before).hexdigest(),'mutated_sha256':hashlib.sha256(changed).hexdigest(),'exit':run.returncode,'binding_assertion_failure':binding})
 finally:
  path.write_bytes(before);assert path.read_bytes()==before
 (HERE/'fault-results.json').write_text(json.dumps(results,indent=2)+'\n')
 assert binding, name
 print(name,'binding failure and exact restore PASS',flush=True)
assert len(results)==4 and all(x['binding_assertion_failure'] for x in results)
