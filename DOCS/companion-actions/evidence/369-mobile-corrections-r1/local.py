from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tarfile,time
HERE=Path(__file__).resolve().parent; MOBILE=HERE.parents[3]
SOURCE=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root')
PRIVATE=HERE/'private'; WEB=PRIVATE/'web'; STACK=PRIVATE/'stack'; PROJECT='unify-push-369-mobile-correction-r1'
ENV=os.environ.copy(); ENV.update(DENO_DIR=str(PRIVATE/'deno'),XDG_CACHE_HOME=str(PRIVATE/'cache'),ACTIONS_DB_CONTAINER='supabase_db_'+PROJECT,ACTIONS_REST_CONTAINER='supabase_rest_'+PROJECT,ACTIONS_CONTENT_PORT='63614',ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:63614/content',ACTIONS_MOBILE_LOCALES=str(MOBILE/'unify-front-end/i18n/locales'))
def out(*cmd):return subprocess.check_output(cmd,text=True,env=ENV).strip()
def log(name,cmd,cwd=MOBILE):
 path=HERE/(name+'.log');record=HERE/(name+'-command.json');assert not path.exists() and not record.exists()
 start=time.time()
 with path.open('w') as f:r=subprocess.run(cmd,cwd=cwd,env=ENV,stdout=f,stderr=subprocess.STDOUT)
 record.write_text(json.dumps({'command':cmd,'cwd':str(cwd),'exit':r.returncode,'seconds':time.time()-start},indent=2)+'\n');print(name,r.returncode,flush=True);return r.returncode

def identities():
 result=[];protected={c['Id'] for c in json.loads((HERE/'preflight.json').read_text())['protected_containers']}
 for kind in ['db','rest','edge_runtime','auth','kong']:
  c=json.loads(out('docker','inspect','supabase_'+kind+'_'+PROJECT))[0]
  assert c['Id'] not in protected and c['Config']['Labels']['com.supabase.cli.project']==PROJECT and c['State']['Running']
  assert Path(c['Config']['Labels']['com.supabase.cli.workdir']).resolve()==STACK.resolve()
  if kind=='edge_runtime':assert 'COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:63614/content' in c['Config']['Env']
  result.append({'Id':c['Id'],'Name':c['Name'],'Labels':c['Config']['Labels']})
 return result

def env():
 for line in out('supabase','status','--workdir',str(STACK),'-o','env').splitlines():
  if '=' in line:
   k,v=line.split('=',1);ENV['ACTIONS_'+k]=v.strip('"')
 assert ENV['ACTIONS_API_URL']=='http://127.0.0.1:63610' and '@127.0.0.1:63611' in ENV['ACTIONS_DB_URL']

action=sys.argv[1]
if action=='prepare':
 assert not PRIVATE.exists(); WEB.mkdir(parents=True);(STACK/'supabase/migrations').mkdir(parents=True)
 archive=subprocess.Popen(['git','-C',str(SOURCE),'archive','8f3720af36c50768ff05d25804a69d28d36fd5c4'],stdout=subprocess.PIPE)
 with tarfile.open(fileobj=archive.stdout,mode='r|') as tar:tar.extractall(WEB,filter='data')
 assert archive.wait()==0
 entries=[]
 for row in out('git','-C',str(SOURCE),'ls-tree','-r','8f3720af36c50768ff05d25804a69d28d36fd5c4').splitlines():
  meta,name=row.split('\t');mode,kind,oid=meta.split();p=WEB/name
  if kind!='blob':continue
  data=p.read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==oid
  p.chmod(0o444);entries.append({'path':name,'git_blob':oid,'sha256':hashlib.sha256(data).hexdigest()})
 (HERE/'web-export-inputs.json').write_text(json.dumps(entries,indent=2)+'\n')
 for p in (WEB/'supabase/tests/companion-actions/supabase/migrations').glob('*.sql'):shutil.copyfile(p,STACK/'supabase/migrations'/p.name)
 config=(WEB/'supabase/tests/companion-actions/supabase/config.toml').read_text().replace('unify-actions-363',PROJECT)
 for a,b in [(60671,63610),(60672,63611),(60673,63612),(60674,63613)]:config=config.replace(str(a),str(b))
 (STACK/'supabase/config.toml').write_text(config)
 target=STACK/'supabase/functions';target.mkdir()
 shutil.copytree(WEB/'supabase/functions/companion-actions',target/'companion-actions')
 (target/'rag-query').mkdir();shutil.copytree(WEB/'supabase/functions/rag-query/lib',target/'rag-query/lib')
 original=json.loads((HERE.parent/'369-server-corrections-r1/service.lock').read_text())
 adjusted={k:v for k,v in original.items() if k!='workspace'}
 (PRIVATE/'deno.lock').write_text(json.dumps(adjusted,indent=2)+'\n')
 (HERE/'lock-adapter.json').write_text(json.dumps({'removed_workspace_metadata_only':True,'all_resolution_sections_equal':all(adjusted[k]==v for k,v in original.items() if k!='workspace')},indent=2)+'\n')
 assert log('local-start',['supabase','start','--workdir',str(STACK)])==0
 env();(HERE/'started-identities.json').write_text(json.dumps(identities(),indent=2)+'\n')
 bootstrap=PRIVATE/'bootstrap.ts'
 bootstrap.write_text("import {readyPush, localPolicy} from './web/supabase/tests/companion-actions/pushSupport.ts';\nimport {sql} from './web/supabase/tests/companion-actions/support.ts';\nawait readyPush(); await localPolicy(); console.log('Approved local schema and policy ready'); await sql.end();\n")
 assert log('local-bootstrap',['deno','run','--no-check','--node-modules-dir=none','--lock='+str(PRIVATE/'deno.lock'),'--frozen','--allow-net=127.0.0.1:63610,127.0.0.1:63611,127.0.0.1:63614','--allow-env','--allow-read='+str(MOBILE),'--allow-run','--allow-write='+str(PRIVATE),str(bootstrap)])==0
elif action=='bootstrap':
 env();identities()
 original=json.loads((HERE.parent/'369-server-corrections-r1/service.lock').read_text())
 adjusted={k:v for k,v in original.items() if k!='workspace'}
 (PRIVATE/'deno.lock').write_text(json.dumps(adjusted,indent=2)+'\n')
 (HERE/'lock-adapter.json').write_text(json.dumps({'removed_workspace_metadata_only':True,'all_resolution_sections_equal':all(adjusted[k]==v for k,v in original.items() if k!='workspace'),'source_sha256':hashlib.sha256((HERE.parent/'369-server-corrections-r1/service.lock').read_bytes()).hexdigest(),'adapted_sha256':hashlib.sha256((PRIVATE/'deno.lock').read_bytes()).hexdigest()},indent=2)+'\n')
 sys.exit(log('local-bootstrap-r2',['deno','run','--no-check','--node-modules-dir=none','--lock='+str(PRIVATE/'deno.lock'),'--frozen','--allow-net=127.0.0.1:63610,127.0.0.1:63611,127.0.0.1:63614','--allow-env','--allow-read='+str(MOBILE),'--allow-run','--allow-write='+str(PRIVATE),str(PRIVATE/'bootstrap.ts')]))
elif action=='test':
 env();identities();ENV['PUSH_CLIENT_LOCAL']='1'
 # Node's native fetch is preserved before jest-expo installs SDK stand-ins.
 ENV['NODE_OPTIONS']='--require='+str(HERE/'real-fetch.cjs')
 sys.exit(log(sys.argv[2],['npm','exec','--','jest','__tests__/companionActions/pushSessionLocal.test.tsx','--runInBand','--watchAll=false'],MOBILE/'unify-front-end'))
elif action=='stop':
 identities();assert log('local-stop',['supabase','stop','--project-id',PROJECT,'--workdir',str(STACK),'--no-backup'])==0
 # Verify exact exported bytes before removing the disposable export and local credentials.
 entries=json.loads((HERE/'web-export-inputs.json').read_text())
 assert all(hashlib.sha256((WEB/e['path']).read_bytes()).hexdigest()==e['sha256'] for e in entries)
 shutil.rmtree(PRIVATE)
 (HERE/'private-cleanup.json').write_text(json.dumps({'removed':str(PRIVATE),'exact_export_verified':len(entries),'keys_retained':False},indent=2)+'\n')
