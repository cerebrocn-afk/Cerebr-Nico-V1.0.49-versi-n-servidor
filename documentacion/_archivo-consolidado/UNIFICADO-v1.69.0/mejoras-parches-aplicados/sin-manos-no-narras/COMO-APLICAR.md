# sin-manos-no-narras — v1.57.1 (parche sobre v1.57.0)

## Qué cura
Dos guardas que no se cubrían entre sí dejaban a un modelo nube renombrado (NEMESIS,
alias de `gpt-oss:120b-cloud`) en una PC de ≤8 GB **sin herramientas y sin orden de
admitirlo**: el agente narraba «✔ guardado / ✔ ejecuté list_files» sin tocar el disco
(sesión exportada 2026-10-12: 29 mensajes fantasma).

1. `src/engine/modelTiers.ts` → `modoLivianoLocal(perfil, ramGb, forzado)`: un modelo
   **remoto (nube) nunca está liviano**; su cómputo no toca esta máquina. El env
   `CN_LOCAL_LIVIANO=1/=0` sigue mandando sobre todo.
2. `src/engine/ejecucionFantasma.ts` → `guardaSinHerramientas()`: el texto honesto se
   aplica ahora a **TODO turno con `activeTools.length === 0`** (no solo micro/tiny),
   incluido el system de una línea del modo liviano. Prohíbe narrar ejecuciones,
   inventar rutas y listas de «acciones realizadas» con ✔; ordena declarar que el
   código entregado es TEXTO.
3. `server.ts`: la IIFE de `localLiviano` y el literal inline de `[MODO SIN
   HERRAMIENTAS]` se sustituyen por las dos llamadas. Queda en 12177 líneas
   (presupuesto del trinquete: 12187).

## Aplicar en la PC (Windows) — desde la raíz de CerebroNico-IDE-v1.57.0

```bat
git apply mejoras\sin-manos-no-narras\parche-v1.57.1.patch
REM alternativa sin git:  patch -p1 < mejoras/sin-manos-no-narras/parche-v1.57.1.patch
npm install
npx tsc --noEmit
npm run validar
npm run build
```

Si la suite `hindsight` saliera roja en tu árbol (12 fallos en «Requisitos del
entorno»): el ZIP v1.57.0 venía sin el `dist/` del SDK vendorizado — ajeno a este
parche. Se arregla así (en el ZIP v1.57.1 ya viene resuelto):

```bat
cd vendor\hindsight-agent-sdk && npm install && npx tsc -p tsconfig.json
```

## Verificación por ejecución (Linux / Node 22.23.2, sandbox, sobre el ZIP v1.57.0)

- `npx tsc --noEmit` → 0 errores.
- `npm run validar` → **VEREDICTO: TODO CORRECTO — 6368 comprobaciones, 0 fallos**.
- Suites custodias: `bajoConsumo` 84 correctas · 0 fallidas (§10, 7 nuevas, ★ caso
  real `getModelProfile("NEMESIS:latest", 8)`), `ejecucionFantasma` 15 ✓ · 0 ✗
  ([5], 6 nuevas), `hindsightHibrido` 107 ✓ tras reconstruir el vendor `dist/`.
- `npm run build` → `dist/server.mjs` generado y **grep confirma los símbolos dentro
  del bundle** (`modoLivianoLocal` ×2, `guardaSinHerramientas` ×2) — la trampa del
  dist viejo documentada por la casa, verificada y esta vez no.
- Replicación: el parche aplicado sobre una extracción limpia de v1.57.0 produce los
  5 archivos **byte-idénticos** (`cmp`) al árbol validado aquí.
- Prueba de comportamiento: `modoLivianoLocal(NEMESIS, 8)` → `false` (conserva sus
  tools); `modoLivianoLocal(qwen2.5:0.5b, 8)` → `true` (el ahorro de v1.56.3 vive).

## Después, en el IDE (configuración, no código)

- Seleccionar `gpt-oss:120b-cloud` con su nombre canónico (el alias ya funciona; el
  canónico elimina una capa de suposiciones).
- Bajar la temperatura de 0.9 a ~0.4 para trabajo de agente.
- Exigir cierre con `revisar_cambios` + `run_tests` (el protocolo ya se lo ordena
  cuando hay tools).

## Limite conocido (fuera de este parche)

El planificador (`planExecutors.TIPOS_SOPORTADOS`: `modelo`, `leer_archivo`,
`convertir`, `generar_imagen`, `reflejo`) sigue sin ningún ejecutor que escriba
archivos de proyecto: el `modelo` guarda texto en `.cerebro-db/resultados/plan-*.txt`.
Que un plan termine verde NO significa que la app exista. La cura real es que el
trabajo de proyecto pase por el bucle de agente (write_file/edit_file), ahora que
NEMESIS conserva sus herramientas.
