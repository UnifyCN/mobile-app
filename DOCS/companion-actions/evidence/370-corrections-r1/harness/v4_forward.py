"""Loopback only: forwards 127.0.0.1:<port> to [::1]:<port> (Metro bound IPv6 loopback)."""
import asyncio, sys
PORT = int(sys.argv[1])
async def pipe(r, w):
    try:
        while (b := await r.read(65536)):
            w.write(b); await w.drain()
    finally:
        w.close()
async def handle(cr, cw):
    ur, uw = await asyncio.open_connection('::1', PORT)
    await asyncio.gather(pipe(cr, uw), pipe(ur, cw), return_exceptions=True)
async def main():
    s = await asyncio.start_server(handle, '127.0.0.1', PORT)
    async with s: await s.serve_forever()
asyncio.run(main())
