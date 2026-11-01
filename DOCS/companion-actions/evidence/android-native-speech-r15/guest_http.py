"""Read one actual guest HTTP response before closing request input."""
import http.client
import io
import os
import select
import subprocess
import time


class ResponseSocket:
    def __init__(self, data):
        self.data = data

    def makefile(self, *args, **kwargs):
        return io.BytesIO(self.data)


def get(adb_prefix, port, path='/', timeout=12):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid port')
    if not path.startswith('/') or '\r' in path or '\n' in path:
        raise ValueError('Invalid request path')
    payload = ('GET ' + path + ' HTTP/1.0\r\nHost: owned\r\nConnection: close\r\n\r\n').encode()
    args = list(adb_prefix) + ['shell', '-T', f'toybox nc -W 5 -w 5 127.0.0.1 {port}']
    started = time.monotonic()
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        p.stdin.write(payload)
        p.stdin.flush()
        chunks = []
        deadline = started + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('No complete guest HTTP response')
            ready, _, _ = select.select([p.stdout], [], [], remaining)
            if not ready:
                raise TimeoutError('No guest HTTP response before the deadline')
            chunk = os.read(p.stdout.fileno(), 65536)
            if not chunk:
                break
            chunks.append(chunk)
        raw = b''.join(chunks)
        p.stdin.close()
        code = p.wait(timeout=5)
        stderr = p.stderr.read()
        if code:
            raise RuntimeError(f'Guest HTTP command exited {code}')
        response = http.client.HTTPResponse(ResponseSocket(raw))
        response.begin()
        body = response.read()
        return {'command': args, 'exit': code, 'status': response.status,
                'headers': dict(response.getheaders()), 'body': body,
                'raw': raw, 'stderr': stderr, 'seconds': time.monotonic() - started,
                'request_input_held_until_response_eof': True}
    finally:
        if p.poll() is None:
            p.kill()
            p.wait()
