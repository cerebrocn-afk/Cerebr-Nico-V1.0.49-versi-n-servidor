---
name: cn-doc-convertir-formatos
description: Convertir formatos de configuración y datos con la herramienta de conversión, comprobando ida y vuelta. Usarla cuando alguien dice «pase esto a YAML/JSON/TOML/CSV» o cuando un formato se rompió a mitad.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [convertir_formato, read_file, write_file, run_command]
evidencia: [src/engine/formatConverter.ts, tests/roundtrip.test.ts]
---
# JSON ↔ YAML ↔ TOML ↔ CSV sin pérdidas

> Convertir formatos de configuración y datos con la herramienta de conversión, comprobando ida y vuelta. Usarla cuando alguien dice «pase esto a YAML/JSON/TOML/CSV» o cuando un formato se rompió a mitad.

## Herramientas que usa (todas existen en este build)

`convertir_formato` · `read_file` · `write_file` · `run_command`

## Receta

1. Leer el original y contar qué hay (claves, filas).
2. Convertir con la herramienta; si hay un tipo raro (fechas, binarios, claves duplicadas) se declara antes.
3. Hacer ida y vuelta cuando el destino se va a seguir editando: lo que no vuelve igual, se avisa.

## Cómo se verifica (con números, no con adverbios)

- El conteo antes y después cierra, o la diferencia está nombrada.
- El archivo de destino parsea (se volvió a leer con la herramienta).

## No hacer

- No convertir «a mano» con reemplazos de texto: las pérdidas silenciosas viven ahí.

## Evidencia en el repo

- `src/engine/formatConverter.ts`
- `tests/roundtrip.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
