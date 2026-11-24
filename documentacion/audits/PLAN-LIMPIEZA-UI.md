# PLAN DE LIMPIEZA DE INTERFAZ — ronda 1 (v1.0.13, 09/11/2026)

Origen: pedido de Mario — *«botones o funciones que ya son por defecto, quitarlas; funciones dobles»*.
Herramienta: `node scripts/superficie-ui.mjs` → `SUPERFICIE_UI.md` (107 llamadas, 69 endpoints, 315 botones, 11 grupos "duplicados").
Regla de la casa aplicada: **la planilla es oferta, no sentencia** — nada se cortó sin evidencia de que el corte no rompe flujo.

## Lo que la auditoría DESMINTIÓ (no tocar)
- `/api/sandbox/start` ×8 **no son 8 botones**: es UN flujo automático con reintentos (`status → start → confirmación de recisión`, RightSidebar.tsx:784/1119/1142). El botón visible es UNO («Reiniciar preview»/«Arrancar ahora», :1363). Cortar cualquiera de los 3 fetch mata la recuperación sola.
- `/api/sandbox/status` ×6 son sondeos de estado (paneles que se pintan solos). No son funciones dobles: son lecturas.
- `/api/bridge/restart` en App.tsx:2967 es el «reconectar todo» global — legítimo.

## Candidatos REALES a fundir (evidencia en mano, decisión de Mario)
| # | Qué | Dónde | Por qué sobra | Riesgo |
|---|---|---|---|---|
| 1 | ~~Reinicio del puente en cada rama del modal~~ — **RECHAZADO tras lectura** | `CarpetaProyectoModal.tsx:103, 133, 149` | Cada camino (vincular / zip / desvincular) corre UNA sola vez y el reinicio es NECESARIO: el puente lee `puente-permitidos.json` al nacer. Fundirlos en «uno al cerrar» reintroduciría el defecto de la raíz que no rige. Lección: la planilla señala, la lectura decide | — |
| 2 | Botón «Reiniciar preview» cuando el arranque ya se autodeclaró muerto | `RightSidebar.tsx:1363` + v1.87 `prepararArranque` | El motor ya reinicia un :3500 que «corre pero sirve otra cosa»; el botón conserva valor como escape humano — pero el AUTO de la línea 625 («pulsa Arrancar ahora») podría reemplazarse por reintento automático con backoff y dejar el botón solo para el caso recursión | medio — tocar texto y flujo del panel |
| 3 | Doble acceso al ZIP: flecha en la hoja de ruta y botón en RightSidebar | `PlanificationPanel` vs `RightSidebar:1214` | Dos entradas al mismo `/api/sandbox/zip`; la de la barra es la que Mario usa (entregable-cuando-listo) — la otra puede quedar como menú contextual | bajo |
| 4 | Función «por defecto» a vigilar: todo lo que v1.0.10-12 automatizó | ver columna AUTO de `SUPERFICIE_UI.md` | verify-preview (balise), flatten-root (obraCurso), quirofano/estado pegado en write_file, expulsar ollama (relevo elige solo) | revisar en la ronda 2 |

## Procedimiento de la ronda 2 (cuando Mario diga cuáles)
1. Quitar/fundir SOLO los ítems aprobados por número.
2. `npx tsc --noEmit` + suites `planificacionPanel`, `panel`, `puertosCableados`.
3. Regenerar `SUPERFICIE_UI.md` y `CONTRATO-RUTA/SUPERFICIE_RUTAS.md`; el número nuevo entra en el CHANGELOG («antes/después»), que es la única forma de que la limpieza sea medible.
