#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mcp_puente_test.py — Regresión E2E del cliente MCP del puente (v1.16.1).

QUÉ COMPRUEBA (de fuera hacia dentro, como lo haría server.ts):
  1. scripts/mcp_fetch.py habla MCP/stdio: initialize, tools/list y tools/call.
  2. El puente (agent_bridge_5000.py) expone el pack externo:
       GET  /tools            → web_fetch_url / web_extraer_enlaces / web_buscar_web / web_descargar_archivo con schema
       POST /tools/call       → ejecuta, y SIN TOKEN es 401 (la puerta sigue Closed)
       GET  /api/mcp/estado   → el servidor «web» está vivo y aporta sus 4 tools
       POST /api/mcp/sincronizar → relee mcp_servers.json
  2b. CONFIRMACIÓN previa (v1.1.0): buscar_web (investigar) y descargar_archivo
      (descargar) sin `confirmar:true` devuelven REQUIERE_CONFIRMACION — no salen
      a la red sin orden explícita del usuario.
  3. Guarda SSRF real a través del puente: pedirle al MCP que baje
     http://127.0.0.1:… debe salir ok:false con motivo (el puente no puede
     usarse de palanca hacia localhost).
  4. Herramienta inexistente → ok:false con motivo, no un 500 mudo.
  5. (Si hay red) fetch_url de una página pública devuelve texto real.

100% stdlib. Cómo ejecutarlo:
    python3 tests/mcp_puente_test.py
    npm run test:mcp
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "agent_bridge_5000.py")
SERVER_SCRIPT = os.path.join(ROOT, "scripts", "mcp_fetch.py")
TOKEN = "token-de-prueba-mcp"
FALLOS = []
PASOS = 0


def comprobar(nombre, cond, detalle=""):
    global PASOS
    PASOS += 1
    if cond:
        print("  ✓ %s" % nombre)
    else:
        FALLOS.append("%s — %s" % (nombre, detalle))
        print("  ✗ %s %s" % (nombre, ("(%s)" % detalle) if detalle else ""))


def http(port, ruta, body=None, token=None, limite=40):
    url = "http://127.0.0.1:%d%s" % (port, ruta)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Cerebro-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=limite) as r:
            return r.status, json.loads(r.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        # Los códigos 4xx/5xx SON resultados que el test debe poder mirar
        cuerpo = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(cuerpo or "{}")
        except Exception:
            return e.code, {"raw": cuerpo[:200]}


def puerto_libre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ============================================================
# 1 — El servidor MCP por sí solo (sin puente)
# ============================================================

def test_servidor_stdio():
    print("\n1) scripts/mcp_fetch.py — protocolo MCP/stdio")
    msgs = "\n".join([
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "test", "version": "0"}}}),
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}),
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
        json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
            "name": "fetch_url", "arguments": {"url": "http://127.0.0.1:1/"}}}),
        json.dumps({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {
            "name": "buscar_web", "arguments": {"consulta": "cerebronico"}}}),
        json.dumps({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {
            "name": "descargar_archivo", "arguments": {"url": "https://example.com/x.txt"}}}),
    ]) + "\n"
    p = subprocess.run([sys.executable, SERVER_SCRIPT, "--stdio"], input=msgs.encode("utf-8"),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40, cwd=ROOT)
    lineas = [json.loads(l) for l in p.stdout.decode("utf-8", "replace").splitlines() if l.strip()]
    por_id = {m.get("id"): m for m in lineas}
    init = (por_id.get(1) or {}).get("result") or {}
    comprobar("initialize devuelve serverInfo y protocolo", init.get("protocolVersion") == "2024-11-05"
              and (init.get("serverInfo") or {}).get("name") == "cerebronico-web", json.dumps(init)[:120])
    tools = ((por_id.get(2) or {}).get("result") or {}).get("tools") or []
    nombres = [t.get("name") for t in tools]
    comprobar("tools/list trae fetch_url y extraer_enlaces",
              "fetch_url" in nombres and "extraer_enlaces" in nombres, str(nombres))
    comprobar("tools/list evoluciona: buscar_web (investigar) y descargar_archivo (descargar)",
              "buscar_web" in nombres and "descargar_archivo" in nombres, str(nombres))
    esperado = {"fetch_url": "url", "extraer_enlaces": "url", "buscar_web": "consulta", "descargar_archivo": "url"}
    schemas_ok = all(
        isinstance(t.get("inputSchema"), dict)
        and esperado.get(t.get("name"), "") in ((t.get("inputSchema") or {}).get("required") or [])
        for t in tools
    )
    comprobar("cada herramienta trae inputSchema con su parametro obligatorio", schemas_ok, str(nombres))
    r3 = ((por_id.get(3) or {}).get("result") or {})
    texto = ((r3.get("content") or [{}])[0]).get("text", "")
    comprobar("guarda SSRF local: 127.0.0.1 rechazada", r3.get("isError") is True and "bloqueada" in texto, texto[:120])
    # v1.1.0 — investigar/descargar exigen ORDEN del usuario: sin confirmar, no salen a la red.
    r4 = ((por_id.get(4) or {}).get("result") or {})
    t4 = ((r4.get("content") or [{}])[0]).get("text", "")
    comprobar("buscar_web SIN confirmar → REQUIERE_CONFIRMACION (no investiga sin orden)",
              r4.get("isError") is True and "REQUIERE_CONFIRMACION" in t4, t4[:140])
    r5 = ((por_id.get(5) or {}).get("result") or {})
    t5 = ((r5.get("content") or [{}])[0]).get("text", "")
    comprobar("descargar_archivo SIN confirmar → REQUIERE_CONFIRMACION (no descarga sin orden)",
              r5.get("isError") is True and "REQUIERE_CONFIRMACION" in t5, t5[:140])


# ============================================================
# 2-4 — El puente registrando, exponiendo y ejecutando
# ============================================================

def test_puente(port):
    print("\n2) Puente :%d — endpoints de pack externo MCP" % port)
    st, salud = http(port, "/health")
    comprobar("el puente arrancó (/health)", st == 200 and salud.get("status") == "online")

    st, mani = http(port, "/tools")
    nombres = [t.get("name") for t in (mani.get("tools") or [])]
    comprobar("GET /tools expone web_fetch_url y web_extraer_enlaces",
              st == 200 and "web_fetch_url" in nombres and "web_extraer_enlaces" in nombres, str(nombres))
    comprobar("GET /tools expone las nuevas web_buscar_web y web_descargar_archivo",
              "web_buscar_web" in nombres and "web_descargar_archivo" in nombres, str(nombres))
    fetch = next((t for t in mani.get("tools") or [] if t.get("name") == "web_fetch_url"), {})
    comprobar("el contrato del pack es el que lee registerExternalPack (parameters/required)",
              (fetch.get("parameters") or {}).get("properties", {}).get("url") is not None
              and "url" in ((fetch.get("parameters") or {}).get("required") or []),
              json.dumps(fetch.get("parameters"))[:140])

    st, _ = http(port, "/tools/call", {"name": "web_fetch_url", "arguments": {"url": "https://example.com"}})
    comprobar("POST /tools/call SIN token es 401 (la puerta sigue cerrada)", st == 401, "status=%s" % st)

    st, res = http(port, "/tools/call",
                   {"name": "web_fetch_url", "arguments": {"url": "http://127.0.0.1:%d/health" % port}}, token=TOKEN)
    # El puente devuelve ok:false Y el motivo SSRF legible en el texto.
    # (El SDK 2.x antepone «Error executing tool …: » al payload: se comprueba
    # la semántica —rechazo bloqueado con motivo—, no la frase exacta del SDK.)
    texto_res = res.get("texto") or ""
    ok_ok = (res.get("ok") is False and "bloqueada" in texto_res and '"motivo"' in texto_res)
    comprobar("SSRF a través del puente: /tools/call no deja tocar localhost", ok_ok, json.dumps(res)[:160])

    st, res = http(port, "/tools/call", {"name": "no_existe_fulanita", "arguments": {}}, token=TOKEN)
    comprobar("herramienta inexistente → ok:false con motivo (nunca 500 mudo)",
              st == 200 and res.get("ok") is False and "ningún servidor MCP" in (res.get("error") or ""),
              json.dumps(res)[:140])

    st, res = http(port, "/tools/call",
                   {"name": "web_buscar_web", "arguments": {"consulta": "cerebronico"}}, token=TOKEN)
    comprobar("investigar por el puente sin confirmar → ok:false REQUIERE_CONFIRMACION",
              st == 200 and res.get("ok") is False and "REQUIERE_CONFIRMACION" in (res.get("texto") or ""),
              json.dumps(res)[:160])

    st, estado = http(port, "/api/mcp/estado")
    srv = next((s for s in (estado.get("servidores") or []) if s.get("id") == "web"), {})
    comprobar("GET /api/mcp/estado: servidor «web» vivo con 4 herramientas",
              st == 200 and srv.get("vivo") is True and len(srv.get("herramientas") or []) == 4,
              json.dumps(srv)[:180])

    st, sync = http(port, "/api/mcp/sincronizar", {}, token=TOKEN)
    comprobar("POST /api/mcp/sincronizar relee la config y responde ok",
              st == 200 and sync.get("ok") is True and "web" in (sync.get("servidores") or {}),
              json.dumps(sync)[:140])


def test_red_viva(port):
    """La prueba de verdad: descargar una página pública DESDE el puente.
    Sin red no falla: se declara saltada (cero mentiras, cero falsos rojos)."""
    print("\n3) Fetch real de una página pública vía puente")
    try:
        st, res = http(port, "/tools/call",
                       {"name": "web_fetch_url", "arguments": {"url": "https://example.com", "max_chars": 500}},
                       token=TOKEN, limite=30)
    except Exception as e:
        print("  ○ SALTADA — sin salida a internet en este entorno (%s)" % e)
        return
    texto = res.get("texto") or ""
    try:
        interior = json.loads(texto)
    except Exception:
        interior = {}
    comprobar("fetch_url real: ok, status 200 y texto de la página",
              res.get("ok") is True and interior.get("status") == 200
              and "example" in (interior.get("content") or "").lower(),
              texto[:160])


# ============================================================
# ARRANQUE
# ============================================================

def main():
    if not os.path.exists(BRIDGE) or not os.path.exists(SERVER_SCRIPT):
        print("FALTA material: se ejecuta desde la raíz del proyecto")
        return 2
    test_servidor_stdio()
    port = puerto_libre()
    env = {**os.environ, "PORT": str(port), "HOST": "127.0.0.1", "ACCESS_TOKEN": TOKEN}
    proc = subprocess.Popen([sys.executable, BRIDGE], env=env, cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                http(port, "/health", limite=2)
                break
            except Exception:
                time.sleep(0.25)
        else:
            comprobar("el puente arrancó", False, "timeout esperando /health en :%d" % port)
            return 1
        test_puente(port)
        test_red_viva(port)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    print("\n" + "=" * 56)
    if FALLOS:
        print("VEREDICTO: FALLO — %d de %d comprobaciones" % (len(FALLOS), PASOS))
        for f in FALLOS:
            print("  ✗", f)
        return 1
    print("VEREDICTO: TODO CORRECTO — %d comprobaciones MCP, 0 fallos" % PASOS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
