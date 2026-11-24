#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vigilante_autonomo.py — Watchdog externo de CerebroNico (v1.16.2, pieza 3)

QUÉ VIGILA Y POR QUÉ EXISTE
  El motor ya cuida de su puente: server.ts spawnea agent_bridge_5000.py, lo
  reinicia hasta 5 veces y lo ADOPTA si :5000 ya responde. Electron LOGRA VER
  morir al server empaquetado… y lo anota, sin reanimarlo. Este vigilante
  cubre justo el hueco de fuera: si el EXPRESS de :3000, el puente de :5000
  (cuando el motor tampoco pudo) u Ollama caen —OOM, pantallazo, `kill`
  manual—, los detecta por HEALTH HTTP (hecho: ¿responde?) y los relanza con
  su comando declarado, con memoria de intentos.

  NO gestiona el sandbox :3500: ese puerto es del PROYECTO del usuario, y un
  supervisor que mata proyectos ajenos por política no es autonomía: es un
  accidente con permisos.

DOCTRINA (cero silencios, cero bucles infinitos)
  · Cada servicio tiene límite de reinicios por ventana (defecto: 5/hora).
    Agotado, se marca BLOQUEADO y sigue informándolo — no se calla, no reintenta
    eternamente quemando la máquina.
  · Un log de arranque con `SyntaxError` es un fallo de CÓDIGO, no de suerte:
    reiniciar no lo cura. Se bloquea el servicio a la primera con el motivo y
    la ruta del log (.vigilante/<id>.log), porque «reintenta hasta que salga»
    sobre sintaxis rota es la definición de rueda patinando.
  · Cada decisión deja una línea JSON en .vigilante/vigilante.jsonl
    (hora, servicio, acción, ok, motivo, reinicios hasta ahora).

USO
  python scripts/vigilante_autonomo.py                 # bucle (intervalo 10 s)
  python scripts/vigilante_autonomo.py --una-vez       # pasada simple (cron/manual)
  python scripts/vigilante_autonomo.py --servicio ide  # vigila solo uno
  python scripts/vigilante_autonomo.py --estado        # últimas decisiones
  python scripts/vigilante_autonomo.py --servicios-json tests/servicios_falso.json
      (para pruebas: define servicios con health/comando propios)
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOG_DIR = os.path.join(ROOT, ".vigilante")
AUDITORIA = os.path.join(LOG_DIR, "vigilante.jsonl")
IS_WIN = os.name == "nt"


def servicios_por_defecto():
    """Declaración, no magia: url de salud + comando de arranque por servicio."""
    node = "node"
    if os.path.exists(os.path.join(ROOT, "dist", "server.mjs")):
        cmd_ide = [node, os.path.join("dist", "server.mjs")]
    else:
        cmd_ide = (["cmd", "/c", "npm", "run", "dev"] if IS_WIN else ["npm", "run", "dev"])
    return [
        {
            "id": "ide",
            "etiqueta": "IDE Express :3000",
            "health": "http://127.0.0.1:3000/api/capacidades",
            "comando": cmd_ide,
            "cwd": ROOT,
            "esperado_vivo": True,
        },
        {
            "id": "puente",
            "etiqueta": "Puente Python :5000",
            "health": "http://127.0.0.1:5000/health",
            "comando": [sys.executable, "agent_bridge_5000.py"],
            "cwd": ROOT,
            "esperado_vivo": True,
            "nota": "normalmente lo mantiene el motor; el vigilante es la red exterior",
        },
        {
            "id": "ollama",
            "etiqueta": "Motor Ollama :11434",
            "health": "http://127.0.0.1:11434/api/tags",
            "comando": ["ollama", "serve"],
            "cwd": ROOT,
            "esperado_vivo": True,
            "requiere_binario": "ollama",
        },
    ]


# ---------------- utilidades ----------------

def _auditar(servicio, accion, ok, motivo="", reinicios=None):
    os.makedirs(LOG_DIR, exist_ok=True)
    linea = json.dumps({
        "hora": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "servicio": servicio,
        "accion": accion,
        "ok": bool(ok),
        "motivo": (motivo or "")[:300],
        "reinicios": reinicios,
    }, ensure_ascii=False)
    with open(AUDITORIA, "a", encoding="utf-8") as f:
        f.write(linea + "\n")


def vivo(health, timeout=4):
    """El único test que vale: ¿contesta el HTTP? No «el puerto escucha»."""
    try:
        req = urllib.request.Request(health, headers={"User-Agent": "cerebronico-vigilante"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 500
    except Exception:
        return False


def _tail_log(servicio_id, n=30):
    ruta = os.path.join(LOG_DIR, "%s.log" % servicio_id)
    try:
        with open(ruta, "r", encoding="utf-8", errors="replace") as f:
            return f.read()[-8000:]
    except Exception:
        return ""


def lanzar(svc):
    """Relanza el servicio como proceso propio, con su log. None = imposible."""
    cmd = svc.get("comando") or []
    if not cmd:
        return None, "sin comando declarado"
    if svc.get("requiere_binario") and not _donde(cmd[0]):
        return None, "binario «%s» no está en el PATH" % cmd[0]
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, "%s.log" % svc["id"])
    try:
        with open(log_path, "ab") as log:
            kwargs = {"cwd": svc.get("cwd", ROOT), "stdout": log, "stderr": log, "stdin": subprocess.DEVNULL}
            if IS_WIN:
                kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            p = subprocess.Popen(cmd, **kwargs)
        return p, None
    except Exception as e:
        return None, "fallo de spawn: %s" % e


def _donde(binario):
    from shutil import which
    return which(binario)


class Vigilante:
    def __init__(self, servicios, limite=5, ventana_s=3600):
        self.servicios = {s["id"]: s for s in servicios}
        self.limite = limite
        self.ventana = ventana_s
        self.historial = {sid: [] for sid in self.servicios}   # ts de reinicios
        self.bloqueados = {}                                    # id -> motivo
        self.vivos_antes = {}

    def _ventana_ok(self, sid):
        ahora = time.time()
        self.historial[sid] = [t for t in self.historial[sid] if ahora - t < self.ventana]
        return len(self.historial[sid]) < self.limite

    def revisar(self, sid=None):
        """Una pasada sobre los servicios. Devuelve lista de acciones (para test)."""
        acciones = []
        for id_, svc in self.servicios.items():
            if sid and id_ != sid:
                continue
            if id_ in self.bloqueados:
                acciones.append({"servicio": id_, "accion": "bloqueado", "motivo": self.bloqueados[id_], "ok": False})
                continue
            arriba = vivo(svc["health"])
            if arriba:
                if self.vivos_antes.get(id_) is False:
                    _auditar(id_, "recuperado", True, "el servicio volvió a responder")
                    acciones.append({"servicio": id_, "accion": "recuperado", "ok": True})
                self.vivos_antes[id_] = True
                continue
            self.vivos_antes[id_] = False
            if not svc.get("esperado_vivo", True):
                continue
            # caído: ¿fallo de CÓDIGO? SyntaxError en el último arranque no se cura reiniciando.
            cola = _tail_log(id_)
            if "SyntaxError" in cola:
                self.bloqueados[id_] = "SyntaxError en %s — es un fallo de código, no de suerte; arregla y usa --desbloquear" % os.path.join(LOG_DIR, id_ + ".log")
                _auditar(id_, "bloqueado", False, self.bloqueados[id_], len(self.historial[id_]))
                acciones.append({"servicio": id_, "accion": "bloqueado", "motivo": self.bloqueados[id_], "ok": False})
                continue
            if not self._ventana_ok(id_):
                self.bloqueados[id_] = "límite de %d reinicios/%ds agotado" % (self.limite, self.ventana)
                _auditar(id_, "bloqueado", False, self.bloqueados[id_], len(self.historial[id_]))
                acciones.append({"servicio": id_, "accion": "bloqueado", "motivo": self.bloqueados[id_], "ok": False})
                continue
            p, err = lanzar(svc)
            self.historial[id_].append(time.time())
            if p is None:
                _auditar(id_, "reinicio", False, err, len(self.historial[id_]))
                acciones.append({"servicio": id_, "accion": "reinicio", "ok": False, "motivo": err})
                continue
            esperado = float(svc.get("arranque_s", 6))
            time.sleep(esperado)
            volvio = vivo(svc["health"])
            _auditar(id_, "reinicio", volvio, "pid %d relanzado; health %s" % (p.pid, "OK" if volvio else "SIGUE CAÍDO"), len(self.historial[id_]))
            acciones.append({"servicio": id_, "accion": "reinicio", "ok": volvio, "pid": p.pid})
        return acciones

    def desbloquear(self, sid):
        self.bloqueados.pop(sid, None)
        self.historial[sid] = []
        _auditar(sid, "desbloqueado", True, "a mano")

    def estado(self):
        salida = {}
        for id_, svc in self.servicios.items():
            salida[id_] = {"etiqueta": svc.get("etiqueta"), "vivo": vivo(svc["health"]),
                           "reinicios_ventana": len(self.historial[id_]), "bloqueado": self.bloqueados.get(id_)}
        return salida


def main():
    ap = argparse.ArgumentParser(description="Watchdog externo de CerebroNico")
    ap.add_argument("--una-vez", action="store_true", help="una pasada y salir (útil en tareas programadas)")
    ap.add_argument("--intervalo", type=int, default=10, help="segundos entre pasadas (defecto 10)")
    ap.add_argument("--limite", type=int, default=5, help="reinicios máximos por ventana (defecto 5)")
    ap.add_argument("--ventana", type=int, default=3600, help="ventana de reinicios en segundos (defecto 3600)")
    ap.add_argument("--servicio", help="limitar a un id (ide|puente|ollama)")
    ap.add_argument("--servicios-json", help="JSON propio de servicios (pruebas/avanzado)")
    ap.add_argument("--desbloquear", help="devolver un servicio bloqueado a la vida")
    ap.add_argument("--estado", action="store_true", help="imprimir vivo/muerto/reinicios y salir")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.servicios_json:
        with open(args.servicios_json, "r", encoding="utf-8") as f:
            datos = json.load(f)
        servicios = datos["servicios"] if isinstance(datos, dict) else datos
    else:
        servicios = servicios_por_defecto()
    v = Vigilante(servicios, limite=args.limite, ventana_s=args.ventana)

    if args.desbloquear:
        v.desbloquear(args.desbloquear)
        print(json.dumps({"ok": True, "desbloqueado": args.desbloquear}) if args.json else "desbloqueado: %s" % args.desbloquear)
        return 0
    if args.estado:
        est = v.estado()
        print(json.dumps({"ok": all(e["vivo"] or e["bloqueado"] for e in est.values()), "servicios": est}, ensure_ascii=False, indent=1))
        return 0

    while True:
        acciones = v.revisar(args.servicio)
        if args.json and acciones:
            for a in acciones:
                print(json.dumps(a, ensure_ascii=False), flush=True)
        else:
            for a in acciones:
                marca = "✓" if a.get("ok") else "✗"
                print("%s [%s] %s%s" % (marca, time.strftime("%H:%M:%S"), a["accion"],
                                        (" — " + a["motivo"]) if a.get("motivo") else ""), flush=True)
        if args.una_vez:
            return 0 if all(a.get("ok") or a["accion"] in ("recuperado",) for a in acciones) or not acciones else 1
        time.sleep(max(2, args.intervalo))


if __name__ == "__main__":
    sys.exit(main())
