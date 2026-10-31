"""Stage only this worker's disposable local service outside application sources."""
from pathlib import Path
import hashlib, json, re, shutil, subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
WEB = Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root')
RUN = ROOT / 'build/profile-371-r1'
STACK = RUN / 'supabase/tests/companion-actions'
RUN.mkdir(parents=True, exist_ok=True)
# Preserve the package workspace metadata expected by the unchanged frozen worker lock.
STACK.mkdir(parents=True, exist_ok=True)
shutil.copyfile(WEB / 'package.json', STACK / 'package.json')

for prefix in ['supabase/functions', 'supabase/workers', 'supabase/tests/companion-actions', 'lib/i18n/locales']:
    for source in (WEB / prefix).rglob('*'):
        if source.is_file() and 'node_modules' not in source.parts:
            target = RUN / source.relative_to(WEB)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
adaptations = []
for target in [*(RUN / 'supabase/tests/companion-actions').glob('*.ts'), *(RUN / 'supabase/workers').rglob('*.ts')]:
    original = target.read_text()
    changed = re.sub(r'(?<![0-9])6361([0-6])(?![0-9])', lambda match: '6451' + match[1], original)
    if changed != original:
        target.write_text(changed)
        adaptations.append({'file': str(target.relative_to(RUN)), 'change': 'port literals 63610-63616 to assigned 64510-64516',
                            'source_sha256': hashlib.sha256(original.encode()).hexdigest(), 'staged_sha256': hashlib.sha256(changed.encode()).hexdigest()})
(HERE / 'fixture-port-adaptations.json').write_text(json.dumps(adaptations, indent=2) + '\n')
for directory in ['migrations', 'rollbacks']:
    for source in (ROOT / 'unify-front-end/supabase' / directory).glob('*companion*.sql'):
        target = RUN / 'supabase' / directory / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
shutil.copytree(ROOT / 'unify-front-end/i18n/locales', RUN / 'unify-front-end/i18n/locales', dirs_exist_ok=True)
config = (WEB / 'supabase/tests/companion-actions/supabase/config.toml').read_text()
config = config.replace('unify-actions-363', 'unify-profile-371-r1')
for old, new in zip(['60671', '60672', '60673', '60674'], ['64510', '64511', '64512', '64513']):
    config = config.replace(old, new)
(STACK / 'supabase/config.toml').write_text(config)
shutil.copytree(RUN / 'supabase/functions', STACK / 'supabase/functions', dirs_exist_ok=True)
manifest = {str(p.relative_to(RUN)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (RUN / 'supabase/functions').rglob('*') if p.is_file()}
(HERE / 'staged-source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'runtime': str(RUN), 'stack': str(STACK), 'source_files': len(manifest)}))
