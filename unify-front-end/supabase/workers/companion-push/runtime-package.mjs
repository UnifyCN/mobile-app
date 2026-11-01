import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

const sha = (data) => createHash('sha256').update(data).digest('hex');
export async function verifyRuntimePackage(root, target) {
  const pins = JSON.parse(await readFile(path.join(root, 'runtime-pins.json'), 'utf8'));
  const runtime = path.join(root, '.runtime', target);
  const manifest = JSON.parse(await readFile(path.join(runtime, 'manifest.json'), 'utf8'));
  if (manifest.version !== '2.9.8' || manifest.target !== target || pins.version !== manifest.version ||
    !Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 5000 ||
    !Number.isSafeInteger(manifest.bytes) || manifest.bytes > 200_000_000 ||
    sha(await readFile(path.join(root, 'deno.lock'))) !== manifest.lockSha256) throw Error('invalid_runtime_manifest');
  let bytes = 0;
  const seen = new Set();
  // Read sequentially. The binary is about 96 MB; avoid parallel allocations.
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      (file.path !== 'deno' && !file.path.startsWith('cache/')) || seen.has(file.path)) throw Error('invalid_runtime_entry');
    seen.add(file.path);
    const location = path.join(runtime, file.path);
    if (!(await lstat(location)).isFile()) throw Error('invalid_runtime_file');
    const data = await readFile(location);
    if (data.length !== file.bytes || sha(data) !== file.sha256 ||
      (file.path === 'deno' && file.sha256 !== pins[target].binarySha256)) throw Error('runtime_hash_mismatch');
    bytes += data.length;
  }
  if (!seen.has('deno') || bytes !== manifest.bytes) throw Error('invalid_runtime_size');
  return { runtime, executable: path.join(runtime, 'deno'), bytes, files: seen.size, version: manifest.version };
}
