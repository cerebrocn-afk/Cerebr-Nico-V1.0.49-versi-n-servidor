#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probar_ollama.py — la prueba de humo CON DEFENSAS (v1.57.14)
===========================================================
Tu versión:

    response = ollama.chat(model='deepseek-coder:1.3b', messages=[...])
    print(response['message']['content'])

Funciona, pero en tu máquina (Windows en español, consola cp850, y el Python
EMBEBIDO de la IDE al lado del Python del sistema) se cae por tres cosas que no
son del modelo:

  1. CODIFICACION. El modelo devuelve un guion largo, una flecha o un emoji y
     `print()` revienta con UnicodeEncodeError contra la codificación de la
     consola. Se previene RECONFIGURANDO stdout, no rezando.
  2. HOST HEREDADO. El BAT de la IDE arranca el motor con
     OLLAMA_HOST=0.0.0.0:11434. Esa variable es del SERVER; si termina en el
     ambiente de tu cuenta, el CLIENTE la lee también y trata de conectarse a
     0.0.0.0. Acá se permite forzar el host con --host para no depender de eso.
  3. SIN TIEMPO NI CAUSA. La primera llamada del día baja los pesos del disco
     (10-40 s en un i5 sin GPU) y eso se ve como "se colgó". Se cronombra y se
     nombra el fallo concreto en vez de soltar un traceback de 40 líneas.

    py -3 tools\\probar_ollama.py
    py -3 tools\\probar_ollama.py --modelo qwen3:4b --host http://127.0.0.1:11434
"""
import argparse
import sys
import time


def despegar_consola():
    """cp850 no admite todo lo que un modelo escribe. Se cambia stdout a UTF-8 y,
    si la consola no lo banca, se reemplaza el carácter en vez de morir."""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        return "utf-8"
    except Exception:
        return getattr(sys.stdout, "encoding", "?")


def main():
    p = argparse.ArgumentParser(description="Prueba de humo de Ollama con tiempos")
    p.add_argument("--modelo", default="deepseek-coder:1.3b")
    p.add_argument("--host", default="", help="URL del motor (default: la del cliente)")
    p.add_argument("--frase", default="Hola, estás funcionando?")
    p.add_argument("--ctx", type=int, default=0, help="num_ctx (0 = default del server)")
    p.add_argument("--hilos", type=int, default=0, help="num_thread (0 = decide Ollama)")
    p.add_argument("--keep-alive", default="5m")
    p.add_argument("--dos-veces", action="store_true",
                   help="repite la llamada para ver cuánto costó cargar el modelo")
    args = p.parse_args()

    consola = despegar_consola()
    try:
        import ollama
    except ImportError:
        print("Falta el cliente en ESTE Python. En Windows:")
        print("  py -3 -m pip install ollama")
        print("Ojo: si corres el script con runtime\\python-embed de la IDE, ese")
        print("Python no ve tu AppData\\Roaming\\Python y tampoco tiene pip.")
        sys.exit(2)

    cliente = ollama.Client(host=args.host) if args.host else ollama.Client()
    opciones = {}
    if args.ctx:
        opciones["num_ctx"] = args.ctx
    if args.hilos:
        opciones["num_thread"] = args.hilos

    mensajes = [{"role": "user", "content": args.frase}]
    vueltas = 2 if args.dos_veces else 1

    print(f"motor: {getattr(cliente, '_base_url', None) or args.host or 'default del cliente'}")
    print(f"consola: {consola} · modelo: {args.modelo} · opciones: "
          f"{opciones or '(ninguna: hereda el default del server)'}")
    print(f"keep_alive: {args.keep_alive}\n")

    for i in range(1, vueltas + 1):
        t0 = time.perf_counter()
        try:
            r = cliente.chat(model=args.modelo, messages=mensajes,
                             options=opciones, keep_alive=args.keep_alive)
        except Exception as e:
            ms = (time.perf_counter() - t0) * 1000
            tipo = type(e).__name__
            texto = str(e)
            print(f"[{i}] fallo tras {ms:.0f} ms — {tipo}: {texto[:400]}")
            bajo = texto.lower()
            if "not found" in bajo or "no existe" in bajo:
                print(f"      El modelo no está descargado:  ollama pull {args.modelo}")
                print("      Cuáles hay:                      ollama list")
            elif "connect" in bajo or "refused" in bajo or "unreachable" in bajo or "time-out" in bajo or "timed out" in bajo:
                print("      El motor no responde. Abrí la app de Ollama o:")
                print("        ollama serve")
                print("      Si el BAT de la IDE ya lo levantó, la ventana 'Ollama")
                print("      Engine - Puerto 11434' está minimizada en el taskbar.")
            elif "context length" in bajo or "memory" in bajo or "cuda" in bajo:
                print("      Falta RAM/contexto: probá --ctx 2048 o un modelo más chico.")
            else:
                print("      Sin receta conocida: mirá la consola del motor (ollama serve).")
            sys.exit(1)
        ms = (time.perf_counter() - t0) * 1000
        contenido = (r.get("message") or {}).get("content", "")
        evals = r.get("eval_count")
        prompt = r.get("prompt_eval_count")
        print(f"[{i}] {ms:.0f} ms · {len(contenido)} caracteres"
              + (f" · {evals} tokens de salida" if evals else "")
              + (f" · {prompt} tokens de entrada" if prompt else ""))
        print("--- respuesta ---")
        print(contenido if contenido.strip() else "(vacía: el modelo no dijo nada)")
        print("--- fin ---\n")
        if i == 1 and vueltas > 1:
            print("(segunda vuelta: si es mucho más rápida, la diferencia era la")
            print(" carga de los pesos, no el modo de llamada)\n")


if __name__ == "__main__":
    main()
