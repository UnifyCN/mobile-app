"""Exact source export and generated service copies outside application build paths."""
from pathlib import Path
import hashlib,json,shutil
HERE=Path(__file__).resolve().parent;WEB=Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root').resolve();ROOT=HERE/'private/legacy-export'
if ROOT.exists():raise RuntimeError('do not replace an active export')
for d in ['functions','migrations','rollbacks','workers']:
 shutil.copytree(WEB/'supabase'/d,ROOT/'supabase'/d)
shutil.copytree(WEB/'supabase/tests/companion-actions',ROOT/'supabase/tests/companion-actions',ignore=shutil.ignore_patterns('supabase','node_modules'))
target=ROOT/'supabase/tests/companion-actions/supabase/functions';target.mkdir(parents=True)
shutil.copytree(WEB/'supabase/functions/companion-actions',target/'companion-actions');(target/'rag-query').mkdir();shutil.copytree(WEB/'supabase/functions/rag-query/lib',target/'rag-query/lib')
shutil.copyfile(WEB/'package.json',ROOT/'package.json')
shutil.copytree(WEB/'lib/i18n/locales',ROOT/'lib/i18n/locales')
rows=[]
for p in sorted(ROOT.rglob('*')):
 if p.is_file():rows.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(HERE/'legacy-export-inputs.json').write_text(json.dumps(rows,indent=2)+'\n')
print(len(rows))
