"""Servidor SOLO PARA TESTS: (1) /auth/v1/user como GoTrue, (2) proxy /rest/v1 hacia PostgREST real,
(3) un 'Groq' falso con streaming lento. Las Edge Functions bajo prueba son las reales."""
import json, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import requests

PGRST = 'http://127.0.0.1:54322'
USERS = {'token-ana': ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
         'token-owner': ('22222222-2222-2222-2222-222222222222', 'owner@example.com'),
         'token-bob': ('33333333-3333-3333-3333-333333333333', 'bob@example.com')}
STATE = {'groq_requests': [], 'groq_aborted': 0, 'groq_completed': 0}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _body(self): n = int(self.headers.get('content-length') or 0); return self.rfile.read(n) if n else b''
    def _send(self, code, body=b'', headers=None):
        self.send_response(code)
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def handle_any(self):
        p = self.path
        if p.startswith('/auth/v1/user'):
            tok = (self.headers.get('authorization') or '').replace('Bearer ', '')
            if tok in USERS:
                uid, email = USERS[tok]
                return self._send(200, json.dumps({'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': email, 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}).encode(), {'content-type': 'application/json'})
            return self._send(401, b'{"msg":"invalid"}', {'content-type': 'application/json'})
        if p == '/__state': return self._send(200, json.dumps(STATE).encode(), {'content-type': 'application/json'})
        if p.startswith('/rest/v1'):
            hdr = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'content-length', 'connection', 'accept-encoding')}
            r = requests.request(self.command, PGRST + p[len('/rest/v1'):], headers=hdr, data=self._body())
            out = {k: v for k, v in r.headers.items() if k.lower() in ('content-type', 'content-range')}
            return self._send(r.status_code, r.content, out)
        if p.startswith('/openai/v1/chat/completions'): return self.groq()
        self._send(404, b'{}')
    do_GET = do_POST = do_PATCH = do_DELETE = do_HEAD = do_PUT = handle_any

    def groq(self):
        body = json.loads(self._body()); STATE['groq_requests'].append(body)
        last = body['messages'][-1]['content']; last = last if isinstance(last, str) else json.dumps(last)
        if 'RATELIMIT' in last: return self._send(429, b'{"error":"rl"}', {'content-type': 'application/json'})
        slow = 'SLOW' in last
        n, delay = (60, 0.15) if slow else (5, 0.04)
        self.send_response(200); self.send_header('content-type', 'text/event-stream'); self.end_headers()
        try:
            for i in range(n):
                self.wfile.write(f'data: {json.dumps({"choices": [{"delta": {"content": f"p{i} "}}]})}\n\n'.encode()); self.wfile.flush(); time.sleep(delay)
            self.wfile.write(f'data: {json.dumps({"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 11, "completion_tokens": n}})}\n\ndata: [DONE]\n\n'.encode()); self.wfile.flush()
            STATE['groq_completed'] += 1
        except (BrokenPipeError, ConnectionResetError): STATE['groq_aborted'] += 1

ThreadingHTTPServer(('127.0.0.1', 54321), H).serve_forever()
