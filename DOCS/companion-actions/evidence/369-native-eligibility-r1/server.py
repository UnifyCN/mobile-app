"""Owned content and telemetry sink. No model or provider request exists."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import socket

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"result":null}' if self.path.startswith('/content') else b'{"native369":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.do_GET()

    def log_message(self, *args):
        pass

class DualStack(ThreadingHTTPServer):
    address_family = socket.AF_INET6

server = DualStack(('::', 3396), Handler)
print('Owned local content server ready on 3396.', flush=True)
server.serve_forever()
