from pathlib import Path
from preflight import require_bootstrap
require_bootstrap(Path(__file__).resolve().parent / 'bootstrap-complete.json')
from stack import credentials, identities, env, B, R, E, PROJECT
from probe import sha,save,redact
import urllib.request,json,secrets,time,subprocess
from pathlib import Path
credentials(); identities()
def sql(s):
 p=subprocess.run(['docker','exec','-i','supabase_db_'+PROJECT,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X','-q','-A','-t'],input=s.encode(),capture_output=True)
 if p.returncode:raise RuntimeError(redact(p.stderr.decode()))
 return p.stdout.decode()
def http(path,data,key):
 start=time.monotonic();req=urllib.request.Request(env['ACTIONS_API_URL']+path,data=json.dumps(data).encode(),headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 with urllib.request.urlopen(req) as r:raw=r.read();result=json.loads(raw);status=r.status
 return result,dict(status=status,bytes=len(raw),seconds=time.monotonic()-start)
if __name__=='__main__':
 rows=[]
 for row in json.loads((Path('/Users/savargupta/.t3/worktrees/Unify/t3-4752438b/DOCS/companion-actions/evidence/369-native-eligibility-r1/native-fixture-schema.json')).read_text()):
  p=__import__('pathlib').Path(row['source']);assert sha(p)==row['sha256'];out=sql(p.read_text());rows.append(dict(source=str(p),sha256=sha(p),output=out))
 save('native-fixture-schema.json',rows)
 account=dict(email='android369r6-'+secrets.token_hex(4)+'@example.test',password=secrets.token_urlsafe(24))
 user,rec=http('/auth/v1/admin/users',dict(**account,email_confirm=True),env['ACTIONS_SERVICE_ROLE_KEY']);account['id']=user['id']
 (B/'private/account.json').write_text(json.dumps(account));(B/'private/account.json').chmod(0o600)
 uid=account['id']
 out=sql("update public.users set username='Android369R6',email='synthetic@example.test' where id='"+uid+"'; insert into public.user_onboarding_profiles(id,stage,persona,onboarding_completed,preferred_language) values ('"+uid+"',1,'newcomer',true,'en'); select json_build_object('privacy',privacy_policy_accepted_at,'guidelines',community_guidelines_accepted_at) from public.users where id='"+uid+"';")
 save('synthetic-account.json',dict(synthetic=True,admin_fixture=True,native_auth=False,http=rec,consent_fixture_values=out))
 print('Fresh synthetic account created. Native consent remains unset.')
