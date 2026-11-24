---
name: cn-web-exportar-zip
description: Sacar el ZIP del sitio (o de cualquier carpeta del proyecto) con contenido verificado y sin node_modules ni claves. Usarla para entregar la obra al usuario o a un tercero.
version: 1.0.0
dominio: web
estado: probada
requiere: [exportar_sitio_zip, crear_zip, listar_exportaciones, run_command]
evidencia: [scripts/creador_daemon.py, src/engine/zipMinimo.ts, src/engine/herramientaZip.ts]
---
# Empaquetar el sitio sin llevarse basura

> Sacar el ZIP del sitio (o de cualquier carpeta del proyecto) con contenido verificado y sin node_modules ni claves. Usarla para entregar la obra al usuario o a un tercero.

## Herramientas que usa (todas existen en este build)

`exportar_sitio_zip` · `crear_zip` · `listar_exportaciones` · `run_command`

## Receta

1. Antes de empaquetar: `sin-claves` (nada de secretos adentro) y auditoría del sitio (0 errores).
2. Empaquetar con la herramienta — `exportar_sitio_zip` para sitios, `crear_zip` para cualquier otra carpeta o tanda de archivos.
3. Reabrir el paquete y comparar conteo de archivos contra lo que había en disco; decir el sha256 que devolvió la herramienta.

## Cómo se verifica (con números, no con adverbios)

- El ZIP se validó con un lector externo (`unzip -t`) o con la propia auditoría reabriendo el archivo.
- No viajan node_modules, .git ni claves.

## No hacer

- No comprimir «todo el proyecto» porque es más rápido: el usuario recibe basura y el paquete pesa 300 MB.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/zipMinimo.ts`
- `src/engine/herramientaZip.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
