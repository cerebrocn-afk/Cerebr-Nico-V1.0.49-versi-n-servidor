#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mcp_fetch.py — Servidor MCP stdio «web» de CerebroNico (Model Context Protocol).

Expone por el protocolo MCP (JSON-RPC 2.0 sobre stdio, una línea por mensaje)
cuatro herramientas de red sobre RECURSOS PÚBLICOS:

  · fetch_url        — descarga una URL pública; HTML pasa a texto legible,
                       JSON/texto se devuelve tal cual (recortado a max_chars).
  · extraer_enlaces  — devuelve los <a href> absolutos de una página (navegación).
  · buscar_web       — INVESTIGAR: busca en internet (DuckDuckGo) y devuelve
                       títulos/URLs/resúmenes. Requiere confirmar:true.
  · descargar_archivo— DESCARGAR un recurso público a la carpeta contenida
                       .mcp-descargas/ (nombre saneado, tope 25 MB). Requiere
                       confirmar:true.

Las dos capacidades nuevas (buscar_web y descargar_archivo) NO se ejecutan sin
`confirmar:true`: devuelven REQUIERE_CONFIRMACION con lo que harían, para que el
agente pida ORDEN al usuario antes de salir a la red — exactamente lo pedido:
navegar/descargar/investigar con confirmación previa.

Se conecta al puente Python (:5000) mediante `mcp_servers.json`. El puente lo
registró como pack externo:
  scripts/mcp_fetch.py → GET :5000/tools → registerExternalPack (server.ts,
  tools.config.json «puente-mcp») → tool-calling del modelo →
  POST :5000/tools/call → (stdio JSON-RPC) → fetch_url / extraer_enlaces.

DOS MODOS, MISMO PROTOCOLO:
  1. Con el SDK oficial (`pip install mcp`): usa la API de alto nivel
     Server + stdio_server (el código de ejemplo del plan).
  2. SIN dependencias (100% stdlib): implementa el transporte stdio de MCP a
     mano. La descarga SIEMPRE usa urllib: ni siquiera el modo SDK necesita
     httpx. Así el servidor arranca en cualquier Python 3.8+ (incluido 3.14
     sin ruedas del SDK), y `pip install mcp` pasa a ser opcional.

SEGURIDAD (guarda SSRF, igual de estricta que `fetch_url` del motor):
  · Solo http/https a hosts públicos. Se bloquean IPs privadas, de loopback,
    link-local, multicast y reservadas — comprobando la RESOLUCIÓN del nombre,
    no solo su forma (http://localhost.evil.com también es localhost).
  · Cada salto de redirección se re-valida: sin esto, un sitio público
    reenviaría al agente a 127.0.0.1:5000 (el propio puente).
  · Tope de bytes descargados y de tiempo; nunca se ejecuta nada del cuerpo.

Prueba manual:
  python scripts/mcp_fetch.py --tools
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"prueba","version":"0"}}}\n' | python scripts/mcp_fetch.py
"""

import hashlib
import html as _html_mod
import ipaddress
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

NOMBRE_SERVIDOR = "cerebronico-web"
VERSION_SERVIDOR = "1.1.0"   # 1.1.0 — investigar (buscar_web) + descargar_archivo, tras confirmación
PROTOCOLOS_ACEPTADOS = ("2024-11-05", "2025-03-26", "2025-06-18")

UA = "CerebroNico-MCP-Web/1.1 (puente :5000)"
# Algunos buscadores devuelven una página vacía/reto a un UA no-navegador; para
# INVESTIGAR usamos un UA de navegador (solo la búsqueda; el resto sigue con UA).
UA_NAVEGADOR = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
TIEMPO_LIMITE = 12         # segundos por salto
MAX_BYTES = 2_000_000      # nunca tragar más de 2 MB (fetch/buscar)
MAX_SALTOS = 5             # revalidación de redirecciones

# ── v1.1.0 — INVESTIGAR + DESCARGAR (bajo confirmación) ─────────────────────
# La descarga ESCRIBE en disco, así que va CONTENIDA: nunca a una ruta libre,
# siempre dentro de «.mcp-descargas/» en la raíz de la app (el nombre se
# sanea a un basename seguro). Coherente con la filosofía del puente: las
# mutaciones de fichero tienen una única puerta acotada, no «escribir donde sea».
RAIZ_APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_DESCARGAS = os.path.join(RAIZ_APP, ".mcp-descargas")
MAX_BYTES_DESCARGA = 25_000_000   # tope duro de descarga: 25 MB, nunca a medias
BUSCADOR_HTML = "https://html.duckduckgo.com/html/?q="   # sin clave, host público


# ============================================================
# GUARDA SSRF — un solo guardián, no seis copias
# ============================================================

def _ip_publica(cadena):
    try:
        ip = ipaddress.ip_address(cadena)
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 sigue siendo loopback
    return not (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def _host_permitido(host):
    """El host debe ser público. Si es IP literal se comprueba tal cual; si es
    nombre se comprueba su RESOLUCIÓN (http://localhost.evil.com también es
    localhost): todas las IPs devueltas tienen que ser públicas."""
    if not host:
        raise ValueError("la URL no tiene host")
    try:
        ipaddress.ip_address(host)
        es_literal = True
    except ValueError:
        es_literal = False
    if es_literal:
        if not _ip_publica(host):
            raise ValueError("dirección interna bloqueada por seguridad: %s" % host)
        return
    try:
        res = socket.getaddrinfo(host, None)
    except Exception:
        raise ValueError("no se pudo resolver el host: %s" % host)
    ips = {r[4][0] for r in res}
    if not ips or not all(_ip_publica(ip) for ip in ips):
        raise ValueError("el host apunta a una dirección interna: %s" % host)


def _url_valida(url):
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("http", "https"):
        raise ValueError("solo se permiten URLs http/https")
    _host_permitido(u.hostname or "")
    return u


# ============================================================
# NÚCLEO — común a los dos modos (SDK y stdlib)
# ============================================================

class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    """Convertimos los 3xx en información: la cadena de saltos se valida salto a salto."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_SinRedirecciones())


def _descargar(url, max_bytes=MAX_BYTES, ua=UA):
    """Sigue redirecciones a mano revalidando SSRF en cada salto."""
    actual = url
    vistos = set()
    for _ in range(MAX_SALTOS + 1):
        if actual in vistos:
            raise ValueError("bucle de redirecciones")
        vistos.add(actual)
        _url_valida(actual)
        req = urllib.request.Request(actual, headers={"User-Agent": ua, "Accept": "*/*"})
        try:
            resp = _OPENER.open(req, timeout=TIEMPO_LIMITE)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                loc = e.headers.get("Location") or ""
                actual = urllib.parse.urljoin(actual, loc)
                continue
            raise ValueError("HTTP %s al descargar %s" % (e.code, actual))
        except urllib.error.URLError as e:
            raise ValueError("no se pudo conectar: %s (%s)" % (getattr(e, "reason", e), actual))
        cuerpo = resp.read(max_bytes + 1)
        ctype = (resp.headers.get_content_type() or "").lower()
        charset = resp.headers.get_content_charset() or ""
        estado = resp.status
        resp.close()
        return {"estado": estado, "url_final": actual, "ctype": ctype, "charset": charset, "bytes": cuerpo}
    raise ValueError("demasiadas redirecciones (%d)" % MAX_SALTOS)


def _decargar(datos):
    charset = datos.get("charset") or ""
    cuerpo = datos.get("bytes") or b""
    if not charset and "html" in (datos.get("ctype") or ""):
        m = re.search(rb'charset=["\']?([A-Za-z0-9_.:-]+)', cuerpo[:4096])
        if m:
            charset = m.group(1).decode("ascii", errors="replace")
    try:
        return cuerpo.decode(charset or "utf-8", errors="replace")
    except LookupError:
        return cuerpo.decode("utf-8", errors="replace")


def _html_a_texto(codigo):
    """HTML → texto legible: fuera scripts/estilos/comentarios/etiquetas."""
    t = re.sub(r"(?is)<(script|style|noscript|template|svg)[^>]*>.*?</\1>", " ", codigo)
    t = re.sub(r"(?s)<!--.*?-->", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>|</tr>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = _html_mod.unescape(t)
    t = re.sub(r"data:[A-Za-z0-9_./%+;=,-]+", " ", t)  # URIs base64 larguísimas
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s*\n\s*", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _limitar(texto, max_chars):
    max_chars = max(500, min(40000, int(max_chars or 6000)))
    cortado = len(texto) > max_chars
    return (texto[:max_chars], cortado)


# ============================================================
# GUARDA DE CONFIRMACION - nada de red "costosa" sin orden explicita
# ------------------------------------------------------------
# El usuario pidio navegar / descargar / investigar SIEMPRE con confirmacion
# previa. `buscar_web` (investigar) y `descargar_archivo` (descargar) NO se
# ejecutan si no llega `confirmar:true`: devuelven ok:false con motivo
# REQUIERE_CONFIRMACION y una descripcion de lo que HARIAN, para que el modelo
# pregunte al usuario y vuelva a llamar ya confirmado. (fetch_url y
# extraer_enlaces son lectura de paginas publicas y conservan su contrato.)
# ============================================================

def _confirmado(args):
    v = (args or {}).get("confirmar")
    if v is True:
        return True
    return str(v).strip().lower() in ("true", "1", "si", "sí", "yes", "ok")


def _resultado_confirmacion(accion, detalle):
    salida = {
        "ok": False,
        "motivo": "REQUIERE_CONFIRMACION",
        "accion": accion,
        "detalle": detalle,
        "pista": ("Accion de red con salida a internet. Pide confirmacion explicita al "
                  "usuario y vuelve a llamar a esta misma herramienta con confirmar:true."),
    }
    return {"texto": json.dumps(salida, ensure_ascii=False), "error": True}


def _nombre_seguro(nombre, url):
    """Un basename seguro: mata rutas, «..» y caracteres raros. Nunca escapa."""
    cand = (nombre or "").strip()
    if not cand:
        ruta = urllib.parse.urlparse(url).path
        cand = os.path.basename(ruta) or "descarga"
    cand = os.path.basename(cand.replace("\\", "/"))     # solo el ultimo componente
    cand = re.sub(r"[^A-Za-z0-9._-]", "_", cand).strip("._")
    return (cand or "descarga")[:120]


def _decodificar_ddg(href):
    """DuckDuckGo HTML envuelve los enlaces en //duckduckgo.com/l/?uddg=<real>."""
    crudo = href if href.startswith("http") else ("https:" + href if href.startswith("//") else href)
    try:
        p = urllib.parse.urlparse(crudo)
        if "duckduckgo" in (p.netloc or "") and p.path.startswith("/l/"):
            u = (urllib.parse.parse_qs(p.query).get("uddg") or [None])[0]
            if u:
                return u
    except Exception:
        pass
    return crudo



def ejecutar_herramienta(nombre, args):
    """Dispatch común. Devuelve {"texto": str, "error": bool} — nunca lanza."""
    args = args or {}
    try:
        if nombre == "fetch_url":
            url = str(args.get("url") or "").strip()
            if not url or len(url) > 2048:
                raise ValueError("\"url\" es obligatoria (≤2048 caracteres)")
            datos = _descargar(url)
            texto = _decargar(datos)
            crudo = bool(args.get("crudo"))
            if "html" in datos["ctype"] and not crudo:
                texto = _html_a_texto(texto)
            contenido, cortado = _limitar(texto, args.get("max_chars"))
            salida = {
                "ok": 200 <= datos["estado"] < 400,
                "status": datos["estado"],
                "url": url,
                "url_final": datos["url_final"],
                "content_type": datos["ctype"],
                "truncado": cortado,
                "content": contenido,
            }
            return {"texto": json.dumps(salida, ensure_ascii=False), "error": not salida["ok"]}

        if nombre == "extraer_enlaces":
            url = str(args.get("url") or "").strip()
            if not url or len(url) > 2048:
                raise ValueError("\"url\" es obligatoria (≤2048 caracteres)")
            limite = max(1, min(100, int(args.get("max_enlaces") or 60)))
            datos = _descargar(url)
            codigo = _decargar(datos)
            vistos, enlaces = set(), []
            for m in re.finditer(r"(?is)<a\b[^>]*href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", codigo):
                href = urllib.parse.urljoin(datos["url_final"], m.group(1).strip())
                if not href.startswith(("http://", "https://")):
                    continue
                # (no resolvemos cada enlace aquí: costoso; la guarda SSRF se
                # aplica de verdad al descargar, en _url_valida)
                texto = re.sub(r"<[^>]+>", " ", m.group(2) or "")
                texto = re.sub(r"\s+", " ", _html_mod.unescape(texto)).strip()[:120]
                clave = href.split("#")[0]
                if clave in vistos:
                    continue
                vistos.add(clave)
                enlaces.append({"href": clave, "texto": texto})
                if len(enlaces) >= limite:
                    break
            salida = {
                "ok": True, "url": url, "url_final": datos["url_final"],
                "status": datos["estado"], "total": len(enlaces), "enlaces": enlaces,
            }
            return {"texto": json.dumps(salida, ensure_ascii=False), "error": False}

        if nombre == "buscar_web":
            consulta = str(args.get("consulta") or "").strip()
            if not consulta or len(consulta) > 500:
                raise ValueError("\"consulta\" es obligatoria (≤500 caracteres)")
            if not _confirmado(args):
                return _resultado_confirmacion(
                    "buscar_web", "Buscaria en internet (DuckDuckGo): «%s»" % consulta)
            limite = max(1, min(20, int(args.get("max_resultados") or 8)))
            datos = _descargar(BUSCADOR_HTML + urllib.parse.quote(consulta), ua=UA_NAVEGADOR)
            codigo = _decargar(datos)
            resultados, vistos = [], set()
            for m in re.finditer(r'(?is)<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', codigo):
                href = _decodificar_ddg(_html_mod.unescape(m.group(1).strip()))
                if not href.startswith(("http://", "https://")):
                    continue
                clave = href.split("#")[0]
                if clave in vistos:
                    continue
                vistos.add(clave)
                titulo = re.sub(r"<[^>]+>", " ", m.group(2) or "")
                titulo = re.sub(r"\s+", " ", _html_mod.unescape(titulo)).strip()[:200]
                resultados.append({"titulo": titulo, "url": clave})
                if len(resultados) >= limite:
                    break
            fragmentos = []
            for m in re.finditer(r'(?is)<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', codigo):
                s = re.sub(r"<[^>]+>", " ", m.group(1) or "")
                fragmentos.append(re.sub(r"\s+", " ", _html_mod.unescape(s)).strip()[:300])
            for i, r in enumerate(resultados):
                if i < len(fragmentos):
                    r["resumen"] = fragmentos[i]
            salida = {"ok": True, "consulta": consulta, "total": len(resultados), "resultados": resultados}
            return {"texto": json.dumps(salida, ensure_ascii=False), "error": False}

        if nombre == "descargar_archivo":
            url = str(args.get("url") or "").strip()
            if not url or len(url) > 2048:
                raise ValueError("\"url\" es obligatoria (≤2048 caracteres)")
            nombre_pedido = str(args.get("nombre") or "").strip()
            if not _confirmado(args):
                return _resultado_confirmacion(
                    "descargar_archivo",
                    "Descargaria %s y lo guardaria en la carpeta contenida .mcp-descargas/" % url)
            seguro = _nombre_seguro(nombre_pedido, url)
            datos = _descargar(url, max_bytes=MAX_BYTES_DESCARGA)
            cuerpo = datos.get("bytes") or b""
            if len(cuerpo) > MAX_BYTES_DESCARGA:
                raise ValueError("archivo demasiado grande (>%d bytes): no se guarda a medias" % MAX_BYTES_DESCARGA)
            os.makedirs(DIR_DESCARGAS, exist_ok=True)
            base, ext = os.path.splitext(seguro)
            destino = os.path.join(DIR_DESCARGAS, seguro)
            n = 1
            while os.path.exists(destino):
                destino = os.path.join(DIR_DESCARGAS, "%s(%d)%s" % (base, n, ext))
                n += 1
            raiz_real = os.path.realpath(DIR_DESCARGAS)
            if os.path.commonpath([os.path.realpath(destino), raiz_real]) != raiz_real:
                raise ValueError("destino fuera de la carpeta de descargas (bloqueado)")
            with open(destino, "wb") as f:
                f.write(cuerpo)
            salida = {
                "ok": True,
                "url": url,
                "url_final": datos["url_final"],
                "guardado_en": os.path.relpath(destino, RAIZ_APP).replace("\\", "/"),
                "carpeta": ".mcp-descargas",
                "bytes": len(cuerpo),
                "content_type": datos["ctype"],
                "sha256": hashlib.sha256(cuerpo).hexdigest(),
            }
            return {"texto": json.dumps(salida, ensure_ascii=False), "error": False}

        raise ValueError("herramienta desconocida: %s" % nombre)
    except Exception as e:
        return {"texto": json.dumps({"ok": False, "motivo": str(e), "url": (args or {}).get("url")}, ensure_ascii=False), "error": True}


TOOLS = [
    {
        "name": "fetch_url",
        "description": (
            "Obtiene el contenido de texto o HTML de una página web pública. "
            "El HTML se devuelve como texto legible (sin scripts ni estilos); JSON/texto va tal cual. "
            "Solo URLs http/https públicas — direcciones internas bloqueadas (guarda SSRF). No ejecuta scripts."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL completa a consultar"},
                "max_chars": {"type": "number", "description": "máximo de caracteres a devolver (por defecto 6000, tope 40000)"},
                "crudo": {"type": "boolean", "description": "true = devolver el HTML sin convertir a texto (por defecto false)"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "extraer_enlaces",
        "description": (
            "Descarga una página pública y lista sus enlaces <a href> (absolutos, deduplicados) "
            "para navegar de página en página. Complemento natural de fetch_url."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL completa de la página a explorar"},
                "max_enlaces": {"type": "number", "description": "máximo de enlaces a devolver (por defecto 60, tope 100)"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "buscar_web",
        "description": (
            "INVESTIGAR en internet: busca en la web (DuckDuckGo) y devuelve titulos, URLs y "
            "resumenes de los resultados. Requiere confirmar:true (accion de red bajo orden del usuario); "
            "sin confirmar responde REQUIERE_CONFIRMACION describiendo lo que haria. Sin clave; hosts publicos."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string", "description": "que buscar en internet"},
                "max_resultados": {"type": "number", "description": "maximo de resultados (por defecto 8, tope 20)"},
                "confirmar": {"type": "boolean", "description": "true = el usuario YA autorizo esta busqueda de red (obligatorio para ejecutar)"},
            },
            "required": ["consulta"],
        },
    },
    {
        "name": "descargar_archivo",
        "description": (
            "DESCARGAR un recurso publico (http/https) y guardarlo en la carpeta contenida .mcp-descargas/ "
            "de la app (nombre saneado, sin salir de esa carpeta, tope 25 MB, guarda SSRF). Requiere confirmar:true "
            "(accion de red+disco bajo orden del usuario); sin confirmar responde REQUIERE_CONFIRMACION. Devuelve ruta, bytes y sha256."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL completa del recurso a descargar"},
                "nombre": {"type": "string", "description": "nombre de archivo deseado (opcional; se sanea a un basename seguro)"},
                "confirmar": {"type": "boolean", "description": "true = el usuario YA autorizo esta descarga (obligatorio para ejecutar)"},
            },
            "required": ["url"],
        },
    },
]


# ============================================================
# MODO 1 — SDK oficial (si está instalado)
# ------------------------------------------------------------
# El SDK cambió de API en su versión 2: `FastMCP` pasó a llamarse `MCPServer`.
# Se prueba primero la API v2, luego la v1 (el ejemplo del plan) y, si ninguna
# arranca, main() cae al modo stdlib: el protocolo es idéntico en los tres.
# ============================================================

def correr_con_sdk():
    try:
        from mcp.server.mcpserver import MCPServer  # SDK >= 2
    except ImportError:
        return _correr_con_sdk_v1()

    from mcp.server.mcpserver.exceptions import ToolError

    app = MCPServer(name=NOMBRE_SERVIDOR,
                    description="Navegación web y recuperación de páginas públicas (CerebroNico).")

    def _devolver(resul):
        # El motivo del fallo viaja DENTRO del texto (JSON con ok:false) y el
        # ToolError marca isError:true: el puente y el motor ven lo mismo que en
        # el modo stdlib (SDK 2.x convierte la excepción en ese resultado).
        if resul["error"]:
            raise ToolError(resul["texto"])
        return resul["texto"]

    @app.tool(name="fetch_url", description=TOOLS[0]["description"])
    def _fetch(url: str, max_chars: int = 6000, crudo: bool = False) -> str:
        return _devolver(ejecutar_herramienta("fetch_url", {"url": url, "max_chars": max_chars, "crudo": crudo}))

    @app.tool(name="extraer_enlaces", description=TOOLS[1]["description"])
    def _enlaces(url: str, max_enlaces: int = 60) -> str:
        return _devolver(ejecutar_herramienta("extraer_enlaces", {"url": url, "max_enlaces": max_enlaces}))

    @app.tool(name="buscar_web", description=TOOLS[2]["description"])
    def _buscar(consulta: str, max_resultados: int = 8, confirmar: bool = False) -> str:
        return _devolver(ejecutar_herramienta("buscar_web", {"consulta": consulta, "max_resultados": max_resultados, "confirmar": confirmar}))

    @app.tool(name="descargar_archivo", description=TOOLS[3]["description"])
    def _descargar_arch(url: str, nombre: str = "", confirmar: bool = False) -> str:
        return _devolver(ejecutar_herramienta("descargar_archivo", {"url": url, "nombre": nombre, "confirmar": confirmar}))

    app.run(transport="stdio")


def _correr_con_sdk_v1():
    import asyncio

    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import TextContent, Tool

    app = Server(NOMBRE_SERVIDOR)

    @app.list_tools()
    async def list_tools():
        return [Tool(name=t["name"], description=t["description"], inputSchema=t["inputSchema"]) for t in TOOLS]

    @app.call_tool()
    async def call_tool(name, arguments):
        r = ejecutar_herramienta(name, arguments or {})
        # HONESTIDAD del isError: el modo v1 antes SIEMPRE devolvía isError:false,
        # así el puente veía ok:true aunque la herramienta hubiera fallado (SSRF
        # bloqueado, REQUIERE_CONFIRMACION…). Al levantar la excepción con el texto,
        # el SDK v1 la convierte en un resultado isError:true cuyo content es ese
        # mismo JSON — idéntico al modo stdlib y al modo SDK v2.
        if r["error"]:
            raise Exception(r["texto"])
        return [TextContent(type="text", text=r["texto"])]

    async def main():
        async with stdio_server() as (read, write):
            await app.run(read, write, app.create_initialization_options())

    asyncio.run(main())


# ============================================================
# MODO 2 — 100% stdlib: JSON-RPC por líneas (transporte stdio de MCP)
# ============================================================

def _enviar(msg):
    sys.stdout.write(json.dumps(msg) + "\n")  # ensure_ascii=True: nunca depende del codepage
    sys.stdout.flush()


def _responder_error(mid, codigo, mensaje):
    _enviar({"jsonrpc": "2.0", "id": mid, "error": {"code": codigo, "message": mensaje}})


def correr_con_stdlib():
    inicializado = False
    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            msg = json.loads(linea)
        except Exception:
            _responder_error(None, -32700, "parse error")
            continue
        if not isinstance(msg, dict):
            continue
        mid = msg.get("id")
        metodo = msg.get("method")
        if mid is None or not isinstance(mid, (int, str)):
            continue  # notificación o respuesta del cliente: no se contesta
        if not isinstance(metodo, str):
            _responder_error(mid, -32600, "missing method")
            continue
        params = msg.get("params") or {}
        try:
            if metodo == "initialize":
                pedido = str(params.get("protocolVersion") or "")
                version = pedido if pedido in PROTOCOLOS_ACEPTADOS else PROTOCOLOS_ACEPTADOS[0]
                inicializado = True
                _enviar({"jsonrpc": "2.0", "id": mid, "result": {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": NOMBRE_SERVIDOR, "version": VERSION_SERVIDOR},
                }})
            elif metodo == "ping":
                _enviar({"jsonrpc": "2.0", "id": mid, "result": {}})
            elif metodo == "tools/list":
                _enviar({"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}})
            elif metodo == "tools/call":
                if not inicializado:
                    _responder_error(mid, -32002, "server not initialized")
                    continue
                nombre = str(params.get("name") or "")
                if nombre not in [t["name"] for t in TOOLS]:
                    _responder_error(mid, -32602, "Unknown tool: %s" % nombre)
                    continue
                r = ejecutar_herramienta(nombre, params.get("arguments") or {})
                _enviar({"jsonrpc": "2.0", "id": mid, "result": {
                    "content": [{"type": "text", "text": r["texto"]}],
                    "isError": bool(r["error"]),
                }})
            else:
                _responder_error(mid, -32601, "Method not found: %s" % metodo)
        except BrokenPipeError:
            break  # el puente cerró la tubería: apagar limpio
        except Exception as e:
            _responder_error(mid, -32603, "internal error: %s" % e)


# ============================================================
# ARRANQUE — SDK si está, stdlib si no; el protocolo es idéntico
# ============================================================

def main():
    if "--tools" in sys.argv:
        print(json.dumps({"name": NOMBRE_SERVIDOR, "version": VERSION_SERVIDOR, "tools": TOOLS}, ensure_ascii=False, indent=2))
        return 0
    if "--stdio" in sys.argv:
        return correr_con_stdlib()
    try:
        import mcp  # noqa: F401 — presencia del SDK oficial
    except ImportError:
        print("[mcp_fetch] SDK `mcp` no instalado: uso el transporte stdlib (100% stdlib, mismo protocolo). "
              "Para el SDK: pip install mcp", file=sys.stderr, flush=True)
        return correr_con_stdlib()
    try:
        return correr_con_sdk()
    except Exception as e:  # el SDK rompió (p. ej. 3.14 sin ruedas): no dejar al puente colgando
        print("[mcp_fetch] fallo del modo SDK (%s): reintento con stdlib" % e, file=sys.stderr, flush=True)
        return correr_con_stdlib()


if __name__ == "__main__":
    sys.exit(main() or 0)
