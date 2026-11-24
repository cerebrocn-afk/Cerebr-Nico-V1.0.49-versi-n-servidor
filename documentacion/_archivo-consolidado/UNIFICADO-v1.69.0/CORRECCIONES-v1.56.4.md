# CerebroNico IDE v1.56.4 — Correcciones del VEREDICTO EN ROJO

Estado de partida: `tsc` con 3 errores de tipos + 12 fallos de hindsight +
`ejecucionEspeculativa` en rojo + 7 suites que no llegaban a ejecutarse.

## 1) hindsight (12 fallos) — RAÍZ: `dist/` ausente del SDK vendor
- `vendor/hindsight-agent-sdk` viajaba SIN `dist/`, pero su `package.json`
  declara `"main": "dist/index.js"`. El import del SDK reventaba y arrastraba
  las 12 comprobaciones.
- FIX: recompilar el vendor con el `tsc` del propio proyecto para que `dist/`
  exista. Resultado: **107 correctas · 0 fallidas**.
  (Hecho en la máquina del dev; conviene cablearlo en `postinstall`/`prepare`
  del vendor para que `dist/` NUNCA se asuma preexistente tras `npm install`
  en Windows.)

## 2) tsc — 3 errores de tipos

### src/engine/ejecucionReal.ts (TS2322 ×2, líneas 162/163)
- Causa: `comandoDeGestor(..., script?: string)` dejaba `script` como
  `string | undefined`; en la rama `accion === "script"` se pasaba a
  `args: string[]` sin descartar `undefined`.
- FIX de causa raíz: guard explícito al entrar en la rama `script` que
  estrecha el tipo a `string` y hace valer el contrato (lanza con mensaje
  claro si el llamador no pasa script). NO es un `as string` que tape el hueco.

### src/engine/reflejo/orquestador.ts (TS7006, línea 238)
- Causa: `const num = (re) => ...` con `re` implícito `any`.
- FIX: tipar `const num = (re: RegExp) => ...`.

## 3) ejecucionEspeculativa — RAÍZ: typo en el TEST, no en el código
- El módulo emite correctamente `ESPECULACIÓN ÚTIL` (línea 235, mayúsculas,
  coherente con `ESPECULACIÓN DESCARTADA`).
- El test buscaba con el regex `/ESPECULACIÓN ÚtIL/` — con la **«t» en
  minúscula** — y nunca casaba («el parte lo confiesa» fallaba).
- FIX: corregir el regex del test a `ESPECULACIÓN ÚTIL`. El código queda
  intacto (emite lo correcto). Resultado: **37 comprobaciones OK**.

## Verificación hecha aquí (harness Node v16, sin red del proveedor)
- `tests/ejecucionEspeculativa.test.ts` → 37/37 OK (antes: FALLÓ).
- `comandoDeGestor` ejercitado: `npm run build`, `yarn dev`, `pnpm install`
  correctos y el guard lanza cuando falta el script.

## Pendiente de validar en máquina Node 20 real (como manda el proyecto)
- `tsc --noEmit` completo y `node scripts/validar.mjs` con dependencias
  instaladas (las 114 suites / Node 20). Con Node 16 fallan ~20 pruebas
  SOLO por carecer de `fetch`/`Response` nativos — no es regresión.
- Confirmar que las 7 suites que "no llegaban a ejecutarse" ya corren una vez
  resuelto el import del vendor + los tipos.
