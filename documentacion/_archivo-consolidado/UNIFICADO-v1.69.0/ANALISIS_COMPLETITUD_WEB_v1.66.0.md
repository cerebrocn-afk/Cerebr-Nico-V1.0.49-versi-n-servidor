# Análisis: por qué la generación web queda incompleta (v1.66.0)

> Pedido del usuario (1/4): «la generación web siempre tiene problemas con las
> imágenes y para completar los textos, deja las plantillas por defaut».
> Este informe separa la causa en capas, dice qué part ya existía, qué faltaba y
> qué añade v1.66.0.

## 1. Síntoma observado

En la sesión `futuristic.web` la web entregada tenía:

- `<meta name="description" content="Descripción de futuristic.web">` — meta sin
  redactar, con el nombre del proyecto incrustado.
- Secciones con solo el `<h2>` y nada de cuerpo («solo títulos pre default»).
- Texto de relleno / lorem ipsum donde debía ir copy real.
- `<img>` apuntando a `via.placeholder.com`, `tu-imagen.jpg` o `src` vacío →
  imágenes rotas al renderizar.

## 2. La completitud ya tenía tres puertas — y por qué no bastaban

`src/engine/completitud.ts` (ya en el proyecto) cubre:

| Función | Qué caza | Por qué NO veía este fallo |
|---|---|---|
| `prometidoSinObra` | archivo que el plan prometió y no se escribió | el archivo SÍ se escribió |
| `archivosTruncados` | archivo cortado a medias | el archivo estaba «completo», solo que con andamio |
| `enlacesAlVacio` | `src`/`href` a un archivo que no existe EN DISCO | el `src` apuntaba a una URL remota (placeholder), no a disco |
| `archivosVacios` / `huecoDeArranque` | 0 bytes o falta index | los archivos tenían bytes y había index |

**La razón de fondo:** todas las puertas miden **presencia física** (¿existe el
archivo?, ¿tiene bytes?, ¿el enlace resuelve en disco?). Ninguna mira el
**contenido semántico**: un archivo puede existir, tener bytes y enlazar bien, y
aun así ser el **andamio por defecto**. Ese hueco es exactamente lo que el
usuario abre y ve vacío.

## 3. Las imágenes: dos fallos distintos

1. **Imagen rota por enlace a disco inexistente** — ya la cazaba
   `enlacesAlVacio` (si el `src` es una ruta local).
2. **Imagen marcador / placeholder remoto** — `src=""`, `#`,
   `via.placeholder.com`, `placehold.co`, `tu-imagen.jpg`, data-URI 1×1. Estas
   NO son «falta de archivo»: son un marcador que el modelo dejó sin reemplazar
   por un asset real. Ninguna puerta las miraba.

## 4. Lo que añade v1.66.0 — `plantillaDefecto.ts`

Un módulo PURO nuevo que mide **contenido**, complementando (no duplicando) a
`completitud.ts`. Detecta cuatro síntomas:

1. **Texto de relleno** — `lorem ipsum`, «título de la sección», «tu texto aquí»,
   `section title`, `placeholder`, `sample text`…
2. **Meta por defecto** — `description`/`title` que son «Descripción de X», el
   nombre del proyecto a secas, `Document`/`Untitled`/vacío.
3. **Imágenes marcador** — los placeholders remotos y los `src` vacíos / `<img>`
   sin src.
4. **Secciones huecas** — `<section>` cuyo único contenido con tinta es su `<h*>`.

`detectarPlantillaPorDefecto(html, nombreProyecto)` da el veredicto;
`informePlantilla(v)` redacta el acta en español para la auto-revisión: «completa
el texto REAL de cada sección y reemplaza las imágenes marcador por un asset real
(genéralo con la herramienta de imagen o usa una ruta local que exista)».

### División de trabajo limpia

- `completitud.enlacesAlVacio` → el `src` a **disco** que no existe.
- `plantillaDefecto.imagenesMarcador` → el `src` a un **marcador** (remoto o vacío).

Así ninguna de las dos duplica a la otra y juntas cubren el espectro.

## 5. Control de falso positivo (clave para no molestar)

- Un copy largo y propio NO se marca por contener la palabra «ejemplo»: los
  patrones exigen la FORMA de relleno (frase corta genérica o atributo exacto).
- Una `<img src="/img/real.jpg">` a un archivo local existente NO se toca.
- La web real del test (portafolio con copy real) da `ok:true`, informe vacío.

## 6. Cómo integrarlo (wiring, en tu entorno)

En la auto-revisión de obra web, junto a `completitud.ts`: tras escribir el HTML,
correr `detectarPlantillaPorDefecto(html, nombreProyecto)`; si `!ok`, inyectar
`informePlantilla(v)` al gate de cierre para que el turno NO dé por entregada una
web en andamio y el modelo complete el contenido real antes de cerrar.

## 7. Límite honesto

La detección es sintáctica/heurística: caza los marcadores comunes, no juzga la
«calidad» del copy humano. No reemplaza al modelo escribiendo buen contenido —
lo **obliga a no entregar andamio**, que es justo el fallo reportado.
