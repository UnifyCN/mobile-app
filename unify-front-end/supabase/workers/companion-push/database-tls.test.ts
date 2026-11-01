import assert from 'node:assert/strict';
import { connect } from './process.ts';
Deno.test('production connection pins the trusted CA and retains certificate verification', async () => {
  const db = connect('postgres://companion_push_worker:synthetic@db.invalid/postgres?sslmode=verify-full');
  try {
    const ssl = db.options.ssl as { ca?: string; rejectUnauthorized?: boolean };
    assert.equal(ssl.rejectUnauthorized, true);
    assert.ok(ssl.ca?.includes('BEGIN CERTIFICATE'));
  } finally { await db.end(); }
});
