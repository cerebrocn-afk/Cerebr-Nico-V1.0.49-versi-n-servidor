#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
comparar_stream_vs_blocking.py — ¿REALMENTE es más rápido stream=True?
======================================================================
MEDICIÓN HONESTA del ejemplo del usuario (`llamada_lenta` vs `llamada_rapida`).

El ejemplo compara dos formas de IMPRIMIR, no dos formas de COMPUTAR. Ollama
hace el mismo trabajo en ambos casos: cargar pesos -> procesar el prompt
(prefill) -> generar token por token. `stream=True` no acelera nada de eso;
solo cambia el momento en que el primer byte llega al cliente. Y el ejemplo
no mide ningún tiempo, así que la pregunta («¿cuál es más rápido?») queda sin
respuesta.

Este script mide lo que importa y lo separa en tres números:

  · ttft        tiempo hasta el PRIMER token visible  -> perceptivo
  · total       tiempo hasta el último token          -> real
  · de_carga    tiempo de la carga del modelo (se mide aparte, con un warmup
                ANTES de cronometrar, para no contaminar la comparación)

Además prueba la variable que el ejemplo NO toca y que en el caso real de la
casa (diary 2026-10-14) es la que decidía la velocidad: el contexto. `options`
sin `num_ctx` hereda el default del server, y si el servidor tiene un contexto
global grande, la cuenta de la KV-cache se paga en RAM y en segundos.

Uso (en la máquina con Ollama arriba):

    python comparar_stream_vs_blocking.py
    python comparar_stream_vs_blocking.py --modelo qwen3:4b --ctx 2048 --hilos 4
    python comparar_stream_vs_blocking.py --sin-warmup --vueltas 3
    python comparar_stream_vs_blocking.py --comparar-ctx 2048,8192,32768

Sin dependencias extra: usa el cliente oficial `ollama` (`pip install ollama`).
"""
import argparse
import sys
import time

PROMPT = "Escribe una función de Python para calcular el Fibonacci"

try:
    import ollama  # noqa: E402
except ImportError:
    print("Falta el cliente:  pip install ollama")
    sys.exit(2)


def base_de_options(args):
    """Las options que viajan en CADA llamada (nil == que decida Ollama)."""
    opts = {}
    if args.ctx:
        opts["num_ctx"] = args.ctx
    if args.hilos:
        opts["num_thread"] = args.hilos
    if args.predict:
        opts["num_predict"] = args.predict
    return opts


def mensaje():
    return [{"role": "user", "content": PROMPT}]


def cargar_modelo(cliente, args):
    """
    Warmup: fuerza la carga del modelo ANTES de cronometrar.

    Sin esto, la primera llamada que se mide paga los pesos desde el disco y el
    veredicto sale al revés (el modo 'lento' parece rápido si fue el segundo).
    Es la misma trampa que documenta el diary de la casa: 'mismo modelo, dos
    comportamientos' casi nunca es culpa del modo de llamada.
    """
    t0 = time.perf_counter()
    cliente.chat(model=args.modelo, messages=[{"role": "user", "content": "hi"}],
                 options={"num_predict": 1}, keep_alive=args.keep_alive)
    return time.perf_counter() - t0


def medir_blocking(cliente, args):
    """Tu `llamada_lenta()`: espera TODO antes de devolver."""
    t0 = time.perf_counter()
    r = cliente.chat(model=args.modelo, messages=mensaje(),
                     options=base_de_options(args), keep_alive=args.keep_alive)
    total = time.perf_counter() - t0
    texto = r["message"]["content"]
    # ttft == total: no hay forma de saber cuándo llegó el primer token, porque
    # el cliente no recibe NADA hasta que el server termina. Ese es el costo real
    # del modo blocking: no es más lento, es CIEGO.
    return {"total": total, "ttft": total, "tokens": 0, "chars": len(texto), "trozos": 1}


def medir_stream(cliente, args):
    """Tu `llamada_rapida()`: imprime cada pedazo al instante."""
    t0 = time.perf_counter()
    ttft = None
    trozos = 0
    chars = 0
    for chunk in cliente.chat(model=args.modelo, messages=mensaje(), stream=True,
                              options=base_de_options(args), keep_alive=args.keep_alive):
        pedazo = chunk["message"]["content"]
        if pedazo and ttft is None:
            ttft = time.perf_counter() - t0
        if pedazo:
            trozos += 1
            chars += len(pedazo)
        # print(..., end="", flush=True) en un benchmark es un contaminante: la
        # terminal también cuesta. Se mide sin imprimir y se imprime al final.
    total = time.perf_counter() - t0
    return {"total": total, "ttft": ttft if ttft is not None else total,
            "tokens": trozos, "chars": chars, "trozos": trozos}


def mejor(lista):
    """Mediana-ish: el mínimo con su muestra. Con pocas vueltas, el mínimo es lo
    más estable (el máximo está contaminado por el scheduler de Windows)."""
    return min(lista), sum(lista) / len(lista)


def fmt(x):
    return f"{x * 1000:7.0f} ms"


def main():
    p = argparse.ArgumentParser(description="Comparar blocking vs streaming contra Ollama")
    p.add_argument("--modelo", default="deepseek-coder:1.3b")
    p.add_argument("--host", default="", help="URL del server (default: la del cliente)")
    p.add_argument("--vueltas", type=int, default=2, help="repeticiones por modo")
    p.add_argument("--ctx", type=int, default=0, help="num_ctx (0 = que decida Ollama)")
    p.add_argument("--hilos", type=int, default=0, help="num_thread (0 = que decida Ollama)")
    p.add_argument("--predict", type=int, default=0, help="num_predict (0 = sin tope)")
    p.add_argument("--keep-alive", default="5m", help='keep_alive: "5m", "30m", "0", "-1"')
    p.add_argument("--sin-warmup", action="store_true", help="no precargar (mide el peor caso)")
    p.add_argument("--comparar-ctx", default="", help="lista de contextos, p.ej. 2048,8192,32768")
    args = p.parse_args()

    cliente = ollama.Client(host=args.host) if args.host else ollama.Client()

    print(f"\nModelo: {args.modelo} · keep_alive={args.keep_alive} "
          f"· options={base_de_options(args) or '(ninguna: hereda el default del server)'}")
    print(f"Prompt: {PROMPT!r}\n")

    try:
        if args.sin_warmup:
            carga = None
            print("Sin warmup: la PRIMERA medida incluye bajar los pesos del disco.")
        else:
            carga = cargar_modelo(cliente, args)
            print(f"Carga del modelo (warmup): {fmt(carga)}  <- esto NO es streaming, es disco")
    except Exception as e:  # el server caído es el fallo más común y debe nombrarse
        print(f"\nNo se pudo hablar con Ollama ({type(e).__name__}): {e}")
        print("¿Está arriba?  ollama serve   ·   ¿existe el modelo?  ollama pull "
              + args.modelo)
        sys.exit(1)

    bloque, corridas = [], []
    for i in range(max(1, args.vueltas)):
        try:
            b = medir_blocking(cliente, args)
            s = medir_stream(cliente, args)
        except Exception as e:
            print(f"  vuelta {i + 1}: fallo ({type(e).__name__}): {e}")
            break
        bloque.append(b)
        corridas.append(s)
        print(f"  vuelta {i + 1}: blocking total {fmt(b['total'])} · "
              f"stream ttft {fmt(s['ttft'])} total {fmt(s['total'])} "
              f"({s['trozos']} trozos, {s['chars']} chars)")

    if not bloque:
        print("\nNinguna corrida útil: nada que comparar.")
        sys.exit(1)

    b_min, b_prom = mejor([x["total"] for x in bloque])
    s_min, s_prom = mejor([x["total"] for x in corridas])
    t_min, t_prom = mejor([x["ttft"] for x in corridas])

    print("\n" + "=" * 68)
    print("VEREDICTO (medido, no asumido)")
    print("=" * 68)
    print(f"  total blocking   mínimo {fmt(b_min)}  promedio {fmt(b_prom)}")
    print(f"  total streaming  mínimo {fmt(s_min)}  promedio {fmt(s_prom)}")
    print(f"  primer token (solo se puede saber en streaming)  mínimo {fmt(t_min)}")
    delta = s_min - b_min
    if delta < 0:
        suerte = f"el streaming ademas {fmt(-delta)} MAS RAPIDO en total"
    else:
        suerte = f"el streaming tarda {fmt(delta)} MAS en total (el encuadramiento por trozos cuesta)"
    print(f"\n  En TOTAL hacen casi lo mismo ({fmt(b_min)} vs {fmt(s_min)}): {suerte}.")
    print(f"  La unica diferencia grande es el primer caracter: {fmt(t_min)} en streaming "
          f"contra {fmt(b_min)} en blocking. Eso es lo que el CMD llama 'volar'.")

    print("\n" + "-" * 68)
    print("POR QUÉ EL EJEMPLO ORIGINAL NO CONTESTA LA PREGUNTA")
    print("-" * 68)
    print("  1. No mide nada: imprime al final (lenta) o imprime en el camino (rapida).")
    print("     Sensación de velocidad != velocidad. El total es el mismo trabajo.")
    print("  2. No fija keep_alive: tras 5 min de inactividad el siguiente pago")
    print("     (probablemente la primera llamada cronometrada) incluye bajar los pesos.")
    print("  3. No manda num_ctx: hereda el default del server. Si el server tiene un")
    print("     contexto global grande, la KV-cache se paga en RAM y en segundos, y eso")
    print("     dominar la medición por encima de stream vs blocking.")
    print("  4. Compara en el orden equivocado: la primera de las dos siempre paga la")
    print("     carga del modelo. Intercalar el orden o hacer warmup es obligatorio.")

    if args.comparar_ctx:
        print("\n" + "=" * 68)
        print("LA VARIABLE QUE DE VERDAD MUEVE LA AGUJA: num_ctx")
        print("=" * 68)
        for ctx in [c.strip() for c in args.comparar_ctx.split(",") if c.strip()]:
            try:
                n = int(ctx)
            except ValueError:
                print(f"  (descartado {ctx!r}: no es un número)")
                continue
            args.ctx = n
            try:
                s = medir_stream(cliente, args)
                b = medir_blocking(cliente, args)
            except Exception as e:
                print(f"  num_ctx={n}: fallo ({type(e).__name__})")
                continue
            print(f"  num_ctx={n:6d} → stream ttft {fmt(s['ttft'])} total {fmt(s['total'])} "
                  f"· blocking total {fmt(b['total'])}")
        print("\n  Si el total CRECE con el contexto, el culpable es la KV-cache, no el")
        print("  modo de llamada. Es el mismo diagnóstico del caso 256k de la casa.")

    print()


if __name__ == "__main__":
    main()
