from android import *
import shlex
mode=sys.argv[1]
if mode=='tap':
 x,y=map(int,sys.argv[2:4]);assert 0<=x<1080 and 0<=y<2400;p=adb('tap-visible',['shell',f'input tap {x} {y}'])
elif mode=='swipe':
 x,y,u,v=map(int,sys.argv[2:6]);assert 0<=x<1080 and 0<=u<1080 and 0<=y<2400 and 0<=v<2400;p=adb('swipe-visible',['shell',f'input swipe {x} {y} {u} {v} 400'])
elif mode in ['email','password']:
 a=json.loads((B/'private/account.json').read_text());p=adb('native-'+mode,['shell','input text '+shlex.quote(a[mode])],private=True)
elif mode=='text':p=adb('text-visible',['shell','input text '+shlex.quote(sys.argv[2].replace(' ','%s'))])
elif mode=='key':p=adb('key-visible',['shell','input keyevent '+str(int(sys.argv[2]))])
else:raise ValueError(mode)
assert p.returncode==0
