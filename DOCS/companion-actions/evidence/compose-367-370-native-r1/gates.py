from pathlib import Path
import subprocess
import json
import time
import sys

EVIDENCE = Path(__file__).parent.resolve()
MOBILE = EVIDENCE.parents[3] / 'unify-front-end'
WEB = Path('/tmp/unify-review-actions-361-web-r5-deno-base-9d05')
platform = sys.argv[1]
root = MOBILE if platform == 'mobile' else WEB
files = json.loads((EVIDENCE/(platform+'-changed-lint-files.json')).read_text())
commands = [
    ('types', ['npm','run','typecheck'] if platform == 'mobile' else ['node_modules/.bin/tsc','--noEmit']),
    ('i18n', ['npm','run','check-i18n']),
    ('lint-changed', ['node_modules/.bin/eslint','--format=json',*files]),
]
if platform == 'web':
    commands.append(('lint-full',['node_modules/.bin/eslint','--format=json','.']))
records = []
for name,args in commands:
    start = time.time()
    with (EVIDENCE/(platform+'-'+name+'.log')).open('w') as log:
        result = subprocess.run(args,cwd=root,stdout=log,stderr=subprocess.STDOUT)
    record={'name':name,'command':args,'cwd':str(root),'exit':result.returncode,'seconds':time.time()-start}
    records.append(record)
    (EVIDENCE/(platform+'-static-gates.json')).write_text(json.dumps(records,indent=2)+'\n')
    print(name,result.returncode,flush=True)
