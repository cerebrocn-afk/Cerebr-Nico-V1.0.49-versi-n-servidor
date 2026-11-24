---
name: cerebronico-contenedor
description: Empaquetar proyectos en contenedores (Docker) — imagen mínima, multi-stage, sin secretos, con healthcheck. Leer antes de escribir un Dockerfile o compose.
user_invocable: true
---

# Contenedores (imagen mínima, reproducible, sin secretos)

Un contenedor se escribe para que otro lo levante igual que tú. Se prioriza
imagen pequeña, capas cacheables y cero secretos horneados dentro.

## Dockerfile sano

1. **Base fijada**: usa una etiqueta concreta (`node:22.13-slim`), nunca
   `latest`. `latest` rompe la reproducibilidad mañana sin avisar.
2. **Multi-stage**: una etapa `build` (compila) y una `runtime` mínima que solo
   copia el artefacto. No arrastres el toolchain a producción.
3. **Capas por estabilidad**: copia primero manifiestos (`package.json`) e
   instala deps; copia el código después. Así la caché de deps sobrevive a cada
   cambio de código.
4. **Usuario no-root**: crea y usa un usuario sin privilegios (`USER app`).
5. **`.dockerignore`**: excluye `node_modules`, `.git`, `.env`, `dist_electron`,
   `.revisiones`. No metas basura ni secretos en el contexto de build.
6. **`HEALTHCHECK`**: define cómo saber si el proceso está vivo de verdad.

## Secretos y red

- **Nunca** `COPY .env` ni `ENV TOKEN=...` en la imagen. Los secretos se inyectan
  en tiempo de ejecución (`--env-file`, secret manager), no en capas.
- Expon solo los puertos necesarios. No publiques puertos internos al host sin
  razón; para servicios locales, atáte a `127.0.0.1`.

## Verificar (honesto)

- `docker build` limpio + `docker run` que arranca y responde al healthcheck.
- Revisa el tamaño final (`docker images`): si es enorme, sobra algo en la etapa
  de runtime.
- No afirmes "la imagen funciona" sin haberla levantado. Si Docker no está
  disponible en este entorno, entrega el Dockerfile y dí que no se pudo construir.
