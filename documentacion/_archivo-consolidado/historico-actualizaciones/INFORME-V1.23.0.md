# INFORME v1.23.0 — EL MOTOR CON MANOS (2026-09-29)

## Verdad primero
El ZIP anterior (`v1.22.2-REPARADO-EXE`) NO contenía las reparaciones que su
sesión de trabajo reportaba como «hechas y probadas»: `cerradura.ts`,
`completitud.ts`, el `HUESO_DE_OBRA`, las puertas encendidas por defecto y el
control de cierre dentro del turno **no existían en el paquete**. Esta versión
las implementa de verdad, medidas contra el código real. (Los JSON de reflejo
del paquete estaban válidos; los TS1005 de las capturas vinieron de una
regeneración local del modelo con JSON inválido.)

## Qué se arregló (mapeado a tus quejas)
| Queja | Causa medida | Reparación v1.23.0 |
|---|---|---|
| «siempre le faltan archivos» | el 7B tool-capable recibía 8 herramientas SIN `write_file` | HUESO DE OBRA: 11 herramientas de obra nunca se recortan, tope 8→14 |
| «nunca compila» | sin `run_command` en el recorte + puertas apagadas por defecto | `run_command`/`run_tests` al hueso + `puertaCompilacion` encendida (build inferido del package.json) |
| «sin poder volver atrás» | `deshacer_cambios` quedaba fuera del recorte | al hueso |
| «no sabe que ya tiene mcp» | los packs externos se registran últimos y el recorte los expulsaba | 4 huecos reservados para MCP + el recorte se avisa en log, nunca silencioso |
| «hace el código otra vez y no cambia nada» | la reescritura idéntica se absolvía con `ok:true` | REESCRITURA IDÉNTICA = fallo nombrado, con orden de cambiar a `edit_file` |
| «quedan rotas, no puede repararlas» | el acta fiaba un cierre diferido que corría DESPUÉS del «listo» | CONTROL DE CIERRE DENTRO DEL TURNO: puertas rojas → turno reabierto con orden concreta (2 rondas) |
| «se tranca con un log» | el prompt entrante no se recortaba + el parser secuestraba logs | `trimIncomingPrompt` por presupuesto del perfil + guarda de contenido pegado en acciones rápidas |
| «binario no permitido: «de»/«en»» | el captador pescaba prosa tras «comando/orden» y el puente la ejecutaba | el parser ya no pesca palabras del idioma; el puente rechaza prosa diciéndolo |
| «No existe: Desktop\validar.mjs» | leer sin carpeta de PC nombrada adivinaba `Desktop/` | sin Escritorio/Descargas/Documentos/ruta absoluta nombrada, la orden va al modelo; el «No existe» del puente ahora sugiere candidatas reales |
| «entrega 10-15 vulnerabilidades» | ninguna puerta miraba seguridad | CERRADURA: 19 reglas (XSS, eval, SQLi, secretos, RCE, traversal, CORS, CSP, cookies…); las críticas bloquean la tanda |
| «apps incompletas» | nadie contrastaba plan ↔ disco | COMPLETITUD: prometidos sin escribir, `src=`/`href=` al vacío, 0 bytes, truncados y hueco de arranque entran al acta |

## Cómo verificar (en 2 minutos)
```bash
npm install --ignore-scripts
npx tsc --noEmit            # 0 errores
npm run validar             # VEREDICTO: TODO CORRECTO — 4585 comprobaciones, 0 fallos
npx tsx tests/huesoObra.test.ts     # 30 — la sonda antes/después del recorte
npx tsx tests/cerradura.test.ts     # 52 — las 19 reglas
npx tsx tests/completitud.test.ts   # 35 — plan ↔ manifiesto ↔ disco
```
`dist/` de este paquete ya está reconstruido con el motor nuevo (`vite build` +
`esbuild`), y `node scripts/verificar-artefactos.mjs` dio verde: sin imports
huérfanos, el EXE arranca con estas hojas.

## Kill-switches (el usuario manda)
- `QUIROFANO_SIN_COMPILACION=1` / `QUIROFANO_SIN_CERRADURA=1` — apagar puertas nuevas.
- `QUIROFANO_GATES=tipos,humo` — encender además las caras por tiempo.

— Cerrado y empaquetado por el motor de verificación de la casa: nada de este
informe se afirma sin su suite en verde.
