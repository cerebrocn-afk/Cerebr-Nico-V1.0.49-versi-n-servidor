---
name: cn-pruebas-verificacion-externa
description: Validar artefactos binarios con un lector externo (`unzip`, JSZip, pdfjs) en lugar de confiar en la propia auditoría. Usarla con ZIP, Word, PDF, imágenes y cualquier formato con especificación.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, read_file, run_tests]
evidencia: [tests/zipDocx.test.ts, src/engine/herramientaDocx.ts]
---
# Que lo juzgue otro, no uno mismo

> Validar artefactos binarios con un lector externo (`unzip`, JSZip, pdfjs) en lugar de confiar en la propia auditoría. Usarla con ZIP, Word, PDF, imágenes y cualquier formato con especificación.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `run_tests`

## Receta

1. Elegir el lector que no escribió el archivo: utilidad de sistema o librería ya en las dependencias.
2. Afirmar sobre lo que el lector externo devuelve (CRC, número de partes, texto extraído).
3. Si el externo y el interno discrepan, gana el externo y se investiga el interno.

## Cómo se verifica (con números, no con adverbios)

- La prueba cita la salida del lector externo.
- Un archivo podrido a propósito también fue detectado (prueba negativa).

## No hacer

- No usar la misma función de escribir para probar que se escribió bien.

## Evidencia en el repo

- `tests/zipDocx.test.ts`
- `src/engine/herramientaDocx.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
