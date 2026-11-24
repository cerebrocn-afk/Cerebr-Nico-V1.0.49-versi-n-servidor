---
name: cerebronico-datos
description: Análisis y transformación de datos locales — CSV, JSON, TSV y hojas de cálculo. Leer antes de limpiar, cruzar, agregar o convertir tablas para no inventar cifras.
user_invocable: true
---

# Datos locales (las cifras no se inventan)

Toda tabla se lee del archivo real y toda cifra que se reporta sale de un cálculo
verificable, nunca de la memoria del modelo. Si el dato no está en la fuente, se
dice que no está.

## Flujo correcto

1. **Perfilar antes de tocar**: filas, columnas, tipos, nulos y rango. Mira las
   primeras y últimas filas para detectar cabeceras desplazadas o basura.
2. **Contrato de columnas**: fija nombre y tipo esperado de cada columna. Una
   columna que cambia de tipo a media tabla es un defecto de datos, no de código.
3. **Limpiar de forma trazable**: cada transformación (trim, cast, dedup, relleno)
   se aplica en un paso nombrado y reversible. Nada de "arreglar" en silencio.
4. **Cruzar/agregar**: declara la clave de unión y comprueba cardinalidad (1:1,
   1:N). Un `join` que multiplica filas se detecta contando antes y después.
5. **Verificar el resultado**: totales cuadran, conteo de filas esperado, sin
   nulos donde no debería. Reporta los números con su origen.

## Trampas comunes que hay que nombrar

- **Nulos silenciosos**: `NaN`/`""`/`null` sesgan medias y conteos. Decide y di
  cómo se tratan (excluir vs. rellenar) — no promedies sobre huecos sin avisar.
- **Codificación y separador**: UTF-8 vs. latin-1, coma vs. punto y coma, decimal
  con coma. Un CSV mal leído produce cifras falsas con toda confianza.
- **Duplicados**: deduplica por clave explicita, informando cuántas filas cayeron.
- **Fechas**: normaliza a ISO-8601; los formatos ambiguos (MM/DD vs DD/MM) se
  confirman con la fuente, no se adivinan.
- **Precisión float**: para dinero usa enteros de centavos o decimal, no `float`.

## Entrega

- El resultado sale como archivo (CSV/JSON/xlsx) reproducible: mismos datos de
  entrada → misma salida. Acompaña con un resumen honesto: filas procesadas,
  descartadas y por qué.
- Un gráfico es una lectura de los datos, no un adorno: su título dice la
  conclusión y sus ejes salen de las columnas reales.
