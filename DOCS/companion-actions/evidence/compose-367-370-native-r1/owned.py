from pathlib import Path
import json
import os
import subprocess
import sys
import time

EVIDENCE = Path(__file__).parent.resolve()
WORKDIR = EVIDENCE / 'runtime/supabase/tests/companion-actions'
PROJECT = 'unify-compose-367-370-r1'

def labels():
    records = []
    for service in ['db', 'rest', 'kong', 'auth', 'edge_runtime']:
        name = f'supabase_{service}_{PROJECT}'
        record = json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
        values = record['Config']['Labels']
        assert values['com.supabase.cli.project'] == PROJECT, values
        assert Path(values['com.supabase.cli.workdir']).resolve() == WORKDIR, values
        records.append({'name':name, 'id':record['Id'], 'labels':values})
    (EVIDENCE/'owned-labels-latest.json').write_text(json.dumps(records,indent=2)+'\n')
    return records

def environment():
    labels()
    env = os.environ.copy()
    result = subprocess.check_output(['supabase','status','--workdir',str(WORKDIR),'-o','env'],stderr=subprocess.DEVNULL,text=True)
    for line in result.splitlines():
        key,_,value=line.partition('=')
        env['ACTIONS_'+key]=value.strip('"')
    assert env['ACTIONS_API_URL'] == 'http://127.0.0.1:62111'
    assert '@127.0.0.1:62112/' in env['ACTIONS_DB_URL']
    env.update(ACTIONS_DB_CONTAINER=f'supabase_db_{PROJECT}',ACTIONS_REST_CONTAINER=f'supabase_rest_{PROJECT}',
               ACTIONS_CONTENT_PORT='3340',ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3340/content')
    return env

if __name__ == '__main__':
    if sys.argv[1:] == ['labels']:
        labels()
    else:
        name = sys.argv[1]
        args = sys.argv[2:]
        env = environment()
        cwd = env.pop('COMPOSE_CWD',str(WORKDIR))
        start = time.time()
        with (EVIDENCE/(name+'.log')).open('w') as log:
            result = subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
        record={'command':args,'cwd':cwd,'exit':result.returncode,'seconds':time.time()-start}
        (EVIDENCE/(name+'-result.json')).write_text(json.dumps(record,indent=2)+'\n')
        print(json.dumps(record))
        sys.exit(result.returncode)
