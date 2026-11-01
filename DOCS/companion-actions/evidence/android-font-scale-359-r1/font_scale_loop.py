"""Assert the actual native composer value across live font changes."""
import datetime
import json
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

EVIDENCE = Path(__file__).resolve().parent
ADB = '/Users/savargupta/.t3/worktrees/Unify/t3-954237f7/unify-front-end/build/native367/android-sdk/platform-tools/adb'
PACKAGE = 'com.anonymous.unifyfrontend'
TAG = sys.argv[1]
VALUE = 'A1DraftKeep142'
RESULT = {'tag': TAG, 'expected': VALUE, 'checkpoints': []}


def adb(args, binary=False):
    if args[0] == 'shell':
        args = ['shell', shlex.join(args[1:])]
    proc = subprocess.run(
        [ADB, '-P', '61876', '-s', '127.0.0.1:5611', *args],
        capture_output=True, timeout=30,
    )
    with (EVIDENCE / 'raw' / (TAG + '-commands.jsonl')).open('a') as output:
        output.write(json.dumps({
            'time': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'args': args, 'exit': proc.returncode,
            'stdout': '[binary]' if binary else proc.stdout.decode(errors='replace'),
            'stderr': proc.stderr.decode(errors='replace'),
        }) + '\n')
    if proc.returncode:
        raise RuntimeError('Native command failed: ' + repr(args))
    return proc.stdout if binary else proc.stdout.decode()


def capture(name):
    adb(['shell', 'uiautomator', 'dump', '/sdcard/a1-359-loop.xml'])
    xml = adb(['shell', 'cat', '/sdcard/a1-359-loop.xml'])
    (EVIDENCE / 'raw' / (name + '.xml')).write_text(xml)
    (EVIDENCE / 'screenshots' / (name + '.png')).write_bytes(
        adb(['exec-out', 'screencap', '-p'], binary=True),
    )
    fields = [
        node.attrib for node in ET.fromstring(xml).iter('node')
        if node.get('package') == PACKAGE and node.get('class') == 'android.widget.EditText'
    ]
    if len(fields) != 1:
        raise RuntimeError('Expected exactly one native composer: ' + str(len(fields)))
    field = fields[0]
    record = {
        'capture': name, 'value': field.get('text'), 'bounds': field.get('bounds'),
        'focused': field.get('focused'),
        'font_scale': adb(['shell', 'settings', 'get', 'system', 'font_scale']).strip(),
    }
    dimensions = subprocess.run(
        ['node', str(EVIDENCE / 'dimensions.mjs')],
        cwd='/Users/savargupta/.t3/worktrees/Unify/t3-eb4d49c4/unify-front-end',
        capture_output=True, text=True, timeout=20,
    )
    (EVIDENCE / 'raw' / (name + '-dimensions.json')).write_text(dimensions.stdout)
    if dimensions.returncode:
        raise RuntimeError('Public Dimensions read failed: ' + dimensions.stderr)
    record['dimensions'] = json.loads(dimensions.stdout)
    RESULT['checkpoints'].append(record)
    return field


try:
    field = capture(TAG + '-01-initial')
    if field.get('text') not in ['', 'Ask anything...', 'اسأل أي شيء...']:
        raise RuntimeError('Composer is not empty at test entry.')
    bounds = [int(value) for value in re.findall(r'\d+', field['bounds'])]
    adb(['shell', 'input', 'tap', str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2)])
    focused = capture(TAG + '-02-focused')
    if focused.get('focused') != 'true':
        raise RuntimeError('Native composer did not gain focus.')
    adb(['shell', 'input', 'text', VALUE])
    prepared = capture(TAG + '-03-prepared')
    assert prepared.get('text') == VALUE, 'Native input did not prepare the exact draft.'
    before_events = adb(['logcat', '-b', 'events', '-d', '-v', 'threadtime'])
    (EVIDENCE / 'raw' / (TAG + '-events-before.log')).write_text(before_events)
    for index, scale in enumerate(['1.3', '2.0', '1.0']):
        adb(['shell', 'settings', 'put', 'system', 'font_scale', scale])
        time.sleep(1)
        observed = capture(TAG + '-0' + str(index + 4) + '-scale-' + scale)
        events = adb(['logcat', '-b', 'events', '-d', '-v', 'threadtime'])
        (EVIDENCE / 'raw' / (TAG + '-events-scale-' + scale + '.log')).write_text(events)
        assert observed.get('text') == VALUE, 'Live font scale ' + scale + ' discarded the native composer draft.'
        assert observed.get('focused') == 'true', 'Live font scale ' + scale + ' removed native composer focus.'
        dimensions = RESULT['checkpoints'][-1]['dimensions']
        assert abs(dimensions['fontScale'] - float(scale)) < 0.001, 'React Native kept the old font scale after ' + scale
        assert abs(dimensions['window']['fontScale'] - float(scale)) < 0.001, 'Window dimensions kept the old font scale after ' + scale
    RESULT['verdict'] = 'PASS'
except AssertionError as error:
    RESULT['verdict'] = 'BEHAVIOR_ASSERTION_FAILED'
    RESULT['error'] = str(error)
    raise
except Exception as error:
    RESULT['verdict'] = 'SETUP_OR_DRIVER_FAILED'
    RESULT['error'] = repr(error)
    raise
finally:
    (EVIDENCE / 'raw' / (TAG + '-result.json')).write_text(json.dumps(RESULT, indent=2) + '\n')
    print(json.dumps(RESULT))
