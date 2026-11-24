# Extensión «Ingeniero senior + transmutación binaria»

Capa PRONTA PARA MONTAR al motor de CerebroNico. Amplía el botón **Ingeniero**
del chat (Auto / Rápido / Ingeniero / Profundo) para actuar como ingeniero
senior en software complejo, análisis de sistemas y **transmutación de códigos
binarios** (con verificación y límite ético/legal).

## Qué trae

```
src/engine/extensionesMotor.ts            ← registro de montaje (valida antes de aceptar)
src/engine/extensiones/ingenieroSenior.ts ← la capa (directriz senior + binaria)
src/engine/extensiones/index.ts           ← bootstrap idempotente que la monta
tests/ingenieroSenior.test.ts             ← pruebas (25 comprobaciones)
```

## Cómo montarla en el proyecto

1. Copia las carpetas `src/engine/...` y `tests/...` dentro de tu copia de
   CerebroNico, respetando las mismas rutas.

2. En `src/engine/thinkingMode.ts` haz que el botón Ingeniero parta de la
   directriz base y le monte esta capa encima:

   ```ts
   import { buildExpertDirective } from "../utils/contextCache";
   import { directrizExtensiones } from "./extensionesMotor";
   import "./extensiones"; // efecto: monta las capas de fábrica (idempotente)

   // dentro de directrizModo(...):
   case "ingeniero": {
     const base = buildExpertDirective("code");
     const extra = directrizExtensiones("ingeniero");
     return extra ? `${base}\n${extra}` : base;
   }
   ```

   Así la BASE sigue siendo una sola fuente y la capa se añade encima. Si un
   día no hay capas montadas, `directrizModo("ingeniero")` vuelve a ser
   exactamente la base: cero sorpresas.

3. (Opcional) Regístrala en `scripts/validar.mjs` añadiendo la suite
   `tests/ingenieroSenior.test.ts`.

## Probarla suelta

```
npx tsx tests/ingenieroSenior.test.ts
```

(En Node 16: `NODE_OPTIONS=--experimental-fetch npx --yes tsx@4.23.15 tests/ingenieroSenior.test.ts`.)

## Montar tus propias capas

El registro es genérico: cualquier capa se monta con `montarExtension({ id,
modo, etiqueta, resumen, directriz })`. Valida antes de aceptar (id único, modo
válido, directriz no vacía) y nunca lanza: una capa mal formada no se monta y
se explica el motivo.

Autor del proyecto: Mario Nicolás Quintero.
