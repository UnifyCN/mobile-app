from pathlib import Path
import re
import subprocess
import json

MOBILE = Path('/Users/savargupta/.t3/worktrees/Unify/t3-c68f1368')
WEB = Path('/tmp/unify-review-actions-361-web-r5-deno-base-9d05')
EVIDENCE = Path(__file__).parent
PATTERN = re.compile(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>>[^\n]*\n', re.S)
ledger = []

def original(root, file, stage):
    return subprocess.check_output(['git', '-C', str(root), 'show', f':{stage}:{file}'], text=True)

def resolve(root, file, select, after=lambda s: s):
    path = root / file
    source = path.read_text()
    matches = list(PATTERN.finditer(source))
    index = 0
    def replace(m):
        nonlocal index
        result = select(index, m[1], m[2])
        index += 1
        return result
    result = after(PATTERN.sub(replace, source))
    assert '<<<<<<<' not in result
    path.write_text(result)
    ledger.append({'root': str(root), 'file': file, 'conflicts': len(matches),
                   'policy': 'Retain saved-detail and removal behavior; preserve accepted layout and hydration.'})

for root, prefix in [(MOBILE, 'unify-front-end/services/companionActions/'), (WEB, 'lib/companionActions/')]:
    file = prefix + 'contract.ts'
    theirs = original(root, file, 3)
    q = "'" if root == MOBILE else '"'
    def contract(i, a, b):
        if i == 0:
            return a.replace('#366, #370', '#366, #370, #367')
        if i == 1:
            return f'  | {q}task.remove{q}\n  | {q}task.restore{q}\n' + a
        if i == 2:
            return a + b
        if i == 3:
            return '  | TaskRemoveOperation\n  | TaskRestoreOperation\n' + a
        if i == 4:
            return '  | TaskRestoreOperation\n' + a
        if root == WEB and i == 5:
            return a + b
        if i == (5 if root == MOBILE else 6):
            return a + b
        if i == (6 if root == MOBILE else 7):
            return a.replace('StepProposal | DetailProposal', 'StepProposal | DetailProposal | RemovalProposal')
        return a
    def contract_after(s):
        start = theirs.index('/** #367: what removing a task affects')
        s += '\n' + theirs[start:]
        return s.replace('TaskProposal | StepProposal | DetailProposal', 'TaskProposal | StepProposal | DetailProposal | RemovalProposal').replace('TaskProposal | StepProposal | RemovalProposal', 'TaskProposal | StepProposal | DetailProposal | RemovalProposal')
    resolve(root, file, contract, contract_after)

    file = prefix + 'client.ts'
    theirs = original(root, file, 3)
    removal_result = re.search(r'export type RemovalProposalResult =.*?;', theirs, re.S)[0]
    def client(i, a, b):
        if i == 0: return a.replace('#366, #370', '#366, #370, #367')
        if i in [1, 4, 5]: return a + b
        if i == 2: return a.replace('StepProposal | DetailProposal', 'StepProposal | DetailProposal | RemovalProposal')
        if i == 3: return removal_result + '\n\n' + a
        if i == 6:
            return a.replace(': parseTaskProposal(body.proposal)', f': draftKind === {q}task_remove{q}\n                  ? parseRemovalProposal(body.proposal)\n                  : parseTaskProposal(body.proposal)')
        if root == MOBILE and i == 7:
            return a.replace('const isSteps =', f'const kindOf = (p: unknown) => asObject(p).kind;\n      const isSteps =').replace('!isSteps(p)', f'!isSteps(p) && kindOf(p) !== {q}task_remove{q}').replace('commands: body.commands.map(commandEntry),', f'removalProposals: body.proposals.filter(p => kindOf(p) === {q}task_remove{q}).map(parseRemovalProposal),\n        commands: body.commands.map(commandEntry),')
        if root == WEB and i == 7: return b + a
        if root == WEB and i == 8:
            return a + f'        removalProposals: body.proposals.filter(p => kindOf(p) === {q}task_remove{q}).map(parseRemovalProposal),\n'
        if i == (8 if root == MOBILE else 9): return a + '    },\n\n' + b
        return a + b
    resolve(root, file, client)
    resolve(root, prefix+'analytics.ts', lambda i,a,b: a+b)
    resolve(root, prefix+'taskActionStore.ts', lambda i,a,b:
            a.replace('StepProposal | DetailProposal', 'StepProposal | DetailProposal | RemovalProposal') if i == 0
            else a.rstrip().rstrip(';')+'\n'+b)

(EVIDENCE/'client-resolution-ledger.json').write_text(json.dumps(ledger, indent=2)+'\n')
