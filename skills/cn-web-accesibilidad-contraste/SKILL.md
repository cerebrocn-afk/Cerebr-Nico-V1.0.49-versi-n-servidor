---
name: cn-web-accesibilidad-contraste
description: Usar `auditar_contraste` para cumplir AA/WCAG con números, no con sensación. Usarla ante «se lee mal», «cansavista», textos gris claro sobre blanco o cualquier obra que busque serio.
version: 1.0.0
dominio: web
estado: probada
requiere: [auditar_contraste, mejorar_pagina, componente_modo_oscuro]
evidencia: [src/engine/reflejo/consejo.ts, scripts/creador_daemon.py]
---
# Contraste y legibilidad medidos

> Usar `auditar_contraste` para cumplir AA/WCAG con números, no con sensación. Usarla ante «se lee mal», «cansavista», textos gris claro sobre blanco o cualquier obra que busque serio.

## Herramientas que usa (todas existen en este build)

`auditar_contraste` · `mejorar_pagina` · `componente_modo_oscuro`

## Receta

1. Medir los pares texto/fondo reales y anotar la ratio de cada uno.
2. Ajustar tokens (no cada etiqueta) hasta pasar AA; AAA donde el texto es largo.
3. Volver a medir en los dos temas si hay modo oscuro.

## Cómo se verifica (con números, no con adverbios)

- Cada afirmación de accesibilidad trae su ratio.
- El texto chico y las placeholders también pasaron.

## No hacer

- No declarar WCAG AAA sin la medición al lado: es un claim, no un dato.

## Evidencia en el repo

- `src/engine/reflejo/consejo.ts`
- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
