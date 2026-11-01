from probe import *
import task_fixture
label=sys.argv[1];assert re.fullmatch(r'[a-z0-9-]+',label)
uid=json.loads((B/'private/account.json').read_text())['id']
q="select json_build_object('details',(select coalesce(json_agg(d),'[]'::json) from public.companion_saved_details d where user_id='"+uid+"'),'receipts',(select coalesce(json_agg(r),'[]'::json) from public.companion_action_receipts r where user_id='"+uid+"'));"
p=subprocess.run(task_fixture.command('unify-native-speech-374-r15'),input=q.encode(),capture_output=True,timeout=30);assert p.returncode==0,redact(p.stderr.decode())
save(label+'-details.json',dict(result=json.loads(p.stdout),exit=0,proof_class='Independent SQL observer of native operations; no login or write'))
print(redact(p.stdout.decode()))
