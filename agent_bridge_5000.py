#!/usr/bin/env python3
"""\
CerebroNico — Puente PC (agent_bridge_5000.py) v1.7.0
SEGURIDAD Y PUERTA — POR QUÉ SE CERRÓ EL SHELL
===================================================
Antes (v1.6.x) este puente ejecutaba comandos con shell=True.
Cualquiera con el token podía correr CUALQUIER cosa: rm, del,
curl|sh, redirecciones… La «seguridad» era un comentario que
decía «solo para uso local». Nunca fue suficiente.

v1.7.0 CIERRA EL SHELL: todo comando se parte en tramos,
cada binario se valida contra una lista blanca, y los
metacaracteres de shell (|, >, <, &, ;, `,$() se rechazan
ANTES de llegar a subprocess. El fail-closed es la regla:
si algo no está explícitamente permitido, se rechaza.

POR QUE SE CERRO: porque shell=True + token local no es
seguridad real. Un atacante con acceso al loopback puede
inyectar comandos arbitrarios. Ahora el puente solo ejecuta
lo que la lista blanca permite, y solo escribe donde las
raíces lo autorizan.
"""

import http.server
import json
import os
import pathlib
import re
import shlex
import shutil  # v1.94.2 · `fs_delete` ahora MUEVE a la papelera en vez de destruir
import subprocess
import sys
import time  # v2.3.24 · el lazo de reapertura necesita esperar sin dormir el proceso
import urllib.parse
from datetime import datetime, timezone

# ═══════════════════════════════════════════════════════════
# CONFIGURACIÓN Y LISTAS BLANCAS
# ═══════════════════════════════════════════════════════════

PROJECT_DIR = os.environ.get("CN_PROJECT_DIR", os.getcwd())
BRIDGE_TOKEN = os.environ.get("CN_BRIDGE_TOKEN", "")
AUDITORIA_FILE = os.path.join(PROJECT_DIR, ".cerebro-db", "auditoria.jsonl")

def _rutas_de_config():
    """v1.99.8 · LA CONFIGURACION SE BUSCA EN DOS SITIOS, NO EN UNO.

    EL DEFECTO QUE CURA (suite seguridadPuente, medido):
        PROJECT_DIR del modulo: C:\\Cerebronico      <- CN_PROJECT_DIR manda
        cwd:                    ...\\app
        tail en BINARIOS_PERMITIDOS en memoria: False
        total en memoria: 14                          <- la lista por defecto

    `PROJECT_DIR` sale de `CN_PROJECT_DIR` (la raiz de DATOS del motor), pero
    `puente-permitidos.json` vive junto al propio puente, en la INSTALACION.
    Cuando las dos rutas no coinciden —que es el caso normal, porque el motor
    fija CN_PROJECT_DIR a C:\\Cerebronico— el puente no encontraba el archivo y
    caia en la lista minima de 14 binarios SIN AVISAR. El sintoma era un
    `tail` rechazado con «no esta en la lista blanca» mientras el JSON lo tenia
    escrito en la linea 43: la configuracion existia y no se leia.

    Se prueban en orden y gana el primero que exista:
      1. PROJECT_DIR (comportamiento historico: una instalacion puede tener su
         propia config en la raiz de datos y debe seguir mandando).
      2. La carpeta del propio agent_bridge_5000.py (donde el archivo vive).
    Si no hay ninguno, `_cargar_permitidos` sigue devolviendo la lista minima:
    fail-closed intacto, nunca «permitir todo».
    """
    candidatas = [
        os.path.join(PROJECT_DIR, "puente-permitidos.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente-permitidos.json"),
    ]
    vistas = []
    for c in candidatas:
        if c not in vistas:
            vistas.append(c)
    return vistas


def _cargar_permitidos():
    cfg_path = None
    for candidata in _rutas_de_config():
        if os.path.isfile(candidata):
            cfg_path = candidata
            break
    if cfg_path is None:
        cfg_path = _rutas_de_config()[0]
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        return (
            cfg.get("binarios_permitidos", []),
            cfg.get("nativos_windows", []),
            cfg.get("raices_permitidas", []),
            cfg.get("raices_extra", []),
            cfg.get("acceso_absoluto", False),
            cfg.get("agente_pc_activo", True),
        )
    except Exception:
        pass
    return (
        ["node", "npm", "npx", "python", "python3", "pip", "git",
         "ls", "cat", "pwd", "echo", "grep", "find", "wc"],
        ["dir", "echo", "type", "where", "tasklist", "findstr", "ver"],
        [],
        [],
        False,
        True,
    )

BINARIOS_PERMITIDOS, NATIVOS_WINDOWS, RAICES_PERMITIDAS_CFG, RAICES_EXTRA, ACCESO_ABSOLUTO, AGENTE_PC_ACTIVO = _cargar_permitidos()

# v1.99.9 · NINGUNA VENTANA NEGRA POR CADA COMANDO.
# En Windows, `subprocess.run` sin `creationflags` abre una consola nueva por
# cada invocacion y la cierra al terminar: el usuario ve parpadear una ventana
# por cada pc_exec/exec del modelo. CREATE_NO_WINDOW la suprime sin cambiar
# nada de lo que el comando ve (stdout/stderr siguen capturados por pipe).
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

PROHIBIDOS_COMANDO = re.compile(r'[<>`]|&&|\|\||;|\$\(|\$\{')
PROHIBIDOS_REDIRECCION = re.compile(r'>|<')

_BLOQUEADAS_SISTEMA = [
    os.path.expanduser("~/.ssh"),
    "/etc/shadow",
    "/etc/passwd",
    "C:\\Windows\\System32",
    "C:\\Program Files",
]

def _bloqueado_sistema(ruta):
    r = os.path.realpath(ruta).lower()
    for b in _BLOQUEADAS_SISTEMA:
        if r.startswith(os.path.realpath(b).lower()):
            return True
    return False

# ═══════════════════════════════════════════════════════════
# VALIDACIÓN DE COMANDOS
# ═══════════════════════════════════════════════════════════


def _partir_tramo(tramo):
    """v1.98.5 · PARTIR UN COMANDO SIN ROMPER LAS RUTAS CON ESPACIOS.

    EL DEFECTO QUE CURA (F6, sesión 31/10): `shlex.split(tramo, posix=False)` NO
    agrupa las comillas dobles. Un comando perfectamente válido como

        findstr /N "RUTAS" "C:\\...\\Nueva carpeta\\...\\abordaje.ts"

    se partía en ['findstr', '/N', '"RUTAS"', '"C:\\...\\Nueva',
    'carpeta\\...\\abordaje.ts"'] — la ruta quedaba cortada en dos tokens y el
    `_citar` posterior ya no podía recomponerla. Resultado: «FINDSTR: No se puede
    abrir C:\\...\\Nueva» y el modelo concluyendo que el archivo no existe,
    cuando el archivo estaba perfecto. Es el mismo síntoma que el rojo de Windows
    de `new URL(...).pathname`, pero en el puente.

    En Windows se parte con este tokenizador propio: las comillas dobles agrupan,
    se eliminan del token, y `""` dentro de comillas es una comilla literal (la
    regla de cmd.exe). En POSIX se delega en shlex, que ahí sí hace lo correcto.
    """
    if os.name != "nt":
        return shlex.split(tramo, posix=True)
    partes = []
    actual = []
    entre_comillas = False
    # v1.98.11 - LA COMILLA SIMPLE TAMBIEN SE RASTREA.
    # `_partir_tramo` solo vigilaba la doble: `ls -la 'sin cerrar` pasaba la
    # validacion sin error y el rechazo llegaba despues con otro motivo (o no
    # llegaba). En cmd.exe la simple NO agrupa argumentos (eso es de sh), asi
    # que no cambia el troceo: solo se cuenta para poder responder «comilla
    # sin cerrar» cuando queda desparejada, que es lo que el modelo necesita
    # para corregir sin adivinar.
    simples = 0
    i = 0
    n = len(tramo)
    while i < n:
        c = tramo[i]
        if c == '"':
            if entre_comillas and i + 1 < n and tramo[i + 1] == '"':
                actual.append('"')
                i += 2
                continue
            entre_comillas = not entre_comillas
            i += 1
            continue
        if c == "'" and not entre_comillas:
            simples += 1
            actual.append(c)
            i += 1
            continue
        if c in " \t" and not entre_comillas:
            if actual:
                partes.append("".join(actual))
                actual = []
            i += 1
            continue
        actual.append(c)
        i += 1
    if entre_comillas:
        raise ValueError("No closing quotation")
    if simples % 2 == 1:
        raise ValueError("No closing quotation (comilla simple)")
    if actual:
        partes.append("".join(actual))
    return partes

def _validar_comando(cmd):
    # v1.98.8 · LA RECARGA TAMBIÉN VIVE AQUÍ.
    # `_recargar_permitidos_si_cambio()` solo se llamaba desde `_raiz_permitida`,
    # así que editar `binarios_permitidos` en el JSON no surtía efecto hasta
    # reiniciar el puente: la validación de comandos seguía con la lista que
    # había en memoria al importar. Síntoma exacto (suite seguridadPuente):
    # «binario «ls» no está en la lista blanca» con `ls` escrito en el JSON.
    _recargar_permitidos_si_cambio()
    if not AGENTE_PC_ACTIVO:
        return None, "agente_pc_activo=false: el puente rechaza toda ejecución."
    if re.search(r'(?<!\|)&(?!\|)', cmd):
        return None, "separador «&» suelto no permitido (puede componer en cmd.exe)"
    if PROHIBIDOS_REDIRECCION.search(cmd):
        return None, "redirección a fichero no permitida"
    if PROHIBIDOS_COMANDO.search(cmd):
        return None, "metacaracteres de shell no permitidos"
    tramos_raw = cmd.split("|")
    tramos = []
    for tramo in tramos_raw:
        tramo = tramo.strip()
        if not tramo:
            continue
        # v1.98.0 · LA COMILLA SIN CERRAR SE RESPONDE, NO SE LLORA.
        # `shlex.split` lanza ValueError("No closing quotation") y la excepción subía
        # hasta socketserver: quince renglones de traceback en la consola del usuario,
        # la conexión cortada SIN respuesta, y el modelo reintentando el mismo comando
        # cinco veces en la sesión del 31/10. Un comando mal escrito es una RESPUESTA
        # con su motivo (que el modelo puede corregir), no un accidente del puente.
        try:
            partes = _partir_tramo(tramo)
        except ValueError as e:
            return None, (
                "comando con comilla sin cerrar (%s): %s — escribí las comillas balanceadas "
                "o separá los argumentos con espacios, sin comillas" % (e, tramo[:160])
            )
        if not partes:
            return None, f"tramo vacío en: {cmd}"
        base = os.path.basename(partes[0])
        if os.name == "nt" and base in NATIVOS_WINDOWS:
            tramos.append(partes)
            continue
        if base not in BINARIOS_PERMITIDOS:
            return None, f"binario «{base}» no está en la lista blanca"
        tramos.append(partes)
    if not tramos:
        return None, "comando vacío"
    return tramos, ""


# ═══════════════════════════════════════════════════════════
# CONTENCIÓN DE RUTAS
# ═══════════════════════════════════════════════════════════

def _raices_fabrica():
    home = os.path.expanduser("~")
    raices = [
        os.path.join(home, "Cerebronico"),
        os.path.join(home, "CN"),
        os.path.join(home, "Desktop"),
        os.path.join(home, "Escritorio"),
        os.path.join(home, "Documents"),
        os.path.join(home, "Documentos"),
        os.path.join(home, "Downloads"),
        os.path.join(home, "Descargas"),
        os.path.join(PROJECT_DIR, ".proyectos"),
        PROJECT_DIR,
        os.path.join(PROJECT_DIR, "sandbox"),
        os.path.join(PROJECT_DIR, ".creador"),
        os.environ.get("TEMP", os.path.join(home, "tmp")),
    ]
    if os.name == "nt":
        raices.append(os.path.join(home, "AppData", "Local", "Temp"))
    return [r for r in raices if r]


# --- _RECARGA_CALIENTE_V1: recarga en caliente de la configuracion de raices ---
_CFG_MTIME = [None]


def _recargar_permitidos_si_cambio():
    """Relee puente-permitidos.json si su mtime cambio. Nunca lanza."""
    global BINARIOS_PERMITIDOS, NATIVOS_WINDOWS, RAICES_PERMITIDAS_CFG
    global RAICES_EXTRA, ACCESO_ABSOLUTO, AGENTE_PC_ACTIVO
    try:
        # v1.99.8 · se vigila el archivo que de verdad se carga (ver _rutas_de_config):
        # si la config vive junto al puente y no en PROJECT_DIR, mirar el primero
        # dejaba la recarga en caliente apuntando a un archivo inexistente.
        cfg_path = None
        for candidata in _rutas_de_config():
            if os.path.isfile(candidata):
                cfg_path = candidata
                break
        if cfg_path is None:
            return False
        mtime = os.path.getmtime(cfg_path)
        if _CFG_MTIME[0] == mtime:
            return False
        (BINARIOS_PERMITIDOS, NATIVOS_WINDOWS, RAICES_PERMITIDAS_CFG,
         RAICES_EXTRA, ACCESO_ABSOLUTO, AGENTE_PC_ACTIVO) = _cargar_permitidos()
        _CFG_MTIME[0] = mtime
        return True
    except Exception:
        return False


def _raiz_permitida(ruta):
    _recargar_permitidos_si_cambio()
    ruta = os.path.realpath(ruta)
    if _bloqueado_sistema(ruta):
        return False, ruta, "ruta de sistema bloqueada"
    if ACCESO_ABSOLUTO:
        return True, ruta, "acceso_absoluto=true"
    todas = list(RAICES_PERMITIDAS_CFG) + _raices_fabrica() + list(RAICES_EXTRA)
    todas_real = [os.path.realpath(r) for r in todas]
    for raiz in todas_real:
        try:
            common = os.path.commonpath([ruta, raiz])
            if common == raiz or ruta.startswith(raiz + os.sep):
                return True, ruta, f"dentro de {raiz}"
        except ValueError:
            continue
    return False, ruta, f"fuera de las raíces permitidas: {ruta}"


def resolve_pc_path(p):
    candidata = os.path.realpath(os.path.join(PROJECT_DIR, p)) if not os.path.isabs(p) else os.path.realpath(p)
    ok, r, mot = _raiz_permitida(candidata)
    if not ok:
        raise PermissionError(f"Acceso denegado: {mot}")
    return r


# ═══════════════════════════════════════════════════════════
# ORIGEN Y AUDITORÍA
# ═══════════════════════════════════════════════════════════

def _es_loopback(ip):
    return ip == "127.0.0.1" or ip == "::1" or ip == "::ffff:127.0.0.1"


def _origen_ok(headers, cliente):
    o = headers.get("Origin")
    if o is None or o == "":
        return _es_loopback(cliente)
    permitidos = ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"]
    if o in permitidos:
        return True
    try:
        from urllib.parse import urlparse
        u = urlparse(o)
        if u.hostname in ("127.0.0.1", "localhost", "::1"):
            return True
    except Exception:
        pass
    return False


def _auditar(tipo, detalle, exito, motivo=""):
    os.makedirs(os.path.dirname(AUDITORIA_FILE), exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tipo": tipo,
        "detalle": detalle,
        "exito": exito,
    }
    if motivo:
        entry["motivo"] = motivo
    try:
        with open(AUDITORIA_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════
# SERVIDOR HTTP
# ═══════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════
# LAS HERRAMIENTAS DEL PUENTE: la lista que se ANUNCIA y la tabla que se
# DESPACHA son el mismo objeto (v1.71.1). GET /tools se genera desde aquí y
# POST /tools/call resuelve desde aquí. Mientras fueron dos listas a mano, una
# de ellas (la de llamar) simplemente no existía y las seis herramientas
# anunciadas devolvían 404.
# ═══════════════════════════════════════════════════════════
HERRAMIENTAS = {
    "fs_read": {"description": "Leer archivo del PC", "input": {"path": "string"}, "op": "_op_fs_read"},
    "fs_write": {"description": "Escribir archivo de TEXTO en el PC (md, css, js, py, json, html). Para binarios —PDF, imágenes, ZIP, fuentes— USÁ fs_write_b64: acà el contenido se copia literal y un PDF escrito asì NO abre.", "input": {"path": "string", "content": "string"}, "op": "_op_fs_write"},
    "fs_write_b64": {"description": "Escribir archivo BINARIO en el PC decodificando base64 (PDF, PNG, JPG, ZIP, WOFF2). data_b64 = el archivo entero en base64, sin saltos de l\xednea. Devuelve los bytes reales written y, si es PDF, la cantidad de p\xedginas le\xedda del archivo.", "input": {"path": "string", "data_b64": "string"}, "op": "_op_fs_write_b64"},
    "fs_list": {"description": "Listar directorio", "input": {"path": "string"}, "op": "_op_fs_list"},
    "fs_delete": {"description": "Eliminar UN archivo (no carpetas). No se destruye: se mueve a .cerebro-papelera/ del mismo directorio y la respuesta devuelve la ruta de la papelera, los bytes y recuperable:true.", "input": {"path": "string"}, "op": "_op_fs_delete"},
    "fs_mkdir": {"description": "Crear directorio", "input": {"path": "string"}, "op": "_op_fs_mkdir"},
    "exec": {"description": "Ejecutar comando permitido", "input": {"command": "string"}, "op": "_op_exec"},
}


class PuenteHandler(http.server.BaseHTTPRequestHandler):

    # ═══════════════════════════════════════════════════════
    # LAS OPERACIONES: una implementación, dos puertas (v1.71.1)
    # Cada herramienta vive en un método que devuelve (código, objeto). Las
    # atienden a la vez las rutas históricas /api/fs/* y /api/exec —que siguen
    # respondiendo EXACTAMENTE lo mismo— y el despachador POST /tools/call por el
    # que llama el motor. Duplicar la lógica por puerta fue lo que permitió que
    # una de las dos puertas nunca existiera.

    def _op_fs_read(self, args):
        raw_path = args.get("path", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        if not os.path.isfile(target):
            return 404, {"error": f"Archivo no encontrado: {raw_path}"}
        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                return 200, {"ok": True, "path": target, "content": f.read()}
        except Exception as e:
            return 500, {"error": str(e)}

    def _op_fs_list(self, args):
        raw_path = args.get("path", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        try:
            return 200, {"ok": True, "path": target, "entries": os.listdir(target)}
        except Exception as e:
            return 500, {"error": str(e)}

    # v1.94.1 · UN BINARIO ESCRITO COMO TEXTO NO ABRE NUNCA.
    # El catálogo del puente exponía `fs_write` (copia el contenido literal en UTF-8)
    # y NO exponía `fs_write_b64`, aunque el operador existía más abajo: un modelo que
    # "genera un PDF" por la única vía que ve produce un `.pdf` con los streams
    # destrozados que Edge rechaza («No podemos abrir este archivo», 0 páginas) — y el
    # chat igual informa «✔ PDF generado exitosamente (45.407 bytes, 3 páginas)» porque
    # la respuesta del puente devolvía `{ok, path}` y NINGÚN dato con el que verificar.
    # Se cierran las dos mitades: la ruta equivocada se niega con la corrección dentro
    # del mensaje, y toda escritura devuelve lo que REALMENTE quedó en disco.
    EXTENSIONES_BINARIAS = (".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
                            ".zip", ".gz", ".tar", ".7z", ".woff", ".woff2", ".ttf", ".otf",
                            ".mp3", ".mp4", ".mov", ".pyc", ".so", ".dll", ".exe",
                            ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx")

    MAGICOS = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff",
               ".gif": b"GIF8", ".zip": b"PK\x03\x04", ".docx": b"PK\x03\x04",
               ".xlsx": b"PK\x03\x04", ".pptx": b"PK\x03\x04"}

    @staticmethod
    def _verificar_artefacto(ruta):
        """Lee los bytes que quedaron en disco y devuelve la verdad medible.
        `paginas` SOLO se devuelve si está leída del PDF: un número de páginas
        estimado o copiado del intento es lo que hizo que este bug se viera bien."""
        import re as _re
        try:
            with open(ruta, "rb") as f:
                cuerpo = f.read()
        except Exception as e:
            return {"ok": False, "motivo": "no se pudo releer lo escrito: %s" % e, "bytes": 0}
        tam = len(cuerpo)
        bajo = ruta.lower()
        if tam == 0:
            return {"ok": False, "motivo": "el archivo quedó vacío (0 bytes)", "bytes": 0}
        if bajo.endswith(".pdf"):
            if not cuerpo.startswith(b"%PDF-"):
                return {"ok": False,
                        "motivo": "no es un PDF: empieza con %r en vez de %%PDF-" % cuerpo[:14],
                        "bytes": tam}
            if b"%%EOF" not in cuerpo[-1024:]:
                return {"ok": False,
                        "motivo": "PDF truncado: no tiene %%EOF al final (quedó a medio "
                                  "escribir, o es texto con extensión .pdf)",
                        "bytes": tam}
            pag = len(_re.findall(rb"/Type\s*/Page(?!s)", cuerpo))
            if pag < 1:
                contadores = [int(x) for x in _re.findall(rb"/Count\s+(\d+)", cuerpo)]
                pag = max(contadores) if contadores else 0
            if pag < 1:
                return {"ok": False,
                        "motivo": "el PDF no declara ninguna página (árbol de páginas "
                                  "ausente): los lectores lo muestran como documento roto",
                        "bytes": tam}
            return {"ok": True, "bytes": tam, "paginas": pag}
        for ext, firma in PuenteHandler.MAGICOS.items():
            if bajo.endswith(ext) and not cuerpo.startswith(firma):
                return {"ok": False,
                        "motivo": "%s no tiene la firma de bytes de un %s (empezaba con %r)"
                                  % (os.path.basename(ruta), ext, cuerpo[:8]),
                        "bytes": tam}
        return {"ok": True, "bytes": tam}

    def _op_fs_write(self, args):
        raw_path = args.get("path", "")
        content = args.get("content", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        if target.lower().endswith(self.EXTENSIONES_BINARIAS):
            return 400, {
                "error": ("fs_write escribe TEXTO literal en UTF-8 y «%s» es binario: el "
                          "archivo quedaría con extensión correcta y contenido roto, que es "
                          "peor que un error. Usá fs_write_b64 con el archivo completo en "
                          "base64, o generalo con exec (p. ej. reportlab) y volvé a leerlo."
                          % os.path.basename(target)),
                "usar": "fs_write_b64",
            }
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            with open(target, "w", encoding="utf-8") as f:
                f.write(content)
            ver = self._verificar_artefacto(target)
            if not ver.get("ok"):
                return 422, {"error": ver.get("motivo"), "path": target, "bytes": ver.get("bytes", 0)}
            return 200, {"ok": True, "path": target, "bytes": ver.get("bytes", 0)}
        except Exception as e:
            return 500, {"error": str(e)}

    def _op_fs_write_b64(self, args):
        raw_path = args.get("path", "")
        b64 = args.get("data_b64", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        import base64
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            try:
                # Un `data:application/pdf;base64,...` es base64 con moño: se lo saco,
                # no le pido al modelo que lo recuerde a mitad de generación.
                texto = str(b64).strip()
                if texto.startswith("data:") and "," in texto:
                    texto = texto.split(",", 1)[1]
                crudo = base64.b64decode("".join(texto.split()))
            except Exception as e:
                return 400, {"error": "data_b64 no es base64 decodable (%s). Mandá el archivo "
                                      "completo en base64, sin envoltorios de markdown ni "
                                      "prefijos data:." % e}
            if not crudo:
                return 400, {"error": "data_b64 llegó vacío: no hay nada que escribir"}
            with open(target, "wb") as f:
                f.write(crudo)
            ver = self._verificar_artefacto(target)
            if not ver.get("ok"):
                return 422, {"error": ver.get("motivo"), "path": target, "bytes": ver.get("bytes", 0)}
            fuera = {"ok": True, "path": target, "bytes": ver.get("bytes", 0)}
            if ver.get("paginas"):
                fuera["paginas"] = ver["paginas"]
            return 200, fuera
        except Exception as e:
            return 500, {"error": str(e)}

    # v1.94.2 · fs_delete AHORA SÍ TIENE ÁREA DE SEGURIDAD POR ARCHIVO.
    # `cerrar_pc_en_area` lo admitía en un comentario: «fs_delete no puede (no hay área
    # de seguridad por archivo) — se registra, no se bloquea». Y era cierto:
    # `resolve_pc_path` encierra el ÁREA, pero adentro del área un solo `fs_delete`
    # borraba cualquier archivo para siempre y hasta carpetas con `os.rmdir`. Un modelo
    # que se equivoca con una ruta no tiene segunda oportunidad, así que el borrado pasa
    # a ser una operación con red de vuelta, como el quirófano del resto de la casa:
    #   · borrar es MOVER a `.cerebro-papelera/`, no `os.remove`;
    #   · una carpeta NO se borra con una herramienta que se llama "Eliminar archivo";
    #   · se responde dónde quedó y cuánto pesa, para que el parte sea verificable.
    PAPELERA = ".cerebro-papelera"

    @staticmethod
    def _a_papelera(archivo):
        """Ruta de destino dentro de la papelera del propio directorio. Con marca de
        tiempo y sufijo numerado: recuperar dos veces el mismo nombre no puede pisar la
        primera recuperación."""
        base = os.path.dirname(archivo) or "."
        caja = os.path.join(base, PuenteHandler.PAPELERA)
        os.makedirs(caja, exist_ok=True)
        # `datetime` ya está importado en el módulo; `time` NO, y usarlo aquí devolvía
        # 500 con «name 'time' is not defined» (detectado por la prueba funcional, no a
        # ojo): el archivo quedaba en su sitio y la papelera vacía.
        marca = datetime.now().strftime("%Y%m%d-%H%M%S")
        destino = os.path.join(caja, "%s__%s" % (marca, os.path.basename(archivo)))
        n = 1
        while os.path.exists(destino):
            n += 1
            destino = "%s.%d" % (destino, n)
        return destino

    def _op_fs_delete(self, args):
        raw_path = args.get("path", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        if not os.path.exists(target):
            return 404, {"error": "no existe lo que querés borrar: %s" % raw_path}
        if os.path.isdir(target):
            return 400, {
                "error": ("fs_delete elimina ARCHIVOS y «%s» es una carpeta. Borrar una "
                          "estructura no es una operación de un paso: mové los archivos "
                          "uno por uno, o hacelo desde el Explorador, que ahí la "
                          "confirmación la ve una persona."
                          % (os.path.basename(target.rstrip("/\\")) or target)),
                "recuperable": False,
            }
        try:
            destino = self._a_papelera(target)
            shutil.move(target, destino)
            return 200, {
                "ok": True,
                "path": target,
                "papelera": destino,
                "recuperable": True,
                "bytes": os.path.getsize(destino),
            }
        except Exception as e:
            return 500, {"error": str(e)}

    def _op_fs_mkdir(self, args):
        raw_path = args.get("path", "")
        try:
            target = self._resolver(raw_path)
        except PermissionError as e:
            return 403, {"error": str(e)}
        try:
            os.makedirs(target, exist_ok=True)
            return 200, {"ok": True, "path": target}
        except Exception as e:
            return 500, {"error": str(e)}

    def _op_exec(self, args):
        command = args.get("command", "")
        tramos, motivo = _validar_comando(command)
        if tramos is None:
            _auditar("exec", command, False, motivo)
            return 403, {"error": motivo}
        _auditar("exec", command, True)
        try:
            # v1.98.1 · shlex.quote() NO ACEPTA `posix` — solo shlex.split() lo acepta.
            # La v1.97.1 introdujo `shlex.quote(a, posix=(os.name != "nt"))` y con eso
            # TODO exec/pc_exec del puente moría con «quote() got an unexpected keyword
            # argument 'posix'» (HTTP 500 en cada llamada). El bug estaba en producción
            # desde v1.97.1 y bloqueaba por completo la ejecución de comandos.
            # Corrección: en Windows se entrecomilla a mano con comillas dobles (cmd.exe
            # no entiende las simples de shlex.quote); en POSIX se usa shlex.quote() sin
            # kwarg, que es su firma real.
            def _citar(a):
                # v1.98.2 · EN WINDOWS SOLO SE ENTRECOMILLA LO QUE LO NECESITA.
                # v1.98.1 entrecomillaba TODO argumento, incluido el nombre del
                # binario: cmd.exe recibía `"whoami"` y respondía
                # «'"whoami"' no se reconoce como un comando interno o externo».
                # El bug de shlex.quote(posix) se cambió por otro igual de letal:
                # ningún comando simple funcionaba. Regla correcta: comillas
                # dobles SOLO si el argumento trae espacio, tab o metacaracter;
                # si no, se pasa tal cual (que es lo que cmd.exe espera).
                s = str(a)
                if os.name == "nt":
                    # v1.98.3 · shlex.split(posix=False) CONSERVA las comillas en el
                    # token: `dir "C:\Cerebronico" /b` llegaba aquí como
                    # `"C:\Cerebronico"` (con comillas incluidas) y se volvía a
                    # entrecomillar → `""C:\Cerebronico""`, que cmd.exe rechaza con
                    # «El nombre de archivo, el nombre de directorio o la sintaxis de
                    # la etiqueta del volumen no son correctos». Se quitan las comillas
                    # externas ANTES de decidir, y se vuelve a entrecomillar una sola vez.
                    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
                        s = s[1:-1]
                    # v1.98.6 · F6 CERRADO DE RAÍZ. `_partir_tramo` ya entrega el
                    # token LIMPIO (sin comillas, con los espacios dentro). Lo único
                    # que falta es devolvérselo a cmd.exe entrecomillado si tiene
                    # espacios. El error de v1.98.3-v1.98.5 era ESCAPAR las comillas
                    # internas con `\\"`: cmd.exe NO usa la barra invertida como
                    # carácter de escape (eso es de sh/POSIX), así que `\\"` llegaba
                    # LITERAL al binario. Síntoma exacto: `findstr` recibía
                    # `"C:\\...\\Nueva` y respondía «No se puede abrir "C:\\...\\Nueva»
                    # — con la comilla pegada al nombre. La ruta estaba perfecta; el
                    # que la rompía era el escape. En cmd.exe una comilla doble dentro
                    # de un argumento entrecomillado se representa DUPLICÁNDOLA (`""`),
                    # no escapándola.
                    if s == "" or any(c in s for c in ' \t&|<>^()'):
                        return '"' + s.replace('"', '""') + '"'
                    return s
                return shlex.quote(s)
            # v1.98.7 · F6 CERRADO DE VERDAD: cmd.exe NO AGRUPA UN ARGUMENTO QUE
            # EMPIEZA CON «/». El comando construido era correcto —
            #     findstr /N "/C:RUTAS DEL SISTEMA" "C:\...\Nueva carpeta\...\abordaje.ts"
            # — y aun así findstr respondía «No se puede abrir DEL» y «No se puede abrir
            # SISTEMA"»: cmd.exe parte `"/C:RUTAS DEL SISTEMA"` en tres porque la comilla
            # de apertura va precedida de una barra. Es una regla del parser de cmd.exe,
            # no un fallo de _partir_tramo ni de _citar (los dos verificados aislados:
            # devuelven los 4 tokens correctos y el entrecomillado correcto).
            # La cura no es citar mejor: es NO PASAR POR cmd.exe cuando no hace falta.
            # Con un solo tramo (sin pipe) se ejecuta la lista de argumentos DIRECTA,
            # que es la vía que Windows documenta y la única que respeta los espacios
            # dentro de un argumento que empieza con «/». Con pipe sí hace falta el
            # intérprete, y ahí se conserva el entrecomillado de siempre.
            if len(tramos) == 1:
                argv = [str(a) for a in tramos[0]]
                # v1.98.9 · UN BUILTIN DE cmd.exe NO ES UN EJECUTABLE.
                # `la llamada directa ["echo", "hola"], shell=False)` no encuentra el
                # binario y la llamada CUELGA hasta el timeout de 60 s. Como el
                # HTTPServer es de un solo hilo, mientras cuelga no atiende nada
                # mas y las peticiones siguientes reciben WinError 10061. Medido:
                # `ls` y `echo` daban timeout de 20 s y mataban el servicio.
                # Regla: si el binario no existe como ejecutable y es un builtin
                # conocido, se envuelve en `cmd.exe /c`; si no existe y no es
                # builtin, se responde 400 con el motivo en vez de colgar.
                _BUILTINS_CMD = {
                    "echo", "dir", "type", "copy", "move", "del", "erase", "ren",
                    "rename", "md", "mkdir", "rd", "rmdir", "cls", "set", "cd",
                    "chdir", "ver", "vol", "date", "time", "path", "prompt",
                    "title", "color", "pause", "exit", "if", "for", "goto",
                    "call", "shift", "start", "assoc", "ftype", "pushd", "popd",
                }
                _base = os.path.basename(argv[0]).lower()
                if _base.endswith(".exe"):
                    _base = _base[:-4]
                _existe = shutil.which(argv[0]) is not None
                if not _existe and os.name == "nt" and _base in _BUILTINS_CMD:
                    argv = ["cmd.exe", "/c"] + argv
                elif not _existe and os.name == "nt":
                    return 400, {
                        "error": ("el binario «%s» no existe en el PATH y no es un builtin "
                                  "de cmd.exe: no hay nada que ejecutar" % argv[0]),
                        "pista": "usá un binario de la lista blanca que exista, o un builtin (echo, dir, type)",
                    }
            else:
                full_cmd = " | ".join(" ".join(_citar(a) for a in t) for t in tramos)
                argv = ["/bin/sh" if os.name != "nt" else "cmd.exe",
                        "-c" if os.name != "nt" else "/c", full_cmd]
            # v1.7.1 — EL HILO LECTOR NO PUEDE REVENTAR POR LA CODIFICACIÓN.
            # En Windows la salida de los comandos sale en la PÁGINA DE CÓDIGOS
            # de la consola (cp850/cp1252), no en UTF-8: trae bytes como 0xa3
            # (£) o 0xa0 (espacio duro) que NO son UTF-8 válido. Con text=True
            # y sin encoding explícito, el Python embebido decodifica en UTF-8
            # dentro de un hilo lector de subprocess y lanza UnicodeDecodeError
            # ('invalid start byte'); ese traceback inunda el stderr del puente
            # y hace parecer que el :5000 "no responde". Fijando encoding UTF-8
            # con errors="replace" el byte raro se sustituye por  y la captura
            # nunca falla — misma política tolerante que la lectura de ficheros.
            # v1.98.10 - UN SOLO PUNTO DE EJECUCION.
            # Antes habia dos subprocess.run (rama de un tramo y rama con pipe):
            # dos sitios donde timeout, encoding y captura podian divergir, y el
            # test puenteToolsCall lo vigila a proposito. Ahora se decide el argv
            # arriba y se ejecuta UNA vez, con la misma politica para las dos vias.
            result = subprocess.run(
                argv,
                capture_output=True, text=True, timeout=60, shell=False,
                encoding="utf-8", errors="replace",
                creationflags=CREATE_NO_WINDOW,
            )
            return 200, {
                "ok": True,
                "exitCode": result.returncode,
                "stdout": result.stdout[:50000],
                "stderr": result.stderr[:10000],
            }
        except subprocess.TimeoutExpired:
            return 408, {"error": "Comando excedió 60 s de timeout."}
        except Exception as e:
            return 500, {"error": str(e)}

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # El cliente cerró la conexión antes de que terminaramos de responder
            # (tipico de sondas /health con timeout corto en server.ts). NO es un
            # fallo del puente: se ignora en silencio para no inundar stderr con
            # WinError 10053. Verificado: antes esto lanzaba un traceback por sonda.
            return

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length > 0 else b""

    def _check_auth(self):
        cliente = self.client_address[0] if self.client_address else ""
        url_path = self.path
        if not _origen_ok(self.headers, cliente):
            _auditar("seguridad", url_path, False, "origen no permitido: " + str(self.headers.get("Origin", "sin Origin")))
            self._send_json(403, {"error": "Origen no permitido."})
            return False
        if BRIDGE_TOKEN:
            provided = self.headers.get("Authorization", "").replace("Bearer ", "")
            if provided != BRIDGE_TOKEN:
                _auditar("seguridad", url_path, False, "token inválido o ausente")
                self._send_json(403, {"error": "Token inválido."})
                return False
        return True

    def _resolver(self, raw_path):
        return resolve_pc_path(raw_path)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # Salud: contrato que server.ts sondea para declarar el puente "listo" y
        # para adoptar un puente preexistente. Debe ser barata y SIN auth, y
        # responder 200 rapido. Antes faltaba y toda sonda caia en el 404 final.
        if parsed.path in ("/health", "/api/health"):
            self._send_json(200, {
                "ok": True,
                "service": "cerebronico-bridge",
                "shell": False,
                "port": int(os.environ.get("CN_BRIDGE_PORT", os.environ.get("PORT", "5000"))),
            })
            return
        # v1.60.7 — VAL-ERR-001: server.ts (handlePcQuickAction) sondea esta ruta
        # para enriquecer el detalle con el Escritorio real. El puente NUNCA la
        # definió → toda consulta caía en el 404 final y el modelo lo leía como
        # «puente caído». No era un puente zombi: era una ruta que faltaba. Es
        # informativa, barata y SIN auth (igual que /api/health).
        if parsed.path in ("/pc/info", "/api/pc/info"):
            home = os.path.expanduser("~")
            desktop = ""
            for cand in (os.path.join(home, "Desktop"), os.path.join(home, "Escritorio")):
                if os.path.isdir(cand):
                    desktop = cand
                    break
            self._send_json(200, {
                "ok": True,
                "service": "cerebronico-bridge",
                "desktop": desktop,
                "home": home,
                "os": os.name,
                "platform": sys.platform,
                "project_dir": PROJECT_DIR,
                "cwd": os.getcwd(),
                "port": int(os.environ.get("CN_BRIDGE_PORT", os.environ.get("PORT", "5000"))),
            })
            return
        if parsed.path == "/api/fs/read":
            if not self._check_auth():
                return
            qs = urllib.parse.parse_qs(parsed.query)
            code, obj = self._op_fs_read({"path": qs.get("path", [""])[0]})
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/list":
            if not self._check_auth():
                return
            qs = urllib.parse.parse_qs(parsed.query)
            code, obj = self._op_fs_list({"path": qs.get("path", [""])[0]})
            self._send_json(code, obj)
            return

        if parsed.path == "/api/seguridad/estado":
            self._send_json(200, {
                "shell": False,
                "binarios": len(BINARIOS_PERMITIDOS),
                "nativos_windows": len(NATIVOS_WINDOWS),
                "acceso_absoluto": ACCESO_ABSOLUTO,
                "agente_pc_activo": AGENTE_PC_ACTIVO,
                "raices_config": len(RAICES_PERMITIDAS_CFG),
                "raices_extra": len(RAICES_EXTRA),
            })
            return

        if parsed.path == "/tools":
            # v1.71.1 — La lista se GENERA desde HERRAMIENTAS, la misma tabla que
            # usa POST /tools/call. Anunciar una herramienta que el despachador
            # no conoce es exactamente el engaño que dejó el :5000 inservible.
            self._send_json(200, {"tools": [
                {"name": n, "description": h["description"], "input": h["input"]} for n, h in HERRAMIENTAS.items()
            ]})
            return

        self._send_json(404, {"error": f"Ruta no encontrada: {self.path}"})

    def do_POST(self):
        """v1.98.0 · NINGÚN ACCIDENTE DEJA AL CLIENTE SIN RESPUESTA — la red vive en la puerta.

        `socketserver` no contesta ni negocia: si una excepción suelta escapa del
        despacho, corta la conexión, escupe el traceback en la consola del usuario y
        el IDE se queda con `fetch failed` sin motivo (log del 31/10: cinco
        `ValueError: No closing quotation` en cinco intentos del mismo comando).
        La red está ACÁ y una sola vez: las operaciones conservan su despacho por la
        tabla, sin intermediarios que dupliquen la ruta de acceso ni la auditoría.
        """
        try:
            self._post_interno()
        except PermissionError as _e:
            self._send_json(403, {"error": str(_e)})
        except Exception as _e:
            try:
                self._send_json(500, {
                    "error": "%s: %s" % (type(_e).__name__, _e),
                    "pista": "el puente sigue arriba: el error es de ESTA petición, no del servicio (no hace falta reiniciarlo)",
                })
            except Exception:
                pass  # el cliente ya se fue: no hay a quién responderle, pero tampoco un traceback

    def _post_interno(self):
        if not self._check_auth():
            return
        parsed = urllib.parse.urlparse(self.path)
        body = self._read_body()
        try:
            data = json.loads(body) if body else {}
        except Exception:
            self._send_json(400, {"error": "JSON inválido."})
            return

        # v1.71.1 · LA PUERTA QUE FALTABA: POST /tools/call.
        # server.ts registra el puente como PACK MCP y llama a las herramientas
        # por aquí (`fetch(`${rp.url}/tools/call}`, body {name, arguments}):
        # línea ~3266 del ejecutor de herramientas). El puente respondía
        # 404 «Ruta no encontrada» a TODAS: GET /tools anunciaba 6 herramientas
        # y POST /tools/call no existía, así que ninguna era utilizable. Es el
        # mismo defecto de contrato que la casa ya fijó como trampa en
        # packDocumentos («spec declarada != caso despachado»), y aquí en
        # producción: «fs_write» se listaba y moría en 404.
        # El despachador NO reimplementa nada: llama a los mismos _op_* que
        # atienden /api/fs/*, así que rutas, permisos, auditoría y respuestas
        # son idénticas por las dos vías.
        if parsed.path == "/tools/call":
            nombre = data.get("name", "") if isinstance(data, dict) else ""
            args = data.get("arguments")
            if args is None:
                args = {}
            if not isinstance(args, dict):
                self._send_json(400, {"error": "`arguments` debe ser un objeto."})
                return
            herramienta = HERRAMIENTAS.get(nombre)
            if herramienta is None:
                _auditar("tools/call", str(nombre), False, "herramienta desconocida")
                self._send_json(404, {
                    "error": f"Herramienta desconocida: {nombre}",
                    "disponibles": sorted(HERRAMIENTAS.keys()),
                })
                return
            code, obj = getattr(self, herramienta["op"])(args)  # la tabla es el único despacho
            _auditar("tools/call", str(nombre), code < 400)
            self._send_json(code, obj)
            return

        # v1.87.1 · EL MISMO DEFECTO DE CONTRATO, DEL OTRO LADO (sesión
        # 1793219578712, mensaje 15: «❌ No pude listar: Ruta no encontrada:
        # /api/fs/list»). `server.ts` llama por `bridgeFetch(path, {path})`, que
        # hace POST en cuanto hay cuerpo — y estas dos operaciones solo existían
        # en do_GET. Resultado: leer y listar el proyecto/escritorio morían en
        # 404 mientras escribir funcionaba. El modelo entraba en bucle
        # («Estoy en un bucle con pc_list_dir») porque la herramienta existía,
        # se anunciaba y no contestaba. Ahora las dos vías comparten los mismos
        # `_op_fs_*`: GET con query string (compatibilidad) y POST con JSON.
        if parsed.path == "/api/fs/read":
            code, obj = self._op_fs_read({"path": data.get("path", "") if isinstance(data, dict) else ""})
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/list":
            code, obj = self._op_fs_list({"path": data.get("path", "") if isinstance(data, dict) else ""})
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/write":
            code, obj = self._op_fs_write(data)
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/write_b64":
            code, obj = self._op_fs_write_b64(data)
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/delete":
            code, obj = self._op_fs_delete(data)
            self._send_json(code, obj)
            return

        if parsed.path == "/api/fs/mkdir":
            code, obj = self._op_fs_mkdir(data)
            self._send_json(code, obj)
            return

        if parsed.path == "/api/exec":
            code, obj = self._op_exec(data)  # v1.98.0 · la comilla sin cerrar se responde con 403 dentro de _validar_comando
            self._send_json(code, obj)
            return

        self._send_json(404, {"error": f"Ruta no encontrada: {self.path}"})

    def log_message(self, fmt, *args):
        pass


# ═══════════════════════════════════════════════════════════
# v1.98.12 · SERVIDOR MULTIHILO — EL CUELGUE TIENE CAUSA Y TIENE CURA
# ═══════════════════════════════════════════════════════════
# EL DEFECTO QUE CURA (sesión 31/10, reproducido tres veces):
#   `http.server.HTTPServer` hereda de `socketserver.TCPServer` SIN
#   `ThreadingMixIn`: es de UN SOLO HILO. Mientras una petición está en curso
#   —y `_op_exec` puede tardar hasta 60 s por su timeout— el servidor NO ACEPTA
#   NINGUNA OTRA CONEXIÓN. Las que llegan se acumulan en el backlog del socket
#   hasta llenarlo, y entonces Windows responde «conexión rechazada» (10061).
#   El puerto 5000 quedaba ACEPTANDO TCP y SIN RESPONDER a /health: no era un
#   zombi, era un servidor ocupado que nunca volvía. El propio código lo
#   documentaba en el comentario de v1.98.9 y no lo había corregido.
#
#   Con `ThreadingHTTPServer` cada petición corre en su hilo: una consulta
#   lenta ya no bloquea al servicio entero. `daemon_threads = True` evita que
#   un hilo colgado impida al proceso terminar.
#
# SEGUNDO DEFECTO, el que lo volvía PERMANENTE:
#   `HTTPServer.allow_reuse_address = 1`. En POSIX eso reusa un socket en
#   TIME_WAIT. En WINDOWS, SO_REUSEADDR significa otra cosa: permite que un
#   SEGUNDO proceso se enganche a un puerto YA OCUPADO. Por eso cada
#   relanzamiento mostraba un PID nuevo en :5000 mientras el viejo seguía vivo
#   con el socket, y las conexiones iban al zombi. El puerto parecía ocupado
#   por un proceso distinto cada vez.
#   En Windows se apaga y se usa SO_EXCLUSIVEADDRUSE: puerto ocupado = error
#   honesto al arrancar, en vez de un arranque falso que no atiende.
# v2.3.24 · PLAZO POR CONEXIÓN (30 s). `BaseHTTPRequestHandler` sin `timeout`
# espera PARA SIEMPRE a que el cliente mande la petición. Un cliente que abre el
# socket y no escribe (un escáner, un navegador con keep-alive abandonado, un
# fetch abortado del lado del IDE a mitad) deja un hilo clavado `recv()` que
# nunca se libera. Con `daemon_threads=True` el proceso no se muere por eso, pero
# la acumulacion se ve como «el 5000 va lento» hasta que algo lo reinicia.
# 30 s es holgado: el `exec` mas largo del puente tiene su propio timeout de 60 s
# y ese NO es el camino que se corta aca (la petición ya llego completa).
PuenteHandler.timeout = 30


class PuenteServidor(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = (os.name != "nt")

    def server_bind(self):
        if os.name == "nt":
            import socket as _socket
            try:
                self.socket.setsockopt(
                    _socket.SOL_SOCKET, _socket.SO_EXCLUSIVEADDRUSE, 1
                )
            except (AttributeError, OSError):
                # SO_EXCLUSIVEADDRUSE no existe en todas las versiones de
                # Windows/Python: si falta, allow_reuse_address=False ya cubre
                # el caso. No se aborta el arranque por esto.
                pass
        super().server_bind()


def main():
    port = int(os.environ.get("CN_BRIDGE_PORT", "5000"))
    try:
        server = PuenteServidor(("127.0.0.1", port), PuenteHandler)
    except OSError as e:
        # v1.98.12 · UN PUERTO OCUPADO SE DICE, NO SE FINGE.
        # Antes, con allow_reuse_address=1, el segundo proceso «arrancaba» y
        # las conexiones seguían yendo al primero. El usuario veía un puente
        # que no respondía y no había forma de saber por qué.
        print(f"[CerebroNico Puente] NO SE PUDO ARRANCAR en 127.0.0.1:{port}")
        print(f"  motivo: {e}")
        print(f"  El puerto ya está en uso por otro proceso.")
        print(f"  Cerrá ese proceso (parar_servicios.bat) y volvé a intentar.")
        sys.exit(2)
    print(f"[CerebroNico Puente] Escuchando en 127.0.0.1:{port}")
    print(f"  shell=False | binarios={len(BINARIOS_PERMITIDOS)} | acceso_absoluto={ACCESO_ABSOLUTO}")
    print(f"  servidor multihilo (v1.98.12) | daemon_threads=True", flush=True)
    # ══════════════════════════════════════════════════════════════════════
    # v2.3.24 · EL PUENTE SE CURA SOLO: «se cae no muy seguido, pero vuelve»
    # ──────────────────────────────────────────────────────────────────────
    # `serve_forever()` al aire libre dejaba el proceso a merced del lazo de
    # accept: un `OSError` del sistema (WinError 10024 —demasiados sockets—,
    # EMFILE, un `connection aborted` en el `accept` del socket de escucha) NO
    # lo captura `socketserver`: sale por arriba, imprime el traceback y el
    # PROCESO muere. El IDE lo veía como «:5000 OFF», y sólo volvía si el
    # supervisor de server.ts lo respawnaba — con el defecto del flag pegajoso
    # (v2.3.24, server.ts) muchas veces tampoco volvía.
    #
    # La cura es un lazo con reapertura: el fallo se ANUNCIA (con tipo, motivo e
    # intento), se espera con backoff y se vuelve a abrir el mismo puerto. Diez
    # reaperturas es el techo honesto: si el problema es del sistema,insistir
    # para siempre solo esconde el diagnóstico. Un puerto ocupado al reabrir NO
    # mata el puente: se reintenta en el próximo ciclo.
    # ══════════════════════════════════════════════════════════════════════
    reaperturas = 0
    while True:
        try:
            server.serve_forever(poll_interval=0.5)
            print("[Puente] escucha terminada de forma limpia (shutdown).", flush=True)
            break
        except KeyboardInterrupt:
            print("\n[Puente] Detenido.", flush=True)
            try:
                server.shutdown()
            except Exception:
                pass
            break
        except Exception as e:  # noqa: BLE001 · acá SÍ: cualquier fuga del lazo
                                # es mejor procesada que vista morir el servicio
            reaperturas += 1
            espera = min(2 ** reaperturas, 15)
            print(
                f"[CerebroNico Puente]  LAZO DE ATENCION CAIDO ({type(e).__name__}: {e}) "
                f"— reapertura {reaperturas}/10 en {espera}s",
                flush=True,
            )
            if reaperturas >= 10:
                print(
                    "[CerebroNico Puente] tras 10 reaperturas me rindo: el fallo es del "
                    "sistema (sockets/puertos), no del puente. Revisá el log del SO.",
                    flush=True,
                )
                sys.exit(1)
            time.sleep(espera)
            try:
                try:
                    server.server_close()
                except Exception:
                    pass
                server = PuenteServidor(("127.0.0.1", port), PuenteHandler)
                print(f"[CerebroNico Puente] de nuevo escuchando en 127.0.0.1:{port}", flush=True)
            except OSError as e2:
                print(f"[CerebroNico Puente] la reapertura no pudo abrir el puerto: {e2}", flush=True)


if __name__ == "__main__":
    main()
