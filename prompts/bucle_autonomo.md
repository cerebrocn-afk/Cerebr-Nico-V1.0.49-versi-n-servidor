# Prompt para Autonomía en Bucle y Resolución de Errores

Para lograr que el agente ejecute una tarea en bucle cerrado —detectando fallos,
aplicando correcciones y reintentando hasta que el resultado sea exitoso sin
detenerse a mitad de camino—, debes incluir estas directrices exactas al inicio
de tu consigna:

---

**«Ejecuta esta tarea siguiendo un ciclo cerrado de autonomía estricta (bucle de autocorrección):**

1. **Ciclo de Verificación Obligatorio:** Cada vez que ejecutes un comando, script o modificación de código, lee inmediatamente la salida o el log de error resultante.
2. **Prohibición de Detención por Fallos:** Si un comando falla (`exit code != 0` o error de sintaxis), **está prohibido detenerse o pedir ayuda al usuario**. Debes analizar el error, aplicar una corrección directa al archivo afectado usando herramientas de edición quirúrgica (`edit_file`) y volver a ejecutar la prueba.
3. **Criterio de Finalización:** El bucle de intentos solo se detiene cuando el comando de validación (`npm run build`, test o auditoría) retorne 0 errores.
4. **Informe Final Consolidado:** Solo cuando el objetivo esté completado al 100% y verificado mediante ejecución real, presenta un único resumen con los archivos modificados y el estado final.»

---

## Dónde se usa

- **En el chat de CerebroNico (Motor):** pega el bloque al inicio de la consigna.
  El bucle del motor (`runOllamaAgentLoop`) ya implementa la parte ejecutable:
  continuación automática cuando el modelo anuncia una intención sin llamar
  herramienta, tope de pasos que crece con el plan abierto y cierre que dice
  **qué falta** en vez de mentir «Completado» (v1.16.0 · `bucleAutonomo`).
- **A cualquier agente de código externo** (consola de un LLM de nube): el bloque
  es autocontenido; no necesita el IDE.

## Correspondencia con las piezas reales del proyecto (para que el bucle no sea fe, sino mecánica)

| Regla del prompt | Mecánica que la sostiene en CerebroNico |
|---|---|
| 1 · leer la salida de cada comando | el motor devuelve SIEMPRE el stdout/stderr como resultado de `run_command`/`pc_exec`; el puente lo audita en `auditoria.jsonl` |
| 2 · corregir sin detenerse | `edit_file`/`append_file` quirúrgicos en el sandbox + `revisar_cambios`/`deshacer_cambios` (Quirófano) como red del error de corrección |
| 3 · finalizar solo con 0 errores | criterio de validación del repo: `npm run validar` (3894+ comprobaciones) y `tsc --noEmit`; también `npm run test:mcp` y `python tests/autonomia_test.py` |
| 4 · informe consolidado verificado | doctrina de voz v1.8.0: cada artefacto declara si fue **ejecutado / leído / sin verificar** — nada de «funciona» sin ejecución |

## Topes y salvaguardas que el bucle NO puede saltarse (aunque el prompt lo exija)

La «prohibición de detención» es sobre **pedir ayuda**, no sobre los límites de
seguridad del entorno. Un bucle autónomo bien educado se detiene y reporta —no
«pide ayuda», informa con el paquete completo— si:

1. **Agota los topes:** techo de pasos del motor, o el límite de reinicios del
   vigilante (`5/hora` por servicio). Reintentar sin tope no es autonomía: es la
   rueda patinando contra el muro.
2. **El fallo es de código, no de suerte:** `SyntaxError` en el arranque de un
   servicio lo BLOQUEA explícitamente (el vigilante lo declara y guarda el log en
   `.vigilante/<id>.log`). Ahí «reintentar» está prohibido por diseño: arregla,
   `--desbloquear`, y recién entonces sigue el bucle.
3. **Intenta salir de la caja:** mutaciones fuera de las raíces del puente, tocar
   `.env`/claves, borrar con `rm`/`del` (el puente no las tiene permitidas), o
   matar procesos que no son de CerebroNico (lista blanca de `autonomia.py
   puertos --matar`). El bucle informa el bloqueo y sigue por otro camino; no
   forcecea la puerta.

## Activación de la autonomía de proceso (v1.16.2)

```bat
:: Antes de levantar nada, sin humano:
python autonomia.py puertos --matar      :: sanea zombies propios, informa extraños
python autonomia.py deps --auto          :: instala requirements.txt (pip --user, 1 vez por hash)

:: Durante toda la sesión, en otra ventana (o con npm run vigilar):
python scripts/vigilante_autonomo.py     :: reanima :3000/:5000/Ollama, bloquea lo irremediable

:: Y para auditar el paquete:
python scripts/analizar_autonomia.py     :: ¿qué piezas de autonomía trae este zip?
```
