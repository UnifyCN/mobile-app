from android import *
parent=controls();c=subprocess.run([sys.executable,str(E/'android.py'),'controls'],stdin=subprocess.DEVNULL,capture_output=True,timeout=15,close_fds=True);assert c.returncode==0
save('runtime-early-guard.json',dict(parent=parent,child=json.loads(c.stdout),exec_pid=os.getpid(),policy_sha256=sha(POLICY),command=sys.argv[1:],inherited_connected_sockets=False))
os.execve(sys.argv[1],sys.argv[1:],os.environ)
