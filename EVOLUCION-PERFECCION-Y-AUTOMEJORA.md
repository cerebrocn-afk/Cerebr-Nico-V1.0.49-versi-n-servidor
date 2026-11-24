# EVOLUCIÓN · PERFECCIÓN · AUTOMEJORA AUTOMÁTICA — CerebroNico IDE

> **Estado: v1.0.10 (09/11/2026).** Este archivo es el plan maestro vivo de evolución del
> IDE. Se alimenta de la **sesión exportada 1794120824912** y de su log: el análisis completo,
> con citas e índices, está en `documentacion/audits/analisis-sesion-requisitos.md`
> (secciones A–F; aquí va la síntesis operativa). Regla de la casa: este documento se
> **actualiza**, no se versiona en archivos nuevos (ver `INDICE-DOCUMENTACION.md`).

---

## 1 · Diagnóstico raíz (por qué la última sesión dolió)

El sufrimiento de la sesión NO fue un solo bug: fueron **cuatro raíces de verdad conviviendo
sin mapa explícito** más **dos máquinas que working-as-designed destruían el trabajo ajeno**:

| # | Causa | Coste medido |
|---|---|---|
| 1 | El sandbox :3500 sirve UNA sola carpeta y el agente editaba una subcarpeta (el navegador abría otra copia) | ~20 turnos de «mis cambios no se aplican» |
| 2 | El preview reescribía el `index.html` en disco → la siguiente compilación tomaba **su propia salida** como entrada (`cn-preview.js → cn-preview.js`) | 8 ciclos; el HTML «volvía» 6 veces |
| 3 | `CERRADURA` marcaba `innerHTML` de plantillas locales como XSS CRÍTICO y el Quirófano **revertía la tanda entera** mientras `write_file` decía «ok» | 49 reversiones silenciosas |
| 4 | Scripts de diagnóstico del propio agente (`test-pista.mjs`…) bloqueaban la puerta de imports de la tanda siguiente | tandas nacidas bloqueadas |
| 5 | Espejo `src/` vs `dist/` de la propia IDE: editar fuente sin build ≠ cambio visible | «reinicié y no cambió» |
| 6 | Puente :5000 caído se reportaba como fallo opaco → el modelo lo leía como error de ruta | «no entendí bien qué era» |

**Veredicto de Mario (09/11):** *«el camino correcto de todas las rutas debe estar explícito
en el motor; no pueden existir errores de ese tipo.»* → Ese principio es la sección 3.

## 2 · Corregido en v1.0.10 (F1–F4, F6, F9, F10 del análisis)

| ID | Qué se hizo | Dónde | Prueba |
|---|---|---|---|
| **F3** | El bundle se inyecta **al servir** (`transform on serve`); el `index.html` del usuario NUNCA se toca; guarda anti-secuestro con reparación única y declaración explícita | `server/sandboxEstatico.ts` · `server/sandboxPreview.ts` · `server.ts` | E2E: md5 del index estable + respuesta con bundle; `viaRapidaPreview` **67/67** |
| **F4** | Balise de estado en TODO preview (raíz efectiva, hash del index, edad del bundle) + aviso ámbar **«⚠ DOS COPIAS»**; `/__cn_info` ampliado (bundle, duplicados, indexSha) | `server/sandboxEstatico.ts` | E2E duplicados ✔ |
| **F1** | Reversión **por archivo culpable** (puertas nombran `culpables`); veredicto con `revertidos`/`conservados`; `write_file` solo dice ok con bytes verificados en disco y pega el último cierre | `src/engine/quirofano.ts` · `server.ts` | `quirofano` **130/130** |
| **F2** | `xss-innerhtml` con dato probadamente local → AVISO (media), externo/dudoso → sigue crítica; `// cn-allow: <regla> <motivo>` con registro en acta; `.cn-seguridad.json` por proyecto | `src/engine/cerradura.ts` · `server/gatesObra.ts` | `cerradura` **52/52** |
| **F9** | El rasclo del agente (`_*`, `test-*`, `verificar-*`, `*.test.*`, `tests/**`) no cuenta como import roto del proyecto | `src/engine/importChecker.ts` | `viaRapidaPreview` verde |
| **F6** | `abort` del usuario = silencio pactado; abort interno = `onError` explícito (fin de la muerte silenciosa del turno) | `src/utils/engine.ts` | typecheck ✔ |
| **F10** | Manuales que faltaban: `ingresar_archivo_workspace`, `promover_archivo_sandbox`, `abrir_previsualizador`, `revisar_cambios`, `deshacer_cambios`; `write_file` reescrito con la verdad nueva | `src/engine/manuals.ts` | `abordaje` **57/57** |
| **MAPA** | Cuatro puntos ciegos al mapa que TODO modelo recibe cada turno (`MAPA_DE_RUTAS`): carpeta única + `/__cn_info`, profundidad de rutas, espejo `dist/`, puente caído ≠ ruta mala | `src/engine/rutasSistema.ts` | `rutasSistema` **137/137** (piso reafirmado a 3600 con razón escrita) |
| **CAMINO** | Nuevo módulo: cada fallo de transporte/ruta sale AHORA con su camino correcto en la propia respuesta (`camino_correcto`) — el error nunca más viaja solo | `src/engine/caminoCorrecto.ts` + cableado en `server.ts` | suite propia |
| **Papeleo** | Manifiesto = UN archivo rolling (`MANIFIESTO_SHA256.txt`); 45 manifiestos viejos archivados y excluidos del paquete; índice documental único (`INDICE-DOCUMENTACION.md`); 13 docs de versiones viejas movidos a `documentacion/historico-actualizaciones/` | `scripts/manifiesto.mjs` · `scripts/empaquetar.mjs` | raíz del paquete: 1 manifiesto |

## 3 · Principios de la evolución (no negociables)

1. **El motor sabe, el modelo recibe.** Todo lo que el motor puede saber (raíz efectiva,
   puerto caído, archivo culpable, espejo viejo) debe llegar al modelo EN la respuesta de la
   herramienta o en el mapa del turno. Prohibido exigirle que «descubra al final».
2. **Ninguna puerta castiga al inocente.** Reversión por archivo; culpa por línea nombrada.
3. **El archivo del usuario es sagrado.** Las transformaciones del pipeline viven en la
   respuesta (serve-time), nunca en la fuente.
4. **Escrito no es cierto hasta ver en disco.** Toda escritura se verifica por bytes.
5. **Un documento = un archivo; un paquete = una firma.** El papeleo se consolida
   (`unificar-papeleo.mjs` es el precedente), nunca se acumula.

## 4 · AUTOMEJORA AUTOMÁTICA — política y backlog

La sesión dejó construida la maquinaria (quirófano, cerradura, logs, autovalido, interruptor
con memoria) pero el lazo de aprendizaje está roto en un punto fatal: **30 leyes curadas y
0 leyes aprendidas** (medido en su propio estado). El circuito de automejora propuesto, en
cuatro anillos:

```
   ┌──────────────────────────────────────────────────────────────────┐
   │ A1 REGISTRO (append-only fuera del alcance del Quirófano)        │
   │    logs/aprendizaje/*.jsonl escrito por el PUENTE, no por la     │
   │    obra: una reversión no puede borrar la memoria (pasó 3 veces) │
   ├──────────────────────────────────────────────────────────────────┤
   │ A2 PROMOCIÓN  ·  error cerrado en ERRORES-Y-ACIERTOS.md →        │
   │    ley ejecutable `cuando <patrón> entonces <guardia>`           │
   │    (hoy: 0 aprendidas; meta: toda causa de ≥2 reversiones)       │
   ├──────────────────────────────────────────────────────────────────┤
   │ A3 VIGILANCIA · las leyes nuevas nacen en modo AVISO 24 h antes  │
   │    de poder bloquear (un guardián que nace bloqueando contamina  │
   │    la tanda con falsos positivos y se manda apagar)              │
   ├──────────────────────────────────────────────────────────────────┤
   │ A4 MEDICIÓN   ·  el acta de cada versión declara: reversiones,   │
   │    tandas, bloqueos por regla, caminos correctos servidos.       │
   │    Sin número, no pasó.                                          │
   └──────────────────────────────────────────────────────────────────┘
```

### Backlog priorizado (F5, F7, F8, F11–F20 del análisis)

**P1 — Higiene del agente y del turno**
- **F5** Una sola vía de escritura: exponer `pc_write_file` auditado con las mismas puertas; `run_command`/`node -e` dejan de ser vía de parcheo; modo `--mantenimiento` explícito.
- **F11** Borrado seguro: `dry_run` + `confirmToken` para comodines sobre la raíz servida (coste real de no tenerlo: el proyecto entero, perdido una vez).
- **F16** Presupuesto de pasos reanudable: el plan sobrevive al corte sin exigir «sigue».
- **F17** `MARCADOR AUTOMÁTICO` como evento de sistema, no burbuja del asistente.
- **F19** Historial: resumir en vez de truncar a 24 (39 recortes en una sesión).
- **F20** Ollama: timeout de primer byte separado; fusible de cuota persistente; salud de flota visible.

**P2 — Perfección de producto**
- **F12** La UI dice qué build sirve (`dist/` vs `/src/*`) y avisa si `src/` es más nuevo (mtime).
- **F13** Sandbox por proyecto (`sandboxRoot = carpeta del proyecto`) — cura de fondo del punto 1 del diagnóstico; el balise F4 ya pone el suelo.
- **F18** Creador de sitios: precios con jerarquía, FAQ + JSON-LD, formulario real, `lazy` + dimensiones, tipo `blog`, verificación de rutas al entregar.

**Hecho a medias por confirmar en vivo (P1/P2 de la sesión):** el validador global completo
(`npm run validar`) y la prueba en vivo del chat (autoscroll, primer turno, cambio de modelo)
siguen siendo deuda del cierre anterior — la ejecución local de Mario es el juez.

## 5 · Registro de versiones de este plan
- **v1.0.13 (09/11/2026)** — auditoría medible de la interfaz (`superficie-ui.mjs` → `SUPERFICIE_UI.md`: 107 llamadas/69 endpoints/315 botones/11 duplicados) + `PLAN-LIMPIEZA-UI.md` con 4 candidatos reales a recorte esperando decisión de Mario. Se empaqueta el ZIP completo aquí, como se ordenó.
- **v1.0.12 (09/11/2026)** — obra visible automática (`server/obraCurso.ts`: la piedra fundacional abre su carpeta y editor/sandbox/escritura coinciden) + hilana reanudable (`src/engine/hilana.ts`: foto del corte en los 10 puntos de rendición de nube, continuación garantizada, 45 min de caducidad). ZIP aplazado por orden de Mario hasta v1.0.13.
- **v1.0.11 (09/11/2026)** — barra en español (`vozDeTareas`), entregable sin órganos del IDE (`esOrganoDelIDE`), lista segura de relevos dentro del motor (`cadenaSegura`). Pendiente grande confirmado: obra visible sin vincular (canal directo automático) y plan reanudable anti-cortes (F16) → v1.0.12.
- **v1.0.10 (09/11/2026)** — nace este documento. Cerrados F1–F4, F6, F9, F10 + mapa explícito + `caminoCorrecto` + consolidación de manifiestos/índice. Basado en el análisis de la sesión exportada (136 mensajes) y su log (883 líneas).
