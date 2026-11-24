---
name: cerebronico-observabilidad
description: Instrumentar código con logs, métricas y trazas útiles — para saber qué pasa en producción sin filtrar secretos. Leer antes de añadir logging o diagnosticar en caliente.
user_invocable: true
---

# Observabilidad (ver el sistema por dentro, sin filtrar secretos)

Un `console.log` suelto no es observabilidad. El objetivo es poder responder
"¿qué pasó, cuándo y por qué?" sin adivinar, y sin volcar datos sensibles.

## Los tres pilares

1. **Logs**: eventos con nivel (`debug/info/warn/error`), estructurados (JSON o
   clave=valor), con contexto (id de petición, módulo). Un log sin nivel ni
   contexto es ruido.
2. **Métricas**: contadores y tiempos agregables (peticiones/s, latencia p95,
   errores, uso de RAM). En este repo mira `metricasInferencia` y `telemetria`.
3. **Trazas**: para flujos que cruzan módulos/servicios, un id de correlación que
   une los pasos de una misma operación.

## Reglas de higiene

- **Nunca loguees secretos**: contraseñas, tokens, claves, PII. Ref. por nombre
  de campo (`token=***`), nunca por valor. Un log filtrado es una brecha.
- **Nivel adecuado**: `error` para lo que rompe, `warn` para lo recuperable,
  `info` para hitos, `debug` para el detalle (apagado en producción).
- **Accionable**: el mensaje dice qué falló y qué hacer, no solo "error". Incluye
  el dato que permite reproducir (sin el dato sensible).
- **No spam**: no loguees dentro de bucles calientes sin muestreo; matarás el
  rendimiento y ahogarás la señal real.

## Diagnosticar en caliente

- Usa el router de `diagnostico`/`telemetria` del propio motor antes de añadir
  logs nuevos: puede que el dato ya se esté recogiendo.
- Al terminar el diagnóstico, retira los logs temporales de depuración; no los
  dejes commiteados "por si acaso".
