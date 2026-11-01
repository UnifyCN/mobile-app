"""Verify the frozen cleanup capture. No Docker call or new live projection."""
from pathlib import Path
import collections,datetime,hashlib,json
HERE=Path(__file__).resolve().parent
before=json.loads((HERE/'preflight.json').read_text())
after=json.loads((HERE/'cleanup.json').read_text())
old={c['Id']:c for c in before['protected_containers']}
new={c['Id']:c for c in after['protected_containers']}
checks=[]
for identity,c in old.items():
    current=new[identity]
    assert all(c[k]==current[k] for k in ['Id','Name','State'])
    encode=lambda rows:collections.Counter(json.dumps(r,sort_keys=True) for r in rows)
    assert encode(c['Mounts'])==encode(current['Mounts'])
    checks.append({'Id':identity,'identity_state_equal':True,'full_mount_objects_equal':True,
        'raw_mount_array_equal':c['Mounts']==current['Mounts']})
assert len(old)==len(new)==33
assert after['owned_container_count']==0 and not after['owned_volumes'] and not after['owned_networks']
assert after['protected_volume_names_present'] and after['volume_names_equal'] and after['nondefault_network_ids_equal']
assert len(before['protected_volumes'])==18
assert len(after['ports'])==14 and all(x['free'] for x in after['ports'])
old_bridge=next(n for n in before['protected_networks'] if n['Name']=='bridge')
new_bridge=next(n for n in after['network_projection'] if n['Name']=='bridge')
trace=(HERE/'startup-network-lines.txt').read_text()
assert all(x in trace for x in [old_bridge['Id'],new_bridge['Id'],'starting VM','engine start complete'])
parse=lambda text:datetime.datetime.fromisoformat(text.replace('Z','+00:00'))
created=parse(new_bridge['Created'])
assert parse('2026-10-30T20:05:23.259997Z')<created<parse('2026-10-30T20:05:24.881248Z')
result={'protected_container_count':len(checks),'containers':checks,'protected_volumes':18,
  'protected_nondefault_networks':len(before['protected_networks'])-1,'ports_free_ipv4_ipv6':14,
  'owned_container_count':0,'owned_volume_count':0,'owned_network_count':0,
  'mount_order_only_differences':sum(not x['raw_mount_array_equal'] for x in checks),
  'strict_network_ids_unchanged':False,
  'bounded_default_bridge_disposition':'Resource Saver startup replacement inside the captured engine interval; no strict identity claim.',
  'old_bridge':old_bridge['Id'],'new_bridge':new_bridge,
  'inputs':{n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in ['preflight.json','cleanup.json','startup-network-lines.txt','startup-network-extraction.json']},
  'passed':True}
target=HERE/'cleanup-verification.json';assert not target.exists()
target.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['containers','inputs','new_bridge']},indent=2))
