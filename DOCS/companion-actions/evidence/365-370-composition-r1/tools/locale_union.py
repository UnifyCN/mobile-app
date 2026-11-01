"""Check each locale file is the 3-way union of two parents, by key and value.
Usage: locale_union.py REPO DIR BASE A B   (DIR holds <lang>/translation.json)
For every leaf key: the result must equal A's value if only A changed it (vs BASE), B's if
only B changed it, the common value if both agree; a key both changed differently fails.
Keys removed by one parent and untouched by the other must be absent. Exit 1 on any miss."""
import json, os, subprocess, sys
repo, d, base, a, b = sys.argv[1:6]
def show(ref, path):
    r = subprocess.run(['git', '-C', repo, 'show', f'{ref}:{path}'], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else {}
def flat(o, p=''):
    out = {}
    for k, v in o.items():
        q = f'{p}.{k}' if p else k
        if isinstance(v, dict): out.update(flat(v, q))
        else: out[q] = v
    return out
fail = 0
for lang in sorted(os.listdir(os.path.join(repo, d))):
    path = f'{d}/{lang}/translation.json'
    if not os.path.isfile(os.path.join(repo, path)): continue
    B0, A1, B1 = flat(show(base, path)), flat(show(a, path)), flat(show(b, path))
    R = flat(json.load(open(os.path.join(repo, path), encoding='utf-8')))
    keys = set(B0) | set(A1) | set(B1) | set(R)
    bad = []
    for k in sorted(keys):
        va, vb, v0 = A1.get(k, '<absent>'), B1.get(k, '<absent>'), B0.get(k, '<absent>')
        if va == vb: want = va
        elif va == v0: want = vb
        elif vb == v0: want = va
        else: bad.append((k, 'both changed')); continue
        got = R.get(k, '<absent>')
        if got != want: bad.append((k, f'want {want!r} got {got!r}'))
    onlyA = len([k for k in A1 if k not in B0]); onlyB = len([k for k in B1 if k not in B0])
    print(f'{lang}: {len(R)} keys; +{onlyA} from A, +{onlyB} from B vs base; mismatches {len(bad)}')
    for x in bad[:10]: print('   ', x)
    fail |= bool(bad)
sys.exit(1 if fail else 0)
