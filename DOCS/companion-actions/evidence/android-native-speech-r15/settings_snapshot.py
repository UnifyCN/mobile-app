from android import *
import base64
label=sys.argv[1];assert label in ['before','terminal']
keys=[('system','font_scale'),('system','system_locales'),('secure','enabled_accessibility_services'),('secure','accessibility_enabled'),('secure','tts_default_synth'),('secure','tts_default_locale'),('secure','tts_default_rate'),('secure','tts_default_pitch'),('secure','show_ime_with_hard_keyboard')]
settings={a+'/'+k:adb(label+'-setting-'+k,['shell',f'settings get {a} {k}']).stdout.decode().strip() for a,k in keys}
settings['wifi']=adb(label+'-wifi',['shell','cmd wifi status']).stdout.decode()
settings['permissions']=adb(label+'-permission',['shell','dumpsys package '+PACKAGE]).stdout.decode()
paths=[]
for pkg in ['com.google.android.marvin.talkback','com.google.android.tts']:
 p=adb(label+'-prefs-list-'+pkg,['shell',f'su 0 find /data/user_de/0/{pkg}/shared_prefs /data/user/0/{pkg}/shared_prefs -type f']);paths+=p.stdout.decode().splitlines()
files={}
for path in paths:
 p=adb(label+'-pref-read',['exec-out','su','0','cat',path],private=True);assert p.returncode==0;files[path]=base64.b64encode(p.stdout).decode()
(B/'private'/f'{label}-reader-preferences.json').write_text(json.dumps(files));(B/'private'/f'{label}-reader-preferences.json').chmod(0o600)
save(label+'-reader-settings.json',dict(settings=settings,preference_files={k:dict(bytes=len(base64.b64decode(v)),sha256=hashlib.sha256(base64.b64decode(v)).hexdigest()) for k,v in files.items()}))
print(label, 'settings saved;',len(files),'preference files')
