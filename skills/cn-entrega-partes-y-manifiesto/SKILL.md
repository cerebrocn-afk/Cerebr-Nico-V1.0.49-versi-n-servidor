---
name: cn-entrega-partes-y-manifiesto
description: Dividir un paquete grande en partes numeradas con un manifiesto que las vuelve a unir y las verifica. Usarla cuando el ZIP no entra en el canal de descarga o cuando se entregan varios archivos.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [run_command, read_file, list_files, crear_zip]
evidencia: [scripts/empaquetar.mjs, scripts/manifiesto.mjs, scripts/verificar-empaque.mjs]
---
# Partes grandes y manifiesto de checksums

> Dividir un paquete grande en partes numeradas con un manifiesto que las vuelve a unir y las verifica. Usarla cuando el ZIP no entra en el canal de descarga o cuando se entregan varios archivos.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `list_files` · `crear_zip`

## Receta

1. Empaquetar con `node scripts/empaquetar.mjs --salida <ruta.zip> --partes N`: escribe el ZIP, lo parte y deja `MANIFIESTO-PARTES.json` con nombre, bytes y sha256 de CADA parte.
2. Rearmar en destino con `copy /b parte01+parte02+... <nombre>.zip` y comprobar que el sha256 coincide con el del manifiesto.
3. Verificar el empaque con `node scripts/verificar-empaque.mjs` y auditar DENTRO del zip que no viaje basura (node_modules, dist, .bak-, _probe*, .patch-).

## Cómo se verifica (con números, no con adverbios)

- Cada parte tiene checksum y tamano en MANIFIESTO-PARTES.json.
- La reunion produce un archivo cuyo sha256 coincide con el del manifiesto y con el del ZIP original.
- El EOCD del ZIP esta presente y las entradas del directorio central coinciden con las declaradas.

## No hacer

- No entregar partes sin el verificador: el usuario no tiene forma de saber si le llego todo.
- No partir un ZIP sin comprobar antes que tenga EOCD: se parte un archivo truncado y las partes parecen validas.
- No empaquetar desde el puente :5000 si el proceso supera 60 s: muere a mitad y deja un ZIP sin cerrar.

## Evidencia en el repo

- `scripts/empaquetar.mjs`
- `scripts/manifiesto.mjs`
- `scripts/verificar-empaque.mjs`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
