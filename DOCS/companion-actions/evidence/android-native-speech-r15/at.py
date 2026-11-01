import grpc,sys,time,json,datetime
from pathlib import Path
E=Path(__file__).resolve().parent;sys.path.insert(0,str(E/'proto'))
import emulator_controller_pb2 as pb
import emulator_controller_pb2_grpc as rpc
stub=rpc.EmulatorControllerStub(grpc.insecure_channel('127.0.0.1:8580'))
cmd,*args=sys.argv[1:]
with (E/'raw/physical-input.jsonl').open('a') as f:f.write(json.dumps({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':sys.argv[1:]})+'\n')
def touch(x,y,p):stub.sendTouch(pb.TouchEvent(touches=[pb.Touch(x=x,y=y,identifier=0,pressure=p)]),timeout=5)
def tap(x,y):
 touch(x,y,1);time.sleep(.05);touch(x,y,0)
if cmd=='explore':
 x,y=map(int,args);touch(x,y,1);time.sleep(.65);touch(x,y,0)
elif cmd in ['tap','double']:
 x,y=map(int,args);tap(x,y)
 if cmd=='double':time.sleep(.07);tap(x,y)
elif cmd=='scroll':
 x,y,u,v=map(int,args)
 def pair(a,b,pressure):stub.sendTouch(pb.TouchEvent(touches=[pb.Touch(x=a,y=b,identifier=0,pressure=pressure),pb.Touch(x=a+160,y=b,identifier=1,pressure=pressure)]),timeout=5)
 for i in range(26):
  pair(int(x+(u-x)*i/25),int(y+(v-y)*i/25),1);time.sleep(.015)
 pair(u,v,0)
elif cmd=='next':
 for i in range(13):
  touch(300+i*35,1100,1);time.sleep(.01)
 touch(720,1100,0)
elif cmd=='text':
 stub.sendKey(pb.KeyboardEvent(text=args[0],eventType=pb.KeyboardEvent.keypress),timeout=5)
elif cmd=='keys':
 for key in args:stub.sendKey(pb.KeyboardEvent(key=key,eventType=pb.KeyboardEvent.keydown),timeout=5)
 time.sleep(.1)
 for key in reversed(args):stub.sendKey(pb.KeyboardEvent(key=key,eventType=pb.KeyboardEvent.keyup),timeout=5)
else:raise SystemExit('unknown')
time.sleep(1.5)
print(cmd,args)
