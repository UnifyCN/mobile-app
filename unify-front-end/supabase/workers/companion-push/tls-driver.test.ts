import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import postgres from 'npm:postgres@3.4.9';
import { connect } from './process.ts';

Deno.test('real driver TLS accepts a trusted certificate and rejects untrusted certificates and wrong hostnames', async () => {
  assert.equal(Deno.env.get('COMPANION_PUSH_SQL_TEST_LEASE'), 'unify-companion-push-vercel-r2');
  const directory = new URL('../../probes/compose-push-native-release-r3/tls/', import.meta.url);
  const cert = readFileSync(new URL('cert.pem', directory), 'utf8');
  const context = tls.createSecureContext({ cert, key: readFileSync(new URL('key.pem', directory)) });
  const sockets = new Set<net.Socket>();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('data', request => {
      assert.equal(request.toString('hex'), '0000000804d2162f');
      socket.write('S');
      const secured = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
      sockets.add(secured);
      secured.on('error', () => {});
      let started = false;
      secured.on('data', () => {
        if (started) {
          secured.write(Buffer.from('430000000d53454c4543542030005a0000000549', 'hex'));
          return;
        }
        started = true;
        // AuthenticationOk and ReadyForQuery. No query or provider executes.
        secured.write(Buffer.from('5200000008000000005a0000000549', 'hex'));
      });
    });
  });
  await new Promise<void>(resolve => server.listen(63624, '127.0.0.1', resolve));
  const pinned = connect('postgres://synthetic:synthetic@127.0.0.1:63624/postgres?sslmode=verify-full');
  const options = pinned.options.ssl as { ca: string; rejectUnauthorized: true };
  const fixture = (servername: string) => postgres('postgres://synthetic:synthetic@127.0.0.1:63624/postgres', {
    ssl: { ...options, ca: cert, servername }, max: 1, fetch_types: false, connect_timeout: 2,
  });
  const valid = fixture('localhost'), wrongHost = fixture('wrong.invalid');
  try {
    await valid.unsafe('select 1').simple();
    await assert.rejects(pinned.unsafe('select 1').simple(), /certificate|issuer|self.signed/i);
    await assert.rejects(wrongHost.unsafe('select 1').simple(), /hostname|altname|certificate/i);
    console.log('PASS: trusted fixture certificate accepted; pinned production CA rejects fixture; wrong hostname rejected');
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all([pinned.end({ timeout: 0.1 }), valid.end({ timeout: 0.1 }), wrongHost.end({ timeout: 0.1 })]);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
