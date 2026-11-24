## v1.70.5 · 2026-10-25 · LA REGLA DE COLA: EL MOTOR DEJA DE MORIR EN «VOY A SEGUIR…»

Síntoma de Mario sobre v1.70.3: «le tuve que decir muchas veces SIGUE, SIGUE,
y se detenía — no sé por qué». Sesión exportada `1792864959285` + log completo:
tarea «probá todas las herramientas y dejá documentado», glm-4.5-flash, cinco
«sigue» para avanzar cinco tramos.

### Esta entrega FUSIONA v1.70.4 (nunca instalada)

v1.70.4 quedó validada pero la charla cortó antes de la entrega: trae la
**pantalla única de arranque** (pre-arranque con la cara del splash en
`index.html`, vigilante en segundo plano), el **Ollama que por fin da verde**
(sonda `/api/version` + tags con paciencia, sondas en paralelo, cache de 1,5 s
en `/api/health/deep`) y el splash esperando 12 s. Ver `CHANGELOG-v1.70.4.md`.

### Ojo: esta entrega trae también todo lo de v1.70.4

v1.70.4 quedó validada (7990/0) pero la charla se cortó antes de entregarla.
Esta v1.70.5 la **incluye completa**: la pantalla única de arranque (el
pre-arranque con la cara del splash vive en `index.html`, el vigilante quedó
en segundo plano), el Ollama que por fin da verde (sonda `/api/version`
instantánea + `/api/tags` con paciencia + sondas en paralelo + cache de 1,5 s
en `/api/health/deep`) y el splash esperando hasta 12 s. Detalles:
`CHANGELOG-v1.70.4.md`. Instalás una vez y tenés las dos.

### El diagnóstico (con prueba en el propio test)

El detector de «anuncio sin acción» (`motivoDeParada`) exige que el texto final
**no tenga ninguna palabra de cierre en TODO el texto** (`RE_INTENCION &&
!RE_CIERRE`). En una tarea de VERIFICACIÓN el modelo escribe «funciona ✓»,
«creado», «respondió» legítimamente en el cuerpo y REMATA con «Voy a continuar
con las herramientas de MCP. Primero, revisaré el estado del proyecto.». El
cierre del medio cegaba al detector: cero re-empujes en todo el log, el turno
moría en promesa y el «sigue» lo reanimaba. Segundo defecto, descubierto al
testear el primero: **`\b` en JS es solo ASCII** — verbos en «ré» (revisaré,
continuaré, analizaré) terminan en no-`\w`, el borde final jamás se cumple y
esas promesas eran invisibles hasta para una regexp que las enumera.

### El arreglo: la cola manda

* `anunciaAlFinal()` (nueva, pura, expuesta para Ouroboros): si la ÚLTIMA
  frase promete trabajo futuro y ese tramo final no se declara cerrado, la
  parada es real sin importar cuántos «funciona» haya dicho el cuerpo.
  Desacentúa la cola antes de probar (`revisaré → revisare`, las alternativas
  sin acento ya existían) para esquivar la trampa del `\b` sin tocar las regex
  que comparten los otros detectores.
* `motivoDeParada()` gana la rama final
  `"cierra el turno anunciando el próximo paso (regla de cola)"` — y con ella,
  sin tocar ningún ciclo, se cablea SOLA en los tres consumidores: el ciclo
  OpenAI-compat (nube: z.ai/mistral/openrouter), la rama Gemini y el juez del
  bucle local. El re-empuje escalonado (ACCIÓN AHORA → ACCIÓN → ENTREGÁ) ya
  existía; ahora por fin le llega el anuncio mezclado con cierres.
* Cierre puro («Listo: probé el puente, el sandbox y la memoria — todo
  funciona.») sigue sin molestar: la última frase se declara cerrada y no hay
  re-empuje. Presupuestos intactos: 3 re-empujes por turno, nada de turnos
  inmortales.
* 4 comprobaciones nuevas en `bucleAutonomo` (cola con cierres en el cuerpo,
  motivo nombrado, cierre puro en paz, pureza con basura) — 149/0 en la suite.

### Y para el caso puntual de la sesión

El log también mostraba `[bucle] 🔁 ciclo visible: 2ª vuelta de un ciclo de
1 paso(s)`: el modelo reiniciaba el inventario en cada turno (list_dir → leer
→ anunciar). Con la cola viva, el turno YA no muere en el anuncio: sigue con
herramienta dentro del mismo turno, y el ciclo de «reiniciar la lista» se corta
por la guardia que ya existía. Si aun así quisieras el máximo control, la
tarea grande va mejor por el Planificador (contrato de etapas, v1.69): ahí el
motor se auto-pregunta hasta tachar todo.

### Verificación

`tsc --noEmit` 0 errores; suite `bucleAutonomo` 149 correctas · 0 fallidas;
`npm run validar` completo y veredicto en el informe de entrega.
