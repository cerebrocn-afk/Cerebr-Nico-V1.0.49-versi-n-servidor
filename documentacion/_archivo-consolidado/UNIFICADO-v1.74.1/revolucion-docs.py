# -*- coding: utf-8 -*-
"""Revolución de documentacion/ (v1.74.1): un ejemplar actual por documento.
Absorbe los partes por versión dentro de su MAESTRO correspondiente (patrón
de la casa `unificar-papeleo.mjs`) y archiva los originales en
_archivo-consolidado/UNIFICADO-v1.74.1/ — reversible, nada borrado."""
import os, shutil

os.chdir(os.path.dirname(os.path.abspath(__file__)))
BASE = "."
MARK = "UNIFICADO-v1.74.1"
DEST = os.path.join(BASE, "_archivo-consolidado", MARK)
os.makedirs(DEST, exist_ok=True)

def degradar(t):
    out = []
    for l in t.split("\n"):
        if l.startswith("#"):
            out.append("##" + l)
        else:
            out.append(l)
    return "\n".join(out)

def absorber(origen, maestro, titulo=None):
    if not os.path.exists(origen):
        print("  = ausente:", origen)
        return
    txt = open(origen, encoding="utf-8", errors="replace").read().strip()
    base = os.path.basename(origen)
    marca = "<!-- %s %s -->" % (MARK, base)
    m = open(maestro, encoding="utf-8").read()
    if marca in m:
        print("  = ya absorbido:", base)
        return
    m += ("\n\n---\n\n%s\n## Fuente: %s\n\n"
          "> Unificado %s (Mario: \u00abun ejemplar actual de cada archivo con toda la "
          "informaci\u00f3n\u00bb). Original archivado en `documentacion/_archivo-consolidado/%s/`.\n\n%s\n"
          % (marca, titulo or base, MARK, MARK, degradar(txt)))
    open(maestro, "w", encoding="utf-8").write(m)
    shutil.move(origen, os.path.join(DEST, base))
    print("  \u2713 %s \u2192 %s (original archivado)" % (base, maestro))

print("[A] Informes y an\u00e1lisis \u2192 audits/AUDITS_MAESTRO.md")
for f in [
    "ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md",
    "ANALISIS_CUELLOS_INDEXADOR.md",
    "INFORME_IMPLEMENTACION_v1.16.4_BAJO_CONSUMO.md",
    "INFORME_QUIROFANO_v1.1_HD.md",
    "INFORME_VALIDACION_EDITOR-V2_v1.16.6.md",
    "INFORME_VEREDICTO_v1.6.31_vs_ARBOL-LIMPIO.md",
    "MEJORA_MODO_BAJO_CONSUMO_v1.md",
    "MATRIZ_CABLEADO_F4-F10.md",
    "PUENTE_LENGUAJE_Y_MEDICION.md",
    "2026-09-24 (1).md",
]:
    absorber(f, os.path.join("audits", "AUDITS_MAESTRO.md"))

print("[B] Hojas de ruta y cambios antiguos \u2192 ROADMAP_MAESTRO.md")
for f, t in [
    ("HOJA_DE_RUTA_v1.54.md", None),
    ("HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md", None),
    ("HOJA_DE_RUTA_VENTANA_CONTEXTO_v1.55.0.md", None),
    ("HOJA_DE_RUTA_ANTITRANCADO_v1.55.1.md", None),
    (os.path.join("ide", "CORROBORACION_Y_ROADMAP_REAL.md"), None),
    (os.path.join("ide", "CAMBIOS_v1.1_ZAI_GRATIS.md"), None),
]:
    absorber(f, "ROADMAP_MAESTRO.md", t)

print("[C] Credenciales: un solo documento")
absorber("CREDENCIALES-y-papeleo.md", os.path.join("ide", "SEGURIDAD_CREDENCIALES.md")) if os.path.exists("CREDENCIALES-y-papeleo.md") else absorber("CREDENCIALES-y-papeleo.md", os.path.join("ide", "SEGURIDAD_CREDENCIALES.md"))

print("[D] Recordatorios: un solo memor\u00e1ndum")
absorber(os.path.join("ide", "RECORDATORIUM.md"), os.path.join("ide", "MEMORANDUM_MAESTRO.md"))

print("[E] LEEMEs: uno de entrega")
absorber("LEEME_QUIROFANO_v1.txt", "LEEME_ENTREGA.txt")

print("[F] Copias muertas de memoria viva \u2192 archivo (la memoria real es memoria.md/cerebro.md en la ra\u00edz, y LECCIONES.md desde v1.74.0)")
for f in ["MEMORY.md", "memoria-patente.md"]:
    if os.path.exists(f):
        shutil.move(f, os.path.join(DEST, os.path.basename(f)))
        print("  archivado:", f, "(referencia viva documentada en INDICE_MAESTRO)")

print("\n[ok] Revoluci\u00f3n de documentacion/ terminada. Original recuperable en", DEST)
