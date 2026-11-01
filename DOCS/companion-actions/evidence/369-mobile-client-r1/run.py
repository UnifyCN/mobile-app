import subprocess,sys,json,time,pathlib,os
root=pathlib.Path(__file__).resolve().parents[4]
name=sys.argv[1]; command=sys.argv[2:]; out=pathlib.Path(__file__).parent
log=out/(name+'.log'); rec=out/(name+'-command.json')
if log.exists() or rec.exists(): raise SystemExit('Refuse overwrite')
falsifier="A nonzero exit, a failed assertion, a compiler error or incomplete natural completion rejects this gate."
print("FALSIFIER:",falsifier,flush=True)
source_head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
source_tree=subprocess.check_output(["git","rev-parse","HEAD^{tree}"],cwd=root,text=True).strip()
product_dirty=subprocess.check_output(["git","status","--porcelain","--","unify-front-end"],cwd=root,text=True).strip()
t=time.time()
with log.open('wb') as f:
 result=subprocess.run(command,cwd=root/'unify-front-end',stdout=f,stderr=subprocess.STDOUT)
rec.write_text(json.dumps(dict(source_head=source_head,source_tree=source_tree,product_dirty=product_dirty,falsifier=falsifier,command=command,cwd=str(root/'unify-front-end'),exit=result.returncode,seconds=time.time()-t),indent=2)+'\n')
print(rec.read_text()); print(log.read_text()[-5000:]);sys.exit(result.returncode)
