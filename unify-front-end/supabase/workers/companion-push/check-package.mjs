import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { verifyRuntimePackage } from './runtime-package.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
for (const target of ['linux-x64', `${process.platform}-${process.arch}`]) {
  const info = await verifyRuntimePackage(root, target);
  console.log(JSON.stringify({ target, bytes: info.bytes, files: info.files, version: info.version }));
}
const manifest = new URL('./.runtime/linux-x64/manifest.json', import.meta.url);
const original = await readFile(manifest);
try {
  const changed = JSON.parse(original);
  changed.files.find((file) => file.path === 'deno').sha256 = '0'.repeat(64);
  await writeFile(manifest, JSON.stringify(changed));
  await assert.rejects(verifyRuntimePackage(root, 'linux-x64'), /runtime_hash_mismatch/);
  console.log('PASS: a corrupt binary manifest is rejected');
  changed.files[0].path = '../outside';
  await writeFile(manifest, JSON.stringify(changed));
  await assert.rejects(verifyRuntimePackage(root, 'linux-x64'), /invalid_runtime_entry/);
  console.log('PASS: a manifest path outside the package is rejected');
} finally {
  await writeFile(manifest, original);
}
await verifyRuntimePackage(root, 'linux-x64');
