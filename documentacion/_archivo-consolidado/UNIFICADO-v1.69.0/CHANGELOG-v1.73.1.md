# v1.73.1 · 2026-10-26 · EL PLANIFICADOR TRABAJA EN SEGUNDO PLANO; LA BARRA SOLO HABLA CUANDO HAY NOVEDAD

Pedido literal de Mario: *«quizás el planificador debe ir en segundo plano y solo
informar lo relevante en la barra de tareas»*. Antes de tocar, medición:

- **El planificador YA corría en segundo plano**: el espejo vivo
  (`src/engine/espejoVivo.ts`) publica la hoja sin que nadie abra la pestaña, y
  ambos bucles cierran hoja en `finally` — `server.ts` (bucle local, líneas
  3402-3408) y `server/cicloOpenAICompat.ts` (líneas 145-155, nube). No hay
  zombie estructural que arreglar: con el proceso vivo, la hoja SIEMPRE cierra.
- **Lo que no existía era el filtro de relevancia**: la barra (v1.73.0) volcaba
  hasta 14 líneas de acciones por turno, abría la hoja ante CUALQUIER tanda
  —incluso una tanda perfecta— y listaba primero ocho ✓ que no dicen nada.

## Qué cambió (solo presentación: `PlanificationPanel.tsx`)

1. **Autoapertura por relevancia**:
   - plan nuevo que queda vivo → abre (como siempre);
   - **fallo nuevo** (✗ en el feed del puente) → abre;
   - tanda sin fallos → NO abre. El botón pulsa ámbar mientras el motor trabaja:
     la barra se entera, el usuario no es interrumpido.
2. **Orden de tareas**: en curso → fallida → bloqueada/pendiente; las hechas se
   colapsan en `✓ N hechas · mostrar`. En un plan 8/12 la barra ocupa 4 líneas,
   no 12.
3. **Feed de acciones agrupado**: repeticiones `herramienta ×N`; los fallos se
   ven siempre (máx. 3 plegado); las OK bajo `✓ N ok · ver`.
4. **Botón rojo de mal cierre**: último turno `parcial/fallido/cancelado` o
   acciones fallidas → borde y punto en rosa. La mala noticia llega sola.
5. **Guarda «sin señal»**: hoja `en_curso` con más de 15 min (caída del server a
   mitad de turno, el único zombie posible) se marca `⚠ sin señal` y deja de
   disfrazarse de trabajo; cronómetro en minutos pasados 90 s.

## Extra de la misma versión · RANURA GENÉRICA FREELLMAPI (4B)

Pedido: *«tengo una api multi proveedor, coloca una ranura genérica para
introducir el api multi-proveedor de freellmapi»* (+ el export
`freellmapi-keys.json`: «esto»).

- **Ranura 4B «FreeLLMAPI»** en las Ranuras de API Keys: plantillas de URL del
  router (`:3001/v1` instalación rápida/Docker, `:31415/v1` app de escritorio),
  campo de clave unificada y botón **Probar ranura** que pide `/v1/models` por el
  proxy propio de la IDE (el mismo camino que usará el chat, sin CORS).
- **Decisión de arquitectura**: FreeLLMAPI entra como **servidor compatible con
  OpenAI (proveedor `custom`)** — cero proveedores nuevos en el enrutado: el
  router ya hace la magia (34 proveedores, `auto`, fallover, cuotas). Los modelos
  aparecen como `custom:<modelo>` en el selector con **Buscar modelos del
  router** (prop nueva `onDetectCustomModels` → `fetchCustomModels`).
- **Carga del export**: botón *Cargar freellmapi-keys.json* que lee el formato
  `{source:"freellmapi", keys:[{platform,key}]}` y reparte cada clave por su
  ranura (google→Gemini, zhipu→Z.ai, openrouter, mistral, openai, groq, …).
  Guarda medida sobre el archivo real: la entrada `ollama` trae un COMANDO de
  arranque en el campo `key` — un comando no entra en una ranura y se informa.
- **Seguridad**: ninguna clave del usuario se escribió en el código; viven en el
  localStorage del navegador. `npm run sin-claves` sigue barriendo antes de
  empaquetar.

## Verificación

- `tsc --noEmit`: exit 0.
- Cero rutas nuevas → `contrato-rutas.json` intacto; `server.ts` sin tocar en
  esta versión.
- `npm run validar`: ver veredicto de la corrida final (v1.73.0 + v1.73.1 juntas).
