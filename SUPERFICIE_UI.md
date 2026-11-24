# SUPERFICIE UI — inventario de la interfaz (GENERADO: no editar a mano)

> Generado por `scripts/superficie-ui.mjs` el 2026-11-14. Ventana de contexto ±14 líneas: el rótulo y el handler son la mejor lectura cercana;
> la verdad dura es componente · línea · endpoint. Pedir un botón concreto: `grep -n` en el archivo que figura acá.

## Cifras
- componentes analizados: 36
- llamadas a /api encontradas: 108
- endpoints distintos: 70
- endpoints con DOBLE/SIMPLE instancia de UI (mismo endpoint desde ≥2 componentes): 11

## Los duplicados (primer objetivo de la limpieza de Mario)

| endpoint | sitios | desde | ya es automático desde… |
|---|---|---|---|
| `/api/sandbox/start` | 8 | DedicatedWebEditorView.tsx, RightSidebar.tsx, App.tsx | **v1.87+ `prepararArranque` levanta y reinicia el :3500 solo al pedir preview («ya corre ≠ corre lo tuyo»)** |
| `/api/sandbox/status` | 6 | DedicatedWebEditorView.tsx, PlanificationPanel.tsx, RightSidebar.tsx, App.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/exec` | 5 | ExtensionPanelView.tsx, RightSidebar.tsx, App.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/bridge/restart` | 4 | CarpetaProyectoModal.tsx, App.tsx | **v1.0.1 «Expulsar» + mataporto limpió el ciclo reiniciar-a-mano; el puente caído ahora se DECLARA con camino correcto (v1.0.10)** |
| `/api/brain/plans` | 4 | PlanificationPanel.tsx, PlansPanel.tsx, TableroParalelo.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/sandbox/stop` | 4 | RightSidebar.tsx, App.tsx | **el apagado del IDE limpia el puerto (killPortListeners en arranque)** |
| `/api/coreo` | 3 | LeftSidebar.tsx, App.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/brain/runner` | 3 | PlanificationPanel.tsx, PlansPanel.tsx, TableroParalelo.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/sistema/estado` | 2 | Header.tsx, App.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/sandbox/zip` | 2 | PlanificationPanel.tsx, RightSidebar.tsx | — (manual puro: preguntar a Mario antes de tocar) |
| `/api/brain/plan` | 2 | PlansPanel.tsx, App.tsx | — (manual puro: preguntar a Mario antes de tocar) |

## Inventario completo (componente · línea · endpoint · handler · rótulo)

| componente:línea | endpoint | handler | rótulo |
|---|---|---|---|
| EspinaActividad.tsx:65 | `/api/ai/stream` | leer | — |
| PlanificationPanel.tsx:337 | `/api/arranque/estado` | moverInterruptor | — |
| PlanificationPanel.tsx:294 | `/api/arranque/interruptor` | moverInterruptor | — |
| App.tsx:3627 | `/api/autoLlamado/cierre` | horaRel | Edita |
| App.tsx:4448 | `/api/brain/plan` | hora | Edita |
| PlansPanel.tsx:334 | `/api/brain/plan` | modeloActual | — |
| PlanificationPanel.tsx:169 | `/api/brain/plans` | ? | — |
| PlanificationPanel.tsx:332 | `/api/brain/plans` | moverInterruptor | — |
| PlansPanel.tsx:260 | `/api/brain/plans` | deps | — |
| TableroParalelo.tsx:64 | `/api/brain/plans` | sem | — |
| PlanificationPanel.tsx:334 | `/api/brain/runner` | moverInterruptor | — |
| PlansPanel.tsx:260 | `/api/brain/runner` | deps | — |
| TableroParalelo.tsx:64 | `/api/brain/runner` | sem | — |
| PlansPanel.tsx:319 | `/api/brain/scale` | crear | — |
| PlansPanel.tsx:320 | `/api/brain/tramo` | crear | — |
| App.tsx:2967 | `/api/bridge/restart` | trabajador | Edita |
| CarpetaProyectoModal.tsx:103 | `/api/bridge/restart` | mb | — |
| CarpetaProyectoModal.tsx:133 | `/api/bridge/restart` | mb | — |
| CarpetaProyectoModal.tsx:149 | `/api/bridge/restart` | mb | — |
| CarpetaProyectoModal.tsx:147 | `/api/carpeta/desvincular` | mb | — |
| App.tsx:490 | `/api/carpeta/estado` | encabezado | Edita |
| CarpetaProyectoModal.tsx:61 | `/api/carpeta/explorar` | mb | — |
| CarpetaProyectoModal.tsx:93 | `/api/carpeta/vincular` | mb | — |
| CarpetaProyectoModal.tsx:125 | `/api/carpeta/vincular-zip` | mb | — |
| PanelEmbedder.tsx:58 | `/api/cerebro/embedder` | ? | — |
| PanelEmbedder.tsx:76 | `/api/cerebro/embedder/calentar` | calentar | — |
| ConsejoPanel.tsx:36 | `/api/consejo/entidad` | alternar | — |
| EspejosSelector.tsx:39 | `/api/consejo/espejos` | ? | — |
| EspejosSelector.tsx:58 | `/api/consejo/espejos` | aplicar | — |
| ConsejoPanel.tsx:26 | `/api/consejo/estado` | alternar | — |
| App.tsx:175 | `/api/coreo` | relevoPrefido | — |
| App.tsx:2804 | `/api/coreo` | cambiarMotor | Edita |
| LeftSidebar.tsx:44 | `/api/coreo` | ? | — |
| App.tsx:2743 | `/api/custom/models` | cambiarMotor | Edita |
| App.tsx:4530 | `/api/engine/convertir` | datos | Edita |
| App.tsx:4392 | `/api/engine/imagen` | hora | Edita |
| PlansPanel.tsx:141 | `/api/engine/imagen/vista` | a | — |
| App.tsx:1826 | `/api/engine/kb/learn` | fit | Edita |
| App.tsx:1809 | `/api/engine/sync` | fit | Edita |
| App.tsx:4908 | `/api/exec` | runBuild | Edita |
| ExtensionPanelView.tsx:154 | `/api/exec` | deny | — |
| RightSidebar.tsx:399 | `/api/exec` | runCommand | Cerrar archivo |
| RightSidebar.tsx:770 | `/api/exec` | candidates | Cerrar archivo |
| RightSidebar.tsx:1104 | `/api/exec` | handleSandboxInstall | Cerrar archivo |
| PanelAndroid.tsx:211 | `/api/export/android/apk` | preparar | Descarga el app-debug.apk verificado en disc |
| PanelAndroid.tsx:115 | `/api/export/android/build` | compilar | — |
| PanelAndroid.tsx:133 | `/api/export/android/provision` | preparar | — |
| PanelAndroid.tsx:145 | `/api/export/android/provision` | preparar | — |
| PanelAndroid.tsx:100 | `/api/export/android/proyecto` | generar | — |
| PluginForge.tsx:55 | `/api/extensions/forjar` | forjar | — |
| AdvancedFeaturesPanel.tsx:63 | `/api/features` | ? | — |
| AdvancedFeaturesPanel.tsx:230 | `/api/features/deep-index` | pideTexto | Por qué está pendiente: |
| AdvancedFeaturesPanel.tsx:231 | `/api/features/deep-index` | pideTexto | Por qué está pendiente: |
| AdvancedFeaturesPanel.tsx:242 | `/api/features/git/commit` | pideTexto | Por qué está pendiente: |
| AdvancedFeaturesPanel.tsx:243 | `/api/features/git/commit` | pideTexto | Por qué está pendiente: |
| AdvancedFeaturesPanel.tsx:108 | `/api/features/git/log` | ? | — |
| AdvancedFeaturesPanel.tsx:265 | `/api/features/git/rollback` | pideTexto | Por qué está pendiente: |
| AdvancedFeaturesPanel.tsx:82 | `/api/features/toggle` | ? | — |
| App.tsx:4182 | `/api/fs/clear-all` | limpiarSandboxParaNuevaTarea | Edita |
| App.tsx:5068 | `/api/fs/nuclear-wipe` | rescatarFoco | Edita |
| App.tsx:4711 | `/api/fs/sync` | syncToDisk | Edita |
| App.tsx:4640 | `/api/fs/tree` | datos | Edita |
| App.tsx:4844 | `/api/fs/tree` | pullFromDisk | Edita |
| ExtensionPanelView.tsx:144 | `/api/fs/write` | deny | — |
| App.tsx:1442 | `/api/ollama/expulsar` | handleClearBg | Edita |
| App.tsx:1692 | `/api/ollama/preferencia` | handleMouseUp | Edita |
| App.tsx:2448 | `/api/openai/models` | cambiarMotor | Edita |
| App.tsx:2403 | `/api/openrouter/models` | cambiarMotor | Edita |
| App.tsx:2097 | `/api/perfeccion` | onKey | Edita |
| PanelQuirofano.tsx:145 | `/api/quirofano/estado` | pedir | — |
| PanelQuirofano.tsx:200 | `/api/quirofano/interruptor` | pedir | — |
| VectorRAGPanel.tsx:186 | `/api/rag/clear` | probar | Vectorización de la memoria (RAG local) |
| VectorRAGPanel.tsx:101 | `/api/rag/index` | probar | — |
| VectorRAGPanel.tsx:178 | `/api/rag/index` | probar | Vectorización de la memoria (RAG local) |
| VectorRAGPanel.tsx:108 | `/api/rag/search` | probar | — |
| VectorRAGPanel.tsx:55 | `/api/rag/status` | ? | — |
| VectorRAGPanel.tsx:98 | `/api/rag/toggle` | activar | — |
| RightSidebar.tsx:697 | `/api/sandbox/flatten-root` | candidates | Cerrar archivo |
| App.tsx:3341 | `/api/sandbox/start` | executeSendMessage | Edita |
| App.tsx:3348 | `/api/sandbox/start` | executeSendMessage | Edita |
| DedicatedWebEditorView.tsx:203 | `/api/sandbox/start` | alVolver | — |
| DedicatedWebEditorView.tsx:252 | `/api/sandbox/start` | alVolver | — |
| DedicatedWebEditorView.tsx:255 | `/api/sandbox/start` | alVolver | — |
| RightSidebar.tsx:790 | `/api/sandbox/start` | candidates | Cerrar archivo |
| RightSidebar.tsx:1151 | `/api/sandbox/start` | handleSandboxStart | Cerrar archivo |
| RightSidebar.tsx:1174 | `/api/sandbox/start` | handleSandboxStart | Cerrar archivo |
| App.tsx:3038 | `/api/sandbox/status` | sondear | Edita |
| DedicatedWebEditorView.tsx:233 | `/api/sandbox/status` | alVolver | — |
| PlanificationPanel.tsx:333 | `/api/sandbox/status` | moverInterruptor | — |
| RightSidebar.tsx:492 | `/api/sandbox/status` | handleDownloadSingleFile | Cerrar archivo |
| RightSidebar.tsx:584 | `/api/sandbox/status` | refreshSandboxStatus | Cerrar archivo |
| RightSidebar.tsx:957 | `/api/sandbox/status` | handleAutoSync | Cerrar archivo |
| App.tsx:4180 | `/api/sandbox/stop` | limpiarSandboxParaNuevaTarea | Edita |
| App.tsx:5062 | `/api/sandbox/stop` | rescatarFoco | Edita |
| RightSidebar.tsx:1225 | `/api/sandbox/stop` | handleSandboxStop | Cerrar archivo |
| RightSidebar.tsx:1236 | `/api/sandbox/stop` | handleSandboxStop | Cerrar archivo |
| RightSidebar.tsx:864 | `/api/sandbox/verify-preview` | candidates | Cerrar archivo |
| PlanificationPanel.tsx:950 | `/api/sandbox/zip` | grupo | Un solo ZIP con TODO lo escrito en el sandbo |
| RightSidebar.tsx:1859 | `/api/sandbox/zip` | carpeta | Un solo ZIP con todo lo escrito en el sandbo |
| PlanificationPanel.tsx:336 | `/api/sandbox/zip-info` | moverInterruptor | — |
| App.tsx:1646 | `/api/sistema/estado` | handleMouseUp | Edita |
| Header.tsx:49 | `/api/sistema/estado` | estaLiviano | — |
| App.tsx:2934 | `/api/subagents` | trabajador | Edita |
| App.tsx:1424 | `/api/system/stats` | handleClearBg | Edita |
| App.tsx:2870 | `/api/telemetry/ports` | trabajador | Edita |
| App.tsx:2981 | `/api/telemetry/refresh` | trabajador | Edita |
| ChatCenter.tsx:1555 | `/api/tts/gemini` | speakConGemini | Órdenes de diseño al Editor web (:3500) |
| App.tsx:2490 | `/api/zai/models` | cambiarMotor | Edita |

## Regla de uso
1. Antes de BORRAR un botón: su fila debe estar marcada por Mario en la columna de decisión (esta planilla es oferta, no sentencia).
2. Antes de MOVER uno «a otro lado»: el atajo que salve clics en la barra de tareas vale más que la pureza visual.
3. Regenerar tras cualquier cambio de UI: `node scripts/superficie-ui.mjs`.
