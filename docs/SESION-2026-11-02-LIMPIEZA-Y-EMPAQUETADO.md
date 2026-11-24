# Sesión 2026-11-02 — Limpieza de raíz, rescate fallido y empaquetado v2.1.0

> **Estado:** acta de lo VERIFICADO en esta sesión. Todo lo que aparece aquí se comprobó
> con `dir`, `findstr`, `tasklist` o lectura de archivo. Lo que NO se pudo verificar está
> marcado explícitamente como tal. Este documento existe para que el próximo turno (o el
> próximo modelo) no repita los errores que aquí se cometieron.

---

## 1. Lo que se limpió de la raíz de datos (`C:\Cerebronico`)

| Acción | Resultado |
|---|---|
| 237 archivos sueltos de la raíz → `.cerebro-papelera\` | ✅ hecho |
| `_dup.ps1` (script suelto, 676 B) | ✅ a papelera |
| `.proyectos\v197` (proyecto de prueba del 31/10) | ✅ borrado a mano por el usuario |
| `.proyectos\rescate-v197` y `rescate-v197-20261102` | ✅ borrados (ver §3) |

**Estado final de `C:\Cerebronico`:** 15 entradas — 7 archivos sueltos legítimos
(`..cn-static-server.cjs`, `.bridge_5000.log`, `.sandbox_3500.log`, `LECCIONES.md`,
`perfeccion.json`, `perfeccion.md`) + 8 carpetas de sistema (`.cerebro-db`,
`.cerebro-papelera`, `.cerebronico`, `.cn-quirofano`, `.cn-sync`, `.creador`,
`.proyectos` vacía, `cerebro`, `logs`).

**Pendiente:** `.cerebro-papelera` (~69 MB, 5 lotes + `claves-ssh`). No se puede vaciar
desde el agente: `fs_delete` mueve a papelera anidada y el puente `:5000` bloquea
`rmdir`/`del`. Requiere `rmdir /s /q "C:\Cerebronico\.cerebro-papelera"` del usuario.

---

## 2. La clave `id_ed25519` — hallazgo de seguridad

**Qué es:** clave privada SSH (par `id_ed25519` / `id_ed25519.pub`). Permite autenticarse
sin contraseña contra servidores y contra GitHub/GitLab. Quien la tenga puede suplantar al
usuario en cualquier servicio donde esté registrada.

**Dónde estaba:** `_ollama-papelera\library-basura\` — un sitio absurdo para una clave
privada, dentro de una carpeta que se empaquetaba.

**Estado:** movida a `.cerebro-papelera\claves-ssh-20261102-013822\`. Sigue existiendo
(un nivel más abajo). **Recomendación:** si esa clave estuvo registrada en algún servicio,
considerarla comprometida y generar una nueva con `ssh-keygen -t ed25519`.

---

## 3. El rescate fallido de `v197` — lección

**Lo que dije primero (FALSO):** «`v197` es basura pura, cero código propio».
**Lo que era:** el primer nivel (`app\node_modules`) era basura, pero había una **copia
recursiva** en `app\.proyectos\v197\app\` con código real (`ChatHilo.tsx`,
`PanelTareas.tsx`, `index.css`, `paleta.test.ts`, `paleta.ts`, `package.json`,
`tsconfig.json`).

**Causa del error:** miré solo el primer nivel del listado y no descendí. Un `dir` de una
carpeta anidada no dice nada sobre lo que hay dentro de sus subcarpetas.

**Lo que se rescató:** 8 archivos en `C:\Cerebronico\.proyectos\rescate-v197\`.

**Lo que se descubrió después:** los 4 archivos de código eran **obsoletos**. El
`paleta.ts` rescatado (2.133 B) exporta `paleta` y `aplicarTema`; el vivo
(`src/engine/paleta.ts`, ~24 KB) **no exporta `aplicarTema`** — esa API fue eliminada en la
evolución a v2.1.0. Los 4 archivos importaban funciones que ya no existen. El rescate no
aportó nada: eran una foto del 31/10 de código que siguió evolucionando.

**Regla para el futuro:** antes de declarar «es basura», listar **todos** los niveles, no
solo el primero. Y antes de rescatar, comparar contra el archivo vivo: si la API cambió,
el rescate es ruido.

---

## 4. `dist/` — ¿se puede borrar?

**Sí, es 100 % regenerable.** Verificado: los 13 assets de `dist/` (`audio/misterio-loop.wav`,
los 6 de `fondos/`, `favicon.ico`, `icon.png`, `icono-cerebronico.png`,
`fondo-predeterminado.jpg`) existen idénticos en `public/`. Vite los copia en cada build.

**Contenido real de `dist/` (21 entradas):** `server.mjs` + `.map` + `server.meta.json`,
`index.html`, `assets/` (css, js, pdf.worker), `audio/`, `fondos/`, iconos.

**Coste de borrarla:** el IDE deja de responder en `:3000` hasta que se corra
`npm run build`. No hay daño permanente.

**Comando seguro (borra y reconstruye sin ventana de caída):**
```
cd /d "C:\Users\BirdBox\Downloads\CerebroNico-IDE-v2.0.0\app" && rmdir /s /q dist && npm run build
```

---

## 5. El puente `:5000` — qué bloquea y por qué

**Fuente de verdad:** `puente-permitidos.json` (versionado, editable a mano).

**Binarios permitidos:** `node`, `npm`, `npx`, `pnpm`, `yarn`, `python`, `python3`, `py`,
`pip`, `pip3`, `git`, `ffmpeg`, `ffprobe`, `java`, `javac`, `mvn`, `gradle`, `go`, `cargo`,
`rustc`, `make`, `cmake`, `gcc`, `g++`, `clang`, `tar`, `unzip`, `zip`, `curl`, `ollama`,
`ls`, `cat`, `pwd`, `echo`, `grep`, `find`, `wc`, `head`, `tail`, `which`, `whereis`,
`whoami`, `uname`, `df`, `du`, `free`, `ps`.

**Nativos Windows:** `dir`, `echo`, `type`, `where`, `tasklist`, `taskkill`, `findstr`,
`ver`, `whoami`.

**Lo que NO está y por qué:** `rm`, `mv`, `cp`, `dd`, `reg`, `net` — las mutaciones de
fichero van por `/api/fs/*`, que sí comprueba raíces. `powershell`, `cmd`, `rmdir`, `del`
tampoco están.

**Trampa verificada en esta sesión:** `tar` y `zip` **aparecen en el JSON** pero el puente
los rechaza con «binario no está en la lista blanca». Motivo: el JSON **sustituye** a los
derechos de fábrica del propio Python del puente, así que hay que añadirlos en **ambos**
sitios. Ese doble camino es el mismo que dejó a Ollama bloqueado en la v1.45.6 (nota
`_nota_ollama_v1460` del propio fichero).

**Lo que sí funciona para empaquetar:** `node` está permitido. Un script Node con
`node:zlib` / `node:fs` puede comprimir y partir sin depender de binarios externos.

**Restricciones adicionales del puente:**
- `&`, `;`, `|` sueltos → «separador no permitido» (composición de shell).
- `>` y `>>` → «redirección a fichero no permitida».
- `node -e "..."` con `>` dentro → rechazado por redirección. **Solución:** escribir el
  script a un `.js` y ejecutarlo con `node archivo.js`.

---

## 6. Empaquetado v2.1.0 — estado real

### 6.1 Paquete existente (01/11 02:44) — VERIFICADO

En `C:\Users\BirdBox\Downloads\`:

| Archivo | Bytes |
|---|---:|
| `CerebroNico-IDE-v2.1.0-parte1-de-4.zip` | 13.556.813 |
| `CerebroNico-IDE-v2.1.0-parte2-de-4.zip` | 13.556.989 |
| `CerebroNico-IDE-v2.1.0-parte3-de-4.zip` | 13.556.869 |
| `CerebroNico-IDE-v2.1.0-parte4-de-4.zip` | 13.556.873 |
| **Total** | **54.227.544** (~51,7 MB) |

**Verificado con `findstr`:** las 4 partes **no contienen** `node_modules` ni `dist/`
(exitCode 1 = cero coincidencias en las cuatro). Los nombres de ruta en un ZIP se guardan
sin comprimir en el directorio central, así que la búsqueda es fiable para nombres.

**Rearmar en destino:**
```
copy /b parte1-de-4.zip+parte2-de-4.zip+parte3-de-4.zip+parte4-de-4.zip CerebroNico-IDE-v2.1.0.zip
```

### 6.2 Paquete nuevo (02/11) — EN CURSO / FALLIDO

`C:\Users\BirdBox\Downloads\CN-v2.1.0\CerebroNico-IDE-v2.1.0.zip` → **0 bytes** al
momento de la verificación. Un `powershell.exe` (PID 11204) seguía vivo comprimiendo.
`Compress-Archive` crea el fichero al empezar y escribe al final, así que 0 bytes durante
el proceso es esperado — pero **no está confirmado que termine bien**.

**Script de partición listo:** `C:\Users\BirdBox\Downloads\CN-v2.1.0\partir.js` — parte el
zip en 4 trozos iguales y verifica que la suma coincida con el original. Ejecutar con
`node C:\Users\BirdBox\Downloads\CN-v2.1.0\partir.js` **después** de que el zip tenga
tamaño > 0.

### 6.3 Qué excluye el empaquetado (criterio de `package.json` → `build.files`)

El `package.json` ya declara las exclusiones canónicas. **Es la fuente de verdad**, no hay
que inventar otra lista:

```
!app/.cerebro-db/**      !app/.cerebronico/**    !app/.proyectos/**
!app/.revisiones/**      !app/memoria_history/** !app/.cerebro-papelera/**
!app/**/*.log            !app/**/*.tmp           !app/**/*.bak
!public/audio/**         !public/fondos/**
!manual-motor/**/*.bak-* !espejos_servidor/respaldos/**
!extensions/**/node_modules/**  !core-agent/**/__pycache__/**
!vendor/**/node_modules/**      !tools/**/__pycache__/**
```

**Nota:** `public/audio/**` y `public/fondos/**` están excluidos del *empaquetado electron*
pero **sí existen en `public/`** y son necesarios para el build. No confundir «no va al
instalador» con «no existe».

---

## 7. Archivos sueltos en la instalación que NO van en ningún zip

Verificado en el listado de `app/`:

- **14 `.tmp-*`**: `.tmp-check.js`, `.tmp-check.mjs`, `.tmp-parche-calentador.cjs`,
  `.tmp-run-tsc.mjs`, `.tmp-tsc-bg.mjs`, `.tmp-tsc-done.txt`, `.tmp-tsc.cjs`,
  `.tmp-tsc3-bg.mjs`, `.tmp-tsc3-out.txt`, `.tmp-tsc3.mjs`, `.tmp-tscheck.mjs`,
  `.tmp-tscheck2.mjs`, `.tmp-verif-final.mjs`, `.tmp-verif.py`
- **28 `_*`**: `_buscar_embedder.mjs`, `_cierre.mjs`, `_diag-3000.mjs`, `_diag-puertos.mjs`,
  `_diag_embedder.mjs`, `_diag_embeddings_out.txt`, `_diag_embeddings_reales.mjs`,
  `_diag_puertos.mjs`, `_emb.log`, `_estado-embedder.mjs`, `_grep_embedder.mjs`,
  `_grep_residencia.mjs`, `_lanzar-emb.mjs`, `_lanzar_diag.mjs`, `_limpiar2.cjs`,
  `_medir_mapa.ts`, `_ollama-check.mjs`, `_parche_default.mjs`, `_parche_embedder.mjs`,
  `_parche_techo.mjs`, `_probar-embeddings.mjs`, `_procesos.cjs`, `_procesos.js`,
  `_procesos.ps1`, `_puertos.cjs`, `_rm-db.mjs`, `_run_diag.bat`, `_sonda-ollama.mjs`,
  `_test_tags.ts`
- **`__pycache__/`** y **`_respaldo-v2.0.0-20261101-160119/`**
- **`.bak-*`**: `cerebro.md.bak-5103`, `cerebro.md.bak-doc`, `memoria.md.bak-doc`,
  `LEEME-PRIMERO.txt.bak-doc`, `electron-main.cjs.bak-20261031-204445`,
  `package.json.bak-20261101-180005`, `RUTAS-DEL-SISTEMA.md.bak-20261101-172346`,
  `iniciar_todo_windows.bat.bak-*` (×7)

**Lo que SÍ va y no se toca:** `src/`, `server/`, `scripts/`, `tests/`, `public/`, `docs/`,
`documentacion/`, `manual-motor/`, `skills/`, `tools/`, `vendor/`, `models/`, `prompts/`,
`extensions/`, `core-agent/`, `espejos_servidor/`, `runtime/`, `app/` (backend Python:
`main.py`, `requirements.txt`, `routers/`, `utils/`), y los 21 `MANIFIESTO_SHA256_*.txt`.

---

## 8. Los espejos — dónde están de verdad

**Pregunta recurrente:** «en la carpeta espejos no hay nada».

**Respuesta verificada:**

| Ruta | Estado |
|---|---|
| `C:\Cerebronico\.cerebronico\espejos` | **existe, VACÍA** (0 entradas) |
| `C:\Cerebronico\.cerebro-db\espejos` | **no existe** |
| `C:\Users\BirdBox\.cerebronico\espejos` | **no existe** (ni siquiera existe `.cerebronico` en el home) |

**Por qué está vacía:** los 8 espejos que funcionan (`matematicos`, `artes`, `codigos`,
`lenguajes`, `planificadores`, `disenios`, `cientificos`, `cuantico`) son **código interno
del motor**, no archivos en disco. La carpeta es para espejos **personalizados del
usuario**, y nunca se instaló ninguno. Una carpeta vacía es legítima: es un directorio de
trabajo del sistema, no un archivo huérfano.

**`espejos-salud.json`** (`.cerebro-db`, 1.147 B, 31/10 04:01) es **telemetría de uso**, no
un índice de carpetas. Dato que revela: `espejo.artes` 4/10 éxitos (40 %) y
`espejo.fisicos` 5/15 (33 %) son los peores; `matematicos` 4/4 y `planificadores` 3/3
perfectos.

---

## 9. Reglas que esta sesión deja escritas

1. **Listar todos los niveles antes de declarar «basura».** Un `dir` del primer nivel no
   dice nada de las subcarpetas. `v197` parecía vacío y tenía código dentro.
2. **Comparar contra el archivo vivo antes de rescatar.** Si la API cambió, el rescate es
   ruido. `paleta.ts` rescatado exportaba `aplicarTema`, que ya no existe.
3. **No afirmar «hecho» sin leer la salida real.** Reporté un `move` a `C:\CN` que nunca se
   ejecutó (la carpeta no existía). La papelera seguía dentro de la raíz.
4. **El JSON del puente no basta.** `tar` y `zip` están listados y aun así se rechazan: hay
   que añadirlos también en el Python del puente. Mismo fallo que Ollama en v1.45.6.
5. **`node` sí funciona para empaquetar.** Es el camino cuando faltan binarios de
   compresión: script a `.js` + `node archivo.js` (nunca `node -e` con `>`).
6. **`fs_delete` no borra: mueve a papelera anidada.** Borrar dentro de `.cerebro-papelera`
   crea `.cerebro-papelera\<lote>\.cerebro-papelera\`. No usar para vaciar papelera.
7. **`Compress-Archive` crea el zip en 0 bytes al empezar.** No declarar fallo hasta que el
   proceso termine; verificar con `dir` y el tamaño final.
8. **`package.json` → `build.files` es la fuente de verdad del empaquetado.** No inventar
   listas de exclusión paralelas.

---

## 10. Pendientes al cierre de esta acta

| # | Pendiente | Quién |
|---|---|---|
| 1 | Confirmar que el zip nuevo (`CN-v2.1.0`) terminó con tamaño > 0 | verificar con `dir` |
| 2 | Correr `partir.js` si el zip está completo | agente o usuario |
| 3 | Vaciar `.cerebro-papelera` (~69 MB) | usuario: `rmdir /s /q` |
| 4 | Decidir sobre la clave `id_ed25519` (¿rotar?) | usuario |
| 5 | Generar hashes SHA256 de las 4 partes | usuario: `certutil -hashfile` |
| 6 | Limpiar los ~55 temporales de `app/` | usuario o agente con `del` habilitado |
