---
name: cn-web-modo-oscuro
description: Añadir tema oscuro con variables CSS y respeto por `prefers-color-scheme`, midiendo contraste. Usarla cuando piden «que se vea moderno» o cuando el sitio fuerza blanco puro.
version: 1.0.0
dominio: web
estado: probada
requiere: [componente_modo_oscuro, auditar_contraste, crear_bloque]
evidencia: [scripts/creador_daemon.py, src/engine/aspecto.ts]
---
# Modo oscuro sin pagar accesibilidad

> Añadir tema oscuro con variables CSS y respeto por `prefers-color-scheme`, midiendo contraste. Usarla cuando piden «que se vea moderno» o cuando el sitio fuerza blanco puro.

## Herramientas que usa (todas existen en este build)

`componente_modo_oscuro` · `auditar_contraste` · `crear_bloque`

## Receta

1. Definir tokens de color una sola vez (claro/oscuro) y usarlos en todo el sitio.
2. Activar con preferencia del sistema más un interruptor manual.
3. Correr `auditar_contraste` en los DOS temas; el contraste se mide, no se estima.

## Cómo se verifica (con números, no con adverbios)

- Contraste aprobado en claro y en oscuro.
- Ningún texto duro en blanco/negro fuera de los tokens.

## No hacer

- No invertir colores con un filtro: rompe imágenes y legibilidad.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/aspecto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
