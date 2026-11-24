#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
creador_daemon.py — Pack CREADOR de CerebroNico (v1.19.0): habilidades de crear
aplicaciones y páginas web, auditarlas y corregirlas.

QUÉ ES
  Microservicio HTTP 100 % biblioteca estándar que habla el contrato de PACKS
  EXTERNOS de CerebroNico (igual que `hindsight_daemon.py`):
      GET  /tools       -> { "tools": [ {name, description, parameters, destructive?, cheap?} ] }
      POST /tools/call  -> { name, arguments } -> JSON
      GET  /health      -> estado del servicio

  Se enchufa en `tools.config.json` como pack `creador-web` y el bucle de agente
  lo usa como cualquier otra herramienta. **No toca `server.ts`**: la superficie de
  la IDE es un contrato y aquí no se abre ni una ruta nueva.

POR QUÉ EN PAQUETE Y NO EN EL NÚCLEO
  Crear web es una familia de capacidades distinta de la memoria. Separarlas
  mantiene el presupuesto de herramientas por modelo (`selectToolsForModel`) y
  permite apagar el creador sin perder memoria.

FILOSOFÍA (las tres reglas mandan)
  1. **Determinista, no inventado.** El HTML nace de plantillas y de los datos que
     pasa el usuario. Donde falta un dato queda un marcador honesto
     (`[Personaliza este texto]`), nunca una afirmación fabricada.
  2. **Seguro por raíz.** Todo archivo se escribe dentro de `.creador/` (ampliable
     con CN_CREADOR_EXTRA_ROOTS). Un `../` se rechaza con motivo, como en el puente :5000.
  3. **Nada destructivo sin intención explícita.** `crear_sitio` no pisa un sitio
     existente salvo `sobrescribir: true`; `mejorar_pagina` corrige en seco y solo
     aplica con `aplicar: true`, dejando snapshot en `.creador/historial/`.
"""

import argparse
import base64
import json
import math
import os
import re
import shutil
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

NOMBRE_SERVICIO = "cerebronico-creador"
VERSION = "1.1.0-creador"

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
CREADOR_ROOT = os.environ.get("CN_CREADOR_ROOT") or os.path.join(RAIZ_DATOS, ".creador")
HISTORIAL = os.path.join(CREADOR_ROOT, "historial")
REGISTRO_RUTA = os.path.join(CREADOR_ROOT, "sitios.json")
SNAPSHOTS_POR_SITIO = 20
TOPE_BYTES_ARCHIVO = 400_000

# ============================================================
# RAÍCES SEGURAS — la política del puente, aquí
# ============================================================
def _raices_autorizadas():
    extras = [r for r in (os.environ.get("CN_CREADOR_EXTRA_ROOTS") or "").split(os.pathsep) if r.strip()]
    return [os.path.realpath(CREADOR_ROOT)] + [os.path.realpath(r) for r in extras]


def _dentro_de(ruta_real, raiz):
    return ruta_real == raiz or ruta_real.startswith(raiz + os.sep)


def _resolver(ruta, escribir=False):
    """Devuelve (ruta_real, error). Rechaza escapes de las raíces autorizadas."""
    candidate = str(ruta or "").strip()
    if not candidate:
        return None, {"ok": False, "error": "Falta la ruta."}
    base = _raices_autorizadas()[0]
    if not os.path.isabs(candidate):
        candidate = os.path.join(base, candidate)
    real = os.path.realpath(candidate)
    if not any(_dentro_de(real, r) for r in _raices_autorizadas()):
        return None, {"ok": False, "error": f"La ruta está fuera de las raíces autorizadas: {base}"}
    if escribir:
        os.makedirs(os.path.dirname(real) or real, exist_ok=True)
    return real, None


# ============================================================
# v1.52.2 — PUENTE A LAS IMÁGENES SUBIDAS POR EL CHAT
# ------------------------------------------------------------
# CAUSA RAÍZ (sesión de Mario «no puede insertar imagen»): las imágenes que el
# usuario adjunta en el chat las materializa server.ts en
# «<proyecto>/assets/subidas/», que queda FUERA de la jaula del creador
# (.creador/). Por eso insertar_imagen con origen="assets/subidas/x.png" fallaba
# con «no encuentro el archivo» (o «fuera de las raíces») y el sitio —servido
# desde su propia carpeta— nunca contenía la imagen: recuadro roto. Este puente
# localiza esas subidas (SOLO imágenes, con tope de tamaño) para poder COPIARLAS
# dentro del sitio, sin abrir acceso general al disco.
_DIRS_SUBIDAS = [
    os.path.join(RAIZ_APP, "assets", "subidas"),
    os.path.join(RAIZ_APP, "assets"),
]
_EXTS_IMAGEN = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg")


def _listar_subidas():
    """Las imágenes que REALMENTE hay en las carpetas de subidas, más nueva primero.
    Es el único origen de verdad: sirve para elegir sin adivinar y para que el mensaje
    de error liste las opciones en vez de improvisar."""
    candidatos = []
    for d in _DIRS_SUBIDAS:
        try:
            if not os.path.isdir(d):
                continue
            for f in os.listdir(d):
                if not f.lower().endswith(_EXTS_IMAGEN):
                    continue
                ruta = os.path.join(d, f)
                if not os.path.isfile(ruta):
                    continue
                try:
                    if os.path.getsize(ruta) > TOPE_BYTES_ARCHIVO:
                        continue
                except Exception:
                    continue
                candidatos.append(ruta)
        except Exception:
            continue
    try:
        candidatos.sort(key=lambda c: os.path.getmtime(c), reverse=True)
    except Exception:
        pass
    return candidatos


def _buscar_subida(nombre=None):
    """Ruta real de una imagen subida por el chat, o None.

    v1.95.0 · LA SUSTITUCIÓN SILENCIOSA ERA EL BUG (Mario, 30/10: «necesitas 10 o 15
    mensajes para que pueda insertar una imagen y encima que se equivoque de imagen»).
    El código anterior buscaba por nombre y, si el nombre NO coincidía con ninguna
    archivo, caía en `max(candidatos, key=getmtime)`: insertaba LA MÁS RECIENTE y
    devolvía `ok`. O sea, ante una ruta mal escrita el sistema dibujaba otra foto y el
    usuario veía una imagen equivocada con un ✔ encima — la peor combinación posible:
    equivocado y conforme.

    Regla nueva, en orden, sin adivinar:
      1. coincidencia exacta de nombre → esa;
      2. coincidencia normalizada (sin acentos, sin mayúsculas) y ÚNICA → esa, porque
         es el mismo archivo escrito distinto, no una suposición;
      3. si se dio un nombre y no calza con nada → None. El error que ve el usuario
         lista las imágenes que sí existen;
      4. la "más reciente" SOLO cuando no se dio ningún nombre (el caso «insertá la que
         adjunté», que es legítimo y estaba documentado así)."""
    base = os.path.basename(str(nombre or "").replace("\\", "/").split("/")[-1]).strip()
    candidatos = _listar_subidas()
    if not candidatos:
        return None
    if base:
        exactos = [c for c in candidatos if os.path.basename(c) == base]
        if exactos:
            return exactos[0]
        similares = [c for c in candidatos if _norm(os.path.basename(c)) == _norm(base)]
        if len(similares) == 1:
            return similares[0]
        # Nombre pedido y no está: NUNCA se sustituye por otra foto.
        return None
    return candidatos[0]


def _opciones_de_subida(cantidad=6):
    """Cómo se ven las alternativas en un mensaje de error: nombres, no rutas
    absolutas (el modelo reescribe mal las segundas)."""
    return ", ".join(os.path.basename(c) for c in _listar_subidas()[:cantidad]) or "(ninguna)"


def _norm(texto):
    t = unicodedata.normalize("NFD", str(texto or ""))
    return re.sub(r"\s+", " ", "".join(c for c in t if unicodedata.category(c) != "Mn")).lower().strip()


def _slug(texto, maximo=48):
    t = _norm(texto)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return (t[:maximo].rstrip("-")) or "sitio"


def _esc(texto):
    """Escape HTML: el contenido del usuario nunca se inyecta como marcado."""
    s = str(texto if texto is not None else "")
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#39;"))


def _escribir_atomico(ruta, contenido):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenido)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, ruta)


def _escribir_atomico_bytes(ruta, datos):
    """v1.57.16 · los íconos PNG son binarios: el atómico textual no sirve."""
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "wb") as f:
        f.write(datos)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, ruta)


def _png_icono(tamino, color_hex):
    """PNG RGBA puro stdlib (struct+zlib): cuadrado redondeado en el color de la
    paleta. v1.57.16 — la fábrica no puede repartir manifest con íconos solo-SVG
    y después sorprenderse de que Edge no instale: un PNG real de 192/512 es
    requisito de instalabilidad, y ningún binario se INVENTA a medias: este
    generador produce un PNG válido, byte a byte, sin dependencias."""
    import struct as _st
    import zlib as _zl
    h = str(color_hex or "#4f8cff").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    n = int(tamino)
    radio = max(2, int(n * 0.18))
    filas = bytearray()
    for y in range(n):
        filas.append(0)
        for x in range(n):
            dx = min(x, n - 1 - x)
            dy = min(y, n - 1 - y)
            dentro = True
            if dx < radio and dy < radio:
                cx, cy = radio - dx, radio - dy
                dentro = (cx * cx + cy * cy) <= radio * radio
            filas += bytes((r, g, b, 255)) if dentro else bytes((0, 0, 0, 0))
    def _chunk(tipo, datos):
        return _st.pack(">I", len(datos)) + tipo + datos + _st.pack(">I", _zl.crc32(tipo + datos) & 0xFFFFFFFF)
    ihdr = _st.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)
    idat = _zl.compress(bytes(filas), 9)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


def _cablear_pwa(raiz, manifest):
    """v1.57.16 · LA FÁBRICA CABLEA LO QUE PRODUCE. El defecto de app-finanzas-dark:
    crear_sitio escribía manifest.webmanifest y sw.js SIN enlazarlos — el index no
    declaraba el manifest y ningún JS registraba el service worker. El motor lo
    cerró verde (los archivos ESTABAN) y el install del usuario falló (las piezas
    no estaban CONECTADAS). Desde ahora, manifest + sw + PNGs + link + registro
    se escriben JUNTOS o no se escriben."""
    _escribir_atomico_bytes(os.path.join(raiz, "assets", "icon-192.png"), _png_icono(192, manifest.get("theme_color")))
    _escribir_atomico_bytes(os.path.join(raiz, "assets", "icon-512.png"), _png_icono(512, manifest.get("theme_color")))
    manifest = dict(manifest)
    manifest.setdefault("icons", [])
    manifest["icons"] = [
        {"src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ] + [i for i in manifest["icons"] if str(i.get("type", "")).startswith("image/svg")]
    _escribir_atomico(os.path.join(raiz, "manifest.webmanifest"), json.dumps(manifest, ensure_ascii=False, indent=1))
    _escribir_atomico(os.path.join(raiz, "sw.js"), SW_JS.replace("creador-v1", _clave_cache_sw(raiz)))
    ruta_index = os.path.join(raiz, "index.html")
    enlazado = False
    if os.path.isfile(ruta_index):
        html = _leer(ruta_index)
        if 'rel="manifest"' not in html:
            if "</title>" in html:
                html = html.replace("</title>", '</title>\n  <link rel="manifest" href="manifest.webmanifest">', 1)
            else:
                html = re.sub(r"(<head[^>]*>)", r'\1\n  <link rel="manifest" href="manifest.webmanifest">', html, count=1)
        _escribir_atomico(ruta_index, html)
        enlazado = True
    ruta_js = os.path.join(raiz, "js", "main.js")
    cuerpo = _leer(ruta_js) if os.path.isfile(ruta_js) else ""
    if "serviceWorker" not in cuerpo:
        _escribir_atomico(ruta_js, cuerpo + "\nif ('serviceWorker' in navigator) {\n  addEventListener('load', () => {\n    navigator.serviceWorker.register('./sw.js').catch(() => {});\n  });\n}\n")
    return {"index_enlazado": enlazado, "sw_registrado": True}


def _leer(ruta):
    with open(ruta, "r", encoding="utf-8", errors="replace") as f:
        return f.read(TOPE_BYTES_ARCHIVO)


# ============================================================
# PALETAS Y TIPOGRAFÍA — decisiones cerradas, no colores sueltos
# ============================================================
PALETAS = {
    "noche": {"bg": "#0d1117", "superficie": "#161b22", "texto": "#e6edf3", "texto_suave": "#8b949e",
              "acento": "#4f8cff", "acento_texto": "#ffffff", "borde": "#30363d", "nombre": "Noche técnica"},
    "claro": {"bg": "#ffffff", "superficie": "#f6f7f9", "texto": "#14181f", "texto_suave": "#5b6572",
              "acento": "#1f5eff", "acento_texto": "#ffffff", "borde": "#e3e6ea", "nombre": "Claro editorial"},
    "calido": {"bg": "#fdf8f3", "superficie": "#f7ece1", "texto": "#2b2118", "texto_suave": "#7a6a5b",
               "acento": "#c2410c", "acento_texto": "#ffffff", "borde": "#e8d9c8", "nombre": "Cálido"},
    "bosque": {"bg": "#0f1a14", "superficie": "#16241c", "texto": "#e8f3ec", "texto_suave": "#9db8a8",
               "acento": "#2fbf71", "acento_texto": "#06220f", "borde": "#24382c", "nombre": "Bosque"},
    "violeta": {"bg": "#120b1f", "superficie": "#1b1230", "texto": "#efe8ff", "texto_suave": "#b3a4d0",
                "acento": "#8b5cf6", "acento_texto": "#ffffff", "borde": "#2b1f47", "nombre": "Violeta"},
    # v1.51.0 — más paletas para que no todo salga con los mismos colores.
    "oceano": {"bg": "#07131c", "superficie": "#0e2230", "texto": "#e4f1f8", "texto_suave": "#9fc0d1",
               "acento": "#22b8cf", "acento_texto": "#042029", "borde": "#1b3747", "nombre": "Océano"},
    "arena": {"bg": "#faf6ef", "superficie": "#f1e9db", "texto": "#2a2318", "texto_suave": "#6f6450",
              "acento": "#b45309", "acento_texto": "#ffffff", "borde": "#e4d8c3", "nombre": "Arena"},
    "pizarra": {"bg": "#0b0f14", "superficie": "#141a22", "texto": "#e7edf4", "texto_suave": "#93a1b1",
                "acento": "#818cf8", "acento_texto": "#0b1020", "borde": "#232c38", "nombre": "Pizarra"},
    "cereza": {"bg": "#fff7f8", "superficie": "#fdeced", "texto": "#2a1419", "texto_suave": "#7c5a60",
               "acento": "#be123c", "acento_texto": "#ffffff", "borde": "#f3d4d9", "nombre": "Cereza"},
}

TIPOS = {
    "sistema": 'font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;',
    "humanista": 'font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;',
    "mono": 'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
}

# Escala tipográfica: una sola fuente de verdad, saltos de 1.25 (como exige la casa
# en su motor de tipografía: nada de números mágicos por archivo).
ESCALA = """    --fs-300: 0.8rem;
    --fs-400: 1rem;
    --fs-500: 1.25rem;
    --fs-600: 1.563rem;
    --fs-700: 1.953rem;
    --fs-800: 2.441rem;"""

ETIQUETA_DE = {"caracteristicas": "Características", "precios": "Precios", "faq": "Preguntas",
               "contacto": "Contacto", "galeria": "Trabajo", "equipo": "Equipo",
               "testimonios": "Testimonios", "pasos": "Cómo funciona", "cta": "Empezar",
               "imagen": "Imagen", "estadisticas": "Cifras", "logos": "Confían"}

BLOQUES_DISPONIBLES = ["hero", "caracteristicas", "precios", "testimonios", "faq",
                       "contacto", "cta", "galeria", "equipo", "pasos", "barra", "pie",
                       # v1.51.0 — bloques nuevos (imagen destacada, cifras, logos de confianza)
                       "imagen", "estadisticas", "logos"]

TIPOS_SITIO = {
    "landing": ["barra", "hero", "caracteristicas", "cta", "pie"],
    "onepage": ["barra", "hero", "caracteristicas", "pasos", "precios", "faq", "contacto", "pie"],
    "negocio": ["barra", "hero", "caracteristicas", "testimonios", "cta", "contacto", "pie"],
    "portfolio": ["barra", "hero", "galeria", "pasos", "contacto", "pie"],
    "sencillo": ["barra", "hero", "cta", "pie"],
    # v1.51.0 — más recetas: el creador dejaba de hacer siempre las mismas páginas.
    "producto": ["barra", "hero", "imagen", "caracteristicas", "precios", "testimonios", "faq", "contacto", "pie"],
    "agencia": ["barra", "hero", "logos", "caracteristicas", "galeria", "testimonios", "cta", "contacto", "pie"],
    "evento": ["barra", "hero", "pasos", "estadisticas", "faq", "contacto", "pie"],
    "startup": ["barra", "hero", "estadisticas", "caracteristicas", "logos", "cta", "contacto", "pie"],
    "restaurante": ["barra", "hero", "imagen", "galeria", "precios", "contacto", "pie"],
    "revista": ["barra", "hero", "galeria", "estadisticas", "pasos", "contacto", "pie"],
}

PLACEHOLDER = "[Personaliza este texto]"

# Cada bloque publica la ancla que el menú puede enlazar. Sin este mapa, la barra
# generaba enlaces a «precios» o «contacto» aunque la receta del sitio no los
# incluyera — anclas rotas nada más nacer, y la auditoría las marca como error.
ID_DE_BLOQUE = {"caracteristicas": "caracteristicas", "precios": "precios", "faq": "faq",
                "contacto": "contacto", "galeria": "galeria", "equipo": "equipo",
                "testimonios": "testimonios", "pasos": "como-funciona", "cta": "cta",
                "imagen": "imagen", "estadisticas": "cifras", "logos": "logos"}


# ============================================================
# PLANTILLAS
# ============================================================
def css_de(paleta, tipo):
    p = PALETAS[paleta]
    css = f"""/* Generado por CerebroNico · pack creador-web v{VERSION}
   Paleta: {p['nombre']} · Tipografía: {tipo}
   Sin frameworks: CSS moderno (custom properties, clamp, grid). */
:root {{
{ESCALA}
    --bg: {p['bg']};
    --superficie: {p['superficie']};
    --texto: {p['texto']};
    --texto-suave: {p['texto_suave']};
    --acento: {p['acento']};
    --acento-texto: {p['acento_texto']};
    --borde: {p['borde']};
    --radio: 14px;
    --sombra: 0 10px 30px rgba(0,0,0,.18);
    --max: 1120px;
}}

* {{ box-sizing: border-box; }}
html {{ scroll-behavior: smooth; }}
body {{
    margin: 0;
    background: var(--bg);
    color: var(--texto);
    {TIPOS.get(tipo, TIPOS['sistema'])}
    font-size: var(--fs-400);
    line-height: 1.6;
    -webkit-text-size-adjust: 100%;
}}
img, svg, video {{ max-width: 100%; height: auto; display: block; }}
a {{ color: var(--acento); text-underline-offset: 3px; }}
:focus-visible {{ outline: 3px solid var(--acento); outline-offset: 2px; }}
.contenedor {{ width: min(100% - 2rem, var(--max)); margin-inline: auto; }}
.boton {{
    display: inline-block; padding: .8rem 1.3rem; border-radius: 999px;
    background: var(--acento); color: var(--acento-texto);
    text-decoration: none; font-weight: 650; border: 0; cursor: pointer;
}}
.boton--sec {{ background: transparent; color: var(--texto); border: 1px solid var(--borde); }}
.boton:hover {{ filter: brightness(1.06); }}
.cabecera {{ position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 88%, transparent); border-bottom: 1px solid var(--borde); }}
.cabecera__fila {{ display: flex; align-items: center; gap: 1rem; justify-content: space-between; padding: .8rem 0; }}
.marca {{ font-weight: 750; letter-spacing: -.02em; text-decoration: none; color: var(--texto); font-size: var(--fs-500); }}
.menu {{ display: flex; gap: 1.1rem; align-items: center; }}
.menu a {{ color: var(--texto-suave); text-decoration: none; font-size: var(--fs-300); }}
.menu a:hover {{ color: var(--texto); }}
.menu__toggle {{ display: none; background: none; border: 1px solid var(--borde); border-radius: 10px; padding: .5rem .7rem; color: var(--texto); }}
@media (max-width: 720px) {{
    .menu__toggle {{ display: block; }}
    .menu {{ position: absolute; inset: 100% 0 auto 0; flex-direction: column; align-items: flex-start;
             background: var(--superficie); border-bottom: 1px solid var(--borde); padding: 1rem;
             display: none; }}
    .menu.is-abierto {{ display: flex; }}
}}
section {{ padding: clamp(3rem, 7vw, 6rem) 0; }}
.titulo {{ font-size: var(--fs-700); line-height: 1.15; letter-spacing: -.02em; margin: 0 0 .6rem; }}
.subtitulo {{ color: var(--texto-suave); font-size: var(--fs-500); margin: 0 0 2rem; max-width: 60ch; }}
.hero {{ background:
    radial-gradient(1000px 460px at 12% -10%, color-mix(in srgb, var(--acento) 22%, transparent), transparent),
    var(--bg); }}
.hero h1 {{ font-size: clamp(2.1rem, 6vw, var(--fs-800)); line-height: 1.05; letter-spacing: -.03em; margin: 0 0 1rem; max-width: 22ch; }}
.hero__acciones {{ display: flex; gap: .8rem; flex-wrap: wrap; margin-top: 1.8rem; }}
.rejilla {{ display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }}
.tarjeta {{ background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); padding: 1.4rem; }}
.tarjeta h3 {{ margin: 0 0 .4rem; font-size: var(--fs-500); }}
.tarjeta p {{ margin: 0; color: var(--texto-suave); }}
.pasos {{ counter-reset: paso; display: grid; gap: 1rem; }}
.paso {{ counter-increment: paso; display: flex; gap: 1rem; align-items: flex-start; }}
.paso::before {{ content: counter(paso); flex: 0 0 2.2rem; height: 2.2rem; display: grid; place-items: center;
    border-radius: 50%; background: var(--acento); color: var(--acento-texto); font-weight: 700; }}
precios, .tabla-precios {{ width: 100%; }}
.precio__precio {{ font-size: var(--fs-600); font-weight: 750; }}
.precio__lista {{ list-style: none; padding: 0; margin: 1rem 0; color: var(--texto-suave); }}
.precio__lista li {{ padding-left: 1.4rem; position: relative; }}
.precio__lista li::before {{ content: "✓"; position: absolute; left: 0; color: var(--acento); }}
.cita {{ margin: 0; font-size: var(--fs-500); }}
.cita + footer {{ margin-top: .8rem; font-size: var(--fs-300); color: var(--texto-suave); font-style: normal; }}
.faq details {{ border-bottom: 1px solid var(--borde); padding: .4rem 0; }}
.faq summary {{ cursor: pointer; font-weight: 600; padding: .6rem 0; }}
form {{ display: grid; gap: 1rem; max-width: 560px; }}
label {{ font-weight: 600; font-size: var(--fs-300); display: block; margin-bottom: .3rem; }}
input, textarea, select {{
    width: 100%; padding: .75rem .9rem; border-radius: 10px; border: 1px solid var(--borde);
    background: var(--superficie); color: var(--texto); font: inherit; }}
.errores-formulario {{ color: #e5484d; font-size: var(--fs-300); min-height: 1.2em; }}
.pie {{ border-top: 1px solid var(--borde); padding: 2rem 0; color: var(--texto-suave); font-size: var(--fs-300); }}
.galeria {{ display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(min(100%,220px),1fr)); }}
.galeria figure {{ margin: 0; border-radius: var(--radio); overflow: hidden; border: 1px solid var(--borde); background: var(--superficie); }}
.galeria figcaption {{ padding: .7rem .9rem; font-size: var(--fs-300); color: var(--texto-suave); }}
.cta {{ background: var(--superficie); border-block: 1px solid var(--borde); text-align: center; }}
[hidden] {{ display: none !important; }}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} .reveal {{ opacity: 1 !important; transform: none !important; }} }}
.reveal {{ opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease; }}
.reveal.is-visible {{ opacity: 1; transform: none; }}
.skip {{ position: absolute; left: -999px; top: 0; }}
.skip:focus {{ left: 1rem; z-index: 50; background: var(--acento); color: var(--acento-texto); padding: .6rem 1rem; border-radius: 0 0 10px 0; }}
/* v1.51.0 — hero partido, imagen destacada, cifras y logos */
.hero--split .hero__split {{ display: grid; gap: clamp(1.5rem, 4vw, 3rem); align-items: center; grid-template-columns: 1.1fr .9fr; }}
.hero--split .hero__media {{ margin: 0; border-radius: var(--radio); overflow: hidden; border: 1px solid var(--borde); background: var(--superficie); }}
@media (max-width: 760px) {{ .hero--split .hero__split {{ grid-template-columns: 1fr; }} }}
.media .media__fig {{ margin: 0; border-radius: var(--radio); overflow: hidden; border: 1px solid var(--borde); background: var(--superficie); }}
.media .media__pie {{ padding: .8rem 1rem; font-size: var(--fs-300); color: var(--texto-suave); }}
.cifras__rejilla {{ display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); text-align: center; }}
.cifra {{ background: var(--superficie); border: 1px solid var(--borde); border-radius: var(--radio); padding: 1.4rem; display: grid; gap: .3rem; }}
.cifra__num {{ font-size: var(--fs-700); font-weight: 750; color: var(--acento); line-height: 1; }}
.cifra__eti {{ color: var(--texto-suave); font-size: var(--fs-300); }}
.logos__fila {{ list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 1.4rem 2.2rem; align-items: center; justify-content: center; }}
.logos__fila img {{ max-height: 48px; width: auto; filter: grayscale(1); opacity: .75; }}
.logos__fila img:hover {{ filter: none; opacity: 1; }}
.logo__texto {{ font-weight: 700; color: var(--texto-suave); font-size: var(--fs-500); letter-spacing: -.01em; }}
"""
    return css


def js_del_sitio():
    return """/* Generado por CerebroNico · pack creador-web. Sin dependencias externas. */
(function () {
  "use strict";

  // Menú accesible: aria-expanded manda, y Escape cierra.
  var boton = document.querySelector(".menu__toggle");
  var menu = document.getElementById("menu");
  if (boton && menu) {
    boton.addEventListener("click", function () {
      var abierto = menu.classList.toggle("is-abierto");
      boton.setAttribute("aria-expanded", abierto ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-abierto")) {
        menu.classList.remove("is-abierto");
        boton.setAttribute("aria-expanded", "false");
        boton.focus();
      }
    });
  }

  // Revelado progresivo con respeto a prefers-reduced-motion.
  var reducidos = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var elementos = document.querySelectorAll(".reveal");
  if (!reducidos && "IntersectionObserver" in window && elementos.length) {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("is-visible");
          observador.unobserve(entrada.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    elementos.forEach(function (el) { observador.observe(el); });
  } else {
    elementos.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // Validación de formulario con mensajes en el DOM (no alert).
  var form = document.querySelector("form[data-validar]");
  if (form) {
    var caja = form.querySelector(".errores-formulario");
    form.addEventListener("submit", function (e) {
      var problemas = [];
      form.querySelectorAll("[required]").forEach(function (campo) {
        if (!campo.value.trim()) problemas.push(campo.name + ": obligatorio");
      });
      var correo = form.querySelector('input[type="email"]');
      if (correo && correo.value && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test(correo.value)) {
        problemas.push("correo: formato inválido");
      }
      if (problemas.length) {
        e.preventDefault();
        if (caja) caja.textContent = problemas.join(" · ");
        var primero = form.querySelector("[aria-invalid]");
        if (primero) primero.focus();
        form.querySelectorAll(".campo-problema").forEach(function (c) { c.classList.remove("campo-problema"); });
      } else if (caja) {
        caja.textContent = "";
      }
    });
  }

  // El service worker se registra solo si el archivo está (sitios con PWA).
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* sin SW no hay offline: sigue funcionando */ });
    });
  }

  // Año del pie, sin mantenerlo a mano.
  var anio = document.querySelector("[data-anio]");
  if (anio) anio.textContent = String(new Date().getFullYear());
})();
"""


def _bloques_html(datos, paleta):
    """Compone los bloques pedidos. Cada uno va entre marcadores para poder
    reemplazarlo después de forma idempotente."""
    p = PALETAS[paleta]
    nombre = datos.get("nombre") or "Sitio"
    titulo = datos.get("titulo") or nombre
    subtitulo = datos.get("subtitulo") or PLACEHOLDER
    cta = datos.get("cta") or "Empezar"
    contacto = datos.get("contacto") or ""
    items = datos.get("caracteristicas") or []
    pasos = datos.get("pasos") or []
    planes = datos.get("planes") or []
    testimonios = datos.get("testimonios") or []
    preguntas = datos.get("faq") or []
    piezas = datos.get("galeria") or []
    personas = datos.get("equipo") or []
    presentes = {b for b in datos.get("bloques", []) if b in ID_DE_BLOQUE}
    enlaces_por_defecto = [(ETIQUETA_DE.get(b, b.title()), ID_DE_BLOQUE[b]) for b in datos.get("bloques", [])
                           if b in ID_DE_BLOQUE]
    enlaces_entradas = []
    for x in (datos.get("enlaces") or []):
        if isinstance(x, str) and "|" in x:
            etiquetas, destino = x.split("|", 1)
            enlaces_entradas.append((etiquetas.strip(), destino.strip()))
    enlaces = enlaces_entradas or enlaces_por_defecto
    out = []

    # v1.51.0 — los botones del hero/barra/precios/cta ya no apuntan a «#contacto»
    # a ciegas: una receta sin bloque contacto dejaba ese enlace roto (ancla-rota).
    # Se calcula el destino real a partir de los bloques presentes.
    ids_presentes = [ID_DE_BLOQUE[b] for b in datos.get("bloques", []) if b in ID_DE_BLOQUE]
    destino_cta = "contacto" if "contacto" in datos.get("bloques", []) else (ids_presentes[0] if ids_presentes else "arriba")
    destino_sec = next((i for i in ids_presentes if i != destino_cta), None)

    def abrir(bloque):
        out.append(f"    <!-- bloque:{bloque}:inicio -->")

    def cerrar(bloque):
        out.append(f"    <!-- bloque:{bloque}:fin -->")

    for bloque in datos.get("bloques", TIPOS_SITIO["landing"]):
        if bloque == "barra":
            abrir(bloque)
            nav = "\n".join(
                f'        <a href="#{_esc(destino)}">{_esc(etiqueta)}</a>'
                for etiqueta, destino in enlaces if destino)
            out.append(f"""  <header class="cabecera">
    <div class="contenedor cabecera__fila">
      <a class="marca" href="#arriba">{_esc(nombre)}</a>
      <button class="menu__toggle" type="button" aria-expanded="false" aria-controls="menu">Menú</button>
      <nav id="menu" class="menu" aria-label="Navegación principal">
{nav}
        <a class="boton" href="#{destino_cta}">{_esc(cta)}</a>
      </nav>
    </div>
  </header>""")
            cerrar(bloque)
        elif bloque == "hero":
            abrir(bloque)
            variante = str(datos.get("hero_variante") or "").strip().lower()
            hero_src, _ = _ref_imagen(datos.get("hero_imagen")) if datos.get("hero_imagen") else (None, None)
            if hero_src and variante not in ("centrado", "minimal"):
                variante = "split"
            if variante == "minimal":
                acciones = f'        <a class="boton" href="#{destino_cta}">{_esc(cta)}</a>'
            else:
                sec = (f'\n        <a class="boton boton--sec" href="#{destino_sec}">Ver más</a>') if destino_sec else ""
                acciones = (f'        <a class="boton" href="#{destino_cta}">{_esc(cta)}</a>{sec}')
            texto_hero = (f'      <h1>{_esc(titulo)}</h1>\n'
                          f'      <p class="subtitulo">{_esc(subtitulo)}</p>\n'
                          f'      <div class="hero__acciones">\n{acciones}\n      </div>')
            if variante == "split" and hero_src:
                out.append(f"""  <section class="hero hero--split reveal" id="arriba">
    <div class="contenedor hero__split">
      <div class="hero__texto">
{texto_hero}
      </div>
      <figure class="hero__media"><img src="{_esc(hero_src)}" alt="{_esc(datos.get('hero_imagen_alt') or titulo)}" loading="eager" decoding="async"></figure>
    </div>
  </section>""")
            else:
                clase = "hero hero--minimal reveal" if variante == "minimal" else "hero reveal"
                out.append(f"""  <section class="{clase}" id="arriba">
    <div class="contenedor">
{texto_hero}
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "caracteristicas":
            abrir(bloque)
            tarjetas = "\n".join(
                f'      <article class="tarjeta"><h3>{_esc(it.get("titulo") or "Característica")}</h3>'
                f'<p>{_esc(it.get("texto") or PLACEHOLDER)}</p></article>' for it in items) or \
                '      <article class="tarjeta"><h3>Característica</h3><p>' + _esc(PLACEHOLDER) + '</p></article>'
            out.append(f"""  <section id="caracteristicas">
    <div class="contenedor">
      <h2 class="titulo">Qué hace {(_esc(nombre))}</h2>
      <p class="subtitulo">{_esc(datos.get("caracteristicas_texto") or PLACEHOLDER)}</p>
      <div class="rejilla">
{tarjetas}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "pasos":
            abrir(bloque)
            lis = "\n".join(f'      <p class="paso"><span>{_esc(s)}</span></p>' for s in pasos) or \
                 f'      <p class="paso"><span>{_esc(PLACEHOLDER)}</span></p>'
            out.append(f"""  <section id="como-funciona">
    <div class="contenedor">
      <h2 class="titulo">Cómo funciona</h2>
      <div class="pasos">
{lis}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "precios":
            abrir(bloque)
            cols = "\n".join(
                f'''      <article class="tarjeta"><h3>{_esc(pl.get("nombre") or "Plan")}</h3>
        <p class="precio__precio">{_esc(pl.get("precio") or "—")}</p>
        <ul class="precio__lista">
{chr(10).join("          <li>" + _esc(b) + "</li>" for b in (pl.get("beneficios") or ["Incluye " + PLACEHOLDER]))}
        </ul>
        <a class="boton" href="#{destino_cta}">Elegir {_esc(pl.get("nombre") or "plan")}</a></article>'''
                for pl in planes) or f'      <article class="tarjeta"><h3>Plan</h3><p class="precio__precio">—</p><p>{_esc(PLACEHOLDER)}</p></article>'
            out.append(f"""  <section id="precios">
    <div class="contenedor">
      <h2 class="titulo">Precios</h2>
      <div class="rejilla">
{cols}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "testimonios":
            abrir(bloque)
            citas = "\n".join(
                f'      <figure class="tarjeta"><blockquote class="cita">{_esc(t.get("cita") or PLACEHOLDER)}</blockquote>'
                f'<figcaption>— {_esc(t.get("autor") or "Autor")} · {_esc(t.get("cargo") or "Cargo")}</figcaption></figure>'
                for t in testimonios) or f'      <figure class="tarjeta"><blockquote class="cita">{_esc(PLACEHOLDER)}</blockquote></figure>'
            out.append(f"""  <section id="testimonios">
    <div class="contenedor">
      <h2 class="titulo">Lo que dicen</h2>
      <div class="rejilla">
{citas}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "faq":
            abrir(bloque)
            dts = "\n".join(
                f'      <details><summary>{_esc(q.get("pregunta") or "Pregunta")}</summary><p>{_esc(q.get("respuesta") or PLACEHOLDER)}</p></details>'
                for q in preguntas) or f'      <details><summary>Pregunta</summary><p>{_esc(PLACEHOLDER)}</p></details>'
            out.append(f"""  <section id="faq" class="faq">
    <div class="contenedor">
      <h2 class="titulo">Preguntas frecuentes</h2>
{dts}
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "galeria":
            abrir(bloque)
            figs = "\n".join(
                f'      <figure><img src="{_esc(_ref_imagen(g.get("imagen"))[0])}" alt="{_esc(g.get("texto_alternativo") or PLACEHOLDER)}" loading="lazy"><figcaption>{_esc(g.get("titulo") or "Pieza")}</figcaption></figure>'
                for g in piezas) or f'      <figure><img src="assets/placeholder.svg" alt="{_esc(PLACEHOLDER)}" loading="lazy"></figure>'
            out.append(f"""  <section id="galeria">
    <div class="contenedor">
      <h2 class="titulo">Trabajo</h2>
      <div class="galeria">
{figs}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "imagen":
            abrir(bloque)
            media = datos.get("media") or {}
            src = _ref_imagen(media.get("imagen"))[0]
            cap = media.get("titulo") or ""
            txt = media.get("texto") or ""
            pie = (f'      <figcaption class="media__pie"><strong>{_esc(cap)}</strong>'
                   f'{(" " + _esc(txt)) if txt else ""}</figcaption>') if (cap or txt) else ""
            out.append(f"""  <section id="imagen" class="media">
    <div class="contenedor">
      <figure class="media__fig">
        <img src="{_esc(src)}" alt="{_esc(media.get('texto_alternativo') or cap or PLACEHOLDER)}" loading="lazy" decoding="async">
{pie}
      </figure>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "estadisticas":
            abrir(bloque)
            cifras = datos.get("estadisticas") or []
            celdas = "\n".join(
                f'      <div class="cifra"><span class="cifra__num">{_esc(c.get("cifra") or "—")}</span>'
                f'<span class="cifra__eti">{_esc(c.get("etiqueta") or PLACEHOLDER)}</span></div>'
                for c in cifras) or (f'      <div class="cifra"><span class="cifra__num">—</span>'
                                     f'<span class="cifra__eti">{_esc(PLACEHOLDER)}</span></div>')
            out.append(f"""  <section id="cifras" class="cifras">
    <div class="contenedor">
      <h2 class="titulo">En números</h2>
      <div class="cifras__rejilla">
{celdas}
      </div>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "logos":
            abrir(bloque)
            marcas = datos.get("logos") or []
            piezas_logo = []
            for m in marcas:
                if isinstance(m, str):
                    m = {"nombre": m}
                nom = m.get("nombre") or m.get("texto_alternativo") or "Marca"
                if m.get("imagen"):
                    src = _ref_imagen(m.get("imagen"))[0]
                    piezas_logo.append(f'      <li><img src="{_esc(src)}" alt="{_esc(m.get("texto_alternativo") or nom)}" loading="lazy"></li>')
                else:
                    piezas_logo.append(f'      <li><span class="logo__texto">{_esc(nom)}</span></li>')
            lista = "\n".join(piezas_logo) or f'      <li><span class="logo__texto">{_esc(PLACEHOLDER)}</span></li>'
            out.append(f"""  <section id="logos" class="logos">
    <div class="contenedor">
      <h2 class="titulo">Confían en {_esc(nombre)}</h2>
      <ul class="logos__fila">
{lista}
      </ul>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "equipo":
            abrir(bloque)
            per = "\n".join(
                f'      <article class="tarjeta"><h3>{_esc(pe.get("nombre") or "Nombre")}</h3><p>{_esc(pe.get("rol") or PLACEHOLDER)}</p></article>'
                for pe in personas) or f'      <article class="tarjeta"><h3>Nombre</h3><p>{_esc(PLACEHOLDER)}</p></article>'
            out.append(f"""  <section id="equipo">
    <div class="contenedor"><h2 class="titulo">Equipo</h2>
      <div class="rejilla">
{per}
      </div></div>
  </section>""")
            cerrar(bloque)
        elif bloque == "contacto":
            abrir(bloque)
            correo = _esc(contacto) if contacto else ""
            mailto = f'<p><a href="mailto:{correo}">{correo}</a></p>' if contacto else \
                     f'<p>{_esc(PLACEHOLDER)} (define <code>contacto</code> al crear el sitio)</p>'
            out.append(f"""  <section id="contacto">
    <div class="contenedor">
      <h2 class="titulo">Hablemos</h2>
      {mailto}
      <form data-validar action="#" method="post" aria-label="Formulario de contacto">
        <p><label for="nombre">Nombre</label><input id="nombre" name="nombre" required autocomplete="name"></p>
        <p><label for="correo">Correo</label><input id="correo" name="correo" type="email" required autocomplete="email"></p>
        <p><label for="mensaje">Mensaje</label><textarea id="mensaje" name="mensaje" rows="4" required></textarea></p>
        <p class="errores-formulario" role="status" aria-live="polite"></p>
        <p><button class="boton" type="submit">Enviar</button></p>
      </form>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "cta":
            abrir(bloque)
            out.append(f"""  <section id="cta" class="cta">
    <div class="contenedor">
      <h2 class="titulo">{_esc(datos.get("cta_texto") or "¿Listo para empezar?")}</h2>
      <p class="subtitulo">{_esc(datos.get("cta_subtexto") or subtitulo if (datos.get("cta_subtexto") or subtitulo) != PLACEHOLDER else PLACEHOLDER)}</p>
      <a class="boton" href="#{destino_cta}">{_esc(cta)}</a>
    </div>
  </section>""")
            cerrar(bloque)
        elif bloque == "pie":
            abrir(bloque)
            out.append(f"""  <footer class="pie">
    <div class="contenedor">
      <p><strong>{_esc(nombre)}</strong> · <span data-anio>{time.strftime('%Y')}</span></p>
      <p>{_esc(datos.get("pie_texto") or "Hecho con CerebroNico.")}</p>
    </div>
  </footer>""")
            cerrar(bloque)
    return "\n\n".join(out), {"acento": p["acento"], "nombre": p["nombre"]}


# ============================================================
# ENSAMBLADO DE PÁGINA
# ============================================================
def construir_pagina(datos, cuerpo_bloques, meta_extra=None):
    p = PALETAS[datos.get("paleta", "claro")]
    nombre = datos.get("nombre") or "Sitio"
    titulo = datos.get("titulo_pagina") or nombre
    descripcion = (datos.get("descripcion") or datos.get("subtitulo") or PLACEHOLDER)[:155]
    meta_extra = meta_extra or ""
    return f"""<!DOCTYPE html>
<html lang="{_esc(datos.get('idioma', 'es'))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_esc(titulo)}</title>
  <meta name="description" content="{_esc(descripcion)}">
  <meta name="theme-color" content="{p['acento']}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{_esc(titulo)}">
  <meta property="og:description" content="{_esc(descripcion)}">
  <meta property="og:image" content="assets/og-image.svg">
  <meta name="twitter:card" content="summary_large_image">
{('  <link rel="canonical" href="%s">' % _esc(datos["url_canonica"])) if datos.get("url_canonica") else ""}
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/estilo.css">
{meta_extra}  <script src="js/main.js" defer></script>
</head>
<body>
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <main id="contenido">
{cuerpo_bloques}
  </main>
</body>
</html>
"""


def _sitio_existe(raiz_sitio):
    return os.path.isfile(os.path.join(raiz_sitio, "index.html"))


def _registrar_sitio(nombre, ruta, datos):
    registros = {}
    try:
        with open(REGISTRO_RUTA, "r", encoding="utf-8") as f:
            registros = json.load(f)
    except Exception:
        registros = {}
    registros[nombre] = {"ruta": ruta, "creado": int(time.time() * 1000),
                         "paleta": datos.get("paleta", "claro"),
                         "tipo": datos.get("tipo", "landing"),
                         "bloques": datos.get("bloques", [])}
    _escribir_atomico(REGISTRO_RUTA, json.dumps(registros, ensure_ascii=False, indent=1))
    return registros


def _svg_placeholder():
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" '
            'role="img" aria-label="Imagen provisional"><rect width="640" height="360" fill="#e9edf2"/>'
            '<text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="22" fill="#68727f" '
            'text-anchor="middle">Imagen provisional</text></svg>')


def _favicon_svg(acento):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Marca">'
            f'<rect width="32" height="32" rx="7" fill="{acento}"/>'
            f'<circle cx="16" cy="16" r="6" fill="#ffffff" opacity=".92"/></svg>')


def _ref_imagen(valor, raiz=None):
    """Normaliza una referencia de imagen a un `src` usable y SEGURO.

    Devuelve (src, aviso|None). En orden:
    - vacío               -> placeholder generado (nunca deja un <img> roto).
    - http(s):// o data:image/ -> se referencia tal cual (el pack NO descarga).
    - otro esquema (javascript:, file:, …) -> placeholder + aviso (no se confía).
    - ruta local          -> se normaliza (barras, ./, / inicial); si escapa con
      «..» cae al placeholder; si hay `raiz` y el archivo no está en disco se
      respeta la ruta pero se avisa (lo coherente es insertar_imagen primero).
    """
    v = str(valor or "").strip().replace("\\", "/")
    if not v:
        return "assets/placeholder.svg", None
    bajo = v.lower()
    if bajo.startswith(("http://", "https://", "data:image/")):
        return v, None
    if re.match(r"^[a-z][a-z0-9+.\-]*:", bajo):
        return "assets/placeholder.svg", f"Esquema de imagen no permitido en «{v[:40]}»: se usa una provisional."
    v = v.lstrip("/")
    while v.startswith("./"):
        v = v[2:]
    if ".." in v.split("/"):
        return "assets/placeholder.svg", "La ruta de imagen escapaba del sitio: se usa una provisional."
    aviso = None
    if raiz and not os.path.exists(os.path.join(raiz, v.split("?")[0])):
        aviso = f"La imagen «{v}» aún no existe en el sitio: colócala con insertar_imagen o súbela a assets/."
    return v, aviso


_FIRMAS_IMAGEN = {
    b"\x89PNG\r\n\x1a\n": ("png", "image/png"),
    b"\xff\xd8\xff": ("jpg", "image/jpeg"),
    b"GIF87a": ("gif", "image/gif"),
    b"GIF89a": ("gif", "image/gif"),
}


def _tipo_imagen(datos_bytes):
    """Reconoce el formato por los bytes de cabecera (no por la extensión)."""
    for firma, (ext, mime) in _FIRMAS_IMAGEN.items():
        if datos_bytes.startswith(firma):
            return ext, mime
    if datos_bytes[:4] == b"RIFF" and datos_bytes[8:12] == b"WEBP":
        return "webp", "image/webp"
    cab = datos_bytes[:512].lstrip().lower()
    if cab.startswith(b"<svg") or (cab.startswith(b"<?xml") and b"<svg" in cab):
        return "svg", "image/svg+xml"
    return None, None


def _svg_seguro(texto):
    """Quita del SVG lo que podría ejecutarse: <script>, on*=… y javascript:."""
    limpio = re.sub(r"(?is)<script.*?</script>", "", str(texto or ""))
    limpio = re.sub(r"(?is)<\s*script[^>]*/?>", "", limpio)
    limpio = re.sub(r'(?i)\son[a-z]+\s*=\s*"[^"]*"', "", limpio)
    limpio = re.sub(r"(?i)\son[a-z]+\s*=\s*'[^']*'", "", limpio)
    limpio = re.sub(r"(?i)javascript:", "", limpio)
    return limpio


def h_crear_sitio(args):
    bruto = str(args.get("nombre") or args.get("titulo") or "sitio")
    # Un nombre con "/" o ".." no se sanitiza a escondidas: se rechaza con motivo.
    # Silenciarlo (convertir "../../x" en "x" y escribir igualmente) hacía que el
    # modelo creyera que había creado «../../x» y el sitio apareciera en otro lado.
    if re.search(r"[/\\]|\.\.", bruto):
        return {"ok": False, "error": f"El nombre no puede contener rutas: «{bruto}». "
                                      f"Usa un nombre de sitio; la carpeta se crea sola."}
    nombre = _slug(bruto)
    tipo = args.get("tipo") if args.get("tipo") in TIPOS_SITIO else "landing"
    paleta = args.get("paleta") if args.get("paleta") in PALETAS else "claro"
    tipo_letra = args.get("tipografia") if args.get("tipografia") in TIPOS else "sistema"
    bloques = args.get("bloques") if isinstance(args.get("bloques"), list) and args.get("bloques") else TIPOS_SITIO[tipo]
    mal = [b for b in bloques if b not in BLOQUES_DISPONIBLES]
    if mal:
        return {"ok": False, "error": f"Bloques desconocidos: {', '.join(mal)}",
                "disponibles": BLOQUES_DISPONIBLES}
    raiz, error = _resolver(nombre, escribir=True)
    if error:
        return error
    if _sitio_existe(raiz) and not bool(args.get("sobrescribir")):
        return {"ok": False, "error": f"Ya existe el sitio «{nombre}». Usa sobrescribir: true para regenerarlo "
                                      f"(deja snapshot) o crear_bloque para editar sin tocar lo demás."}
    datos = dict(args)
    datos.update({"nombre": args.get("nombre") or nombre.title(), "tipo": tipo, "paleta": paleta,
                  "tipografia": tipo_letra, "bloques": bloques})
    if _sitio_existe(raiz):
        destino_snap = os.path.join(HISTORIAL, nombre, time.strftime("%Y%m%d-%H%M%S"))
        os.makedirs(destino_snap, exist_ok=True)
        shutil.copy2(os.path.join(raiz, "index.html"), os.path.join(destino_snap, "index.html"))
        restos = sorted(os.listdir(os.path.join(HISTORIAL, nombre)))
        for viejo in restos[:-SNAPSHOTS_POR_SITIO]:
            shutil.rmtree(os.path.join(HISTORIAL, nombre, viejo), ignore_errors=True)

    cuerpo, meta = _bloques_html(datos, paleta)
    os.makedirs(os.path.join(raiz, "css"), exist_ok=True)
    os.makedirs(os.path.join(raiz, "js"), exist_ok=True)
    os.makedirs(os.path.join(raiz, "assets"), exist_ok=True)
    _escribir_atomico(os.path.join(raiz, "index.html"), construir_pagina(datos, cuerpo))
    _escribir_atomico(os.path.join(raiz, "css", "estilo.css"), css_de(paleta, tipo_letra))
    _escribir_atomico(os.path.join(raiz, "js", "main.js"), js_del_sitio())
    _escribir_atomico(os.path.join(raiz, "assets", "placeholder.svg"), _svg_placeholder())
    _escribir_atomico(os.path.join(raiz, "assets", "favicon.svg"), _favicon_svg(meta["acento"]))
    _escribir_atomico(os.path.join(raiz, "assets", "og-image.svg"), og_image_svg(datos))
    _cablear_pwa(raiz, {"name": datos["nombre"], "short_name": datos["nombre"][:20], "start_url": "./index.html",
         "scope": "./", "display": "standalone", "lang": "es", "background_color": PALETAS[paleta]["bg"],
         "theme_color": PALETAS[paleta]["acento"]})
    _escribir_atomico(os.path.join(raiz, "robots.txt"), f"User-agent: *\nAllow: /\n\n# Sitio «{datos['nombre']}»\n")
    _escribir_atomico(os.path.join(raiz, "README.md"),
                      f"# {datos['nombre']}\n\nGenerado por CerebroNico · pack `creador-web` v{VERSION}\n\n"
                      f"- Tipo: `{tipo}` · Paleta: {meta['nombre']} · Tipografía: {tipo_letra}\n"
                      f"- Bloques: {', '.join(bloques)}\n\n"
                      f"## Previsualizar\n\n```bash\npython3 -m http.server 3500 --directory .\n```\n\n"
                      f"## Personalizar\n\nBusca los marcadores `{PLACEHOLDER}`: son datos que faltaban y que\n"
                      f"el generador **no inventó**. Rellénalos antes de publicar.\n")
    registros = _registrar_sitio(nombre, raiz, datos)
    informe = auditar_html(_leer(os.path.join(raiz, "index.html")), raiz)
    return {"ok": True, "servicio": NOMBRE_SERVICIO, "sitio": nombre, "ruta": raiz,
            "archivos": ["index.html", "css/estilo.css", "js/main.js", "manifest.webmanifest", "sw.js", "assets/icon-192.png", "assets/icon-512.png",
                         "robots.txt", "README.md", "assets/og-image.svg", "assets/favicon.svg",
                         "assets/placeholder.svg"],
            "bloques": bloques, "paleta": meta["nombre"], "sitios_registrados": len(registros),
            "auditoria_inicial": {"errores": informe["conteo"]["error"], "avisos": informe["conteo"]["aviso"]},
            "aviso": "Hay marcadores [Personaliza este texto] donde no diste datos: no se inventó contenido."}


# ============================================================
# AUDITORÍA — comprobaciones reales, con corrección concreta
# ============================================================
GRANDES = ("div", "section", "main", "header", "footer", "nav", "article", "form", "ul", "ol", "table")


def auditar_html(html, raiz=None):
    hallazgos = []

    def add(nivel, codigo, que, correccion, detalle=""):
        hallazgos.append({"nivel": nivel, "codigo": codigo, "que": que,
                          "correccion": correccion, "detalle": detalle[:200]})

    bajo = html.lower()
    if "<!doctype html>" not in bajo:
        add("error", "doctype", "Falta <!DOCTYPE html>",
            'Añadir "<!DOCTYPE html>" como primera línea.')
    etiqueta_html = re.search(r"<html\b([^>]*)>", html, re.I)
    if not etiqueta_html:
        add("error", "html", "No hay elemento <html>.", "Revisar la estructura del documento.")
    elif not re.search(r"\blang=", etiqueta_html.group(1), re.I):
        add("error", "lang", "<html> sin atributo lang.", 'Poner <html lang="es"> (o el idioma real).')
    if not re.search(r"<title[^>]*>\s*\S", html, re.I):
        add("error", "title", "Falta <title> con texto.", "Añadir un título de 10 a 60 caracteres.")
    else:
        t = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S).group(1).strip()
        if len(t) < 10:
            add("aviso", "title-corto", f"<title> muy corto ({len(t)} caracteres).", "Ampliar a 10-60 caracteres.")
        if len(t) > 65:
            add("aviso", "title-largo", f"<title> largo ({len(t)} caracteres): se corta en buscadores.",
                "Resumir a menos de 60.")
    if not re.search(r'<meta\s+name=["\']?viewport["\']?[^>]+content=', html, re.I):
        add("error", "viewport", "Falta meta viewport: no escala en móvil.",
            'Añadir <meta name="viewport" content="width=device-width, initial-scale=1">.')
    md = re.search(r'<meta\s+name=["\']?description["\']?[^>]*content=["\']([^"\']*)["\']', html, re.I)
    if not md or not md.group(1).strip():
        add("error", "descripcion", "Falta meta description.",
            'Añadir <meta name="description" content="…"> de 50 a 155 caracteres.')
    elif len(md.group(1)) > 160:
        add("aviso", "descripcion-larga", f"meta description de {len(md.group(1))} caracteres.",
            "Recortar a 155.")
    h1s = re.findall(r"<h1\b[^>]*>(.*?)</h1>", html, re.I | re.S)
    if len(h1s) == 0:
        add("error", "h1", "No hay ningún <h1>.", "El titular principal debe ser un solo h1.")
    elif len(h1s) > 1:
        add("aviso", "h1-multiples", f"{len(h1s)} elementos <h1>.", "Dejar uno solo; los demás como h2.")
    niveles = [int(n) for n in re.findall(r"<h([1-6])\b", html, re.I)]
    saltos = [(a, b) for a, b in zip(niveles, niveles[1:]) if b - a > 1]
    if saltos:
        add("aviso", "heading-salto", f"Saltos de jerarquía: {saltos[:3]}.",
            "Subir de nivel de uno en uno (h1 → h2 → h3).")
    imgs = re.findall(r"<img\b[^>]*>", html, re.I)
    sin_alt = [i for i in imgs if not re.search(r"\balt=", i, re.I)]
    if sin_alt:
        add("error", "img-alt", f"{len(sin_alt)} <img> sin alt.",
            'Añadir alt="descripción" o alt="" si es decorativa.')
    sin_lazy = [i for i in imgs if "loading=" not in i.lower()]
    if len(sin_lazy) > 1:
        add("aviso", "img-lazy", f"{len(sin_lazy)} <img> sin loading=\"lazy\".",
            "Marcar como lazy las que van debajo del primer pliegue.")
    vacios = re.findall(r"<(button|a)\b([^>]*)>\s*</\1>", html, re.I)
    sin_nombre = [m for m in vacios if not re.search(r"aria-label", m[1], re.I)]
    if sin_nombre:
        add("error", "control-vacio", f"{len(sin_nombre)}<{sin_nombre[0][0]}> sin texto accesible.",
            'Añadir texto visible o aria-label="…".')
    insum = re.findall(r"<input\b[^>]*>", html, re.I)
    ids_declarados = set(re.findall(r"\bid=[\"']([^\"']+)[\"']", html, re.I))
    huerfanos = 0
    for campo in insum:
        if re.search(r"type=[\"']?(hidden|submit|button)", campo, re.I):
            continue
        for_id = re.search(r"\bid=[\"']([^\"']+)[\"']", campo, re.I)
        etiquetado = bool(re.search(r"aria-label", campo, re.I))
        if not etiquetado and for_id and for_id.group(1) in ids_declarados:
            etiquetado = bool(re.search(r"<label\b[^>]*for=[\"']" + re.escape(for_id.group(1)) + r"[\"']", html, re.I))
        if not etiquetado:
            # <label>…<input>…</label> también es una etiqueta válida: el envoltorio
            # asocia el control sin necesidad de `for`. No reconocerlo marcaba de
            # error un banner de cookies perfectamente accesible.
            envoltorio = re.search(r"<label\b[^>]*>(?:(?!</label>)[\s\S])*?" + re.escape(campo), html, re.I)
            etiquetado = bool(envoltorio)
        if not etiquetado:
            huerfanos += 1
    if huerfanos:
        add("error", "label-huerfano", f"{huerfanos} campos sin <label for> ni aria-label.",
            "Todo control editable necesita etiqueta asociada.")
    head = bajo.split("</head>")[0]
    # El lookahead «(?!</script>)» estaba mal concebido: quería descartar scripts
    # en línea, pero lo que hacía era descartar los EXTERNOS, que son justo los que
    # bloquean el pintado (toda la página generada con «defer» se salvaba de la
    # comprobación y el auditor nunca veía un `<script src>` bloqueante).
    bloqueantes = [m for m in re.findall(r"<script[^>]*\bsrc=[^>]*>", head)
                   if "defer" not in m and "async" not in m and "type=\"module\"" not in m]
    bloqueantes = [s for s in bloqueantes if "defer" not in s and "async" not in s]
    if bloqueantes:
        add("aviso", "js-bloqueante", f"{len(bloqueantes)} scripts en <head> sin defer/async.",
            'Añadir defer para no bloquear el primer pintado.')
    styles_head = re.findall(r'<link[^>]+rel=["\']?stylesheet["\']?[^>]*>', head, re.I)
    inline = len(re.findall(r'style=["\'][^"\']{60,}["\']', html, re.I))
    if inline:
        add("info", "estilo-inline", f"{inline} atributos style largos.", "Mover a la hoja de estilos.")
    anclas = set(re.findall(r'href=["\']#([^"\'?]+)["\']', html, re.I))
    roto = sorted(a for a in anclas if a.lower() not in ids_declarados)
    if roto:
        add("error", "ancla-rota", f"Enlaces internos sin destino: {roto[:5]}.",
            "Crear los id faltantes o quitar los enlaces muertos.")
    if raiz:
        locales = set(re.findall(r'(?:src|href)=["\']((?!https?:|#|mailto:|tel:)[^"\']+)["\']', html, re.I))
        faltan = sorted(l for l in locales
                        if not l.startswith(("?", "/")) and not os.path.exists(os.path.join(raiz, l.split("?")[0])))
        if faltan:
            add("error", "archivo-faltante", f"Archivos locales referenciados que no existen: {faltan[:5]}.",
                "Generar/esos archivos o quitar las referencias.")
    for tag in GRANDES:
        ab = len(re.findall(rf"<{tag}\b", html, re.I)) - len(re.findall(rf"<{tag}\b[^>]*/>", html, re.I))
        ci = len(re.findall(rf"</{tag}>", html, re.I))
        if ab != ci:
            add("error", "sin-cerrar", f"<{tag}> sin balancear: {ab} aperturas vs {ci} cierres.",
                f"Cerrar las etiquetas <{tag}> que faltan.")
    if "<main" not in bajo:
        add("aviso", "sin-main", "No hay <main> (región principal).",
            'Envolver el contenido en <main id="contenido">.')
    if not re.search(r'class=["\'][^"\']*\bskip\b', html, re.I) and 'href="#contenido"' not in bajo:
        add("aviso", "sin-skip", "Sin enlace «Saltar al contenido».",
            'Añadir <a class="skip" href="#contenido">Saltar al contenido</a> al inicio del body.')
    for etiqueta, nombre in (("og:title", "Open Graph título"), ("og:description", "Open Graph descripción"),
                             ("og:image", "Open Graph imagen")):
        if etiqueta not in bajo:
            add("aviso", "og", f"Falta meta {nombre}.", f'Añadir <meta property="{etiqueta}" content="…">.')
    if "twitter:card" not in bajo:
        add("info", "twitter", "Sin twitter:card.", 'Añadir <meta name="twitter:card" content="summary_large_image">.')
    if 'rel="manifest"' not in bajo:
        if raiz and os.path.isfile(os.path.join(raiz, "manifest.webmanifest")):
            add("error", "pwa-huerfano", "Hay manifest.webmanifest en el sitio pero NINGÚN html lo enlaza: el navegador no lo ve y el install es imposible (defecto app-finanzas-dark, v1.57.16).",
                'Añadir <link rel="manifest" href="manifest.webmanifest"> al <head> o ejecutar crear_pwa.')
        else:
            add("info", "manifest", "Sin manifest PWA.", "Crear el manifest con crear_pwa.")
    else:
        # El registro vive en el JS enlazado, no en el HTML: buscar «serviceWorker»
        # solo en la página daba un falso «no registra SW» en sitios perfectamente
        # servibles. Se rastrea el JS local referenciado.
        registrado = bool(re.search(r"serviceWorker", html, re.I))
        if not registrado and raiz:
            for js in re.findall(r'<script[^>]+src=["\']([^"\']+\.js)["\']', html, re.I):
                try:
                    with open(os.path.join(raiz, js), "r", encoding="utf-8", errors="replace") as f:
                        if "serviceWorker" in f.read(60_000):
                            registrado = True
                            break
                except Exception:
                    continue
        if not registrado:
            if raiz and os.path.isfile(os.path.join(raiz, "sw.js")):
                add("error", "pwa-sw-muerto", "sw.js existe pero nadie lo registra: sin service worker activo no hay instalación posible.",
                    "Registrar en js/main.js: navigator.serviceWorker.register('./sw.js') o ejecutar crear_pwa.")
            else:
                add("info", "sw", "Tiene manifest pero ningún JS enlazado registra service worker.",
                    "Ejecutar crear_pwa o añadir el registro a js/main.js.")
    lc = re.search(r'<link rel="canonical" href="([^"]*)"', html, re.I)
    if lc and not lc.group(1).strip():
        add("info", "canonical", "<link rel=canonical> vacía.", "Poner la URL definitiva o quitar la línea.")
    peso = len(html.encode("utf-8"))
    if peso > 250_000:
        add("aviso", "peso", f"HTML de {peso // 1024} KB.", "Partir contenido o mover markup repetido a componentes.")
    texto = re.sub(r"<[^>]+>", " ", html)
    marcadores = texto.count("[Personaliza este texto]")
    if marcadores:
        add("aviso", "marcadores", f"{marcadores} marcadores [Personaliza este texto] sin rellenar.",
            "Rellenar el contenido real antes de publicar: el generador no inventa datos.")
    conteo = {"error": 0, "aviso": 0, "info": 0}
    for h_ in hallazgos:
        conteo[h_["nivel"]] = conteo.get(h_["nivel"], 0) + 1
    return {"ok": True, "hallazgos": hallazgos, "conteo": conteo, "peso_bytes": peso,
            "veredicto": "publicable" if conteo["error"] == 0 and marcadores == 0 else "no publicable"}


def h_auditar_pagina(args):
    raiz, error = _resolver(args.get("archivo") or args.get("ruta"))
    if error:
        return error
    ruta = raiz if os.path.isfile(raiz) else os.path.join(raiz, "index.html")
    if not os.path.isfile(ruta):
        return {"ok": False, "error": f"No existe {ruta}"}
    informe = auditar_html(_leer(ruta), os.path.dirname(ruta))
    informe.update({"archivo": ruta, "servicio": NOMBRE_SERVICIO})
    return informe


def h_auditar_sitio(args):
    raiz, error = _resolver(args.get("sitio") or args.get("ruta"))
    if error:
        return error
    paginas = []
    total = {"error": 0, "aviso": 0, "info": 0}
    peso_total = 0
    marcadores_totales = 0
    for carpeta, dirs, archivos in os.walk(raiz):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "historial")]
        for nombre in archivos:
            if not nombre.lower().endswith((".html", ".htm")):
                continue
            ruta = os.path.join(carpeta, nombre)
            informe = auditar_html(_leer(ruta), carpeta)
            for k in total:
                total[k] += informe["conteo"].get(k, 0)
            peso_total += informe["peso_bytes"]
            # El veredicto por sitio debe usar la MISMA regla que el veredicto por
            # página. Antes `auditar_sitio` ignoraba los marcadores sin rellenar y
            # daba «publicable» a una página que `auditar_pagina` acababa de marcar
            # como no publicable: dos respuestas contradictorias al mismo usuario.
            marcadores = sum(1 for h_ in informe["hallazgos"] if h_["codigo"] == "marcadores")
            for h_ in informe["hallazgos"]:
                if h_["codigo"] == "marcadores":
                    # v1.24.0 · BUG: `int(re.findall(...) or [1])` intentaba convertir
                    # una LISTA a int y reventaba con TypeError en cuanto una pagina
                    # tenia [Personaliza este texto] (que es el caso normal recien
                    # creada). Extraemos el primer numero del mensaje, o 1 si no hay.
                    _nums = re.findall(r"\d+", h_["que"])
                    marcadores_totales += int(_nums[0]) if _nums else 1
            paginas.append({"pagina": os.path.relpath(ruta, raiz), "conteo": informe["conteo"],
                            "codigo": [h_["codigo"] for h_ in informe["hallazgos"] if h_["nivel"] == "error"],
                            "marcadores": marcadores, "peso_bytes": informe["peso_bytes"]})
    if not paginas:
        return {"ok": False, "error": f"No hay páginas HTML bajo {raiz}"}
    return {"ok": True, "sitio": raiz, "paginas": sorted(paginas, key=lambda p: p["pagina"]),
            "total": total, "peso_total_bytes": peso_total, "marcadores_sin_rellenar": marcadores_totales,
            "veredicto": ("publicable" if total["error"] == 0 and marcadores_totales == 0
                          else "no publicable"),
            "por_que": (None if total["error"] == 0 and marcadores_totales == 0 else
                        f"{total['error']} errores y {marcadores_totales} marcadores sin rellenar")}


# ============================================================
# MEJORAR — arregla lo que es seguro arreglar, y lo dice
# ============================================================
ARREGLABLES = {"lang", "viewport", "descripcion", "img-alt", "js-bloqueante"}


def h_mejorar_pagina(args):
    aplicar = bool(args.get("aplicar"))
    raiz, error = _resolver(args.get("archivo") or args.get("ruta"), escribir=aplicar)
    if error:
        return error
    ruta = raiz if os.path.isfile(raiz) else os.path.join(raiz, "index.html")
    if not os.path.isfile(ruta):
        return {"ok": False, "error": f"No existe {ruta}"}
    original = _leer(ruta)
    informe = auditar_html(original, os.path.dirname(ruta))
    texto = original
    hechos = []

    codigos = {h_["codigo"] for h_ in informe["hallazgos"]}
    if "lang" in codigos:
        # EL BUG QUE ESTA LÍNEA CORRIGE: se buscaba «<html\b» sin la «>» final y se
        # recortaba el último carácter, produciendo <htm lang="es"> — HTML roto y
        # además sin el error de lang, así que el auditor lo daba por bueno. Se
        # captura la etiqueta entera y se reescribe con el atributo delante.
        texto = re.sub(r"<html\b(?![^>]*\blang=)([^>]*)>",
                       lambda m: '<html lang="es"' + m.group(1) + ">", texto, count=1, flags=re.I)
        if not texto.startswith("<!DOCTYPE html>") and not texto.lower().startswith("<!doctype"):
            texto = "<!DOCTYPE html>\n" + texto
            hechos.append("doctype añadido")
        hechos.append("lang=\"es\" añadido (corrígelo si el sitio no está en español)")
    if "doctype" in codigos and not texto.lower().startswith("<!doctype"):
        texto = "<!DOCTYPE html>\n" + texto
        hechos.append("doctype añadido")
    if "viewport" in codigos:
        texto = texto.replace("<head>", '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1">', 1)
        hechos.append("meta viewport añadida")
    if "descripcion" in codigos:
        titulo = (re.search(r"<title[^>]*>(.*?)</title>", texto, re.I | re.S) or [None, ""])[1].strip()
        parrafo = re.search(r"<p\b[^>]*>(.*?)</p>", texto, re.I | re.S)
        fuente = re.sub(r"<[^>]+>", " ", parrafo.group(1)).strip() if parrafo else titulo
        fuente = re.sub(r"\s+", " ", fuente)[:150] or "Sitio creado con CerebroNico."
        texto = texto.replace("</title>", f'</title>\n  <meta name="description" content="{_esc(fuente)}">', 1)
        hechos.append(f"meta description derivada del primer párrafo (revisar redacción)")
    if "img-alt" in codigos:
        def _alt(m):
            tag = m.group(0)
            if re.search(r"\balt=", tag, re.I):
                return tag
            return tag[:-1] + ' alt="">' if not tag.endswith("/>") else tag[:-2] + ' alt="" />'
        antes = texto
        texto = re.sub(r"<img\b[^>]*>", _alt, texto, flags=re.I)
        hechos.append("alt=\"\" añadido a las imágenes sin alt (decorativas: poner texto real donde importe)")
    if "js-bloqueante" in codigos:
        cabecera = texto.split("</head>")[0]
        def _con_defer(m):
            tag = m.group(0)
            if "defer" in tag or "async" in tag or "type=\"module\"" in tag:
                return tag
            return tag[:-1] + " defer>"
        nuevo = re.sub(r"<script[^>]*\bsrc=[^>]*>", _con_defer, cabecera, flags=re.I)
        texto = texto.replace(cabecera, nuevo, 1)
        hechos.append("defer añadido a los scripts de <head>")

    restantes = auditar_html(texto, os.path.dirname(ruta))
    resultado = {"ok": True, "aplicado": False, "pagina": ruta,
                 "antes": informe["conteo"], "despues": restantes["conteo"],
                 "correcciones": hechos,
                 "no_autocorregibles": [{"codigo": h_["codigo"], "que": h_["que"], "correccion": h_["correccion"]}
                                         for h_ in restantes["hallazgos"] if h_["codigo"] not in ARREGLABLES],
                 "aviso": "Muchos fallos (anclas rotas, archivos que faltan, encabezados, textos vacíos) NO son "
                          "arreglables sin criterio humano: se reportan, no se tocan."}
    if aplicar and hechos and texto != original:
        destino_snap = os.path.join(HISTORIAL, "_paginas", time.strftime("%Y%m%d-%H%M%S"))
        os.makedirs(destino_snap, exist_ok=True)
        shutil.copy2(ruta, os.path.join(destino_snap, os.path.basename(ruta)))
        _escribir_atomico(ruta, texto)
        resultado["aplicado"] = True
        resultado["snapshot"] = os.path.join(destino_snap, os.path.basename(ruta))
    elif aplicar:
        resultado["aviso_aplicar"] = "aplicar:true pero no había nada seguro que cambiar."
    return resultado


# ============================================================
# BLOQUES SUELTOS, OG, PWA
# ============================================================
def h_crear_bloque(args):
    bloque = str(args.get("bloque") or "").strip()
    if bloque not in BLOQUES_DISPONIBLES:
        return {"ok": False, "error": f"Bloque desconocido: {bloque}", "disponibles": BLOQUES_DISPONIBLES}
    raiz, error = _resolver(args.get("sitio") or args.get("pagina"), escribir=True)
    if error:
        return error
    ruta = raiz if os.path.isfile(raiz) else os.path.join(raiz, "index.html")
    if not os.path.isfile(ruta):
        return {"ok": False, "error": f"No existe {ruta}: crea primero el sitio."}
    html = _leer(ruta)
    paleta = str(args.get("paleta") or "claro")
    if paleta not in PALETAS:
        paleta = "claro"
    datos = dict(args)
    datos["bloques"] = [bloque]
    cuerpo, _ = _bloques_html(datos, paleta)
    inicio, fin = f"<!-- bloque:{bloque}:inicio -->", f"<!-- bloque:{bloque}:fin -->"
    reemplazar = bool(args.get("reemplazar"))
    if inicio in html:
        if not reemplazar:
            return {"ok": False, "error": f"El bloque «{bloque}» ya existe. Usa reemplazar: true para renovarlo."}
        html = re.sub(re.escape(inicio) + r"[\s\S]*?" + re.escape(fin), cuerpo.strip(), html, count=1)
        accion = "reemplazado"
    else:
        pie = re.search(r"\s*<!--\s*bloque:pie:inicio\s*-->", html)
        if pie:
            html = html[:pie.start()] + "\n\n" + cuerpo.strip() + "\n" + html[pie.start():]
            accion = "insertado justo antes del pie"
        elif "</main>" in html:
            html = html.replace("</main>", cuerpo.strip() + "\n  </main>", 1)
            accion = "insertado al final de main"
        elif "<footer" in html.lower():
            i = html.lower().index("<footer")
            html = html[:i] + cuerpo.strip() + "\n\n" + html[i:]
            accion = "insertado antes del pie"
        else:
            html = html.replace("</body>", cuerpo.strip() + "\n</body>", 1)
            accion = "insertado al final del body"
    destino_snap = os.path.join(HISTORIAL, time.strftime("%Y%m%d-%H%M%S-firma"))
    os.makedirs(destino_snap, exist_ok=True)
    shutil.copy2(ruta, os.path.join(destino_snap, os.path.basename(ruta)))
    _escribir_atomico(ruta, html)
    informe = auditar_html(html, os.path.dirname(ruta))
    return {"ok": True, "bloque": bloque, "pagina": ruta, "accion": accion,
            "snapshot": os.path.join(destino_snap, os.path.basename(ruta)),
            "auditoria": informe["conteo"],
            "aviso": "El bloque insertado usa los marcadores [Personaliza este texto] donde no diste datos."}


def og_image_svg(datos):
    titulo = _esc((datos.get("titulo") or datos.get("nombre") or "Sitio")[:60])
    sub = _esc((datos.get("subtitulo") or "")[:90])
    p = PALETAS.get(datos.get("paleta", "claro"), PALETAS["claro"])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" '
            f'role="img" aria-label="{titulo}">'
            f'<rect width="1200" height="630" fill="{p["bg"]}"/>'
            f'<rect x="0" y="0" width="1200" height="10" fill="{p["acento"]}"/>'
            f'<text x="80" y="300" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="72" '
            f'font-weight="700" fill="{p["texto"]}">{titulo}</text>'
            f'<text x="80" y="370" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="34" '
            f'fill="{p["texto_suave"]}">{sub}</text>'
            f'<text x="80" y="560" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="26" '
            f'fill="{p["acento"]}">{_esc(datos.get("nombre", ""))}</text></svg>')


def h_crear_og_image(args):
    raiz, error = _resolver(args.get("sitio") or args.get("ruta"), escribir=True)
    if error:
        return error
    destino = raiz if os.path.isdir(raiz) else os.path.dirname(raiz)
    svg = og_image_svg(args)
    _escribir_atomico(os.path.join(destino, "assets", "og-image.svg"), svg)
    return {"ok": True, "ruta": os.path.join(destino, "assets", "og-image.svg"), "medida": "1200x630",
            "aviso": "SVG: no todos los redes sociales lo aceptan como og:image; para publicar, "
                     "exporta a PNG con la herramienta de imagen de CerebroNico."}


def h_insertar_imagen(args):
    """Coloca UNA imagen dentro del sitio (assets/subidas/) y devuelve el `src`
    exacto para usarla en galeria[].imagen, media.imagen, hero_imagen o
    logos[].imagen. NO descarga de la red: una URL remota se devuelve tal cual
    para referenciarla directamente. Fuentes: archivo local (origen), bytes en
    base64 (datos_base64) o SVG en texto (svg)."""
    raiz, error = _resolver(args.get("sitio") or args.get("ruta"), escribir=True)
    if error:
        return error
    base = raiz if os.path.isdir(raiz) else os.path.dirname(raiz)
    if not os.path.isdir(base):
        return {"ok": False, "error": "El sitio no existe todavía: créalo con crear_sitio antes de insertar imágenes."}

    url = str(args.get("url") or "").strip()
    if url:
        if url.lower().startswith(("http://", "https://", "data:image/")):
            return {"ok": True, "servicio": NOMBRE_SERVICIO, "ref": url, "copiada": False,
                    "aviso": "URL remota: se referencia directamente (el pack no descarga). Para servir "
                             "offline, baja el archivo y pásalo por 'origen' o 'datos_base64'."}
        return {"ok": False, "error": f"La URL no es http(s) ni data:image: «{url[:50]}»."}

    datos_bytes = None
    svg_texto = None
    origen = args.get("origen")
    if origen:
        ruta_origen, err2 = _resolver(origen)
        if err2 or not ruta_origen or not os.path.isfile(ruta_origen):
            # v1.52.2 — PUENTE: el origen suele apuntar a «assets/subidas/x.png»,
            # que vive FUERA de .creador (lo escribe server.ts al adjuntar en el
            # chat). Si no se encuentra dentro de la jaula, lo buscamos en las
            # subidas del proyecto y lo copiamos al sitio igual.
            puente = _buscar_subida(origen)
            if not puente:
                # Se listan las que SÍ existen: el modelo corrige en el siguiente
                # mensaje copiando un nombre real, en vez de probar seis nombres.
                opciones = _opciones_de_subida()
                return err2 or {"ok": False,
                                "error": f"No encuentro la imagen «{origen}». En «assets/subidas/» hay: {opciones}. "
                                         f"Pasá exactamente uno de esos nombres (no la ruta que creés) o, si querés la "
                                         f"que adjuntaste recién, dejá 'origen' vacío y la tomo yo.",
                                "opciones": opciones.split(", ")}
            ruta_origen = puente
        if os.path.getsize(ruta_origen) > TOPE_BYTES_ARCHIVO:
            return {"ok": False, "error": f"La imagen pesa más de {TOPE_BYTES_ARCHIVO} bytes; redúcela antes."}
        with open(ruta_origen, "rb") as f:
            datos_bytes = f.read()
    elif args.get("datos_base64"):
        crudo = re.sub(r"^data:image/[^;]+;base64,", "", str(args.get("datos_base64"))).strip()
        try:
            datos_bytes = base64.b64decode(crudo, validate=True)
        except Exception:
            return {"ok": False, "error": "datos_base64 no es base64 válido."}
        if len(datos_bytes) > TOPE_BYTES_ARCHIVO:
            return {"ok": False, "error": f"La imagen decodificada supera {TOPE_BYTES_ARCHIVO} bytes."}
    elif args.get("svg"):
        svg_texto = _svg_seguro(str(args.get("svg")))
        datos_bytes = svg_texto.encode("utf-8")
    else:
        # v1.52.2 — sin fuente explícita: tomamos la última imagen que el usuario
        # subió en el chat (vive en assets/subidas/ del proyecto) para no bloquear
        # el flujo — es justo lo que suele querer «inserta la imagen que adjunté».
        puente = _buscar_subida(None)
        if not puente:
            return {"ok": False, "error": "Pasa 'origen' (ruta local), 'datos_base64', 'svg' o una 'url' remota. (No encontré ninguna imagen subida en 'assets/subidas/'.)"}
        if os.path.getsize(puente) > TOPE_BYTES_ARCHIVO:
            return {"ok": False, "error": f"La última imagen subida pesa más de {TOPE_BYTES_ARCHIVO} bytes; redúcela antes."}
        with open(puente, "rb") as f:
            datos_bytes = f.read()
        if not args.get("nombre_archivo") and not args.get("nombre"):
            args = dict(args)
            args["nombre_archivo"] = os.path.basename(puente)

    ext, mime = _tipo_imagen(datos_bytes)
    if not ext:
        return {"ok": False, "error": "El contenido no parece una imagen (PNG, JPG, GIF, WEBP o SVG)."}
    if ext == "svg":
        texto = svg_texto if svg_texto is not None else datos_bytes.decode("utf-8", "replace")
        datos_bytes = _svg_seguro(texto).encode("utf-8")

    crudo_nombre = args.get("nombre_archivo") or args.get("nombre") or (os.path.basename(str(origen)) if origen else "imagen")
    tallo = _slug(os.path.splitext(os.path.basename(str(crudo_nombre)))[0]) or "imagen"
    archivo = f"{tallo}.{ext}"
    destino_dir = os.path.join(base, "assets", "subidas")
    os.makedirs(destino_dir, exist_ok=True)
    destino = os.path.join(destino_dir, archivo)
    n = 2
    while os.path.exists(destino) and not bool(args.get("sobrescribir")):
        archivo = f"{tallo}-{n}.{ext}"
        destino = os.path.join(destino_dir, archivo)
        n += 1
    with open(destino + ".tmp", "wb") as f:
        f.write(datos_bytes)
        f.flush()
        os.fsync(f.fileno())
    os.replace(destino + ".tmp", destino)
    ref = f"assets/subidas/{archivo}"
    return {"ok": True, "servicio": NOMBRE_SERVICIO, "sitio": os.path.basename(base.rstrip(os.sep)),
            "ref": ref, "copiada": True, "tipo": mime, "bytes": len(datos_bytes),
            "aviso": f"Imagen lista. Úsala pasando «{ref}» en galeria[].imagen, media.imagen, "
                     f"hero_imagen o logos[].imagen; el alt debe describirla."}



# ============================================================
# v1.20.0 — CONTRASTE REAL, MULTIPÁGINA, SCHEMA, COMPONENTES,
#           PREFLIGHT Y BUCLE AUTÓNOMO DE MEJORA
# ============================================================
# Todo esto existe para que el CREADOR se pueda dejar en manos del bucle
# autónomo del motor: cada herramienta es determinista, informa de lo que NO
# puede decidir y el bucle de mejora para cuando deja de avanzar en vez de
# iterar para siempre (la misma disciplina de checkpoint/rebobinado de
# src/engine/bucleAutonomo.ts, aplicada a un sitio web).

def _hex_a_rgb(hexv):
    h = str(hexv or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c + c for c in h)
    if len(h) != 6 or any(c not in "0123456789abcdefABCDEF" for c in h):
        return None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _luminancia(rgb):
    # Luminancia relativa WCAG 2.1: canal linealizado con el coeficiente sRGB.
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _ratio(c1, c2):
    l1, l2 = _luminancia(c1), _luminancia(c2)
    claro, oscuro = max(l1, l2), min(l1, l2)
    return (claro + 0.05) / (oscuro + 0.05)


def _ajuste_accible(fondo, frente, objetivo=4.5):
    """Aclara u oscurece el frente hasta alcanzar la ratio. Sin librerías."""
    frente_rgb = _hex_a_rgb(frente)
    fondo_rgb = _hex_a_rgb(fondo)
    if not frente_rgb or not fondo_rgb:
        return None
    if _ratio(fondo_rgb, frente_rgb) >= objetivo:
        return "#" + "".join("%02x" % v for v in frente_rgb)
    def _caminar(pasos):
        r, g, b = frente_rgb
        for _paso in range(255):
            r, g, b = (max(0, v + pasos) for v in (r, g, b))
            if (r, g, b) == frente_rgb and _paso:
                return None
            if _ratio(fondo_rgb, (r, g, b)) >= objetivo:
                return "#%02x%02x%02x" % (r, g, b)
            if min(r, g, b) == 0 and pasos < 0:
                return None
            if max(r, g, b) == 255 and pasos > 0:
                return None
        return None
    # Se prueban LAS DOS direcciones: aclarar un blanco sobre un azul claro no
    # puede funcionar nunca, y la primera versión devolvía None (sin propuesta)
    # justo en los pares que sí se pueden arreglar oscureciendo el texto.
    return _caminar(-1) or _caminar(1)


def _tokens_paleta(css):
    """Saca los colores reales de la hoja generada (custom properties en :root)."""
    tokens = {}
    raiz = re.search(r":root\s*\{([\s\S]*?)\}", css)
    if not raiz:
        return tokens
    for var, val in re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})", raiz.group(1)):
        tokens[var] = val
    return tokens


def h_auditar_contraste(args):
    """Contraste WCAG 2.1 de los tokens del sitio + pares que el usuario pase.

        Qué SÍ comprueba: texto normal sobre fondo, texto suave, botón (acento sobre
        su texto), enlaces y bordes. Qué NO: el contraste de un <img>, de un texto
        sobre degradado complejo o de CSS de terceros.
        """
    sitio = args.get("sitio") or args.get("pagina")
    pares_extra = args.get("pares") if isinstance(args.get("pares"), list) else []
    objetivo_normal = float(args.get("objetivo") or 4.5)
    objetivo_grande = float(args.get("objetivo_grande") or 3.0)
    tokens = {}
    ruta_css = None
    if sitio:
        raiz, error = _resolver(sitio)
        if error:
            return error
        base = raiz if os.path.isdir(raiz) else os.path.dirname(raiz)
        ruta_css = os.path.join(base, "css", "estilo.css")
        if not os.path.isfile(ruta_css):
            return {"ok": False, "error": "No hay css/estilo.css: sin tokens no hay contraste medible."}
        tokens = _tokens_paleta(_leer(ruta_css))
    Combinados = [
        ("texto sobre fondo", "texto", "bg", objetivo_normal),
        ("texto suave sobre fondo", "texto-suave", "bg", objetivo_normal),
        ("texto sobre superficie", "texto", "superficie", objetivo_normal),
        ("texto suave sobre superficie", "texto-suave", "superficie", objetivo_normal),
        ("texto del botón sobre acento", "acento-texto", "acento", objetivo_normal),
        ("enlace sobre fondo", "acento", "bg", objetivo_normal),
        ("borde sobre superficie", "borde", "superficie", 1.5),
    ]
    mediciones = []
    for etiqueta, av, bv, minimo in Combinados:
        frente, fondo = tokens.get(av), tokens.get(bv)
        if not frente or not fondo:
            continue
        r = _ratio(_hex_a_rgb(fondo), _hex_a_rgb(frente))
        mediciones.append({"par": etiqueta, "fondo": fondo, "frente": frente,
                           "ratio": round(r, 2), "minimo": minimo,
                           "aprueba": r >= minimo,
                           "propuesta": None if r >= minimo else _ajuste_accible(fondo, frente, minimo)})
    for par in pares_extra:
        fondo, frente = str(par.get("fondo") or ""), str(par.get("frente") or "")
        if not _hex_a_rgb(fondo) or not _hex_a_rgb(frente):
            mediciones.append({"par": str(par.get("etiqueta") or "par pasado"), "fondo": fondo, "frente": frente,
                               "ratio": None, "aprueba": False, "error": "color no hexadecimal válido"})
            continue
        r = _ratio(_hex_a_rgb(fondo), _hex_a_rgb(frente))
        minimo = float(par.get("minimo") or objetivo_normal)
        mediciones.append({"par": str(par.get("etiqueta") or "par pasado"), "fondo": fondo, "frente": frente,
                           "ratio": round(r, 2), "minimo": minimo, "aprueba": r >= minimo,
                           "propuesta": None if r >= minimo else _ajuste_accible(fondo, frente, minimo)})
    fallan = [m for m in mediciones if not m.get("aprueba")]
    aaa = [m for m in mediciones if m.get("ratio") and m["ratio"] >= 7.0]
    return {"ok": True, "css": ruta_css, "mediciones": mediciones, "fallan": len(fallan),
            "nivel_aaa": len(aaa), "objetivo_normal": objetivo_normal, "objetivo_grande": objetivo_grande,
            "veredicto": ("aprueba AA" if not fallan else "rechaza AA"),
            "limites": "Mide solo colores planos de los tokens y los pares que pases. No mide texto sobre "
                       "imagen, degradados ni CSS de terceros, y no sustituye una revisión con lector de pantalla."}


def h_crear_pagina(args):
    """Añade una página nueva a un sitio existente, con su hueco en la navegación."""
    ruta_rel = _slug(args.get("ruta") or args.get("nombre") or "pagina", 40) + ".html"
    if ruta_rel == "index.html":
        return {"ok": False, "error": "index.html ya existe: usa crear_sitio o crea otra ruta."}
    destino, error = _resolver(args.get("sitio"), escribir=True)
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    if not os.path.isfile(os.path.join(base, "index.html")):
        return {"ok": False, "error": "La carpeta no es un sitio creado por el pack (falta index.html)."}
    datos = dict(args)
    datos.setdefault("nombre", os.path.basename(base))
    datos.setdefault("bloques", ["hero", "caracteristicas", "cta", "pie"])
    cuerpo, _ = _bloques_html(datos, datos.get("paleta") if datos.get("paleta") in PALETAS else "claro")
    pagina_datos = dict(datos)
    pagina_datos["titulo_pagina"] = args.get("titulo_pagina") or args.get("titulo") or datos["nombre"]
    html = construir_pagina(pagina_datos, cuerpo)
    _escribir_atomico(os.path.join(base, ruta_rel), html)
    _registrar_pagina_nav(base, ruta_rel, args.get("nombre") or args.get("titulo") or ruta_rel)
    _escribir_sitemap(base, datos)
    informe = auditar_html(html, base)
    return {"ok": True, "pagina": os.path.join(base, ruta_rel), "auditoria": informe["conteo"],
            "aviso": "Las páginas comparten css/estilo.css y js/main.js: no se duplican. Los datos de esta página "
                     "son los que pasaste; lo que falta quedó marcado."}


def _listar_paginas(base):
    rutas = []
    for nombre in sorted(os.listdir(base)):
        if nombre.lower().endswith((".html", ".htm")) and nombre not in ("404.html",):
            rutas.append(nombre)
    return rutas


def _registrar_pagina_nav(base, ruta_rel, etiqueta):
    """Inserta el enlace en la barra de TODAS las páginas, entre marcadores.

        Idempotente: si el enlace ya está en esa página, no lo duplica. Sin esto,
        cada crear_pagina añadía un <li> repetido a sí misma y a las demás.
        """
    for html_nombre in _listar_paginas(base):
        ruta = os.path.join(base, html_nombre)
        html = _leer(ruta)
        if "<!-- nav-paginas:inicio -->" not in html:
            # El CTA de la barra ya no siempre apunta a #contacto (desde v1.51 el
            # destino se adapta a las secciones que existen). Anclamos en el botón
            # de la cabecera sea cual sea su destino: es el único <a class="boton">
            # que va pegado al cierre del <nav>.
            html = re.sub(r'(\s*)(<a class="boton" href="#[^"]*">[^<]*</a>\s*</nav>)',
                          r'\1<!-- nav-paginas:inicio -->\1<!-- nav-paginas:fin -->\1\2', html, count=1)
        if "<!-- nav-paginas:inicio -->" not in html:
            # Página sin barra de navegación: no hay dónde registrar el enlace.
            # Antes esto reventaba el proceso con un ValueError; ahora se salta.
            continue
        bloque_ini = html.index("<!-- nav-paginas:inicio -->")
        bloque_fin = html.index("<!-- nav-paginas:fin -->")
        interior = html[bloque_ini + len("<!-- nav-paginas:inicio -->"):bloque_fin]
        # aria-current en la página que es: sin esto, un lector de pantalla no
        # sabe dónde está dentro del sitio.
        enlace = '        <a href="%s"%s>%s</a>\n' % (ruta_rel, ' aria-current="page"' if html_nombre == ruta_rel else "", _esc(etiqueta))
        if ('href="%s"' % ruta_rel) in interior:
            # La página recién creada aún no tenía su enlace: lo gana ahora con
            # aria-current puesto.
            if html_nombre == ruta_rel:
                interior_marca = 'href="%s">' % ruta_rel
                if interior_marca in interior:
                    interior = interior.replace(interior_marca, 'href="%s" aria-current="page">' % ruta_rel, 1)
                    html = (html[:bloque_ini + len("<!-- nav-paginas:inicio -->")] + "\n" + interior + html[bloque_fin:])
                    _escribir_atomico(ruta, html)
            continue
        nuevo_interior = interior + enlace
        if ruta_rel == "index.html" and 'href="index.html"' not in nuevo_interior:
            nuevo_interior = enlace + nuevo_interior
        html = (html[:bloque_ini + len("<!-- nav-paginas:inicio -->")] + "\n" + nuevo_interior +
                html[bloque_fin:])
        _escribir_atomico(ruta, html)


def _escribir_sitemap(base, datos):
    url_base = str((datos or {}).get("base_url") or "").strip().rstrip("/")
    paginas = _listar_paginas(base)
    lineas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p in paginas:
        loc = (url_base + "/" + p) if url_base else p
        lineas.append("  <url><loc>%s</loc><changefreq>monthly</changefreq></url>" % _esc(loc))
    lineas.append("</urlset>")
    _escribir_atomico(os.path.join(base, "sitemap.xml"), "\n".join(lineas) + "\n")
    robots = "User-agent: *\nAllow: /\n"
    if url_base:
        robots += "\nSitemap: %s/sitemap.xml\n" % url_base
    _escribir_atomico(os.path.join(base, "robots.txt"), robots)
    return len(paginas)


def h_crear_sitio_multipagina(args):
    paginas = args.get("paginas") if isinstance(args.get("paginas"), list) else []
    if not paginas:
        return {"ok": False, "error": "Falta la lista «paginas»: [{ruta, titulo, bloques, ...}]."}
    sitio = _slug(args.get("nombre") or "multi", 40)
    base, error = _resolver(sitio, escribir=True)
    if error:
        return error
    if _sitio_existe(base) and not bool(args.get("sobrescribir")):
        return {"ok": False, "error": "El sitio ya existe; usa crear_pagina para ampliarlo o sobrescribir: true."}
    compartidos = dict(args)
    compartido = {k: compartidos[k] for k in ("paleta", "idioma", "tipografia", "contacto", "nombre",
                                              "base_url", "descripcion")
                  if k in compartidos}
    errores = []
    rutas = []
    for i, pg in enumerate(paginas):
        datos = dict(compartido)
        datos.update(pg if isinstance(pg, dict) else {})
        datos.setdefault("titulo_pagina", datos.get("titulo") or datos.get("nombre") or "Página")
        datos.setdefault("bloques", ["barra"] if i == 0 else ["cta", "pie"])
        cuerpo, meta = _bloques_html(datos, datos.get("paleta") if datos.get("paleta") in PALETAS else "claro")
        html = construir_pagina(datos, cuerpo)
        ruta_rel = (pg.get("ruta") if isinstance(pg, dict) and pg.get("ruta") else ("index" if i == 0 else "pagina-%d" % (i + 1)))
        ruta_rel = _slug(ruta_rel, 40) + (".html" if not str(ruta_rel).endswith(".html") else "")
        _escribir_atomico(os.path.join(base, ruta_rel), html)
        rutas.append({"pagina": ruta_rel, "nombre": datos.get("nombre") or datos.get("titulo") or ruta_rel})
    # CSS/JS/asset compartidos una sola vez
    os.makedirs(os.path.join(base, "css"), exist_ok=True)
    os.makedirs(os.path.join(base, "js"), exist_ok=True)
    os.makedirs(os.path.join(base, "assets"), exist_ok=True)
    paleta = compartido.get("paleta") if compartido.get("paleta") in PALETAS else "claro"
    _escribir_atomico(os.path.join(base, "css", "estilo.css"), css_de(paleta, compartido.get("tipografia", "sistema")))
    _escribir_atomico(os.path.join(base, "js", "main.js"), js_del_sitio())
    _escribir_atomico(os.path.join(base, "assets", "placeholder.svg"), _svg_placeholder())
    _escribir_atomico(os.path.join(base, "assets", "favicon.svg"), _favicon_svg(PALETAS[paleta]["acento"]))
    _escribir_atomico(os.path.join(base, "assets", "og-image.svg"), og_image_svg(compartido))
    for r in rutas:
        _registrar_pagina_nav(base, r["pagina"], r["nombre"])
    _escribir_sitemap(base, compartido)
    _registrar_sitio(sitio, base, {"paleta": paleta, "tipo": "multipagina", "bloques": []})
    conteo = {"error": 0, "aviso": 0, "info": 0}
    por_pagina = []
    for html_nombre in _listar_paginas(base):
        inf = auditar_html(_leer(os.path.join(base, html_nombre)), base)
        for k in conteo:
            conteo[k] += inf["conteo"].get(k, 0)
        por_pagina.append({"pagina": html_nombre, "conteo": inf["conteo"], "veredicto": inf["veredicto"]})
    return {"ok": True, "sitio": sitio, "ruta": base, "paginas": por_pagina, "total": conteo,
            "sitemap": os.path.join(base, "sitemap.xml"),
            "aviso": "El menú entre páginas se registró en todas. Cada página lleva SOLO los bloques que "
                     "pasaste para ella: lo que falta está marcado, no inventado."}


def _faq_desde_html(html):
    preguntas = []
    for m in re.finditer(r"<details[^>]*>\s*<summary[^>]*>(.*?)</summary>\s*<p[^>]*>(.*?)</p>", html, re.S | re.I):
        q = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        a = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if q and a and PLACEHOLDER not in q and PLACEHOLDER not in a:
            preguntas.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
    return preguntas


def h_generar_schema_jsonld(args):
    """Inyecta JSON-LD real entre marcadores, calculado con datos QUE YA EXISTEN."""
    tipo = str(args.get("tipo") or "WebSite").strip()
    destino, error = _resolver(args.get("sitio") or args.get("pagina"), escribir=True)
    if error:
        return error
    ruta = destino if os.path.isfile(destino) else os.path.join(destino, "index.html")
    if not os.path.isfile(ruta):
        return {"ok": False, "error": f"No existe {ruta}"}
    html = _leer(ruta)
    titulo = (re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S) or [None, ""])[1].strip()
    descripcion = ""
    md = re.search(r'<meta\s+name=["\']?description["\']?[^>]*content=["\']([^"\']*)', html, re.I)
    if md:
        descripcion = md.group(1).strip()
    url_base = str(args.get("url") or "").strip().rstrip("/")
    nombre = str(args.get("nombre") or titulo or "").strip()
    if not nombre:
        return {"ok": False, "error": "Sin nombre no hay schema honesto: pasa «nombre»."}
    cuerpo = {"@context": "https://schema.org"}
    if tipo == "LocalBusiness":
        faltan = [k for k in ("nombre", "direccion") if not args.get(k)]
        if faltan:
            return {"ok": False, "error": "LocalBusiness exige datos reales: faltan %s. No se inventan." % ", ".join(faltan)}
        cuerpo.update({"@type": "LocalBusiness", "name": nombre,
                       "address": args.get("direccion"),
                       "telephone": args.get("telefono"),
                       "email": args.get("email"),
                       "url": url_base or None,
                       "openingHours": args.get("horario")})
    elif tipo == "Organization":
        cuerpo.update({"@type": "Organization", "name": nombre, "url": url_base or None,
                       "logo": (url_base + "/assets/favicon.svg") if url_base else "assets/favicon.svg",
                       "sameAs": args.get("redes") if isinstance(args.get("redes"), list) else []})
    elif tipo == "FAQPage":
        preguntas = _faq_desde_html(html)
        if not preguntas:
            return {"ok": False, "error": "La página no tiene un bloque FAQ con preguntas y respuestas reales."}
        cuerpo.update({"@type": "FAQPage", "mainEntity": preguntas})
    elif tipo == "BreadcrumbList":
        partes = args.get("migas") if isinstance(args.get("migas"), list) else []
        if not partes:
            return {"ok": False, "error": "Falta «migas»: [{nombre, url}] — no se adivinan las rutas."}
        cuerpo.update({"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": str(p.get("nombre") or ""),
             "item": (url_base + str(p.get("url") or "")) if url_base else str(p.get("url") or "")}
            for i, p in enumerate(partes)]})
    elif tipo == "WebSite":
        cuerpo.update({"@type": "WebSite", "name": nombre, "description": descripcion,
                       "url": url_base or "."})
    else:
        return {"ok": False, "error": f"Tipo de schema nosoportado: {tipo}",
                "soportados": ["WebSite", "Organization", "LocalBusiness", "FAQPage", "BreadcrumbList"]}
    cuerpo = {k: v for k, v in cuerpo.items() if v not in (None, [], "")}
    etiqueta = "<!-- schema:inicio -->\n  <script type=\"application/ld+json\">%s</script>\n  <!-- schema:fin -->" % json.dumps(cuerpo, ensure_ascii=False)
    if "<!-- schema:inicio -->" in html:
        html = re.sub(r"<!-- schema:inicio -->[\s\S]*?<!-- schema:fin -->", etiqueta, html, count=1)
    elif "</title>" in html:
        html = html.replace("</title>", "</title>\n  " + etiqueta, 1)
    else:
        html = re.sub(r"(<head[^>]*>)", "\1\n  " + etiqueta, html, count=1)
    _escribir_atomico(ruta, html)
    informe = auditar_html(html, os.path.dirname(ruta))
    return {"ok": True, "pagina": ruta, "schema": cuerpo.get("@type"), "auditoria": informe["conteo"],
            "aviso": "El generador solo inventa estructura, nunca datos: FAQPage salió de las preguntas que ya "
                     "estaban en la página y LocalBusiness exige dirección real o se niega."}

SW_JS = """/* Service worker generado por CerebroNico · caché de red primero con reserva. */
const version = "creador-v1";
const esenciales = ["./", "./index.html", "./css/estilo.css", "./js/main.js"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(version).then((c) => c.addAll(esenciales)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(caches.keys().then((claves) =>
    Promise.all(claves.filter((k) => k !== version).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  evento.respondWith(
    fetch(req).then((res) => {
      const copia = res.clone();
      caches.open(version).then((c) => c.put(req, copia));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
"""


def _clave_cache_sw(raiz):
    """Clave de caché del service worker, derivada del CONTENIDO del sitio.

    v1.95.1 · El sw.js generado cacheaba siempre bajo la clave literal «creador-v1»
    (SW_JS, más abajo), idéntica para cualquier sitio: su propia limpieza por versión
    (`claves.filter(k => k !== version)`) nunca encontraba nada que borrar y la caché del
    proyecto anterior seguía sirviendo su index.html bajo 127.0.0.1:3500 — un origen fijo
    que comparten TODOS los proyectos. Mario lo vio con dos capturas: «en el
    previsualizador está una cosa y si toco Abrir abre otro proyecto viejo, de otra
    versión».

    v1.95.1b · PRIMERA VERSIÓN ROTA, Y SE DICE ACÁ. Derivar la clave del nombre de la
    carpeta y del mtime rompía `entregaFuncional` en su valla de determinismo («un ROOT
    distinto con el MISMO brief produce el MISMO sha256»): dos forjas del mismo brief
    daban ZIPs distintos porque la clave metía la ruta absoluta y el reloj. Una clave que
    depende de DÓNDE está el sitio o de CUÁNDO se escribió no es una identidad, es ruido.

    Así que se calcula solo sobre lo que el sitio ES: el contenido de sus archivos
    esenciales. Consecuencia correcta en los dos casos: si el sitio cambia, cambia la
    clave y el worker viejo se purga; si dos sitios tienen contenido idéntico comparten
    clave, y da igual, porque lo que sirven es byte a byte lo mismo.
    """
    try:
        from hashlib import sha1 as _sha1
        import os as _os
        h = _sha1()
        piezas = []
        for rel in ("index.html", "css/estilo.css", "js/main.js", "manifest.webmanifest"):
            p = _os.path.join(raiz, rel)
            try:
                if _os.path.isfile(p):
                    with open(p, "rb") as f:
                        piezas.append((rel, _sha1(f.read()).hexdigest()[:12]))
            except Exception:
                continue
        if not piezas:
            return "creador-sitio-nuevo"
        for rel, firma in sorted(piezas):
            h.update(("%s:%s|" % (rel, firma)).encode("utf-8"))
        return "creador-" + h.hexdigest()[:16]
    except Exception:
        return "creador-v1"


def h_crear_pwa(args):
    raiz, error = _resolver(args.get("sitio") or args.get("ruta"), escribir=True)
    if error:
        return error
    if not os.path.isdir(raiz):
        return {"ok": False, "error": f"{raiz} no es una carpeta de sitio."}
    nombre = str(args.get("nombre") or os.path.basename(raiz))
    p = PALETAS.get(str(args.get("paleta") or "claro"), PALETAS["claro"])
    cable = _cablear_pwa(raiz, {"name": nombre, "short_name": nombre[:20], "start_url": "./index.html",
                "scope": "./", "display": "standalone", "orientation": "portrait-primary",
                "background_color": p["bg"], "theme_color": p["acento"], "lang": "es",
                "description": str(args.get("descripcion") or nombre)[:155]})
    return {"ok": True, "sitio": raiz, "manifest": os.path.join(raiz, "manifest.webmanifest"),
            "service_worker": os.path.join(raiz, "sw.js"), "index_enlazado": cable["index_enlazado"],
            "sw_registrado": cable["sw_registrado"],
            "iconos_png": ["assets/icon-192.png", "assets/icon-512.png"],
            "aviso": "El service worker solo funciona en https o en localhost, y la caché exige "
                      "recargar dos veces para verse actualizada. Para instalar: serví la carpeta "
                      "por http (python -m http.server) — con doble clic (file://) ningún navegador instala."}


# ============================================================
# UTILIDADES DEL PACK
# ============================================================
def h_estado_creador(args):
    sitios = {}
    try:
        with open(REGISTRO_RUTA, "r", encoding="utf-8") as f:
            sitios = json.load(f)
    except Exception:
        sitios = {}
    return {"ok": True, "servicio": NOMBRE_SERVICIO, "version": VERSION,
            "raiz": CREADOR_ROOT, "sitios": len(sitios),
            "listados": sorted(sitios)[:20], "bloques": BLOQUES_DISPONIBLES,
            "paletas": sorted(PALETAS), "tipos_sitio": sorted(TIPOS_SITIO)}


def h_listar_sitios(args):
    registros = {}
    try:
        with open(REGISTRO_RUTA, "r", encoding="utf-8") as f:
            registros = json.load(f)
    except Exception:
        return {"ok": True, "sitios": []}
    salida = []
    for nombre, info in sorted(registros.items()):
        ruta = info.get("ruta", "")
        existe = os.path.isdir(ruta)
        paginas = []
        if existe:
            for carpeta, dirs, archivos in os.walk(ruta):
                dirs[:] = [d for d in dirs if d not in ("node_modules", "historial")]
                paginas += [os.path.relpath(os.path.join(carpeta, a), ruta)
                            for a in archivos if a.lower().endswith((".html", ".htm"))]
        salida.append({"sitio": nombre, "ruta": ruta, "existe": existe, "tipo": info.get("tipo"),
                       "paleta": info.get("paleta"), "paginas": sorted(paginas)})
    return {"ok": True, "sitios": salida}


def h_previsualizar_sitio(args):
    raiz, error = _resolver(args.get("sitio") or args.get("ruta"))
    if error:
        return error
    if not os.path.isdir(raiz):
        return {"ok": False, "error": f"{raiz} no es una carpeta."}
    index = os.path.join(raiz, "index.html")
    return {"ok": True, "carpeta": raiz, "indice": index if os.path.isfile(index) else None,
            "opciones": [
                "Dentro de CerebroNico: manda la carpeta al sandbox y usa el preview en :3500.",
                f"Sirviéndola a mano:  python3 -m http.server 3500 --directory \"{raiz}\"",
            ],
            "aviso": "Este pack NO levanta servidores: solo prepara y audita. Quien decide abrir un puerto eres tú."}


def h_plantillas_disponibles(args):
    return {"ok": True, "servicio": NOMBRE_SERVICIO, "bloques": BLOQUES_DISPONIBLES,
            "paletas": {k: v["nombre"] for k, v in PALETAS.items()},
            "tipografias": sorted(TIPOS), "tipos_de_sitio": {k: v for k, v in TIPOS_SITIO.items()},
            "nota": "Un tipo de sitio es una receta de bloques; puedes pasar tu propia lista 'bloques'."}



# ============================================================
# COMPONENTES Y PREFLIGHT
# ============================================================
def h_componente_modo_oscuro(args):
    """Tokens de tema + botón con aria-pressed + persistencia. Sin librerías."""
    destino, error = _resolver(args.get("sitio"), escribir=True)
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    css_ruta = os.path.join(base, "css", "estilo.css")
    js_ruta = os.path.join(base, "js", "main.js")
    if not os.path.isfile(css_ruta):
        return {"ok": False, "error": "El sitio no tiene css/estilo.css: no hay tokens que duplicar."}
    paleta = args.get("paleta_alternativa") if args.get("paleta_alternativa") in PALETAS else "noche"
    p = PALETAS[paleta]
    css = _leer(css_ruta)
    bloque = ("\n/* — modo oscuro (prefers-color-scheme + data-tema manual) — */\n"
              ':root[data-tema="oscuro"] {\n'
              "    --bg: %s; --superficie: %s; --texto: %s; --texto-suave: %s;\n"
              "    --acento: %s; --acento-texto: %s; --borde: %s;\n}\n"
              '@media (prefers-color-scheme: dark) {\n'
              ':root:not([data-tema="claro"]) {\n'
              "    --bg: %s; --superficie: %s; --texto: %s; --texto-suave: %s;\n"
              "    --acento: %s; --acento-texto: %s; --borde: %s;\n}\n}\n"
              '.tema-toggle { background: none; border: 1px solid var(--borde); color: var(--texto);\n'
              "    border-radius: 999px; padding: .45rem .8rem; cursor: pointer; font: inherit; }\n"
              ".campo-oculto { position: absolute !important; left: -9999px; width: 1px; height: 1px; overflow: hidden; }\n"
              ) % ((p["bg"], p["superficie"], p["texto"], p["texto_suave"], p["acento"], p["acento_texto"], p["borde"]) * 2)
    if 'data-tema="oscuro"' not in css:
        _escribir_atomico(css_ruta, css + bloque)
    js = _leer(js_ruta) if os.path.isfile(js_ruta) else ""
    if "tema-toggle" not in js:
        _escribir_atomico(js_ruta, js + """
  // Tema: respeta la preferencia del sistema y recuerda la elección manual.
  var raiz = document.documentElement;
  try {
    var guardado = localStorage.getItem("tema");
    if (guardado === "oscuro" || guardado === "claro") raiz.setAttribute("data-tema", guardado);
  } catch (e) { /* sin almacenamiento: funciona igualmente */ }
  var botonTema = document.querySelector(".tema-toggle");
  if (botonTema) {
    var oscuro = getComputedStyle(document.body).getPropertyValue("--bg").trim() === "#0d1117";
    botonTema.setAttribute("aria-pressed", raiz.getAttribute("data-tema") === "oscuro" ? "true" : "false");
    botonTema.addEventListener("click", function () {
      var nuevo = raiz.getAttribute("data-tema") === "oscuro" ? "claro" : "oscuro";
      raiz.setAttribute("data-tema", nuevo);
      botonTema.setAttribute("aria-pressed", nuevo === "oscuro" ? "true" : "false");
      try { localStorage.setItem("tema", nuevo); } catch (e) {}
    });
  }
""")
    insertado = 0
    for html_nombre in _listar_paginas(base):
        ruta = os.path.join(base, html_nombre)
        html = _leer(ruta)
        if 'class="tema-toggle"' in html:
            continue
        html = html.replace('<button class="menu__toggle"',
                            '<button class="tema-toggle" type="button" aria-pressed="false" '
                            'aria-label="Cambiar entre tema claro y oscuro">Tema</button>\n      <button class="menu__toggle"', 1)
        _escribir_atomico(ruta, html)
        insertado += 1
    return {"ok": True, "paginas_actualizadas": insertado, "paleta_alternativa": p["nombre"],
            "aviso": "El botón respeta prefers-color-scheme y recuerda la elección; sin almacenamiento "
                     "sigue funcionando. Los colores nuevos se auditan con auditar_contraste."}


def h_componente_consentimiento(args):
    """Banner de cookies RGPD-ish: acepta, rechaza o solo necesario. Sin rastreo oculto."""
    destino, error = _resolver(args.get("sitio"), escribir=True)
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    politica = str(args.get("politica_url") or "").strip()
    if not politica:
        return {"ok": False, "error": "Sin «politica_url» no se genera el banner: enlazar una política que no "
                                      "existe es peor que no poner banner."}
    categorias = args.get("categorias") if isinstance(args.get("categorias"), list) else ["necesario", "analitica"]
    texto = str(args.get("texto") or "Usamos cookies necesarias y, si aceptas, analíticas para saber qué se lee.")
    css_ruta = os.path.join(base, "css", "estilo.css")
    if os.path.isfile(css_ruta):
        css = _leer(css_ruta)
        if ".consentimiento" not in css:
            _escribir_atomico(css_ruta, css + "\n.consentimiento { position: fixed; inset: auto 0 0 0; z-index: 40;\n"
                                              "    background: var(--superficie); border-top: 1px solid var(--borde); padding: 1rem; }\n"
                                              ".consentimiento .fila { display: flex; gap: .7rem; flex-wrap: wrap; align-items: center; }\n"
                                              ".consentimiento[hidden] { display: none; }\n")
    js_ruta = os.path.join(base, "js", "main.js")
    if os.path.isfile(js_ruta) and "cerebronico-consentimiento" not in _leer(js_ruta):
        _escribir_atomico(js_ruta, _leer(js_ruta) + """
  // Consentimiento: tres salidas (todo, solo necesario, rechazar). Nada se carga
  // hasta decidir; la preferencia vive en localStorage, no en una cookie de terceros.
  var clave = "cerebronico-consentimiento";
  var panel = document.getElementById("consentimiento");
  function elegir(valor) {
    try { localStorage.setItem(clave, JSON.stringify({ valor: valor, fecha: Date.now() })); } catch (e) {}
    document.dispatchEvent(new CustomEvent("cerebronico:consentimiento", { detail: { valor: valor } }));
    if (panel) panel.hidden = true;
  }
  if (panel) {
    var guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(clave) || "null"); } catch (e) {}
    if (guardado && guardado.valor) { panel.hidden = true; } else { panel.hidden = false; }
    panel.querySelectorAll("[data-consentir]").forEach(function (b) {
      b.addEventListener("click", function () { elegir(b.getAttribute("data-consentir")); });
    });
  }
""")
    botones = "\n".join('        <li><label><input type="checkbox" name="cat-%s" value="%s"%s> %s</label></li>'
                         % (_slug(c), c, " disabled checked" if c == "necesario" else "", _esc(c.title()))
                         for c in categorias)
    banner = f"""  <!-- consentimiento:inicio -->
  <div id="consentimiento" class="consentimiento" role="region" aria-label="Preferencias de cookies" hidden>
    <div class="contenedor fila">
      <p style="margin:0 1rem 0 0">{_esc(texto)}</p>
      <a href="{_esc(politica)}">Política de cookies</a>
      <button class="boton boton--sec" type="button" data-consentir="necesario">Solo necesarias</button>
      <button class="boton boton--sec" type="button" data-consentir="rechazar">Rechazar</button>
      <button class="boton" type="button" data-consentir="todo">Aceptar</button>
    </div>
    <details class="contenedor"><summary>Detalle de categorías</summary><ul>{botones}</ul></details>
  </div>
  <!-- consentimiento:fin -->
"""
    tocadas = 0
    for html_nombre in _listar_paginas(base):
        ruta = os.path.join(base, html_nombre)
        html = _leer(ruta)
        if "consentimiento:inicio" in html:
            continue
        html = html.replace("</body>", banner + "</body>", 1)
        _escribir_atomico(ruta, html)
        tocadas += 1
    informe = auditar_html(_leer(os.path.join(base, "index.html")), base) if tocadas else {}
    return {"ok": True, "paginas": tocadas, "politica": politica, "categorias": categorias,
            "auditoria": informe.get("conteo"),
            "aviso": "El banner NO carga analítica por sí solo: alguien tiene que escuchar el evento "
                     "«cerebronico:consentimiento» e inyectar el script. Y esto no es asesoría legal."}


def h_formulario_destino(args):
    """Pone destino real al formulario generado y añade miel para bots."""
    accion = str(args.get("accion") or "").strip()
    if not accion:
        return {"ok": False, "error": "Falta «accion»: sin destino el formulario sigue siendo decorativo."}
    destino, error = _resolver(args.get("sitio"), escribir=True)
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    metodo = args.get("metodo") if args.get("metodo") in ("post", "get") else "post"
    tocadas = []
    for html_nombre in _listar_paginas(base):
        ruta = os.path.join(base, html_nombre)
        html = _leer(ruta)
        if "<form" not in html:
            continue
        html = re.sub(r'<form([^>]*?)action="#"', r'<form\1action="%s"' % _esc(accion), html, count=1)
        html = re.sub(r'(<form[^>]*?)method="[a-z]*"', r'\1method="%s"' % metodo, html, count=1, flags=re.I)
        if "_hp" not in html:
            # La miel tiene que ir DENTRO del <form>: insertada antes de la
            # apertura el bot no la veía y el filtro era decorativo.
            apertura = re.search(r"<form\b[^>]*data-validar[^>]*>", html)
            if apertura:
                miel = ('\n        <input class="campo-oculto" type="text" name="_hp" tabindex="-1"\n'
                        '               autocomplete="off" aria-hidden="true" aria-label="Deja este campo vacío">')
                html = html[:apertura.end()] + miel + html[apertura.end():]
        if 'name="nombre"' in html and 'autocomplete="name"' not in html:
            html = html.replace('name="nombre"', 'name="nombre" autocomplete="name"', 1)
        _escribir_atomico(ruta, html)
        tocadas.append(html_nombre)
    if not tocadas:
        return {"ok": False, "error": "Ninguna página del sitio tiene <form>."}
    js_ruta = os.path.join(base, "js", "main.js")
    if os.path.isfile(js_ruta) and "_hp" not in _leer(js_ruta):
        _escribir_atomico(js_ruta, _leer(js_ruta) + """
  // Miel para bots: un humano no ve ni rellena este campo.
  var form = document.querySelector("form[data-validar]");
  if (form) {
    var miel = form.querySelector('input[name="_hp"]');
    if (miel) form.addEventListener("submit", function (e) {
      if (miel.value) { e.preventDefault(); }
    });
  }
""")
    return {"ok": True, "formularios": tocadas, "accion": accion, "metodo": metodo,
            "aviso": "El destino debe existir y aceptar ese método (formulario de tercero o backend propio). "
                     "Sin HTTPS el envío viaja en claro: compruébalo antes de pedir correos."}


def h_preflight_rendimiento(args):
    """Presupuesto honesto de una página estática: peso, peticiones y nodos."""
    destino, error = _resolver(args.get("sitio"))
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    presupuesto = {"html_bytes": 60_000, "css_bytes": 60_000, "js_bytes": 30_000,
                   "total_bytes": 400_000, "peticiones": 25, "nodos": 900}
    for k, v in (args.get("presupuesto") or {}).items():
        if k in presupuesto:
            presupuesto[k] = int(v)
    paginas = []
    for html_nombre in _listar_paginas(base):
        ruta = os.path.join(base, html_nombre)
        html = _leer(ruta)
        html_bytes = len(html.encode("utf-8"))
        refs = sorted(set(re.findall(r'(?:src|href)=["\']((?!https?:|#|mailto:|tel:)[^"\']+)', html)))
        pesos = {}
        for r in refs:
            p_local = os.path.join(base, r.split("?")[0])
            if os.path.isfile(p_local):
                pesos[r] = os.path.getsize(p_local)
        total = html_bytes + sum(pesos.values())
        css_bytes = sum(v for k, v in pesos.items() if k.endswith(".css"))
        js_bytes = sum(v for k, v in pesos.items() if k.endswith(".js"))
        nodos = len(re.findall(r"<[a-zA-Z][^>]*>", html))
        sin_lazy = len(re.findall(r"<img\b(?![^>]*loading=)", html))
        bloqueantes = len([m for m in re.findall(r"<script[^>]*\bsrc=[^>]*>", html.split("</head>")[0])
                           if "defer" not in m and "async" not in m])
        excesos = []
        if html_bytes > presupuesto["html_bytes"]:
            excesos.append("html_bytes")
        if css_bytes > presupuesto["css_bytes"]:
            excesos.append("css_bytes")
        if js_bytes > presupuesto["js_bytes"]:
            excesos.append("js_bytes")
        if total > presupuesto["total_bytes"]:
            excesos.append("total_bytes")
        if len(pesos) + 1 > presupuesto["peticiones"]:
            excesos.append("peticiones")
        if nodos > presupuesto["nodos"]:
            excesos.append("nodos")
        paginas.append({"pagina": html_nombre, "html_bytes": html_bytes, "css_bytes": css_bytes,
                        "js_bytes": js_bytes, "total_bytes": total, "peticiones": len(pesos) + 1,
                        "nodos": nodos, "imagenes_sin_lazy": sin_lazy, "scripts_bloqueantes": bloqueantes,
                        "fuera_de_presupuesto": excesos,
                        "mayores": sorted(((v, k) for k, v in pesos.items()), reverse=True)[:3]})
    return {"ok": True, "sitio": base, "presupuesto": presupuesto, "paginas": paginas,
            "veredicto": ("dentro de presupuesto" if not any(x["fuera_de_presupuesto"] for x in paginas)
                          else "fuera de presupuesto"),
            "aviso": "Peso en disco y conteo de archivos: NO mide tiempo real de red, compresión del servidor, "
                     "ni render. Para eso hace falta Lighthouse en un navegador."}


# ============================================================
# BUCLE AUTÓNOMO DE MEJORA (la capacidad nueva de verdad)
# ============================================================
def _hash(texto):
    import hashlib
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]


def _estado_de(base, html_nombre):
    inf = auditar_html(_leer(os.path.join(base, html_nombre)), base)
    return {"pagina": html_nombre,
            "errores": inf["conteo"]["error"], "avisos": inf["conteo"]["aviso"], "infos": inf["conteo"]["info"],
            "marcadores": sum(1 for h_ in inf["hallazgos"] if h_["codigo"] == "marcadores"),
            "codigos": sorted({h_["codigo"] for h_ in inf["hallazgos"]}),
            "veredicto": inf["veredicto"], "hash": _hash(_leer(os.path.join(base, html_nombre)))}


MAX_ITERACIONES = int(os.environ.get("CN_CREADOR_MAX_ITER") or "8")


def h_mejorar_hasta_estable(args):
    """Itera audit→corrige→audit hasta agotar lo seguro, con parada honesta.

        Cuatro salidas, y cada una dice cuál fue:
          · objetivo_alcanzado  → 0 errores y (si se pidió) 0 marcadores
          · sin_progreso        → dos pasadas producen el mismo hash: seguir sería mover aire
          · max_iteraciones     → se acabó el presupuesto sin alcanzar el objetivo
          · nada_que_corregir   → lo que queda exige criterio humano desde el principio
        Nunca escribe fuera de las raíces, y deja un snapshot por iteración.
        """
    destino, error = _resolver(args.get("sitio"), escribir=True)
    if error:
        return error
    base = destino if os.path.isdir(destino) else os.path.dirname(destino)
    max_iter = min(int(args.get("max_iteraciones") or MAX_ITERACIONES), MAX_ITERACIONES)
    exigir_marcadores = bool(args.get("exigir_sin_marcadores"))
    objetivos = [html_nombre for html_nombre in (args.get("paginas") or _listar_paginas(base))
                 if html_nombre in _listar_paginas(base)]
    if not objetivos:
        return {"ok": False, "error": "No hay páginas que mejorar en %s" % base}
    traza, parada = [], "sin_progreso"
    anterior = {n: _estado_de(base, n) for n in objetivos}
    for pagina in objetivos:
        traza.append({"iteracion": 0, **anterior[pagina]})
    for i in range(1, max_iter + 1):
        cambiaron = 0
        for pagina in objetivos:
            ruta = os.path.join(base, pagina)
            resultado = h_mejorar_pagina({"archivo": ruta, "aplicar": True})
            if not resultado.get("ok"):
                continue
            if resultado.get("aplicado"):
                cambiaron += 1
            nuevo = _estado_de(base, pagina)
            if nuevo["hash"] != anterior[pagina]["hash"]:
                anterior[pagina] = nuevo
                traza.append({"iteracion": i, **nuevo})
        totales = {"error": 0, "aviso": 0, "info": 0}
        marcadores = 0
        for estado in anterior.values():
            totales["error"] += estado["errores"]
            totales["aviso"] += estado["avisos"]
            totales["info"] += estado["infos"]
            marcadores += estado["marcadores"]
        objetivo_ok = totales["error"] == 0 and (not exigir_marcadores or marcadores == 0)
        if objetivo_ok:
            parada = "objetivo_alcanzado"
            break
        if cambiaron == 0:
            parada = "sin_progreso"
            break
        if i == max_iter:
            parada = "max_iteraciones"
    restantes = []
    for pagina in objetivos:
        inf = auditar_html(_leer(os.path.join(base, pagina)), base)
        restantes.append({"pagina": pagina,
                          "requieren_humano": [{"codigo": h_["codigo"], "que": h_["que"], "correccion": h_["correccion"]}
                                               for h_ in inf["hallazgos"] if h_["codigo"] not in ARREGLABLES]})
    return {"ok": True, "sitio": base, "parada": parada, "iteraciones": len([t for t in traza if t["iteracion"] > 0]),
            "max_iteraciones": max_iter, "traza": traza, "estado_final": list(anterior.values()),
            "exigir_sin_marcadores": exigir_marcadores,
            "requiere_decision_humana": restantes,
            "aviso": "El bucle solo aplica arreglos objetivos. Un [Personaliza este texto] o un enlace roto "
                     "NO se resuelven iterando: hay que escribir el contenido o quitar el enlace."}


def h_forjar_desde_brief(args):
    """Un solo clic: brief → sitio → PWA → OG → schema → tema → bucle → informe."""
    brief = args.get("brief") if isinstance(args.get("brief"), dict) else args
    pasos = []

    def registrar(nombre, resultado):
        pasos.append({"paso": nombre, "ok": bool(resultado.get("ok")),
                      "detalle": {k: v for k, v in resultado.items()
                                  if k in ("ruta", "sitio", "pagina", "conteo", "veredicto", "parada",
                                           "total", "paginas", "schema", "mediciones", "fallan")}})
        return resultado

    creado = registrar("crear_sitio", h_crear_sitio(brief))
    if not creado.get("ok"):
        return {"ok": False, "pasos": pasos, "error": creado.get("error")}
    base = creado["ruta"]
    nombre_sitio = creado["sitio"]
    if bool(brief.get("modo_oscuro", True)):
        registrar("componente_modo_oscuro", h_componente_modo_oscuro({"sitio": nombre_sitio}))
    if brief.get("politica_url"):
        registrar("componente_consentimiento", h_componente_consentimiento(
            {"sitio": nombre_sitio, "politica_url": brief["politica_url"], "categorias": brief.get("cookie_categorias")}))
    if brief.get("accion_formulario"):
        registrar("formulario_destino", h_formulario_destino(
            {"sitio": nombre_sitio, "accion": brief["accion_formulario"], "metodo": brief.get("metodo_formulario")}))
    registrar("crear_pwa", h_crear_pwa({"sitio": nombre_sitio, "nombre": brief.get("nombre") or nombre_sitio,
                                        "paleta": brief.get("paleta")}))
    registrar("crear_og_image", h_crear_og_image({"sitio": nombre_sitio, "titulo": brief.get("titulo"),
                                                  "subtitulo": brief.get("subtitulo"), "paleta": brief.get("paleta")}))
    tipo_schema = str(brief.get("schema") or "WebSite")
    esquema = {"sitio": nombre_sitio, "tipo": tipo_schema, "nombre": brief.get("nombre"),
               "url": brief.get("url_canonica") or brief.get("url"),
               "direccion": brief.get("direccion"), "telefono": brief.get("telefono"),
               "email": brief.get("contacto"), "horario": brief.get("horario"),
               "redes": brief.get("redes"), "migas": brief.get("migas")}
    registrar("generar_schema_jsonld", h_generar_schema_jsonld(esquema))
    registrar("auditar_contraste", h_auditar_contraste({"sitio": nombre_sitio}))
    registrar("preflight_rendimiento", h_preflight_rendimiento({"sitio": nombre_sitio}))
    bucle = registrar("mejorar_hasta_estable", h_mejorar_hasta_estable(
        {"sitio": nombre_sitio, "max_iteraciones": brief.get("max_iteraciones"),
         "exigir_sin_marcadores": bool(brief.get("exigir_sin_marcadores"))}))
    final = h_auditar_sitio({"sitio": nombre_sitio})
    return {"ok": True, "sitio": nombre_sitio, "ruta": base, "pasos": pasos,
            "parada_del_bucle": bucle.get("parada"), "veredicto": final.get("veredicto"),
            "total": final.get("conteo") or final.get("total"),
            "siguiente_paso": ("Rellenar los [Personaliza este texto]: el bucle no escribe contenido por ti."
                               if (final.get("marcadores_sin_rellenar") or 0) > 0 else
                               "Revisar con lector de pantalla y Lighthouse antes de publicar."),
            "aviso": "Nada de esto inventa datos del negocio: los campos que no pasaste quedaron marcados o "
                     "el paso se negó con su motivo."}


def h_plan_de_construccion(args):
    """Devuelve el plan en el CONTRATO real del motor (set_plan/update_task).

        El bucle autónomo de CerebroNico no entiende prosa: entiende
        `set_plan({tasks:[{id,description}]})` y `update_task({task_id,status})`.
        Aquí se traduce un brief de sitio a esa forma, con el guion de llamadas
        al pack para que cada tarea termine con su tool real.
        """
    nombre = str(args.get("nombre") or "sitio").strip()
    secciones = args.get("secciones") if isinstance(args.get("secciones"), list) else []
    recipes = args.get("paginas") if isinstance(args.get("paginas"), list) else []
    tareas, guion = [], []

    def t(id_, descripcion):
        tareas.append({"id": id_, "description": descripcion})

    t("t1", "Crear el sitio %s con los datos del brief (crear_sitio)" % nombre)
    guion.append({"tool": "crear_sitio", "task_id": "t1",
                  "arguments": {k: v for k, v in args.items() if k in ("nombre", "tipo", "bloques", "titulo",
                                                                       "subtitulo", "cta", "contacto", "descripcion",
                                                                       "caracteristicas", "planes", "pasos", "faq",
                                                                       "testimonios", "galeria", "equipo", "paleta",
                                                                       "tipografia", "url_canonica")}})
    t("t2", "Ampliar con páginas extra y navegación cruzada (crear_pagina / crear_sitio_multipagina)")
    for pg in recipes:
        guion.append({"tool": "crear_pagina", "task_id": "t2",
                      "arguments": {"sitio": _slug(nombre, 40), "ruta": pg.get("ruta"), "titulo": pg.get("titulo"),
                                    "bloques": pg.get("bloques"), "nombre": pg.get("nombre")}})
    if secciones:
        t("t3", "Insertar los bloques pedidos por sección (crear_bloque)")
        for b in secciones:
            guion.append({"tool": "crear_bloque", "task_id": "t3",
                          "arguments": {"sitio": _slug(nombre, 40), "bloque": b.get("bloque"),
                                        "reemplazar": bool(b.get("reemplazar"))}})
    t("t4", "Poner PWA, imagen social y schema (crear_pwa, crear_og_image, generar_schema_jsonld)")
    guion.append({"tool": "crear_pwa", "task_id": "t4", "arguments": {"sitio": _slug(nombre, 40), "nombre": nombre}})
    guion.append({"tool": "crear_og_image", "task_id": "t4", "arguments": {"sitio": _slug(nombre, 40), "titulo": args.get("titulo") or nombre}})
    guion.append({"tool": "generar_schema_jsonld", "task_id": "t4",
                  "arguments": {"sitio": _slug(nombre, 40), "tipo": args.get("schema") or "WebSite",
                                "nombre": args.get("nombre") or nombre, "url": args.get("url_canonica")}})
    t("t5", "Cerrar contraste, componentes y destino del formulario si toca")
    guion.append({"tool": "componente_modo_oscuro", "task_id": "t5", "arguments": {"sitio": _slug(nombre, 40)}})
    if args.get("politica_url"):
        guion.append({"tool": "componente_consentimiento", "task_id": "t5",
                      "arguments": {"sitio": _slug(nombre, 40), "politica_url": args["politica_url"]}})
    if args.get("accion_formulario"):
        guion.append({"tool": "formulario_destino", "task_id": "t5",
                      "arguments": {"sitio": _slug(nombre, 40), "accion": args["accion_formulario"]}})
    guion.append({"tool": "auditar_contraste", "task_id": "t5", "arguments": {"sitio": _slug(nombre, 40)}})
    t("t6", "Bucle de mejora hasta que no queden errores seguros (mejorar_hasta_estable)")
    guion.append({"tool": "mejorar_hasta_estable", "task_id": "t6",
                  "arguments": {"sitio": _slug(nombre, 40), "max_iteraciones": args.get("max_iteraciones") or 6,
                                "exigir_sin_marcadores": bool(args.get("exigir_sin_marcadores"))}})
    t("t7", "Preflight de rendimiento y auditoría final; reportar lo que exige humano")
    guion.append({"tool": "preflight_rendimiento", "task_id": "t7", "arguments": {"sitio": _slug(nombre, 40)}})
    guion.append({"tool": "auditar_sitio", "task_id": "t7", "arguments": {"sitio": _slug(nombre, 40)}})
    return {"ok": True, "servicio": NOMBRE_SERVICIO,
            "set_plan": {"tasks": tareas},
            "actualizaciones": [{"task_id": x["id"], "status": "pending"} for x in tareas],
            "guion": guion,
            "como_usarlo": ["1) set_plan con «set_plan» tal cual (es el contrato del motor).",
                            "2) Por tarea: update_task a in_progress, ejecutar su «guion», update_task a completed.",
                            "3) No cerrar t7 con veredicto «no publicable»: queda en manos del humano."],
            "aviso": "El plan no garantiza un sitio publicable: garantiza que cada tarea termina con una "
                     "herramienta que audita. Los [Personaliza este texto] siguen siendo tuyos."}


# ── PALETAS ACCESIBLES (v1.20.0) ───────────────────────────────────────────
# `auditar_contraste` suspendió a las propias paletas del generador: texto blanco
# sobre el acento daba ratios de 3,2 (noche) y 3,4 (violeta), y eso es un error de
# accesibilidad EN EL PRODUCTO, no del usuario. Aquí se corrige en origen: para
# cada acento se elige el texto (blanco o el fondo del tema) que apruebe AA, y si
# ninguno aprueba se oscurece el acento hasta aprobar.
def _asegurar_paletas():
    for clave, p in PALETAS.items():
        # 1) El texto suave tiene que aprobar AA sobre el fondo Y sobre la
        #    superficie: la primera versión solo miraba el botón y «calido»
        #    suspendía con 4,47 en texto suave sobre superficie.
        peores = []
        for soporte in (p["bg"], p["superficie"]):
            if _ratio(_hex_a_rgb(soporte), _hex_a_rgb(p["texto_suave"])) < 4.5:
                peores.append(soporte)
        for soporte in peores:
            corregido = _ajuste_accible(soporte, p["texto_suave"], 4.5)
            if corregido:
                p["texto_suave"] = corregido
        # 1b) El borde de las tarjetas: no es texto (WCAG 1.4.11 pide 3:1 solo para
        #       componentes que hay que identificar), pero un borde invisible sobre
        #       la superficie es una tarjeta sin marco. Se exige el mínimo de la casa.
        if _ratio(_hex_a_rgb(p["superficie"]), _hex_a_rgb(p["borde"])) < 1.5:
            corregido = _ajuste_accible(p["superficie"], p["borde"], 1.5)
            if corregido:
                p["borde"] = corregido
        # 2) El texto del botón sobre el acento.
        fondo = p["acento"]
        candidatos = [("#ffffff", None), (p["bg"], None)]
        mejor = None
        for texto, _ in candidatos:
            r = _ratio(_hex_a_rgb(fondo), _hex_a_rgb(texto))
            if r >= 4.5:
                mejor = (texto, round(r, 2))
                break
        if mejor is None:
            ajustado = _ajuste_accible(fondo, "#ffffff", 4.5) or _ajuste_accible(fondo, p["bg"], 4.5)
            if ajustado:
                p["acento"] = ajustado
                for texto in ("#ffffff", p["bg"]):
                    if _ratio(_hex_a_rgb(ajustado), _hex_a_rgb(texto)) >= 4.5:
                        mejor = (texto, round(_ratio(_hex_a_rgb(ajustado), _hex_a_rgb(texto)), 2))
                        break
        if mejor:
            p["acento_texto"] = mejor[0]
            p["ratio_boton"] = mejor[1]
        p["ratio_texto_suave"] = round(min(
            _ratio(_hex_a_rgb(p["bg"]), _hex_a_rgb(p["texto_suave"])),
            _ratio(_hex_a_rgb(p["superficie"]), _hex_a_rgb(p["texto_suave"]))), 2)


_asegurar_paletas()


MANIFIESTO = [
    {"name": "estado_creador", "cheap": True,
     "description": "Estado del pack creador: raiz de sitios, sitios registrados, bloques, paletas y tipos disponibles.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "plantillas_disponibles", "cheap": True,
     "description": "Lista los bloques, paletas, tipografias y tipos de sitio que el creador sabe armar. Consultala antes de crear.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "crear_sitio",
     "description": "Genera un sitio completo (HTML+CSS+JS sin frameworks, PWA, OG, README) a partir de los datos que pases. Determinista: donde falte un dato queda [Personaliza este texto], NUNCA se inventa contenido. No pisa un sitio existente salvo sobrescribir:true.",
     "parameters": {"type": "object", "properties": {
         "nombre": {"type": "string", "description": "nombre del sitio (se convierte en id de carpeta)"},
         "tipo": {"type": "string", "enum": sorted(TIPOS_SITIO), "description": "receta de bloques por defecto"},
         "bloques": {"type": "array", "items": {"type": "string", "enum": BLOQUES_DISPONIBLES},
                     "description": "lista explicita de bloques (sustituye la receta)"},
         "titulo": {"type": "string", "description": "h1 del hero"},
         "subtitulo": {"type": "string", "description": "bajada del hero"},
         "cta": {"type": "string", "description": "texto del boton principal"},
         "paleta": {"type": "string", "enum": sorted(PALETAS), "description": "tema de color (por defecto claro)"},
         "tipografia": {"type": "string", "enum": sorted(TIPOS)},
         "idioma": {"type": "string", "description": "valor del atributo lang (por defecto es)"},
         "descripcion": {"type": "string", "description": "meta description (50-155 caracteres)"},
         "contacto": {"type": "string", "description": "correo de contacto"},
         "caracteristicas": {"type": "array", "items": {"type": "object", "properties": {
             "titulo": {"type": "string"}, "texto": {"type": "string"}}}},
         "pasos": {"type": "array", "items": {"type": "string"}},
         "planes": {"type": "array", "items": {"type": "object", "properties": {
             "nombre": {"type": "string"}, "precio": {"type": "string"},
             "beneficios": {"type": "array", "items": {"type": "string"}}}}},
         "testimonios": {"type": "array", "items": {"type": "object", "properties": {
             "cita": {"type": "string"}, "autor": {"type": "string"}, "cargo": {"type": "string"}}}},
         "faq": {"type": "array", "items": {"type": "object", "properties": {
             "pregunta": {"type": "string"}, "respuesta": {"type": "string"}}}},
         "galeria": {"type": "array", "items": {"type": "object", "properties": {
             "imagen": {"type": "string"}, "titulo": {"type": "string"}, "texto_alternativo": {"type": "string"}}}},
         "hero_imagen": {"type": "string", "description": "imagen del hero (ruta en assets o URL): activa el hero partido"},
         "hero_imagen_alt": {"type": "string", "description": "texto alternativo de la imagen del hero"},
         "hero_variante": {"type": "string", "enum": ["centrado", "split", "minimal"], "description": "disposicion del hero (por defecto centrado; con imagen, split)"},
         "media": {"type": "object", "properties": {
             "imagen": {"type": "string"}, "texto_alternativo": {"type": "string"},
             "titulo": {"type": "string"}, "texto": {"type": "string"}},
             "description": "imagen destacada del bloque 'imagen'"},
         "estadisticas": {"type": "array", "items": {"type": "object", "properties": {
             "cifra": {"type": "string"}, "etiqueta": {"type": "string"}}}},
         "logos": {"type": "array", "items": {"type": "object", "properties": {
             "imagen": {"type": "string"}, "nombre": {"type": "string"}, "texto_alternativo": {"type": "string"}}}},
         "enlaces": {"type": "array", "items": {"type": "string"}, "description": "Texto|id-de-destino (si se omite, se derivan de los bloques)"},
         "caracteristicas_texto": {"type": "string"}, "cta_texto": {"type": "string"},
         "cta_subtexto": {"type": "string"}, "pie_texto": {"type": "string"},
         "titulo_pagina": {"type": "string", "description": "<title> (por defecto el nombre)"},
         "url_canonica": {"type": "string", "description": "URL definitiva; sin esto no se emite canonical"},
         "equipo": {"type": "array", "items": {"type": "object", "properties": {
             "nombre": {"type": "string"}, "rol": {"type": "string"}}}},
         "sobrescribir": {"type": "boolean", "description": "regenerar si ya existe (deja snapshot)"}},
         "required": ["nombre"]}},
    {"name": "crear_bloque",
     "description": "Inserta o reemplaza UN bloque (hero, caracteristicas, precios, faq, contacto, galeria, etc.) en una pagina existente, entre marcadores. Deja snapshot previo.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string", "description": "carpeta del sitio o ruta del html"},
         "bloque": {"type": "string", "enum": BLOQUES_DISPONIBLES},
         "reemplazar": {"type": "boolean", "description": "renovar el bloque si ya existe"},
         "paleta": {"type": "string", "enum": sorted(PALETAS)},
         "titulo": {"type": "string"}, "subtitulo": {"type": "string"},
         "caracteristicas": {"type": "array", "items": {"type": "object"}},
         "planes": {"type": "array", "items": {"type": "object"}},
         "faq": {"type": "array", "items": {"type": "object"}},
         "testimonios": {"type": "array", "items": {"type": "object"}},
         "pasos": {"type": "array", "items": {"type": "string"}},
         "galeria": {"type": "array", "items": {"type": "object"}},
         "media": {"type": "object"}, "estadisticas": {"type": "array", "items": {"type": "object"}},
         "logos": {"type": "array", "items": {"type": "object"}},
         "hero_imagen": {"type": "string"}, "hero_imagen_alt": {"type": "string"},
         "hero_variante": {"type": "string", "enum": ["centrado", "split", "minimal"]}},
         "required": ["sitio", "bloque"]}},
    {"name": "insertar_imagen",
     "description": "Coloca UNA imagen dentro del sitio (assets/subidas/) y devuelve el src exacto para usarla en galeria, hero o el bloque imagen. Acepta un archivo local (origen), bytes en base64 (datos_base64) o un SVG en texto (svg); una URL remota (url) se referencia tal cual sin descargar. NO inventa imagenes.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string", "description": "carpeta del sitio o ruta del html"},
         "origen": {"type": "string", "description": "ruta de un archivo de imagen dentro de las raices autorizadas"},
         "datos_base64": {"type": "string", "description": "bytes de la imagen en base64 (admite prefijo data:)"},
         "svg": {"type": "string", "description": "SVG en texto; se saneja (sin <script> ni on*)"},
         "url": {"type": "string", "description": "URL remota http(s)/data: para referenciar sin copiar"},
         "nombre_archivo": {"type": "string", "description": "nombre destino (se normaliza y se le pone la extension real)"},
         "sobrescribir": {"type": "boolean", "description": "pisar si ya existe un archivo con ese nombre"}},
         "required": ["sitio"]}},
    {"name": "auditar_pagina", "cheap": True,
     "description": "Audita UNA pagina HTML: doctype, lang, viewport, title y descripcion, jerarquia de encabezados, alt de imagenes, labels de formulario, controles sin nombre, anclas rotas, archivos locales que faltan, etiquetas sin cerrar, scripts bloqueantes, OG/PWA y marcadores sin rellenar. Devuelve veredicto publicable o no.",
     "parameters": {"type": "object", "properties": {
         "archivo": {"type": "string", "description": "ruta dentro de las raices autorizadas"}},
         "required": ["archivo"]}},
    {"name": "auditar_sitio",
     "description": "Audita todas las paginas HTML de un sitio y suma hallazgos con veredicto global.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string", "description": "carpeta del sitio"}}, "required": ["sitio"]}},
    {"name": "mejorar_pagina", "destructive": True,
     "description": "Arregla SOLO lo objetivamente seguro (lang, doctype, viewport, description derivada, alt vacio, defer) y reporta lo que exige criterio humano. Seco por defecto: aplicar:true escribe y deja snapshot.",
     "parameters": {"type": "object", "properties": {
         "archivo": {"type": "string"}, "aplicar": {"type": "boolean",
         "description": "escribir los arreglos (por defecto false: informa)"}}, "required": ["archivo"]}},
    {"name": "crear_pwa",
     "description": "Genera manifest.webmanifest y sw.js (cache-first con reserva) y enlaza manifest + registro del service worker en el index.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "nombre": {"type": "string"},
         "descripcion": {"type": "string"}, "paleta": {"type": "string", "enum": sorted(PALETAS)}},
         "required": ["sitio"]}},
    {"name": "crear_og_image",
     "description": "Crea assets/og-image.svg (1200x630) con titulo, bajada y acento de la paleta del sitio.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "titulo": {"type": "string"}, "subtitulo": {"type": "string"},
         "nombre": {"type": "string"}, "paleta": {"type": "string", "enum": sorted(PALETAS)}},
         "required": ["sitio"]}},
    {"name": "listar_sitios", "cheap": True,
     "description": "Lista los sitios generados con su carpeta, tipo, paleta y paginas reales encontradas en disco.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "previsualizar_sitio", "cheap": True,
     "description": "Dice como previsualizar un sitio generado (sandbox de la IDE o http.server). Este pack nunca levanta servidores por si solo.",
     "parameters": {"type": "object", "properties": {"sitio": {"type": "string"}}, "required": ["sitio"]}},
    {"name": "auditar_contraste", "cheap": True,
     "description": "Contraste WCAG 2.1 real (luminancia relativa) de los tokens del sitio y de los pares que pases. Dice que par falla AA y propone el color minimo que aprueba. NO mide texto sobre imagen ni degradados.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "objetivo": {"type": "number", "description": "ratio minima texto normal (por defecto 4.5)"},
         "pares": {"type": "array", "items": {"type": "object", "properties": {
             "etiqueta": {"type": "string"}, "fondo": {"type": "string"}, "frente": {"type": "string"},
             "minimo": {"type": "number"}}}}}, "required": []}},
    {"name": "crear_pagina",
     "description": "Anade una pagina nueva a un sitio existente reutilizando el CSS/JS comun y registrando el enlace en la navegacion de TODAS las paginas (idempotente).",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "ruta": {"type": "string", "description": "nombre de archivo sin extension"},
         "nombre": {"type": "string", "description": "texto del enlace en el menu"},
         "titulo": {"type": "string"}, "subtitulo": {"type": "string"},
         "bloques": {"type": "array", "items": {"type": "string", "enum": BLOQUES_DISPONIBLES}},
         "caracteristicas": {"type": "array", "items": {"type": "object"}},
         "faq": {"type": "array", "items": {"type": "object"}},
         "planes": {"type": "array", "items": {"type": "object"}},
         "testimonios": {"type": "array", "items": {"type": "object"}},
         "contacto": {"type": "string"}, "cta": {"type": "string"}},
         "required": ["sitio", "ruta"]}},
    {"name": "crear_sitio_multipagina",
     "description": "Genera un sitio de varias paginas de golpe con navegacion cruzada, sitemap.xml y robots con Sitemap. Cada pagina lleva SOLO los bloques que pasaste para ella.",
     "parameters": {"type": "object", "properties": {
         "nombre": {"type": "string"}, "base_url": {"type": "string", "description": "dominio publico para el sitemap"},
         "paleta": {"type": "string", "enum": sorted(PALETAS)}, "idioma": {"type": "string"},
         "contacto": {"type": "string"}, "nombre_sitio": {"type": "string"},
         "paginas": {"type": "array", "items": {"type": "object", "properties": {
             "ruta": {"type": "string"}, "nombre": {"type": "string"}, "titulo": {"type": "string"},
             "subtitulo": {"type": "string"}, "bloques": {"type": "array", "items": {"type": "string"}},
             "caracteristicas": {"type": "array"}, "faq": {"type": "array"}, "planes": {"type": "array"}}}},
         "sobrescribir": {"type": "boolean"}}, "required": ["nombre", "paginas"]}},
    {"name": "generar_schema_jsonld",
     "description": "Inyecta JSON-LD (WebSite, Organization, LocalBusiness, FAQPage, BreadcrumbList) entre marcadores. FAQPage sale de las preguntas que YA estan en la pagina; LocalBusiness exige direccion real o se niega: no inventa datos del negocio.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "tipo": {"type": "string", "enum": ["WebSite", "Organization", "LocalBusiness", "FAQPage", "BreadcrumbList"]},
         "nombre": {"type": "string"}, "url": {"type": "string"}, "direccion": {"type": "string"},
         "telefono": {"type": "string"}, "email": {"type": "string"}, "horario": {"type": "string"},
         "redes": {"type": "array", "items": {"type": "string"}},
         "migas": {"type": "array", "items": {"type": "object", "properties": {
             "nombre": {"type": "string"}, "url": {"type": "string"}}}}},
         "required": ["sitio", "tipo", "nombre"]}},
    {"name": "componente_modo_oscuro",
     "description": "Anade tema claro/oscuro con prefers-color-scheme, boton con aria-pressed y persistencia en localStorage. Actualiza todas las paginas del sitio.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"},
         "paleta_alternativa": {"type": "string", "enum": sorted(PALETAS)}}, "required": ["sitio"]}},
    {"name": "componente_consentimiento",
     "description": "Banner de cookies con aceptar / solo necesarias / rechazar, detalle por categorias y evento 'cerebronico:consentimiento'. Exige URL de politica real; no carga analitica por si solo.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "politica_url": {"type": "string"},
         "categorias": {"type": "array", "items": {"type": "string"}},
         "texto": {"type": "string"}}, "required": ["sitio", "politica_url"]}},
    {"name": "formulario_destino",
     "description": "Da destino real al formulario generado (accion + metodo), anade campo miel anti-bot y autocomplete. Sin backend o servicio que reciba, el formulario sigue siendo decorativo.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "accion": {"type": "string"},
         "metodo": {"type": "string", "enum": ["post", "get"]}}, "required": ["sitio", "accion"]}},
    {"name": "preflight_rendimiento", "cheap": True,
     "description": "Presupuesto honesto por pagina: bytes de HTML/CSS/JS, peticiones, nodos del DOM, imagenes sin lazy y scripts bloqueantes. Mide peso en disco, NO tiempo de red ni render.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"},
         "presupuesto": {"type": "object", "properties": {
             "html_bytes": {"type": "number"}, "css_bytes": {"type": "number"}, "js_bytes": {"type": "number"},
             "total_bytes": {"type": "number"}, "peticiones": {"type": "number"}, "nodos": {"type": "number"}}}},
         "required": ["sitio"]}},
    {"name": "mejorar_hasta_estable",
     "description": "BUCLE de mejora: auditua -> aplica los arreglos seguros -> re-auditua, hasta agotar lo corregible. Para con motivo honesto (objetivo_alcanzado / sin_progreso / max_iteraciones) y deja snapshot por pasada. Lo que queda lo lista como decision humana.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "paginas": {"type": "array", "items": {"type": "string"}},
         "max_iteraciones": {"type": "number", "description": "techo del bucle (defecto y maximo: CN_CREADOR_MAX_ITER)"},
         "exigir_sin_marcadores": {"type": "boolean", "description": "no parar mientras queden [Personaliza este texto]"}
     }, "required": ["sitio"]}},
    {"name": "forjar_desde_brief",
     "description": "Forja el sitio entero en una pasada: crear_sitio -> tema oscuro -> consentimiento -> formulario -> PWA -> OG -> schema -> contraste -> rendimiento -> bucle de mejora -> informe con parada y veredicto.",
     "parameters": {"type": "object", "properties": {
         "brief": {"type": "object", "description": "los mismos campos que crear_sitio, mas politica_url, accion_formulario, schema, url, direccion, telefono, horario, redes, migas, max_iteraciones, exigir_sin_marcadores"},
         "nombre": {"type": "string"}}, "required": ["brief"]}},
    {"name": "forjar_y_entregar",
     "description": "BUCLE A PRUEBA DE ERRORES de una sola orden: brief -> sitio completo -> auto-mejora por RONDAS hasta converger o quedar publicable -> auditoria -> ZIP determinista VERIFICADO (se ABRE el zip, se comprueba su CRC, que trae index.html y que coincide hash a hash con el disco). Ningun paso puede tumbar la linea: cada uno va en su red y los fallos se anotan en la bitacora. Veredicto: entregable / entregable_con_reservas / no_entregable. NO inventa contenido: los [Personaliza este texto] quedan como reserva honesta.",
     "parameters": {"type": "object", "properties": {
         "brief": {"type": "object", "description": "los mismos campos que crear_sitio / forjar_desde_brief"},
         "rondas": {"type": "number", "description": "techo de rondas del bucle externo (defecto y maximo: CN_CREADOR_MAX_RONDAS)"},
         "exigir_sin_marcadores": {"type": "boolean", "description": "no dar por publicable mientras queden [Personaliza este texto]"},
         "salida_zip": {"type": "string", "description": "nombre del .zip dentro de exportaciones (opcional)"}
     }, "required": ["brief"]}},
    {"name": "plan_de_construccion",
     "description": "Traduce un brief al CONTRATO del bucle autonomo de CerebroNico: set_plan({tasks:[{id,description}]}) + guion de llamadas al pack por tarea. Sirve para dejar la construccion del sitio en manos del motor.",
     "parameters": {"type": "object", "properties": {
         "nombre": {"type": "string"}, "titulo": {"type": "string"},
         "secciones": {"type": "array", "items": {"type": "object", "properties": {
             "bloque": {"type": "string"}, "reemplazar": {"type": "boolean"}}}},
         "paginas": {"type": "array", "items": {"type": "object"}},
         "schema": {"type": "string"}, "politica_url": {"type": "string"},
         "accion_formulario": {"type": "string"}, "max_iteraciones": {"type": "number"},
         "exigir_sin_marcadores": {"type": "boolean"}}, "required": ["nombre"]}},
    {"name": "crear_archivo", "cheap": True,
     "description": "Escribe UN archivo dentro de un sitio con la RUTA validada (sin '..', sin rutas absolutas, sin fugas, tipo conocido). NO toca navegacion ni sitemap: es race-free y por eso vale para crear en paralelo. Si no pasas 'contenido', deja [Personaliza este texto] (no inventa).",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "ruta": {"type": "string", "description": "ruta relativa dentro del sitio, ej. js/app.js"},
         "contenido": {"type": "string"}, "tipo": {"type": "string"},
         "sobrescribir": {"type": "boolean"}}, "required": ["sitio", "ruta"]}},
    {"name": "planificar_ruta_trabajo",
     "description": "RUTA DE TRABAJO: PLAN. Desde la orden inicial documenta la lista de requisitos y TODOS los archivos a crear, los VALIDA ANTES de crear nada (ruta segura, tipo conocido, sin duplicados, con herramienta que exista) y agrupa lo validado en lotes paralelos de 4-6 para segundo plano. Devuelve set_plan del motor. HONESTO: si algo esta sin aclarar o hay bloqueados, listo_para_lanzar=false. Ningun archivo se escribe en esta fase.",
     "parameters": {"type": "object", "properties": {
         "orden": {"type": "string", "description": "la orden/brief que inicia el trabajo"},
         "nombre": {"type": "string"},
         "requisitos": {"type": "array", "items": {"type": "string"}},
         "artefactos": {"type": "array", "items": {"type": "object", "properties": {
             "ruta": {"type": "string"}, "tipo": {"type": "string"}, "tool": {"type": "string"},
             "contenido": {"type": "string"}, "arguments": {"type": "object"}, "requisito": {"type": "string"}}}},
         "tamano_lote": {"type": "number", "description": "artefactos por lote paralelo (4-6, defecto 5)"}},
         "required": ["orden", "artefactos"]}},
    {"name": "ejecutar_ruta_paralelo",
     "description": "Ejecuta la RUTA en SEGUNDO PLANO PARALELO: crea los artefactos validados en lotes de 4-6 a la vez (hilos = conciencias en paralelo), cada uno en su BUCLE de autocorreccion (audita -> corrige lo corregible -> reaudita hasta limpio o agotar presupuesto). MIDE el solape real (no lo promete) y cierra la lista requerida solo con lo que valido. Se NIEGA a lanzar si el plan no esta listo (salvo forzar:true). Veredicto: completado / completado_con_reservas / incompleto.",
     "parameters": {"type": "object", "properties": {
         "orden": {"type": "string"}, "nombre": {"type": "string"}, "sitio": {"type": "string"},
         "requisitos": {"type": "array", "items": {"type": "string"}},
         "artefactos": {"type": "array", "items": {"type": "object"}},
         "tamano_lote": {"type": "number"}, "max_correcciones": {"type": "number"},
         "permitir_reservas": {"type": "boolean"}, "forzar": {"type": "boolean"}},
         "required": ["orden", "artefactos"]}},
    {"name": "exportar_sitio_zip", "cheap": True,
     "description": "Empaqueta el sitio completo en un ZIP deterministico (orden y marcas fijas: el mismo contenido produce el mismo sha256). Lo deja en .creador/exportaciones/. No levanta servidores ni sube nada: entrega el artefacto.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "salida": {"type": "string", "description": "nombre del .zip dentro de exportaciones (opcional)"}},
         "required": ["sitio"]}},
    {"name": "desplegar_carpeta",
     "description": "Copia el sitio a una carpeta de destino DENTRO de las raices autorizadas (CN_CREADOR_EXTRA_ROOTS). EN SECO por defecto: dice que copiaria, cambiaria y sobra. Con aplicar:true copia y escribe un manifiesto .cerebronico-despliegue.json. Con limpiar:true borra lo que sobra en el destino.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "destino": {"type": "string"},
         "aplicar": {"type": "boolean"}, "limpiar": {"type": "boolean"}},
         "required": ["sitio", "destino"]}},
    {"name": "verificar_despliegue", "cheap": True,
     "description": "Compara hash a hash el sitio fuente con su destino desplegado. Veredicto identico o divergente con listas de lo que falta, sobra o difiere. Es la prueba de que lo publicado es lo que se construyo.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "destino": {"type": "string"}},
         "required": ["sitio", "destino"]}},
    {"name": "listar_exportaciones", "cheap": True,
     "description": "Lista los ZIP de .creador/exportaciones con bytes, sha256 y fecha. Consultar antes de exportar de nuevo: si el hash coincide, no hay nada que volver a subir.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "generar_hreflang",
     "description": "Declara alternates hreflang (con x-default) y un selector de idioma en cada pagina, con marcadores idempotentes. HONESTO: NO traduce nada - si la pagina del otro idioma no existe, lo dice y lista lo que falta. Exige base_url.",
     "parameters": {"type": "object", "properties": {
         "sitio": {"type": "string"}, "idiomas": {"type": "array", "items": {"type": "string"}},
         "base_url": {"type": "string"}},
         "required": ["sitio", "idiomas", "base_url"]}},
]

# ============================================================
# PUBLICAR Y ENTREGAR — v1.21.0
# Exportar (ZIP determinista), desplegar (a raices autorizadas, en seco
# por defecto), verificar (hash a hash), listar exportaciones y declarar
# idiomas (hreflang honesto: no traduce, no inventa).
# Mismo contrato que el resto del pack: nada fuera de las raices, nada
# silencioso, y la prueba de entrega es medible (sha256), no opinable.
# ============================================================
EXPORTACIONES_DIR = os.path.join(CREADOR_ROOT, "exportaciones")
_IGNORAR_ENTREGA = {"historial", "exportaciones", "__pycache__", ".git"}
_MANIFIESTO_ENTREGA = ".cerebronico-despliegue.json"


def _arbol_sitio(ruta_base):
    """{ruta_relativa_normalizada: (bytes, sha256hex)} de TODO el sitio.
    Excluye carpetas de runtime y los .tmp de la escritura atomica."""
    import hashlib
    salida = {}
    for carpeta, dirs, archivos in os.walk(ruta_base):
        dirs[:] = [d for d in sorted(dirs) if d not in _IGNORAR_ENTREGA]
        for a in sorted(archivos):
            if a.endswith(".tmp"):
                continue
            ruta = os.path.join(carpeta, a)
            try:
                with open(ruta, "rb") as f:
                    datos = f.read()
            except OSError:
                continue
            rel = os.path.relpath(ruta, ruta_base).replace(os.sep, "/")
            salida[rel] = (len(datos), hashlib.sha256(datos).hexdigest())
    return salida


def h_exportar_sitio_zip(args):
    origen, error = _resolver(args.get("sitio") or args.get("ruta"))
    if error:
        return error
    if not os.path.isdir(origen):
        return {"ok": False, "error": f"{origen} no es una carpeta de sitio."}
    if not os.path.isfile(os.path.join(origen, "index.html")):
        return {"ok": False, "error": "El sitio no tiene index.html: no hay nada que exportar."}
    arbol = _arbol_sitio(origen)
    if not arbol:
        return {"ok": False, "error": "El sitio esta vacio."}
    import zipfile
    nombre = _slug(os.path.basename(origen), 40)
    salida = str(args.get("salida") or "").strip() or f"{nombre}.zip"
    if not salida.lower().endswith(".zip"):
        return {"ok": False, "error": "La salida debe terminar en .zip."}
    destino, error = _resolver(os.path.join(EXPORTACIONES_DIR, salida), escribir=True)
    if error:
        return error
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in sorted(arbol):
            info = zipfile.ZipInfo(f"{nombre}/{rel}", date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(os.path.join(origen, rel), "rb") as f:
                zf.writestr(info, f.read())
    import hashlib
    with open(destino, "rb") as f:
        firma = hashlib.sha256(f.read()).hexdigest()
    return {"ok": True, "zip": destino, "carpeta_raiz_zip": nombre, "archivos": len(arbol),
            "bytes": os.path.getsize(destino), "sha256": firma,
            "nota": "ZIP deterministico: mismo contenido -> mismo hash. Si listar_exportaciones ya lo tiene, no hay nada que subir."}


def h_desplegar_carpeta(args):
    origen, error = _resolver(args.get("sitio") or args.get("ruta"))
    if error:
        return error
    if not os.path.isdir(origen):
        return {"ok": False, "error": f"{origen} no es una carpeta de sitio."}
    destino, error = _resolver(args.get("destino"), escribir=bool(args.get("aplicar")))
    if error:
        return {"ok": False, "error": (error.get("error") or str(error)) +
                 " — el destino debe estar dentro de las raices autorizadas (CN_CREADOR_EXTRA_ROOTS)."}
    if os.path.realpath(destino) == os.path.realpath(origen):
        return {"ok": False, "error": "origen y destino son la misma carpeta."}
    arbol = _arbol_sitio(origen)
    existente = _arbol_sitio(destino) if os.path.isdir(destino) else {}
    faltan = sorted(set(arbol) - set(existente))
    cambian = sorted(r for r in set(arbol) & set(existente) if arbol[r][1] != existente[r][1])
    sobran = sorted(r for r in set(existente) - set(arbol) if not r.startswith(".cerebronico"))
    if not args.get("aplicar"):
        return {"ok": True, "seco": True, "destino": destino,
                "copiarian": len(faltan) + len(cambian),
                "faltan": faltan[:50], "cambian": cambian[:50], "sobran": sobran[:50],
                "nota": "Pasada EN SECO: nada tocado. Repite con aplicar:true (y limpiar:true si quieres borrar lo que sobra)."}
    os.makedirs(destino, exist_ok=True)
    copiados = []
    for rel in sorted(faltan + cambian):
        ruta_d = os.path.join(destino, *rel.split("/"))
        os.makedirs(os.path.dirname(ruta_d) or ruta_d, exist_ok=True)
        shutil.copy2(os.path.join(origen, rel), ruta_d)
        copiados.append(rel)
    borrados = []
    if args.get("limpiar"):
        for rel in sobran:
            try:
                os.remove(os.path.join(destino, *rel.split("/")))
                borrados.append(rel)
            except OSError:
                pass
    import hashlib
    manifiesto = {"sitio": os.path.basename(origen), "origen": origen,
                  "desplegado": time.strftime("%Y-%m-%dT%H:%M:%S"),
                  "archivos": {r: arbol[r][1] for r in sorted(arbol)}}
    with open(os.path.join(destino, _MANIFIESTO_ENTREGA), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifiesto, f, ensure_ascii=False, indent=2)
    return {"ok": True, "destino": destino, "copiados": len(copiados), "borrados": len(borrados),
            "sobran_sin_borrar": 0 if args.get("limpiar") else len(sobran),
            "manifiesto": _MANIFIESTO_ENTREGA,
            "aviso": "verifica_despliegue despues: la entrega sin prueba no es entrega."}


def h_verificar_despliegue(args):
    origen, error = _resolver(args.get("sitio") or args.get("ruta"))
    if error:
        return error
    destino, error = _resolver(args.get("destino"))
    if error:
        return error
    if not os.path.isdir(destino):
        return {"ok": False, "error": f"{destino} no existe: despliega primero."}
    a = _arbol_sitio(origen)
    b = {k: v for k, v in _arbol_sitio(destino).items() if k != _MANIFIESTO_ENTREGA}
    faltan = sorted(set(a) - set(b))
    sobran = sorted(set(b) - set(a))
    difieren = sorted(r for r in set(a) & set(b) if a[r][1] != b[r][1])
    veredicto = "identico" if not (faltan or sobran or difieren) else "divergente"
    desplegado_el = None
    try:
        with open(os.path.join(destino, _MANIFIESTO_ENTREGA), "r", encoding="utf-8") as f:
            desplegado_el = json.load(f).get("desplegado")
    except Exception:
        pass
    return {"ok": True, "veredicto": veredicto, "origen": origen, "destino": destino,
            "archivos_origen": len(a), "archivos_destino": len(b),
            "faltan_en_destino": faltan[:50], "sobran_en_destino": sobran[:50], "difieren": difieren[:50],
            "desplegado_el": desplegado_el}


def h_listar_exportaciones(args):
    import hashlib
    if not os.path.isdir(EXPORTACIONES_DIR):
        return {"ok": True, "raiz": EXPORTACIONES_DIR, "exportaciones": []}
    salida = []
    for a in sorted(os.listdir(EXPORTACIONES_DIR)):
        if not a.lower().endswith(".zip"):
            continue
        ruta = os.path.join(EXPORTACIONES_DIR, a)
        try:
            with open(ruta, "rb") as f:
                firma = hashlib.sha256(f.read()).hexdigest()
            st = os.stat(ruta)
        except OSError:
            continue
        salida.append({"archivo": a, "bytes": st.st_size, "sha256": firma,
                       "cuando": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))})
    return {"ok": True, "raiz": EXPORTACIONES_DIR, "exportaciones": salida}


def h_generar_hreflang(args):
    """Idiomas declarados, no inventados: escribe los <link rel=alternate> y
    un selector minimo en cada pagina, delimitados por marcadores idempotentes.
    NO traduce contenido: si la pagina del otro idioma no existe, lo lista."""
    origen, error = _resolver(args.get("sitio") or args.get("ruta"), escribir=True)
    if error:
        return error
    if not os.path.isdir(origen):
        return {"ok": False, "error": f"{origen} no es una carpeta de sitio."}
    idiomas = args.get("idiomas")
    if not isinstance(idiomas, list) or len(idiomas) < 2:
        return {"ok": False, "error": "Faltan al menos DOS idiomas, p.ej. [\"es\", \"en\"]."}
    codigos = []
    for idio in idiomas:
        c = re.sub(r"[^a-z0-9-]", "", str(idio).strip().lower())
        if not c:
            return {"ok": False, "error": f"Idioma invalido: {idio}"}
        codigos.append(c)
    if len(set(codigos)) != len(codigos):
        return {"ok": False, "error": "Hay idiomas repetidos."}
    base = str(args.get("base_url") or "").strip().rstrip("/")
    if not re.match(r"^https?://", base):
        return {"ok": False, "error": "Falta base_url valida (http(s)://…): sin dominio no hay hreflang que valga."}
    paginas = []
    for carpeta, dirs, archivos in os.walk(origen):
        dirs[:] = [d for d in dirs if d not in _IGNORAR_ENTREGA]
        paginas += [os.path.relpath(os.path.join(carpeta, a), origen).replace(os.sep, "/")
                    for a in archivos if a.lower().endswith((".html", ".htm"))]
    if not paginas:
        return {"ok": False, "error": "El sitio no tiene paginas HTML."}
    primario = codigos[0]
    tocadas, faltan = [], []
    ini, fin = "<!-- hreflang:inicio -->", "<!-- hreflang:fin -->"
    sel_ini, sel_fin = "<!-- selector-idioma:inicio -->", "<!-- selector-idioma:fin -->"
    for pg in sorted(paginas):
        ruta = os.path.join(origen, *pg.split("/"))
        html = _leer(ruta)
        links = []
        for c in codigos:
            if c == primario:
                url = f"{base}/" if pg == "index.html" else f"{base}/{pg}"
            else:
                url = f"{base}/{c}/" if pg == "index.html" else f"{base}/{c}/{pg}"
            links.append(f'<link rel="alternate" hreflang="{_esc(c)}" href="{_esc(url)}">')
            if c != primario:
                alt = os.path.join(origen, c, *(["index.html"] if pg == "index.html" else pg.split("/")))
                if not os.path.isfile(alt):
                    faltan.append(f"{c}/{pg}")
        links.append(f'<link rel="alternate" hreflang="x-default" href="{_esc(base)}/">')
        bloque = ini + "\n  " + "\n  ".join(links) + "\n  " + fin
        if ini in html:
            html = re.sub(re.escape(ini) + r"[\s\S]*?" + re.escape(fin), bloque, html, count=1)
        else:
            html = html.replace("</head>", "  " + bloque + "\n</head>", 1)
        items = " · ".join(
            f'<a href="{_esc(base + "/" if c == primario else base + "/" + c + "/")}" hreflang="{_esc(c)}">{_esc(c.upper())}</a>'
            for c in codigos)
        selector = f'{sel_ini}\n<nav class="selector-idioma" aria-label="Idioma">{items}</nav>\n{sel_fin}'
        if sel_ini in html:
            html = re.sub(re.escape(sel_ini) + r"[\s\S]*?" + re.escape(sel_fin), selector, html, count=1)
        else:
            html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + "\n" + selector, html, count=1)
        _escribir_atomico(ruta, html)
        tocadas.append(pg)
    nota = ("No he traducido nada: hreflang sin contenido real en el otro idioma es publicidad enganosa. "
            "Crea las paginas en <idioma>/<pagina> dentro de la misma raiz y repite la herramienta para refrescar el estado.")
    if faltan:
        nota += " Faltan por crear: " + ", ".join(sorted(set(faltan))[:20]) + "."
    return {"ok": True, "paginas_tocadas": tocadas, "idiomas": codigos, "primario": primario,
            "paginas_que_faltan": sorted(set(faltan))[:50], "nota": nota}


# ============================================================
# FORJAR Y ENTREGAR — v1.24.0
# BUCLE A PRUEBA DE ERRORES de una sola orden: brief -> sitio -> auto-mejora
# por rondas hasta converger o quedar publicable -> auditoria -> ZIP FUNCIONAL
# VERIFICADO (se ABRE el zip, se comprueba su CRC, que trae index.html y que
# coincide hash a hash con el disco).
#
# POR QUE OTRA CAPA sobre forjar_desde_brief:
#   1. A PRUEBA DE ERRORES DE VERDAD: ningun paso puede tumbar la linea. Cada
#      uno corre dentro de su red (_paso_seguro); si revienta, se anota en la
#      bitacora y la forja SIGUE. Antes, una excepcion en un paso intermedio
#      dejaba al usuario sin entregable y sin diagnostico.
#   2. BUCLE POR RONDAS: forjar_desde_brief mejora UNA vez. Aqui el ciclo
#      mejora->audita se repite hasta que el arbol deja de cambiar (convergio)
#      o el sitio queda publicable, con parada honesta y su traza por ronda.
#   3. ENTREGA PROBADA, NO PROMETIDA: "entregar un ZIP" no es escribir un
#      archivo .zip; es que ese ZIP se pueda ABRIR y sea el sitio. Por eso se
#      abre, se valida su CRC, se exige index.html y se cotejan los hashes
#      contra el disco. La entrega sin prueba no es entrega (misma ley que
#      verificar_despliegue).
#
# HONESTIDAD (las tres reglas de la casa siguen mandando): el bucle NO inventa
# contenido. Un [Personaliza este texto] o un enlace roto no se resuelven
# iterando; quedan como RESERVA nombrada y el veredicto baja a
# "entregable_con_reservas" en vez de mentir "listo".
# ============================================================
MAX_RONDAS_ENTREGA = int(os.environ.get("CN_CREADOR_MAX_RONDAS") or "4")


def _paso_seguro(bitacora, nombre, fn):
    """Ejecuta un paso dentro de su red: una excepcion NO tumba la linea.
    Devuelve siempre un dict y anota el resultado (ok/error) en la bitacora."""
    try:
        res = fn()
        if not isinstance(res, dict):
            res = {"ok": bool(res)}
        entrada = {"paso": nombre, "ok": bool(res.get("ok", True))}
        if res.get("error"):
            entrada["error"] = res.get("error")
        bitacora.append(entrada)
        return res
    except Exception as e:
        detalle = "%s: %s" % (e.__class__.__name__, e)
        bitacora.append({"paso": nombre, "ok": False, "error": detalle})
        return {"ok": False, "error": detalle}


def _firma_arbol(base):
    """Huella estable de TODO el sitio (ruta + sha256 de cada archivo). Sirve
    para saber si una ronda de mejora cambio algo o si ya convergio."""
    import hashlib
    arbol = _arbol_sitio(base)
    h = hashlib.sha256()
    for rel in sorted(arbol):
        h.update(rel.encode("utf-8"))
        h.update(arbol[rel][1].encode("utf-8"))
    return h.hexdigest()


def _verificar_zip_funcional(zip_ruta, base):
    """Prueba que el ZIP sea FUNCIONAL, no solo que exista:
         - integridad CRC de cada entrada (testzip)
         - trae un index.html en la carpeta raiz del zip
         - su contenido coincide hash a hash con el sitio en disco
    Cualquier fallo se devuelve nombrado; nada de "parece que si"."""
    import zipfile
    import hashlib
    if not zip_ruta or not os.path.isfile(zip_ruta):
        return {"ok": False, "error": "El ZIP no existe en disco."}
    try:
        with zipfile.ZipFile(zip_ruta, "r") as zf:
            danada = zf.testzip()
            if danada is not None:
                return {"ok": False, "error": "CRC danado en %s" % danada}
            nombres = zf.namelist()
            if not nombres:
                return {"ok": False, "error": "El ZIP esta vacio."}
            tiene_index = any(n == "index.html" or n.endswith("/index.html") for n in nombres)
            raiz_zip = nombres[0].split("/")[0] if "/" in nombres[0] else ""
            arbol = _arbol_sitio(base)
            discrepancias = []
            for rel, meta in arbol.items():
                sha_disco = meta[1]
                interno = ("%s/%s" % (raiz_zip, rel)) if raiz_zip else rel
                try:
                    datos = zf.read(interno)
                except KeyError:
                    discrepancias.append(rel + " (falta en el zip)")
                    continue
                if hashlib.sha256(datos).hexdigest() != sha_disco:
                    discrepancias.append(rel + " (difiere del disco)")
    except zipfile.BadZipFile as e:
        return {"ok": False, "error": "ZIP ilegible: %s" % e}
    if not tiene_index:
        return {"ok": False, "error": "El ZIP no trae index.html: no es un sitio abrible."}
    if discrepancias:
        return {"ok": False, "error": "El contenido del ZIP no coincide con el disco.",
                "discrepancias": discrepancias[:20]}
    return {"ok": True, "entradas": len(nombres), "index_html": True,
            "cotejo_hash": "identico", "archivos_cotejados": len(arbol)}


def h_forjar_y_entregar(args):
    """Una orden: brief -> sitio -> bucle de mejora por rondas -> ZIP funcional.

        Paradas del bucle (honestas):
          - publicable   -> 0 errores y (si se pidio) 0 marcadores
          - convergio    -> dos rondas dejan el mismo arbol: iterar no aporta
          - max_rondas   -> se agoto el presupuesto de rondas
        Veredicto final:
          - entregable                -> publicable + ZIP integro con index.html
          - entregable_con_reservas   -> ZIP integro, pero quedan marcadores o
                                         errores que exigen mano humana
          - no_entregable             -> no se pudo producir un ZIP integro
        """
    brief = args.get("brief") if isinstance(args.get("brief"), dict) else {
        k: v for k, v in args.items() if k not in ("rondas", "salida_zip", "exigir_sin_marcadores")}
    exigir = bool(args.get("exigir_sin_marcadores") or brief.get("exigir_sin_marcadores"))
    try:
        rondas = min(int(args.get("rondas") or brief.get("rondas") or MAX_RONDAS_ENTREGA), MAX_RONDAS_ENTREGA)
    except (TypeError, ValueError):
        rondas = MAX_RONDAS_ENTREGA
    rondas = max(1, rondas)
    bitacora = []

    # 1) FORJA base: crear_sitio + PWA + OG + schema + contraste + rendimiento + 1er bucle.
    forja = _paso_seguro(bitacora, "forjar_desde_brief", lambda: h_forjar_desde_brief({"brief": brief}))
    if not forja.get("ok") or not forja.get("ruta"):
        return {"ok": False, "veredicto": "no_entregable",
                "motivo": "no se pudo crear el sitio base",
                "detalle": forja.get("error"), "bitacora": bitacora}
    sitio = forja.get("sitio")
    base = forja.get("ruta")

    # 2) BUCLE POR RONDAS: mejorar -> auditar, hasta converger o quedar publicable.
    traza_rondas = []
    parada = "max_rondas"
    firma_prev = None
    for ronda in range(1, rondas + 1):
        mejora = _paso_seguro(bitacora, "mejorar_hasta_estable#%d" % ronda,
                              lambda: h_mejorar_hasta_estable({"sitio": sitio, "exigir_sin_marcadores": exigir}))
        auditoria = _paso_seguro(bitacora, "auditar_sitio#%d" % ronda,
                                 lambda: h_auditar_sitio({"sitio": sitio}))
        firma = _firma_arbol(base)
        errores = (auditoria.get("total") or {}).get("error")
        marcadores = auditoria.get("marcadores_sin_rellenar") or 0
        traza_rondas.append({"ronda": ronda, "parada_bucle": mejora.get("parada"),
                             "errores": errores, "marcadores": marcadores,
                             "veredicto": auditoria.get("veredicto")})
        publicable = (errores == 0) and (not exigir or marcadores == 0)
        if publicable:
            parada = "publicable"
            break
        if firma_prev is not None and firma == firma_prev:
            parada = "convergio"
            break
        firma_prev = firma

    # 3) AUDITORIA FINAL: fuente de verdad para el veredicto.
    final = _paso_seguro(bitacora, "auditar_sitio_final", lambda: h_auditar_sitio({"sitio": sitio}))
    errores_final = (final.get("total") or {}).get("error")
    if errores_final is None:
        errores_final = 1  # sin auditoria fiable, no se presume limpio
    marcadores_final = final.get("marcadores_sin_rellenar") or 0

    # 4) EXPORTAR el ZIP determinista.
    salida_zip = str(args.get("salida_zip") or brief.get("salida_zip") or "").strip() or ("%s.zip" % _slug(sitio, 40))
    exportado = _paso_seguro(bitacora, "exportar_sitio_zip",
                             lambda: h_exportar_sitio_zip({"sitio": sitio, "salida": salida_zip}))
    if not exportado.get("ok") or not exportado.get("zip"):
        return {"ok": False, "veredicto": "no_entregable", "sitio": sitio, "ruta": base,
                "parada_bucle": parada, "rondas": traza_rondas,
                "motivo": "no se pudo empaquetar el ZIP", "detalle": exportado.get("error"),
                "bitacora": bitacora}
    zip_ruta = exportado.get("zip")

    # 5) VERIFICAR que el ZIP es FUNCIONAL (abrir + CRC + index.html + cotejo hash).
    verificacion = _paso_seguro(bitacora, "verificar_zip",
                                lambda: _verificar_zip_funcional(zip_ruta, base))
    zip_integro = bool(verificacion.get("ok"))

    # 6) VEREDICTO.
    limpio = (errores_final == 0) and (not exigir or marcadores_final == 0)
    if not zip_integro:
        veredicto = "no_entregable"
    elif limpio and marcadores_final == 0:
        veredicto = "entregable"
    else:
        veredicto = "entregable_con_reservas"

    reservas = []
    if errores_final and errores_final > 0:
        reservas.append("%d errores de auditoria sin resolver" % errores_final)
    if marcadores_final > 0:
        reservas.append("%d [Personaliza este texto] sin rellenar (el bucle NO inventa contenido)" % marcadores_final)

    siguiente = ("Publicable: revisa con lector de pantalla y Lighthouse antes de subir el ZIP."
                 if veredicto == "entregable" else
                 "El ZIP esta integro pero quedan reservas: rellena los marcadores o corrige los errores listados. "
                 "El bucle no los inventa por ti."
                 if veredicto == "entregable_con_reservas" else
                 "No hay entregable integro: revisa la bitacora y el motivo.")

    return {"ok": True, "veredicto": veredicto, "sitio": sitio, "ruta": base,
            "zip": zip_ruta, "sha256": exportado.get("sha256"), "bytes": exportado.get("bytes"),
            "archivos_en_zip": exportado.get("archivos"),
            "parada_bucle": parada, "rondas_corridas": len(traza_rondas), "rondas": traza_rondas,
            "verificacion_zip": verificacion,
            "auditoria_final": {"errores": errores_final,
                                "avisos": (final.get("total") or {}).get("aviso"),
                                "marcadores": marcadores_final, "veredicto": final.get("veredicto")},
            "reservas": reservas, "bitacora": bitacora, "siguiente_paso": siguiente,
            "aviso": "Bucle a prueba de errores: ningun paso tumba la linea (cada uno va en su red) y el ZIP "
                     "no se da por bueno sin abrirlo, comprobar su CRC y cotejar su contenido con el disco."}


# ============================================================
# RUTA DE TRABAJO: PLAN (v1.24.0)
# ------------------------------------------------------------
# La orden inicial define QUÉ hay que hacer. Primero el PLAN: se enumeran y se
# VALIDAN todos los archivos ANTES de crearlos (ruta segura, tipo conocido, sin
# duplicados, con una herramienta que exista). Solo cuando la lista requerida
# está clara se lanzan varios artefactos a la vez, en segundo plano, cada uno en
# su bucle de autocorrección. "Conciencias en paralelo" = hilos que se solapan
# de verdad (escribir/leer archivos libera el GIL) y cuyo solape se MIDE, no se
# promete. Filosofía de la casa: medir/probar, no prometer.
# ============================================================
LOTE_PARALELO_MIN = 4
LOTE_PARALELO_MAX = 6
LOTE_PARALELO_DEF = 5
MAX_CORRECCIONES_ARTEFACTO = int(os.environ.get("CN_CREADOR_MAX_CORRECCIONES") or "4")
TIPOS_ARCHIVO_CONOCIDOS = {"html", "htm", "css", "js", "json", "md", "txt", "svg", "xml", "webmanifest"}


def h_crear_archivo(args):
    """Escribe UN archivo dentro de un sitio, con ruta validada. NO toca la
    navegación ni el sitemap: es race-free y por eso sirve para crear en
    paralelo. No inventa contenido: si no pasas `contenido`, deja un marcador
    honesto para que el humano lo rellene."""
    import hashlib
    sitio = args.get("sitio") or args.get("nombre")
    base, error = _resolver(sitio, escribir=True)
    if error:
        return error
    base = base if os.path.isdir(base) else os.path.dirname(base)
    rel = str(args.get("ruta") or "").strip().replace("\\", "/")
    if not rel:
        return {"ok": False, "error": "Falta la ruta del archivo dentro del sitio."}
    if rel.startswith("/") or ".." in rel.split("/") or os.path.isabs(rel):
        return {"ok": False, "error": "Ruta insegura: no se permiten '..', rutas absolutas ni fugas."}
    if not re.match(r"^[A-Za-z0-9._\-/]+$", rel):
        return {"ok": False, "error": "La ruta tiene caracteres no permitidos (usa letras, numeros, . _ - /)."}
    destino_real = os.path.realpath(os.path.join(base, rel))
    if not _dentro_de(destino_real, os.path.realpath(base)):
        return {"ok": False, "error": "La ruta escapa de la carpeta del sitio."}
    ext = rel.rsplit(".", 1)[-1].lower() if "." in os.path.basename(rel) else ""
    if ext and ext not in TIPOS_ARCHIVO_CONOCIDOS:
        return {"ok": False, "error": "Tipo de archivo no reconocido: .%s" % ext}
    contenido = args.get("contenido")
    marcador = contenido is None
    if marcador:
        contenido = "<!-- [Personaliza este texto] -->\n" if ext in ("html", "htm") else "[Personaliza este texto]\n"
    contenido = str(contenido)
    if len(contenido.encode("utf-8")) > TOPE_BYTES_ARCHIVO:
        return {"ok": False, "error": "El contenido supera el tope de %d bytes." % TOPE_BYTES_ARCHIVO}
    existia = os.path.isfile(destino_real)
    if existia and not bool(args.get("sobrescribir")):
        return {"ok": False, "error": "El archivo ya existe: pasa sobrescribir:true para reemplazarlo."}
    _escribir_atomico(destino_real, contenido)
    return {"ok": True, "archivo": destino_real, "ruta": rel, "tipo": ext or "sin-extension",
            "bytes": len(contenido.encode("utf-8")),
            "sha256": hashlib.sha256(contenido.encode("utf-8")).hexdigest(),
            "sobrescrito": existia,
            "aviso": ("Marcador honesto: no pasaste contenido, quedo [Personaliza este texto]."
                      if marcador else "Contenido escrito tal cual lo pasaste (sin inventar nada).")}


def _validar_artefacto(art, vistos):
    """Valida UN artefacto ANTES de crearlo. Devuelve (ok, motivos, normalizado).
    Reglas: ruta segura y Única, tipo conocido y una herramienta que EXISTA para
    construirlo. Nada se crea si no pasa: se marca bloqueado con su motivo."""
    motivos = []
    if not isinstance(art, dict):
        return False, ["el artefacto no es un objeto {ruta,...}"], {}
    rel = str(art.get("ruta") or "").strip().replace("\\", "/")
    if not rel:
        motivos.append("falta la ruta")
    elif rel.startswith("/") or ".." in rel.split("/") or os.path.isabs(rel):
        motivos.append("ruta insegura ('..', absoluta o con fuga)")
    elif not re.match(r"^[A-Za-z0-9._\-/]+$", rel):
        motivos.append("la ruta tiene caracteres no permitidos")
    elif rel in vistos:
        motivos.append("ruta duplicada en el plan")
    ext = rel.rsplit(".", 1)[-1].lower() if ("." in os.path.basename(rel)) else ""
    tipo = str(art.get("tipo") or ext or "").lower()
    if tipo and tipo not in TIPOS_ARCHIVO_CONOCIDOS:
        motivos.append("tipo no reconocido: %s" % tipo)
    tool = str(art.get("tool") or "crear_archivo")
    if tool not in EJECUTORES:
        motivos.append("no hay herramienta '%s' para construirlo" % tool)
    norm = {"id": str(art.get("id") or rel or "artefacto"),
            "ruta": rel, "tipo": tipo or "sin-extension", "tool": tool,
            "arguments": art.get("arguments") if isinstance(art.get("arguments"), dict) else {},
            "contenido": art.get("contenido"),
            "requisito": art.get("requisito")}
    if not motivos and rel:
        vistos.add(rel)
    return (len(motivos) == 0), motivos, norm


def h_planificar_ruta_trabajo(args):
    """RUTA DE TRABAJO: PLAN. Desde la orden inicial documenta la lista de
    requisitos y TODOS los archivos a crear, los VALIDA antes de crear nada y
    agrupa lo validado en lotes paralelos (4-6) para segundo plano. Honesto: si
    algo está sin aclarar o hay artefactos bloqueados, NO da luz verde."""
    orden = str(args.get("orden") or args.get("brief") or "").strip()
    nombre = str(args.get("nombre") or "proyecto").strip()
    requisitos = [str(r).strip() for r in (args.get("requisitos") or []) if str(r).strip()]
    entrada = args.get("artefactos") if isinstance(args.get("artefactos"), list) else []
    try:
        tam = int(args.get("tamano_lote") or LOTE_PARALELO_DEF)
    except (TypeError, ValueError):
        tam = LOTE_PARALELO_DEF
    tam = max(LOTE_PARALELO_MIN, min(LOTE_PARALELO_MAX, tam))

    pendientes = []
    if not orden:
        pendientes.append("Falta la ORDEN inicial: sin ella el plan no sabe que construir.")
    if not entrada:
        pendientes.append("No se enumero ningun archivo a crear (artefactos): un plan vacio no se lanza.")

    validados, bloqueados, vistos = [], [], set()
    for art in entrada:
        ok, motivos, norm = _validar_artefacto(art, vistos)
        if ok:
            validados.append(norm)
        else:
            bloqueados.append({**norm, "motivos": motivos})

    lista_requerida = []
    for r in requisitos:
        lista_requerida.append({"requisito": r, "completo": False, "fuente": "usuario"})
    for v in validados:
        lista_requerida.append({"requisito": "existe y valida: %s" % v["ruta"],
                                "completo": False, "fuente": "archivo", "ruta": v["ruta"]})

    lotes = [validados[i:i + tam] for i in range(0, len(validados), tam)]

    tareas = []
    for i, lote in enumerate(lotes, 1):
        rutas = ", ".join(a["ruta"] for a in lote)
        tareas.append({"id": "lote%d" % i,
                       "description": "Crear en paralelo (%d archivos): %s" % (len(lote), rutas)})
    if lotes:
        tareas.append({"id": "validacion_final",
                       "description": "Auto-validar en bucle hasta que la lista requerida este completa y entregar"})

    if bloqueados:
        pendientes.append("%d artefactos bloqueados por validacion: corrigelos antes de lanzar." % len(bloqueados))

    listo = (len(pendientes) == 0) and (len(validados) > 0) and (len(bloqueados) == 0)

    return {"ok": True, "servicio": NOMBRE_SERVICIO, "capa": "ruta_de_trabajo:plan",
            "orden": orden, "nombre": nombre,
            "tamano_lote": tam, "lotes": len(lotes),
            "artefactos_validados": validados,
            "artefactos_bloqueados": bloqueados,
            "lista_requerida": lista_requerida,
            "pendientes_de_aclarar": pendientes,
            "listo_para_lanzar": listo,
            "set_plan": {"tasks": tareas},
            "plan_paralelo": [[a["ruta"] for a in lote] for lote in lotes],
            "como_sigue": ("Todo claro: llama a ejecutar_ruta_paralelo con estos mismos artefactos para "
                           "crearlos en segundo plano y autovalidarlos en bucle."
                           if listo else
                           "AUN NO se lanza: resuelve 'pendientes_de_aclarar'. Primero la ruta, luego el paralelo."),
            "aviso": "El plan VALIDA antes de crear: ningun archivo se escribe en esta fase. La lista requerida "
                     "empieza incompleta a proposito; se cierra al ejecutar y validar, no antes."}


def _forjar_artefacto_autovalidado(sitio, art, max_correcciones):
    """Crea UN artefacto y lo autovalida en BUCLE: audita -> si hay errores
    corregibles, corrige (mejorar_pagina) -> reaudita, hasta quedar limpio o
    agotar el presupuesto. Cada paso en su red: nunca tumba el hilo. Devuelve
    veredicto por archivo: valido / valido_con_reservas / fallido."""
    import time as _t
    t0 = _t.time()
    bitacora = []
    tool = art.get("tool") or "crear_archivo"
    fn = EJECUTORES.get(tool)
    if fn is None:
        return {"ruta": art.get("ruta"), "veredicto": "fallido",
                "motivo": "sin herramienta '%s'" % tool, "t_ini": t0, "t_fin": _t.time()}
    argumentos = dict(art.get("arguments") or {})
    argumentos.setdefault("sitio", sitio)
    argumentos.setdefault("ruta", art.get("ruta"))
    if art.get("contenido") is not None:
        argumentos.setdefault("contenido", art.get("contenido"))
    argumentos.setdefault("sobrescribir", True)

    creado = _paso_seguro(bitacora, "crear:%s" % art.get("ruta"), lambda: fn(argumentos))
    if not creado.get("ok"):
        return {"ruta": art.get("ruta"), "veredicto": "fallido",
                "motivo": creado.get("error") or "no se pudo crear", "bitacora": bitacora,
                "t_ini": t0, "t_fin": _t.time()}

    ruta_creada = creado.get("archivo") or creado.get("pagina") or creado.get("ruta")
    tipo = str(art.get("tipo") or "").lower()
    if not tipo and isinstance(art.get("ruta"), str) and "." in art["ruta"]:
        tipo = art["ruta"].rsplit(".", 1)[-1].lower()

    reservas = []
    errores = 0
    correcciones = 0
    if tipo in ("html", "htm"):
        for i in range(1, max(1, max_correcciones) + 1):
            aud = _paso_seguro(bitacora, "auditar#%d" % i,
                               lambda: h_auditar_pagina({"archivo": ruta_creada}))
            conteo = aud.get("conteo") or {}
            errores = conteo.get("error") or 0
            marc = aud.get("marcadores_sin_rellenar") or conteo.get("marcador") or 0
            if errores == 0:
                if marc:
                    reservas.append("%d marcador(es) sin rellenar" % marc)
                break
            mej = _paso_seguro(bitacora, "corregir#%d" % i,
                               lambda: h_mejorar_pagina({"archivo": ruta_creada, "aplicar": True}))
            correcciones += 1
            if not mej.get("ok"):
                reservas.append("la correccion no pudo aplicarse: %s" % mej.get("error"))
                break
    elif tipo == "json":
        try:
            with open(ruta_creada, "r", encoding="utf-8") as f:
                json.load(f)
        except Exception as e:
            errores = 1
            reservas.append("JSON invalido: %s" % e)
    else:
        try:
            with open(ruta_creada, "r", encoding="utf-8", errors="replace") as f:
                cuerpo = f.read()
            if not cuerpo.strip():
                reservas.append("archivo vacio (contenido no aportado)")
            if "\x00" in cuerpo:
                errores = 1
                reservas.append("bytes nulos: archivo binario/corrupto")
        except Exception as e:
            errores = 1
            reservas.append("no legible: %s" % e)

    if errores and errores > 0:
        veredicto = "fallido"
    elif reservas:
        veredicto = "valido_con_reservas"
    else:
        veredicto = "valido"
    return {"ruta": art.get("ruta"), "archivo": ruta_creada, "tipo": tipo or "sin-extension",
            "veredicto": veredicto, "errores": errores, "correcciones": correcciones,
            "reservas": reservas, "bitacora": bitacora, "t_ini": t0, "t_fin": _t.time()}


class MedidorSolape(object):
    """CUENTA HILOS EN VILO EN EL MOMENTO: el pico se ve cuando ocurre.

    v1.86.2 · por que existe. La medicion anterior NO media el pico: lo
    RECONSTRUÍA a posteriori ordenando los (t_ini, +1) / (t_fin, -1) de cada
    artefacto. El desempate de sort() de Python pone el -1 antes que el +1
    cuando dos hilos caen en el MISMO tick del reloj, o sea: resta una salida
    antes de sumar la entrada. No es teoria -- con seis artefactos verdaderamente
    solapados en un unico tick, el reconstructor informa **0** (verificado por
    construccion). Un numero que depende de en que tick cae cada hilo no es una
    medicion. Aqui no hay reconstruccion: cada hilo declara su entrada y su
    salida bajo un lock y el pico es lo que se vio, ni un pelo mas.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.activos = 0
        self.pico = 0

    def entrar(self):
        with self._lock:
            self.activos += 1
            if self.activos > self.pico:
                self.pico = self.activos

    def salir(self):
        with self._lock:
            self.activos -= 1


def _forjar_midiendo(medidor, sitio, art, max_correcciones):
    """Envoltura: forja un artefacto avisando al medidor cuando esta en vuelo.
    No cambia el resultado ni el tiempo registrado; solo lo HACE VISIBLE."""
    medidor.entrar()
    try:
        return _forjar_artefacto_autovalidado(sitio, art, max_correcciones)
    finally:
        medidor.salir()


def h_ejecutar_ruta_paralelo(args):
    """Ejecuta la RUTA en SEGUNDO PLANO PARALELO: crea los artefactos validados
    en lotes de 4-6 a la vez (hilos = conciencias en paralelo), cada uno en su
    BUCLE de autocorreccion. MIDE el solape real (no lo promete) y cierra la
    lista requerida solo con lo que de verdad valido. Se NIEGA a lanzar si el
    plan no esta listo: primero la ruta, luego el paralelo."""
    from concurrent.futures import ThreadPoolExecutor

    nombre = str(args.get("nombre") or "proyecto").strip()
    sitio = args.get("sitio") or args.get("nombre")
    plan = h_planificar_ruta_trabajo(args)
    if not plan.get("ok"):
        return {"ok": False, "veredicto": "no_ejecutable", "motivo": "no se pudo planificar", "plan": plan}

    permitir_reservas = bool(args.get("permitir_reservas", True))
    if not plan.get("listo_para_lanzar") and not bool(args.get("forzar")):
        return {"ok": False, "veredicto": "no_ejecutable",
                "motivo": "el plan NO esta listo para lanzar (hay pendientes o bloqueados)",
                "pendientes_de_aclarar": plan.get("pendientes_de_aclarar"),
                "artefactos_bloqueados": plan.get("artefactos_bloqueados"),
                "sugerencia": "Resuelve el plan o pasa forzar:true a sabiendas de que se omiten los bloqueados.",
                "plan": {k: plan[k] for k in ("lotes", "tamano_lote", "listo_para_lanzar")}}

    base, error = _resolver(sitio, escribir=True)
    if error:
        return {"ok": False, "veredicto": "no_ejecutable", "motivo": error.get("error")}
    base = base if os.path.isdir(base) else os.path.dirname(base)
    if not os.path.isfile(os.path.join(base, "index.html")):
        _paso_seguro([], "crear_sitio_base",
                     lambda: h_crear_sitio({"nombre": sitio, "tipo": "landing",
                                            "titulo": args.get("titulo") or nombre}))

    try:
        tam = int(plan.get("tamano_lote") or LOTE_PARALELO_DEF)
    except (TypeError, ValueError):
        tam = LOTE_PARALELO_DEF
    try:
        max_corr = int(args.get("max_correcciones") or MAX_CORRECCIONES_ARTEFACTO)
    except (TypeError, ValueError):
        max_corr = MAX_CORRECCIONES_ARTEFACTO
    max_corr = max(1, max_corr)

    validados = plan.get("artefactos_validados") or []
    lotes = [validados[i:i + tam] for i in range(0, len(validados), tam)]

    resultados = []
    solape_max_global = 1
    trabajadores_max = 0
    for lote in lotes:
        medidor = MedidorSolape()
        trabajadores = max(1, len(lote))
        with ThreadPoolExecutor(max_workers=trabajadores) as pool:
            futuros = [pool.submit(_forjar_midiendo, medidor, sitio, a, max_corr) for a in lote]
            deste_lote = [f.result() for f in futuros]
        resultados.extend(deste_lote)
        # EL NUMERO QUE SE DECLARA ES EL CONTADO EN VILO. Los timestamps siguen
        # viajando por artefacto (son útiles para el diagnóstico de lentitud),
        # pero ya no son la vara con la que se mide si hubo o no paralelo.
        solape_max_global = max(solape_max_global, medidor.pico)
        trabajadores_max = max(trabajadores_max, trabajadores)

    ok_por_ruta = {r["ruta"]: r["veredicto"] for r in resultados}
    lista = []
    for item in plan.get("lista_requerida", []):
        ruta = item.get("ruta")
        if ruta and ruta in ok_por_ruta:
            v = ok_por_ruta[ruta]
            completo = (v == "valido") or (permitir_reservas and v == "valido_con_reservas")
        else:
            completo = False
        lista.append({**item, "completo": completo,
                      "estado": ok_por_ruta.get(ruta, "no_ligado_a_archivo")})

    total = len(resultados)
    validos = sum(1 for r in resultados if r["veredicto"] == "valido")
    con_reservas = sum(1 for r in resultados if r["veredicto"] == "valido_con_reservas")
    fallidos = sum(1 for r in resultados if r["veredicto"] == "fallido")
    lista_completa = all(x["completo"] for x in lista) if lista else False

    if fallidos == 0 and con_reservas == 0 and lista_completa:
        veredicto = "completado"
    elif fallidos == 0:
        veredicto = "completado_con_reservas"
    else:
        veredicto = "incompleto"

    return {"ok": True, "servicio": NOMBRE_SERVICIO, "capa": "ruta_de_trabajo:ejecucion",
            "veredicto": veredicto, "sitio": sitio, "ruta": base,
            "artefactos": total, "validos": validos,
            "validos_con_reservas": con_reservas, "fallidos": fallidos,
            "lotes_ejecutados": len(lotes), "tamano_lote": tam,
            "paralelismo_maximo_medido": solape_max_global,
            # CAPACIDAD y OBSERVACION son cosas distintas y se declaran separadas.
            # Decir "hay paralelo" porque el lote era de 6 es una promesa; decir
            # "vi 6 hilos en vuelo al mismo tiempo" es una medicion. Y si el SO
            # estaba saturado y los hilos pasaron de a uno, se DECLARA por que no
            # se vio solape, en vez de maquillar el numero o de poner roja una
            # suite que en realidad esta contando competencia por la CPU.
            "capacidad_de_solape": trabajadores_max,
            "conciencias_en_paralelo": ("si: %d artefactos se solaparon en el tiempo" % solape_max_global
                                        if solape_max_global > 1 else
                                        "no se observo solape: %s" % (
                                            "el lote era de 1" if trabajadores_max <= 1 else
                                            "los %d hilos del lote pasaron de uno en uno (CPU competida o creacion instantanea); la capacidad estaba ahi, la ocasion no"
                                            % trabajadores_max)),
            "lista_requerida": lista, "lista_completa": lista_completa,
            "resultados": resultados,
            "siguiente_paso": ("Todo validado y la lista requerida esta completa: listo para empaquetar/entregar."
                               if veredicto == "completado" else
                               "Quedan reservas o fallidos: revisa 'resultados'. El bucle corrige lo corregible, "
                               "no inventa el contenido que falta."),
            "aviso": "Segundo plano paralelo REAL con hilos; el solape se MIDE (no se promete). Ningun artefacto "
                     "tumba el lote: cada uno va en su red y se autovalida en bucle."}


EJECUTORES = {
    "estado_creador": h_estado_creador,
    "plantillas_disponibles": h_plantillas_disponibles,
    "crear_sitio": h_crear_sitio,
    "crear_bloque": h_crear_bloque,
    "insertar_imagen": h_insertar_imagen,
    "auditar_pagina": h_auditar_pagina,
    "auditar_sitio": h_auditar_sitio,
    "mejorar_pagina": h_mejorar_pagina,
    "crear_pwa": h_crear_pwa,
    "crear_og_image": h_crear_og_image,
    "listar_sitios": h_listar_sitios,
    "previsualizar_sitio": h_previsualizar_sitio,
    "auditar_contraste": h_auditar_contraste,
    "crear_pagina": h_crear_pagina,
    "crear_sitio_multipagina": h_crear_sitio_multipagina,
    "generar_schema_jsonld": h_generar_schema_jsonld,
    "componente_modo_oscuro": h_componente_modo_oscuro,
    "componente_consentimiento": h_componente_consentimiento,
    "formulario_destino": h_formulario_destino,
    "preflight_rendimiento": h_preflight_rendimiento,
    "mejorar_hasta_estable": h_mejorar_hasta_estable,
    "forjar_desde_brief": h_forjar_desde_brief,
    "forjar_y_entregar": h_forjar_y_entregar,
    "plan_de_construccion": h_plan_de_construccion,
    "crear_archivo": h_crear_archivo,
    "planificar_ruta_trabajo": h_planificar_ruta_trabajo,
    "ejecutar_ruta_paralelo": h_ejecutar_ruta_paralelo,
    "exportar_sitio_zip": h_exportar_sitio_zip,
    "desplegar_carpeta": h_desplegar_carpeta,
    "verificar_despliegue": h_verificar_despliegue,
    "listar_exportaciones": h_listar_exportaciones,
    "generar_hreflang": h_generar_hreflang,
}


class Manejador(BaseHTTPRequestHandler):
    server_version = f"{NOMBRE_SERVICIO}/{VERSION}"
    token_requerido = None

    def _json(self, codigo, payload):
        cuerpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        ruta = urlparse(self.path).path
        if ruta == "/tools":
            return self._json(200, {"tools": MANIFIESTO})
        if ruta == "/health":
            return self._json(200, h_estado_creador({}))
        return self._json(404, {"ok": False, "error": "Rutas: GET /tools, GET /health, POST /tools/call."})

    def do_POST(self):
        if urlparse(self.path).path != "/tools/call":
            return self._json(404, {"ok": False, "error": "Solo existe POST /tools/call."})
        if self.token_requerido and self.headers.get("X-Cerebro-Token") != self.token_requerido:
            return self._json(401, {"ok": False, "error": "X-Cerebro-Token invalido o ausente."})
        try:
            largo = min(int(self.headers.get("Content-Length") or 0), TOPE_BYTES_ARCHIVO * 4)
            peticion = json.loads(self.rfile.read(largo).decode("utf-8"))
        except Exception as e:
            return self._json(400, {"ok": False, "error": f"JSON invalido: {e}"})
        nombre = str(peticion.get("name") or "")
        ejecutor = EJECUTORES.get(nombre)
        if not ejecutor:
            return self._json(200, {"ok": False, "error": f"Herramienta desconocida: {nombre}"})
        try:
            return self._json(200, ejecutor(peticion.get("arguments") or {}))
        except Exception as e:
            return self._json(200, {"ok": False, "error": f"{e.__class__.__name__}: {e}",
                                    "aviso": "El creador fallo: el sitio NO quedo a medias porque cada archivo "
                                             "se escribe atomico. Reintenta o reporta el error tal cual."})

    def log_message(self, formato, *args):
        sys.stderr.write(f"[{NOMBRE_SERVICIO}] {self.address_string()} {formato % args}\n")


def main():
    ap = argparse.ArgumentParser(description="Pack creador de apps web para CerebroNico")
    ap.add_argument("--port", type=int, default=int(os.environ.get("CN_CREADOR_PORT") or "5102"))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--token", default=os.environ.get("CN_CREADOR_TOKEN") or None)
    ap.add_argument("--tools", action="store_true", help="imprimir el manifiesto y salir")
    args = ap.parse_args()
    if args.tools:
        print(json.dumps({"tools": MANIFIESTO}, ensure_ascii=False, indent=2))
        return 0
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"[{NOMBRE_SERVICIO}] AVISO: escuchar en {args.host} expone la escritura de archivos a la red. "
              f"Hazlo solo con --token.", file=sys.stderr)
    os.makedirs(CREADOR_ROOT, exist_ok=True)
    Manejador.token_requerido = args.token
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Manejador)
    except OSError as e:
        print(f"[{NOMBRE_SERVICIO}] No se pudo abrir {args.host}:{args.port}: {e}. "
              f"Si ya hay otro creador ahi, el pack ya esta servido.", file=sys.stderr)
        return 2
    print(f"[{NOMBRE_SERVICIO}] escuchando en http://{args.host}:{args.port} · raiz={CREADOR_ROOT} · "
          f"{len(MANIFIESTO)} herramientas")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
