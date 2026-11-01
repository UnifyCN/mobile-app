"""Read only the owned account's task, receipts and reminder rows."""
from probe import *
import task_fixture
label=sys.argv[1];assert re.fullmatch(r'[a-z0-9-]+',label)
uid=json.loads((B/'private/account.json').read_text())['id']
q="""select json_build_object(
 'account_id', '%s',
 'auth_sessions',(select count(*) from auth.sessions where user_id='%s'),
 'consent',(select json_build_object('privacy',privacy_policy_accepted_at is not null,'guidelines',community_guidelines_accepted_at is not null) from public.users where id='%s'),
 'task',(select json_build_object('id',id,'user_id',user_id,'revision',revision,'progress_state',progress_state,'completed',completed,'waiting_reason',waiting_reason,'removed_at',removed_at,'state_updated_at',state_updated_at) from public.custom_checklist_tasks where id=3698001),
 'receipts',(select coalesce(json_agg(json_build_object('user_id',user_id,'operation_id',operation_id,'contract_version',contract_version,'authorization_evidence',authorization_evidence,'outcome',outcome,'created_at',created_at,'task_ref',task_ref,'undo_of',undo_of)),'[]'::json) from public.companion_action_receipts where user_id='%s'),
 'reminders',(select coalesce(json_agg(json_build_object('id',id,'user_id',user_id,'task_ref',task_ref,'remind_at',remind_at,'time_zone',time_zone,'wall_time',wall_time,'status',status,'revision',revision,'cancelled_reason',cancelled_reason)),'[]'::json) from public.companion_task_reminders where user_id='%s'),
 'enrollments',(select count(*) from companion_push_private.enrollments),
 'provider_attempts',(select count(*) from companion_push_private.attempts),
 'delivery_states',(select json_agg(x) from (select state,count(*) from companion_push_private.deliveries group by state) x),
 'dispatch_enabled',(select dispatch_enabled from companion_push_private.settings));""" % ((uid,)*5)
t=time.monotonic();p=subprocess.run(task_fixture.command('unify-native-speech-374-r15'),input=q.encode(),capture_output=True,timeout=30)
assert p.returncode==0,redact(p.stderr.decode());data=json.loads(p.stdout)
save(label+'-readback.json',dict(query=q,result=data,exit=p.returncode,stdout_bytes=len(p.stdout),stderr_bytes=len(p.stderr),seconds=time.monotonic()-t,proof_class='Independent SQL readback of the native account. This helper does not log in or write.'))
print(redact(json.dumps(data,indent=2)))
