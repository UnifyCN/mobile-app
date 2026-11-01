"""Run the binding database gate before any native guest action."""
from probe import *
import task_fixture
from stack import PROJECT,identities

assert not (E/'owned-simulator.json').exists()
identities()
account=json.loads((B/'private/account.json').read_text())
records=[]
def execute(args,**kwargs):
    start=time.monotonic();p=subprocess.run(args,**kwargs)
    records.append(dict(command=args,exit=p.returncode,seconds=time.monotonic()-start,
                        stdout=redact(p.stdout.decode()),stderr=redact(p.stderr.decode()),
                        stdout_bytes=len(p.stdout),stderr_bytes=len(p.stderr)))
    save('binding-fixture-command.json',records)
    return p
start=time.monotonic()
try:
    row=task_fixture.create(PROJECT,account['id'],execute)
    command=task_fixture.command(PROJECT)
    sql="select row_to_json(t) from (select id,user_id,revision,completed,removed_at from public.custom_checklist_tasks where id=3698001) t;"
    p=execute(command,input=sql.encode(),capture_output=True,timeout=30)
    assert p.returncode==0
    readback=json.loads(p.stdout)
    assert readback==dict(id=3698001,user_id=account['id'],revision=1,completed=False,removed_at=None)
    save('binding-fixture-gate.json',dict(passed=True,row=row,independent_readback=readback,
         simulator_exists=False,helper_password_login=False,seconds=time.monotonic()-start))
    print('BINDING_LOCAL_DATABASE_GATE_PASS')
except Exception as exc:
    save('binding-fixture-gate.json',dict(passed=False,error=str(exc),simulator_exists=False))
    raise
