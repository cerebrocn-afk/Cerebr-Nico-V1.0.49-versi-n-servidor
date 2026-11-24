# PLAN DE RUTA — MEJOR RENDIMIENTO DE CerebroNico (v1.56.4+)

> Documento vivo. Va SIEMPRE dentro del ZIP. Se trabaja POR ETAPAS, con progreso
> real: cada etapa integra algo y LUEGO lo evoluciona. Versión consistente en los
> 4 sitios (package.json / src/constants.ts / index.html / CHANGELOG.md), test
> registrado en `scripts/validar.mjs` (sin pruebas huérfanas), topes/umbrales con
> justificación ESCRITA en el código y contrato de superficie de rutas INTACTO.

Equipo de referencia (Mario): Dell E6430, 8 GB RAM, SIN GPU. Todo lo de aquí se
mide contra ese caso real, no contra una máquina ideal.

---

## ETAPA 1 — ADMISIÓN POR RAM (HECHA en v1.56.4)

**Problema (raíz):** la IDE mandaba a cargar un modelo local aunque no cupiera en
la RAM libre → swap → primera palabra en minutos → a veces cuelgue. El watchdog
solo cortaba el síntoma tarde.

**Hecho:**
- `src/engine/admisionRam.ts`: función PURA (sin red/disco) que estima la RAM
  real del modelo (tamaño de `/api/tags` + overhead del runtime) contra la RAM
  libre y dicta `ok` / `justo` / `riesgo`. Umbrales (`OVERHEAD_RUNTIME_GB`,
  `HOLGURA_OK_GB`) justificados en la cabecera con números del log real.
- `server.ts`: aviso NO bloqueante tras el preflight de existencia. No añade
  rutas; vive dentro del flujo de chat. `try/catch`: si Ollama está caído o
  lento, no opina.
- `tests/admisionRam.test.ts` registrado en `scripts/validar.mjs`.

**Evolución pendiente (ETAPA 1.1):** llevar el veredicto a la UI (badge
verde/amarillo/rojo junto al selector de modelo) para que se vea ANTES de enviar,
no solo en el log del servidor.

---

## ETAPA 2 — EXPULSIÓN PROACTIVA Y SELECCIÓN ASISTIDA

**Objetivo:** que `riesgo`/`justo` no obliguen a pensar al usuario.
- Botón «Liberar y reintentar»: si el veredicto es `riesgo`, ofrecer un
  `ollama_expulsar` del residente y recalcular la admisión automticamente.
- Sugeridor de modelo que CABE: con la lista de `/api/tags` y la RAM libre,
  proponer el modelo instalado más capaz que entre con holgura.
- Test: casos de «expulsar → ahora cabe» y «no hay ninguno que entre».

---

## ETAPA 3 — PRESUPUESTO DE PROMPT POR TRAMO DE RAM

**Objetivo:** el system/contexto que se arma debe escalar con la RAM, no solo con
el tramo del modelo. En 8 GB, recortar aún más agresivo el contexto de archivos
y símbolos para micro/tiny.
- Métrica: tokens de entrada antes de la primera palabra; objetivo de techo por
  tramo, con justificación escrita.
- Test: que el presupuesto de entrada no supere el techo del tramo.

---

## ETAPA 4 — CALENTAMIENTO Y MANTENER-VIVO (keep-alive)

**Objetivo:** evitar la recarga fría del modelo entre turnos.
- Ajustar `keep_alive` de Ollama según RAM: en 8 GB, mantener vivo lo justo para
  no competir con el navegador.
- Opción de «precalentar» el modelo elegido al abrir el chat (si la admisión lo
  permite), para que el primer turno no pague el arranque.
- Test: política de keep-alive por tramo de RAM.

---

## ETAPA 5 — OBSERVABILIDAD DE RENDIMIENTO

**Objetivo:** medir de verdad, no a ojo.
- Registrar por turno: RAM libre al enviar, veredicto de admisión, tiempo a la
  primera palabra (TTFT) y tokens/s. Dejarlo en el panel de métrica ya existente.
- Con esos datos, afinar los umbrales de la ETAPA 1 con evidencia, no con
  suposiciones.

---

## REGLAS TRANSVERSALES (en cada etapa)
1. `tsc --noEmit` limpio y `node scripts/validar.mjs` en VERDE (Node 20).
2. Toda suite nueva, registrada en el validador (sin pruebas huérfanas).
3. Topes/umbrales → justificación ESCRITA en el código.
4. Contrato de superficie de rutas INTACTO salvo decisión explícita; si
   `server.ts` crece, regenerar contrato (`node scripts/superficie.mjs`) y subir
   el techo con el motivo escrito.
5. Versión consistente en los 4 sitios + entrada en CHANGELOG.
6. Este roadmap, SIEMPRE dentro del ZIP.
