---
name: cn-web-escena-3d
description: Armar una obra web con 3D real —escena, cámara que sigue el scroll, modo recorrido— usando el three.js vendorizado del propio proyecto, sin depender de la red. Usarla cuando piden «una vista 3D», «recorrer la escena» o «subirme y seguir el viaje». No es para landing 2D ni imágenes.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_sitio, crear_archivo, previsualizar_sitio, auditar_pagina, preflight_rendimiento]
evidencia: [vendor/three/three.module.js, vendor/three/vendor-3d.json, scripts/preparar-vendor-3d.mjs, src/engine/cerradura.ts, server/sandboxEstatico.ts]
---
# Armar una escena 3D navegable dentro del sandbox, sin depender de la red

> Armar una obra web con 3D real —escena, cámara que sigue el scroll, modo recorrido— usando el three.js vendorizado del propio proyecto, sin depender de la red. Usarla cuando piden «una vista 3D», «recorrer la escena» o «subirme y seguir el viaje». No es para landing 2D ni imágenes.

## Herramientas que usa (todas existen en este build)

`crear_sitio` · `crear_archivo` · `previsualizar_sitio` · `auditar_pagina` · `preflight_rendimiento`

## Receta

1. Preparar el motor primero: `node scripts/preparar-vendor-3d.mjs` copia three r169 a la raíz de datos y VERIFICA el sha256. Si sale con código distinto de cero, la escena va a dar pantalla negra: se arregla eso antes de escribir una línea de código.
2. Crear la obra con `crear_sitio` y escribir TRES archivos con `crear_archivo`: `index.html`, `estilo.css` y `main.js`. El JS va SIEMPRE afuera: la cerradura (`src/engine/cerradura.ts`, regla `csp-ausente`) marca todo `<script>` inline sin `src`.
3. En `index.html`, declarar el mapa de importaciones ANTES del modulo: `<script type='importmap'>` con `{ 'imports': { 'three': '/vendor/three/three.module.js', 'three/addons/': '/vendor/three/addons/' } }` y despues `<script type='module' src='main.js'>`. OrbitControls importa `three` pelado: sin el mapa, no resuelve.
4. Declarar la política con CSP local: `<meta http-equiv='Content-Security-Policy' content='default-src 'self''>` (literal en el archivo final). Nada de CDN: el preview sirve de `127.0.0.1:3500` y la obra tiene que abrirse sin internet.
5. En `main.js` montar la escena con la plantilla de la casa: `WebGLRenderer({ antialias: true })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, `PerspectiveCamera(60, …, 0.1, 2000)`, luces (una `hemisphereLight` + una `directionalLight`), geometría procedural, `OrbitControls` para mirarla libre, y un `resize()` atado a `ResizeObserver` (no a `window.resize` pelado).
6. Movimiento por scroll SIN robar la página: leer `scrollY / (scrollHeight - innerHeight)` como `progreso` 0→1, y aplicarlo a la cámara con interpolación suave (lerp por frame, no salto directo). `document.body` necesita altura de verdad (un `div` de referencia de 300vh) o el scroll no existe.
7. Modo recorrido (subirse a algo): guardar el camino como lista de puntos, muestrearlo con `CatmullRomCurve3.getPointAt(t)` (parametrizado por longitud de arco, no `getPoint(t)`, que agrupa la velocidad en las curvas cerradas), y orientar el habitáculo con un `Matrix4.lookAt` + un vector arriba estable; si el arriba se toma de la tangente, el recorrido alabea.
8. Publicar el estado en el DOM para poder verificarlo: `data-motor='three-r169'`, `data-progreso='<0..1 redondeado>'`, `data-fotograma='<n>'` en el `<canvas>` o en un nodo hermano. Sin esto, nadie puede afirmar que la escena cambió: sería un «ya está» regalado.
9. Limpiar: en el cierre del recorrido cancelar `requestAnimationFrame`, y `dispose()` de geometrías, materiales y texturas antes de re-crear la obra. El preview comparte origen entre proyectos y una escena vieja sigue gastando GPU.
10. Verificar con `previsualizar_sitio` + `auditar_pagina`, y recién después `preflight_rendimiento`. Los dos fotogramas tienen que ser distintos con el scroll en 0.2 y 0.8 (ver «Cómo se verifica»).

## Cómo se verifica (con números, no con adverbios)

- `node scripts/preparar-vendor-3d.mjs --verificar` sale 0 y reporta «verificados: 2 · copiados: 0 · problemas: 0».
- El HTML tiene `type='importmap'` y ningún `<script>` inline con código (0 coincidencias de `<script>` sin `src`).
- Abierta la obra en el preview, `data-motor` dice `three-r169` y `data-fotograma` sube entre dos lecturas sucesivas (la escena anima, no es un render congelado).
- Con el scroll en 20 % y en 80 %, `data-progreso` cambia y la captura del lienzo es distinta: eso es el movimiento, no una promesa.
- `preflight_rendimiento` no reporta geometría sin `dispose` ni texturas fuera de medida; el pixel ratio queda capado en 2.

## No hacer

- No importar three desde unpkg/jsdelivr/esm.sh: la obra queda casada a la red y la cerradura manda CSP `'self'`.
- No escribir el JS de la escena en el HTML «para probar»: la regla `csp-ausente` lo marca y el archivo aparte es lo que se puede parchear.
- No usar `getPoint(t)` para un recorrido: el parámetro no es longitud de arco, el carrito se frena y se acelera en las curvas.
- No decir «se mueve con el scroll» sin los dos fotogramas distintos: es el mismo `ok` mentiroso que los espejos sin poderes devolvían.
- No ofrecer la escena como terminada si `preparar-vendor-3d` falló: se informa el 404 del motor, no se disfraza de CSS plano.

## Evidencia en el repo

- `vendor/three/three.module.js`
- `vendor/three/vendor-3d.json`
- `scripts/preparar-vendor-3d.mjs`
- `src/engine/cerradura.ts`
- `server/sandboxEstatico.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
