"""Read-only resource checks for the one root-owned correction project."""
from pathlib import Path
import datetime,json,socket,subprocess,sys
HERE=Path(__file__).resolve().parent
PROJECT='unify-push-369-correction-r1'
before=json.loads((HERE/'preflight.json').read_text())
def out(*cmd):return subprocess.check_output(cmd,text=True).strip()
def objects(kind,ids):return json.loads(out('docker',kind,'inspect',*ids)) if ids else []
owned_ids=out('docker','ps','-aq','--filter','label=com.supabase.cli.project='+PROJECT).split()
owned=objects('container',owned_ids)
for c in owned:assert c['Config']['Labels']['com.supabase.cli.project']==PROJECT
if sys.argv[1]=='before-stop':
    assert owned
    result={'project':PROJECT,'owned':[{'Id':c['Id'],'Name':c['Name'],'State':c['State']['Status'],'labels':c['Config']['Labels']} for c in owned]}
else:
    protected=objects('container',[x['Id'] for x in before['protected_containers']])
    projection=[{'Id':c['Id'],'Name':c['Name'],'State':c['State']['Status'],'Mounts':c['Mounts']} for c in protected]
    volumes=out('docker','volume','ls','-q').splitlines()
    nets=objects('network',out('docker','network','ls','-q','--no-trunc').split())
    prior_nets={n['Name']:n['Id'] for n in before['protected_networks']}
    current_nets={n['Name']:n['Id'] for n in nets}
    owned_volumes=[v for v in volumes if PROJECT in v]
    owned_networks=[n['Name'] for n in nets if n.get('Labels',{}).get('com.supabase.cli.project')==PROJECT or PROJECT in n['Name']]
    ports=[]
    for port in before['ports_free_ipv4_ipv6']:
        for family,host in [(socket.AF_INET,'127.0.0.1'),(socket.AF_INET6,'::1')]:
            sock=socket.socket(family,socket.SOCK_STREAM)
            try:sock.bind((host,port));ports.append({'port':port,'host':host,'free':True})
            finally:sock.close()
    result={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'project':PROJECT,
      'protected_containers':projection,'protected_container_projection_equal':projection==before['protected_containers'],
      'protected_volume_names_present':all(v in volumes for v in before['protected_volumes']),
      'volume_names_equal':sorted(volumes)==sorted(before['protected_volumes']),
      'nondefault_network_ids_equal':all(current_nets.get(n)==v for n,v in prior_nets.items() if n!='bridge'),
      'current_interval_network_ids_unchanged':all(current_nets.get(n)==v for n,v in prior_nets.items()),
      'historical_strict_network_ids_unchanged':False,
      'network_projection':[{'Name':n['Name'],'Id':n['Id'],'Created':n['Created']} for n in nets],
      'owned_container_count':len(owned),'owned_volumes':owned_volumes,'owned_networks':owned_networks,'ports':ports}
    (HERE/'cleanup.json').write_text(json.dumps(result,indent=2)+'\n')
    assert not owned and not owned_volumes and not owned_networks
    assert result['protected_container_projection_equal'] and result['protected_volume_names_present'] and result['nondefault_network_ids_equal']
label='before-stop.json' if sys.argv[1]=='before-stop' else 'cleanup.json'
if label=='before-stop.json':(HERE/label).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['protected_containers','network_projection','ports','owned']},indent=2))
