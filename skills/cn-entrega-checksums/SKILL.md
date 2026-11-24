---
name: cn-entrega-checksums
description: Emitir sha256/md5 de cada archivo entregado y explicar para qué sirve. Usarla en toda entrega de binarios, paquetes o versiones.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [run_command, read_file, list_files]
evidencia: [scripts/verificar-artefactos.mjs, src/engine/hashArgs.ts]
---
# Hash de la entrega, dicho y comprobable

> Emitir sha256/md5 de cada archivo entregado y explicar para qué sirve. Usarla en toda entrega de binarios, paquetes o versiones.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `list_files`

## Receta

1. Calcular el hash con comando y copiarlo literal.
2. Anotar tamaño y nombre exacto junto al hash.
3. Ofrecer el comando de verificación del lado del usuario.

## Cómo se verifica (con números, no con adverbios)

- El hash es de 64 caracteres hex para sha256.
- Si se regeneró el archivo, se recalculò: un hash viejo engaña.

## No hacer

- No dar un hash «de memoria» ni reutilizar el de la versión anterior.

## Evidencia en el repo

- `scripts/verificar-artefactos.mjs`
- `src/engine/hashArgs.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
