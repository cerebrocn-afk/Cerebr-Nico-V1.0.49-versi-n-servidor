#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hindsight_daemon.py — Capa de memoria Hindsight del híbrido CerebroNico × Hindsight (v1.17.0).

QUÉ ES
  Un microservicio HTTP 100% biblioteca estándar que habla el contrato de PACKS
  EXTERNOS de CerebroNico (tools.config.json):
      GET  /tools       -> { "tools": [ {name, description, parameters, destructive?, cheap?} ] }
      POST /tools/call  -> { name, arguments } -> JSON arbitrario (el modelo lo ve tal cual)
      GET  /health      -> estado del servicio

DOS CAPAS, UNA MISMA CARA
  · Si HINDSITE_API_URL está configurado y responde, cada herramienta se TRANSLUCIDA
    a la API REST de Hindsight (retain/recall/reflect/mental-models): memoria
    biomimética real con extracción de hechos, consolidación y síntesis por LLM.
  · Si Hindsight no está (aún) arriba, el demonio sirve el MODO ESPEJO: un almacén
    local en `.cerebro-db/hindsight-mirror.json` con búsqueda por superposición de
    términos (normalizada, sin acentos) y snapshot+reemplazo atómico (las mismas
    garantías de escritura de core-agent/agent_core/loader.py: .tmp + os.replace +
    historial + lock con caducidad). El agente NUNCA ve las herramientas muertas:
    ve degradación honesta, y `memory_estado` dice en qué modo está.

HABILIDADES (skills) COMO HERRAMIENTAS
  `listar_skills` y `leer_skill` exponen la carpeta `skills/` de la app (las skills
  hindsight-* y code-review del híbrido) para que el modelo carge documentación
  bajo demanda sin contaminar el prompt de sistema. Guardia anti-traversal: solo
  rutas dentro de skills/ y solo .md.

SEGURIDAD
  · Escucha SOLO en loopback (127.0.0.1) por diseño; no es un servicio de red.
  · Si CN_HINDSITE_TOKEN está puesto, los POST exigen `X-Cerebro-Token` (el motor
    de CerebroNico ya añade esa cabecera automáticamente a packs en loopback).
  · Nunca se reenvían cabeceras del puente ni tokens a Hindsight salvo Authorization.
  · Tiempo límite por llamada a Hindsight y tope de bytes (no tragar respuestas infinitas).

PRUEBA MANUAL
  python scripts/hindsight_daemon.py --port 5100
  curl http://127.0.0.1:5100/tools
  curl -X POST http://127.0.0.1:5100/tools/call -H 'Content-Type: application/json' \
       -d '{"name":"memory_guardar_aprendizaje","arguments":{"contenido":"El guard JSON bloquea comas de más."}}'
"""

import argparse
import json
import math
import os
import re
import shutil
import socket
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NOMBRE_SERVICIO = "cerebronico-hindsight"
VERSION = "1.2.0-hybrid"

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
# Las dos rutas se pueden redirigir con variables de entorno SOLO para que la
# suite de pruebas corra hermetic sobre un directorio temporal y no ensucie el
# espejo real del usuario ni su carpeta de skills.
ESPEJO_RUTA = os.environ.get("CN_HINDSITE_MIRROR") or os.path.join(RAIZ_DATOS, ".cerebro-db", "hindsight-mirror.json")
SKILLS_DIR = os.environ.get("CN_HINDSITE_SKILLS") or os.path.join(RAIZ_APP, "skills")
HISTORIAL_DIR = os.path.join(os.path.dirname(ESPEJO_RUTA), "hindsight-mirror_history")
LOCK_RUTA = os.path.join(os.path.dirname(ESPEJO_RUTA), ".hindsight-mirror.lock")
# Exportaciones/importaciones (portabilidad de la memoria). Redirigible con
# CN_HINDSITE_EXPORTS para poder probar en un temporal sin escribir en la app.
EXPORTS_DIR = os.environ.get("CN_HINDSITE_EXPORTS") or os.path.join(RAIZ_DATOS, ".cerebro-db", "exportaciones")
# Raíces que memory_indexar_proyecto puede leer: la app por defecto, ampliables
# con CN_HINDSITE_INDEX_ROOTS (separadas por os.pathsep) sin tocar codigo.
# v1.52.0 - Las mismas rutas que el puente :5000 veta. Un pack de memoria que
# camina el disco hereda la politica del puente: si el puente no lo lee, la
# memoria tampoco. Antes bastaba poner C:\\Windows en CN_HINDSITE_INDEX_ROOTS
# para meter System32 en el espejo.
_BLOQUEADAS_SISTEMA = [
    os.path.expanduser("~/.ssh"),
    os.path.expanduser("~/.aws"),
    os.path.expanduser("~/.gnupg"),
    "/etc/shadow",
    "/etc/passwd",
    "/etc/ssl/private",
    "C:\\Windows",
    "C:\\Windows\\System32",
    "C:\\Windows\\SysWOW64",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
]


def _bloqueado_sistema(ruta):
    """True si la ruta cae dentro de una zona del sistema operativo."""
    try:
        r = os.path.realpath(ruta).lower()
    except Exception:
        return True
    for b in _BLOQUEADAS_SISTEMA:
        try:
            rb = os.path.realpath(os.path.expanduser(b)).lower()
        except Exception:
            continue
        if r == rb or r.startswith(rb + os.sep):
            return True
    return False


def _raices_index():
    extras = [r for r in (os.environ.get("CN_HINDSITE_INDEX_ROOTS") or "").split(os.pathsep) if r.strip()]
    validas = []
    for r in extras:
        real = os.path.realpath(r)
        if _bloqueado_sistema(real):
            # Se descarta con aviso, no se ignora en silencio: el usuario tiene
            # que saber que su variable no se aplico y por que.
            sys.stderr.write(
                "[%s] CN_HINDSITE_INDEX_ROOTS descarta %s: zona de sistema bloqueada\n"
                % (NOMBRE_SERVICIO, real))
            continue
        validas.append(real)
    return [os.path.realpath(RAIZ_APP)] + validas
# Directorios jamas indexados: son dependencias, artefactos de build o estado de
# ejecucion. Indexarlos llenaria el espejo de ruido y reventaria el presupuesto.
VETO_DIR = {"node_modules", "dist", "build", "__pycache__", ".proyectos", ".cerebro-db",
            ".revisiones", ".git", "memoria_history", ".venv", "venv", "vendor", "models"}

HINDSITE_URL = (os.environ.get("HINDSITE_API_URL") or "").strip().rstrip("/")
HINDSITE_TOKEN = (os.environ.get("HINDSITE_TOKEN") or "").strip()
BANK_ID = (os.environ.get("HINDSITE_BANK_ID") or "cerebronico").strip() or "cerebronico"
# El banco de CerebroNico se crea perezosamente: la primera escritura lo declara.
MAX_UNIDADES_ESPEJO = int(os.environ.get("CN_HINDSITE_MAX_UNITS") or "2000")
SNAPSHOTS_CONSERVAR = 20
TIEMPO_LIMITE_HS = 30          # segundos por llamada a Hindsight
TOPE_BYTES_HS = 4_000_000       # 4 MB: nunca tragar más

FACT_TYPES = ("world", "experience", "observation")

# === CAPA SEMANTICA (snowflake-arctic-embed) v1.51.1 ===
# Embeddings OPCIONALES via Ollama. Si Ollama no responde, el espejo sigue con
# BM25 puro: la capa semantica SUMA, nunca sustituye. Modelo por defecto:
# snowflake-arctic-embed:33m (67 MB, familia bert, 384 dimensiones).
OLLAMA_URL = (os.environ.get("CN_OLLAMA_URL") or "http://127.0.0.1:11434").strip().rstrip("/")
EMBED_MODELO = (os.environ.get("CN_EMBED_MODEL") or "snowflake-arctic-embed:33m").strip()
EMBED_ACTIVO = (os.environ.get("CN_EMBED_ACTIVO") or "1").strip() not in ("0", "false", "no", "")
EMBED_PESO = float(os.environ.get("CN_EMBED_PESO") or "0.5")   # 0=BM25 puro, 1=solo coseno
EMBED_TIMEOUT = float(os.environ.get("CN_EMBED_TIMEOUT") or "3")  # v2.1.8 · 8 s era la ventana del cliente: un embed que tardaba 8 s la agotaba. Con 3 s el embed lento devuelve None y el recall cae a BM25 (normalizado por acento) en vez de perder la respuesta.
EMBED_DIM = 384
_EMBED_CACHE = {}          # texto_normalizado -> vector (cache en memoria del proceso)
_EMBED_VIVO = {"ok": None, "comprobado": 0.0}
# === FIN CAPA SEMANTICA ===

# ============================================================
# ESPEJO LOCAL — la misma disciplina de escritura que loader.py
# ============================================================
_ESCRIBIR_LOCK = threading.Lock()


def _norm(texto):
    """minúsculas + sin acentos + espacios colapsados (para buscar como un humano rápido)."""
    t = unicodedata.normalize("NFD", str(texto or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.lower()).strip()


def _terminos(texto):
    return [w for w in re.split(r"[^\wñÑ]+", _norm(texto)) if len(w) >= 2]


def _espejo_vacio():
    return {"version": 1, "pages": {}, "units": []}


def _leer_espejo():
    try:
        with open(ESPEJO_RUTA, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("no-dict")
        data.setdefault("pages", {})
        data.setdefault("units", [])
        return data
    except FileNotFoundError:
        return _espejo_vacio()
    except Exception:
        # Un espejo corrupto NO borra la memoria: se archiva UNA vez y el activo
        # se autocura escribiendo un almacén limpio encima.
        #
        # Lo que había (y estaba mal): copiar a `.danado.<timestamp>` y devolver
        # el espejo vacío SIN tocar el archivo. Como el corrupto seguía ahí,
        # CADA lectura volvía a archivarlo: un corte de luz a mitad del JSON
        # inundaba el disco de copias idénticas y el agente leía «memoria vacía»
        # eternamente sin poder volver a escribir nunca sobre ese camino.
        try:
            dañado = ESPEJO_RUTA + ".danado." + time.strftime("%Y%m%d-%H%M%S")
            shutil.copyfile(ESPEJO_RUTA, dañado)
            tmp = ESPEJO_RUTA + ".curando.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(_espejo_vacio(), f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, ESPEJO_RUTA)
        except Exception:
            # Si ni curar se puede (disco lleno, permisos), se sirve el vacío:
            # leer sigue funcionando; la primera escritura que logre pasar
            # volverá a dejar el archivo sano.
            pass
        return _espejo_vacio()


def _adquirir_lock(caducidad=30.0):
    """Lock portable por archivo (fcntl no existe en Windows), como loader.py."""
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


def _escribir_espejo(data):
    """Escritura atómica con snapshot previo: corte de luz no deja JSON roto."""
    os.makedirs(os.path.dirname(ESPEJO_RUTA), exist_ok=True)
    with _ESCRIBIR_LOCK:
        if not _adquirir_lock():
            raise RuntimeError("No se pudo adquirir el lock del espejo (otra escritura viva).")
        try:
            if os.path.exists(ESPEJO_RUTA):
                os.makedirs(HISTORIAL_DIR, exist_ok=True)
                destino = os.path.join(
                    HISTORIAL_DIR,
                    "mirror-" + time.strftime("%Y%m%d-%H%M%S") + f"-{os.getpid()}.json",
                )
                shutil.copyfile(ESPEJO_RUTA, destino)
                restos = sorted(os.listdir(HISTORIAL_DIR))
                for viejo in restos[:-SNAPSHOTS_CONSERVAR]:
                    try:
                        os.remove(os.path.join(HISTORIAL_DIR, viejo))
                    except OSError:
                        pass
            tmp = ESPEJO_RUTA + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, ESPEJO_RUTA)
        finally:
            _soltar_lock()


# ============================================================
# PASARELA HINDSIGHT (REST) — solo si HINDSITE_URL vive
# ============================================================
def hs_activo():
    return bool(HINDSITE_URL)


def hs_llamar(metodo, ruta, cuerpo=None, query=None, tiempo=TIEMPO_LIMITE_HS):
    url = HINDSITE_URL + ruta
    if query:
        url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo)
    req.add_header("Accept", "application/json")
    if datos is not None:
        req.add_header("Content-Type", "application/json")
    if HINDSITE_TOKEN:
        req.add_header("Authorization", "Bearer " + HINDSITE_TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=tiempo) as resp:
            crudo = resp.read(TOPE_BYTES_HS)
        try:
            return True, json.loads(crudo.decode("utf-8"))
        except Exception:
            return True, {"texto": crudo.decode("utf-8", "replace")[:TOPE_BYTES_HS]}
    except urllib.error.HTTPError as e:
        try:
            detalle = e.read(2000).decode("utf-8", "replace")
        except Exception:
            detalle = ""
        return False, {"error": f"Hindsight respondió HTTP {e.code}", "detalle": detalle}
    except Exception as e:
        return False, {"error": f"Hindsight no disponible: {e.__class__.__name__}: {e}"}


# ============================================================
# MODO ESPEJO — recall/reflect/CRUD sobre el almacén local
# ============================================================
# ============================================================
# RECUPERACION BM25-LITE
# ------------------------------------------------------------
# Por que BM25 y no superposicion de terminos (lo que traia la v1.17.0): con
# coincidencia pura, en un espejo grande casi todo empataba en cero y el «top»
# salia por orden de llegada, no por relevancia; y una palabra repetida en todas
# las unidades («guard», «json») dominaba el ranking sin informar nada. BM25
# anade df/idf (lo que esta en todo el corpus pierde peso) y normaliza por
# longitud (una unidad de 3000 caracteres no gana por volumen). Sigue siendo
# biblioteca pura: sin numpy, sin modelo de embeddings, sin red.
# ============================================================
STOPWORDS = frozenset("""
de la que el en y a los del se las por un para con no su al lo como mas pero sus le ya o
este esta estos estas eso esa ello tanto mucha mucho muchos muchas puede haber son sido
this that with from there have they them what where when which and for not you your are
was were be been does did will would could should about after before into over
""".split())


def _tokens(texto):
    """Palabras buscables: normalizadas, sin acentos, con len>=2 y sin stopwords."""
    return [w for w in re.split(r"[^\w\u00c0-\u017f]+", _norm(texto)) if len(w) >= 2 and w not in STOPWORDS]


def _bm25(qtok, corpus, k1=1.5, b=0.75):
    """Puntaje BM25 por documento (posiciones alineadas con `corpus`)."""
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
                # El token de la consulta no aparece en ESTE documento: BM25 suma 0.
                # (Índizar `tf[t]` a secas reventaba con KeyError en cuanto el query
                # traía una palabra ausente del 90 % del corpus — pasó en la prueba.)
                continue
            dft = df.get(t, 0)
            if not dft:
                continue
            idf = math.log(1 + (n - dft + 0.5) / (dft + 0.5))
            p += idf * (frecuencia * (k1 + 1)) / (frecuencia + k1 * (1 - b + b * len(toks) / media))
        salida.append(p)
    return salida


# === CAPA SEMANTICA (snowflake-arctic-embed) v1.51.1 ===
def _embed_disponible(presupuesto=None):
    """Comprueba UNA vez (con cache de 60 s) si Ollama responde con el modelo."""
    if not EMBED_ACTIVO:
        return False
    ahora = time.time()
    if _EMBED_VIVO["ok"] is not None and (ahora - _EMBED_VIVO["comprobado"]) < 60:
        return _EMBED_VIVO["ok"]
    vivo = False
    # v1.51.2 · El chequeo anterior preguntaba por /api/tags con timeout=3: con
    # 49 modelos ese endpoint tarda mas en frio y el embedder se declaraba muerto
    # sin haberlo probado (vivo=false con el modelo residente y respondiendo en 1 s).
    # Ahora se pregunta por el MODELO concreto (/api/show), que es rapido y es la
    # pregunta correcta; si falla, se cae a /api/tags con timeout largo.
    _t = float(os.environ.get("CN_EMBED_CHECK_TIMEOUT") or "15")
    # v2.1.3 — Un ejecutor no puede gastarse el presupuesto de quien lo llama.
    # La suite (y cualquier cliente) corta a los 8 s; /api/show con 15 s de
    # ventana colgaba `memory_vectorizar` y arrastraba el recall detras.
    if presupuesto is not None:
        _t = max(0.5, min(_t, float(presupuesto)))
    try:
        req = urllib.request.Request(
            OLLAMA_URL + "/api/show",
            data=json.dumps({"model": EMBED_MODELO}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_t) as r:
            r.read(4096)
        vivo = True
    except Exception:
        try:
            req = urllib.request.Request(OLLAMA_URL + "/api/tags")
            with urllib.request.urlopen(req, timeout=_t) as r:
                datos = json.loads(r.read(2_000_000).decode("utf-8"))
            nombres = [m.get("name", "") for m in datos.get("models", [])]
            base = EMBED_MODELO.split(":")[0]
            vivo = any(n == EMBED_MODELO or n.startswith(base) for n in nombres)
        except Exception:
            vivo = False
    _EMBED_VIVO["ok"] = vivo
    _EMBED_VIVO["comprobado"] = ahora
    return vivo


def _embed(texto):
    """Vector de 384 dims via Ollama. Devuelve None si no se puede (nunca revienta)."""
    clave = _norm(texto)[:2000]
    if not clave:
        return None
    if clave in _EMBED_CACHE:
        return _EMBED_CACHE[clave]
    if not _embed_disponible():
        return None
    # v1.51.4 - El modelo tiene ventana de 512 tokens: enviar mas provoca HTTP 500
    # en Ollama (no trunca, aborta). Se recorta a 1800 caracteres y, si aun asi
    # falla, se reintenta con 900. Asi ninguna unidad queda sin vector por longitud.
    vec = None
    for recorte in (1800, 900):
        try:
            cuerpo = json.dumps({"model": EMBED_MODELO, "prompt": str(texto)[:recorte]}).encode("utf-8")
            req = urllib.request.Request(OLLAMA_URL + "/api/embeddings", data=cuerpo,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=EMBED_TIMEOUT) as r:
                datos = json.loads(r.read(4_000_000).decode("utf-8"))
            vec = datos.get("embedding") or []
            if vec:
                break
        except Exception:
            vec = None
    if not vec:
        return None
    # v1.51.5 - El bloque de cache estaba DEBAJO de un `return None` (codigo
    # muerto) y ademas arrastraba un `except` sin `try`: SyntaxError de parseo.
    # El demonio no arrancaba nunca y no dejaba ni una linea en memoria.log.
    if len(_EMBED_CACHE) > 4000:
        _EMBED_CACHE.clear()
    _EMBED_CACHE[clave] = vec
    return vec


def _coseno(a, b):
    """Similitud coseno pura, sin numpy. 0.0 si alguno es nulo o de distinto tamano."""
    if not a or not b or len(a) != len(b):
        return 0.0
    punto = na = nb = 0.0
    for x, y in zip(a, b):
        punto += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return punto / (math.sqrt(na) * math.sqrt(nb))


def espejo_recall_semantico(query, top_k=8, fact_types=None, tags=None, include_paginas=False):
    """Recall HIBRIDO: BM25 (siempre) + coseno (si el embedder vive).

    Si el embedder no esta, devuelve exactamente lo mismo que espejo_recall.
    Si esta, normaliza ambos puntajes a [0,1] y los mezcla con EMBED_PESO.
    """
    base = espejo_recall(query, top_k=max(top_k * 3, 24), fact_types=fact_types,
                         tags=tags, include_paginas=include_paginas)
    if not base or not _embed_disponible():
        return base[:top_k]
    qvec = _embed(query)
    if not qvec:
        return base[:top_k]
    datos = _leer_espejo()
    por_id = {u.get("id"): u for u in datos["units"]}
    max_bm25 = max((r.get("score") or 0) for r in base) or 1.0
    for r in base:
        if r.get("fuente") != "unidad":
            continue
        # v2.1.8 · El recall NO vectoriza en caliente: hasta aquí hacía 1 embed de la
        # query + 1 embed POR UNIDAD (hasta 24), y cada uno a 8 s: con Ollama frío o
        # lento el /tools/call pasaba la ventana del cliente (AbortError) y el recall
        # volvía null. Vectorizar es trabajo de `memory_vectorizar`, no del recall.
        # Una unidad sin vector sigue puntuando por BM25 (que normaliza acentos).
        vec = (por_id.get(r.get("id")) or {}).get("vec")
        cos = _coseno(qvec, vec) if vec else 0.0
        r["coseno"] = round(cos, 4)
        r["score_bm25"] = r.get("score")
        r["score"] = round((1 - EMBED_PESO) * ((r.get("score") or 0) / max_bm25)
                           + EMBED_PESO * max(0.0, cos), 4)
    base.sort(key=lambda r: -(r.get("score") or 0))
    return base[:top_k]


def _persistir_vectores(limite=None, presupuesto=None):
    """Guarda los vectores calculados en el espejo.

    v1.51.3 · Acepta `limite`: vectoriza como maximo N unidades y devuelve.
    v2.1.3 · Acepta tambien `presupuesto` (segundos): corta el lote cuando se
    agota y devuelve `(vectorizados, pendientes)`. Razon medida: la herramienta
    llamada SIN argumentos vectorizaba el espejo entero y tardaba 8191 ms contra
    los 8 s de ventana del cliente — se perdia la respuesta, y con ella la de la
    peticion siguiente. Un ejecutor tiene que contestar; lo que no entra en el
    turno queda DECLARADO como pendiente, no silenciado.
    Escribe el espejo al final del lote: si el proceso muere a mitad,
    lo ya vectorizado queda persistido.
    """
    datos = _leer_espejo()
    faltan = [u for u in datos["units"] if not u.get("vec")]
    if not faltan:
        return 0, 0
    if limite is not None:
        try:
            limite = int(limite)
        except (TypeError, ValueError):
            limite = None
        if limite and limite > 0:
            faltan = faltan[:limite]
    inicio = time.monotonic()
    calculados = 0
    procesadas = 0
    for u in faltan:
        if presupuesto is not None and procesadas and (time.monotonic() - inicio) >= presupuesto:
            break
        vec = _embed(u.get("text", ""))
        procesadas += 1
        if vec:
            u["vec"] = vec
            calculados += 1
    if calculados:
        _escribir_espejo(datos)
    pendientes = sum(1 for u in datos["units"] if not u.get("vec"))
    return calculados, pendientes


# === FIN CAPA SEMANTICA ===


def espejo_recall(query, top_k=8, fact_types=None, tags=None, include_paginas=False):
    """Busca en el espejo. `tags` filtra por etiqueta (OR), `fact_types` por tipo.

    `include_paginas` mete las paginas de conocimiento en el mismo ranking: sin
    eso, un «que se ha decidido sobre X» responde solo apuntes sueltos y el
    modelo rehace un trabajo que ya esta sintetizado.
    """
    qtok = _tokens(query)
    if not qtok:
        return []
    datos = _leer_espejo()
    unidades = [u for u in datos["units"] if (u.get("text") or "").strip()]
    if fact_types:
        unidades = [u for u in unidades if u.get("type", "experience") in fact_types]
    if tags:
        deseadas = {str(t).lower() for t in tags}
        unidades = [u for u in unidades if deseadas & {str(t).lower() for t in (u.get("tags") or [])}]
    corpus = [_tokens(u.get("text", "")) for u in unidades]
    puntajes = _bm25(qtok, corpus)
    frase = _norm(query)
    emparejadas = []
    for u, sc in zip(unidades, puntajes):
        if sc <= 0:
            continue
        bonus = 2.0 if len(frase) > 12 and frase in _norm(u.get("text", "")) else 0.0
        emparejadas.append((sc + bonus, u))
    emparejadas.sort(key=lambda x: -x[0])
    salida = [
        {"id": x[1].get("id"), "type": x[1].get("type", "experience"), "tags": x[1].get("tags", []),
         "text": x[1].get("text"), "ts": x[1].get("ts"), "score": round(x[0], 3), "fuente": "unidad"}
        for x in emparejadas[: max(1, int(top_k))]
    ]
    if include_paginas:
        paginas = []
        for pid, page in (datos.get("pages") or {}).items():
            toks = _tokens(str(page.get("name", "")) + " " + str(page.get("content", "")))
            if not toks:
                continue
            sc = _bm25(qtok, [toks])[0]
            if sc > 0:
                paginas.append({"id": pid, "type": "page", "tags": [], "name": page.get("name"),
                                 "text": (page.get("content") or "")[:700], "score": round(sc, 3),
                                 "fuente": "pagina"})
        if paginas:
            salida = sorted(salida + paginas, key=lambda r: -r["score"])[: max(1, int(top_k))]
    return salida


def espejo_reflect(query, presupuesto="low"):
    top_k = {"low": 5, "mid": 8, "high": 12}.get(presupuesto, 5)
    pruebas = espejo_recall(query, top_k=top_k, include_paginas=True)
    datos = _leer_espejo()
    pagina_rel = []
    for pid, page in (datos.get("pages") or {}).items():
        if _norm(page.get("source_query", "")) and any(
            t in _norm(page.get("name", "") + " " + page.get("content", "")) for t in _terminos(query)
        ):
            pagina_rel.append({"page_id": pid, "name": page.get("name"),
                               "content": (page.get("content") or "")[:800]})
    return {
        "modo": "espejo-local",
        "aviso": "Sintesis por BM25 + material recuperado, SIN LLM. "
                 "Para síntesis real arranca Hindsight (npm run hindsight:server) y fija HINDSITE_API_URL.",
        "respuesta_material": [p["text"] for p in pruebas],
        "pruebas": pruebas,
        "paginas_cercanas": pagina_rel[:3],
    }


def espejo_ingresar(contenido, titulo=None, tags=None, tipo="experience",
                    _datos=None, _escribir=True):
    """Ingresa una unidad en el espejo local.

    `_datos` / `_escribir` existen por una razón medida (v1.57.1): la ingesta en
    LOTE (`memory_indexar_proyecto`) pasaba por aquí archivo a archivo y cada
    pasada hacía LECTURA completa + snapshot al historial + escritura atómica con
    fsync. Con 40 archivos eran 40 fsync y 40 copias del espejo: 122 ms en un SSD
    de Linux y MÁS de los 8 s del timeout del test en NTFS con Defender — la suite
    `hindsight` moría a mitad (AbortError sin capturar) y el veredicto entero se
    quedaba sin ejecutar. El lote lee el almacén UNA vez (`_datos`), acumula con
    `_escribir=False` y hace UNA sola escritura al final. Cualquier otro llamador
    no pasa estos parámetros y su comportamiento es idéntico al de antes.
    """
    if tipo not in FACT_TYPES:
        tipo = "experience"
    datos = _datos if _datos is not None else _leer_espejo()
    doc_id = _norm(titulo or "apuntes").replace(" ", "-") or "apuntes"
    unidad = {
        "id": f"u-{int(time.time() * 1000)}-{len(datos['units'])}",
        "text": str(contenido or "")[:8000],
        "document_id": doc_id,
        "type": tipo,
        "tags": [str(t) for t in (tags or [])][:12],
        "ts": int(time.time() * 1000),
    }
    if not unidad["text"].strip():
        return {"ok": False, "error": "contenido vacío"}
    datos["units"].append(unidad)
    # Techo honesto: el espejo no es infinito; se descartan las más antiguas.
    exceso = len(datos["units"]) - MAX_UNIDADES_ESPEJO
    if exceso > 0:
        datos["units"] = datos["units"][exceso:]
    if _escribir:
        _escribir_espejo(datos)
    return {"ok": True, "modo": "espejo-local", "unidad": unidad["id"],
            "unidades_totales": len(datos["units"])}


def espejo_guardar_page(page_id, name, content=None, source_query=None):
    datos = _leer_espejo()
    pid = _norm(page_id).replace(" ", "-")
    if not pid:
        return {"ok": False, "error": "page_id vacío"}
    existente = datos["pages"].get(pid) or {}
    datos["pages"][pid] = {
        "id": pid,
        "name": str(name or existente.get("name") or pid),
        "content": str(content) if content is not None else existente.get("content", ""),
        "source_query": str(source_query or existente.get("source_query") or f"¿Qué sabe CerebroNico de {pid}?"),
        "actualizada": int(time.time() * 1000),
    }
    _escribir_espejo(datos)
    return {"ok": True, "modo": "espejo-local", "page": datos["pages"][pid],
            "nueva": existente == {}}


# ============================================================
# SKILLS — servir documentación bajo demanda con guardia estricta
# ============================================================
def skills_listado():
    if not os.path.isdir(SKILLS_DIR):
        return []
    out = []
    for entrada in sorted(os.listdir(SKILLS_DIR)):
        skill_md = os.path.join(SKILLS_DIR, entrada, "SKILL.md")
        if os.path.isfile(skill_md):
            front = {}
            try:
                with open(skill_md, "r", encoding="utf-8") as f:
                    cabecera = f.read(2000)
                m = re.search(r"^---\s*\n(.*?)\n---", cabecera, re.S)
                if m:
                    for linea in m.group(1).splitlines():
                        mm = re.match(r"^(name|description):\s*(.+)$", linea.strip())
                        if mm:
                            front[mm.group(1)] = mm.group(2).strip()
            except Exception:
                pass
            out.append({"skill": entrada, "name": front.get("name", entrada),
                        "description": front.get("description", "")[:300]})
    return out


def h_listar_skills(args):
    """Lista las skills instaladas, POR PÁGINA y con filtro opcional.

    v1.96.0 · Era `{"ok": True, "skills": skills_listado()}` a secas: con las 100 skills
    de terceros ya devolvía ~38 KB en una sola respuesta de herramienta, y el pedido de
    Mario era sumar 100 más de producción (código, web, app, Word, PDF). Con 200, un
    `listar_skills` sin filtro mete ~76 KB en el contexto del turno — justo en los modelos
    chicos, que son los que tienen techo de contexto. La casa ya tiene valla de presupuesto
    (`techoContexto`); una herramienta que revienta el presupuesto al usarla bien es un
    defecto, no una molestia.

    Se mantiene compatible con lo que ya conoce el modelo: sin argumentos responde, pero
    la primera página; `total` y `siguiente` dicen cuántas quedan, y `filtro` es la vía
    barata (mucho más que leer 200 descripciones).
    """
    a = args or {}
    todas = skills_listado()
    total = len(todas)
    bruto = str(a.get("filtro") or "").strip()
    if bruto:
        f = _norm(bruto)
        todas = [s for s in todas
                 if f in _norm("%s %s %s" % (s.get("skill", ""), s.get("name", ""), s.get("description", "")))]
    try:
        limite = int(a.get("limite") or 40)
    except Exception:
        limite = 40
    limite = max(1, min(100, limite))
    try:
        desde = int(a.get("desde") or 0)
    except Exception:
        desde = 0
    desde = max(0, desde)
    ventana = todas[desde:desde + limite]
    quedan = desde + limite < len(todas)
    return {
        "ok": True,
        "total_instaladas": total,
        "coinciden": len(todas),
        "desde": desde,
        "limite": limite,
        "devueltas": len(ventana),
        "siguiente": desde + limite if quedan else None,
        "skills": ventana,
        "aviso": ('Traje una pagina de %d. Si no esta la que buscaste, volve con `filtro` (una palabra, '
                  'ej. "pdf") o pedi la pagina siguiente con `desde=%d`; no hace falta leer las %d '
                  'descripciones.' % (limite, desde + limite, total)) if quedan else
                 ('Pagina completa: %d skill(s) instalada(s). Usa `skill_buscar` para traer fragmentos '
                  'concretos en vez de leer skills enteras.' % total),
    }


def skill_leer(nombre, archivo="SKILL.md", max_chars=120000):
    base = os.path.realpath(SKILLS_DIR)
    ruta = os.path.realpath(os.path.join(base, str(nombre), str(archivo)))
    # Guardia anti-traversal: la resolución final DEBE quedar dentro de skills/.
    if not (ruta + os.sep).startswith(base + os.sep) or ruta == base:
        return {"ok": False, "error": "Ruta fuera de la carpeta skills/."}
    if not os.path.isfile(ruta):
        return {"ok": False, "error": f"No existe skills/{nombre}/{archivo}."}
    if os.path.splitext(ruta)[1].lower() not in (".md", ".txt", ".json"):
        return {"ok": False, "error": "Solo se sirven .md, .txt y .json."}
    try:
        with open(ruta, "r", encoding="utf-8", errors="replace") as f:
            texto = f.read(max_chars + 1)
        return {"ok": True, "skill": nombre, "archivo": archivo,
                "content": texto[:max_chars], "truncado": len(texto) > max_chars}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================
# RAÍCES SEGURAS para exportar / importar / indexar
# ------------------------------------------------------------
# Estas tres herramientas leen o escriben el disco de la máquina del usuario, así
# que heredamos la política del puente :5000: dentro de unas raíces o nada. La
# lista es la app + CN_HINDSITE_INDEX_ROOTS (solo lectura) + EXPORTS_DIR (escritura).
# Un `..`, un enlace simbólico que escape o un path absoluto ajeno se rechazan
# con motivo, nunca en silencio.
# ============================================================
def _dentro_de(ruta_real, raiz):
    return ruta_real == raiz or ruta_real.startswith(raiz + os.sep)


def _raiz_permitida(ruta_real, raices):
    return any(_dentro_de(ruta_real, r) for r in raices)


def _ruta_export(arg, escribir=False):
    """Ruta dentro de EXPORTS_DIR. `arg` puede ser solo un nombre de archivo."""
    base = os.path.realpath(EXPORTS_DIR)
    nombre = str(arg or "").strip() or time.strftime("memoria-%Y%m%d-%H%M%S")
    if not nombre.lower().endswith((".json", ".md")):
        nombre += ".json"
    destino = os.path.realpath(os.path.join(base, nombre))
    if not _dentro_de(destino, base):
        return None, {"ok": False, "error": "La ruta sale de la carpeta de exportaciones."}
    if escribir:
        os.makedirs(base, exist_ok=True)
    elif not os.path.isfile(destino):
        return None, {"ok": False, "error": f"No existe {os.path.relpath(destino, base)} en la carpeta de exportaciones."}
    return destino, None


def _escribir_atomico(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, ruta)


def _caminar_codigo(raiz, tope_archivos, tope_bytes):
    """Yield (ruta_absoluta, relativa) de archivos indexables, con vetos y topes."""
    raiz_real = os.path.realpath(raiz)
    if _bloqueado_sistema(raiz_real):
        return
    cortados = 0
    for carpeta, dirs, archivos in os.walk(raiz_real):
        dirs[:] = sorted(d for d in dirs if d not in VETO_DIR and not d.startswith("."))
        for nombre in sorted(archivos):
            ext = os.path.splitext(nombre)[1].lower()
            if ext not in (".md", ".txt", ".json"):
                continue
            ruta = os.path.join(carpeta, nombre)
            # v1.52.0 - Un symlink o un junction de Windows puede apuntar fuera
            # de la raiz declarada. Se comprueba la ruta RESUELTA, no la escrita.
            try:
                ruta_real = os.path.realpath(ruta)
            except Exception:
                continue
            if not _dentro_de(ruta_real, raiz_real) or _bloqueado_sistema(ruta_real):
                cortados += 1
                continue
            try:
                if os.path.getsize(ruta_real) > tope_bytes:
                    cortados += 1
                    continue
            except OSError:
                continue
            yield ruta, os.path.relpath(ruta, raiz_real)
            cortados += 0
            if cortados >= tope_archivos:
                return

# ============================================================
# HERRAMIENTAS — traducción ESPEJO ⇄ HINDSIGHT por herramienta
# ============================================================
_ALIAS_CACHE = {"mtime": None, "mapa": {}}

# Ruta del archivo de alias legibles (fuera de la instalacion, sobrevive a updates).
ALIAS_JSON = os.environ.get("CN_ALIAS_JSON") or os.path.join(
    os.environ.get("CN_CEREBRO_DB") or os.path.join(
        RAIZ_DATOS,
        ".cerebro-db"),
    "alias-paginas.json")


def _alias_paginas():
    """Alias legibles para page_id con bigrama debil. Solo presentacion."""
    try:
        mt = os.path.getmtime(ALIAS_JSON)
        if _ALIAS_CACHE["mtime"] == mt:
            return _ALIAS_CACHE["mapa"]
        with open(ALIAS_JSON, "r", encoding="utf-8") as f:
            mapa = json.load(f).get("alias") or {}
        _ALIAS_CACHE["mtime"] = mt
        _ALIAS_CACHE["mapa"] = mapa
        return mapa
    except Exception:
        return {}


def _con_alias(paginas):
    """Añade 'name' legible sin tocar page_id."""
    mapa = _alias_paginas()
    if not mapa:
        return paginas
    for p in paginas:
        if not isinstance(p, dict):
            continue
        pid = p.get("page_id")
        if pid in mapa:
            p["name"] = mapa[pid]
            p["alias_de"] = pid
    return paginas


def h_listar_pages(args):
    if hs_activo():
        ok, data = hs_llamar("GET", f"/v1/default/banks/{BANK_ID}/mental-models",
                             query={"detail": "metadata"})
        if ok:
            lista = data.get("pages") if isinstance(data, dict) else data
            if isinstance(lista, list):
                _con_alias(lista)
            return {"ok": True, "backend": "hindsight", "pages": data}
        return {"ok": False, "backend": "hindsight", **data}
    datos = _leer_espejo()
    return {"ok": True, "backend": "espejo-local",
            "pages": _con_alias([{"page_id": p, "name": v.get("name")}
                                 for p, v in datos["pages"].items()])}


def h_leer_page(args):
    pid = str(args.get("page_id") or "").strip()
    if not pid:
        return {"ok": False, "error": "Falta page_id"}
    if hs_activo():
        ok, data = hs_llamar("GET", f"/v1/default/banks/{BANK_ID}/mental-models/{urllib.parse.quote(pid)}",
                             query={"detail": "content"})
        return {"ok": True, "backend": "hindsight", "page": data} if ok else {"ok": False, "backend": "hindsight", **data}
    datos = _leer_espejo()
    page = datos["pages"].get(_norm(pid).replace(" ", "-"))
    return {"ok": bool(page), "backend": "espejo-local", "page": page,
            **({} if page else {"error": "Página inexistente."})}


def h_guardar_page(args):
    pid = str(args.get("page_id") or "").strip()
    if not pid:
        return {"ok": False, "error": "Falta page_id"}
    if hs_activo():
        cuerpo = {
            "id": pid,
            "name": args.get("name") or pid,
            "source_query": args.get("source_query") or f"¿Qué sabe CerebroNico de {pid}?",
            "max_tokens": 4096,
            "trigger": {"mode": "delta", "refresh_after_consolidation": True,
                        "exclude_mental_models": True, "fact_types": ["observation"]},
        }
        ok, data = hs_llamar("POST", f"/v1/default/banks/{BANK_ID}/mental-models", cuerpo)
        if not ok and "HTTP 409" in str(data.get("error", "")):
            ok, data = hs_llamar("PATCH", f"/v1/default/banks/{BANK_ID}/mental-models/{urllib.parse.quote(pid)}",
                                 {"name": cuerpo["name"], "source_query": cuerpo["source_query"]})
        return {"ok": ok, "backend": "hindsight", "page": data if ok else None,
                **({} if ok else data)}
    return espejo_guardar_page(pid, args.get("name"), args.get("content"), args.get("source_query"))


def h_borrar_page(args):
    pid = str(args.get("page_id") or "").strip()
    if not pid:
        return {"ok": False, "error": "Falta page_id"}
    if hs_activo():
        ok, data = hs_llamar("DELETE", f"/v1/default/banks/{BANK_ID}/mental-models/{urllib.parse.quote(pid)}")
        return {"ok": ok, "backend": "hindsight", **({} if ok else data)}
    datos = _leer_espejo()
    eliminada = datos["pages"].pop(_norm(pid).replace(" ", "-"), None)
    if eliminada is not None:
        _escribir_espejo(datos)
    return {"ok": eliminada is not None, "backend": "espejo-local",
            **({} if eliminada else {"error": "Página inexistente."})}


def h_recall(args):
    q = str(args.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "Falta query"}
    tipos = [t for t in (args.get("fact_types") or []) if t in FACT_TYPES] or ["world", "experience"]
    if hs_activo():
        cuerpo = {"query": q, "max_tokens": int(args.get("max_tokens") or 1024),
                  "fact_types": tipos}
        if args.get("include_chunks") is True:
            cuerpo["include_chunks"] = True
        ok, data = hs_llamar("POST", f"/v1/default/banks/{BANK_ID}/memories/recall", cuerpo)
        return {"ok": True, "backend": "hindsight", "recall": data} if ok else {"ok": False, "backend": "hindsight", **data}
    semantico = _embed_disponible()
    resultados = espejo_recall_semantico(
        q, top_k=int(args.get("top_k") or 8), fact_types=tipos,
        tags=args.get("tags") if isinstance(args.get("tags"), list) else None,
        include_paginas=bool(args.get("incluir_paginas")))
    return {"ok": True, "backend": "espejo-local",
            "metodo": "bm25+coseno" if semantico else "bm25-espejo",
            "embed_modelo": EMBED_MODELO if semantico else None,
            "recall": resultados}


def h_reflect(args):
    q = str(args.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "Falta query"}
    presupuesto = args.get("budget") if args.get("budget") in ("low", "mid", "high") else "low"
    if hs_activo():
        tipos = [t for t in (args.get("fact_types") or []) if t in FACT_TYPES] or list(FACT_TYPES)
        cuerpo = {"query": q, "budget": presupuesto,
                  "max_tokens": int(args.get("max_tokens") or 1024), "fact_types": tipos}
        if args.get("include_facts") is True:
            cuerpo["include"] = {"facts": {}}
        ok, data = hs_llamar("POST", f"/v1/default/banks/{BANK_ID}/reflect", cuerpo,
                             tiempo=max(TIEMPO_LIMITE_HS, 60))
        return {"ok": True, "backend": "hindsight", "reflect": data} if ok else {"ok": False, "backend": "hindsight", **data}
    return {"ok": True, "backend": "espejo-local", "reflect": espejo_reflect(q, presupuesto)}


def h_ingest(args):
    contenido = str(args.get("content") or "")
    titulo = str(args.get("title") or "").strip()
    if not contenido.strip():
        return {"ok": False, "error": "Falta content"}
    if hs_activo():
        doc_id = _norm(titulo or "documento").replace(" ", "-")
        cuerpo = {"items": [{"content": contenido, "document_id": doc_id}],
                  "async": True, "type": "document"}
        ok, data = hs_llamar("POST", f"/v1/default/banks/{BANK_ID}/memories", cuerpo)
        return {"ok": ok, "backend": "hindsight", "ingest": data if ok else None,
                **({} if ok else data)}
    return espejo_ingresar(contenido, titulo=titulo or "documento", tipo="world")


def h_guardar_aprendizaje(args):
    contenido = str(args.get("contenido") or args.get("content") or "")
    if not contenido.strip():
        return {"ok": False, "error": "Falta contenido"}
    tags = args.get("tags") if isinstance(args.get("tags"), list) else []
    tipo = args.get("tipo") if args.get("tipo") in FACT_TYPES else "experience"
    if hs_activo():
        cuerpo = {"items": [{"content": contenido, "type": tipo}],
                  "tags": [str(t) for t in tags][:12], "async": False}
        ok, data = hs_llamar("POST", f"/v1/default/banks/{BANK_ID}/memories", cuerpo)
        return {"ok": ok, "backend": "hindsight", "guardado": data if ok else None,
                **({} if ok else data)}
    return espejo_ingresar(contenido, titulo="aprendizajes", tags=tags, tipo=tipo)


def h_estado(args):
    base = {
        "servicio": NOMBRE_SERVICIO,
        "version": VERSION,
        "backend_configurado": hs_activo(),
        "backend_url": HINDSITE_URL or None,
        "bank_id": BANK_ID,
        "skills_dir": os.path.isdir(SKILLS_DIR),
        "skills": len(skills_listado()),
    }
    if hs_activo():
        ok, data = hs_llamar("GET", "/health/live", tiempo=5)
        base["hindsight_vivo"] = ok
        if not ok:
            base["aviso"] = ("Hindsight configurado pero no responde: se atiende en MODO ESPEJO "
                             "(busqueda por superposicion, sin sintesis LLM).")
            base["hindsight_error"] = data.get("error")
    else:
        base["aviso"] = ("Sin HINDSITE_API_URL: MODO ESPEJO permanente hasta que arranques "
                         "Hindsight (npm run hindsight:server).")
    datos = _leer_espejo()
    con_vec = sum(1 for u in datos["units"] if u.get("vec"))
    base["espejo"] = {"unidades": len(datos["units"]), "paginas": len(datos["pages"]),
                      "con_vector": con_vec}
    base["embedder"] = {
        "activo": EMBED_ACTIVO,
        "modelo": EMBED_MODELO,
        "ollama": OLLAMA_URL,
        "vivo": _embed_disponible(),
        "peso_semantico": EMBED_PESO,
        "aviso": ("Recall hibrido BM25+coseno." if _embed_disponible()
                  else "Embedder no disponible: recall BM25 puro (degradacion honesta)."),
    }
    return {"ok": True, **base}



def h_aprender_de_error(args):
    """Lección estructurada → unidad tipo observation + página de lecciones."""
    campos = ["contexto", "error", "causa", "correccion", "verificacion"]
    faltan = [c for c in campos if not str(args.get(c) or "").strip()]
    if faltan:
        return {"ok": False, "error": f"Faltan campos: {', '.join(faltan)}"}
    texto = " · ".join(f"{c}: {str(args[c]).strip()}" for c in campos)
    guardado = espejo_ingresar(texto, titulo="lecciones-de-error",
                               tags=["leccion", "error"] + [str(t) for t in (args.get("tags") or [])][:6],
                               tipo="observation")
    if not guardado.get("ok"):
        return guardado
    fila = ("| " + " | ".join(str(args[c]).strip().replace("|", "/")[:200] for c in campos)
            + f" | {time.strftime('%Y-%m-%d')} |")
    datos = _leer_espejo()
    pagina = datos["pages"].get("lecciones-de-error") or {
        "id": "lecciones-de-error", "name": "Lecciones de error",
        "content": "| contexto | error | causa | correccion | verificacion | fecha |\n|---|---|---|---|---|---|",
        "source_query": "¿Que errores se repitieron y como se corrigieron?", "actualizada": 0,
    }
    lineas = [l for l in pagina["content"].split("\n") if l.strip()]
    fila_nueva = fila.replace("\n", " ")
    duplicada = any(fila_nueva.replace(" ", "") == l.replace(" ", "") for l in lineas)
    if not duplicada:
        lineas.append(fila_nueva)
        if len(lineas) > 42:  # la tabla no crece para siempre: se purga la mas vieja
            del lineas[3:3 + (len(lineas) - 42)]
        pagina["content"] = "\n".join(lineas)
        pagina["actualizada"] = int(time.time() * 1000)
        datos["pages"]["lecciones-de-error"] = pagina
        _escribir_espejo(datos)
    return {"ok": True, "backend": "espejo-local", "unidad": guardado["unidad"],
            "pagina": "lecciones-de-error", "fila_duplicada": duplicada,
            "lecciones_en_pagina": max(0, len([l for l in pagina["content"].split("\n") if l.startswith("| ")]) - 0)}


def h_repasar(args):
    """Higiene del espejo: duplicados, ruido antiguo, paginas sin respaldo, propuestas.

    Se seca por defecto (`aplicar` falsos): `memory_repasar` propone, el modelo o el
    humano decide. Fondos de escritorio que se purgan solos son la peor forma de
    «limpiar».
    """
    aplicar = bool(args.get("aplicar"))
    dias = float(args.get("sin_cita_dias") or 30)
    tope = int(args.get("tope_unidades") or MAX_UNIDADES_ESPEJO)
    datos = _leer_espejo()
    unidades = datos["units"]
    por_clave = {}
    for u in unidades:
        por_clave.setdefault(_norm(u.get("text", "")), []).append(u)
    duplicados = {k: [u["id"] for u in v] for k, v in por_clave.items() if len(v) > 1}
    corte = int(time.time() * 1000) - int(dias * 86400000)
    viejas = [u["id"] for u in unidades if (u.get("ts") or 0) < corte]
    exceso = max(0, len(unidades) - tope)
    paginas_sin_unidad = []
    for pid, page in (datos.get("pages") or {}).items():
        toks = _tokens(page.get("source_query", "") or page.get("name", ""))
        respaldo = sum(1 for u in unidades if _bm25(toks, [_tokens(u.get("text", ""))])[0] > 0) if toks else 0
        if respaldo == 0:
            paginas_sin_unidad.append(pid)
    informe = {
        "ok": True, "backend": "espejo-local",
        "unidades": len(unidades), "paginas": len(datos.get("pages") or {}),
        "grupos_duplicados": len(duplicados),
        "unidades_duplicadas": sum(len(v) for v in duplicados.values()),
        "mas_antiguas_ms": (min((u.get("ts") or 0 for u in unidades), default=0)),
        "fuera_de_fecha": len(viejas),
        "exceso_sobre_tope": exceso,
        "paginas_sin_respaldo": paginas_sin_unidad,
        "propuestas": [],
    }
    for tema, v in list(duplicados.items())[:5]:
        informe["propuestas"].append(f"Fusionar {len(v)} unidades duplicadas: {tema[:70]}")
    if exceso:
        informe["propuestas"].append(f"Recortar {exceso} unidad(es) mas antigua(s) para volver al tope")
    for pid in paginas_sin_unidad[:5]:
        informe["propuestas"].append(f"La pagina «{pid}» no tiene unidades que la respalden: re-ingierala o borrala")
    if aplicar and (duplicados or exceso):
        vistos, limpias = set(), []
        for u in unidades:
            clave = _norm(u.get("text", ""))
            if clave in vistos:
                continue
            vistos.add(clave)
            limpias.append(u)
        datos["units"] = limpias[max(0, len(limpias) - tope):]
        _escribir_espejo(datos)
        informe["aplicado"] = {"antes": len(unidades), "despues": len(datos["units"])}
    else:
        informe["aplicado"] = None
    return informe


def h_conflictos(args):
    """Cruza el espejo con el acta (memoria.md / cerebro.md): la ley manda."""
    ruta_acta = os.path.join(RAIZ_APP, str(args.get("acta") or "memoria.md"))
    if not _dentro_de(os.path.realpath(ruta_acta), os.path.realpath(RAIZ_APP)):
        return {"ok": False, "error": "El acta debe estar dentro de la carpeta de la app."}
    try:
        with open(ruta_acta, "r", encoding="utf-8", errors="replace") as f:
            acta = f.read(400_000)
    except FileNotFoundError:
        return {"ok": False, "error": f"No existe el acta: {os.path.basename(ruta_acta)}"}
    tema = str(args.get("tema") or "").strip()
    unidades = _leer_espejo()["units"]
    tok_acta = _tokens(acta)
    set_acta = set(tok_acta)
    dudosos = []
    for u in unidades:
        texto = u.get("text", "")
        if tema and tema.lower() not in _norm(texto):
            continue
        tq = _tokens(texto)
        if not tq:
            continue
        # Señal de contraste: la unidad habla de algo que el acta nunca menciona,
        # o lo menciona con una negacion cerca. No afirmamos contradicciones:
        # las CANDIDATAS, para que un humano decida (cerebro.md §5C).
        extranas = [t for t in tq if t not in set_acta]
        niega = bool(re.search(r"\b(no|nunca|jamas|prohibido|en vez de|sustituido por)\b", _norm(texto)))
        if niega or len(extranas) >= max(3, int(len(tq) * 0.6)):
            dudosos.append({"id": u.get("id"), "text": texto[:220],
                            "motivo": "negación explícita" if niega else "tema ausente del acta"})
    return {"ok": True, "acta": os.path.basename(ruta_acta), "candidatos": dudosos[: int(args.get("top_k") or 10)],
            "total_unidades": len(unidades),
            "regla": "Si el acta y la memoria consultiva contradicen, manda el acta (cerebro.md §8)."}


def h_exportar(args):
    destino, error = _ruta_export(args.get("nombre"), escribir=True)
    if error:
        return error
    datos = _leer_espejo()
    formato = str(args.get("formato") or "json").lower()
    if formato == "md":
        lineas = ["# Exportación de memoria CerebroNico (hindsight mirror)",
                  f"_generado {time.strftime('%Y-%m-%d %H:%M:%S')} · {len(datos['units'])} unidades · {len(datos['pages'])} páginas_", ""]
        for pid, page in sorted((datos.get("pages") or {}).items()):
            lineas += [f"## {page.get('name') or pid}", f"`{pid}` · fuente: `{page.get('source_query','')}`", ""]
            lineas += [page.get("content", ""), ""]
        lineas += ["## Unidades", ""]
        for u in datos["units"]:
            etiqueta = ",".join(u.get("tags") or [])
            lineas.append(f"- **[{u.get('type','experience')}]** {u.get('text','')}  `{etiqueta}`")
        destino = destino.rsplit(".", 1)[0] + ".md"
        _escribir_atomico(destino, "\n".join(lineas))
    else:
        _escribir_atomico(destino, json.dumps(datos, ensure_ascii=False, indent=1))
    return {"ok": True, "ruta": destino, "formato": formato,
            "unidades": len(datos["units"]), "paginas": len(datos["pages"])}


def h_importar(args):
    destino, error = _ruta_export(args.get("nombre"))
    if error:
        return error
    try:
        with open(destino, "r", encoding="utf-8") as f:
            contenido = json.load(f)
    except Exception as e:
        return {"ok": False, "error": f"El archivo no es un export JSON válido: {e}"}
    if not isinstance(contenido, dict) or "units" not in contenido:
        return {"ok": False, "error": "Falta el campo «units»: no parece una exportación del espejo."}
    datos = _leer_espejo()
    existentes = {_norm(u.get("text", "")) for u in datos["units"]}
    paginas_existentes = set(datos.get("pages") or {})
    nuevas = fusion = 0
    for u in contenido["units"]:
        texto = str(u.get("text") or "").strip()
        if not texto:
            continue
        if _norm(texto) in existentes:
            fusion += 1
            continue
        existentes.add(_norm(texto))
        datos["units"].append({"id": u.get("id") or f"u-{int(time.time()*1000)}-imp",
                               "text": texto[:8000], "document_id": u.get("document_id", "importado"),
                               "type": u.get("type") if u.get("type") in FACT_TYPES else "experience",
                               "tags": [str(t) for t in (u.get("tags") or [])][:12],
                               "ts": u.get("ts") or int(time.time() * 1000)})
        nuevas += 1
    for pid, page in (contenido.get("pages") or {}).items():
        if pid in paginas_existentes and not bool(args.get("sobrescribir_paginas")):
            continue
        datos["pages"][pid] = page
    if len(datos["units"]) > MAX_UNIDADES_ESPEJO:
        datos["units"] = datos["units"][-MAX_UNIDADES_ESPEJO:]
    _escribir_espejo(datos)
    return {"ok": True, "origen": destino, "unidades_nuevas": nuevas,
            "unidades_ya_presentes": fusion, "total": len(datos["units"]),
            "paginas": len(datos["pages"])}


def h_indexar_proyecto(args):
    """Se alimenta solo: ingiere acta, changelog, skills y documentación al espejo.

    El valor no es «leer archivos» (eso ya lo hace el sandbox), sino dejarlos
    dentro de la memoria consultiva para que `memory_recall` responda sin abrir
    nada. Todo lo ingerido queda etiquetado `indexado` para poder repasarlo.
    """
    tope_archivos = int(args.get("max_archivos") or 40)
    tope_bytes = int(args.get("max_bytes_por_archivo") or 200_000)
    raices = _raices_index()
    documento = str(args.get("documento") or "proyecto").strip() or "proyecto"
    ingeridos, omitidos, leidos = [], [], 0
    # v1.57.1 · INGESTA EN LOTE: el almacén se lee UNA vez y se escribe UNA vez
    # al final (ver espejo_ingresar). Antes este bucle hacía 40 lecturas + 40
    # snapshots + 40 fsync y se pasó de 8 s en Windows, matando la suite.
    datos = _leer_espejo()
    for raiz in raices:
        if not os.path.isdir(raiz):
            omitidos.append({"ruta": raiz, "motivo": "raíz inexistente"})
            continue
        for ruta, relativa in _caminar_codigo(raiz, tope_archivos, tope_bytes):
            if leidos >= tope_archivos:
                break
            try:
                with open(ruta, "r", encoding="utf-8", errors="replace") as f:
                    texto = f.read(tope_bytes)
            except Exception as e:
                omitidos.append({"ruta": relativa, "motivo": f"no se pudo leer: {e}"})
                continue
            if len(texto.strip()) < 40:
                omitidos.append({"ruta": relativa, "motivo": "vacío o casi vacío"})
                continue
            res = espejo_ingresar(f"[{relativa}]\n{texto}", titulo=f"index-{documento}",
                                  tags=["indexado", relativa.replace("/", "-")[:40]], tipo="world",
                                  _datos=datos, _escribir=False)
            if res.get("ok"):
                ingeridos.append(relativa)
                leidos += 1
            else:
                omitidos.append({"ruta": relativa, "motivo": res.get("error")})
            if leidos >= tope_archivos:
                break
    escrituras = 0
    if ingeridos:
        # UNA sola escritura atómica para todo el lote (con su snapshot previo).
        _escribir_espejo(datos)
        escrituras = 1
    return {"ok": True, "backend": "espejo-local", "ingeridos": len(ingeridos),
            "archivos": ingeridos[:40], "omitidos": omitidos[:12],
            "escrituras_espejo": escrituras,
            "aviso": "Ingesta local en lote (una sola escritura) sin extracción de hechos: "
                     "las unidades entran literales. "
                     "Para hechos destilados y consolidación usa Hindsight."}


def h_olvidar(args):
    """Olvido quirurgico: por id concreta, con snapshot previo en el historial."""
    ids = args.get("ids") if isinstance(args.get("ids"), list) else ([args.get("id")] if args.get("id") else [])
    ids = [str(i) for i in ids if str(i).strip()]
    if not ids:
        return {"ok": False, "error": "Falta id o ids de unidad."}
    datos = _leer_espejo()
    antes = len(datos["units"])
    datos["units"] = [u for u in datos["units"] if u.get("id") not in set(ids)]
    borradas = antes - len(datos["units"])
    if borradas:
        _escribir_espejo(datos)
    return {"ok": borradas > 0, "borradas": borradas, "solicitadas": len(ids),
            "solicitadas": ids,
            "total": len(datos["units"]),
            **({} if borradas else {"error": "Ninguna de esas ids existe en el espejo."})}


def h_skill_buscar(args):
    """Busca dentro de skills/ (incluidas references/) y devuelve fragmentos."""
    q = str(args.get("query") or "").strip()
    qtok = _tokens(q)
    if not qtok:
        return {"ok": False, "error": "Falta query"}
    top_k = int(args.get("top_k") or 5)
    base = os.path.realpath(SKILLS_DIR)
    candidatos = []
    for carpeta, dirs, archivos in os.walk(base):
        dirs[:] = [d for d in dirs if d not in VETO_DIR]
        for nombre in archivos:
            if not nombre.lower().endswith((".md", ".txt")):
                continue
            ruta = os.path.join(carpeta, nombre)
            try:
                with open(ruta, "r", encoding="utf-8", errors="replace") as f:
                    texto = f.read(300_000)
            except Exception:
                continue
            trozos = [t.strip() for t in re.split(r"\n\s*\n", texto) if len(t.strip()) > 60]
            for i, trozo in enumerate(trozos):
                sc = _bm25(qtok, [_tokens(trozo)])
                if sc and sc[0] > 0:
                    skill = os.path.relpath(ruta, base).split(os.sep)[0]
                    candidatos.append((sc[0], skill, os.path.relpath(ruta, base), i, trozo[:900]))
    candidatos.sort(key=lambda x: -x[0])
    vistos, salida = set(), []
    for sc, skill, rel, i, trozo in candidatos:
        clave = (rel, i)
        if clave in vistos:
            continue
        vistos.add(clave)
        salida.append({"score": round(sc, 3), "skill": skill, "archivo": rel, "fragmento": trozo})
        if len(salida) >= top_k:
            break
    return {"ok": True, "resultados": salida, "total_coincidencias": len(candidatos)}


MANIFIESTO = [
    {"name": "memory_estado", "cheap": True,
     "description": "Estado de la memoria hibrida: backend activo (hindsight o espejo-local), banco, tamano del espejo y skills disponibles. Usala primero para saber que memoria hay detras.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "memory_recall", "cheap": True,
     "description": "Buscar hechos concretos (numeros, decisiones, preferencias) en la memoria retenida. Barata y rápida.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string", "description": "que buscar"},
         "max_tokens": {"type": "number", "description": "presupuesto de resultados (por defecto 1024)"},
         "fact_types": {"type": "array", "items": {"type": "string", "enum": list(FACT_TYPES)},
                        "description": "tipos de memoria (por defecto world+experience)"}},
         "required": ["query"]}},
    {"name": "memory_guardar_aprendizaje", "cheap": True,
     "description": "Guardar un aprendizaje corto, leccion o preferencia del usuario en la memoria persistente. Idempotente no hace falta: duplicados se consolidan.",
     "parameters": {"type": "object", "properties": {
         "contenido": {"type": "string", "description": "el aprendizaje, una o dos frases, con contexto suficiente"},
         "tags": {"type": "array", "items": {"type": "string"}, "description": "etiquetas cortas"},
         "tipo": {"type": "string", "enum": list(FACT_TYPES), "description": "world|experience|observation (por defecto experience)"}},
         "required": ["contenido"]}},
    {"name": "memory_leer_page", "cheap": True,
     "description": "Leer una pagina de conocimiento sintetizada (preferencias, procedimientos, datos) por su page_id.",
     "parameters": {"type": "object", "properties": {
         "page_id": {"type": "string", "description": "id de la pagina, ex: preferencias-editoriales"}},
         "required": ["page_id"]}},
    {"name": "memory_listar_pages", "cheap": True,
     "description": "Listar las paginas de conocimiento que existen (solo id y nombre). Usala antes de leer o crear para no duplicar una pagina que ya esta.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "listar_skills", "cheap": True,
     "description": "Listar las skills instaladas en skills/ (nombre + descripcion), por paginas. Con 200 skills instaladas NO pidas la lista completa para buscar algo: usa `filtro` o `skill_buscar`.",
     "parameters": {"type": "object", "properties": {
         "filtro": {"type": "string", "description": "palabra para buscar en nombre/descpcion (ej: pdf, docx, web, pdf, pruebas)"},
         "limite": {"type": "integer", "description": "cuantas devolver (1-100, por defecto 40)"},
         "desde": {"type": "integer", "description": "indice de la pagina siguiente (el valor de `siguiente` de la respuesta anterior)"}}}},
    {"name": "leer_skill",
     "description": "Cargar el contenido de una skill (SKILL.md u otro archivo .md/.txt/.json dentro de skills/) para usarla como guia. Solo lectura dentro de skills/.",
     "parameters": {"type": "object", "properties": {
         "skill": {"type": "string", "description": "nombre de la carpeta de skill, ex: hindsight-architect"},
         "archivo": {"type": "string", "description": "archivo interno (por defecto SKILL.md)"}},
         "required": ["skill"]}},
    {"name": "memory_reflect",
     "description": "Sintesis razonada sobre la memoria: preguntas de patrones, retrospectivas y preferencias de largo plazo. Mas cara que recall; usala para reflexionar, no para buscar.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string", "description": "pregunta o prompt de sintesis"},
         "budget": {"type": "string", "enum": ["low", "mid", "high"], "description": "presupuesto de recuperacion y razonamiento"},
         "max_tokens": {"type": "number", "description": "tope de salida (por defecto 1024)"}},
         "required": ["query"]}},
    {"name": "memory_ingest",
     "description": "Ingerir un documento COMPLETO en la memoria (transcripciones, informes, READMEs). Pasar el texto crudo: NUNCA resumir antes de ingerir. El title pasa a id de documento.",
     "parameters": {"type": "object", "properties": {
         "title": {"type": "string", "description": "titulo del documento"},
         "content": {"type": "string", "description": "contenido crudo completo"}},
         "required": ["title", "content"]}},
    {"name": "memory_guardar_page",
     "description": "Crear o actualizar una pagina de conocimiento con un source_query: pregunta que el sistema vuelve a responder en cada consolidacion para reconstruir la pagina.",
     "parameters": {"type": "object", "properties": {
         "page_id": {"type": "string", "description": "id unico, minusculas con guiones"},
         "name": {"type": "string", "description": "nombre legible"},
         "source_query": {"type": "string", "description": "pregunta que reconstruye la pagina"},
         "content": {"type": "string", "description": "contenido inicial (solo en modo espejo; Hindsight sintetiza solo)"}},
         "required": ["page_id", "name"]}},
    {"name": "memory_borrar_page", "destructive": True,
     "description": "Borrar permanentemente una pagina de conocimiento.",
     "parameters": {"type": "object", "properties": {
         "page_id": {"type": "string", "description": "id de la pagina"}},
         "required": ["page_id"]}},
    {"name": "memory_aprender_de_error", "cheap": True,
     "description": "Registrar una leccion estructurada de un bug corregido: contexto, error, causa, correccion y verificacion. Alimenta la pagina lecciones-de-error y evita repetir el mismo fallo.",
     "parameters": {"type": "object", "properties": {
         "contexto": {"type": "string", "description": "donde y cuando paso"},
         "error": {"type": "string", "description": "sintoma exacto"},
         "causa": {"type": "string", "description": "causa raiz verificada"},
         "correccion": {"type": "string", "description": "lo que se hizo para arreglarlo"},
         "verificacion": {"type": "string", "description": "como se comprobante que ya no falla"},
         "tags": {"type": "array", "items": {"type": "string"}}},
         "required": ["contexto", "error", "causa", "correccion", "verificacion"]}},
    {"name": "skill_buscar", "cheap": True,
     "description": "Buscar dentro de las skills instaladas (SKILL.md y sus references/) con BM25 y devolver los fragmentos que responden, con skill y archivo. Mas barato que leer una skill entera.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string", "description": "que se quiere saber"},
         "top_k": {"type": "number", "description": "cuantos fragmentos (por defecto 5)"}},
         "required": ["query"]}},
    {"name": "memory_repasar",
     "description": "Pase de higiene del espejo: duplicados, unidades fuera de fecha, paginas sin respaldo y propuestas concretas. Seco por defecto; aplicar=true fusiona duplicados y recorta al tope.",
     "parameters": {"type": "object", "properties": {
         "aplicar": {"type": "boolean", "description": "ejecutar la limpieza propuesta (por defecto false: solo informa)"},
         "sin_cita_dias": {"type": "number", "description": "umbral de antiguedad en dias (por defecto 30)"},
         "tope_unidades": {"type": "number", "description": "tope deseado de unidades"}}}},
    {"name": "memory_indexar_proyecto",
     "description": "Ingerir en la memoria los documentos del proyecto (md/txt/json de la app y raices autorizadas: acta, changelog, skills, documentacion) para poder recordarlos sin abrir archivos.",
     "parameters": {"type": "object", "properties": {
         "documento": {"type": "string", "description": "nombre del lote (por defecto proyecto)"},
         "max_archivos": {"type": "number", "description": "tope de archivos por pasada (por defecto 40)"},
         "max_bytes_por_archivo": {"type": "number", "description": "tope por archivo (por defecto 200000)"}}}},
    {"name": "memory_conflictos",
     "description": "Cruzar la memoria consultiva con el acta (memoria.md o cerebro.md) y devolver CANDIDATOS de contradiccion. Nunca decide: manda el acta y un humano confirma.",
     "parameters": {"type": "object", "properties": {
         "tema": {"type": "string", "description": "filtrar por tema"},
         "acta": {"type": "string", "description": "archivo de acta dentro de la app (por defecto memoria.md)"},
         "top_k": {"type": "number"}}}},
    {"name": "memory_exportar",
     "description": "Exportar la memoria (paginas + unidades) a json o markdown dentro de la carpeta de exportaciones, para respaldo o para llevarla a otra maquina.",
     "parameters": {"type": "object", "properties": {
         "nombre": {"type": "string", "description": "nombre del archivo destino"},
         "formato": {"type": "string", "enum": ["json", "md"], "description": "por defecto json"}}}},
    {"name": "memory_importar",
     "description": "Importar una exportacion previa al espejo, fusionando por texto normalizado (no duplica lo ya presente).",
     "parameters": {"type": "object", "properties": {
         "nombre": {"type": "string", "description": "nombre del archivo exportado"},
         "sobrescribir_paginas": {"type": "boolean", "description": "renovar paginas existentes (por defecto no)"},
         "destructive_hint": {"type": "string"}},
         "required": ["nombre"]}},
    {"name": "memory_vectorizar", "cheap": True,
     "description": "Calcula y guarda los vectores de embedding de las unidades del espejo (snowflake-arctic-embed via Ollama). Sin esto el recall es BM25 puro; con esto es hibrido BM25+coseno. Idempotente: solo procesa las unidades sin vector.",
     "parameters": {"type": "object", "properties": {
         "limite": {"type": "number", "description": "cuantas unidades vectorizar como maximo (por defecto todas)"}}}},
    {"name": "memory_olvidar", "destructive": True,
     "description": "Borrar unidades concretas del espejo por su id (usa memory_repasar o memory_recall para obtenerlas). Deja snapshot previo en el historial.",
     "parameters": {"type": "object", "properties": {
         "id": {"type": "string", "description": "una id"},
         "ids": {"type": "array", "items": {"type": "string"}, "description": "varias ids"}},
         "required": []}},
]

def h_vectorizar(args):
    """Vectoriza un LOTE de las unidades del espejo, con presupuesto de tiempo.

    v1.58.0 · El ejecutor era un lambda que llamaba a _embed_disponible() DOS
    veces: la primera pagaba /api/show con timeout de 15 s aunque el espejo
    estuviera vacio. Ahora el espejo vacio contesta al instante.

    v2.1.3 · Y con el espejo LLENO tampoco se cuelga: sin `limite` explicito se
    procesa un lote acotado (CN_VECTORIZAR_LOTE, 8 por defecto) y se corta al
    agotar CN_VECTORIZAR_SEGUNDOS (3 s por defecto). Medido en la instalacion:
    la herramienta sin argumentos tardaba 8191 ms contra una ventana de 8 s, asi
    que la respuesta se perdia y el recall que venia detras tambien. Lo que no
    entra en el turno vuelve como `pendientes`, no como silencio.
    """
    a = args or {}
    datos = _leer_espejo()
    pendientes = [u for u in datos["units"] if not u.get("vec")]
    if not pendientes:
        return {
            "ok": True,
            "embedder_vivo": None,
            "modelo": EMBED_MODELO,
            "vectorizados": 0,
            "pendientes": 0,
            "aviso": "El espejo no tiene unidades sin vector: no se consulto el embedder.",
        }
    try:
        presupuesto = float(a.get("segundos") or os.environ.get("CN_VECTORIZAR_SEGUNDOS") or "3")
    except (TypeError, ValueError):
        presupuesto = 3.0
    limite = a.get("limite")
    if limite is None:
        try:
            limite = int(os.environ.get("CN_VECTORIZAR_LOTE") or "8")
        except (TypeError, ValueError):
            limite = 8
    # La comprobacion del embedder se lleva como maximo un tercio del presupuesto:
    # si Ollama no contesta a tiempo se dice `None` (no comprobado), no `False`.
    vivo = _embed_disponible(presupuesto=max(0.5, presupuesto / 3.0))
    vectorizados, quedan = _persistir_vectores(limite, presupuesto)
    return {
        "ok": True,
        "embedder_vivo": vivo,
        "modelo": EMBED_MODELO,
        "vectorizados": vectorizados,
        "pendientes": quedan,
        "limite": limite,
        "aviso": ("Vectores calculados y persistidos." if vectorizados
                  else "Embedder no disponible o sin tiempo en este turno: no se vectorizo nada."),
    }


EJECUTORES = {
    "memory_estado": h_estado,
    "memory_recall": h_recall,
    "memory_guardar_aprendizaje": h_guardar_aprendizaje,
    "memory_leer_page": h_leer_page,
    "memory_listar_pages": h_listar_pages,
    "listar_skills": h_listar_skills,
    "leer_skill": lambda a: skill_leer(a.get("skill", ""), a.get("archivo", "SKILL.md")),
    "memory_reflect": h_reflect,
    "memory_ingest": h_ingest,
    "memory_guardar_page": h_guardar_page,
    "memory_borrar_page": h_borrar_page,
    "memory_aprender_de_error": h_aprender_de_error,
    "skill_buscar": h_skill_buscar,
    "memory_repasar": h_repasar,
    "memory_indexar_proyecto": h_indexar_proyecto,
    "memory_conflictos": h_conflictos,
    "memory_exportar": h_exportar,
    "memory_importar": h_importar,
    "memory_olvidar": h_olvidar,
    "memory_vectorizar": h_vectorizar,
}


# ============================================================
# SERVIDOR — contrato de pack externo de CerebroNico
# ============================================================
class Manejador(BaseHTTPRequestHandler):
    server_version = f"{NOMBRE_SERVICIO}/{VERSION}"
    token_requerido = None  # se llena desde args/CLI

    def _json(self, codigo, payload):
        cuerpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta == "/tools":
            return self._json(200, {"tools": MANIFIESTO})
        if ruta == "/health":
            return self._json(200, h_estado({}))
        return self._json(404, {"ok": False, "error": "Ruta desconocida. Usa /tools, /health o POST /tools/call."})

    def _es_loopback(self):
        ip = self.client_address[0] if self.client_address else ""
        return ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _origen_ok(self):
        """Misma puerta que el puente :5000: loopback, y si viene Origin que sea local.

        POR QUE (v1.52.0): do_POST no miraba nada. Escuchar en 127.0.0.1 NO impide
        que una pagina web abierta en el navegador del usuario haga un POST a
        http://127.0.0.1:5100/tools/call — el navegador lo permite. Sin token
        puesto (el default), esa pagina podia escribir en la memoria del agente.
        Ahora: cliente debe ser loopback Y, si trae Origin, debe ser local.
        """
        if not self._es_loopback():
            return False
        origen = self.headers.get("Origin")
        if not origen:
            return True
        try:
            u = urllib.parse.urlparse(origen)
        except Exception:
            return False
        return u.hostname in ("127.0.0.1", "localhost", "::1")

    def do_POST(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta != "/tools/call":
            return self._json(404, {"ok": False, "error": "Solo existe POST /tools/call."})
        if not self._origen_ok():
            return self._json(403, {"ok": False,
                                    "error": "Origen no autorizado: solo loopback local."})
        # Autenticacion opcional (el motor añade X-Cerebro-Token a packs loopback).
        if self.token_requerido and self.headers.get("X-Cerebro-Token") != self.token_requerido:
            return self._json(401, {"ok": False, "error": "X-Cerebro-Token invalido o ausente."})
        try:
            largo = min(int(self.headers.get("Content-Length") or 0), TOPE_BYTES_HS)
            peticion = json.loads(self.rfile.read(largo).decode("utf-8"))
        except Exception as e:
            return self._json(400, {"ok": False, "error": f"JSON invalido: {e}"})
        nombre = str(peticion.get("name") or "")
        ejecutor = EJECUTORES.get(nombre)
        if not ejecutor:
            return self._json(200, {"ok": False, "error": f"Herramienta desconocida: {nombre}"})
        try:
            resultado = ejecutor(peticion.get("arguments") or {})
            return self._json(200, resultado)
        except Exception as e:  # el pack jamas revienta el bucle del agente
            return self._json(200, {"ok": False, "error": f"{e.__class__.__name__}: {e}"})

    def log_message(self, formato, *args):  # log silencioso y util
        sys.stderr.write(f"[{NOMBRE_SERVICIO}] {self.address_string()} {formato % args}\n")


class ServidorEspejo(ThreadingHTTPServer):
    """Servidor del pack, endurecido para ráfagas de conexiones concurrentes.

    POR QUÉ EXISTE (bug real, ambiental): la suite abre ~19 conexiones a la vez
    (Promise.all sobre todas las herramientas). El backlog de escucha por
    defecto de socketserver es 5; en Linux el kernel reintenta los SYN que
    sobran en silencio (parecía sano), pero en WINDOWS el backlog desbordado se
    RECHAZA con ECONNREFUSED y el fetch sin capturar tumbaba toda la prueba.
    Subir request_queue_size hace que el sistema encole la ráfaga en vez de
    rechazarla. daemon_threads corta limpio al recibir SIGTERM (no cuelga el
    proceso hijo tras la prueba) y allow_reuse_address evita el TIME_WAIT al
    reabrir el puerto efímero.
    """
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description="Pack de memoria Hindsight/espejo para CerebroNico")
    ap.add_argument("--port", type=int, default=int(os.environ.get("CN_MEMORY_PORT") or "5100"))
    ap.add_argument("--host", default="127.0.0.1", help="solo loopback por diseño; cambiarlo es un acto propio y consciente")
    ap.add_argument("--token", default=os.environ.get("CN_HINDSITE_TOKEN") or None,
                    help="si se fija, los POST exigen X-Cerebro-Token")
    ap.add_argument("--tools", action="store_true", help="imprimir el manifiesto y salir")
    args = ap.parse_args()

    if args.tools:
        print(json.dumps({"tools": MANIFIESTO}, ensure_ascii=False, indent=2))
        return 0

    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"[{NOMBRE_SERVICIO}] AVISO: escuchando en {args.host} expone la "
              f"memoria a la red. Hazlo solo con --token puesto.", file=sys.stderr)

    Manejador.token_requerido = args.token
    try:
        httpd = ServidorEspejo((args.host, args.port), Manejador)
    except OSError as e:
        # Un puerto ocupado NO es un fallo del híbrido: otra instancia ya atiende.
        print(f"[{NOMBRE_SERVICIO}] No se pudo abrir {args.host}:{args.port}: {e}. "
              f"Si ya hay otro demonio ahí, este pack ya está servido.", file=sys.stderr)
        return 2
    print(f"[{NOMBRE_SERVICIO}] escuchando en http://{args.host}:{args.port} · "
          f"backend={'hindsight' if hs_activo() else 'espejo-local'} · bank={BANK_ID}")
    # v2.1.8 · Calentar el modelo de embedding UNA vez al arrancar, en un hilo que no
    # frena la apertura del puerto. Así la carga fría del modelo no la paga la primera
    # llamada real (que antes era la que pasaba la ventana del cliente).
    import threading
    def _calentar():
        try:
            _embed("calentamiento del modelo de embedding")
        except Exception:
            pass
    threading.Thread(target=_calentar, daemon=True, name="cn-embed-warmup").start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
