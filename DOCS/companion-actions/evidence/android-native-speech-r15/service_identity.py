"""Check actual mounted service bytes and the retained app signature."""
from probe import *
from stack import identities,S,W
rows=identities();files={}
edge=next(r for r in rows if 'edge_runtime' in r['Name'])
mount=next(m for m in edge['Mounts'] if m['Type']=='bind')
assert Path(mount['Destination'])==(S/'supabase/functions').resolve()
for f in (S/'supabase/functions').rglob('*'):
    if not f.is_file():continue
    rel=f.relative_to(S/'supabase/functions')
    data=run(['docker','exec',edge['Id'],'cat',str(Path(mount['Destination'])/rel)]).stdout
    assert data==f.read_bytes()==(W/'supabase/functions'/rel).read_bytes()
    files[str(rel)]=hashlib.sha256(data).hexdigest()
assert len(files)==37
save('effective-service-inputs.json',dict(containers=rows,served_files=files,count=len(files)))
print('37 served files PASS.')
