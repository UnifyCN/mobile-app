"""Read-only Docker and port preservation ledger. Does not stop or inspect credentials."""
from pathlib import Path
import datetime,json,socket,subprocess,sys
HERE=Path(__file__).resolve().parent
OWN='unify-profile-371-r1';OTHER='unify-push-369-ios-native-r8'
def run(*args):return subprocess.check_output(args,text=True).strip()
def inspect(kind,names):return json.loads(run('docker',kind,'inspect',*names)) if names else []
ids=run('docker','ps','-aq').splitlines()
# Request only allowed metadata. Never retrieve another project's environment.
fmt='{"Id":{{json .Id}},"Name":{{json .Name}},"State":{{json .State.Status}},"Mounts":{{json .Mounts}}}'
rows=[json.loads(line) for line in run('docker','inspect','--format',fmt,*ids).splitlines()] if ids else []
networks=inspect('network',run('docker','network','ls','-q').splitlines())
volumes=sorted(run('docker','volume','ls','-q').splitlines())
ports=[]
for port in [*range(64510,64517),3456,3487]:
 values={}
 for name,family,address in [('ipv4',socket.AF_INET,('127.0.0.1',port)),('ipv6',socket.AF_INET6,('::1',port))]:
  sock=socket.socket(family,socket.SOCK_STREAM)
  sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  try:sock.bind(address);values[name]='free'
  except OSError as e:values[name]='occupied:'+str(e.errno)
  finally:sock.close()
 ports.append({'port':port,**values})
now={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers':rows,'networks':networks,'volumes':volumes,'ports':ports,'concurrent_exception':OTHER,'owned_project':OWN}
(HERE/'resources-after.json').write_text(json.dumps(now,indent=2)+'\n')
before=json.loads((HERE/'resources-before.json').read_text())
def ignored(name):return name.endswith('_'+OWN) or name.endswith('_'+OTHER)
def normalize_container(row):
 return {**row,'Mounts':sorted(row['Mounts'],key=lambda m:json.dumps(m,sort_keys=True))}
violations=[]
for old in before['containers']:
 if ignored(old['Name']):continue
 matches=[r for r in rows if r['Id']==old['Id']]
 if not matches or normalize_container(matches[0])!=normalize_container(old):violations.append({'kind':'older container changed','name':old['Name']})
for row in rows:
 if not ignored(row['Name']) and not any(old['Id']==row['Id'] for old in before['containers']):violations.append({'kind':'unassigned new container','name':row['Name']})
for old in before['networks']:
 if ignored(old['Name']):continue
 matches=[r for r in networks if r['Id']==old['Id']]
 if not matches or matches[0]!=old:violations.append({'kind':'older network changed','name':old['Name']})
for row in networks:
 if not ignored(row['Name']) and not any(old['Id']==row['Id'] for old in before['networks']):violations.append({'kind':'unassigned new network','name':row['Name']})
for name in before['volumes']:
 if not ignored(name) and name not in volumes:violations.append({'kind':'older volume removed','name':name})
for name in volumes:
 if not ignored(name) and name not in before['volumes']:violations.append({'kind':'unassigned new volume','name':name})
owned={'containers':[r['Name'] for r in rows if OWN in r['Name']],'networks':[r['Name'] for r in networks if OWN in r['Name']],'volumes':[n for n in volumes if OWN in n]}
final='--final' in sys.argv
if final:
 if any(owned.values()):violations.append({'kind':'owned resources remain','resources':owned})
 if any(r['ipv4']!='free' or r['ipv6']!='free' for r in ports):violations.append({'kind':'assigned port not free'})
result={'final_cleanup':final,'violations':violations,'owned_resources':owned,'older_mounts_compared_in_full':True,'native_lifecycle_exception':OTHER,'ports':ports,'pass':not violations}
(HERE/'preservation-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));raise SystemExit(bool(violations))
