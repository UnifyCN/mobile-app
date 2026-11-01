from pathlib import Path
import gzip
import hashlib
import json
import re
import shutil

E=Path(__file__).resolve().parent
cache=E/'__pycache__'
if cache.exists(): shutil.rmtree(cache)
patterns={
    'jwt':r'\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    'service_key':r'\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{12,}',
    'owned_native_password':r'Local369-[a-f0-9]{24}',
    'installation_proof':r'"installation_secret"\s*:\s*"[a-f0-9]{64}"',
    'push_token':r'(?:Expo|Exponent)PushToken\[(?!synthetic)[^\]]+\]',
}
rows=[]
findings=[]
for p in sorted(E.rglob('*')):
    if not p.is_file() or p.name in ['secret-scan.json','evidence-manifest.json']:
        continue
    data=p.read_bytes()
    body=gzip.decompress(data) if p.suffix=='.gz' else data
    text=body.decode(errors='replace')
    for name,pattern in patterns.items():
        for match in re.finditer(pattern,text):
            findings.append(dict(path=str(p.relative_to(E)),kind=name,
                                 line=text[:match.start()].count('\n')+1))
    rows.append(dict(path=str(p.relative_to(E)),bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
(E/'evidence-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
result=dict(files=len(rows),gzip_contents_scanned=True,findings=findings,
            screenshot_review='Both PNGs were visually inspected. They show the new guest home screen and development launcher. No account credentials were entered.',
            passed=not findings,scope='New outgoing evidence only. Private build paths are excluded from the commit.')
(E/'secret-scan.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['passed']
