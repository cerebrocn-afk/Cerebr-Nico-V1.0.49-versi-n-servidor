## v1.60.20 · 2026-10-22 · EL SANDBOX SE TRANCABA: el preview se refrescaba y el panel no

> Mario: «en el previsualizador se muestra la proyección del proyecto pero en el
> sandbox no, está trancada la página de prueba». Alongside venía el otro
> problema: el modelo `mistral-code-fim-latest` chatteó y devolvió 262 KB de
> carpetas inventadas.

Auditoría completa en `manual-motor/INFORME-AUDITORIA-v1.60.20.md`.

---

### 1 · EL SANDBOX TRANCADO CON LA PÁGINA DE PRUEBA (causa raíz medida)

**Síntoma:** el preview del editor web mostraba el proyecto en curso; el panel
del Sandbox seguía mostrando la página vieja. Recargar no lo arreglaba.

**Causa raíz:** los dos iframes miran el mismo `:3500`, pero **solo uno se
refrescaba**:

| Vista | Antes | Ahora |
|---|---|---|
| Editor web `DedicatedWebEditorView.tsx:589,602` | `urlConAntiCache(sandboxUrl, iframeKey)` ✅ | igual |
| Panel Sandbox `RightSidebar.tsx:1358` | `src={iframeSrc \|\| SANDBOX_URL}` ❌ | **`urlConAntiCache(iframeSrc \|\| SANDBOX_URL, iframeKey)`** ✅ |

El proyecto generado registra un Service Worker **network-first**
(`fetch(req).catch(caches.match)`). Sin el parámetro `?cn_r=<token>`, en cuanto
`:3500` tose un instante (un guardado, un reinicio, un 404/502 mientras el
modelo escribe) el SW devuelve la **copia cacheada**: la página de prueba. Y como
el SW responde a la misma URL, recargar no cambia nada.

El token es el `iframeKey` que ya existía en el componente, así que el refresh
del sandbox ahora es tan duro como el del preview. Esto también explica la
«imagen del proyecto duplicada»: no eran dos renders, eran los dos iframes
mostrando distinto caché.

### 2 · LOS MODELOS FIM NO SON DE CHAT (la puerta de entrada del bucle de 262 KB)

La sesión `1792619044991` usó `mistral-code-fim-latest`: un modelo de
**autocompletado fill-in-the-middle**. No conversaciona. Degeneró inventando
1467 «carpetas» de `C:\Cerebronico` — 1447 de ellas repetidas sobre 33
plantillas, la más común 104 veces —: 262.849 caracteres, ~65.712 tokens, y
**ninguna de esas carpetas existe**.

El motor ya filtraba embeddings/TTS/whisper, pero **no filtraba `fim`**, así que
el modelo pasó el filtro y se ofreció para chatear. Ahora `fim` queda fuera en
los dos catálogos:

- `server/routers/modelos.ts` (catálogo de chat de OpenAI y compañía)
- `server/routers/diagnostico.ts` (`NON_CHAT_PATTERNS` de Ollama)

### 3 · EL MANUAL DEL MOTOR: 4 DESAJUSTES CONTRA EL CÓDIGO REAL

Auditado contra `src/engine/toolRegistry.ts`. Lo correcto se verificó: 37
herramientas (hay 37), los 4 formatos textuales B1-B4 existen, los 15 alias de
nombres y 12 de campos coinciden exacto, los puertos y el ciclo de trabajo
correctos. Los desajustes corregidos:

| Antes | Ahora | Por qué |
|---|---|---|
| `set_plan (id, description)` | `set_plan (tasks: [{id, description}])` | El real exige `tasks`; la forma vieja **fallaba el esquema** |
| `consultar_espejo` (sin args) | `consultar_espejo (llamadas: [{espejo, datos}])` | `required: ["llamadas"]`; sin argumentos se rechaza |
| `update_task (…, evidencia)` sin `?` | `evidencia?` | Es opcional (`required: ["task_id","status"]`) |
| «no cambia nada½` | «no cambia nada» | Mojibake: el cierre `»` se comió un `½` |

Corregidos en `manual-completo.md` y `manual-nativo.md`.

### 4 · DOCUMENTACIÓN DENTRO DEL PAQUETE

- `manual-motor/` — las 6 copias del manual (md, xml, json, texto libre,
  nativo, mínimo) corregidas, más `00-LEEME.md` como índice.
- `manual-motor/INFORME-AUDITORIA-v1.60.20.md` — la auditoría completa con las
  mediciones: qué está sano, qué no, y qué queda pendiente.

---

### Lo que NO se cambió (a propósito)

- **Techo `num_predict`**: un tope global puede cortar respuestas largas
  legítimas. Queda como pendiente con la recomendación de un tope *por perfil*.
- **Detector de líneas casi idénticas**: el de v1.60.19 está calibrado para el
  sufijo creciente, y **no detecta** el caso real de las 1467 líneas casi
  idénticas (medido: `hit: false`, deja pasar los 262.849 caracteres). Hay que
  escribir uno nuevo; no entra en un zip sin medirlo antes.

### Validación de este paquete

- `tsc --noEmit`: **código 0**, sin errores.
- `npm run validar`: ver `manual-motor/INFORME-AUDITORIA-v1.60.20.md` §2.1.

### Desplegar

Descomprimir y arrancar **desde la carpeta de esta versión**. El log que mandó
Mario mezclaba `package.json` en 1.60.19 con rutas a `CerebroNico-IDE-v1.60.18`:
el código nuevo corriendo dentro de la carpeta vieja, con el `.cerebro-db` y los
rescates yendo al directorio anterior.