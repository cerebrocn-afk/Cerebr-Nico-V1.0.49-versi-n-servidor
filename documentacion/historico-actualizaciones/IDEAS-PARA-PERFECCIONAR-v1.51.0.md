# IDEAS PARA PERFECCIONAR CEREBRONICO — análisis de fuentes externas (v1.51.0)

> Nacido 05/11/2026 a pedido de Mario: «analicemos esta aplicación, quiero tomar
> ideas para perfeccionar CerebroNico».
> **Estado del caso `dsh`:** NO analizable. Los volúmenes
> `dsh-latest-windows-x64.7z.001/.002/.003` no existen en el disco (búsqueda
> recursiva en `C:\Users\BirdBox\Downloads\*.7z*` → solo `app.7z`, `v2.0\*.7z.00x`).
> `7z` no está instalado; `tar.exe` de Windows no lee 7-Zip. Llegaron al editor
> como texto pegado por chat, no como archivos reales.
> Lo que este documento hace en su lugar: contrastar el estado MEDIDO de
> CerebroNico (`HOJA_DE_RUTA_PERFECCION.md` §0 y §6, `perfeccion.md`) contra las
> capacidades que las CLI de agente de referencia (Codex CLI, Claude Code, Gemini
> CLI, Aider, Cursor, OpenHands) demostraron valiosas — y traducirlas a fases
> con evidencia, no a deseos.

---

## 0 · Punto de partida real (no inventado)

Medido en este turno leyendo el plano y el manual:

| Hecho verificado | Fuente |
|---|---|
| P1, P2, P3, P4, P7, P8 **OK** | `HOJA_DE_RUTA_PERFECCION.md` §0 |
| P5 **PARCIAL**: ritual de entrega manual en 6 pasos | ídem §0 |
| P6 **PARCIAL**: `.con-ciencia` rutea por palabra; embeddings vectorizados en v1.84 (F2) pero **el ruteo híbrido real no está medido** | ídem §0 y FASE 2 |
| 7 fases del plano HECHAS (F0→F7), 1.81.0 vacante | ídem §8 |
| §6: **una sola fila viva** — el preview del sandbox no llama a `/api/conciencia` | ídem §6 |
| `perfeccion.md`: 9 procesos validados, **0 rutas fijadas** | `app/perfeccion.md` línea 10 |

Conclusión de partida: **CerebroNico no está en la etapa de «añadir funciones»,
está en la etapa de cerrar las dos grietas que él mismo se declaró** (P5 y P6) y
de medir lo que ya construyó. Copiarle funciones nuevas a otra app antes de
cerrar esas dos sería sumar deuda, no cerrarla.

---

## 1 · Qué hacen otras CLI que aquí NO existe (y por qué importa)

| Idea | Dónde brilla | ¿Ya lo tiene CerebroNico? | Veredicto |
|---|---|---|---|
| **Permisos por herramienta y por ruta, con memoria de lo autorizado** («allow once / allow always for this path») | Codex CLI, Claude Code | Parcial: `puente-permitidos.json` es lista blanca por comando, **no por ruta ni con memoria conversacional** | **ADOPTAR** — la deuda real más cara |
| **Archivo de instrucciones por proyecto** (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`) cargado automáticamente al entrar en la carpeta | Todas las CLI serias | Sí: `memoria.md` + reglas de proyecto, **pero el usuario las escribe a mano en Configuración** | **ADOPTAR barato** |
| **Reanudación de sesión** (`--continue`, `--resume <id>`) | Codex, Claude Code, Copilot CLI | **NO** — el motor tiene planes en segundo plano pero no «retomá donde quedamos» | **ADOPTAR** — alto valor percibido, coste medio |
| **Modo headless / no interactivo** (`-p "prompt"` con salida máquina) | Codex CLI, Gemini CLI | **NO** — todo pasa por la UI del IDE | **ADOPTAR** — abre automatización y CI |
| **Diff previo obligatorio antes de escribir** | Aider | Sí, `revisar_cambios` + Quirófano ya lo hacen | Ya cubierto |
| **Auto-commit con mensaje generado por tarea** | Aider | Sí, `git_commit` existe pero es manual | PULIR: proponer el commit al cerrar plan verde |
| **Ejecución aislada con sandbox del SO** (seatbelt/landlock) | Codex CLI | Parcial: `:3500` y sandbox con conciencia, pero el `exec` del puente no está confinado | **ADOPTAR** solo si el riesgo se mide antes |
| **Compresión de contexto medida** (resumen por tokens reales y aviso al degradar) | Claude Code | Parcial: `contextCache` existe; **no mide tokens ni avisa cuando degrada** | **ADOPTAR** — barato y evita respuestas malas |
| **Telemetría local visible** (modelo, latencia, coste por turno) | Cursor, todas las CLI | Parcial: `recursos_maquina`, `ollama_estado`; **no hay panel de coste/latencia por turno** | **ADOPTAR barato** |

---

## 2 · Las cinco ideas que valen más que cualquier función nueva

Ordenadas por **coste bajo → impacto alto**. Todas cierran grietas que el propio
plano ya declaró.

### Idea A · `AGENTS.md` del proyecto como fuente de reglas (coste: bajo)

Tener, además de `memoria.md`, un archivo versionado en la raíz del proyecto
del usuario que el motor lea al abrir la carpeta y **sobrescriba** a las
preferencias de Configuración para ese proyecto. Es lo que hacen Codex y Claude
y es lo que distingue «el agente sabe mi proyecto» de «el agente obedece mis
chats». Ya tienes el gancho (`memoria.md`, reglas de proyecto): falta el
archivo *por proyecto del usuario*, no por instalación.

**Evidencia de cierre:** suite que (1) lea `AGENTS.md` de la raíz del proyecto y
(2) compruebe en un turno simulado que esas reglas ganan sobre las globales.

### Idea B · Permisos con memoria por ruta (coste: medio)

`puente-permitidos.json` es lista blanca por **comando**. El salto que falta es
el que hace Codex: autorizar **una ruta** y recordarlo durante la sesión
(«puedes escribir en `.proyectos/foo/` sin volver a preguntarme»). Ahora mismo
cada `fs_write` fuera de raíz vuelve a pedir confirmación o exige vincular
carpeta, y eso es exactamente la fricción que Mario describe como
«se comen errores de empaque».

**Evidencia de cierre:** JSON de permisos con `{ruta, operacion, expira}` y
suite que pruebe: permitido→no pregunta, fuera de ruta→pregunta, expirado→
vuelve a preguntar.

### Idea C · Reanudación de sesión con id (coste: medio)

Un `cn_sessions/<id>.json` con último plan, ficheros tocados y modelo usado, y
un comando «retomar esta sesión» en la UI. Hoydia, si cerrás la IDE a mitad de un
plan en segundo plano, el trabajo queda en la nada. Es la queja más repetida de
quien usa una CLI todo el día.

**Evidencia de cierre:** cerrar a mitad de plan, reabrir, retomar, y la tarea
sigue desde la misma tarea `in_progress`.

### Idea D · Medición del contexto, con aviso honesto (coste: bajo)

Contar caracteres/tokens aproximados del contexto que se manda, mostrar el
número y avisar cuando se recorta. Tus propias lecciones ya registran que el
primer token se duplica cuando el prompt va cargado (`preferencias` y
`lentitud`). Es el algoritmo simple el que falta: medir y hacer visible.

**Evidencia de cierre:** en un turno largo, el motor reporta «contexto: N
caracteres, M recortados» y la suite comprueba que sin recorte no avisa.

### Idea E · Panel de latencia/coste por turno y proveedor (coste: bajo)

Ya registráis telemetría de relevo. Falta la cara visible: modelo, ms de
respuesta, si falló y por qué, y cuánto relevó. Eso convierte «el motor se cura
solo» en algo que se ve en pantalla, no que se confía.

**Evidencia de cierre:** panel con cifras reales y test que simula 3 turnos (ok,
fallo+relevo, fallo total) y comprueba los tres registros.

---

## 3 · Lo que NO conviene copiar (honestidad)

- **RCE «por conveniencia»**. La §5 del plano lo prohíbe; cualquier app que
  autorice ejecución remota sin confirmación no es un modelo a seguir, es un
  incidente esperando fecha.
- **Ejecutores de shell por fuera de lista blanca.** Bajar la guardia para que
  "funcione como las CLI grandes" cuesta más de lo que da (cada `exec` libre es
  una puerta).
- **Persistir claves en el frontend** para «mejorar la experiencia». Es bloqueo
  crítico por conciencia de artista.
- **Copiar la arquitectura ajena de un solo binario opaco**. Sin fuente, sin
  licencia y sin documentación pública, no hay idea legítimamente extraíble.

---

## 4 · Estado del archivo `dsh` — qué hacer si de verdad querés analizarlo

1. Confirmar la existencia real: que los tres `.7z.0NN` estén en una carpeta del
   disco. Hoy **no están**.
2. Instalar 7-Zip (`winget install 7zip.7zip`), y listar SIN extraer:
   `"%ProgramFiles%\7-Zip\7z.exe" l <archivo>.001`
3. Si contiene `resources\app.asar` → es Electron: `npx asar list app.asar`
   enumera módulos en claro. Buscar `LICENSE`, `NOTICE`, `package.json`.
4. Leer primero la LICENCIA. Si es propietaria, se copian **conceptos**, no
   código, y hay que apartar el binario del árbol del proyecto (regla de aduana:
   no entra material ajeno sin preguntar para qué).

---

*Documento de trabajo. No se declara nada hecho: cero fases cerradas aquí,
cero archivos del motor modificados. Su función es que Mario elija qué dos de
las cinco ideas van primero, y convertirlas en fases con evidencia como las
de `HOJA_DE_RUTA_PERFECCION.md`.*
