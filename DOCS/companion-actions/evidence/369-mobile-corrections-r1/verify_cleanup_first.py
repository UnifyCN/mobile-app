from pathlib import Path
import collections,datetime,hashlib,json,re
HERE=Path(__file__).resolve().parent
before=json.loads((HERE/'preflight.json').read_text());after=json.loads((HERE/'cleanup.json').read_text())
old={c['Id']:c for c in before['protected_containers']};new={c['Id']:c for c in after['protected_containers']}
assert old.keys()==new.keys() and len(old)==33
encode=lambda rows:collections.Counter(json.dumps(r,sort_keys=True) for r in rows)
for id,c in old.items():
 assert all(c[k]==new[id][k] for k in ['Id','Name','State'])
 assert encode(c['Mounts'])==encode(new[id]['Mounts'])
assert sorted(before['protected_volumes'])==sorted(after['protected_volumes']) and len(before['protected_volumes'])==18
oldnet={n['Name']:n for n in before['protected_networks']};newnet={n['Name']:n for n in after['protected_networks']}
assert oldnet.keys()==newnet.keys()
assert all(newnet[k]['Id']==v['Id'] for k,v in oldnet.items() if k!='bridge')
assert len(oldnet)-1==7 and len(after['ports_free_ipv4_ipv6'])==14 and all(p['free'] for p in after['ports_free_ipv4_ipv6'])
parse=lambda t:datetime.datetime.fromisoformat(t.replace('Z','+00:00'))
raw=(HERE/'host-cleanup-tail.txt').read_text();created=parse(newnet['bridge']['Created'])
lines=raw.splitlines();stamped=[]
for line in lines:
 m=re.match(r'\[([^]]+Z)\]',line)
 if m:stamped.append((parse(m[1]),line))
start=max((x for x in stamped if 'starting VM' in x[1] and x[0]<=created),key=lambda x:x[0])
end=min((x for x in stamped if 'engine start complete' in x[1] and x[0]>=created),key=lambda x:x[0])
assert parse(before['captured_at'])<start[0]<created<end[0]<parse(after['captured_at'])
oldline=next(x for x in stamped if oldnet['bridge']['Id'] in x[1] and 'de-registering' in x[1] and end[0]<=x[0]<=end[0]+datetime.timedelta(seconds=2))
newline=next(x for x in stamped if newnet['bridge']['Id'] in x[1] and 're-registering' in x[1] and end[0]<=x[0]<=end[0]+datetime.timedelta(seconds=2))
selected='\n'.join(x[1] for x in [start,end,oldline,newline])+'\n'
(HERE/'startup-network-lines.txt').write_text(selected)
result={'passed':True,'protected_containers':33,'full_mount_objects_equal':True,'mount_order_only_differences':sum(c['Mounts']!=new[id]['Mounts'] for id,c in old.items()),'protected_volumes':18,'protected_nondefault_networks':7,'ports_free_ipv4_ipv6':14,'owned_containers':0,'owned_volumes':0,'owned_networks':0,'strict_network_ids_unchanged':False,
 'bounded_bridge_disposition':'Resource Saver startup and resync in the fresh captured interval. The replacement bridge creation falls inside engine startup. This is not a strict network identity claim or continuous process observation.',
 'startup':start[0].isoformat(),'engine_ready':end[0].isoformat(),'bridge_created':created.isoformat(),'old_bridge':oldnet['bridge']['Id'],'new_bridge':newnet['bridge']['Id'],
 'input_hashes':{p:hashlib.sha256((HERE/p).read_bytes()).hexdigest() for p in ['preflight.json','cleanup.json','host-cleanup-tail.txt','startup-network-lines.txt']}}
p=HERE/'cleanup-verification.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
