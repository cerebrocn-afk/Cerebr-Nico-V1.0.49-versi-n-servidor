---
name: cerebronico-creador
description: Crear aplicaciones web y páginas con el pack creador-web de CerebroNico — tipos, bloques, paletas, PWA y entregable honesto. Leer antes de generar cualquier sitio.
user_invocable: true
---

# Creador de sitios y apps web (pack `creador-web`, `:5102`)

Genera HTML+CSS+JS **sin frameworks**, determinista, dentro de `.creador/`. No inventa
contenido: donde faltan datos queda `[Personaliza este texto]`.

## Flujo correcto

1. `plantillas_disponibles` → mira `tipos_de_sitio` (recetas), `bloques`, `paletas`.
2. `crear_sitio` con el brief real del usuario: `nombre`, `tipo`, `titulo`, `subtitulo`,
   `cta`, `contacto`, `descripcion`, y los arrays de contenido (`caracteristicas`,
   `pasos`, `planes`, `testimonios`, `faq`, `galeria`, `equipo`).
   - `sobrescribir: true` solo si el usuario pide regenerar (deja snapshot).
   - Un `nombre` con `/` o `..` **se rechaza**: no se sanitiza a escondidas.
3. **Audita antes de entregar**: `auditar_pagina` / `auditar_sitio`. El veredicto es
   `publicable` solo con 0 errores **y** 0 marcadores sin rellenar.
4. Si hay fallos corregibles: `mejorar_pagina` en seco (informa) → `aplicar: true`
   escribe y deja snapshot.
5. `crear_pwa` (manifest + service worker + registro) y `crear_og_image` si toca.
6. `previsualizar_sitio` dice cómo verla. **El pack nunca levanta servidores.**

## Elecciones de diseño (no las cambies a ojo)

- Paleta: `noche`, `claro`, `calido`, `bosque`, `violeta`. Tipografía: `sistema`,
  `humanista`, `mono`. La escala tipográfica es una sola (1.25) desde `:root`.
- Todo lo que el usuario escribe pasa por escape HTML: el contenido no se inyecta
  como marcado.
- Los bloques van entre `<!-- bloque:X:inicio -->` / `fin`: permiten reemplazar uno
  sin tocar el resto. `crear_bloque` inserta **antes del pie** (no arriba).
- Accesibilidad incluida por plantilla: skip-link, `lang`, `aria-expanded` en el menú,
  `aria-live` en errores del formulario, foco visible, `prefers-reduced-motion`.

## Límites honestos que hay que decir al usuario

- Un `og-image.svg` no lo aceptan todas las redes: hace falta PNG para publicar.
- El service worker solo funciona en `https` o `localhost`, y la caché se ve tras
  dos recargas.
- El formulario generado valida en cliente pero **no envía**: no hay backend. Para
  recibir mensajes hace falta un destino real (servicio de formularios o backend).
- Nada de esto sustituye a un diseño hecho a medida: es una base sana, auditable y
  sin deudas típicas de plantilla.

## ENTREGA (v1.21.0): publicar es probar

- `exportar_sitio_zip` produce un ZIP **determinista**: mismo contenido → mismo
  sha256. Antes de exportar, `listar_exportaciones`: si el hash ya está, no hay
  nada que subir.
- `desplegar_carpeta` corre **en seco primero** (siempre) y solo a raíces
  autorizadas (`CN_CREADOR_EXTRA_ROOTS`); `aplicar:true` copia y deja
  `.cerebronico-despliegue.json`.
- Después de desplegar, la entrega NO es válida sin `verificar_despliegue`:
  veredicto `identico` o lista nombrada de lo que falta/sobra/difiere.
- `generar_hreflang` **declara idiomas, no los inventa**: sin `base_url` se
  niega, y lista las traducciones que faltan. Nunca prometas un sitio
  multiidioma con páginas que no existen.

## FORJA EN BUCLE (v1.24.0): un brief → un ZIP verificado, a prueba de errores

- `forjar_y_entregar` hace el ciclo completo de un tirón: crea el sitio desde el
  brief, lo **auto-mejora por rondas** (audita → corrige lo corregible → vuelve a
  auditar) y exporta un ZIP que **abre y comprueba** antes de darlo por bueno
  (CRC de cada entrada, `index.html` presente y cotejo del sha256 declarado).
- **Nunca tumba la línea**: cada paso corre en su propia red (try/except), así que
  un fallo en una ronda no aborta la entrega — se refleja en el veredicto, no en
  una excepción.
- Devuelve uno de tres veredictos, sin adornos:
  - `entregable`: 0 errores y 0 marcadores — el ZIP se puede publicar.
  - `entregable_con_reservas`: el ZIP es íntegro y usable, pero quedan
    `[Personaliza este texto]` u observaciones — se entrega diciendo la verdad.
  - `no_entregable`: no se logró un ZIP verificado; explica en qué paso paró.
- Determinista: mismo brief → mismo sha256 (se puede confiar el diff entre
  entregas). Usa esta herramienta cuando el usuario quiere «hazme el sitio y
  dame el archivo» sin conducir paso a paso el flujo de arriba.

## RUTA DE TRABAJO (v1.24.0): primero PLANIFICAR, luego EJECUTAR EN PARALELO

Capa para «evolucionar» un proyecto entero cuando hay muchos archivos: **nada se
crea hasta que el plan valida**, y luego se crea **en segundo plano paralelo** con
bucle de autocorrección. Tres herramientas:

- `planificar_ruta_trabajo` — desde la orden inicial documenta la lista de
  requisitos y **TODOS** los artefactos a crear y los **VALIDA ANTES de crear
  nada**: ruta segura (sin `..`, ni absoluta, ni caracteres raros), tipo conocido,
  sin duplicados y con una herramienta que **exista** para construirlo. Lo que no
  pasa queda **bloqueado con su motivo**. Agrupa lo validado en **lotes de 4-6**.
  Es HONESTO: con pendientes o bloqueados, `listo_para_lanzar=false`. **Ni un byte
  se escribe en esta fase.** La `lista_requerida` empieza incompleta a propósito.
- `crear_archivo` — escritor **race-free** de UN archivo dentro del sitio (no toca
  navegación ni sitemap, por eso sirve para el paralelo). Valida la ruta, devuelve
  `sha256`, y si no pasas `contenido` deja `[Personaliza este texto]` — **no
  inventa**.
- `ejecutar_ruta_paralelo` — corre los lotes en **SEGUNDO PLANO PARALELO REAL**
  (hilos), cada artefacto en su **bucle de autocorrección** (audita → corrige lo
  corregible → reaudita hasta limpio o agotar presupuesto). **MIDE el solape real**
  con marcas de tiempo (`paralelismo_maximo_medido`) — no lo promete. Se **niega a
  lanzar** si el plan no está listo (salvo `forzar:true`, que omite los
  bloqueados a sabiendas). Veredictos honestos por archivo
  (`valido`/`valido_con_reservas`/`fallido`) y global
  (`completado`/`completado_con_reservas`/`incompleto`); la lista requerida se
  cierra **solo con lo que validó**.
- Flujo típico: `planificar_ruta_trabajo` → revisar bloqueados/pendientes →
  `ejecutar_ruta_paralelo` → (opcional) `forjar_y_entregar`/`exportar_sitio_zip`
  para entregar el ZIP. Primero la ruta, luego el paralelo.
