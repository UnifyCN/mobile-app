from android import *
import base64,shlex
before=json.loads((E/'before-reader-settings.json').read_text());original=json.loads((B/'private/before-reader-preferences.json').read_text())
for pkg in ['com.google.android.marvin.talkback','com.google.android.tts']:
 p=adb('stop-reader-tool-for-preference-restore',['shell','am force-stop '+pkg]);assert p.returncode==0
for key,value in before['settings'].items():
 if '/' not in key or key in ['wifi','permissions']:continue
 area,k=key.split('/',1);cmd='settings delete '+area+' '+k if value=='null' else 'settings put '+area+' '+k+' '+shlex.quote(value)
 p=adb('restore-setting-'+k,['shell',cmd]);assert p.returncode==0
removed=[];restored=[]
for pkg in ['com.google.android.marvin.talkback','com.google.android.tts']:
 p=adb('restore-preference-list',['shell',f'su 0 find /data/user_de/0/{pkg}/shared_prefs /data/user/0/{pkg}/shared_prefs -type f'])
 for path in p.stdout.decode().splitlines():
  assert path.startswith(('/data/user_de/0/'+pkg+'/shared_prefs/','/data/user/0/'+pkg+'/shared_prefs/'))
  if path not in original:
   q=adb('remove-test-created-reader-preference',['shell','su 0 rm '+shlex.quote(path)]);assert q.returncode==0;removed.append(path)
metadata=json.loads((B/'private/before-reader-metadata.json').read_text())
for index,(path,content) in enumerate(original.items()):
 local=B/'private'/('restore-pref-'+str(index));local.write_bytes(base64.b64decode(content))
 remote='/data/local/tmp/companion-r11-restore-pref-'+str(index)
 p=adb('push-original-reader-preference',['push',str(local),remote]);assert p.returncode==0
 uid,gid,mode=metadata[path].split(':')
 cmd='su 0 cp '+shlex.quote(remote)+' '+shlex.quote(path)+'; su 0 chown '+uid+':'+gid+' '+shlex.quote(path)+'; su 0 chmod '+mode+' '+shlex.quote(path)+'; su 0 restorecon '+shlex.quote(path)+'; rm '+shlex.quote(remote)
 p=adb('restore-original-reader-preference',['shell',cmd]);assert p.returncode==0
 restored.append(path)
save('reader-preference-restoration.json',dict(original_files=len(original),restored_original_files=restored,removed_test_created_preference_files=removed,baseline_values_restored=True,package_data_clear=False,voice_download=False))
print('Captured reader settings restored. Only test-created preference files were removed.')
