---
name: cn-pruebas-entradas-raras
description: Alimentar los parsers con lo que el mundo real trae — acentos, `<&>`, nulos de log, cadenas vacías, un solo elemento. Usarla con cualquier lector de texto o formato.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_tests, read_file, edit_file, write_file]
evidencia: [src/utils/attachmentProcessor.ts, src/utils/formatFixer.ts]
---
# Entradas raras: ñ, comillas, ceros y vacío

> Alimentar los parsers con lo que el mundo real trae — acentos, `<&>`, nulos de log, cadenas vacías, un solo elemento. Usarla con cualquier lector de texto o formato.

## Herramientas que usa (todas existen en este build)

`run_tests` · `read_file` · `edit_file` · `write_file`

## Receta

1. Copiar entradas reales defectuosas (de un log o de un archivo del usuario), no inventar las peores.
2. Incluir el caso vacío, el de un elemento y el de muchos.
3. Afirmar el resultado esperado y que el formato de salida sigue siendo válido.

## Cómo se verifica (con números, no con adverbios)

- La ñ y las comillas sobreviven la ida y vuelta.
- Los caracteres de control no rompen XML/JSON de salida.

## No hacer

- No limpiar la entrada del test para que pase: el mundo no se limpia solo.

## Evidencia en el repo

- `src/utils/attachmentProcessor.ts`
- `src/utils/formatFixer.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
