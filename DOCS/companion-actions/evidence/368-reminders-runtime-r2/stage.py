from pathlib import Path
import subprocess, shutil, socket, json, hashlib
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-removed-receipt-view-359')
RUN=HERE/'.runtime'
PROJECT='unify-reminders-368-r1'
if not RUN.exists():
    for port in [63081,63082,63083,63084,3385,3390]:
        with socket.socket() as s: s.bind(('127.0.0.1',port))
    for args in [['ps','-a','--format','{{.Names}}'],['volume','ls','--format','{{.Name}}'],['network','ls','--format','{{.Name}}']]:
        assert PROJECT not in subprocess.check_output(['docker',*args],text=True)
    RUN.mkdir()
for prefix in ['supabase/functions','supabase/tests/companion-actions','lib/i18n/locales']:
    files=subprocess.check_output(['git','-C',str(WEB),'ls-files',prefix],text=True).splitlines()
    # New reminder files have not yet been added to the index.
    files+= [str(p.relative_to(WEB)) for p in (WEB/prefix).rglob('*') if p.is_file() and ('reminder' in p.name.lower()) and str(p.relative_to(WEB)) not in files]
    for name in files:
        if not (WEB/name).is_file(): continue
        target=RUN/name; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(WEB/name,target)
for directory in ['migrations','rollbacks']:
    for p in (ROOT/'unify-front-end/supabase'/directory).glob('*companion*.sql'):
        target=RUN/'supabase'/directory/p.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
shutil.copytree(ROOT/'unify-front-end/i18n/locales',RUN/'unify-front-end/i18n/locales',dirs_exist_ok=True)
STACK=RUN/'supabase/tests/companion-actions'
c=(WEB/'supabase/tests/companion-actions/supabase/config.toml').read_text().replace('unify-actions-363',PROJECT)
for a,b in zip(['60671','60672','60673','60674'],['63081','63082','63083','63084']): c=c.replace(a,b)
(STACK/'supabase/config.toml').write_text(c)
shutil.copytree(RUN/'supabase/functions',STACK/'supabase/functions',dirs_exist_ok=True)
manifest={str(p.relative_to(RUN)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'supabase/functions').rglob('*') if p.is_file()}
(HERE/'staged-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'runtime':str(RUN),'service_files':len(manifest),'project':PROJECT}))
