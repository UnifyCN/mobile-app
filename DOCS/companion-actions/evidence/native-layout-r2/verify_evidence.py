"""Check the retained native observations without starting a driver or app."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NATIVE = ROOT / 'native'

def read(name):
    return json.loads((NATIVE / (name + '.hierarchy.json')).read_text())

def one(name, predicate):
    return next(n for n in read(name) if predicate(n))

def heading(name):
    return one(name, lambda n: n['role'] == 'AXHeading')

def composer(name):
    return one(name, lambda n: n['role'] == 'AXTextArea' and n['label'] is None)

def waiting(name):
    return one(name, lambda n: n['role'] == 'AXTextArea' and isinstance(n['value'], str) and n['value'].startswith('R2 ') and n['label'] is not None)

report = {'falsifier': 'Missing retained panel, changed draft, unchanged text bounds, overlapping empty entry, or changed served source bytes.', 'context': [], 'task_list': [], 'waiting': [], 'empty_entry': []}
for before, after in [('b02-en-context-default', 'b03-en-context-live-xxxl'), ('c07-french-context-default', 'c08-french-context-live-xxxl')]:
    a, b = heading(before), heading(after)
    assert b['label'] == a['label'] and b['frame']['height'] > a['frame']['height']
    assert composer(before)['value'] == composer(after)['value'] == 'R2 retained composer'
    close = one(after, lambda n: n['role'] == 'AXButton' and ('Close sources' in (n['label'] or '') or 'Fermer les sources' in (n['label'] or '')))
    assert close['frame']['width'] >= 44 and close['frame']['height'] >= 44
    report['context'].append({'before': before, 'after': after, 'heading_before': a, 'heading_after': b, 'close_after': close, 'composer_retained': True})
for before, after in [('b08-en-task-list-medium', 'b09-en-task-list-live-axxxxl'), ('c10-french-task-list-medium', 'c11-french-task-list-live-axxxxl'), ('d06-reduced-motion-task-medium', 'd07-reduced-motion-task-live-axxxxl')]:
    a, b = heading(before), heading(after)
    assert a['label'] == b['label'] and b['frame']['height'] > a['frame']['height']
    rows = []
    for title in ['Open a bank account, ', 'Get a phone plan, ']:
        x = one(before, lambda n: n['role'] == 'AXButton' and (n['label'] or '').startswith(title))
        y = one(after, lambda n: n['role'] == 'AXButton' and n['label'] == x['label'])
        assert y['frame']['height'] > x['frame']['height']
        assert y['frame']['y'] >= b['frame']['y'] + b['frame']['height']
        rows.append({'before': x, 'after': y})
    report['task_list'].append({'before': before, 'after': after, 'heading_before': a, 'heading_after': b, 'rows': rows})
for before, after, continued, suffix in [('b11-en-waiting-draft-medium-keyboard', 'b12-en-waiting-draft-live-axxxxl-keyboard', 'b13-en-retained-input', ' continued'), ('c13-french-waiting-draft-medium', 'c14-french-waiting-draft-live-axxxxl', 'c15-french-waiting-draft-continued', ' suite')]:
    a, b, c = waiting(before), waiting(after), waiting(continued)
    assert a['value'] == b['value'] and c['value'] == b['value'] + suffix
    assert b['frame']['height'] > a['frame']['height']
    for name in [before, after, continued]:
        assert composer(name)['value'] == 'R2 retained composer'
        assert any(n['value'] == 'radio button, checked' and n['label'] in ['Waiting', 'En attente'] for n in read(name))
    report['waiting'].append({'before': before, 'after': after, 'continued_without_refocus': continued, 'input_before': a, 'input_after': b, 'input_continued': c, 'composer_retained': True, 'selected_waiting_retained': True})
for name in ['c19-french-empty-axxxxl', 'c20-french-empty-live-medium', 'e04-final-companion']:
    entry = one(name, lambda n: n['role'] == 'AXButton' and (n['label'] or '').startswith(('Vos tâches, ', 'Your tasks, ')))
    welcome = one(name, lambda n: n['label'] in ["Posez-moi n'importe quelle question.", 'Ask me anything.'])
    gap = welcome['frame']['y'] - (entry['frame']['y'] + entry['frame']['height'])
    assert gap >= 0
    report['empty_entry'].append({'capture': name, 'entry': entry, 'welcome': welcome, 'gap_pt': gap})
source = json.loads((ROOT / 'served-source-proof.json').read_text())
assert len(source['matches']) == 12 and all(n['matches'] for n in source['matches'])
for n in source['matches']:
    assert hashlib.sha256((Path(source['root']) / n['path']).read_bytes()).hexdigest() == n['sha256']
report['served_runtime_sources_matching'] = len(source['matches'])
report['explicit_context_close'] = []
for name in ['b05-en-expanded-sources-visible', 'c09-french-context-closed']:
    nodes = read(name)
    assert not any(n['role'] == 'AXHeading' and n['label'] in ['Sources and context', 'Sources et contexte'] for n in nodes)
    source_row = next(n for n in nodes if 'Review source title' in (n['label'] or ''))
    assert composer(name)['value'] == 'R2 retained composer'
    report['explicit_context_close'].append({'capture': name, 'expanded_source_retained': source_row, 'composer_retained': True})
report['limits'] = ['Native AX frames do not prove VoiceOver or TalkBack behavior.', 'The French input value is verified off screen after resizing; the last scroll capture is below the field.', 'Software keyboard keys exist below the visible screen; fresh visible software keyboard proof is incomplete.', 'The reduced-motion sequence follows a separate app restart after the English and French binding transitions.']
(ROOT / 'native-validation.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print('Native observation assertions passed. Source bytes match all 12 changed runtime files.')
