# CLAUSULAS-DE-ADJUNTO.md — qué entra por el clip, qué no, y por qué

Documento de la **aduana del adjunto**. Nació el 4/11/2026 de una pregunta del usuario
(«¿acepta exe también?») que destapó tres agujeros reales en `ChatCenter.tsx`.

## 1. El hecho que lo originó

El input del clip era `<input type="file" multiple className="hidden">`:

- **sin `accept`** → el diálogo del sistema mostraba *todos* los archivos;
- **sin comprobación de `file.size`** → un `.exe` de 200 MB entraba entero en memoria
  vía `FileReader` → base64 y colgaba la pestaña antes de poder cancelar;
- **sin lista de bloqueo** → un `.env` o un `id_rsa` se leía, entraba al prompt y
  **salía hacia el proveedor del modelo**.

El único número que existía era el del cartel de arrastre («hasta 50 elementos»), que
era **texto del overlay**: no había código que lo hiciera cumplir. Un cartel que miente
es peor que no tener cartel.

## 2. Las tres cláusulas, en orden

`motivoRechazo(nombre, bytes)` en `src/components/ChatCenter.tsx` (línea ~1865) evalúa
en este orden y devuelve el **primer** motivo, o `null` si el archivo pasa:

| # | Cláusula | Qué rechaza | Por qué |
|---|---|---|---|
| 1 | **Tamaño** | más de **200 MB** por archivo | se carga entero en memoria; el navegador no lo rechaza, se cuelga |
| 2 | **Credenciales** | `.env`, `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.npmrc`, `.netrc`, `.pgpass`, `.htpasswd`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `credentials.json`, `service-account.json`, `secrets.json` | no se ejecuta nada: **se filtra una clave**. El archivo entra al prompt y viaja al proveedor |
| 3 | **Ejecutables** | `.exe`, `.msi`, `.dll`, `.sys`, `.scr`, `.com`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.vbe`, `.js`, `.jse`, `.wsf`, `.wsh`, `.hta`, `.jar`, `.apk`, `.app`, `.dmg`, `.deb`, `.rpm`, `.bin`, `.iso` | no hay `child_process` en esa ruta, así que **no se ejecutan**; el problema es que se cargan enteros en memoria y cuelgan la pestaña |

**El orden importa y no es cosmético.** Si credenciales se evaluara antes que tamaño, un
`.env` de 300 MB daría el mensaje equivocado. Si ejecutables se evaluara antes que
credenciales, un `.key` (que no es ejecutable) pasaría. El orden es: lo que más daño hace
primero, y dentro de cada cláusula, el motivo más específico.

## 3. Una sola puerta, dos entradas

El adjunto entra por **dos caminos** y los dos deben dar el mismo veredicto:

| Entrada | Dónde | Función |
|---|---|---|
| Botón del clip | `ChatCenter.tsx` ~2975 | `filtrarPorTamano(files)` |
| Arrastrar y soltar | `ChatCenter.tsx` ~1900 | `filtrarPorTamano(files)` |

`filtrarPorTamano` (línea ~1879) es la **única** que decide: recorre los archivos, llama a
`motivoRechazo` y devuelve `{ aceptados, rechazados }`. Tener dos bloques duplicados fue
el primer defecto que se corrigió: dos copias de una regla divergen el día que alguien
edita una sola.

## 4. Lo que sigue entrando sin tocar

DOCX, ZIP, imágenes, **audio** (`.mp3 .wav .m4a .flac .ogg .aac .opus .aiff` — rama propia
de `attachmentProcessor.ts`, viaja como base64 con `isAudio: true`, sólo lo escuchan los
modelos con oído), JSON, TSX, PY, PDF, CSV, XLSX, MD.

**El input no tiene `accept`.** El diálogo sigue mostrando todo y el rechazo ocurre al
elegir, con el nombre del archivo y el motivo en el aviso. Es deliberado: un `accept`
oculta archivos y el usuario no entiende por qué no aparecen.

## 5. Cómo se comprueba

| Suite | Comprobaciones | Qué fija |
|---|---|---|
| `tests/clausulasAdjunto.test.ts` | **79** | cada extensión de las tres listas, el orden de evaluación, el mensaje con nombre y motivo, y **anti-deriva**: lee el fuente y verifica que cada extensión esté literalmente en el componente |
| `tests/topeAdjuntos.test.ts` | **16** | el umbral exacto (200 MB pasa, 200 MB + 1 byte no), el aviso con nombre y tamaño, la mezcla, y que clip y arrastre dan el mismo veredicto |

Las dos están registradas en `scripts/validar.mjs`. Correr una sola:

```
node --experimental-strip-types tests/clausulasAdjunto.test.ts
```

## 6. Lo que este documento NO cubre

- **El recorte del texto extraído** (`attachmentProcessor.ts:801`, antes 5000) y el
  `slice(0, 15000)` de `engine.ts:309` son otra cosa: limitan cuánto texto llega al
  prompt, no qué archivo entra.
- **`ADJUNTOS_MAX_IMAGENES = 4`** (`enjambreEclectico.ts:106`) limita cuántas imágenes
  ve el enjambre, no cuántas se adjuntan.
- **El tope total** (varios archivos a la vez) no está implementado: sólo hay tope por
  archivo. Con 200 MB por archivo y varios adjuntos, la suma puede ser grande.
