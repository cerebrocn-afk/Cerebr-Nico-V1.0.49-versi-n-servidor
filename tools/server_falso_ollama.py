#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server_falso_ollama.py — un doble de /api/chat para medir el MECANISMO.

No simula la velocidad real de un modelo: simula un server que hace EXACTAMENTE
el mismo trabajo en los dos modos (el mismo prefill, los mismos 40 tokens) y
solo cambia CUÁNDO envía los bytes. Eso es lo que hay que aislar para responder
si stream=True es 'más rápido': con cómputo idéntico, cualquier diferencia que
mida el banco es del modo de llamada y no del modelo.

    python3 tools/server_falso_ollama.py --puerto 11499
"""
import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKENS = ["def ", "fib", "(", "n", ")", ":", " ", "if", " n", " <", " ", "2", ":", " ", "return",
          " ", "n", ",", " ", "else", ":", " ", "return", " ", "fib", "(", "n", "-", "1", ")",
          " ", "+", " ", "fib", "(", "n", "-", "2", ")", " ", "'", "'"]
PREFILL_S = 0.30   # el server 'piensa' 300 ms antes del primer token
TOKEN_S = 0.02     # y 20 ms por token -> 40 tokens = 0.80 s de generación


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        cuerpo = json.loads(self.rfile.read(n) or b"{}") if n else {}
        ruta = self.path.split("?")[0]
        if ruta != "/api/chat":
            self.send_error(404, "solo /api/chat")
            return
        stream = bool(cuerpo.get("stream"))
        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()
            time.sleep(PREFILL_S)
            for tk in TOKENS:
                linea = json.dumps({"model": cuerpo.get("model", "fake"),
                                    "created_at": "2026-10-15T00:00:00Z",
                                    "message": {"role": "assistant", "content": tk},
                                    "done": False}) + "\n"
                self.wfile.write(linea.encode())
                self.wfile.flush()
                time.sleep(TOKEN_S)
            fin = json.dumps({"model": "fake", "created_at": "2026-10-15T00:00:00Z",
                              "message": {"role": "assistant", "content": ""},
                              "done": True, "done_reason": "stop",
                              "eval_count": len(TOKENS),
                              "prompt_eval_count": 12}) + "\n"
            self.wfile.write(fin.encode())
            self.wfile.flush()
        else:
            time.sleep(PREFILL_S + TOKEN_S * len(TOKENS))  # el MISMO trabajo total
            bola = json.dumps({"model": cuerpo.get("model", "fake"),
                               "created_at": "2026-10-15T00:00:00Z",
                               "message": {"role": "assistant",
                                           "content": "".join(TOKENS)},
                               "done": True, "done_reason": "stop",
                               "eval_count": len(TOKENS),
                               "prompt_eval_count": 12}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(bola)))
            self.end_headers()
            self.wfile.write(bola)
            self.wfile.flush()

    def do_GET(self):
        bola = json.dumps({"models": []}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(bola)))
        self.end_headers()
        self.wfile.write(bola)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--puerto", type=int, default=11499)
    a = p.parse_args()
    print(f"doble de Ollama escuchando en 127.0.0.1:{a.puerto} "
          f"(prefill {PREFILL_S}s, {len(TOKENS)} tokens de {TOKEN_S}s)")
    ThreadingHTTPServer(("127.0.0.1", a.puerto), Handler).serve_forever()
