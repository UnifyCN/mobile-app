from pathlib import Path
import re
import json
import hashlib
import shutil

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).parent
SQL = EVIDENCE / 'sql'
MOBILE = ROOT / 'unify-front-end/supabase'
WEB = Path('/tmp/unify-review-actions-361-web-r5-deno-base-9d05/supabase')
FUNCTION = re.compile(r'create (?:or replace )?function public\.(\w+)\([\s\S]*?\$\$;')
CONFLICT = re.compile(r'<<<<<<<[^\n]*\n(.*?)=======\n(.*?)>>>>>>>[^\n]*\n',re.S)
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

def select(name,a,b):
    if name == 'companion_validate_operations':
        return a+'      continue;\n    end if;\n'+b
    if name == 'companion_check_authorization':
        return a+'  end if;\n'+b
    if name == 'companion_prepare_proposal':
        return b.replace("'task.create_custom', 'step.create'", "'task.create_custom', 'step.create', 'detail.create'")
    if name == 'companion_recheck_proposal':
        return a.replace("'step_create', 'detail_create'", "'step_create', 'detail_create', 'task_remove'")
    raise AssertionError(name)

detail = {m[1]:m[0] for m in FUNCTION.finditer((MOBILE/'migrations/20261028004902_companion_saved_details.sql').read_text())}
merged = {}
ledger = []
for path in sorted(SQL.glob('*.merged.sql')):
    name=path.name.split('.')[0]
    text=CONFLICT.sub(lambda m:select(name,m[1],m[2]),path.read_text()).rstrip()
    assert '<<<<<<<' not in text
    (SQL/(name+'.composed.sql')).write_text(text+'\n')
    merged[name]=text
    ledger.append({'function':name,'prior370':sha(detail[name]),'composed':sha(text),
                   'rollbackRestores370':True,'privileges':'CREATE OR REPLACE retains existing ACL; no shared grant changes.'})
up=MOBILE/'migrations/20261028025026_companion_task_remove.sql'
down=MOBILE/'rollbacks/20261028025026_companion_task_remove.down.sql'
beforeUp=up.read_text();beforeDown=down.read_text()
(SQL/'367-before.sql').write_text(beforeUp)
(SQL/'367-down-before.sql').write_text(beforeDown)
upText=FUNCTION.sub(lambda m:merged.get(m[1],m[0]),beforeUp)
downText=FUNCTION.sub(lambda m:detail.get(m[1],m[0]),beforeDown)
upText=upText.replace("'task_edit', 'task_remove'", "'task_edit', 'detail_create', 'task_remove'", 1)
downText=downText.replace("'step_create', 'task_edit'", "'step_create', 'task_edit', 'detail_create'", 1)
upText=upText.replace('then this one;', '#370 (20261028004902), then this one;').replace('before the #365 rollback','before the #370 rollback')
upText=upText.replace('-- Additive: no column changes.', '-- Composition: #367 retains the preceding #370 saved-detail dispatch, receipts,\n-- proposal context and authorization. The down script restores those #370 bodies.\n-- Additive: no column changes.')
downText=downText.replace('before the #365 rollback', 'before the #370 rollback').replace('after #365,', 'after #370,')
start=downText.index('--   * The versions of the shared')
end=downText.index('--   * Removed tasks stay removed',start)
downText=downText[:start]+'''--   * Restore the preceding #370 shared action functions and proposal kinds verbatim.
--     Saved details, task edits, steps, receipts and authorization remain available.
--     The #364 plan writer returns without the removal plan-reference lock.
'''+downText[end:]
start=downText.index('-- #365 versions, copied verbatim')
end=downText.index('create or replace function',start)
downText=downText[:start]+'-- #370 shared definitions, copied verbatim. The plan writer remains #364.\n'+downText[end:]
up.write_text(upText);down.write_text(downText)
for path in [up,down]:
    shutil.copyfile(path,WEB/path.relative_to(MOBILE))
    shutil.copyfile(path,EVIDENCE/'runtime/supabase'/path.relative_to(MOBILE))
(EVIDENCE/'sql-function-ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
print(json.dumps({'sharedFunctions':len(merged),'changedMigration':str(up),'changedRollback':str(down)},indent=2))
