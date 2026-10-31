"""Temporary message-only fixture on the assigned synthetic database."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STACK = Path('/Users/savargupta/.t3/worktrees/Unify/t3-12e53450/DOCS/companion-actions/evidence/native-layout-r1/stack')
PROJECT = 'unify-native-layout-359-r1'
DB = 'supabase_db_unify-native-layout-359-r1'
REST = 'supabase_rest_unify-native-layout-359-r1'
for name in (DB, REST):
    data = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    assert data['Config']['Labels']['com.supabase.cli.project'] == PROJECT
    assert Path(data['Config']['Labels']['com.supabase.cli.workdir']).resolve() == STACK

def sql(query):
    return subprocess.check_output(['docker', 'exec', DB, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query], text=True).strip()

def literal(value):
    return 'NULL' if value is None else "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

snapshot = ROOT / 'message-4-before.json'
if sys.argv[1] == 'stage':
    assert not snapshot.exists()
    before = json.loads(sql('select to_jsonb(m) from public.messages m where id=4 and conversation_id=1'))
    assert before['role'] == 'assistant'
    assert before['sources'] is None and before['companion_context'] is None
    assert before['content'].startswith('Most banks ask for two pieces of identification')
    snapshot.write_text(json.dumps(before, indent=2))
    fixture = json.loads((ROOT.parents[3] / 'unify-front-end/__tests__/companion/fixtures/rag-query-context-province-conflict.json').read_text())
    sources = [{'document_id': 1, 'document_title': 'Review source title', 'url': 'https://example.invalid/source'}]
    sql('update public.messages set sources=' + literal(sources) + ', companion_context=' + literal(fixture['context']) + ' where id=4 and conversation_id=1')
    print('Temporary source/context fixture staged on synthetic message 4.')
elif sys.argv[1] == 'restore':
    before = json.loads(snapshot.read_text())
    sql('update public.messages set sources=' + literal(before['sources']) + ', companion_context=' + literal(before['companion_context']) + ' where id=4 and conversation_id=1')
    after = json.loads(sql('select to_jsonb(m) from public.messages m where id=4 and conversation_id=1'))
    assert before == after, 'full message row differs after restoration'
    (ROOT / 'fixture-restored.json').write_text(json.dumps({'message_id': 4, 'full_row_matches_before': True}))
    print('Full synthetic message row restored and compared.')
