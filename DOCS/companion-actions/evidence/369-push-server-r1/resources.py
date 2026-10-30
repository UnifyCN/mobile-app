"""Read-only resource checks. Only the named project may be removed separately."""
from pathlib import Path
import collections,datetime,json,socket,subprocess,sys
HERE=Path(__file__).resolve().parent;PROJECT='unify-push-369-server-r1'
def run(*a):return subprocess.check_output(a,text=True).strip()
def snapshot():
 ids=run('docker','ps','-aq').splitlines();cs=json.loads(run('docker','inspect',*ids)) if ids else []
 ns=run('docker','network','ls','-q').splitlines();networks=json.loads(run('docker','network','inspect',*ns)) if ns else []
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers':[{'Id':c['Id'],'Name':c['Name'],'State':c['State']['Status'],'Mounts':c['Mounts']} for c in cs],'networks':networks,'volumes':run('docker','volume','ls','-q').splitlines()}
def projection(mounts):return sorted(json.dumps(x,sort_keys=True) for x in mounts)
base=json.loads((HERE/'preflight.json').read_text());now=snapshot();label=sys.argv[1]
(HERE/(label+'-resources.json')).write_text(json.dumps(now,indent=2)+'\n')
by_id={c['Id']:c for c in now['containers']};comparisons=[]
for c in base['containers']:
 n=by_id.get(c['Id']);comparisons.append({'Id':c['Id'],'name':c['Name'],'same_state':n is not None and c['State']==n['State'],'same_mounts':n is not None and projection(c['Mounts'])==projection(n['Mounts'])})
assert all(c['same_state'] and c['same_mounts'] for c in comparisons)
assert set(base['volumes'])<=set(now['volumes'])
nets={n['Name']:n for n in now['networks']};differences=[]
for old in base['networks']:
 new=nets.get(old['Name']);assert new is not None
 if old['Id']!=new['Id']:differences.append({'name':old['Name'],'before':old['Id'],'after':new['Id'],'created':new['Created']})
assert all(x['name']=='bridge' for x in differences)
result={'at':now['at'],'protected_count':len(comparisons),'protected_distribution':dict(collections.Counter(c['State'] for c in base['containers'])),'container_comparisons':comparisons,'protected_volumes':len(base['volumes']),'protected_networks':len(base['networks']),'differences':differences,'strict_network_ids_unchanged':not differences,'custom_network_ids_unchanged':True,'default_bridge_exception':'See bridge-exception.md; supplied for root/review disposition' if differences else None}
if label=='cleanup':
 assert not any(PROJECT in c['Name'] for c in now['containers'])
 assert not any(PROJECT in n['Name'] for n in now['networks'])
 assert not any(PROJECT in v for v in now['volumes'])
 ports=[]
 for port in range(63610,63617):
  for family,addr in [(socket.AF_INET,'127.0.0.1'),(socket.AF_INET6,'::1')]:
   with socket.socket(family) as s:s.bind((addr,port))
  ports.append(port)
 result['ports_free_ipv4_ipv6']=ports
(HERE/(label+'-comparison.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='container_comparisons'}))
