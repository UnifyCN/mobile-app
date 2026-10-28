"""Review-only input and evidence for the explicitly assigned simulator."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UDID = 'A54D1945-3A80-4584-BBD0-AAD229FF3102'
NATIVE = ROOT / 'native'
NATIVE.mkdir(exist_ok=True)

def run(args, output):
    with open(output, 'wb') as stream:
        result = subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT)
    print(output.name, 'exit', result.returncode)
    return result.returncode

op, name = sys.argv[1:3]
if op == 'flow':
    path = ROOT / (name + '.yaml')
    path.write_text('appId: com.anonymous.unifyfrontend\n---\n' + sys.argv[3] + '\n')
    sys.exit(run(['maestro', '--platform', 'ios', '--port', '61794', '--device', UDID, 'test', '--debug-output', str(ROOT / (name + '-debug')), str(path)], ROOT / (name + '.log')))
elif op == 'cap':
    run(['xcrun', 'simctl', 'io', UDID, 'screenshot', str(NATIVE / (name + '.png'))], NATIVE / (name + '.screenshot.log'))
    with open(NATIVE / (name + '.hierarchy.raw.json'), 'wb') as out, open(NATIVE / (name + '.hierarchy.stderr'), 'wb') as err:
        result = subprocess.run(['maestro', '--platform', 'ios', '--port', '61794', '--device', UDID, 'hierarchy'], stdout=out, stderr=err)
    if result.returncode:
        sys.exit(result.returncode)
    nodes = []
    def walk(node):
        attrs = node.get('attributes', {})
        label = attrs.get('accessibilityText') or attrs.get('text') or attrs.get('hintText')
        if label:
            nodes.append(dict(label=label, bounds=attrs.get('bounds'), value=attrs.get('value'), focused=attrs.get('focused'), selected=attrs.get('selected')))
        for child in node.get('children', []):
            walk(child)
    walk(json.loads((NATIVE / (name + '.hierarchy.raw.json')).read_text()))
    (NATIVE / (name + '.hierarchy.json')).write_text(json.dumps(nodes, indent=2, ensure_ascii=False))
    size = subprocess.check_output(['xcrun', 'simctl', 'ui', UDID, 'content_size'], text=True).strip()
    (NATIVE / (name + '.settings.json')).write_text(json.dumps({'udid': UDID, 'content_size': size}))
    for node in nodes:
        if node['label'].strip() and 'scroll bar' not in node['label']:
            print(node['label'][:160], node['bounds'], node['value'])
