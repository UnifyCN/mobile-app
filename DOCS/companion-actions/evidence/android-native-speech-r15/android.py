from probe import *
import signal,xml.etree.ElementTree as ET
SDK=Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-decc7ebc/build/369-android-test-build-r1/sdk');ADB=SDK/'platform-tools/adb';POLICY=E/'outbound-sdk-readonly.sb';SERIAL='emulator-5590';PACKAGE='com.anonymous.unifyfrontend';BODY=b'COMPANION369_ADB_R3_LOCAL\n'
old=json.loads(Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-74fd690f/DOCS/companion-actions/evidence/369-android-native-bootstrap-r2/emulator-start.json').read_text())
AENV=dict(ENV);AENV.update(old['env_overrides']);AENV.update(ANDROID_AVD_HOME='/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-b9af151e/build/android-speech-readiness-r13/avd',ADB_SERVER_SOCKET='tcp:127.0.0.1:63679',ANDROID_ADB_SERVER_PORT='63679',ADB_LOCAL_TRANSPORT_MAX_PORT='5591',ANDROID_USER_HOME=str(B/'android-user'),ANDROID_EMULATOR_HOME=str(B/'emulator-user'),TMPDIR=str(B/'private')+'/',XDG_CACHE_HOME=str(B/'cache'),XDG_CONFIG_HOME=str(B/'config'),XDG_DATA_HOME=str(B/'data'),ADB_MDNS_AUTO_CONNECT='',ANDROID_SERIAL=SERIAL)
def adb(label,args,timeout=30,private=False):
 cmd=['/usr/bin/sandbox-exec','-f',str(POLICY),str(ADB),'-H','127.0.0.1','-P','63679','-s',SERIAL,*args];t=time.monotonic()
 p=subprocess.run(cmd,env=AENV,stdin=subprocess.DEVNULL,capture_output=True,timeout=timeout,close_fds=True)
 row=dict(label=label,command='[native credential input withheld]' if private else cmd,exit=p.returncode,seconds=time.monotonic()-t,stdout_bytes=len(p.stdout),stderr_bytes=len(p.stderr),stdout='[withheld]' if private or args[:2]==['exec-out','screencap'] else redact(p.stdout.decode(errors='replace')),stderr=redact(p.stderr.decode(errors='replace')))
 with (E/'android-commands.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
 return p

def capture(label):
 (E/'screenshots').mkdir(exist_ok=True);(E/'ui').mkdir(exist_ok=True)
 p=adb(label+'-accessibility',['shell','settings get secure enabled_accessibility_services']);reader='talkback' in p.stdout.decode().lower()
 expected=os.environ.get('READER_PHASE','off');assert reader==(expected=='on'), 'Unexpected TalkBack phase'
 if reader:
  time.sleep(1)
  p=adb(label+'-png',['exec-out','screencap','-p']);assert p.returncode==0 and p.stdout.startswith(b'\x89PNG');(E/'screenshots'/f'{label}.png').write_bytes(p.stdout);print(str(E/'screenshots'/f'{label}.png'));return
 p=adb(label+'-png',['exec-out','screencap','-p']);assert p.returncode==0 and p.stdout.startswith(b'\x89PNG');png=p.stdout
 p=adb(label+'-dump',['shell','uiautomator dump /sdcard/companion-r12-window.xml'],45)
 if p.returncode==0:
  p=adb(label+'-xml',['shell','cat /sdcard/companion-r12-window.xml']);xml=p.stdout.decode()
  account=B/'private/account.json'
  contains_credential=False
  if account.exists():
   contains_credential=any(v in xml for k,v in json.loads(account.read_text()).items() if k in ['email','password'])
   for k,v in json.loads(account.read_text()).items():
    if k in ['email','password']:xml=xml.replace(v,'[WITHHELD]')
  xml=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]',xml)
  (E/'ui'/f'{label}.xml').write_text(xml)
  if not contains_credential and os.environ.get('CAPTURE_NO_PNG')!='1':(E/'screenshots'/f'{label}.png').write_bytes(png)
  else:save(label+'-screenshot-withheld.json',dict(reason='Native screen contains synthetic credential identifier; PNG withheld',native_scene=True))
  tree=ET.fromstring(xml)
  print('\n'.join(str({k:n.get(k) for k in ['text','content-desc','class','bounds','clickable','focused']}) for n in tree.iter('node') if n.get('text') or n.get('content-desc') or n.get('focused')=='true'))
 print(str(E/'screenshots'/f'{label}.png'))

def controls():
 rows=[]
 for fam,ip in [(socket.AF_INET,'1.1.1.1'),(socket.AF_INET,'8.8.8.8'),(socket.AF_INET6,'2606:4700:4700::1111')]:
  with socket.socket(fam) as s:
   s.settimeout(2)
   try:s.connect((ip,443));err=0
   except OSError as exc:err=exc.errno
  rows.append(dict(ip=ip,errno=err));assert err==1
 t=time.monotonic()
 with socket.create_connection(('127.0.0.1',3530),timeout=2) as s:
  s.sendall(b'GET / HTTP/1.0\r\nHost: owned\r\n\r\n');raw=b''
  while chunk:=s.recv(4096):raw+=chunk
 h,b=raw.split(b'\r\n\r\n',1);assert h.startswith(b'HTTP/1.0 200') and b==BODY
 try:fd=os.open(SDK/'.knownPackages',os.O_WRONLY|os.O_APPEND)
 except OSError as exc:err=exc.errno
 else:os.close(fd);err=0
 assert err==1
 return dict(external=rows,http=dict(status=200,header_bytes=len(h)+4,body_bytes=len(b),total_bytes=len(raw),seconds=time.monotonic()-t),sdk_write_open_errno=err,no_write_or_truncate=True)
if __name__=='__main__':
 if sys.argv[1]=='controls':print(json.dumps(controls()))
 elif sys.argv[1]=='capture':capture(sys.argv[2])
 elif sys.argv[1]=='shell':
  p=adb('manual-'+str(time.time_ns()),['shell',*sys.argv[2:]]);print(p.stdout.decode(errors='replace'));print(p.stderr.decode(errors='replace'));raise SystemExit(p.returncode)
