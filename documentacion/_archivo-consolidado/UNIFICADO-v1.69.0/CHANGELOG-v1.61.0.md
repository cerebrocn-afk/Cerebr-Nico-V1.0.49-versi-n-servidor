## v1.61.0 · 2026-10-22 · EL BUCLE ENTRE TURNOS: el motor ya ve lo que un turno no puede ver

> Mario: «Comienza y ve hasta el final». Dos fases de la hoja de ruta PRO, con
> el defecto REAL sembrado en ambos casos. Auditoría y hoja de ruta en
> `manual-motor/`.

---

### 1 · FASE 1 · DETECTOR DE LÍNEAS CASI IDÉNTICAS (P0, bloqueante)

**El defecto:** sesión `1792619044991` (21/10), `mistral-code-fim-latest`. El
motor devolvió **262.849 caracteres**: 1467 líneas de las cuales 1447 eran
variaciones de SOLO 33 plantillas (la más repetida 104 veces), cambiando una
palabra. Ninguna línea era idéntica a otra.

Ningún detector anterior la cazaba:
- `sanitizeRepetitiveLoop` exige 8 repeticiones **exactas** → no salta.
- `repeticionAnidada` (v1.60.19) mira DENTRO de una línea (sufijo creciente)
  → tampoco. Medido sobre los 262 KB reales: `hit: false`, 0,0 % descartado.

**La cura:** `src/engine/degeneracionLineal.ts`, módulo puro. Compara líneas
**vecinas** por similitud (sufijo/prefijo común ≥40 chars o ≥70 % de palabras)
y corta en la racha 6. Las líneas en blanco se descartan antes de comparar:
en el texto real venían intercaladas y hacían que la racha nunca armara (fallo
encontrado al probar contra el caso REAL, no contra el prototipo).

**Medido sobre los 262.849 caracteres reales:** corta en la línea 1, conserva
223 chars → **99,9 % de basura fuera**. Cero falso positivo en prosa normal,
en una lista legítima de 7 archivos y en 30 constantes distintas.

Cableado en `src/utils/engine.ts` (fuera de `server.ts`: no toca la valla).

### 2 · FASE 2 · CONTADOR DE REESCRITURA ENTRE TURNOS (P0)

**El defecto:** el circuito de v1.60.17 corta al 3er rechazo, PERO el contador
se declara dentro del handler (`server.ts:3349` y `:10405`), así que se
reinicia en cada turno. En el log real los 34 rechazos venían agrupados en tres
bloques: cada turno acumuló menos de 3, el corte nunca llegó, y el usuario
encadenó turno tras turno sin avance.

**La cura:** `src/engine/reescrituraEntreTurnos.ts`, módulo puro, memoria de
**sesión**. Ventana de 3 turnos (incluido el actual). Corta si:
- la suma de la ventana llega a 6, o
- 3 turnos seguidos traen ≥1 rechazo cada uno.

Un turno con **cero** rechazos rompe la racha al rotar: el usuario que cambia
de tema no arrastra la historia vieja. Eso fue un fallo real de diseño durante
el desarrollo (5 tests en rojo) y se corrigió en el módulo, no en el test.

**No reemplaza** al circuito por turno: lo complementa. El corte por turno
sigue siendo la primera línea de defensa.

**Cableado** en los dos puntos de corte de `server.ts` (ramas OpenAI-compat y
Gemini), 2 líneas por sitio. `server.ts` queda en 12190 líneas contra una valla
de 12191.

---

### Validación de este paquete

| Check | Resultado |
|---|---|
| `tsc --noEmit` | código 0, 0 errores |
| `tests/degeneracionLineal.test.ts` | **15 ok, 0 fail** |
| `tests/reescrituraEntreTurnos.test.ts` | **21 ok, 0 fail** |
| `npm run validar` | ver `manual-motor/INFORME-AUDITORIA-v1.60.20.md` |
| valla de superficie | 12190 / 12191 |

### Desplegar

Descomprimir y arrancar desde la carpeta de ESTA versión. El log anterior
mezclaba `package.json` en 1.60.19 con rutas a `CerebroNico-IDE-v1.60.18`.

### Pendiente (no está en este zip)

- Fase 3: contexto de bucle visible para el modelo (que sepa que está en bucle,
  no solo que se le corte).
- Fase 4: criterios de aceptación obligatorios en `set_plan` antes de «listo».
- Contrato de proyecto con semillas de base de datos (el ADR ya existe en
  `memoriaArquitectura.ts`; falta cablearlo al arranque).
