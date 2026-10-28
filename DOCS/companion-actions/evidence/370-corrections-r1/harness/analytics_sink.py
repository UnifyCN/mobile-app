"""Loopback-only analytics sink: answers 200 to every request, keeps only a request count
(no bodies), so the app's PostHog client stays quiet and nothing leaves the machine."""
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
count = 0
class H(BaseHTTPRequestHandler):
    def _ok(self):
        global count
        count += 1
        n = int(self.headers.get('content-length') or 0)
        if n: self.rfile.read(n)
        body = b'{"status":1}'
        self.send_response(200); self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)
        print('requests', count, self.path.split('?')[0], flush=True)
    do_GET = do_POST = _ok
    def log_message(self, *a): pass
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
