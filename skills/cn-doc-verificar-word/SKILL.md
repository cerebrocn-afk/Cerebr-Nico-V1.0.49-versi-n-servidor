---
name: cn-doc-verificar-word
description: Comprobar que el .docx abre — reabrir el paquete, validar CRC por entrada y leer el texto de `word/document.xml`. Usarla siempre que se entrega un documento binario, y ante cualquier «no me abre».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [run_command, read_file, list_files]
evidencia: [tests/zipDocx.test.ts, src/engine/docxMinimo.ts]
---
# Verificar el Word con un lector que no es uno

> Comprobar que el .docx abre — reabrir el paquete, validar CRC por entrada y leer el texto de `word/document.xml`. Usarla siempre que se entrega un documento binario, y ante cualquier «no me abre».

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `list_files`

## Receta

1. Correr el lector externo (`unzip -t` sobre el archivo) y leer su salida, no asumirla.
2. Verificar las tres partes obligatorias del paquete OPC y que el texto no esté vacío.
3. Si el usuario reporta que no abre: pedir el archivo roto, compararlo con el generado y decir qué cambió.

## Cómo se verifica (con números, no con adverbios)

- Hay una prueba externa (utilidad o librería del proyecto) que aprobó el archivo.
- La ruta verificada es la misma que se entregó.

## No hacer

- No decir «abre bien» basándose en que la escritura no devolvió error.

## Evidencia en el repo

- `tests/zipDocx.test.ts`
- `src/engine/docxMinimo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
