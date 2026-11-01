from pathlib import Path
import hashlib
import json
import stat

evidence = Path(__file__).resolve().parent
web = Path('/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359')
worker = web / 'supabase/workers/companion-push'
manifest = json.loads((worker / '.runtime/linux-x64/manifest.json').read_text())
required = [worker / '.runtime/linux-x64' / f['path'] for f in manifest['files']]
required += [worker / name for name in [
    '.runtime/linux-x64/manifest.json', 'deno.lock', 'runtime-pins.json',
    'supabase-prod-ca-2021.crt', 'supervisor.ts', 'process.ts', 'worker.ts', 'copy.ts', 'readiness.ts',
]]
required += list((worker / 'content-source').rglob('*.ts'))
for entry in manifest['files']:
    data = (worker / '.runtime/linux-x64' / entry['path']).read_bytes()
    assert len(data) == entry['bytes']
    assert hashlib.sha256(data).hexdigest() == entry['sha256']
assert hashlib.sha256((worker / 'deno.lock').read_bytes()).hexdigest() == manifest['lockSha256']
mode = (worker / '.runtime/linux-x64/deno').stat().st_mode & 0o777
assert mode & stat.S_IXUSR
results = []
for name in ['companion-push', 'companion-push-readiness']:
    nft = web / f'.next/server/app/api/cron/{name}/route.js.nft.json'
    files = {(nft.parent / p).resolve() for p in json.loads(nft.read_text())['files']}
    files.update([nft.with_name('route.js'), nft])
    for path in required:
        assert path.resolve() in files, f'{name}: missing {path}'
    assert not any('/darwin-arm64/' in str(p) or '/sql-check-cache/' in str(p)
                   or '.test.' in p.name or p.name.startswith('.env') for p in files)
    rows = [{'path': str(p.relative_to(web)), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
    total = sum(row['bytes'] for row in rows)
    assert total < 250_000_000, total
    result = {'route': name, 'files': len(rows), 'bytes': total,
              'limit_bytes': 250_000_000, 'headroom_bytes': 250_000_000 - total,
              'required_worker_files': len(required), 'all_required_in_trace': True,
              'deno_mode': oct(mode), 'extra_host_generated_JS': [], 'entries': rows}
    (evidence / f'{name}-function-files.json').write_text(json.dumps(result, indent=2) + '\n')
    results.append({k: v for k, v in result.items() if k != 'entries'})
(evidence / 'function-sizes.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
