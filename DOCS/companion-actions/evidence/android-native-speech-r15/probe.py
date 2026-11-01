"""Owned helper-only iOS guard probe. No product or hosted writes."""
from pathlib import Path
import hashlib, json, os, plistlib, re, socket, struct, subprocess, sys, time

E = Path(__file__).resolve().parent
R = E.parents[3]
B = R / 'build/android-native-speech-r15'
S = Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-53844316')
OLD = S / 'DOCS/companion-actions/evidence/369-native-eligibility-r1'
ORIGINAL = Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-ci-ccc627b/build/ios-signed-root-r6/derived-data/Build/Products/Debug-iphonesimulator/Unify.app')
RETAINED = Path('/Users/savargupta/.t3/worktrees/Unify/t3-e6eb3014')
APP = RETAINED / 'build/369-ios-prepared-native-r7/test-installation/Unify.app'
B.mkdir(parents=True, exist_ok=True)
(B / 'private').mkdir(exist_ok=True)
(B / 'tool-cache').mkdir(exist_ok=True)
ENV = {k:v for k,v in os.environ.items() if not k.startswith(('SIMCTL_CHILD_', 'DYLD_', 'EXPO_', 'SUPABASE_', 'OPENAI_', 'OPENROUTER_', 'POSTHOG_'))}
ENV.update(CLANG_MODULE_CACHE_PATH=str(B/'tool-cache/clang'), TMPDIR=str(B/'private'))

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def save(name, value):
    def masked(x):
        if isinstance(x,str):return redact(x)
        if isinstance(x,list):return [masked(v) for v in x]
        if isinstance(x,dict):return {k:masked(v) for k,v in x.items()}
        return x
    (E/name).write_text(json.dumps(masked(value),indent=2,sort_keys=True)+'\n')

def redact(s):
    account=B/'private/account.json'
    if account.exists():
        for key,value in json.loads(account.read_text()).items():
            if key in ['id','email','password'] and value:s=s.replace(value,'[SYNTHETIC_'+key.upper()+']')
    s=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]',s)
    s=re.sub(r'(?:Expo|Exponent)PushToken\[[^\]]+\]','[REDACTED_PUSH_TOKEN]',s)
    s=re.sub(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_KEY]',s)
    return re.sub(r'(?im)^.*(?:access_token|refresh_token|installation_secret|password|anon.key|service.role.key|postgres(?:ql)?://).*$','[REDACTED_CREDENTIAL_LINE]',s)

def run(args, *, check=True, env=None, timeout=60):
    args=list(map(str,args)); started=time.monotonic()
    p=subprocess.run(args,env=env or ENV,capture_output=True,timeout=timeout)
    row=dict(command=args,exit=p.returncode,seconds=time.monotonic()-started,stdout=redact(p.stdout.decode(errors='replace')),stderr=redact(p.stderr.decode(errors='replace')))
    if args[:2]==['docker','inspect']:
        row['stdout']='[Full container configuration withheld. Selected identities and complete mounts are saved in the protected resource record.]'
    with (E/'commands.jsonl').open('a') as f: f.write(json.dumps(row)+'\n')
    if check and p.returncode: raise RuntimeError(json.dumps(row))
    return p

def manifest(root):
    return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}

def tracked(root):
    names=run(['git','-C',root,'ls-files','-z']).stdout.decode().split('\0')
    return {n:sha(root/n) for n in names if n and (root/n).is_file()}

def devices():
    raw=json.loads(run(['xcrun','simctl','list','-j','devices']).stdout)
    return {d['udid']:{k:d.get(k) for k in ['name','state','deviceTypeIdentifier','isAvailable','dataPath','logPath','lastBootedAt']} for ds in raw['devices'].values() for d in ds}

def slices(data):
    magic=struct.unpack_from('>I',data)[0]
    if magic==0xcafebabe:
        return [struct.unpack_from('>IIIII',data,8+20*i)[2:4] for i in range(struct.unpack_from('>I',data,4)[0])]
    assert struct.unpack_from('<I',data)[0]==0xfeedfacf
    return [(0,len(data))]

def graph(path):
    data=path.read_bytes(); result=[]
    for off,length in slices(data):
        assert struct.unpack_from('<I',data,off)[0]==0xfeedfacf
        n,size=struct.unpack_from('<II',data,off+16); pos=off+32; deps=[]; section_offsets=[]
        for i in range(n):
            cmd,cs=struct.unpack_from('<II',data,pos)
            if cmd in [0xc,0x80000018,0x8000001f,0x80000023]:
                ns=struct.unpack_from('<I',data,pos+8)[0]
                deps.append(data[pos+ns:pos+cs].split(b'\0')[0].decode())
            if cmd==0x19:
                ns=struct.unpack_from('<I',data,pos+64)[0]
                for j in range(ns):
                    so=struct.unpack_from('<I',data,pos+72+80*j+48)[0]
                    if so: section_offsets.append(so)
            pos+=cs
        assert pos==off+32+size
        first=min(section_offsets)
        result.append(dict(slice_offset=off,slice_bytes=length,ncmds=n,sizeofcmds=size,header_end=32+size,first_section=first,zero_padding=not any(data[pos:off+first]),padding_bytes=off+first-pos,dependencies=deps))
    return result

def machos(root):
    rows={}
    for p in sorted(root.rglob('*')):
        if not p.is_file(): continue
        with p.open('rb') as f: magic=f.read(4)
        if magic in [b'\xca\xfe\xba\xbe',b'\xcf\xfa\xed\xfe']: rows[str(p.relative_to(root))]=graph(p)
    return rows
