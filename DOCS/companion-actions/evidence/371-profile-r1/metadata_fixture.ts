// Read-only metadata after the complete current local composition is installed.
import { sql } from './support.ts';
if(!(await sql`select to_regprocedure('public.companion_read_profile(uuid)') is not null present`)[0].present)throw Error('profile composition missing');
const names=['companion_read_profile','companion_validate_operations','companion_check_authorization','companion_apply_one',
'companion_receipt_summary','companion_prepare_proposal','companion_recheck_proposal','companion_cancel_proposal',
'companion_conversation_actions','companion_undo_action','companion_profile_context'];
const functions=await sql`select p.proname name,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,p.proconfig settings,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and (p.proname=any(${names}) or p.proname like 'companion_before371_%') order by p.proname`;
if(functions.length!==21||functions.some(f=>f.anon_execute||f.authenticated_execute||(names.includes(f.name)&&!f.service_execute)))throw Error('profile RPC ACL falsifier');
const privateAccess=await sql`select has_schema_privilege('anon','companion_profile_private','USAGE') anon_usage,
 has_schema_privilege('authenticated','companion_profile_private','USAGE') authenticated_usage`;
if(privateAccess.some(r=>r.anon_usage||r.authenticated_usage))throw Error('private schema access falsifier');
const privateFunctions=await sql`select p.proname name,p.prosecdef security_definer,p.proconfig settings,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='companion_profile_private' order by p.proname`;
if(privateFunctions.length!==3||privateFunctions.some(f=>f.anon_execute||f.authenticated_execute))throw Error('private helper ACL falsifier');
const profileColumns=await sql`select column_name,data_type,udt_name from information_schema.columns where table_schema='public'
 and table_name='user_onboarding_profiles' and column_name in ('province','city','arrival_date','stage','companion_field_revisions') order by column_name`;
console.log(JSON.stringify({kind:'local_profile_metadata',functions,privateFunctions,privateAccess,profileColumns,hosted:false}));
await sql.end({timeout:5});
