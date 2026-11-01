"""Resolve git conflict hunks in one file. Usage: resolve.py FILE SPEC.json
SPEC is a JSON list, one entry per hunk in order: "ours", "theirs", "both" (ours then
theirs), "both_rev", or {"text": "..."} (exact replacement, newline-terminated lines).
Refuses when the number of hunks differs from the number of entries."""
import json, re, sys
path, spec_path = sys.argv[1], sys.argv[2]
spec = json.load(open(spec_path))
lines = open(path, encoding='utf-8').read().split('\n')
out, i, hunks = [], 0, []
while i < len(lines):
    l = lines[i]
    if l.startswith('<<<<<<< '):
        ours, theirs, j = [], [], i + 1
        while not lines[j].startswith('======='):
            ours.append(lines[j]); j += 1
        j += 1
        while not lines[j].startswith('>>>>>>> '):
            theirs.append(lines[j]); j += 1
        hunks.append((ours, theirs)); out.append(('H', len(hunks) - 1)); i = j + 1
    else:
        out.append(('L', l)); i += 1
if len(hunks) != len(spec):
    sys.exit(f'{path}: {len(hunks)} hunks, {len(spec)} resolutions')
res = []
for kind, v in out:
    if kind == 'L': res.append(v); continue
    o, t = hunks[v]; s = spec[v]
    if s == 'ours': res += o
    elif s == 'theirs': res += t
    elif s == 'both': res += o + t
    elif s == 'both_rev': res += t + o
    else: res += s['text'].rstrip('\n').split('\n')
open(path, 'w', encoding='utf-8').write('\n'.join(res))
print(path, 'resolved', len(hunks))
