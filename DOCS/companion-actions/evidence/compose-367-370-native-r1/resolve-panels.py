from pathlib import Path
exec(Path(__file__).with_name('resolve-text.py').read_text().split('for root, prefix in')[0])

for root, prefix in [(MOBILE,'unify-front-end/services/companionActions/'),(WEB,'lib/companionActions/')]:
    path=root/(prefix+'client.ts')
    s=path.read_text()
    q="'" if root == MOBILE else '"'
    broken=f"export type RemovalProposalResult =\n  | {{ kind: {q}ok{q};"
    full=f"export type RemovalProposalResult =\n  | {{ kind: {q}ok{q}; proposal: RemovalProposal }}\n  | {{ kind: {q}changed{q}; proposal: RemovalProposal }}\n  | Unavailable | Refused | Unknown | Unauthorized;"
    assert broken in s
    path.write_text(s.replace(broken,full))
    path=root/(prefix+'contract.ts')
    path.write_text(path.read_text().replace(' | RemovalProposal | RemovalProposal',' | RemovalProposal'))

for root,file in [(MOBILE,'unify-front-end/app/(tabs)/companion/index.tsx'),(WEB,'app/(main)/companion/page.tsx'),(MOBILE,'unify-front-end/components/companion/tasks/TaskProposalPanel.tsx'),(WEB,'components/companion/tasks/TaskProposalPanel.tsx')]:
    resolve(root,file,lambda i,a,b:a+b)
resolve(MOBILE,'unify-front-end/components/companion/tasks/TaskActionsSheet.tsx',lambda i,a,b:a.replace('useMemo, useState','useMemo, useRef, useState'))

for root,file in [(MOBILE,'unify-front-end/components/companion/tasks/TaskActionCards.tsx'),(WEB,'components/companion/tasks/TaskActionCards.tsx')]:
    theirs=original(root,file,3)
    def cards(i,a,b):
        if i in [0,1,2]: return a+b
        if i==3:
            return b[:b.index('  const command =')]+a
        if i==4: return a+'        />\n      ))}\n'+b
        return a
    def cards_after(s):
        if root==MOBILE:
            start=theirs.index('/**\n * #367: a removal request')
            end=theirs.index('function commandText(',start)
            s+='\n'+theirs[start:end]
        return s
    resolve(root,file,cards,cards_after)

resolve(WEB,'supabase/functions/companion-actions/handler.ts',lambda i,a,b:a+b)
def edge_contract(i,a,b):
    if i==0: return a.replace('in #370,','in #370, task removal in #367,')
    if i==1:
        return b.replace('StepCreateOperation | TaskRemoveOperation','StepCreateOperation | DetailCreateOperation | TaskRemoveOperation').replace("op.type === 'step.create' || op.type === 'task.remove'", "op.type === 'step.create' || op.type === 'detail.create' || op.type === 'task.remove'").replace('type RevisableOperation = CreateCustomOperation | StepCreateOperation;', 'type RevisableOperation = CreateCustomOperation | StepCreateOperation | DetailCreateOperation;').replace("op.type === 'task.create_custom' || op.type === 'step.create';", "op.type === 'task.create_custom' || op.type === 'step.create' || op.type === 'detail.create';")
    return a.replace('can be','or a removal (#367) can be')
resolve(WEB,'supabase/functions/companion-actions/contract.ts',edge_contract)
resolve(WEB,'supabase/tests/companion-actions/README.md',lambda i,a,b:a+b)

def support(i,a,b):
    if i==0 or i==4: return a+'}\n\n'+b if i==4 else a+b
    if i==1: return "    await migrate370('up');\n    await migrate367('up');\n  } else {\n    if (await migration367Applied()) await migrate367('down');\n    if (await migration370Applied()) await migrate370('down');\n"
    if i==2: return a
    if i==3: return a+'}\n\n'+b
    return a+'}\n\n'+b
def support_after(s):
    s=s.replace("export async function migrate370(which: 'up' | 'down'): Promise<void> {", "export async function migrate370(which: 'up' | 'down'): Promise<void> {\n  if (which === 'down' && await migration367Applied()) await migrate367('down');")
    s=s.replace("if (which === 'up' && !(await migration365Applied())) await migrate365('up');", "if (which === 'up' && !(await migration365Applied())) await migrate365('up');\n  if (which === 'up' && !(await migration370Applied())) await migrate370('up');")
    s=s.replace("    if (!(await migration370Applied())) await migrate370('up');\n}\n\n    if (!(await migration367Applied()))", "    if (!(await migration370Applied())) await migrate370('up');\n    if (!(await migration367Applied()))")
    return s
resolve(WEB,'supabase/tests/companion-actions/support.ts',support,support_after)
(EVIDENCE/'panel-resolution-ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
