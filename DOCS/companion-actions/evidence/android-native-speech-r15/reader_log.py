from android import *
label=sys.argv[1]
p=adb(label+'-reader-pid',['shell','pidof com.google.android.marvin.talkback']);pid=p.stdout.decode().strip();assert pid.isdigit()
p=adb(label+'-reader-log',['logcat','-d','--pid='+pid,'-v','epoch']);text=redact(p.stdout.decode());(E/'raw'/(label+'-reader.log')).write_text(text)
rows=[l for l in text.splitlines() if 'TYPE_VIEW_ACCESSIBILITY_FOCUSED:  ttsOutput=' in l or 'SpeechControllerImpl: Speaking fragment' in l or 'Received utterance completed' in l]
print('\n'.join(rows[-14:]))
