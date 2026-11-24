---
name: cerebronico-depurador
description: Depuración sistemática de bugs — reproducir, aislar la causa raíz, arreglar y verificar. Leer cuando algo falla, se cuelga o da un resultado incorrecto en vez de parchear a ciegas.
user_invocable: true
---

# Depurador (causa raíz, no síntoma)

Un bug no está arreglado hasta que existe una prueba que fallaba antes y pasa
ahora. Parchear el síntoma sin entender la causa se nombra como lo que es: tapar,
no arreglar.

## Protocolo (en orden, sin saltos)

1. **Reproducir primero**: consigue el caso mínimo que dispara el fallo. Sin
   reproducción estable no se toca código — se pide el paso exacto o el log.
2. **Observar, no adivinar**: lee el error completo, el stack y el estado real
   (valores, no suposiciones). El mensaje de error es un dato, no un adorno.
3. **Aislar**: reduce el espacio de búsqueda a la mitad cada vez (bisección de
   commits, comentar bloques, logs en los límites del módulo sospechoso).
4. **Causa raíz**: explica POR QUÉ falla, no solo DÓNDE. Si no puedes explicarlo,
   sigue aislando; no apliques el arreglo todavía.
5. **Arreglo mínimo**: cambia solo lo que la causa exige. Nada de "ya que estoy"
   limpiando alrededor.
6. **Prueba de regresión**: añade el caso que fallaba a la suite. `npx tsc --noEmit`
   → `npm run validar` → el test nuevo en verde.

## Regla de las dos vueltas

Si el mismo arreglo falla dos veces, PARA. No hagas un tercer parche incremental:
diagnóstica la causa de fondo (estás tratando el síntoma equivocado) y cambia de
enfoque, diciéndolo.

## Señales frecuentes y dónde mirar

- **Se cuelga / bucle**: `repeat_penalty`, recursión sin corte, `await` sin
  resolver, puerto ocupado (`npm run autonomia:puertos`).
- **`undefined`/`null` inesperado**: contrato de datos roto, orden de carga async,
  clave renombrada sin actualizar consumidores.
- **Funciona local, falla empaquetado**: rutas absolutas, recurso no incluido en
  `build.files`, `dist/` sin reconstruir (`npm run build`).
- **Intermitente**: carrera de concurrencia, caché sucia, estado global compartido.

## Honestidad

Si el bug no se reproduce en este entorno, dilo y no reclames haberlo arreglado.
Una hipótesis sin prueba se marca como hipótesis.
