"""Capture actual pixels, AX frames and system text size on the owned simulator."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UDID = 'A54D1945-3A80-4584-BBD0-AAD229FF3102'
BUNDLE = Path('/Users/savargupta/.npm/_npx/b998b4270960e258/node_modules/mobilebuildmcp/bundled')
assert (BUNDLE / 'axe').is_file()
name = sys.argv[1]
target = ROOT / 'native' / name
subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', str(target) + '.png'], check=True, capture_output=True)
raw = subprocess.check_output([str(BUNDLE / 'axe'), 'describe-ui', '--udid', UDID], env=dict(os.environ, DYLD_FRAMEWORK_PATH=str(BUNDLE / 'Frameworks')), timeout=30)
Path(str(target) + '.raw.json').write_bytes(raw)
nodes = []
def walk(node):
    if isinstance(node, list):
        for n in node: walk(n)
        return
    label = node.get('AXLabel') or node.get('title')
    value = node.get('AXValue')
    if label or value:
        nodes.append({'label': label, 'value': value, 'frame': node.get('frame'), 'role': node.get('role'), 'enabled': node.get('enabled'), 'focused': node.get('focused'), 'selected': node.get('selected')})
    for n in node.get('children', []): walk(n)
walk(json.loads(raw))
Path(str(target) + '.hierarchy.json').write_text(json.dumps(nodes, indent=2, ensure_ascii=False) + '\n')
size = subprocess.check_output(['xcrun', 'simctl', 'ui', UDID, 'content_size'], text=True).strip()
Path(str(target) + '.settings.json').write_text(json.dumps({'udid': UDID, 'content_size': size}) + '\n')
print(name, size, len(nodes), 'labelled native elements')
