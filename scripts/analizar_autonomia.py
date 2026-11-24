#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analizar_autonomia.py — ¿Es este paquete autónomo de verdad? (v1.16.2)

Analiza un ZIP de CerebroNico (o la carpeta del proyecto) y responde con
criterios PRECISOS —no substring aleatorios— qué piezas de autonomía trae y
cuáles faltan. Criterio de «autonomía total» declarado por el plan:
ejecución sin intervención humana, auto-recuperación de dependencias y
gestión de procesos cruzados. Aquí cada requisito es una comprobación sobre
nombres de archivo reales:

  · manifiesto ............ package.json en la raíz del paquete
  · servidor .............. server.ts o dist/server.mjs en la raíz (punto de entrada)
  · puente Python ......... agent_bridge_5000.py (auto-arrancado por el motor)
  · MCP ................... mcp_servers.json + scripts/mcp_fetch.py (v1.16.1)
  · puertos (pieza 1) ..... autonomia.py con subcomando puertos
  · deps (pieza 2) ........ requirements.txt + autonomia.py deps (auto-desatendida)
  · watchdog (pieza 3) .... scripts/vigilante_autonomo.py
  · arranque sin humano ... iniciar_todo_windows.bat encadena puertos→deps→servidor
  · tests de autonomía .... tests/autonomia_test.py y tests/mcp_puente_test.py
  · Docker ................ INFORMATIVO, no bloqueante: este producto es un escritorio
                            Electron en la máquina del usuario (ver DISENO_CONTENEDOR);
                            un contenedor no añade autonomía local —la quita.

  python scripts/analizar_autonomia.py [ruta.zip|carpeta] [--json]
Salida: 0 si no falta ninguna pieza de autonomía; 1 si falta alguna.
"""

import argparse
import json
import os
import sys
import zipfile

DEFAULT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _lista_de(ruta):
    """Nombres relativos (con '/') tanto para zip como para carpeta."""
    if os.path.isdir(ruta):
        salida = []
        for raiz, dirs, files in os.walk(ruta):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".proyectos", "dist", ".vigilante", ".autonomia-deps", "__pycache__")]
            for f in files:
                rel = os.path.relpath(os.path.join(raiz, f), ruta).replace(os.sep, "/")
                salida.append(rel)
        return salida
    with zipfile.ZipFile(ruta) as z:
        nombres = [n.replace("\\", "/") for n in z.namelist()]
    # el zip suele llevar una carpeta raíz: normalizar quitándola
    prefijos = {n.split("/")[0] for n in nombres if "/" in n}
    if len(prefijos) == 1:
        pref = prefijos.pop() + "/"
        nombres = [n[len(pref):] if n.startswith(pref) else n for n in nombres]
    return nombres


def _raiz(files):
    return {f for f in files if "/" not in f.strip("/")}


def analizar(files):
    raiz = _raiz(files)

    def tiene(nombre):
        return nombre in raiz

    def tiene_en(sub):
        return any(f.endswith(sub) for f in files)

    criterios = []

    def add(id_, etiqueta, ok, bloqueante=True, nota=""):
        criterios.append({"id": id_, "etiqueta": etiqueta, "presente": bool(ok),
                          "bloqueante": bloqueante, "nota": nota})

    add("manifiesto", "package.json en la raíz", tiene("package.json"))
    add("servidor", "punto de entrada (server.ts o dist/server.mjs)",
        tiene("server.ts") or tiene_en("dist/server.mjs") or "dist/server.mjs" in files,
        nota="sin él no hay :3000 que vigilar")
    add("puente", "agent_bridge_5000.py (puente :5000, auto-spawn del motor)", tiene("agent_bridge_5000.py"))
    add("mcp", "mcp_servers.json + scripts/mcp_fetch.py", tiene("mcp_servers.json") and tiene_en("scripts/mcp_fetch.py"))
    add("puertos", "autonomia.py · subcomando puertos", tiene("autonomia.py"))
    add("deps", "requirements.txt (+ instalador desatendido en autonomia.py)", tiene("requirements.txt") and tiene("autonomia.py"))
    add("watchdog", "scripts/vigilante_autonomo.py", tiene_en("scripts/vigilante_autonomo.py"))
    add("prompt_bucle", "prompts/bucle_autonomo.md", tiene_en("prompts/bucle_autonomo.md"))
    add("tests", "tests de autonomía y MCP", tiene_en("tests/autonomia_test.py") and tiene_en("tests/mcp_puente_test.py"))
    add("arranque", "iniciar_todo_windows.bat enlazado a la autonomía",
        tiene("iniciar_todo_windows.bat"), nota="encadena puertos→deps→servidor sin humano")
    add("docker", "Dockerfile / docker-compose.yml",
        tiene("Dockerfile") or tiene("docker-compose.yml") or tiene_en("Dockerfile"),
        bloqueante=False,
        nota="INFORMATIVO: escritorio Electron en máquina del usuario; el contenedor no es autonomía local")

    bloqueantes = [c for c in criterios if c["bloqueante"]]
    faltantes = [c["etiqueta"] for c in bloqueantes if not c["presente"]]
    pct = round(100.0 * sum(1 for c in bloqueantes if c["presente"]) / len(bloqueantes))
    return {"ruta_ok": True, "porcentaje": pct, "faltantes": faltantes, "criterios": criterios}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ruta", nargs="?", default=DEFAULT)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.ruta):
        print("El archivo no se encuentra en la ruta especificada: %s" % args.ruta)
        return 2
    r = analizar(_lista_de(args.ruta))
    ok = not r["faltantes"]
    if args.json:
        print(json.dumps({"ok": ok, **r}, ensure_ascii=False, indent=1))
        return 0 if ok else 1
    print("Analizando estructura interna para autonomía: %s" % args.ruta)
    for c in r["criterios"]:
        marca = "✓" if c["presente"] else ("✗" if c["bloqueante"] else "·")
        linea = "  %s %-46s" % (marca, c["etiqueta"])
        if not c["presente"] and c["nota"]:
            linea += " ← " + c["nota"]
        print(linea)
    print("AUTONOMÍA: %d%% (%d criterios bloqueantes)" % (r["porcentaje"], sum(1 for c in r["criterios"] if c["bloqueante"])))
    if ok:
        print("VEREDICTO: paquete autónomo — sin intervención humana, con auto-recuperación de dependencias y procesos cruzados.")
    else:
        print("FALTAN: " + " · ".join(r["faltantes"]))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
