"""Run three bounded regression faults and restore exact source bytes."""
from pathlib import Path
import difflib,hashlib,json,subprocess,sys
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[3]
APP=ROOT/'unify-front-end'
device=APP/'services/companionActions/pushDevice.ts'
control=APP/'components/companion/tasks/CompanionPushControl.tsx'
sheet=APP/'components/companion/tasks/TaskActionsSheet.tsx'
name=sys.argv[1]
if name=='session':
    changes={device:(HERE/'base-pushDevice.ts').read_bytes(),control:subprocess.check_output(['git','show','116ce513:unify-front-end/components/companion/tasks/CompanionPushControl.tsx'],cwd=ROOT)}
    cmd=[sys.executable,str(HERE/'local.py'),'test','fault-session']
else:
    text=sheet.read_text()
    if name=='details':
        replacements={
          'if (visible) setShowDetails(notificationId ? false : openDetails);':'if (visible) setShowDetails(openDetails);',
          '[visible, openDetails, notificationId]':'[visible, openDetails]',
          'visible && showDetails && !notificationId':'visible && showDetails'}
    elif name=='freshness':replacements={'void revalidateCurrent()':'void Promise.resolve({ isError: false })'}
    else:raise ValueError(name)
    for before,after in replacements.items():
        assert text.count(before)==1,before
        text=text.replace(before,after)
    changes={sheet:text.encode()}
    cmd=[sys.executable,str(HERE/'run.py'),'fault-'+name,'npx','jest','__tests__/companionActions/pushSelectionRecovery.test.tsx','--runInBand','--watchAll=false']
saved={path:path.read_bytes() for path in changes}
assert not (HERE/('fault-'+name+'-result.json')).exists()
for path,broken in changes.items():
    (HERE/('fault-'+name+'-'+path.name+'.diff')).write_text(''.join(difflib.unified_diff(saved[path].decode().splitlines(True),broken.decode().splitlines(True),fromfile='fixed/'+path.name,tofile='fault/'+path.name)))
    path.write_bytes(broken)
try:result=subprocess.run(cmd,cwd=ROOT)
finally:
    for path,data in saved.items():path.write_bytes(data)
restored=all(path.read_bytes()==data for path,data in saved.items())
(HERE/('fault-'+name+'-result.json')).write_text(json.dumps({'test_exit':result.returncode,'restored':restored,'sources':{str(p.relative_to(ROOT)):hashlib.sha256(data).hexdigest() for p,data in saved.items()}},indent=2)+'\n')
assert restored and result.returncode==1
print(name,'caught and restored')
