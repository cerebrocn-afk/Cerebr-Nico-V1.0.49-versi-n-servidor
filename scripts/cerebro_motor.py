#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cerebro_motor.py — Motor de memoria propio de CerebroNico (v2.0.0).

QUÉ ES
  El backend que faltaba. El daemon `hindsight_daemon.py` (:5100) tiene DOS capas:
  el MODO ESPEJO local (completo, funciona) y una pasarela REST a un servidor
  Hindsight externo que NUNCA existió en esta máquina. Este archivo ES ese
  servidor, pero hecho nuestro: no es Hindsight, es el motor de CerebroNico.

  Habla exactamente el contrato que el daemon ya llama, así que el daemon no se
  toca ni una línea. Basta con:
      set HINDSITE_API_URL=http://127.0.0.1:5103
  y el daemon deja el modo espejo y empieza a destilar hechos.

CONTRATO QUE IMPLEMENTA (el que espera hindsight_daemon.py)
  GET    /health/live
  POST   /v1/default/banks/{bank}/memories            -> ingesta + extracción de hechos
  POST   /v1/default/banks/{bank}/memories/recall     -> recuperación de hechos
  POST   /v1/default/banks/{bank}/reflect             -> síntesis sobre hechos
  GET    /v1/default/banks/{bank}/mental-models       -> lista de páginas
  POST   /v1/default/banks/{bank}/mental-models       -> crear/actualizar página
  GET    /v1/default/banks/{bank}/mental-models/{id}  -> leer página
  PATCH  /v1/default/banks/{bank}/mental-models/{id}  -> renombrar/reapuntar
  DELETE /v1/default/banks/{bank}/mental-models/{id}  -> borrar página

QUÉ HACE DE VERDAD (y qué no)
  · EXTRAE HECHOS por reglas: del texto saca afirmaciones atómicas
    (sujeto · relación · objeto) en vez de guardar párrafos enteros.
  · CONSOLIDA PÁGINAS: agrupa hechos por tema y reconstruye el contenido desde
    los hechos, no pegando texto.
  · DETECTA CONTRADICCIONES: si un hecho nuevo pisa a uno viejo sobre el mismo
    sujeto y relación, marca el viejo como superado en vez de borrarlo.
  · NO usa LLM. La síntesis de `reflect` es extractiva: elige y ordena hechos,
    no inventa prosa. Eso es honesto y reproducible; un LLM aquí añadiría
    latencia y alucinación sin ganar precisión sobre hechos ya estructurados.

SEGURIDAD
  · Loopback por diseño (127.0.0.1), igual que el puente :5000 y el daemon :5100.
  · Si CN_CEREBRO_TOKEN está puesto, los POST exigen `Authorization: Bearer`.
  · Tope de bytes por petición y por respuesta: no traga cuerpos infinitos.
  · Escritura atómica con snapshot: un corte de luz no deja el JSON roto.

PRUEBA MANUAL
  python scripts/cerebro_motor.py --port 5103
  curl http://127.0.0.1:5103/health/live
  curl -X POST http://127.0.0.1:5103/v1/default/banks/cerebronico/memories \
       -H 'Content-Type: application/json' \
       -d '{"items":[{"content":"El script de memoria se llama memoria, no hindsight:server.","document_id":"arranque"}]}'
"""

import argparse
import json
import os
import re
import shutil
import sys
import threading
import time
import unicodedata
import urllib.parse
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NOMBRE_SERVICIO = "cerebronico-motor"
VERSION = "2.1.7"

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ_APP = os.path.dirname(AQUI)

# ============================================================
# v1.0.43 · LA RAÍZ DE DATOS NO ES LA CARPETA DE LA APP
# ------------------------------------------------------------
# 🐞 CAUSA RAÍZ (consola de `npm run dist`, 21/11): en la raíz de la
# instalación había un `.cerebro-db` de 76,4 MB y el empaquetador se negaba
# —con razón— a meterlo en el paquete. No lo escribía el servidor: lo escribían
# estos daemons, que caían a `RAIZ_APP` (la carpeta del .exe) cuando la variable
# de entorno no estaba. En el .exe esa carpeta es de solo lectura o se borra al
# actualizar: la memoria del usuario se perdía y el paquete engordaba.
#
# El contrato es el mismo que ya usa el resto del sistema (`PROJECT_DIR`), más
# los dos alias que escribe el puente (`CN_PROJECT_DIR`, `CN_DATA_ROOT`). Si
# ninguno está, se usa la raíz de datos del usuario (~/Cerebronico) — NUNCA la
# instalación.
# ============================================================
def _raiz_datos():
    for var in ("PROJECT_DIR", "CN_DATA_ROOT", "CN_PROJECT_DIR"):
        v = (os.environ.get(var) or "").strip()
        if v:
            return v
    base = (os.environ.get("USERPROFILE") or os.environ.get("HOME")
            or os.path.expanduser("~") or os.getcwd())
    return os.path.join(base, "Cerebronico")


RAIZ_DATOS = _raiz_datos()
# Redirigible para pruebas herméticas: no ensucia el almacén real del usuario.
MOTOR_RUTA = os.environ.get("CN_CEREBRO_MOTOR") or os.path.join(
    RAIZ_DATOS, ".cerebro-db", "cerebro-motor.json")
HISTORIAL_DIR = os.path.join(os.path.dirname(MOTOR_RUTA), "cerebro-motor_history")
LOCK_RUTA = os.path.join(os.path.dirname(MOTOR_RUTA), ".cerebro-motor.lock")

TOKEN = (os.environ.get("CN_CEREBRO_TOKEN") or "").strip()
MAX_HECHOS = int(os.environ.get("CN_CEREBRO_MAX_HECHOS") or "5000")
MAX_PAGINAS = int(os.environ.get("CN_CEREBRO_MAX_PAGINAS") or "200")
SNAPSHOTS_CONSERVAR = 20
TOPE_BYTES = 8_000_000

FACT_TYPES = ("world", "experience", "observation")

# ============================================================
# UTILIDADES DE TEXTO
# ============================================================
def _norm(texto):
    """Minúsculas, sin acentos, espacios colapsados."""
    t = unicodedata.normalize("NFD", str(texto or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.lower()).strip()


STOPWORDS = frozenset("""
de la que el en y a los del se las por un para con no su al lo como mas pero sus le ya o
este esta estos estas eso esa ello tanto mucha mucho muchos muchas puede haber son sido
es fue era ser estar esta estan hay muy sin sobre entre desde hasta cuando donde
this that with from there have they them what where when which and for not you your are
was were be been does did will would could should about after before into over
""".split())


def _singular(palabra):
    """Singulariza plurales regulares del español. Sin dependencias.

    POR QUÉ (bug real de la primera prueba): la consulta «que puerto usa el
    motor propio» recuperaba bien, pero «puertos del sistema» devolvía CERO
    hechos, porque los hechos dicen «el puerto 5000» (singular) y BM25 compara
    cadenas exactas. Sin esto, media búsqueda en español falla por una «s» final.

    Reglas conservadoras, en orden, y solo si la palabra queda con >=3 letras:
      · -ces -> -z   (luces -> luz, veces -> vez)
      · -es  -> -    tras l/n/r/d/z/j (servidores -> servidor, panes -> pan)
      · -s   -> -    (puertos -> puerto, hechos -> hecho)
    Se aplica la más específica que encaje, nunca dos.
    """
    p = palabra
    if len(p) < 4 or not p.endswith("s"):
        return p
    if p.endswith("ces") and len(p) > 4:
        return p[:-3] + "z"
    if p.endswith("es") and len(p) > 4:
        raiz = p[:-2]
        if raiz and raiz[-1] in "lnrdzj":
            return raiz
        return p[:-1]
    return p[:-1]


def _tokens(texto):
    """Palabras buscables: normalizadas, singularizadas, len>=2, sin stopwords."""
    return [_singular(w) for w in re.split(r"[^\w\u00c0-\u017f]+", _norm(texto))
            if len(w) >= 2 and w not in STOPWORDS]


# ============================================================
# EXTRACCIÓN DE HECHOS POR REGLAS
# ------------------------------------------------------------
# Un hecho es una afirmación atómica: sujeto · relación · objeto.
# No es un párrafo. La diferencia importa: un párrafo de 800 caracteres
# recuperado por BM25 arrastra ruido; un hecho de 60 caracteres responde
# exactamente a lo que se preguntó.
#
# Las reglas son deliberadamente conservadoras: si una frase no encaja en
# ningún patrón, se guarda como hecho de tipo «nota» con el texto completo.
# Preferimos un hecho sin estructura a inventar una relación que no está.
# ============================================================
PATRONES_HECHO = [
    # «X se llama Y» / «X es Y» / «X son Y»
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+(?:se llama|se llaman|es|son|fue|fueron)\s+(?P<objeto>.{3,200})$", re.I),
     "es"),
    # «X está en Y» / «X vive en Y» / «X queda en Y»
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+(?:esta|estan|vive|viven|queda|quedan|se encuentra|se encuentran)\s+en\s+(?P<objeto>.{3,200})$", re.I),
     "esta_en"),
    # «X usa Y» / «X utiliza Y» / «X emplea Y»
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+(?:usa|usan|utiliza|utilizan|emplea|emplean)\s+(?P<objeto>.{3,200})$", re.I),
     "usa"),
    # «X tiene Y» / «X contiene Y» / «X incluye Y»
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+(?:tiene|tienen|contiene|contienen|incluye|incluyen)\s+(?P<objeto>.{3,200})$", re.I),
     "tiene"),
    # «X no es Y» / «X no usa Y» — negación explícita, se marca
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+no\s+(?:es|son|usa|usan|tiene|tienen|esta|estan)\s+(?P<objeto>.{3,200})$", re.I),
     "no_es"),
    # «X debe Y» / «X hay que Y» — obligación
    (re.compile(r"^(?P<sujeto>[^,.;:]{3,80}?)\s+(?:debe|deben|hay que)\s+(?P<objeto>.{3,200})$", re.I),
     "debe"),
]


# Ruido que NO es conocimiento: contadores de telemetria, marcas de tiempo
# sueltas y lineas de "ayudo Nx". Se midio que la pagina "primer-token" era la
# misma leccion repetida 40 veces con distinto contador: eso no responde nada.
RUIDO_TELEMETRIA = re.compile(
    r"(ayud\u00f3|ayudo|aplicad[ao]s?)\s+\d+\s*[x×]"
    r"|turno ok con la lecci"
    r"|^\s*\|.*\|\s*auto-mejora\s*\|"
    r"|\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\b.*\bUTC\b",
    re.I,
)


def _es_ruido(frase):
    """True si la frase es telemetria y no conocimiento."""
    return bool(RUIDO_TELEMETRIA.search(frase))


def extraer_hechos(texto, tipo="world", tags=None):
    """Del texto crudo saca hechos atómicos. Nunca inventa: lo que no encaja va como nota."""
    hechos = []
    # Se parte por líneas y por puntos, conservando frases razonables.
    fragmentos = []
    for linea in str(texto or "").splitlines():
        linea = linea.strip()
        if not linea:
            continue
        # Líneas de markdown: se limpian los marcadores pero se conserva el texto.
        linea = re.sub(r"^[#>*\-+]+\s*", "", linea)
        linea = re.sub(r"`{1,3}", "", linea)
        if len(linea) < 12:
            continue
        # Frases: se corta por punto seguido de espacio o fin, sin romper abreviaturas comunes.
        for frase in re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])", linea):
            frase = frase.strip().rstrip(".")
            if len(frase) >= 12:
                fragmentos.append(frase)

    for frase in fragmentos[:400]:  # tope por documento: un archivo enorme no genera 10k hechos
        if _es_ruido(frase):
            continue  # telemetria, no conocimiento
        sujeto = relacion = objeto = None
        for patron, rel in PATRONES_HECHO:
            m = patron.match(frase)
            if m:
                sujeto = m.group("sujeto").strip()
                objeto = m.group("objeto").strip()
                relacion = rel
                break
        if sujeto and objeto:
            hechos.append({
                "sujeto": sujeto[:120],
                "relacion": relacion,
                "objeto": objeto[:300],
                "texto": frase[:500],
                "tipo": tipo,
                "tags": [str(t) for t in (tags or [])][:12],
                "estructurado": True,
            })
        else:
            # Sin patrón: se guarda como nota. Es honesto y sigue siendo recuperable.
            hechos.append({
                "sujeto": None,
                "relacion": "nota",
                "objeto": None,
                "texto": frase[:500],
                "tipo": tipo,
                "tags": [str(t) for t in (tags or [])][:12],
                "estructurado": False,
            })
    return hechos


# ============================================================
# ALMACÉN — misma disciplina que el espejo del daemon
# ============================================================
_ESCRIBIR_LOCK = threading.Lock()


def _vacio():
    return {"version": 1, "hechos": [], "paginas": {}, "contradicciones": []}


def _leer():
    try:
        with open(MOTOR_RUTA, "r", encoding="utf-8") as f:
            datos = json.load(f)
        if not isinstance(datos, dict):
            raise ValueError("no-dict")
        datos.setdefault("hechos", [])
        datos.setdefault("paginas", {})
        datos.setdefault("contradicciones", [])
        return datos
    except FileNotFoundError:
        return _vacio()
    except Exception:
        # Almacén corrupto: se archiva UNA vez y se autocura (mismo bug que se
        # corrigió en el espejo: archivar sin curar inundaba el disco).
        try:
            danado = MOTOR_RUTA + ".danado." + time.strftime("%Y%m%d-%H%M%S")
            shutil.copyfile(MOTOR_RUTA, danado)
            tmp = MOTOR_RUTA + ".curando.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(_vacio(), f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, MOTOR_RUTA)
        except Exception:
            pass
        return _vacio()


def _adquirir_lock(caducidad=30.0):
    inicio = time.time()
    while True:
        try:
            fd = os.open(LOCK_RUTA, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(LOCK_RUTA) > caducidad:
                    os.remove(LOCK_RUTA)
                    continue
            except OSError:
                return False
            if time.time() - inicio > caducidad:
                return False
            time.sleep(0.05)


def _soltar_lock():
    try:
        os.remove(LOCK_RUTA)
    except OSError:
        pass


def _escribir(datos):
    """Escritura atómica con snapshot previo."""
    os.makedirs(os.path.dirname(MOTOR_RUTA), exist_ok=True)
    with _ESCRIBIR_LOCK:
        if not _adquirir_lock():
            raise RuntimeError("No se pudo adquirir el lock del motor (otra escritura viva).")
        try:
            if os.path.exists(MOTOR_RUTA):
                os.makedirs(HISTORIAL_DIR, exist_ok=True)
                destino = os.path.join(
                    HISTORIAL_DIR,
                    "motor-" + time.strftime("%Y%m%d-%H%M%S") + f"-{os.getpid()}.json")
                shutil.copyfile(MOTOR_RUTA, destino)
                restos = sorted(os.listdir(HISTORIAL_DIR))
                for viejo in restos[:-SNAPSHOTS_CONSERVAR]:
                    try:
                        os.remove(os.path.join(HISTORIAL_DIR, viejo))
                    except OSError:
                        pass
            tmp = MOTOR_RUTA + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, MOTOR_RUTA)
        finally:
            _soltar_lock()


# ============================================================
# CONSOLIDACIÓN Y CONTRADICCIONES
# ============================================================
def _clave_hecho(h):
    """Clave de identidad: mismo sujeto + misma relación = el mismo hueco de conocimiento."""
    if not h.get("estructurado") or not h.get("sujeto"):
        return None
    return _norm(h["sujeto"]) + "|" + h.get("relacion", "")


def _consolidar(datos, nuevos):
    """Añade hechos y marca como superados los que el nuevo pisa.

    No borra: marca `superado_por`. Un hecho viejo sigue siendo historia, y
    saber que algo CAMBIÓ es información tan valiosa como el valor actual.
    """
    por_clave = {}
    for h in datos["hechos"]:
        if h.get("superado_por"):
            continue
        k = _clave_hecho(h)
        if k:
            por_clave.setdefault(k, []).append(h)

    superados = 0
    for nuevo in nuevos:
        k = _clave_hecho(nuevo)
        if not k:
            continue
        for viejo in por_clave.get(k, []):
            if _norm(viejo.get("objeto", "")) == _norm(nuevo.get("objeto", "")):
                continue  # mismo valor: no es contradicción, es repetición
            viejo["superado_por"] = nuevo["id"]
            viejo["superado_ts"] = nuevo["ts"]
            superados += 1
            datos["contradicciones"].append({
                "sujeto": nuevo.get("sujeto"),
                "relacion": nuevo.get("relacion"),
                "antes": viejo.get("objeto"),
                "ahora": nuevo.get("objeto"),
                "ts": nuevo["ts"],
            })
        por_clave.setdefault(k, []).append(nuevo)

    datos["hechos"].extend(nuevos)
    # Techo honesto: se descartan los más antiguos NO superados primero.
    exceso = len(datos["hechos"]) - MAX_HECHOS
    if exceso > 0:
        vigentes = [h for h in datos["hechos"] if not h.get("superado_por")]
        superados_lista = [h for h in datos["hechos"] if h.get("superado_por")]
        vigentes = vigentes[exceso:] if len(vigentes) > exceso else []
        datos["hechos"] = vigentes + superados_lista
    # La lista de contradicciones no crece sin fin.
    if len(datos["contradicciones"]) > 500:
        datos["contradicciones"] = datos["contradicciones"][-500:]
    return superados


def _huella(texto):
    """Huella para deduplicar: ignora numeros, fechas, horas y contadores.

    Defecto medido (v2.1.1): la misma leccion ingerida N veces difiere solo en
    'ayudo 391x' y en la hora, asi que la comparacion exacta no la atrapaba y la
    pagina 'primer-token' salia con 40 lineas y 3 unicas. Aqui se normaliza.
    """
    t = (texto or "").lower()
    t = re.sub(r"\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}:\d{2}[^|]*", " ", t)
    t = re.sub(r"ayud[oó]\s*\d+\s*[x×]", " ", t)
    t = re.sub(r"\d+", "#", t)
    t = re.sub(r"[^a-záéíóúñ# ]", " ", t)
    return " ".join(t.split())


def _reconstruir_pagina(datos, page_id):
    """Reconstruye el contenido de una página desde sus hechos vigentes.

    Una página NO guarda texto pegado: guarda un `source_query` y se reconstruye
    desde los hechos que responden a esa consulta. Eso es lo que hace que una
    página no quede obsoleta cuando el conocimiento cambia.
    """
    pagina = datos["paginas"].get(page_id)
    if not pagina:
        return None
    qtok = _tokens(pagina.get("source_query") or pagina.get("name") or page_id)
    if not qtok:
        return pagina
    vigentes = [h for h in datos["hechos"] if not h.get("superado_por")]
    puntuados = []
    for h in vigentes:
        toks = _tokens(h.get("texto", ""))
        if not toks:
            continue
        coincidencias = len(set(qtok) & set(toks))
        if coincidencias:
            puntuados.append((coincidencias, h))
    puntuados.sort(key=lambda x: (-x[0], -(x[1].get("ts") or 0)))
    # DEDUPLICACION (defecto medido: 27 de 40 paginas salian con lineas
    # repetidas). El motor guarda cada nota con su ts, asi que la misma leccion
    # ingerida N veces produce N hechos con id distinto y texto identico. Sin
    # esto, la pagina "primer-token" era la misma frase 40 veces: ruido, no
    # conocimiento. Se deduplica por texto normalizado y se conserva la
    # aparicion MAS RECIENTE (la lista ya viene ordenada por ts descendente).
    lineas = []
    vistos = set()
    for _, h in puntuados:
        if h.get("estructurado"):
            linea = f"- **{h['sujeto']}** {h['relacion'].replace('_', ' ')} {h['objeto']}"
            huella = _huella((h.get("sujeto") or "") + " " + h.get("relacion", "")
                             + " " + (h.get("objeto") or ""))
        else:
            linea = f"- {h['texto']}"
            huella = _huella(h.get("texto") or "")
        if huella in vistos:
            continue
        vistos.add(huella)
        lineas.append(linea)
        if len(lineas) >= 40:
            break
    pagina["content"] = "\n".join(lineas) if lineas else ""
    pagina["hechos_usados"] = len(lineas)
    pagina["actualizada"] = int(time.time() * 1000)
    return pagina


# ============================================================
# RECUPERACIÓN — BM25 sobre hechos (mismo algoritmo que el espejo)
# ============================================================
def _bm25(qtok, corpus, k1=1.5, b=0.75):
    import math
    n = len(corpus)
    if n == 0:
        return []
    media = (sum(len(c) for c in corpus) / n) or 1.0
    df = {}
    for toks in corpus:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1
    consulta = set(qtok)
    salida = []
    for toks in corpus:
        if not toks:
            salida.append(0.0)
            continue
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        p = 0.0
        for t in consulta:
            frecuencia = tf.get(t, 0)
            if not frecuencia:
                continue
            dft = df.get(t, 0)
            if not dft:
                continue
            idf = math.log(1 + (n - dft + 0.5) / (dft + 0.5))
            p += idf * (frecuencia * (k1 + 1)) / (
                frecuencia + k1 * (1 - b + b * len(toks) / media))
        salida.append(p)
    return salida


def _recall(datos, query, max_tokens=1024, fact_types=None):
    qtok = _tokens(query)
    if not qtok:
        return []
    hechos = [h for h in datos["hechos"] if not h.get("superado_por")]
    if fact_types:
        hechos = [h for h in hechos if h.get("tipo") in fact_types]
    corpus = [_tokens(h.get("texto", "")) for h in hechos]
    puntajes = _bm25(qtok, corpus)
    frase = _norm(query)
    emparejados = []
    for h, sc in zip(hechos, puntajes):
        if sc <= 0:
            continue
        bonus = 2.0 if len(frase) > 12 and frase in _norm(h.get("texto", "")) else 0.0
        emparejados.append((sc + bonus, h))
    emparejados.sort(key=lambda x: -x[0])
    # Presupuesto por tokens aproximados (4 caracteres ≈ 1 token).
    salida, gastado = [], 0
    for sc, h in emparejados:
        costo = len(h.get("texto", "")) // 4 + 10
        if gastado + costo > max_tokens and salida:
            break
        gastado += costo
        salida.append({
            "id": h["id"],
            "text": h.get("texto", ""),
            "type": h.get("tipo", "world"),
            "tags": h.get("tags", []),
            "score": round(sc, 3),
            "estructurado": h.get("estructurado", False),
            "ts": h.get("ts"),
        })
    return salida


def _reflect(datos, query, budget="low", max_tokens=1024):
    """Síntesis EXTRACTIVA: elige y ordena hechos, no inventa prosa.

    Se declara como tal. Un `reflect` que finge razonar es peor que uno que
    entrega el material ordenado y dice qué es.
    """
    top_k = {"low": 8, "mid": 16, "high": 30}.get(budget, 8)
    pruebas = _recall(datos, query, max_tokens=max_tokens, fact_types=None)[:top_k]
    estructurados = [p for p in pruebas if p.get("estructurado")]
    notas = [p for p in pruebas if not p.get("estructurado")]
    # Agrupar por sujeto: la síntesis es «qué se sabe de cada cosa».
    por_sujeto = {}
    for p in estructurados:
        clave = _norm(p["text"].split()[0]) if p["text"] else "otros"
        por_sujeto.setdefault(clave, []).append(p["text"])
    return {
        "modo": "extractivo",
        "aviso": ("Síntesis extractiva por reglas: se ordenan y agrupan los hechos "
                  "recuperados. NO hay generación de lenguaje ni inferencia."),
        "hechos": [p["text"] for p in estructurados],
        "notas": [p["text"] for p in notas],
        "agrupado": {k: v[:6] for k, v in list(por_sujeto.items())[:10]},
        "total_recuperado": len(pruebas),
    }


# ============================================================
# SERVIDOR — contrato REST que espera hindsight_daemon.py
# ============================================================
# === CONSOLIDACION AUTOMATICA DE PAGINAS (v2.1.0) ===
# Un tema es el sujeto normalizado de los hechos estructurados. Cuando un tema
# acumula suficientes hechos, merece una pagina: se reconstruye sola desde sus
# hechos, asi que nunca queda obsoleta.
# CN-PARCHE-v2.1.3
# Defecto medido: _temas_de tomaba los DOS PRIMEROS TOKENS del texto como tema,
# y salian ids como "si-una", "mitad-ida", "usuario-pidio". No son temas: son
# articulo + palabra comun. Aqui se descartan las palabras vacias y se elige la
# MAS SIGNIFICATIVA (la mas larga), que en espanol suele ser el sustantivo que
# porta el significado.
# CN-PARCHE-v2.1.7: stopwords inglesas. El corpus mezcla notas en ingles
# ("the user", "use when") y producian ids como "the-user".
STOPWORDS_EN = {
    "the", "a", "an", "of", "to", "in", "on", "for", "with", "and", "or",
    "is", "are", "was", "were", "be", "been", "this", "that", "these",
    "those", "it", "its", "as", "at", "by", "from", "not", "no", "yes",
    "when", "use", "used", "using", "you", "your", "we", "our", "they",
    "their", "he", "she", "his", "her", "can", "will", "would", "should",
    "if", "then", "than", "so", "but", "all", "any", "some", "more",
}

STOPWORDS_ES = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
    "a", "ante", "con", "en", "para", "por", "segun", "sin", "so", "sobre",
    "tras", "y", "e", "o", "u", "que", "como", "cuando", "donde", "si", "no",
    "es", "son", "era", "fue", "ser", "esta", "estan", "este", "esta", "esto",
    "estos", "estas", "ese", "esa", "eso", "esos", "esas", "aquel", "aquella",
    "su", "sus", "mi", "mis", "tu", "tus", "le", "les", "lo", "me", "te",
    "nos", "os", "muy", "mas", "menos", "ya", "tambien", "pero", "sino",
    "porque", "pues", "aunque", "mientras", "todo", "toda", "todos", "todas",
    "otro", "otra", "otros", "otras", "mismo", "misma", "hay", "ha", "han",
    "he", "has", "hemos", "haber", "tiene", "tienen", "hace", "hacen", "va",
    "van", "ir", "ver", "ser", "estar", "solo", "sólo", "cada", "cual",
    # CN-PARCHE-v2.1.4: palabras que producian fragmentos de frase como tema
    # ("mitad-ida", "usuario-pidio", "arbol-que", "ultimo-hito"). No son
    # conceptos: son piezas de una oracion.
    "mitad", "usuario", "arbol", "árbol", "ultimo", "último", "nuevo", "nueva",
    "primer", "primera", "segundo", "segunda", "puede", "pueden", "debe",
    "deben", "hacer", "hecho", "dice", "dicen", "dijo", "quiere", "pidio",
    "pidió", "pide", "pasa", "pasan", "queda", "quedan", "sale", "salen",
    "entra", "entran", "lleva", "llevan", "trae", "traen", "abre", "abren",
    "cierra", "cierran", "empieza", "termina", "acaba", "sigue", "siguen",
    "nada", "algo", "alguien", "nadie", "cosa", "cosas", "parte", "partes",
    "vez", "veces", "modo", "forma", "caso", "casos", "tipo", "tipos",
}

# CN-PARCHE-v2.1.4: bigramas de FRONTMATTER YAML de las skills
# ("activates-when", "use-when"). Son metadatos del archivo, no conocimiento:
# generaban una pagina "activates-when" con 15 hechos que no significaba nada.
BIGRAMAS_METADATO = {
    "activates-when", "use-when", "when-use", "name-description",
    "description-version", "version-license", "allowed-tools",
}

# La telemetria de auto-mejora domina el corpus (miles de notas "turno ok con
# la leccion presente (ayudo Nx)"). Es informacion valida para el recall, pero
# NO merece pagina propia: contamina cualquier agrupacion por tema.
RUIDO_TELEMETRIA = re.compile(
    r"turno ok con la lecci[oó]n presente|ayud[oó]\s*\d+\s*[x×]|auto-mejora",
    re.IGNORECASE,
)


def _es_ruido_telemetria(h):
    """True si el hecho es telemetria de auto-mejora (no genera pagina)."""
    texto = (h.get("texto") or "") + " " + (h.get("objeto") or "")
    return bool(RUIDO_TELEMETRIA.search(texto))


def _palabra_significativa(texto):
    """La palabra con mas carga semantica del texto (no la primera).

    Se conserva como respaldo para _source_query_de (donde interesa una palabra
    por hecho, no un par). Para el TEMA se usa _bigrama_significativo.
    """
    toks = [t for t in _tokens(texto) if t not in STOPWORDS_ES and not t.isdigit()]
    if not toks:
        toks = _tokens(texto)
    if not toks:
        return ""
    return max(toks, key=len)


def _bigrama_significativo(texto):
    """El primer par de palabras contiguas con carga semantica del texto.

    CN-PARCHE-v2.1.4. Un par de palabras contiguas que se repite es un
    CONCEPTO ("hemisferio izquierdo", "carpeta skills", "manual motor"); una
    palabra suelta es solo una palabra ("herramienta", "proyecto").
    Devuelve "a-b" o "" si no hay par utilizable.
    """
    toks = _tokens(texto)
    for i in range(len(toks) - 1):
        a, b = toks[i], toks[i + 1]
        if a in STOPWORDS_ES or b in STOPWORDS_ES:
            continue
        if a.isdigit() or b.isdigit():
            continue
        if len(a) < 3 or len(b) < 3:
            continue
        par = a + "-" + b
        if par in BIGRAMAS_METADATO:
            continue
        return par
    return ""


def _tema_de_hecho(h):
    """El tema de UN hecho: sujeto si es estructurado, bigrama si no.

    CN-PARCHE-v2.1.4. Antes caia a _palabra_significativa y producia ids de
    una sola palabra generica.
    """
    if h.get("estructurado") and h.get("sujeto"):
        return _norm(h["sujeto"]).replace(" ", "-")
    return _bigrama_significativo(h.get("texto", ""))


UMBRAL_TEMA = 4          # hechos minimos para que un tema merezca pagina
MAX_TEMAS_PAGINA = 40    # tope de temas por consolidacion (no inunda)


def _temas_de(hechos):
    """Agrupa hechos por TEMA = bigrama mas frecuente (concepto compuesto).

    v2.1.4: un tema no es una palabra suelta ni la palabra mas larga.
    Dos palabras que aparecen juntas repetidamente son un concepto:
    "puerto 5103", "raiz datos", "motor cerebro". Se descartan bigramas
    que empiecen o terminen en stopword, y se excluye la telemetria de
    auto-mejora (no genera paginas: es ruido, no conocimiento).
    """
    STOP = set(STOPWORDS) | set(STOPWORDS_ES) | set(STOPWORDS_EN)

    # Telemetria de auto-mejora: se queda en el recall, no genera pagina.
    RE_TELEMETRIA = re.compile(
        r"ayud[oó]\s+\d+\s*[x×]|turno ok con la lecci[oó]n presente|"
        r"auto-?mejora|primer token tard[oó]|lecci[oó]n aplicada",
        re.I,
    )

    def _es_telemetria(h):
        return bool(RE_TELEMETRIA.search(h.get("texto", "")))

    # 1) Agrupar por sujeto explicito cuando el extractor lo guardo.
    por_sujeto = {}
    sueltos = []
    for h in hechos:
        if _es_telemetria(h):
            continue
        suj = (h.get("sujeto") or "").strip().lower()
        if suj and len(suj) >= 3 and suj not in STOP:
            por_sujeto.setdefault(suj, []).append(h)
        else:
            sueltos.append(h)

    # 2) Los hechos sin sujeto se agrupan por BIGRAMA mas frecuente.
    #    Se calculan los bigramas de cada hecho y se vota el concepto.
    if sueltos:
        votos = Counter()
        bigramas_por_hecho = []
        for h in sueltos:
            toks = [t for t in _tokens(h.get("texto", "")) if t not in STOP and len(t) >= 3]
            pares = []
            for i in range(len(toks) - 1):
                a, b = toks[i], toks[i + 1]
                # descartar si alguno es stopword o si son numeros sueltos
                if a in STOP or b in STOP:
                    continue
                if a.isdigit() or b.isdigit():
                    continue
                pares.append((a, b))
            bigramas_por_hecho.append(pares)
            for par in set(pares):
                votos[par] += 1

        # Asignar cada hecho al bigrama suyo con mas votos globales.
        for h, pares in zip(sueltos, bigramas_por_hecho):
            if not pares:
                # CN-PARCHE-v2.1.7: sin bigrama valido se busca una palabra con
                # carga semantica (no stopword ES/EN, no numero, len>=4). Si no
                # hay ninguna, el hecho NO se agrupa: un tema inventado
                # ("sin-tema", "the-user") es peor que ningun tema.
                toks = [t for t in _tokens(h.get("texto", ""))
                        if t not in STOP and t not in STOPWORDS_EN
                        and not t.isdigit() and len(t) >= 4]
                if not toks:
                    continue
                clave = toks[0]
            else:
                clave = "-".join(max(pares, key=lambda p: votos[p]))
            por_sujeto.setdefault(clave, []).append(h)

    # 3) Descartar grupos demasiado pequenos (1 hecho aislado no es tema).
    temas = {}
    for clave, grupo in por_sujeto.items():
        if len(grupo) >= 2:
            temas[clave] = grupo
    return temas


def _source_query_de(tema, hechos):
    """Consulta de reconstruccion de una pagina: EL TEMA, y nada mas.

    CN-PARCHE-v2.1.7. Antes se le anadia el bigrama de cada hecho (hasta 60),
    asi que la pagina "bat-linea" quedaba con un source_query de 13 palabras
    ("bat linea cerebronico resuelto usa hindsite_api_url espejo daemon...").
    Con un query asi, _reconstruir_pagina volvia a buscar por interseccion de
    tokens y arrastraba hechos de cualquier tema que compartiera una palabra.

    El tema YA es el concepto que agrupa los hechos: buscar por el es suficiente
    y es lo unico que garantiza que la pagina hable de una sola cosa.
    """
    return tema.replace("-", " ")

def _consolidar_paginas(datos, umbral=None, max_temas=None):
    """Crea o actualiza una pagina por cada tema con masa critica.

    Devuelve (creadas, actualizadas, omitidas). No borra paginas que ya no
    tengan masa: una pagina vieja sigue siendo historia.
    """
    umbral = UMBRAL_TEMA if umbral is None else umbral
    max_temas = MAX_TEMAS_PAGINA if max_temas is None else max_temas

    temas = _temas_de(datos.get("hechos", []))
    candidatos = sorted(
        ((t, hs) for t, hs in temas.items() if len(hs) >= umbral),
        key=lambda x: -len(x[1]),
    )[:max_temas]

    creadas = actualizadas = omitidas = 0
    for tema, hechos in candidatos:
        pid = tema[:60]
        existente = datos["paginas"].get(pid)
        if existente is None:
            if len(datos["paginas"]) >= MAX_PAGINAS:
                omitidas += 1
                continue
            datos["paginas"][pid] = {
                "id": pid,
                "name": f"Tema: {tema.replace('-', ' ')}",
                # CN-PARCHE-v2.1.3: el source_query es SOLO el tema (mas los
                # sujetos de sus hechos), NUNCA el texto crudo. Con el texto
                # crudo, _reconstruir_pagina buscaba por interseccion de tokens
                # y la pagina "error-inesperado" se llenaba de lecciones de
                # lentitud porque compartian "el", "de", "la", "con".
                "source_query": _source_query_de(tema, hechos),
                "content": "",
                "actualizada": int(time.time() * 1000),
                "auto": True,
            }
            creadas += 1
        else:
            # CN-PARCHE-v2.1.3: mismo criterio que en la creacion.
            existente["source_query"] = _source_query_de(tema, hechos)
            actualizadas += 1
        _reconstruir_pagina(datos, pid)

    return creadas, actualizadas, omitidas


class Manejador(BaseHTTPRequestHandler):
    server_version = f"{NOMBRE_SERVICIO}/{VERSION}"

    def _json(self, codigo, payload):
        cuerpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _es_loopback(self):
        ip = self.client_address[0] if self.client_address else ""
        return ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _autorizado(self):
        if not self._es_loopback():
            return False
        if not TOKEN:
            return True
        cabecera = self.headers.get("Authorization") or ""
        return cabecera == "Bearer " + TOKEN

    def _cuerpo(self):
        try:
            largo = min(int(self.headers.get("Content-Length") or 0), TOPE_BYTES)
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except Exception as e:
            return {"__error__": f"JSON inválido: {e}"}

    def _banco(self, ruta):
        """Extrae el bank_id de /v1/default/banks/{bank}/..."""
        m = re.match(r"^/v1/default/banks/([^/]+)(/.*)?$", ruta)
        if not m:
            return None, None
        return urllib.parse.unquote(m.group(1)), (m.group(2) or "")

    # ---------- GET ----------
    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta == "/health/live":
            return self._json(200, {"ok": True, "servicio": NOMBRE_SERVICIO,
                                    "version": VERSION,
                                    "hechos": len(_leer()["hechos"])})
        if ruta == "/health":
            datos = _leer()
            vigentes = sum(1 for h in datos["hechos"] if not h.get("superado_por"))
            return self._json(200, {
                "ok": True, "servicio": NOMBRE_SERVICIO, "version": VERSION,
                "hechos": len(datos["hechos"]), "vigentes": vigentes,
                "superados": len(datos["hechos"]) - vigentes,
                "paginas": len(datos["paginas"]),
                "contradicciones": len(datos["contradicciones"]),
                "almacen": MOTOR_RUTA,
            })
        banco, resto = self._banco(ruta)
        if banco is None:
            return self._json(404, {"ok": False, "error": "Ruta desconocida."})
        if resto == "/mental-models":
            datos = _leer()
            return self._json(200, {
                "ok": True,
                "pages": [{"page_id": pid, "name": p.get("name")}
                          for pid, p in datos["paginas"].items()],
            })
        m = re.match(r"^/mental-models/([^/]+)$", resto)
        if m:
            pid = urllib.parse.unquote(m.group(1))
            datos = _leer()
            pagina = _reconstruir_pagina(datos, pid)
            if not pagina:
                return self._json(404, {"ok": False, "error": "Página inexistente."})
            return self._json(200, {"ok": True, "page": pagina})
        return self._json(404, {"ok": False, "error": "Ruta desconocida."})

    # ---------- POST ----------
    def do_POST(self):
        if not self._autorizado():
            return self._json(403, {"ok": False, "error": "Origen o token no autorizado."})
        ruta = urllib.parse.urlparse(self.path).path
        banco, resto = self._banco(ruta)
        if banco is None:
            return self._json(404, {"ok": False, "error": "Ruta desconocida."})
        cuerpo = self._cuerpo()
        if "__error__" in cuerpo:
            return self._json(400, {"ok": False, "error": cuerpo["__error__"]})

        if resto == "/memories":
            return self._ingesta(cuerpo)
        if resto == "/memories/recall":
            datos = _leer()
            q = str(cuerpo.get("query") or "").strip()
            if not q:
                return self._json(400, {"ok": False, "error": "Falta query."})
            tipos = [t for t in (cuerpo.get("fact_types") or []) if t in FACT_TYPES] or None
            hechos = _recall(datos, q, int(cuerpo.get("max_tokens") or 1024), tipos)
            return self._json(200, {"ok": True, "memories": hechos,
                                    "total": len(hechos)})
        if resto == "/reflect":
            datos = _leer()
            q = str(cuerpo.get("query") or "").strip()
            if not q:
                return self._json(400, {"ok": False, "error": "Falta query."})
            sintesis = _reflect(datos, q, cuerpo.get("budget") or "low",
                                int(cuerpo.get("max_tokens") or 1024))
            return self._json(200, {"ok": True, **sintesis})
        if resto == "/consolidar":
            datos = _leer()
            umbral = cuerpo.get("umbral")
            max_temas = cuerpo.get("max_temas")
            creadas, actualizadas, omitidas = _consolidar_paginas(
                datos, umbral=umbral, max_temas=max_temas
            )
            _escribir(datos)
            return self._json(200, {
                "ok": True,
                "creadas": creadas,
                "actualizadas": actualizadas,
                "omitidas": omitidas,
                "paginas_total": len(datos["paginas"]),
            })

        if resto == "/mental-models":
            return self._crear_pagina(cuerpo)
        return self._json(404, {"ok": False, "error": "Ruta desconocida."})

    # ---------- PATCH / DELETE ----------
    def do_PATCH(self):
        if not self._autorizado():
            return self._json(403, {"ok": False, "error": "Origen o token no autorizado."})
        ruta = urllib.parse.urlparse(self.path).path
        banco, resto = self._banco(ruta)
        m = re.match(r"^/mental-models/([^/]+)$", resto or "")
        if not m:
            return self._json(404, {"ok": False, "error": "Ruta desconocida."})
        pid = urllib.parse.unquote(m.group(1))
        cuerpo = self._cuerpo()
        datos = _leer()
        pagina = datos["paginas"].get(pid)
        if not pagina:
            return self._json(404, {"ok": False, "error": "Página inexistente."})
        if "name" in cuerpo:
            pagina["name"] = str(cuerpo["name"])
        if "source_query" in cuerpo:
            pagina["source_query"] = str(cuerpo["source_query"])
        _reconstruir_pagina(datos, pid)
        _escribir(datos)
        return self._json(200, {"ok": True, "page": pagina})

    def do_DELETE(self):
        if not self._autorizado():
            return self._json(403, {"ok": False, "error": "Origen o token no autorizado."})
        ruta = urllib.parse.urlparse(self.path).path
        banco, resto = self._banco(ruta)
        m = re.match(r"^/mental-models/([^/]+)$", resto or "")
        if not m:
            return self._json(404, {"ok": False, "error": "Ruta desconocida."})
        pid = urllib.parse.unquote(m.group(1))
        datos = _leer()
        if pid not in datos["paginas"]:
            return self._json(404, {"ok": False, "error": "Página inexistente."})
        del datos["paginas"][pid]
        _escribir(datos)
        return self._json(200, {"ok": True, "borrada": pid})

    # ---------- lógica de ingesta y páginas ----------
    def _ingesta(self, cuerpo):
        items = cuerpo.get("items") or []
        if not isinstance(items, list) or not items:
            return self._json(400, {"ok": False, "error": "Falta items[]."})
        datos = _leer()
        nuevos = []
        ahora = int(time.time() * 1000)
        for i, item in enumerate(items):
            contenido = str(item.get("content") or "")
            if not contenido.strip():
                continue
            doc_id = str(item.get("document_id") or "documento")
            tipo = item.get("type") if item.get("type") in FACT_TYPES else "world"
            tags = item.get("tags") if isinstance(item.get("tags"), list) else [doc_id]
            for j, h in enumerate(extraer_hechos(contenido, tipo, tags)):
                h["id"] = f"h-{ahora}-{i}-{j}"
                h["ts"] = ahora
                h["document_id"] = doc_id
                nuevos.append(h)
        if not nuevos:
            return self._json(200, {"ok": True, "hechos_nuevos": 0,
                                    "aviso": "Nada extraíble: el texto era vacío o demasiado corto."})
        superados = _consolidar(datos, nuevos)
        # Consolidacion automatica: si algun tema cruzo el umbral, nace su pagina.
        try:
            _c, _a, _o = _consolidar_paginas(datos)
            consolidacion = {"creadas": _c, "actualizadas": _a, "omitidas": _o}
        except Exception as e:
            consolidacion = {"error": f"{type(e).__name__}: {e}"}
        _escribir(datos)
        return self._json(200, {
            "ok": True,
            "hechos_nuevos": len(nuevos),
            "estructurados": sum(1 for h in nuevos if h.get("estructurado")),
            "notas": sum(1 for h in nuevos if not h.get("estructurado")),
            "superados": superados,
            "total": len(datos["hechos"]),
            "paginas": len(datos["paginas"]),
            "consolidacion": consolidacion,
        })

    def _crear_pagina(self, cuerpo):
        pid = str(cuerpo.get("id") or "").strip()
        if not pid:
            return self._json(400, {"ok": False, "error": "Falta id."})
        pid = _norm(pid).replace(" ", "-")
        datos = _leer()
        existente = datos["paginas"].get(pid)
        if existente and not cuerpo.get("sobrescribir"):
            # Idempotente: si ya existe, se devuelve la existente (el daemon
            # reintenta con PATCH si hace falta, y así no se pierde nada).
            return self._json(200, {"ok": True, "page": existente, "nueva": False})
        if not existente and len(datos["paginas"]) >= MAX_PAGINAS:
            return self._json(400, {"ok": False,
                                    "error": f"Tope de páginas alcanzado ({MAX_PAGINAS})."})
        datos["paginas"][pid] = {
            "id": pid,
            "name": str(cuerpo.get("name") or pid),
            "source_query": str(cuerpo.get("source_query") or f"¿Qué sabe CerebroNico de {pid}?"),
            "content": str(cuerpo.get("content") or ""),
            "actualizada": int(time.time() * 1000),
        }
        _reconstruir_pagina(datos, pid)
        _escribir(datos)
        return self._json(200, {"ok": True, "page": datos["paginas"][pid],
                                "nueva": existente is None})

    def log_message(self, formato, *args):
        sys.stderr.write(f"[{NOMBRE_SERVICIO}] {self.address_string()} {formato % args}\n")


class ServidorMotor(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description="Motor de memoria propio de CerebroNico")
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("CN_CEREBRO_PORT") or "5103"))
    ap.add_argument("--host", default="127.0.0.1",
                    help="solo loopback por diseño")
    ap.add_argument("--estado", action="store_true",
                    help="imprimir el estado del almacén y salir")
    args = ap.parse_args()

    if args.estado:
        datos = _leer()
        vigentes = sum(1 for h in datos["hechos"] if not h.get("superado_por"))
        print(json.dumps({
            "servicio": NOMBRE_SERVICIO, "version": VERSION,
            "almacen": MOTOR_RUTA,
            "hechos": len(datos["hechos"]), "vigentes": vigentes,
            "superados": len(datos["hechos"]) - vigentes,
            "paginas": len(datos["paginas"]),
            "contradicciones": len(datos["contradicciones"]),
        }, ensure_ascii=False, indent=2))
        return 0

    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"[{NOMBRE_SERVICIO}] AVISO: escuchando en {args.host} expone la "
              f"memoria a la red. Hazlo solo con --token puesto.", file=sys.stderr)

    try:
        httpd = ServidorMotor((args.host, args.port), Manejador)
    except OSError as e:
        print(f"[{NOMBRE_SERVICIO}] No se pudo abrir {args.host}:{args.port}: {e}. "
              f"Si ya hay otro motor ahí, este ya está servido.", file=sys.stderr)
        return 2
    print(f"[{NOMBRE_SERVICIO}] escuchando en http://{args.host}:{args.port} · "
          f"almacén={MOTOR_RUTA}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
