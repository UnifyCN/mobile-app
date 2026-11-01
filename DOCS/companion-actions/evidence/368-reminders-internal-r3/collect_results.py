"""Archive the completed owned service run and count its exact result set."""
from pathlib import Path
import hashlib
import json
import re
import shutil

HERE = Path(__file__).resolve().parent
CONTROL = Path('/private/tmp/unify-companion-359/reminders-internal-r3/DOCS/companion-actions/evidence/368-reminders-runtime-r2')
rows = json.loads((CONTROL / 'service-suite-results.json').read_text())
order = json.loads((HERE / 'suite-driver-change.json').read_text())['order']
assert [r['file'] for r in rows] == order
assert len(rows) == 37 and all(r['exit'] == 0 for r in rows)
target = HERE / 'service-final'
target.mkdir(exist_ok=True)
counts = []
for row in rows:
    stem = Path(row['file']).stem
    log = CONTROL / ('service-' + stem + '.log')
    readiness = CONTROL / ('rest-ready-' + stem + '.json')
    text = re.sub(r'\x1b\[[0-9;]*m', '', log.read_text())
    matches = re.findall(r'^ok \| (\d+) passed \| (\d+) failed', text, re.M)
    assert len(matches) == 1, row['file']
    passed, failed = map(int, matches[0])
    assert failed == 0
    ready = json.loads(readiness.read_text())
    assert len(ready) >= 5 and all(r['status'] == 200 for r in ready[-5:])
    cases = re.findall(r'^(.+?) \.\.\. (?:ok|FAILED)(?: |$)', text, re.M)
    counts.append({**row, 'passed': passed, 'failed': failed,
                   'case_lines': cases,
                   'rest_observations': len(ready),
                   'log_sha256': hashlib.sha256(log.read_bytes()).hexdigest()})
    shutil.copy2(log, target / log.name)
    shutil.copy2(readiness, target / readiness.name)
shutil.copy2(CONTROL / 'service-suite-results.json', target / 'service-suite-results.json')
summary = {'fresh_files': len(counts), 'fresh_passed': sum(r['passed'] for r in counts),
           'fresh_failed': sum(r['failed'] for r in counts), 'files': counts,
           'root_supplied_files': 1, 'root_supplied_passed': 10,
           'root_supplied_failed': 0, 'root_supplied_assertion_mutations': 3}
summary['combined_files'] = summary['fresh_files'] + summary['root_supplied_files']
summary['combined_passed'] = summary['fresh_passed'] + summary['root_supplied_passed']
(HERE / 'service-counts.json').write_text(json.dumps(summary, indent=2) + '\n')
table = '| File | Pass | Fail |\n| --- | ---: | ---: |\n'
table += ''.join(f"| {r['file']} | {r['passed']} | {r['failed']} |\n" for r in counts)
(HERE / 'service-distribution.md').write_text(table)
print(json.dumps({k: v for k, v in summary.items() if k != 'files'}))
