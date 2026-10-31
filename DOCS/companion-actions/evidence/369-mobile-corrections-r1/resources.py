from pathlib import Path
import collections,datetime,hashlib,json,socket,subprocess,sys
HERE=Path(__file__).resolve().parent
PROJECT='unify-push-369-mobile-correction-r1'
def out(*cmd):return subprocess.check_output(cmd,text=True).strip()
def inspect(kind,ids):return json.loads(out('docker',kind,'inspect',*ids)) if ids else []
def capture():
 cs=inspect('container',out('docker','ps','-aq').split())
 vs=out('docker','volume','ls','-q').splitlines()
 ns=inspect('network',out('docker','network','ls','-q','--no-trunc').split())
 return {'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected_containers':[{'Id':c['Id'],'Name':c['Name'],'State':c['State']['Status'],'Mounts':c['Mounts']} for c in cs], 'protected_volumes':vs,'protected_networks':[{'Name':n['Name'],'Id':n['Id'],'Created':n['Created']} for n in ns]}
def ports():
 rows=[]
 for port in range(63610,63617):
  for family,host in [(socket.AF_INET,'127.0.0.1'),(socket.AF_INET6,'::1')]:
   sock=socket.socket(family,socket.SOCK_STREAM)
   try:sock.bind((host,port));rows.append({'port':port,'host':host,'free':True})
   finally:sock.close()
 return rows
mode=sys.argv[1]
if mode=='preflight':
 assert not (HERE/'preflight.json').exists()
 host=Path('/Users/savargupta/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log')
 (HERE/'host-before.txt').write_bytes(host.read_bytes()[-300000:])
 result=capture(); result['ports_free_ipv4_ipv6']=ports()
 (HERE/'host-after.txt').write_bytes(host.read_bytes()[-300000:])
 (HERE/'preflight.json').write_text(json.dumps(result,indent=2)+'\n')
 assert len(result['protected_containers'])==33
 assert len(result['protected_volumes'])==18
 assert len([n for n in result['protected_networks'] if n['Name']!='bridge'])==7
 print('Protected resources: 33 containers, 18 volumes, 7 nondefault networks. All 14 binds passed.')
elif mode=='before-stop':
 before=json.loads((HERE/'preflight.json').read_text());protected={c['Id'] for c in before['protected_containers']}
 cs=inspect('container',out('docker','ps','-aq','--filter','label=com.supabase.cli.project='+PROJECT).split())
 assert cs
 for c in cs:
  assert c['Id'] not in protected and c['Config']['Labels']['com.supabase.cli.project']==PROJECT
 (HERE/'before-stop.json').write_text(json.dumps([{'Id':c['Id'],'Name':c['Name'],'State':c['State']['Status'],'Labels':c['Config']['Labels']} for c in cs],indent=2)+'\n')
 print('Owned project identities verified; none is protected.')
elif mode=='cleanup':
 assert not (HERE/'cleanup.json').exists()
 before=json.loads((HERE/'preflight.json').read_text());after=capture();after['ports_free_ipv4_ipv6']=ports()
 (HERE/'cleanup.json').write_text(json.dumps(after,indent=2)+'\n')
 old={c['Id']:c for c in before['protected_containers']};new={c['Id']:c for c in after['protected_containers']}
 assert old.keys()==new.keys()
 order_only=0
 encode=lambda rows:collections.Counter(json.dumps(r,sort_keys=True) for r in rows)
 for id,c in old.items():
  assert all(c[k]==new[id][k] for k in ['Id','Name','State'])
  assert encode(c['Mounts'])==encode(new[id]['Mounts'])
  order_only+=c['Mounts']!=new[id]['Mounts']
 assert sorted(before['protected_volumes'])==sorted(after['protected_volumes'])
 a={n['Name']:n['Id'] for n in before['protected_networks']};b={n['Name']:n['Id'] for n in after['protected_networks']}
 assert all(b.get(k)==v for k,v in a.items() if k!='bridge')
 assert a.keys()==b.keys()
 # No bridge difference is excused without a separately recorded fresh startup interval.
 assert a.get('bridge')==b.get('bridge'), 'Fresh bounded bridge disposition required'
 result={'passed':True,'protected_containers':len(old),'protected_volumes':len(before['protected_volumes']),'protected_nondefault_networks':7,'full_mount_objects_equal':True,'mount_order_only_differences':order_only,'ports_free_ipv4_ipv6':14,'strict_network_ids_unchanged':False,'current_captured_interval_network_ids_equal':a==b}
 (HERE/'cleanup-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
