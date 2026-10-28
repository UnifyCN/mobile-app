#!/bin/bash
# cap.sh <name>: screenshot + accessibility hierarchy (labels, bounds, values) into the evidence folder.
U=2EBB3153-995A-40F8-B2AF-5A71689E3B97
E=/Users/savargupta/.t3/worktrees/Unify/t3-a768fdfa/DOCS/companion-actions/evidence/370-corrections-r1/native
mkdir -p $E
sleep 1
xcrun simctl io $U screenshot "$E/$1.png" >/dev/null 2>&1
maestro --device $U hierarchy 2>/dev/null | python3 -I -c "
import json,sys
d=json.load(sys.stdin); out=[]
def walk(n):
    a=n.get('attributes',{}); t=a.get('accessibilityText') or a.get('text') or a.get('hintText')
    if t: out.append({'label':t,'bounds':a.get('bounds'),'value':a.get('value'),'enabled':a.get('enabled'),'focused':a.get('focused'),'selected':a.get('selected')})
    for c in n.get('children',[]): walk(c)
walk(d); json.dump(out, sys.stdout, ensure_ascii=False, indent=1)" > "$E/$1.hierarchy.json"
echo "captured $1"
