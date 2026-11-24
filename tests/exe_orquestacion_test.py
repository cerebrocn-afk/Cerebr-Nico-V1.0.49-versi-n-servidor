#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueba de ORQUESTACIÓN DEL EXE (v3.7 "EXE INTEGRAL").

Garantiza que el empaquetado .exe (electron-main.cjs) gestiona de forma
integrada los 6 puertos del sistema — 3000, 3500, 5000, 5100, 5102, 11434 —
y, en concreto, que cierra el hueco histórico: la instalación SIN el BAT
ahora también arranca los daemons opcionales :5100 (memoria) y :5102 (creador),
que antes solo encendía iniciar_todo_windows.bat.

Se ejecuta con:  npm run test:exe   (o  python3 tests/exe_orquestacion_test.py)
No necesita node_modules ni internet. Los daemons son 100 % stdlib, así que
se pueden arrancar de verdad y sondear su /health.
"""
import os
import re
import sys
import time
import shutil
import subprocess
import tempfile
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fallos = 0


def ok(desc, cond, detalle=""):
    global fallos
    if cond:
        print(f"  \u2713 {desc}")
    else:
        fallos += 1
        print(f"  \u2717 {desc}" + (f"  \u2192 {detalle}" if detalle else ""))


def leer(rel):
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


print("\n1) electron-main.cjs \u2014 mapa can\u00f3nico de los 6 puertos")
main = leer("electron-main.cjs")
for p in ("3000", "3500", "5000", "5100", "5102", "11434"):
    ok(f"el mapa SERVICIOS declara el puerto {p}",
       re.search(r"puerto:\s*" + p + r"\b", main) is not None, p)
ok("existe el mapa SERVICIOS (una sola fuente de verdad de puertos)",
   "const SERVICIOS" in main)
ok(":5000 est\u00e1 marcado como 'lo arranca el server'",
   "loArrancaElServer" in main)
ok(":3500 (sandbox) est\u00e1 marcado 'bajoDemanda'",
   "bajoDemanda" in main)

print("\n2) electron-main.cjs \u2014 arranque de los daemons opcionales en el EXE")
ok("existe arrancarDaemonsPython (cierra el hueco del BAT)",
   "async function arrancarDaemonsPython" in main)
ok("arranca la memoria h\u00edbrida (hindsight_daemon.py :5100)",
   "hindsight_daemon.py" in main and "CN_MEMORY_PORT" in main)
ok("arranca el creador de sitios (creador_daemon.py :5102)",
   "creador_daemon.py" in main and "CN_CREATOR_PORT" in main)
ok("no duplica un daemon si el puerto ya escucha (isPortUp previo)",
   "isPortUp(t.puerto)" in main)
ok("usa el Python embebido cuando existe (pythonEmbebido)",
   "pythonEmbebido()" in main)
ok("al salir mata los daemons que arranc\u00f3 este exe (before-quit)",
   "for (const d of daemonsPython)" in main)
ok("existe el sondeo de salud de los 6 puertos (estadoServicios)",
   "async function estadoServicios" in main)

print("\n3) electron-main.cjs \u2014 sintaxis (node --check)")
node = shutil.which("node")
if node:
    r = subprocess.run([node, "--check", os.path.join(RAIZ, "electron-main.cjs")],
                       capture_output=True, text=True)
    ok("node --check pasa sin errores", r.returncode == 0, r.stderr.strip()[:200])
else:
    print("  \u25cb node no disponible aqu\u00ed: se omite node --check (se valida en Windows al empaquetar)")

print("\n4) package.json \u2014 configuraci\u00f3n de empaquetado coherente")
pkg = leer("package.json")
ok("main apunta a electron-main.cjs", '"main": "electron-main.cjs"' in pkg)
ok("electron-builder empaqueta los daemons Python",
   "hindsight_daemon.py" in pkg and "creador_daemon.py" in pkg and "agent_bridge_5000.py" in pkg)
ok("asar:false (rutas reales para el fork del server)", '"asar": false' in pkg)
ok("script dist con electron-builder", '"dist"' in pkg and "electron-builder" in pkg)

print("\n5) Daemons opcionales \u2014 arranque real y /health (100 % stdlib)")


def probar_daemon(script, puerto, env_extra):
    env = dict(os.environ)
    env.update(env_extra)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.Popen(
        [sys.executable, os.path.join("scripts", script), "--port", str(puerto)],
        cwd=RAIZ, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        estado = None
        for _ in range(30):
            time.sleep(0.3)
            try:
                estado = urllib.request.urlopen(
                    f"http://127.0.0.1:{puerto}/health", timeout=2).status
                break
            except Exception:
                pass
        ok(f"{script} arranca y responde /health 200 en :{puerto}", estado == 200,
           f"estado={estado}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


tmp = tempfile.mkdtemp(prefix="cn_exe_test_")
try:
    probar_daemon("hindsight_daemon.py", 5100,
                  {"CN_MEMORY_PORT": "5100",
                   "CN_HINDSITE_MIRROR": os.path.join(tmp, "hm.json")})
    probar_daemon("creador_daemon.py", 5102,
                  {"CN_CREATOR_PORT": "5102", "CN_CREADOR_PORT": "5102",
                   "CN_CREADOR_ROOT": os.path.join(tmp, ".creador")})
finally:
    shutil.rmtree(tmp, ignore_errors=True)
    for c in (os.path.join(RAIZ, "__pycache__"), os.path.join(RAIZ, "scripts", "__pycache__")):
        shutil.rmtree(c, ignore_errors=True)

print("\n" + "=" * 56)
if fallos == 0:
    print("VEREDICTO: TODO CORRECTO \u2014 orquestaci\u00f3n de los 6 puertos, 0 fallos")
    sys.exit(0)
print(f"VEREDICTO: {fallos} FALLO(S) en la orquestaci\u00f3n del EXE")
sys.exit(1)
