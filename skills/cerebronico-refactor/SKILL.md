---
name: cerebronico-refactor
description: Refactorización segura multi-archivo — renombrar, extraer, mover y dividir código sin romper nada. Leer antes de tocar más de un archivo o una firma pública.
user_invocable: true
---

# Refactor seguro (multi-archivo)

Cambia la forma del código **sin cambiar su comportamiento**. Toda refactorización
empieza con la red de seguridad puesta y termina con la prueba en verde. Si no hay
forma de verificar, no es refactor: es una apuesta, y se dice así.

## Flujo correcto

1. **Foto antes de tocar**: `npm run snapshot` (quirófano) o punto de restauración.
   Sin foto no se refactoriza código ajeno.
2. **Mapa de impacto**: busca TODAS las referencias del símbolo (`symbolIndex`,
   grep por nombre exacto, imports/exports). Un rename es global o no es.
3. **Un cambio, un tipo**: no mezcles rename + extraer + mover en la misma tanda.
   Cada refactor es atómico y reversible por sí solo.
4. **Verifica en cada paso**: `npx tsc --noEmit` (0 errores) → `npm run validar`
   → tests afectados. Rojo = se revierte el paso, no se parchea encima.
5. **Diff honesto**: enseña qué cambió de forma y confirma que la firma pública
   o el resultado observable es idéntico.

## Catálogo de refactors soportados

- **Renombrar símbolo**: variable/función/tipo/archivo con actualización de todas
  las referencias e imports. Nunca dejes un nombre viejo "por si acaso".
- **Extraer función/módulo**: aísla lógica repetida; el nombre nuevo describe el
  QUÉ, no el CÓMO.
- **Mover archivo/módulo**: reescribe rutas de import relativas y de barril.
- **Dividir archivo grande**: por responsabilidad, manteniendo el barril de
  reexportación para no romper consumidores.
- **Inline / desdoblar**: elimina indirecciones muertas de un solo uso.

## Límites honestos

- No cambies contratos (`contrato-rutas.json`, firmas de API públicas) bajo la
  etiqueta "refactor": eso es un cambio de comportamiento y va aparte, avisado.
- El reordenado cosmético (formato) NO justifica tocar archivos no relacionados.
- Si un rename toca strings dinámicos (reflexión, claves por nombre), avísalo:
  el índice de símbolos no ve lo que se arma en tiempo de ejecución.
