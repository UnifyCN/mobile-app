"""Check the native requests against the actual local client configuration."""
from probe import *
from stack import credentials,env
import urllib.request,urllib.error
P=Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-bb8e7547/build/android-native-speech-r15/mobile')
credentials();rows=[]
def request(name,url):
 start=time.monotonic()
 try:r=urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/expo+json','Expo-Platform':'android'}),timeout=120)
 except urllib.error.HTTPError as exc:r=exc
 with r:data=r.read();status=r.status
 rows.append(dict(name=name,url=url,status=status,bytes=len(data),seconds=time.monotonic()-start,sha256=hashlib.sha256(data).hexdigest()))
 save('metro-http.json',rows)
 if status!=200:save(name+'-failure.json',dict(body=redact(data.decode(errors='replace'))))
 assert status==200,(name,status)
 return data
raw=request('manifest','http://127.0.0.1:8351');m=json.loads(raw);extra=m['extra']['expoClient']['extra']
assert extra['supabaseUrl']==env['ACTIONS_API_URL']=='http://127.0.0.1:65100'
assert extra['supabaseAnonKey']==env['ACTIONS_ANON_KEY']
u=m['launchAsset']['url'];assert u.startswith('http://127.0.0.1:8351/')
save('effective-manifest.json',dict(supabaseUrl=extra['supabaseUrl'],actual_anon_key_equal=True,keySource='owned status; value withheld',bundleUrl=u))
map_url=u.replace('.bundle?','.map?');raw=request('source-map',map_url);m=json.loads(raw);matches=[]
for name,content in zip(m['sources'],m['sourcesContent']):
 if 'node_modules/' in name or name.startswith('__'):continue
 p=P/name
 if p.is_file() and p.suffix in ['.ts','.tsx','.js','.jsx','.json']:
  p=p.resolve()
  assert p.is_relative_to(P.resolve()),name
  assert p.read_text()==content,name
  matches.append(dict(path=str(p.relative_to(P)),sha256=sha(p)))
assert len(matches)>=500
assert any(x['path']=='components/companion/tasks/SavedDetails.tsx' and x['sha256']=='de0f0b954242a186802a04e3ac216d42bf435666443e0322aa47661846986939' for x in matches)
save('source-map.json',dict(matched=matches,count=len(matches),served_source_only=True))
raw=request('bundle',u);assert len(raw)>1000000
save('metro-gate.json',dict(passed=True,actual_local_configuration=True,requests=rows,matched_source_files=len(matches),guest_exists=False,platform='android',bundle_selected=False))
print('ACTUAL_CONFIGURATION_NATIVE_HTTP_GATE_PASS',[(r['name'],r['status'],r['bytes']) for r in rows])
