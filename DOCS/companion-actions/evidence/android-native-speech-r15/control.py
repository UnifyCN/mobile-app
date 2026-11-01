"""Native OS Play control or TalkBack exploration with simultaneous audio."""
from android import *
import threading,wave,struct,datetime
sys.path.insert(0,str(E/'proto'))
import grpc,emulator_controller_pb2 as pb,emulator_controller_pb2_grpc as rpc
label,mode,x,y=sys.argv[1:];x=int(x);y=int(y)
seconds=int(os.environ.get('CAPTURE_SECONDS','12'));assert 12<=seconds<=30
assert mode in ['tap','explore','double','next']
assert not (E/'raw'/f'{label}.wav').exists()
channel=grpc.insecure_channel('127.0.0.1:8580');grpc.channel_ready_future(channel).result(timeout=5)
stub=rpc.EmulatorControllerStub(channel);samples=bytearray();packets=[];ready=threading.Event();errors=[]
start=datetime.datetime.now(datetime.timezone.utc).isoformat();mono=time.monotonic()
def record():
 try:
  stream=stub.streamAudio(pb.AudioFormat(samplingRate=48000,channels=pb.AudioFormat.Mono,format=pb.AudioFormat.AUD_FMT_S16),timeout=seconds)
  ready.set()
  for packet in stream:
   assert packet.format.samplingRate==48000 and packet.format.channels==pb.AudioFormat.Mono and packet.format.format==pb.AudioFormat.AUD_FMT_S16
   packets.append(dict(timestamp_us=packet.timestamp,host_seconds=time.monotonic()-mono,byte_offset=len(samples),bytes=len(packet.audio),format=str(packet.format)))
   samples.extend(packet.audio)
 except grpc.RpcError as exc:
  if exc.code()!=grpc.StatusCode.DEADLINE_EXCEEDED:errors.append(str(exc))
 except Exception as exc:
  errors.append(repr(exc))
t=threading.Thread(target=record);t.start();assert ready.wait(5)
p=run([sys.executable,E/'at.py',mode,x,y],timeout=8)
t.join(seconds+3);assert not t.is_alive()
with wave.open(str(E/'raw'/f'{label}.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(samples)
values=struct.unpack('<'+'h'*(len(samples)//2),samples)
logs={}
for pkg in ['com.android.settings','com.google.android.tts','com.google.android.marvin.talkback']:
 q=adb(label+'-pid-'+pkg,['shell','pidof '+pkg]);pids=q.stdout.decode().split()
 for pid in pids:
  q=adb(label+'-log-'+pkg,['logcat','-d','--pid='+pid,'-v','epoch'],timeout=15)
  path=E/'raw'/f'{label}-{pkg}-{pid}.log';path.write_text(redact(q.stdout.decode(errors='replace')));logs[pkg]=str(path.relative_to(E))
save('raw/'+label+'.json',dict(start_utc=start,end_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),mode=mode,x=x,y=y,sample_rate=48000,requested_seconds=seconds,audio_errors=errors,audio_packets=len(packets),audio_bytes=len(samples),audio_seconds=len(samples)/96000,peak=max(map(abs,values),default=0),nonzero_samples=sum(v!=0 for v in values),logs=logs,input_exit=p.returncode))
save('raw/'+label+'.packet-times.json',packets)
print((E/'raw'/f'{label}.json').read_text())
