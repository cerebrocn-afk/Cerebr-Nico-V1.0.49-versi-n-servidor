# Manual de empaquetado y partición — CerebroNico IDE

> Cómo se empaqueta la instalación para subirla a la nube, qué entra, qué no, y cómo se
> verifica. Todo lo que aquí se afirma se comprobó en disco el 2026-11-02.

---

## 1. La regla de oro: `package.json` manda

Las exclusiones canónicas **ya están escritas** en `package.json` → `build.files`.
No inventar listas paralelas: si hay que excluir algo nuevo, se añade ahí.

```
!app/.cerebro-db/**        !app/.cerebronico/**       !app/.proyectos/**
!app/.revisiones/**        !app/memoria_history/**    !app/.cerebro-papelera/**
!app/**/*.log              !app/**/*.tmp              !app/**/*.bak
!public/audio/**           !public/fondos/**
!manual-motor/**/*.bak-*   !espejos_servidor/respaldos/**
!extensions/**/node_modules/**   !core-agent/**/__pycache__/**
!vendor/**/node_modules/**       !tools/**/__pycache__/**
```

**Ojo con `public/audio/**` y `public/fondos/**`:** están excluidos del *instalador electron*
pero **existen en `public/`** y son necesarios para el build. No confundir «no va al
instalador» con «no existe».

---

## 2. Qué NUNCA va en un zip de distribución

| Categoría | Ejemplos | Se regenera con |
|---|---|---|
| Dependencias | `node_modules/` | `npm install` |
| Build | `dist/` | `npm run build` |
| Estado de sesión | `.cerebro-db/`, `.cerebronico/`, `.proyectos/`, `.vigilante/` | — (es dato del usuario) |
| Papelera | `.cerebro-papelera/` | — |
| Temporales | `.tmp-*` (14 archivos) | — |
| Diagnósticos | `_diag-*`, `_grep-*`, `_parche-*`, `_sonda-*`, `_lanzar-*`, `_procesos.*`, `_puertos.cjs`, `_test_tags.ts`, `_medir_mapa.ts`, `_emb.log` (28 archivos) | — |
| Respaldos | `*.bak-*` (11 archivos), `_respaldo-v2.0.0-*/` | — |
| Caché Python | `__pycache__/` | — |

**Total de basura suelta en `app/`:** ~55 archivos + 2 carpetas.

---

## 3. Qué SÍ va y no se toca

`src/` · `server/` · `scripts/` · `tests/` · `public/` · `docs/` · `documentacion/` ·
`manual-motor/` · `skills/` · `tools/` · `vendor/` · `models/` · `prompts/` ·
`extensions/` · `core-agent/` · `espejos_servidor/` · `runtime/` · `app/` (backend Python:
`main.py`, `requirements.txt`, `routers/`, `utils/`) · los 21 `MANIFIESTO_SHA256_*.txt` ·
`package.json` · `tsconfig.json` · `vite.config.ts` · `index.html` · `cerebro.md` ·
`memoria.md` · `SKILLS.md` · `RUTAS-DEL-SISTEMA.md` · `LEEME-PRIMERO.txt` · `CHANGELOG.md`.

---

## 4. Cómo empaquetar (tres caminos, del más fiable al menos)

### 4.1 Node puro — el que funciona siempre

`node` está en la lista blanca del puente. Un script con `node:zlib` comprime sin
dependencias externas. **Nunca `node -e` con `>`** (el puente rechaza redirecciones):
escribir el script a un `.js` y ejecutarlo.

```js
// empaquetar.js — ejecutar con: node empaquetar.js
import { createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createDeflateRaw } from 'node:zlib';
// ... recorrer el árbol, saltar EXCLUIDAS, escribir entradas ZIP
```

Ventaja: no depende de `tar`, `zip`, `powershell` ni de la lista blanca.

### 4.2 PowerShell `Compress-Archive` — funciona pero es lento

```powershell
$e='C:\Users\BirdBox\Downloads\CerebroNico-IDE-v2.0.0\app'
$x=@('.cerebro-db','.cerebro-papelera','.proyectos','.vigilante','dist','node_modules',
     '__pycache__','_respaldo-v2.0.0-20261101-160119')
$f=Get-ChildItem $e -Force | Where-Object {
  $x -notcontains $_.Name -and
  $_.Name -notmatch '^(\.tmp-|_diag|_grep|_parche|_sonda|_lanzar|_procesos|_puertos|_test_tags|_medir_mapa|_emb\.log)' -and
  $_.Name -notmatch '\.bak-'
}
Compress-Archive -Path $f.FullName -DestinationPath 'C:\...\CerebroNico-IDE-v2.1.0.zip' -Force
```

**Comportamiento verificado:** crea el zip en **0 bytes** al empezar y escribe al final.
Con ~4.600 archivos tarda varios minutos y el proceso `powershell.exe` queda vivo con
~115 MB de RAM. **No declarar fallo mientras el proceso siga vivo.**

### 4.3 `tar` / `zip` — NO funcionan en este puente

Aparecen en `puente-permitidos.json` pero el puente los rechaza con «binario no está en la
lista blanca». Motivo: el JSON **sustituye** a los derechos de fábrica del Python del
puente, así que hay que añadirlos en **ambos** sitios. Mismo fallo que dejó a Ollama
bloqueado en la v1.45.6.

---

## 5. Partición en 4 trozos

### 5.1 Script verificado: `partir.js`

```js
import { statSync, readFileSync, writeFileSync } from 'node:fs';

const zip = 'C:/Users/BirdBox/Downloads/CN-v2.1.0/CerebroNico-IDE-v2.1.0.zip';
const s = statSync(zip);
const b = readFileSync(zip);
console.log('zip bytes:', s.size);
console.log('firma:', b[0].toString(16), b[1].toString(16), '(504b = ZIP válido)');

const n = 4;
const sz = Math.ceil(s.size / n);
let suma = 0;
for (let i = 0; i < n; i++) {
  const st = i * sz;
  const len = Math.min(sz, s.size - st);
  writeFileSync(`C:/Users/BirdBox/Downloads/CN-v2.1.0/parte0${i + 1}.bin`,
                b.subarray(st, st + len));
  suma += len;
  console.log(`parte0${i + 1}.bin = ${len} bytes`);
}
console.log('suma partes:', suma, '| coincide:', suma === s.size);
```

**Verifica tres cosas:** tamaño > 0, firma `504b` (ZIP válido) y que la suma de las partes
coincida exactamente con el original.

### 5.2 Rearmar en destino

```
copy /b parte01.bin+parte02.bin+parte03.bin+parte04.bin CerebroNico-IDE-v2.1.0.zip
```

---

## 6. Verificación de integridad

### 6.1 Hashes SHA256 (usuario, en CMD)

`certutil` y `powershell` están fuera de la lista blanca del puente, así que el agente no
puede generarlos. El usuario sí:

```
cd /d "C:\Users\BirdBox\Downloads"
certutil -hashfile CerebroNico-IDE-v2.1.0-parte1-de-4.zip SHA256
certutil -hashfile CerebroNico-IDE-v2.1.0-parte2-de-4.zip SHA256
certutil -hashfile CerebroNico-IDE-v2.1.0-parte3-de-4.zip SHA256
certutil -hashfile CerebroNico-IDE-v2.1.0-parte4-de-4.zip SHA256
```

### 6.2 Comprobar que no se coló `node_modules` ni `dist`

`findstr` sí está permitido. Los nombres de ruta en un ZIP se guardan **sin comprimir** en
el directorio central, así que la búsqueda de texto plano es fiable para nombres:

```
findstr /c:"node_modules/" CerebroNico-IDE-v2.1.0-parte1-de-4.zip
findstr /c:"dist/" CerebroNico-IDE-v2.1.0-parte1-de-4.zip
```

**exitCode 1 = cero coincidencias = limpio.** exitCode 0 = apareció = hay que rehacer.

---

## 7. El paquete existente (01/11) — verificado

| Archivo | Bytes |
|---|---:|
| `CerebroNico-IDE-v2.1.0-parte1-de-4.zip` | 13.556.813 |
| `CerebroNico-IDE-v2.1.0-parte2-de-4.zip` | 13.556.989 |
| `CerebroNico-IDE-v2.1.0-parte3-de-4.zip` | 13.556.869 |
| `CerebroNico-IDE-v2.1.0-parte4-de-4.zip` | 13.556.873 |
| **Total** | **54.227.544** (~51,7 MB) |

**Verificado con `findstr`:** las 4 partes no contienen `node_modules` ni `dist/`.
Están listas para subir tal cual.

---

## 8. Checklist antes de subir

- [ ] El zip pesa > 0 bytes y la firma es `504b`
- [ ] La suma de las partes coincide con el tamaño del zip
- [ ] `findstr node_modules` → exitCode 1 en cada parte
- [ ] `findstr dist/` → exitCode 1 en cada parte
- [ ] SHA256 de cada parte anotado
- [ ] `copy /b` del rearmado produce un zip que abre sin pedir reparación
- [ ] El zip rearmado trae `package.json`, `src/`, `server/`, `app/app/main.py`
