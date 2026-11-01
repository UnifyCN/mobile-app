#!/usr/bin/env python3
"""S365-002 client mutations (corrections r1). Each breaks one rule, runs the named
tests, expects an assertion failure, and restores the file byte for byte."""
import pathlib, subprocess, sys
M = pathlib.Path('/Users/savargupta/.t3/worktrees/Unify/t3-67d6fc19/unify-front-end')
W = pathlib.Path('/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05')
LOG = pathlib.Path(sys.argv[1])
CASES = [
  ('mobile_reason_line_dropped', M, 'components/companion/tasks/editText.ts',
   "  return reasons && reasons.before !== reasons.after\n    ? [...receipt.changes, { field: 'waitingReason', ...reasons }]\n    : receipt.changes;",
   "  return reasons ? receipt.changes : receipt.changes;",
   ['npx', 'jest', '__tests__/companionActions/taskEdit.test.tsx', '__tests__/companionActions/receiptReasons.test.ts', '--watchAll=false', '-t', 'waiting reason']),
  ('mobile_reasons_not_parsed', M, 'services/companionActions/contract.ts',
   "      raw.after_waiting_reason === undefined\n        ? null",
   "      raw.after_waiting_reason !== '\\u0000'\n        ? null",
   ['npx', 'jest', '__tests__/companionActions/taskEdit.test.tsx', '__tests__/companionActions/receiptReasons.test.ts', '--watchAll=false', '-t', 'waiting reason']),
  ('web_reason_line_dropped', W, 'components/companion/tasks/editText.ts',
   '  return reasons && reasons.before !== reasons.after\n    ? [...receipt.changes, { field: "waitingReason", ...reasons }]\n    : receipt.changes;',
   "  return reasons ? receipt.changes : receipt.changes;",
   ['npx', 'vitest', 'run', 'components/companion/tasks/TaskEdit.test.tsx', 'lib/companionActions/receiptReasons.test.ts', '-t', 'waiting reason']),
  ('web_reasons_not_parsed', W, 'lib/companionActions/contract.ts',
   '      raw.after_waiting_reason === undefined\n        ? null',
   '      raw.after_waiting_reason !== "\\u0000"\n        ? null',
   ['npx', 'vitest', 'run', 'components/companion/tasks/TaskEdit.test.tsx', 'lib/companionActions/receiptReasons.test.ts', '-t', 'waiting reason']),
]
ok = True
with LOG.open('w') as log:
  for name, root, rel, old, new, cmd in CASES:
    p = root / rel; orig = p.read_bytes(); s = orig.decode()
    assert s.count(old) == 1, (name, 'anchor')
    p.write_text(s.replace(old, new, 1))
    try:
      r = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
    finally:
      p.write_bytes(orig)
    out = r.stdout + r.stderr
    assertion = ('Unable to find' in out or 'toEqual' in out or 'AssertionError' in out or 'expect(' in out)
    crash = ('SyntaxError' in out or 'Cannot find module' in out or 'TypeError' in out)
    verdict = 'RED' if r.returncode != 0 and assertion and not crash else 'SURVIVED_OR_CRASH'
    ok &= verdict == 'RED'
    log.write(f'=== {name} exit={r.returncode} {verdict}\n{out}\n')
    print(name, r.returncode, verdict)
print('ALL_RED' if ok else 'NOT_ALL_RED')
