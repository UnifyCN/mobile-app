from pathlib import Path
import hashlib,json,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
packet=json.loads(Path('/tmp/unify-companion-359/accepted-369-server-stage-r2.json').read_text())
def git(path,*args):return subprocess.check_output(['git','-C',str(path),*args],text=True).strip()
assert packet['marker']=='COMPANION_PUSH_369_SERVER_STAGE_APPROVED_FOR_CLIENT' and packet['ticket_369_accepted'] is False
rows={}
for name,v in packet['candidates'].items():
 p=Path(v['path']);r={'path':str(p),'physical_path':str(p.resolve()),'branch':git(p,'branch','--show-current'),'head':git(p,'rev-parse','HEAD'),'tree':git(p,'rev-parse','HEAD^{tree}'),'status':git(p,'status','--porcelain')}
 assert r['branch']==v['branch'] and r['head']==v['head'] and r['tree']==v['tree'] and not r['status'];rows[name]=r
for name,path in [('mobile','/Users/savargupta/.t3/worktrees/Unify/feat-companion-actions-359'),('web','/Users/savargupta/.t3/worktrees/Unify-Web-App/feat-companion-actions-359')]:
 assert git(path,'rev-parse','HEAD')==packet['candidates'][name]['integration'] and git(path,'status','--porcelain')==''
 rows[name+'_integration']={'path':path,'branch':git(path,'branch','--show-current'),'head':git(path,'rev-parse','HEAD'),'clean':True}
hashes={}
for path,want in {**packet['authority'],**{packet['review'][k]:packet['review'][k+'_sha256'] for k in ['report','appendix']}}.items():
 got=hashlib.sha256(Path(path).read_bytes()).hexdigest();assert got==want;hashes[path]=got
impeccable=Path('/Users/savargupta/.agents/skills/impeccable/SKILL.md');assert hashlib.sha256(impeccable.read_bytes()).hexdigest()=='c06283d40a4dd7680001488be3d9481c6f047c99e0f3084d060f3a084b3c66fa'
unchanged={}
for path in ['unify-front-end/package.json','unify-front-end/package-lock.json','unify-front-end/services/companionActions/pushContract.ts','unify-front-end/app.config.js']:
 old=subprocess.check_output(['git','show','3b03a675a1287e1f212e77fe956863f5db8e2132:'+path],cwd=ROOT)
 current=(ROOT/path).read_bytes();assert current==old;unchanged[path]=hashlib.sha256(current).hexdigest()
assert git(ROOT,'diff','--name-only','3b03a675a1287e1f212e77fe956863f5db8e2132','--','unify-front-end/supabase','AGENTS.md','PRODUCT.md','DESIGN.md')==''
result={'passed':True,'sources':rows,'authority_hashes':hashes,'unchanged_inputs':unchanged,'impeccable_version':'3.9.1','impeccable_sha256':hashlib.sha256(impeccable.read_bytes()).hexdigest(),'primary_path':str(ROOT),'primary_branch':git(ROOT,'branch','--show-current')}
p=HERE/'terminal-authority.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print('Source, integration, authority, unchanged contract/dependency/config and Impeccable checks PASS.');print(str(ROOT),result['primary_branch'])
