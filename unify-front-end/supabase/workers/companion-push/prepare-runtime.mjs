// Explicit preparation only. An ordinary Next build never downloads a runtime.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir, stat, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const pins = JSON.parse(await readFile(path.join(root, 'runtime-pins.json'), 'utf8'));
const local = process.argv.includes('--local');
if (process.argv.slice(2).some((arg) => arg !== '--local')) throw Error('invalid_preparation_argument');
const host = `${process.platform}-${process.arch}`;
if (!pins[host]) throw Error('unsupported_preparation_host');
const target = local ? host : 'linux-x64';
const runtime = path.join(root, '.runtime');
await mkdir(runtime, { recursive: true });
const sha = (data) => createHash('sha256').update(data).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error('runtime_download_failed');
  return Buffer.from(await response.arrayBuffer());
}
async function install(key) {
  const pin = pins[key];
  const dir = path.join(runtime, key);
  await mkdir(dir, { recursive: true });
  const binary = path.join(dir, 'deno');
  try { if (sha(await readFile(binary)) === pin.binarySha256) return binary; } catch { /* prepare below */ }
  const base = `https://github.com/denoland/deno/releases/download/v${pins.version}/`;
  const published = (await download(base + pin.asset + '.sha256sum')).toString().split(/\s/)[0];
  const binaryPublished = (await download(base + pin.asset.replace('.zip', '.sha256sum'))).toString().split(/\s/)[0];
  if (published !== pin.archiveSha256 || binaryPublished !== pin.binarySha256) throw Error('official_release_hash_changed');
  const archive = await download(base + pin.asset);
  if (sha(archive) !== published) throw Error('runtime_archive_hash_mismatch');
  const zip = path.join(dir, 'download.zip');
  await writeFile(zip, archive);
  execFileSync('/usr/bin/unzip', ['-o', zip, 'deno', '-d', dir], { stdio: 'ignore' });
  await rm(zip);
  if (sha(await readFile(binary)) !== binaryPublished) throw Error('runtime_binary_hash_mismatch');
  await chmod(binary, 0o755);
  return binary;
}
const deno = await install(target);
const builder = target === host ? deno : await install(host);
const stage = path.join(runtime, target);
const cache = path.join(stage, 'cache');
await rm(cache, { recursive: true, force: true });
await mkdir(cache);
const env = { PATH: process.env.PATH, DENO_DIR: cache, DENO_NO_UPDATE_CHECK: '1', DENO_NO_PACKAGE_JSON: '1' };
// No application, database, or provider code executes during dependency caching.
execFileSync(builder, ['cache', '--no-config', '--node-modules-dir=none', '--frozen',
  '--lock=' + path.join(root, 'deno.lock'), path.join(root, 'supervisor.ts')], { cwd: root, env, stdio: 'inherit' });
const files = [];
async function inventory(dir, prefix = '') {
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix + item.name;
    if (rel === 'manifest.json') continue;
    if (item.isSymbolicLink()) throw Error('runtime_symlink_forbidden');
    if (item.isDirectory()) await inventory(path.join(dir, item.name), rel + '/');
    else {
      const data = await readFile(path.join(dir, item.name));
      files.push({ path: rel, bytes: data.length, sha256: sha(data) });
    }
  }
}
await inventory(stage);
const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
// Leave at least 50 MB of the 250 MB function limit for the Next application.
if (bytes > 200_000_000) throw Error('runtime_package_too_large');
const manifest = { version: pins.version, target, bytes, lockSha256: sha(await readFile(path.join(root, 'deno.lock'))), files };
await writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ version: pins.version, target, bytes, files: files.length,
  binaryBytes: (await stat(deno)).size, lockSha256: manifest.lockSha256 }));
