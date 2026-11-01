import datetime,json,pathlib,subprocess,sys,time
label,cwd,*command=sys.argv[1:]
root=pathlib.Path(__file__).parent
start=time.monotonic()
with (root/(label+".log")).open("w") as log:
 result=subprocess.run(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
record={"label":label,"cwd":cwd,"command":command,"exit_code":result.returncode,"seconds":round(time.monotonic()-start,3),"utc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root/(label+".json")).write_text(json.dumps(record,indent=2)+"\n")
print(json.dumps(record))
print("\n".join((root/(label+".log")).read_text(errors="replace").splitlines()[-45:]))
sys.exit(result.returncode)
