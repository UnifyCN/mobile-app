import json, os, subprocess
from pathlib import Path
root=Path.cwd()
out=root/'node_modules/.cache/366-client-root-r1'
summary=[]
for name, db, rest in [('neither',None,None),('db-only','probe_db_owned',None),('rest-only',None,'probe_rest_owned'),('both','probe_db_owned','probe_rest_owned')]:
    env={**os.environ,'ACTIONS_API_URL':'http://127.0.0.1:59999','ACTIONS_ANON_KEY':'probe-only','ACTIONS_SERVICE_ROLE_KEY':'probe-only','PROBE_COMMAND_LOG':str(out/(name+'-commands.jsonl'))}
    for key in ['ACTIONS_DB_CONTAINER','ACTIONS_REST_CONTAINER']: env.pop(key,None)
    if db: env['ACTIONS_DB_CONTAINER']=db
    if rest: env['ACTIONS_REST_CONTAINER']=rest
    commands=Path(env['PROBE_COMMAND_LOG']);commands.write_text('')
    run=subprocess.run(['node','node_modules/jest/bin/jest.js','--runInBand','--watchAll=false','--runTestsByPath','__tests__/companionActions/companionActionsLocalStack.test.tsx','-t','^Task progress against the real local stack','--setupFilesAfterEnv',str(out/'container-guard-setup.cjs')],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=45)
    (out/(name+'-guard.log')).write_text(run.stdout)
    calls=[json.loads(line) for line in commands.read_text().splitlines()]
    if db and rest:
        passed=(len(calls)==2 and calls[0]['args'][2]==db and calls[1]['args'][-1]==rest and 'probe blocked container signal' in run.stdout)
    else:
        passed=(not calls and 'ACTIONS_DB_CONTAINER and ACTIONS_REST_CONTAINER are required' in run.stdout)
    summary.append({'case':name,'passed':passed,'jest_exit':run.returncode,'intercepted_commands':calls})
print(json.dumps(summary,indent=2))
assert all(item['passed'] for item in summary), 'The harness must refuse incomplete targets before any container command.'
