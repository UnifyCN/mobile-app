#!/usr/bin/env python3
"""Stage pinned tracked files inside this probe. Never write to the reference repo."""
import hashlib
import io
import json
from pathlib import Path
import socket
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WEB = Path('/Users/savargupta/.t3/worktrees/Unify-Web-App/feat-companion-actions-359')
MOBILE_PIN = '9bd5ddefb8f7af2e94ac72c2af8d1a808db100ea'
WEB_PIN = 'e8b99343b307a0f7bfa2f99ef74657e97b4f0154'
RUNTIME = HERE / '.runtime'
PROJECT = 'unify-reminder-probe-368-r1'

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])

def extract(repo, pin, paths, destination):
    archive = git(repo, 'archive', pin, *paths)
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        source.extractall(destination, filter='data')

assert git(ROOT, 'rev-parse', f'{MOBILE_PIN}^{{tree}}').strip().decode() == 'ed26d0b67e5cf3a0ec4e78786f6c021ddc21b1f1'
assert git(WEB, 'rev-parse', 'HEAD').strip().decode() == WEB_PIN
assert git(WEB, 'rev-parse', 'HEAD^{tree}').strip().decode() == '51ec99a80452b4d91554db04a8747831ad3a44c9'
assert not RUNTIME.exists(), 'Do not overwrite a previous runtime'
for port in [63061, 63062, 63063, 63064, 3383]:
    with socket.socket() as s:
        s.bind(('127.0.0.1', port))
for args in [['ps', '-a', '--format', '{{.Names}}'], ['volume', 'ls', '--format', '{{.Name}}'], ['network', 'ls', '--format', '{{.Name}}']]:
    assert PROJECT not in subprocess.check_output(['docker', *args], text=True)

RUNTIME.mkdir()
extract(WEB, WEB_PIN, ['supabase/functions', 'supabase/tests/companion-actions', 'lib/i18n/locales'], RUNTIME)
extract(ROOT, MOBILE_PIN, ['unify-front-end/i18n/locales'], RUNTIME)
# All seven production SQL files come from the mobile migration authority.
for directory in ['migrations', 'rollbacks']:
    for path in sorted((ROOT / 'unify-front-end/supabase' / directory).glob('*companion*.sql')):
        target = RUNTIME / 'supabase' / directory / path.name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(git(ROOT, 'show', f'{MOBILE_PIN}:unify-front-end/supabase/{directory}/{path.name}'))
stack = RUNTIME / 'supabase/tests/companion-actions'
config = (stack / 'supabase/config.toml').read_text()
config = config.replace('unify-actions-363', PROJECT)
for old, new in zip(['60671','60672','60673','60674'], ['63061','63062','63063','63064']):
    config = config.replace(old, new)
(stack / 'supabase/config.toml').write_text(config)

# Capture every original service hash before the small local-only patch.
manifest = {str(p.relative_to(RUNTIME)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((RUNTIME / 'supabase/functions').rglob('*')) if p.is_file()}
(HERE / 'evidence/source-manifest.json').write_text(json.dumps({
    'mobile_base': MOBILE_PIN, 'web_reference': WEB_PIN,
    'service_files_before_patch': manifest,
    'ports_free_before_create': [63061,63062,63063,63064,3383],
    'project_absent_before_create': PROJECT,
}, indent=2) + '\n')

contract = RUNTIME / 'supabase/functions/companion-actions/contract.ts'
text = contract.read_text()
interface = '''
// Local scheduler probe only. No assistant or product path.
export type ProbeReminderOperation = {
  task_ref: string;
  expected_revision: number;
  remind_at?: string;
  time_zone?: string;
  wall_time?: string;
} & ({ type: 'probe.reminder_schedule' } | { type: 'probe.reminder_cancel' });
'''
text = text.replace('export type Operation =', interface + '\nexport type Operation =\n  | ProbeReminderOperation')
registry = '''
  'probe.reminder_schedule': probeReminder('probe.reminder_schedule'),
  'probe.reminder_cancel': probeReminder('probe.reminder_cancel'),
'''
parser = '''
function probeReminder(type: ProbeReminderOperation['type']): OperationSpec<any> {
  return { type, version: 1, access: 'owner', classification: 'write',
    approval: ['ui_control'], revisionCheck: 'expected_revision',
    idempotency: 'operation_id', undo: 'recorded_inverse', undoRemoves: false,
    parse(raw) {
      if (Object.keys(raw).some(k => !['type','task_ref','expected_revision','remind_at','time_zone','wall_time'].includes(k))) return refuse(422, 'unknown_field');
      if (typeof raw.task_ref !== 'string' || !TASK_REF.test(raw.task_ref) || !isPlainInt(raw.expected_revision)) return refuse(422, 'invalid_probe_request');
      if (type === 'probe.reminder_schedule' && ['remind_at','time_zone','wall_time'].some(k => typeof raw[k] !== 'string')) return refuse(422, 'invalid_probe_time');
      return ok(raw as unknown as ProbeReminderOperation);
    }
  };
}
'''
text = text.replace('export const OPERATION_REGISTRY:', parser + '\nexport const OPERATION_REGISTRY:')
text = text.replace("  'task.set_state': setState,", registry + "  'task.set_state': setState,")
contract.write_text(text)
handler = RUNTIME / 'supabase/functions/companion-actions/handler.ts'
text = handler.read_text()
needle = "    if (request.action === 'read') {"
assert text.count(needle) == 1
text = text.replace(needle, needle + '''
      const due = await admin.rpc('probe368_due', { p_user_id: userId });
      if (due.error) return finish(mapDbError(due.error), 'failed');
''')
text = text.replace('        tasks: data,', '        tasks: data,\n        probe_due: due.data,')
handler.write_text(text)

# Copy the complete service tree to the private local stack. No optional export is read.
import shutil
shutil.copytree(RUNTIME / 'supabase/functions', stack / 'supabase/functions', dirs_exist_ok=True)
print(json.dumps({'runtime': str(RUNTIME), 'tracked_service_files': len(manifest), 'project': PROJECT}))
