from pathlib import Path
import collections
import datetime
import hashlib
import json
import socket
import subprocess

E=Path(__file__).resolve().parent
R=E.parents[3]
B=R/'build/369-native-eligibility-r1'
assert not (E/'postflight.json').exists(), 'One terminal resource capture only'
before=json.loads((E/'preflight.json').read_text())

def out(*args): return subprocess.check_output(args,text=True).strip()
def objects(kind,ids): return json.loads(out('docker',kind,'inspect',*ids)) if ids else []
cs=objects('container',out('docker','ps','-aq').split())
ns=objects('network',out('docker','network','ls','-q','--no-trunc').split())
after=dict(containers=[dict(Id=c['Id'],Name=c['Name'],State=c['State']['Status'],Mounts=c['Mounts'],
    Labels=c['Config']['Labels'],RestartPolicy=c['HostConfig']['RestartPolicy']) for c in cs],
    volumes=out('docker','volume','ls','-q').split(),
    networks=[dict(Id=n['Id'],Name=n['Name'],Created=n['Created'],Labels=n['Labels'],Containers=n['Containers']) for n in ns],
    simulators=json.loads(out('xcrun','simctl','list','devices','--json')),
    captured_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
ports=[]
for port in [*range(63710,63717),8371,3396,3397]:
    for family,host in [(socket.AF_INET,'127.0.0.1'),(socket.AF_INET6,'::1')]:
        s=socket.socket(family,socket.SOCK_STREAM)
        try: s.bind((host,port));ports.append(dict(port=port,host=host,free=True))
        except OSError as error: ports.append(dict(port=port,host=host,free=False,error=str(error)))
        finally: s.close()
after['ports']=ports
(E/'postflight.json').write_text(json.dumps(after,indent=2)+'\n')
old={x['Id']:x for x in before['containers']}
new={x['Id']:x for x in after['containers']}
counter=lambda x:collections.Counter(json.dumps(v,sort_keys=True) for v in x)
containers=old.keys()==new.keys() and all(
    all(c[k]==new[i][k] for k in ['Id','Name','State','Labels','RestartPolicy']) and
    counter(c['Mounts'])==counter(new[i]['Mounts']) for i,c in old.items())
oldnets={n['Name']:n for n in before['networks']}
newnets={n['Name']:n for n in after['networks']}
nondefault=oldnets.keys()==newnets.keys() and all(newnets[n]==v for n,v in oldnets.items() if n!='bridge')
network_ids={n:x['Id'] for n,x in oldnets.items()}=={n:x['Id'] for n,x in newnets.items()}
source_rows=[]
for source in before['preserved_sources']:
    p=source['path'];current=dict(path=p,head=out('git','-C',p,'rev-parse','HEAD'),tree=out('git','-C',p,'rev-parse','HEAD^{tree}'),status=out('git','-C',p,'status','--porcelain','--untracked-files=no'))
    source_rows.append(dict(path=p,equal=source==current,current=current))
files=all(Path(p).is_file() and hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in before['old_evidence'].items())
impeccable=json.loads((E/'impeccable-before.json').read_text())
skills=all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in impeccable['files'].items())
result=dict(protected_containers=len(old),protected_containers_equal=containers,
    full_mount_objects_with_multiplicity_equal=containers,protected_volumes=len(before['volumes']),
    volumes_equal=sorted(before['volumes'])==sorted(after['volumes']),nondefault_networks_equal=nondefault,
    strict_network_ids_unchanged=False,current_interval_network_ids_equal=network_ids,
    retained_simulators_equal=before['simulators']==after['simulators'],
    retained_simulators=sum(len(x) for x in before['simulators']['devices'].values()),
    old_evidence_files=len(before['old_evidence']),old_evidence_equal=files,
    impeccable_version=impeccable['version'],impeccable_files=len(impeccable['files']),impeccable_equal=skills,
    source_rows=source_rows,ports=ports,owned_project_absent=not any('unify-push-369-native-r1' in c['Name'] for c in after['containers']),
    external_tool_cache_scope='unverified external default cache writes; see tool-cache-disposition.json')
result['resource_cleanup_passed']=all([containers,result['volumes_equal'],nondefault,network_ids,
    result['retained_simulators_equal'],files,skills,all(x['equal'] for x in source_rows),
    all(x['free'] for x in ports),result['owned_project_absent']])
(E/'cleanup-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['resource_cleanup_passed']
