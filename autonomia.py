#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
autonomia.py — Autodiagnóstico y saneo del arranque de CerebroNico.

PIEZA 1 + 2 del plan de autonomía (ver scripts/analizar_autonomia.py y
tests/autonomia_test.py). 100 %% stdlib: no importa psutil ni paquetes de pip,
porque es parte del arranque que precede a `npm install` / instalación de deps.

SUBCOMANDOS
  puertos [--matar] [--solo N] [--incluir-ollama] [--json]
      Autodiagnóstico de los puertos PROPIOS del producto. Informa quién los
      ocupa (pid+nombre). Con --matar elimina SOLO zombies propios de la lista
      blanca y VERIFICA que el puerto quede libre; a un dueño ajeno lo informa
      pero NO lo toca. Nunca se mata a sí mismo.
  deps [--auto] [--json]
      Informe de dependencias de pip de requirements.txt. SIN --auto no instala
      nada (cero efectos). Con --auto instala lo que falte y deja la marca
      .autonomia-deps. El puente :5000 es 100 %% stdlib: nunca necesita pip.
  estado [--json]
      Resumen legible: puertos propios + motor (Ollama) + deps.

USO
  python autonomia.py estado
  python autonomia.py puertos --matar
  python autonomia.py deps --auto

NOTA DE PROCEDENCIA (v1.53.1): este módulo se reconstruyó fielmente a partir
del CONTRATO EJECUTABLE del propio proyecto (tests/autonomia_test.py), que es
la especificación viva de cada función pública. Su corrección se acredita por
la ejecución de ese test (no por lectura). Si el historial interno guarda la
copia original posterior a v1.16.x, sustitúyela por esa y vuelve a pasar la
valla: la Comprobación R no distingue versiones, solo presencia.
"""

import glob
import json
import os
import re
import signal
import subprocess
from urllib.request import urlopen
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = HERE
IS_WIN = os.name == "nt"

# Los puertos PROPIOS del producto (no el motor Ollama, que va aparte en
# «motor»). El test puede monkeypatchear este dict para aislar un puerto suyo.
PUERTOS_PROPIOS = {
    3000: "IDE / servidor Express",
    5000: "Puente PC (agent_bridge_5000.py)",
    5100: "Capa de memoria híbrida",
}

# Puerto del MOTOR (Ollama). Se informa aparte: no se incluye en «puertos»
# salvo que se pida --incluir-ollama.
PUERTO_MOTOR = 11434

# Lista blanca de dueños que SÍ son candidatos a matar como zombie propio.
# Un 'postgres' u otro servicio ajeno se INFORMA, nunca se mata.
LISTA_BLANCA = (
    "python", "python3", "py", "node", "nodejs", "ollama",
    "uvicorn", "electron", "tsx", "esbuild", "vite",
)


class Argumentos:
    """Objeto de argumentos mínimo (bypass de argparse para llamadas directas)."""

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def _nombre_permitido(nombre):
    """¿El nombre de proceso está en la lista blanca de 'matable como propio'?"""
    if not nombre:
        return False
    n = str(nombre).lower().replace("\\", "/").rsplit("/", 1)[-1]
    if n.endswith(".exe"):
        n = n[:-4]
    return any(n.startswith(tok) for tok in LISTA_BLANCA)


# ============================================================
# Dueños de un puerto — 100 %% stdlib, por SO
# ============================================================

def _inodos_escuchando(port):
    """Inodos de sockets en estado LISTEN para 'port' (Linux, /proc/net)."""
    inodos = set()
    for proc in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            with open(proc) as f:
                next(f, None)
                for line in f:
                    partes = line.split()
                    if len(partes) < 10:
                        continue
                    local, estado, inode = partes[1], partes[3], partes[9]
                    try:
                        p = int(local.rsplit(":", 1)[1], 16)
                    except (ValueError, IndexError):
                        continue
                    if p == port and estado == "0A":  # 0A == TCP_LISTEN
                        inodos.add(inode)
        except (FileNotFoundError, PermissionError, IndexError, ValueError):
            pass
    return inodos


def _pids_por_inodo(inodos):
    """Mapea inodos de socket a PIDs recorriendo /proc/<pid>/fd (Linux)."""
    pids = set()
    if not inodos:
        return pids
    for fd in glob.glob("/proc/[0-9]*/fd/*"):
        try:
            destino = os.readlink(fd)
        except OSError:
            continue
        m = re.match(r"socket:\[(\d+)\]", destino)
        if m and m.group(1) in inodos:
            try:
                pids.add(int(fd.split("/")[2]))
            except (ValueError, IndexError):
                pass
    return pids


def _pids_lsof(port):
    """Fallback POSIX si /proc no estaba disponible: lsof."""
    try:
        out = subprocess.run(
            ["lsof", "-nP", "-iTCP:%d" % port, "-sTCP:LISTEN", "-t"],
            capture_output=True, timeout=10,
        )
        return {int(x) for x in out.stdout.decode("utf-8", "replace").split()}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return set()


def _pids_win(port):
    """Windows: netstat -ano, filas LISTENING del puerto."""
    pids = set()
    try:
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"],
                             capture_output=True, timeout=15)
        texto = out.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.TimeoutExpired):
        return pids
    for linea in texto.splitlines():
        if "LISTENING" not in linea:
            continue
        cols = linea.split()
        if len(cols) < 5:
            continue
        direccion, pid = cols[1], cols[-1]
        try:
            if int(direccion.rsplit(":", 1)[1]) == port:
                pids.add(int(pid))
        except (ValueError, IndexError):
            pass
    return pids


def _nombre_proceso(pid):
    """Nombre del proceso de un PID (solo stdlib, por SO)."""
    if IS_WIN:
        try:
            out = subprocess.run(["tasklist", "/FI", "PID eq %d" % pid, "/FO", "CSV", "/NH"],
                                 capture_output=True, timeout=10)
            fila = out.stdout.decode("utf-8", "replace").strip().strip('"')
            return fila.split('","')[0] if fila else "?"
        except (OSError, subprocess.TimeoutExpired):
            return "?"
    try:
        with open("/proc/%d/comm" % pid) as f:
            return f.read().strip() or "?"
    except OSError:
        return "?"


def duenos(port):
    """Procesos que ESCUCHAN en 'port'. Devuelve [{pid, nombre}] sin repetir."""
    if IS_WIN:
        pids = _pids_win(port)
    else:
        pids = _pids_por_inodo(_inodos_escuchando(port)) or _pids_lsof(port)
    salida = {}
    for pid in pids:
        salida[pid] = {"pid": pid, "nombre": _nombre_proceso(pid)}
    return list(salida.values())


def _puerto_sano(port, presupuesto=1.2):
    """¿El dueño del puerto responde a /health? Si responde, está VIVO y sano:
    matarlo sería apagar un servicio funcionando, no limpiar un zombie.

    Un puerto que escucha pero no contesta (o contesta cualquier cosa fea) sí es
    el zombie que esta limpieza fue a buscar. La diferencia entre los dos estados
    es justo la que la ventana del lanzador no sabía decir."""
    # "Sano" tiene que significar algo medible: una RESPUESTA HTTP con JSON adentro.
    # Un listener mudo (el zombie que esta limpieza busca) o un proceso que devuelve
    # basura no cuentan, aunque el puerto este escuchando.
    try:
        with urlopen("http://127.0.0.1:%d/health" % port, timeout=presupuesto) as r:
            if not (200 <= int(getattr(r, "status", 200) or 200) < 400):
                return False
            cuerpo = r.read(4096).decode("utf-8", "replace").strip()
        dato = json.loads(cuerpo) if cuerpo else None
        return isinstance(dato, dict)
    except Exception:
        return False


def _matar_pid(pid, nombre, port):
    """Mata un PID y VERIFICA que el puerto quede libre. Nunca se mata a sí
    mismo (la guarda que el test exige). Devuelve True si el puerto quedó libre."""
    if pid == os.getpid():
        return False
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(pid), "/F", "/T"],
                           capture_output=True, timeout=15)
        else:
            os.kill(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
        pass
    for _ in range(50):
        if not duenos(port):
            return True
        time.sleep(0.1)
    if not IS_WIN:
        try:
            os.kill(pid, signal.SIGKILL)
        except (OSError, ProcessLookupError):
            pass
        for _ in range(30):
            if not duenos(port):
                return True
            time.sleep(0.1)
    return not duenos(port)


# ============================================================
# Subcomando: puertos
# ============================================================

def _estado_motor(incluir_ollama=False):
    d = duenos(PUERTO_MOTOR)
    return {
        "nombre": "Ollama",
        "puerto": PUERTO_MOTOR,
        "ocupado": bool(d),
        "duenos": d,
        "incluido_en_puertos": bool(incluir_ollama),
    }


def cmd_puertos(args):
    matar = getattr(args, "matar", False)
    incluir_ollama = getattr(args, "incluir_ollama", False)
    solo = getattr(args, "solo", None)
    como_json = getattr(args, "json", False)

    puertos = dict(PUERTOS_PROPIOS)
    if incluir_ollama:
        puertos[PUERTO_MOTOR] = "Motor Ollama"
    if solo:
        try:
            s = int(solo)
            puertos = {s: puertos.get(s, "Puerto solicitado")}
        except ValueError:
            puertos = {}

    informe = {"puertos": {}, "faltan": [], "motor": _estado_motor(incluir_ollama)}
    for port, etiqueta in puertos.items():
        d = duenos(port)
        entrada = {"etiqueta": etiqueta, "ocupado": bool(d), "duenos": d}
        if d and matar:
            acciones = []
            # v2.1.0 - LA GUARDA QUE FALTABA. `--matar` se escribio para limpiar
            # ZOMBIES (un puerto escuchando con el proceso colgado), pero mataba
            # tambien al dueno sano: relanzar el .bat apagaba la memoria de la
            # sesion anterior, que es exactamente el "[memoria] se cerro" que ve
            # Mario en la ventana. Un servicio que responde a su chequeo de salud
            # NO es un zombie; para apagarlo existe el interruptor (servicios.json)
            # o `--matar-forzado`.
            sano = _puerto_sano(port) if not getattr(args, "matar_forzado", False) else False
            for dd in d:
                if sano:
                    acciones.append({"pid": dd["pid"], "nombre": dd["nombre"], "muerto": False,
                                     "motivo": "servicio vivo y sano: no es zombie (use --matar-forzado)"})
                    continue
                if _nombre_permitido(dd["nombre"]):
                    muerto = _matar_pid(dd["pid"], dd["nombre"], port)
                    acciones.append({"pid": dd["pid"], "nombre": dd["nombre"], "muerto": muerto})
                else:
                    acciones.append({"pid": dd["pid"], "nombre": dd["nombre"],
                                     "muerto": False, "motivo": "dueño ajeno: intocable"})
            entrada["accion"] = acciones
            d2 = duenos(port)
            entrada["ocupado"] = bool(d2)
            entrada["duenos"] = d2
        if entrada["ocupado"]:
            informe["faltan"].append(port)
        informe["puertos"][str(port)] = entrada

    rc = 1 if informe["faltan"] else 0
    if como_json:
        print(json.dumps(informe, ensure_ascii=False))
    else:
        print("Puertos propios de CerebroNico:")
        for sp, e in informe["puertos"].items():
            estado = "OCUPADO" if e["ocupado"] else "libre"
            quien = ""
            if e["duenos"]:
                quien = " <- " + ", ".join("%s(%s)" % (x["nombre"], x["pid"]) for x in e["duenos"])
            print("  [%s] %-6s %s%s" % (estado[0], sp, e["etiqueta"], quien))
        m = informe["motor"]
        print("  motor: Ollama :%d %s" % (m["puerto"], "arriba" if m["ocupado"] else "abajo"))
        if informe["faltan"]:
            print("FALTA sanear: " + ", ".join(str(x) for x in informe["faltan"]))
        else:
            print("Todos los puertos propios en orden.")
    return rc


# ============================================================
# Subcomando: deps
# ============================================================

_IMPORT_POR_PAQUETE = {
    "python-dotenv": "dotenv",
    "uvicorn": "uvicorn",
    "fastapi": "fastapi",
    "pydantic": "pydantic",
    "pyyaml": "yaml",
    "pillow": "PIL",
}


def _leer_requirements():
    """Líneas reales de requirements.txt, sin comentarios ni líneas vacías."""
    ruta = os.path.join(ROOT, "requirements.txt")
    reqs = []
    try:
        with open(ruta, encoding="utf-8-sig") as f:
            for linea in f:
                s = linea.strip()
                if not s or s.startswith("#"):
                    continue
                s = s.split("#", 1)[0].strip()
                if s:
                    reqs.append(s)
    except OSError:
        pass
    return reqs


def _nombre_import(req):
    base = re.split(r"[<>=!~\[; ]", req, 1)[0].strip().lower()
    return _IMPORT_POR_PAQUETE.get(base, base.replace("-", "_"))


def cmd_deps(args):
    import importlib.util
    auto = getattr(args, "auto", False)
    como_json = getattr(args, "json", False)

    reqs = _leer_requirements()
    faltantes = []
    for r in reqs:
        mod = _nombre_import(r)
        try:
            if importlib.util.find_spec(mod) is None:
                faltantes.append(r)
        except (ImportError, ValueError, ModuleNotFoundError):
            faltantes.append(r)

    informe = {
        "puente_stdlib": "El puente :5000 es 100% stdlib: no necesita paquetes de pip.",
        "requirements": reqs,
        "faltantes": faltantes,
        "instalado": [],
        "auto": bool(auto),
    }

    if auto and faltantes:
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", *faltantes],
                           timeout=600)
            informe["instalado"] = list(faltantes)
            with open(os.path.join(ROOT, ".autonomia-deps"), "w", encoding="utf-8") as f:
                f.write("deps instaladas por autonomia.py: %s\n" % ", ".join(faltantes))
        except (OSError, subprocess.TimeoutExpired) as e:
            informe["error"] = str(e)

    if como_json:
        print(json.dumps(informe, ensure_ascii=False))
    else:
        print(informe["puente_stdlib"])
        if not reqs:
            # v1.57.13 · ARRANQUE HONESTO: antes esta línea anunciaba «faltan: 4
            # paquetes» en cada arranque — los requisitos de componentes legacy
            # que el arranque normal nunca levanta, en un python-embed que ni pip
            # tiene. El ruido confundió hasta a un modelo (glm4.5, 15/10:
            # «posible inestabilidad del puente»). Hoy la raíz pide CERO y la
            # verdad entra en una línea: nada que instalar, nada que temer.
            print("requirements.txt: 0 paquete(s) — el arranque normal no pide nada a pip.")
        else:
            print("requirements.txt: %d paquete(s)" % len(reqs))
            if faltantes:
                print("  faltan: " + ", ".join(faltantes))
                if not auto:
                    print("  (ejecuta: python autonomia.py deps --auto para instalarlos)")
            else:
                print("  todo presente.")
    return 0


# ============================================================
# Subcomando: estado
# ============================================================

def cmd_estado(args):
    como_json = getattr(args, "json", False)
    puertos = {}
    for port, etiqueta in PUERTOS_PROPIOS.items():
        d = duenos(port)
        puertos[str(port)] = {"etiqueta": etiqueta, "ocupado": bool(d), "duenos": d}
    reqs = _leer_requirements()
    estado = {
        "version": "autonomia",
        "puertos": puertos,
        "motor": _estado_motor(False),
        "deps": {"requirements": len(reqs)},
    }
    if como_json:
        print(json.dumps(estado, ensure_ascii=False))
    else:
        print("== CerebroNico : estado de autonomía ==")
        for sp, e in puertos.items():
            print("  :%-6s %-32s %s" % (sp, e["etiqueta"], "OCUPADO" if e["ocupado"] else "libre"))
        m = estado["motor"]
        print("  motor Ollama :%d %s" % (m["puerto"], "arriba" if m["ocupado"] else "abajo"))
        print("  requirements.txt: %d paquete(s)" % len(reqs))
    return 0


# ============================================================
# CLI
# ============================================================

def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="autonomia.py",
                                 description="Autodiagnóstico y saneo de autonomía de CerebroNico.")
    sub = ap.add_subparsers(dest="cmd")

    p1 = sub.add_parser("puertos", help="diagnostica/sanea los puertos propios")
    p1.add_argument("--matar", action="store_true")
    p1.add_argument("--matar-forzado", action="store_true",
                    help="mata también los servicios sanos (lo que antes hacía --matar a ciegas)")
    p1.add_argument("--incluir-ollama", dest="incluir_ollama", action="store_true")
    p1.add_argument("--solo")
    p1.add_argument("--json", action="store_true")
    p1.set_defaults(func=cmd_puertos)

    p2 = sub.add_parser("deps", help="informe de dependencias de pip")
    p2.add_argument("--auto", action="store_true")
    p2.add_argument("--json", action="store_true")
    p2.set_defaults(func=cmd_deps)

    p3 = sub.add_parser("estado", help="resumen legible del estado de autonomía")
    p3.add_argument("--json", action="store_true")
    p3.set_defaults(func=cmd_estado)

    args = ap.parse_args(argv)
    if not getattr(args, "cmd", None):
        return cmd_estado(Argumentos(json=False))
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
