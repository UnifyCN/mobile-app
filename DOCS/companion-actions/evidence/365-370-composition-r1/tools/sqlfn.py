"""Extract plpgsql/sql function definitions from migration files.
fns(path) -> {name: [text, ...]} (each full 'create ... function' statement through its
closing dollar quote and semicolon), in file order."""
import re, sys
START = re.compile(r'^create (or replace )?function (public\.[a-z0-9_]+)\s*\(', re.I | re.M)
def fns(path):
    src = open(path, encoding='utf-8').read()
    out = {}
    for m in START.finditer(src):
        i = m.start()
        # first dollar-quote tag after the header
        dq = re.compile(r'\$([a-z_]*)\$').search(src, m.end())
        tag = dq.group(0)
        end = src.index(tag, dq.end())
        semi = src.index(';', end + len(tag))
        out.setdefault(m.group(2), []).append(src[i:semi + 1])
    return out
if __name__ == '__main__':
    for k, v in fns(sys.argv[1]).items():
        print(k, len(v))
