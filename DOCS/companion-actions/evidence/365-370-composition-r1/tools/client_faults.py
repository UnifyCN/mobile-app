"""One-mechanism client faults for the mounted #365+#370 composition cases. Each patches
one file, runs only the composed case, restores the exact bytes and checks them."""
import hashlib, json, os, re, subprocess
E = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = '/Users/savargupta/.t3/worktrees/Unify/t3-6a798481/unify-front-end'
W = '/tmp/unify-review-actions-361-web-r5-deno-base-9d05'
CASE = 'in one conversation'
MJ = ['npx', 'jest', '__tests__/companionActions/taskEdit.test.tsx', '--watchAll=false', '-t', CASE]
WV = ['npx', 'vitest', 'run', 'components/companion/tasks/TaskEdit.test.tsx', '-t', CASE]
faults = [
  ('MC1-clarify-loses-365-question', M, 'hooks/companion/useSendMessage.ts', "      return clarifyQuestion(t, command);\n",
   "      return t('taskCreate.clarifyMultiple');\n", MJ),
  ('MC2-edit-command-not-applied', M, 'hooks/companion/useSendMessage.ts', "            command.kind === 'edit' ||\n", "", MJ),
  ('MC3-remember-not-applied', M, 'hooks/companion/useSendMessage.ts',
   "            command.kind === 'edit' ||\n            (command.kind === 'remember' &&\n              command.sameTextDetails.length === 0)",
   "            command.kind === 'edit'", MJ),
  ('WC1-clarify-loses-365-question', W, 'hooks/useCompanion.ts', '      return clarifyQuestion(t, command);\n',
   '      return t("taskCreate.clarifyMultiple");\n', WV),
  ('WC2-edit-command-not-applied', W, 'hooks/useCompanion.ts', '          command.kind === "edit" ||\n', '', WV),
  ('WC3-remember-not-applied', W, 'hooks/useCompanion.ts',
   '          command.kind === "edit" ||\n          (command.kind === "remember" && command.sameTextDetails.length === 0)',
   '          command.kind === "edit"', WV),
]
results = {}
for name, root, rel, old, new, cmd in faults:
    path = os.path.join(root, rel); orig = open(path, 'rb').read(); h = hashlib.sha256(orig).hexdigest()
    s = orig.decode(); assert s.count(old) == 1, name
    open(path, 'w').write(s.replace(old, new))
    try:
        r = subprocess.run(['timeout', '900'] + cmd, cwd=root, capture_output=True, text=True)
    finally:
        open(path, 'wb').write(orig)
    assert hashlib.sha256(open(path, 'rb').read()).hexdigest() == h
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    open(f'{E}/faults/{name}.log', 'w').write(out)
    first = next((l.strip() for l in out.splitlines() if re.search(r'Unable to find|expect\(|AssertionError|TestingLibraryElementError|Expected', l)), '')
    results[name] = {'exit': r.returncode, 'first_failure': first[:200], 'restored_sha256': h}
    print(name, r.returncode, first[:140], flush=True)
json.dump(results, open(f'{E}/faults/client-faults-results.json', 'w'), indent=1)
