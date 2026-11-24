#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
autonomia_test.py — Regresión de las piezas de autonomía (v1.16.2).

Cubre con EJECUCIÓN REAL (no lectura de código) las tres piezas del plan:
  1. autonomia.py puertos ..... ocupado→informado; zombie propio→matado y
     VERIFICADO; dueño fuera de lista blanca→intocable; --json coherente.
  2. autonomia.py deps ........ informe sin instalar nada (cero efectos);
     puente stdlib declarado OK siempre; requirements sin --auto no toca pip.
  3. vigilante_autonomo.py .... relanza un servicio caído (health real HTTP),
     detecta SyntaxError en el log y BLOQUEA en vez de reintentar a lo tonto,
     y agota el límite de reinicios por ventana con aviso.
  4. analizar_autonomia.py .... 100% sobre este proyecto; detecta un zip
     amputado (sin watchdog) y lo declara con motivo.
  5. cables ........... el .bat encadena puertos→deps; package.json expone los npm scripts.

python3 tests/autonomia_test.py     (o: npm run test:autonomia)
"""

import http.server
import json
import os
import subprocess
import sys
import threading
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import autonomia  # noqa: E402  (el módulo está en la raíz del proyecto)
import vigilante_autonomo as vig  # noqa: E402

FALLOS = []
PASOS = 0


def comprobar(nombre, cond, detalle=""):
    global PASOS
    PASOS += 1
    if cond:
        print("  ✓ %s" % nombre)
    else:
        FALLOS.append("%s — %s" % (nombre, detalle))
        print("  ✗ %s  %s" % (nombre, ("(%s)" % detalle) if detalle else ""))


def _dummy_ahogado(port):
    """Proceso HIJO que secuestra un puerto: matable como zombie de verdad
    (un thread del propio test compartiría PID y la guarda «no te mates a ti
    mismo» lo protegería con razón)."""
    return subprocess.Popen([sys.executable, "-c",
                             "import http.server;"
                             "h=type('H',(http.server.BaseHTTPRequestHandler,),"
                             "{'do_GET':lambda s:(s.send_response(200),s.end_headers()),'log_message':lambda s,*a:None});"
                             "http.server.ThreadingHTTPServer(('127.0.0.1',%d),h).serve_forever()" % port],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Argumentos:
    """bypass argparse: objetos de argumentos mínimos para llamar cmd_* directo."""

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def puerto_de_prueba():
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ============================================================
# 1 — puertos
# ============================================================

def _correr_cmd_puertos(**kw):
    """cmd_puertos imprime: capturamos su stdout para leer el --json."""
    import contextlib
    import io
    buf = io.StringIO()
    args = Argumentos(matar=False, incluir_ollama=False, solo=None, json=True)
    for k, v in kw.items():
        setattr(args, k, v)
    with contextlib.redirect_stdout(buf):
        rc = autonomia.cmd_puertos(args)
    return rc, json.loads(buf.getvalue())


def test_puertos():
    print("\n1) autonomia.py puertos — autodiagnóstico y saneo")
    port = puerto_de_prueba()
    originales = dict(autonomia.PUERTOS_PROPIOS)
    servidor = _dummy_ahogado(port)
    time.sleep(1.2)
    try:
        # el informe mira SOLO nuestro puerto de prueba (no se secauestra con 3000/5000 reales)
        autonomia.PUERTOS_PROPIOS = {port: "Sandbox del proyecto"}
        rc, mani = _correr_cmd_puertos()
        entrada = mani["puertos"].get(str(port), {})
        dueños = entrada.get("duenos") or []
        comprobar("detecta el puerto OCUPADO y su dueño real (pid+nombre)",
                  entrada.get("ocupado") is True and dueños and dueños[0].get("pid"),
                  json.dumps(entrada)[:140])
        comprobar("lista blanca: un proceso python SÍ es candidato propio",
                  bool(dueños) and autonomia._nombre_permitido(dueños[0]["nombre"]), str(dueños))
        comprobar("lista blanca: 'postgres' NO es candidato (se informa, no se mata)",
                  not autonomia._nombre_permitido("postgres.exe") and not autonomia._nombre_permitido("postgres"))
        # el informe sin --matar declara el puerto como cosa a corregir
        comprobar("sin --matar, puerto ocupado propio queda en «faltan» (exit 1)",
                  port in mani.get("faltan", []) or str(port) in [str(x) for x in mani.get("faltan", [])])
        # saneo real: el dummy es hijo de este proceso y «python» está en la lista
        rc2, mani2 = _correr_cmd_puertos(matar=True)
        e2 = mani2["puertos"].get(str(port), {})
        accion = (e2.get("accion") or [{}])[0]
        comprobar("--matar ELIMINA el zombie propio y lo VERIFICA (ya no escucha)",
                  e2.get("ocupado") is False and accion.get("muerto") is True,
                  json.dumps(e2)[:160])
    finally:
        try:
            servidor.terminate()
            servidor.wait(timeout=5)
        except Exception:
            servidor.kill()
        autonomia.PUERTOS_PROPIOS = originales
    # humo de CLI real (subprocess): JSON parseable y salida coherente
    out = subprocess.run([sys.executable, os.path.join(ROOT, "autonomia.py"), "puertos", "--json"],
                         capture_output=True, timeout=60)
    try:
        mani3 = json.loads(out.stdout.decode("utf-8"))
        comprobar("CLI real responde JSON con sus 3 puertos propios + motor",
                  len(mani3.get("puertos", {})) == 3 and "motor" in mani3)
    except Exception as e:
        comprobar("CLI real responde JSON", False, str(e))


# ============================================================
# 2 — deps (informe, cero efectos)
# ============================================================

def test_deps():
    print("\n2) autonomia.py deps — informe sin instalar nada")
    antes = set(os.listdir(ROOT))
    out = subprocess.run([sys.executable, os.path.join(ROOT, "autonomia.py"), "deps", "--json"],
                         capture_output=True, timeout=120)
    r = json.loads(out.stdout.decode("utf-8"))
    comprobar("declara que el puente no necesita paquetes (stdlib)", "stdlib" in (r.get("puente_stdlib") or ""))
    comprobar("sin --auto NO instala: no creó .autonomia-deps ni tocó la raíz",
              ".autonomia-deps" not in (set(os.listdir(ROOT)) - antes))
    reqs = autonomia._leer_requirements()
    # v1.57.13 · ARRANQUE HONESTO: la raíz ya no anuncia requisitos de otra era.
    comprobar("requirements.txt de raíz pide CERO paquetes al arranque normal",
              reqs == [], str(reqs))
    comprobar("sin requisitos, no hay faltantes que asusten al arranque",
              r.get("faltantes") == [], json.dumps(r)[:120])
    comprobar("los legacy conservan sus requisitos JUNTO a su componente",
              os.path.exists(os.path.join(ROOT, "app", "requirements.txt"))
              and os.path.exists(os.path.join(ROOT, "core-agent", "requirements.txt")))
    txt_app = open(os.path.join(ROOT, "app", "requirements.txt"), encoding="utf-8").read()
    comprobar("el puente FastAPI legacy declara fastapi en su propia carpeta",
              "fastapi==" in txt_app, txt_app[:80])
    out_txt = subprocess.run([sys.executable, os.path.join(ROOT, "autonomia.py"), "deps"],
                             capture_output=True, timeout=120).stdout.decode("utf-8", "replace")
    comprobar("el informe de texto dice la verdad en una línea (cero pip pedido)",
              "no pide nada a pip" in out_txt and "faltan" not in out_txt, out_txt[:160])


# ============================================================
# 3 — vigilante
# ============================================================

def test_vigilante():
    print("\n3) vigilante_autonomo.py — reanimar, bloquear y no patinar")
    port = puerto_de_prueba()
    svc = {"id": "prueba", "etiqueta": "servicio falso", "health": "http://127.0.0.1:%d/health" % port,
           "comando": [sys.executable, "-c",
                       "import http.server,threading;h=type('H',(http.server.BaseHTTPRequestHandler,),{'do_GET':lambda s:(s.send_response(200),s.end_headers(),s.wfile.write(b'ok')),'log_message':lambda s,*a:None});"
                       "srv=http.server.ThreadingHTTPServer(('127.0.0.1',%d),h);srv.serve_forever()" % port],
           "cwd": ROOT, "arranque_s": 1.2}
    v = vig.Vigilante([svc], limite=2, ventana_s=3600)
    try:
        acc = v.revisar()
        comprobar("servicio caído → relanza y verifica health",
                  acc and acc[0]["accion"] == "reinicio" and acc[0]["ok"] is True, json.dumps(acc)[:150])
        # tumbar a mano: matar al dueño del puerto (lo lanzó el vigilante)
        dueños = autonomia.duenos(port)
        for d in dueños:
            autonomia._matar_pid(d["pid"], d["nombre"], port)
        acc2 = v.revisar()
        comprobar("segunda caída → segundo reinicio dentro del límite",
                  acc2 and acc2[0]["accion"] == "reinicio" and acc2[0]["ok"] is True, json.dumps(acc2)[:150])
        # agotar el límite (limite=2): tercera caída sin cura → bloqueado, no bucle infinito
        dueños = autonomia.duenos(port)
        for d in dueños:
            autonomia._matar_pid(d["pid"], d["nombre"], port)
        v.historial["prueba"] = [time.time(), time.time()]  # ventana llena a propósito
        acc3 = v.revisar()
        comprobar("límite de reinicios agotado → BLOQUEADO con motivo (no silencio, no bucle)",
                  acc3 and acc3[0]["accion"] == "bloqueado" and "límite" in (acc3[0].get("motivo") or ""),
                  json.dumps(acc3)[:150])
        # SyntaxError: el vigilante NO reinicia sobre código roto
        svc2 = {"id": "roto", "etiqueta": "sintaxis rota", "health": "http://127.0.0.1:%d/health" % puerto_de_prueba(),
                "comando": [sys.executable, "-c", "import this; raise SyntaxError('falso positivo no: código roto de verdad')"],
                "cwd": ROOT, "arranque_s": 1.0}
        os.makedirs(vig.LOG_DIR, exist_ok=True)
        v2 = vig.Vigilante([svc2], limite=5)
        v2.revisar()          # primer intento: lanza, muere, log con SyntaxError
        acc4 = v2.revisar()   # segunda pasada: ve el SyntaxError del log → bloquea
        comprobar("SyntaxError en el log → servicio BLOQUEADO con la ruta del log en el motivo",
                  acc4 and acc4[0]["accion"] == "bloqueado" and "SyntaxError" in (acc4[0].get("motivo") or ""),
                  json.dumps(acc4)[:150])
        auditoria = open(vig.AUDITORIA, encoding="utf-8").read() if os.path.exists(vig.AUDITORIA) else ""
        comprobar("cada decisión quedó registrada en vigilante.jsonl", '"prueba"' in auditoria and '"reinicio"' in auditoria)
    finally:
        for d in autonomia.duenos(port):
            autonomia._matar_pid(d["pid"], d["nombre"], port)


# ============================================================
# 4 — analizador
# ============================================================

def test_analizador():
    print("\n4) analizar_autonomia.py — sobre el proyecto y sobre un zip amputado")
    out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "analizar_autonomia.py"), ROOT, "--json"],
                         capture_output=True, timeout=60)
    r = json.loads(out.stdout.decode("utf-8"))
    faltan = r.get("faltantes") or []
    comprobar("este proyecto: 0 piezas de autonomía bloqueantes faltantes (exit 0)",
              out.returncode == 0 and not faltan, json.dumps(faltan))
    comprobar("mide el porcentaje (100 esperado)", r.get("porcentaje") == 100, str(r.get("porcentaje")))
    # zip amputado: todo menos el watchdog → debe detectarlo con nombre y apellido
    zip_roto = os.path.join(ROOT, ".test_amputado.zip")
    try:
        con_zip = zipfile.ZipFile(zip_roto, "w")
        try:
            for f in ["package.json", "server.ts", "agent_bridge_5000.py", "mcp_servers.json",
                      "autonomia.py", "requirements.txt", "iniciar_todo_windows.bat",
                      "prompts/bucle_autonomo.md", "scripts/mcp_fetch.py",
                      "tests/mcp_puente_test.py", "tests/autonomia_test.py"]:
                p = os.path.join(ROOT, f)
                if os.path.exists(p):
                    con_zip.write(p, f)
        finally:
            con_zip.close()
        out2 = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "analizar_autonomia.py"), zip_roto, "--json"],
                              capture_output=True, timeout=60)
        r2 = json.loads(out2.stdout.decode("utf-8"))
        comprobar("zip sin watchdog → FALTA declarada y exit 1",
                  out2.returncode == 1 and any("watchdog" in f or "vigilante" in f.lower() for f in r2.get("faltantes", [])),
                  json.dumps(r2.get("faltantes")))
        comprobar("docker se reporta INFORMATIVO, nunca bloqueante",
                  all(c["id"] != "docker" or not c["bloqueante"] for c in r2.get("criterios", [])))
    finally:
        try:
            os.remove(zip_roto)
        except OSError:
            pass


# ============================================================
# 5 — los cables del arranque sin humano
# ============================================================

def test_cables():
    print("\n5) cables — el .bat y package.json encadenan la autonomía")
    with open(os.path.join(ROOT, "iniciar_todo_windows.bat"), "r", encoding="utf-8", errors="replace") as f:
        bat = f.read()
    comprobar("el .bat llama a autonomia.py puertos --matar antes de arrancar",
              "autonomia.py puertos --matar" in bat.replace("\r\n", "\n"))
    comprobar("el .bat llama a autonomia.py deps --auto", "autonomia.py deps --auto" in bat)
    comprobar("el .bat NO deja que un fallo de autonomía tumbe el arranque (|| echo)",
              "|| echo" in bat)
    with open(os.path.join(ROOT, "package.json"), "r", encoding="utf-8") as f:
        pj = json.load(f)
    scripts = pj.get("scripts", {})
    for k in ("vigilar", "autonomia:puertos", "autonomia:sanear", "autonomia:deps", "test:autonomia", "analizar:autonomia"):
        comprobar("npm script «%s» declarado" % k, k in scripts)


def test_puente_binarios():
    """v1.94.1 · EL PDF QUE EL CHAT PROMETE Y EDGE NO ABRE.

    Mario (30/10): «el chat al hacer pdf queda así y no se puede abrir» — captura de
    Edge: «No podemos abrir este archivo», 0 de 0 páginas. Medido en el árbol: el
    catálogo `HERRAMIENTAS` del puente declaraba SEIS herramientas y `fs_write` abre
    con `encoding="utf-8"`; el operador binario (`_op_fs_write_b64`) EXISTÍA pero no
    estaba declarado, así que el modelo no tenía nombre al que llamar: escribía el PDF
    como texto. Y como la respuesta era `{ok, path}` sin tamaño, el chat informaba
    «✔ PDF generado exitosamente (45.407 bytes, 3 páginas)» con números inventados.

    Se congela la invariante del harness: **ninguna habilidad se anuncia si el puente
    no la puede sostener, y ningún número de un artefacto se afirma sin leerlo.**
    """
    print("\n6) puente — los binarios se escriben decodificados y se releen antes de prometer")
    import base64
    import importlib.util
    import tempfile

    espec = importlib.util.spec_from_file_location("bridge_bajo_prueba", os.path.join(ROOT, "agent_bridge_5000.py"))
    puente = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(puente)
    h = puente.PuenteHandler.__new__(puente.PuenteHandler)
    caja = tempfile.mkdtemp(prefix="cn-puente-")
    h._resolver = lambda p: os.path.join(caja, p)
    PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
           b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
           b"3 0 obj<</Type/Page/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")

    comprobar("fs_write_b64 está DECLARADA en el catálogo del puente", "fs_write_b64" in puente.HERRAMIENTAS)
    c, r = h._op_fs_write({"path": "roto.pdf", "content": "%PDF-1.4 texto"})
    comprobar("fs_write se niega a escribir un .pdf como texto", c == 400 and r.get("usar") == "fs_write_b64")
    comprobar("la negativa dice el remedio concreto", "fs_write_b64" in str(r.get("error", "")))
    c2, r2 = h._op_fs_write_b64({"path": "bueno.pdf", "data_b64": base64.b64encode(PDF).decode()})
    comprobar("un PDF real se acepta con los bytes LEÍDOS de disco", c2 == 200 and r2.get("bytes") == len(PDF))
    comprobar("y las páginas salen del archivo, no de la fantasía del modelo", r2.get("paginas") == 1)
    c3, r3 = h._op_fs_write_b64({"path": "falso.pdf", "data_b64": base64.b64encode(b"hola no soy pdf").decode()})
    comprobar("texto con extensión .pdf se RECHAZA (el caso reportado)", c3 == 422 and "%PDF-" in str(r3.get("error", "")))
    c4, r4 = h._op_fs_write_b64({"path": "falso.png", "data_b64": base64.b64encode(b"tampoco soy png").decode()})
    comprobar("una imagen sin firma de bytes también se rechaza", c4 == 422)
    b64 = base64.b64encode(PDF).decode()
    c5, r5 = h._op_fs_write_b64({"path": "mono.pdf", "data_b64": "data:application/pdf;base64," + b64[:30] + "\n  " + b64[30:]})
    comprobar("un data:…;base64, con saltos se tolera", c5 == 200 and r5.get("bytes") == len(PDF))
    c6, r6 = h._op_fs_write({"path": "sano.md", "content": "# hola"})
    comprobar("la escritura de texto normal no se enteró del cambio", c6 == 200 and r6.get("bytes") == 6)

    # v1.94.2 · `fs_delete` tenía el área encerrada pero NO tenía seguridad POR ARCHIVO:
    # adentro del área borraba para siempre, y hasta carpetas con os.rmdir. Ahora borrar
    # es mover a la papelera, y una carpeta se niega.
    open(os.path.join(caja, "a-borrar.txt"), "w").write("12345")
    c7, r7 = h._op_fs_delete({"path": "a-borrar.txt"})
    comprobar("★ fs_delete ya no destruye: devuelve la ruta de la papelera", c7 == 200 and ".cerebro-papelera" in str(r7.get("papelera", "")))
    comprobar("…y lo borrado queda recuperable en disco", r7.get("recuperable") is True and os.path.exists(r7.get("papelera", "")))
    comprobar("el archivo desapareció de su lugar (no es un ok mentiroso)", not os.path.exists(os.path.join(caja, "a-borrar.txt")))
    comprobar("los bytes del borrado se medieron, no se estimaron", r7.get("bytes") == 5)
    c8, _ = h._op_fs_delete({"path": ".cerebro-papelera"})
    comprobar("una CARPETA no se borra con la herramienta de archivos", c8 == 400)
    c9, _ = h._op_fs_delete({"path": "no-existe.txt"})
    comprobar("borrar lo que no existe dice que no existe (no un ok hueco)", c9 == 404)
    fuente = open(os.path.join(ROOT, "agent_bridge_5000.py"), encoding="utf-8").read()
    sin_destruccion = [l for l in fuente.split("\n") if "os.remove(" in l and not l.strip().startswith("#")]
    comprobar("y en el código no queda ningún os.remove vivo (solo el comentario que lo explica)", len(sin_destruccion) == 0, str(sin_destruccion[:1]))


def main():
    test_puertos()
    test_deps()
    test_vigilante()
    test_analizador()
    test_cables()
    test_puente_binarios()
    print("\n" + "=" * 56)
    if FALLOS:
        print("VEREDICTO: FALLO — %d de %d comprobaciones" % (len(FALLOS), PASOS))
        for f in FALLOS:
            print("  ✗", f)
        return 1
    print("VEREDICTO: TODO CORRECTO — %d comprobaciones de autonomía, 0 fallos" % PASOS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
