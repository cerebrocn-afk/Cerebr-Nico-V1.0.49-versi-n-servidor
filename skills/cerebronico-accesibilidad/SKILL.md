---
name: cerebronico-accesibilidad
description: Auditoría y arreglo de accesibilidad web (WCAG) — contraste, teclado, semántica, ARIA y lectores de pantalla. Leer antes de entregar cualquier UI o página del creador-web.
user_invocable: true
---

# Accesibilidad (WCAG) — una UI que nadie puede usar no está terminada

La accesibilidad no es un extra al final: es parte de "funciona". Se comprueba con
criterios concretos, no con la impresión de que "se ve bien".

## Lista de verificación (bloqueantes primero)

1. **Semántica real**: usa `<button>`, `<nav>`, `<main>`, `<h1..h6>` en orden, no
   `<div onclick>`. Un solo `<h1>` por página, jerarquía sin saltos.
2. **Teclado**: todo lo operable con ratón debe serlo con Tab/Enter/Espacio. Foco
   visible siempre (`:focus-visible`), sin trampas de foco, orden lógico.
3. **Texto alternativo**: `alt` con sentido en imágenes informativas; `alt=""` en
   las decorativas. Iconos-botón necesitan `aria-label`.
4. **Contraste**: texto normal ≥ 4.5:1, texto grande ≥ 3:1. No transmitas
   información solo por color (añade texto o icono).
5. **Formularios**: cada campo con `<label>` asociado; errores con `aria-live` y
   descripción del arreglo, no solo un borde rojo.
6. **ARIA con medida**: ARIA correcto ayuda; ARIA mal puesto rompe. La primera
   regla de ARIA es no usar ARIA si hay un elemento nativo que ya lo hace.

## Extras que suman

- `lang` en `<html>`, `skip-link` al contenido, `prefers-reduced-motion`
  respetado, `aria-expanded` en menús desplegables. (El creador-web ya trae esta
  base por plantilla — no la desmontes al personalizar.)

## Cómo verificar (honesto)

- Recorre la página **solo con teclado**: ¿llegas a todo y ves dónde estás?
- Comprueba contraste con un ratio calculado, no a ojo.
- Un chequeo automático (axe, Lighthouse) atrapa ~30-40%; el resto es manual.
  Reporta qué comprobaste y qué no — "sin errores automáticos" no es "accesible".
