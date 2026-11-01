#!/usr/bin/env python3
"""Mutation check for the mobile task-action client tests (mobile-app#361).

Each mutation breaks one rule in production code, runs the mounted tests, and
expects at least one named test to fail by assertion. The file is restored
after every run. A mutation that leaves every test green, or that fails by a
crash or a missing module instead of an assertion, fails this check.

Usage (from unify-front-end): python3 __tests__/companionActions/client_mutation_check.py
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS = ['__tests__/companionActions/checklistTaskProgress.test.tsx',
         '__tests__/companionActions/companionTaskSheet.test.tsx']

MUTATIONS = [
    ('retry gets a new operation id',
     'services/companionActions/taskActionStore.ts',
     'return this.run(taskRef, p.write);',
     'return this.run(taskRef, { ...p.write, operationId: this.deps.newOperationId() });',
     'not applied retries the same operation'),
    ('a lost response is retried instead of looked up',
     'services/companionActions/taskActionStore.ts',
     "        report('unknown');\n        await this.lookup(taskRef, write);",
     "        report('unknown');\n        this.set(taskRef, { phase: 'not_applied', write });",
     'a lost response is looked up'),
    ('pending allows a new write',
     'services/companionActions/taskActionStore.ts',
     "  'pending',\n",
     '',
     'pending and failed lookups stay unresolved'),
    ('Undo names the newest receipt, not its own',
     'components/companion/tasks/TaskStatePanel.tsx',
     'void store.undo(taskRef, receipt.operationId)',
     'void store.undo(taskRef, progress.lastReceipt?.operationId ?? receipt.operationId)',
     'its Undo stays tied to it'),
    ('a saved receipt keeps claiming to be current',
     'components/companion/tasks/TaskStatePanel.tsx',
     '            phase.receipt.current &&\n            progress.revision === phase.receipt.afterRevision,',
     '            phase.receipt.current,',
     'becomes historical'),
    ('approving the compensating change uses ui_control',
     'services/companionActions/taskActionStore.ts',
     "        kind: 'approved_proposal',\n        proposal_id: p.proposal.proposalId,\n        proposal_revision: p.proposal.proposalRevision,",
     "        kind: 'ui_control',",
     'offers a reviewed change'),
    ('a failed read still allows writes',
     'hooks/companion/useTaskActions.ts',
     "canWrite: status === 'ready' && !stale && !query.isFetching,",
     "canWrite: (status === 'ready' || status === 'offline') && !query.isFetching,",
     'offline'),
    ('account change keeps the previous store',
     'hooks/companion/useTaskActions.ts',
     '    clearTaskActionStores(userId);\n',
     '',
     'sign-out clears'),
    ('telemetry copies the task reference',
     'services/companionActions/analytics.ts',
     "    entry_surface: surface === 'companion' ? 'companion' : 'checklist',",
     "    entry_surface: surface === 'companion' ? 'companion' : 'checklist',\n    ...({ task_ref: (event as any).taskRef ?? 'sanity:sin' } as {}),",
     'allowlisted'),
    ('opening the task sheet clears the typed message',
     'app/(tabs)/companion/index.tsx',
     '            setTasksOpen(true);',
     "            setTasksOpen(true);\n            setInputText('');",
     'keeps the typed message'),
]

def run_tests():
    out = subprocess.run(['npx', 'jest', *TESTS, '--watchAll=false', '--forceExit', '--verbose'],
                         cwd=ROOT, capture_output=True, text=True, timeout=600)
    text = re.sub(r'\x1b\[[0-9;]*m', '', out.stdout + out.stderr)
    failed = sorted(set(re.findall(r'✕ (.+?) \(\d+ ms\)', text)
                        + re.findall(r'● [^›\n]+ › (.+)', text)))
    crashed = 'Test suite failed to run' in text
    return failed, crashed, text

def main():
    ok = True
    failed, crashed, _ = run_tests()
    if failed or crashed:
        print('baseline is not green; fix that first'); return 1
    for name, rel, old, new, expect in MUTATIONS:
        path = ROOT / rel
        src = path.read_text()
        if src.count(old) != 1:
            print(f'UNRESOLVED {name}: anchor not found once in {rel}'); ok = False; continue
        path.write_text(src.replace(old, new, 1))
        try:
            failed, crashed, _ = run_tests()
        finally:
            path.write_text(src)
        bound = failed and not crashed and (expect is None or any(expect in f for f in failed))
        print(f"{'RED' if bound else 'NOT BOUND'} {name}: {len(failed)} failed{' (crash)' if crashed else ''}"
              + (f" e.g. {failed[0]}" if failed else ''))
        ok = ok and bool(bound)
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
