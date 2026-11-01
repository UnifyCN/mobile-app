"""Bounded caller mutations. Restore the owned source after every run."""
from pathlib import Path
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
APP = ROOT / 'unify-front-end'
SOURCE = APP / 'app/(tabs)/companion/index.tsx'
KEY = "key={`${accountId ?? 'unknown'}:${accountEpoch}`}"
original = SOURCE.read_text()
assert original.count(KEY) == 1
rows = []
try:
    for name, replacement, expected in [
        ('no-owner-key', 'key="unscoped"', 'a reminder title is removed when another account signs in'),
        ('account-without-epoch', "key={accountId ?? 'unknown'}", 'a sign-out and sign-in in one batch'),
    ]:
        SOURCE.write_text(original.replace(KEY, replacement))
        try:
            result = subprocess.run(
                ['npx', 'jest', '__tests__/companionActions/companionTaskSheet.test.tsx',
                 '--runInBand', '--watchAll=false', '--testNamePattern=R368:'],
                cwd=APP, capture_output=True, text=True, timeout=60,
            )
            log = result.stdout + result.stderr
            (HERE / (name + '.log')).write_text(log)
            killed = result.returncode == 1 and expected in log and 'expect(received).toBeNull()' in log
            rows.append(dict(name=name, exit=result.returncode, assertion_kill=killed,
                             log_sha256=hashlib.sha256(log.encode()).hexdigest()))
        finally:
            SOURCE.write_text(original)
        assert rows[-1]['assertion_kill'], rows[-1]
finally:
    SOURCE.write_text(original)
    assert SOURCE.read_text() == original
    (HERE / 'mutation-results.json').write_text(json.dumps(dict(
        cases=rows, source_restored=True,
        source_sha256=hashlib.sha256(original.encode()).hexdigest(),
    ), indent=2) + '\n')
print(json.dumps(dict(assertion_kills=len(rows), source_restored=True)))
