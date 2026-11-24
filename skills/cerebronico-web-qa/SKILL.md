---
name: cerebronico-web-qa
description: Qué comprueba el auditor del pack creador, con qué severidad y qué NO puede comprobar. Leer antes de prometer que una página "está bien".
user_invocable: true
---

# Auditoría web del pack creador — qué significa cada veredicto

Niveles: `error` (impide publicar), `aviso` (cuesta posicionamiento/accesibilidad),
`info` (mejora opcional). `publicable` = **0 errores y 0 marcadores** sin rellenar.

| Código | Nivel | Qué comprueba realmente | Por qué importa |
|---|---|---|---|
| `doctype`, `html`, `lang` | error | `<html lang=…>` presente | sin `lang` los lectores de pantalla eligen mal el idioma |
| `viewport` | error | meta viewport con `content=` | sin ella la página no escala en móvil |
| `title`, `title-corto/largo` | error/aviso | `<title>` y longitud 10-65 | es lo que se ve en buscadores y pestañas |
| `descripcion`, `descripcion-larga` | error/aviso | meta description y ≤160 | snippet recortado = clics perdidos |
| `h1`, `h1-multiples`, `heading-salto` | error/aviso | un solo h1 y sin saltos de nivel | estructura semántica y navegación por encabezados |
| `img-alt` | error | cada `<img>` con `alt=` | accesibilidad y búsqueda por imagen |
| `label-huerfano`, `control-vacio` | error | input con `<label for>` o `aria-label`; botón/enlace con texto | un campo sin etiqueta es inusable con lector |
| `ancla-rota` | error | todo `href="#x"` tiene su `id` | navegación interna muerta |
| `archivo-faltante` | error | los `src`/`href` locales existen en disco | 404 que el HTML no avisa |
| `sin-cerrar` | error | balance apertura/cierre de `div/section/main/header/footer/nav/article/form/ul/ol/table` | el navegador "repara" y el diseño se rompe en otro lado |
| `js-bloqueante` | aviso | `<script src>` en `<head>` sin `defer`/`async` | primer pintado lento |
| `img-lazy` | aviso | imágenes sin `loading="lazy"` | peso innecesario al cargar |
| `og`, `twitter`, `manifest`, `sw`, `peso`, `estilo-inline` | aviso/info | metadatos sociales, PWA, tamaño del HTML | compartibilidad y mantenibilidad |
| `marcadores` | aviso | quedan `[Personaliza este texto]` | **el sitio no es entregable con texto inventado** |
| `sin-main`, `sin-skip`, `canonical` | aviso/info | región principal y enlace de salto | accesibilidad y SEO |

## Lo que el auditor NO puede saber (dilo, no lo prometas)

- Contraste real de color, legibilidad tipográfica y que el diseño "se vea bien".
- Que los textos sean verdad: no comprueba precios, cifras ni afirmaciones del negocio.
- Renderizado JS, compatibilidad entre navegadores, rendimiento en red real (Lighthouse).
- Contenido duplicado, enlaces externos rotos, ni cumplimiento legal (cookies, RGPD).

## Autocorrección segura

`mejorar_pagina` solo toca lo que es objetivamente mejorable sin criterio humano:
`doctype`, `lang="es"`, viewport, `description` **derivada del primer párrafo** (hay que
revisar la redacción), `alt=""` en imágenes decorativas y `defer` en scripts del head.
Todo lo demás se reporta con su `correccion` para que decida un humano. Escribe con
snapshot previo en `.creador/historial/`.
