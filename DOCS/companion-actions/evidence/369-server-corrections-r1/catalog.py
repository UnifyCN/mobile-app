"""Read the final authority function and its effective execution permissions."""
from pathlib import Path
import json,subprocess,time
HERE=Path(__file__).resolve().parent
query="""select jsonb_build_object(
  'definition',pg_get_functiondef('companion_push_private.require_enrollment_authority(uuid,uuid)'::regprocedure),
  'roles',(select jsonb_agg(jsonb_build_object('role',r,'execute',has_function_privilege(r,
    'companion_push_private.require_enrollment_authority(uuid,uuid)','execute')))
    from unnest(array['anon','authenticated','service_role']) r));"""
cmd=['docker','exec','-i','supabase_db_unify-push-369-correction-r1','psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']
assert not (HERE/'authority-catalog.json').exists()
start=time.time();r=subprocess.run(cmd,input=query,text=True,capture_output=True)
(HERE/'authority-catalog-command.json').write_text(json.dumps({'cmd':cmd,'query':query,'exit':r.returncode,'seconds':time.time()-start,'stderr':r.stderr},indent=2)+'\n')
(HERE/'authority-catalog.json').write_text(r.stdout)
assert r.returncode==0,r.stderr
result=json.loads(r.stdout)
assert all(not x['execute'] for x in result['roles'])
assert result['definition'].count('for share')==3
print(json.dumps(result['roles']))
