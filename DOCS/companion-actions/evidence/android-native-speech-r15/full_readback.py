from probe import *
import task_fixture
label=sys.argv[1];assert re.fullmatch(r'[a-z0-9-]+',label)
uid=json.loads((B/'private/account.json').read_text())['id']
fields=[]
for name,table,predicate in [('task','custom_checklist_tasks',"id=3698001 and user_id='"+uid+"'"),('steps','companion_task_steps',"user_id='"+uid+"'"),('details','companion_saved_details',"user_id='"+uid+"'"),('receipts','companion_action_receipts',"user_id='"+uid+"'"),('reminders','companion_task_reminders',"user_id='"+uid+"'")]:
 fields.append("'"+name+"',(select coalesce(json_agg(x),'[]'::json) from (select * from public."+table+" where "+predicate+") x)")
q='select json_build_object('+','.join(fields)+');'
p=subprocess.run(task_fixture.command('unify-native-speech-374-r15'),input=q.encode(),capture_output=True,timeout=30);assert p.returncode==0,redact(p.stderr.decode());data=json.loads(p.stdout)
save(label+'-full-readback.json',dict(result=data,exit=0,proof_class='Independent complete row observer of native operations. No login or write.'))
print('Full rows saved.',{k:len(v) for k,v in data.items()})
