from android import *
import http.server,threading,select,signal
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(BODY)
 def log_message(self,*args):pass
from preflight import StopGate
gate=StopGate(B/'runtime.stop')
procs=[];server=http.server.HTTPServer(('127.0.0.1',3530),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
def launch(label,cmd,env):
 f=(B/'private'/f'{label}.log').open('wb');p=subprocess.Popen(cmd,env=env,stdin=subprocess.DEVNULL,stdout=f,stderr=subprocess.STDOUT,close_fds=True,start_new_session=True);f.close();procs.append(p);return p
try:
 daemon=launch('adb',['/usr/bin/sandbox-exec','-f',str(POLICY),str(ADB),'--one-device',SERIAL,'-L','tcp:63679','nodaemon','server'],AENV)
 save('runtime-owner.json',dict(controller=os.getpid(),daemon=daemon.pid,emulator=None))
 deadline=time.monotonic()+10
 while True:
  assert daemon.poll() is None
  try:
   with socket.create_connection(('127.0.0.1',63679),timeout=.5):break
  except ConnectionRefusedError:assert time.monotonic()<deadline;time.sleep(.1)
 args=[a.replace('Companion369R2T374fd690fApi36','CompanionSpeechR13B9afApi36').replace('5578,5579','5590,5591').replace('8569','8580') for a in old['command']];pos=args.index(str(SDK/'emulator/emulator'));cmd=[str(SDK/'emulator/emulator'),*args[pos+1:]];assert cmd[1:3]==['-avd','CompanionSpeechR13B9afApi36']
 emulator=launch('emulator',['/usr/bin/sandbox-exec','-f',str(POLICY),sys.executable,str(E/'emulator_guard.py'),*cmd],AENV)
 save('runtime-owner.json',dict(controller=os.getpid(),daemon=daemon.pid,emulator=emulator.pid,command=cmd,policy_sha256=sha(POLICY)))
 deadline=time.monotonic()+240
 while True:
  assert emulator.poll() is None,'QEMU exited'
  p=adb('readiness',['shell','getprop sys.boot_completed'],8)
  if p.returncode==0 and p.stdout.strip()==b'1':break
  assert time.monotonic()<deadline;time.sleep(2)
 q=run(['ps','-p',str(emulator.pid),'-o','command=']);assert b'qemu-system-aarch64' in q.stdout
 assert json.loads((E/'runtime-early-guard.json').read_text())['exec_pid']==emulator.pid
 save('actual-qemu.json',dict(pid=emulator.pid,command=q.stdout.decode(),policy_sha256=sha(POLICY)))
 print('BOOT_COMPLETED. Runtime stays under owned control.',flush=True)
 save('runtime-control-stop.json',gate.wait(7200,sys.stdin,E/'stop-gate-ready.json'))
finally:
 for p in reversed(procs):
  if p.poll() is None:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=15)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
 server.shutdown();server.server_close();thread.join(timeout=5)
 save('runtime-stopped.json',dict(processes=[dict(pid=p.pid,exit=p.returncode) for p in procs],responder_stopped=not thread.is_alive()))
