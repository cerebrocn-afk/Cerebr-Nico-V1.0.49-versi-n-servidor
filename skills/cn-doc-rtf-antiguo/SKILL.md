---
name: cn-doc-rtf-antiguo
description: Leer .rtf (el formato que sobrevive a los 90) y devolver texto limpio. Usarla cuando llega un archivo viejo, un intercambio de escritorio antiguo o un .doc que en realidad es RTF.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, run_command, list_files, crear_docx]
evidencia: [src/utils/attachmentProcessor.ts]
---
# Rescatar texto de archivos RTF viejos

> Leer .rtf (el formato que sobrevive a los 90) y devolver texto limpio. Usarla cuando llega un archivo viejo, un intercambio de escritorio antiguo o un .doc que en realidad es RTF.

## Herramientas que usa (todas existen en este build)

`read_file` · `run_command` · `list_files` · `crear_docx`

## Receta

1. Confirmar que es RTF por cabecera, no por extensión.
2. Extraer con el extractor del proyecto y limpiar grupos de formato.
3. Re-emitir como .docx si el destino es trabajar el texto, o como .txt si es solo lectura.

## Cómo se verifica (con números, no con adverbios)

- El texto recuperado no trae restos de control (`\par`, `\fs24`).
- Se dijo qué se perdió (imágenes incrustadas, estilos).

## No hacer

- No abrir un RTF con `read_file` crudo y pegar lo que se ve: son instrucciones de formato, no contenido.

## Evidencia en el repo

- `src/utils/attachmentProcessor.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
