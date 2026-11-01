#!/usr/bin/env python3
"""Run only the staged private stack. Secrets stay in the child environment."""
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
STACK = HERE / '.runtime/supabase/tests/companion-actions'
PROJECT = 'unify-reminder-probe-368-r1'
env = dict(os.environ)
env.pop('ACTIONS_COMPOSITION_EVIDENCE', None)
env.update(DENO_DIR=str(HERE / '.runtime/deno-cache'),
           ACTIONS_CONTENT_PORT='3383',
           ACTIONS_CONTENT_QUERY_URL='http://host.docker.internal:3383/content',
           ACTIONS_MOBILE_LOCALES=str(HERE / '.runtime/unify-front-end/i18n/locales'))
raw = subprocess.check_output(['supabase','status','--workdir',str(STACK),'-o','env'], stderr=subprocess.DEVNULL, text=True)
for line in raw.splitlines():
    if '=' in line:
        key, value = line.split('=', 1)
        env['ACTIONS_' + key] = value.strip('"')
assert env['ACTIONS_API_URL'] == 'http://127.0.0.1:63061'
assert '@127.0.0.1:63062/' in env['ACTIONS_DB_URL']
if '--preflight' in sys.argv:
    containers = json.loads(subprocess.check_output(['docker','inspect',
        *['supabase_'+name+'_'+PROJECT for name in ['db','auth','rest','kong','edge_runtime']]], text=True))
    evidence = []
    for c in containers:
        labels = c['Config']['Labels']
        assert labels['com.supabase.cli.project'] == PROJECT
        assert str(STACK) == labels['com.supabase.cli.workdir']
        item = {'name':c['Name'], 'image':c['Config']['Image'], 'image_id':c['Image'],
                'labels':labels, 'running':c['State']['Running']}
        assert item['running']
        if 'edge_runtime' in c['Name']:
            values = dict(v.split('=',1) for v in c['Config']['Env'])
            assert values['COMPANION_CONTENT_QUERY_URL'] == env['ACTIONS_CONTENT_QUERY_URL']
            item['actual_content_query_url'] = values['COMPANION_CONTENT_QUERY_URL']
            item['mounts'] = c['Mounts']
        evidence.append(item)
    (HERE/'evidence/container-preflight.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('PASS actual project/workdir labels and content URL before tests')
else:
    command = ['deno','test','--no-check','--node-modules-dir=none','--fail-fast=1',
               '--lock='+str(HERE/'deno.lock'),'--allow-net=127.0.0.1:63061,127.0.0.1:63062,127.0.0.1:3383',
               '--allow-env','--allow-read='+str(HERE),'--allow-write='+str(HERE/'evidence'),
               *[a for a in sys.argv[1:]], str(HERE/'probe_test.ts')]
    raise SystemExit(subprocess.call(command,env=env,cwd=HERE))
