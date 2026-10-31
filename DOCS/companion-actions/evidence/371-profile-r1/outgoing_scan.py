"""Scan outgoing blobs and evidence, including compressed members. Never print matches."""
from pathlib import Path
import gzip, hashlib, io, json, re, subprocess, tarfile, zipfile

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parents[3]
WEB = Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root')
RULES = {
    'jwt': rb'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}',
    'provider_key': rb'\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{24,}',
    'supabase_secret': rb'\bsb_secret_[A-Za-z0-9_-]{20,}',
    'device_token': rb'(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{20,}\]',
    'signed_url': rb'[?&](?:X-Amz-Signature|X-Goog-Signature|token|proof|signature)=[A-Za-z0-9_.%~-]{24,}',
}
patterns = {name: re.compile(pattern, re.I if name == 'signed_url' else 0) for name, pattern in RULES.items()}
findings = []
counts = {'evidence_files': 0, 'outgoing_git_blobs': 0, 'compressed_members': 0, 'bytes': 0}
seen = set()

def scan(label, data, depth=0):
    assert depth < 8, 'archive nesting exceeds bound'
    counts['bytes'] += len(data)
    for name, pattern in patterns.items():
        matches = list(pattern.finditer(data))
        if matches:
            findings.append({'path': label, 'rule': name, 'count': len(matches)})
    if data.startswith(b'\x1f\x8b'):
        counts['compressed_members'] += 1
        scan(label + '::gzip', gzip.decompress(data), depth + 1)
    elif data.startswith(b'PK\x03\x04'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for member in archive.infolist():
                if not member.is_dir():
                    counts['compressed_members'] += 1
                    scan(label + '::' + member.filename, archive.read(member), depth + 1)
    elif len(data) > 262 and data[257:262] == b'ustar':
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for member in archive.getmembers():
                if member.isfile():
                    counts['compressed_members'] += 1
                    scan(label + '::' + member.name, archive.extractfile(member).read(), depth + 1)

for path in sorted(HERE.rglob('*')):
    if path.is_file() and path.name != 'outgoing-scan.json':
        counts['evidence_files'] += 1
        scan('evidence/' + str(path.relative_to(HERE)), path.read_bytes())
report = MOBILE / 'DOCS/companion-actions/371-profile.md'
scan('report', report.read_bytes())
for repo, root, base in [
    ('mobile', MOBILE, '1f736dd2dc2a543cf10803a8a8069834d62becaf'),
    ('web', WEB, '8f3720af36c50768ff05d25804a69d28d36fd5c4'),
]:
    lines = subprocess.check_output(['git', '-C', str(root), 'rev-list', '--objects', base + '..HEAD'], text=True).splitlines()
    for line in lines:
        oid, _, name = line.partition(' ')
        if oid in seen:
            continue
        seen.add(oid)
        kind = subprocess.check_output(['git', '-C', str(root), 'cat-file', '-t', oid], text=True).strip()
        if kind != 'blob':
            continue
        counts['outgoing_git_blobs'] += 1
        scan(repo + '/git/' + name, subprocess.check_output(['git', '-C', str(root), 'cat-file', 'blob', oid]))
result = {'rules': list(RULES), 'counts': counts, 'findings': findings, 'pass': not findings,
          'scope': 'all own evidence and report; every outgoing git blob from both starting pins; compressed contents',
          'limit': 'pattern scan; not proof of absence of every possible credential encoding'}
(HERE / 'outgoing-scan.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(bool(findings))
