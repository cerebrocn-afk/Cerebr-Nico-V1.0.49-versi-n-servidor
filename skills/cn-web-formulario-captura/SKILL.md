---
name: cn-web-formulario-captura
description: Montar formulario con validación, consentimiento y destino explícito. Usarla cuando el usuario pide «que puedan escribirme», «juntar correos» o «reservar turno».
version: 1.0.0
dominio: web
estado: probada
requiere: [formulario_destino, componente_consentimiento, crear_bloque, auditar_pagina]
evidencia: [scripts/creador_daemon.py]
---
# Formulario de captura que llega a algún lado

> Montar formulario con validación, consentimiento y destino explícito. Usarla cuando el usuario pide «que puedan escribirme», «juntar correos» o «reservar turno».

## Herramientas que usa (todas existen en este build)

`formulario_destino` · `componente_consentimiento` · `crear_bloque` · `auditar_pagina`

## Receta

1. Preguntar el destino real del envío (correo, endpoint, servicio) antes de escribir el formulario.
2. Incluir consentimiento explícito cuando se piden datos personales.
3. Probar el envío y decir dónde cae, con ejemplo de mensaje recibido.

## Cómo se verifica (con números, no con adverbios)

- Hay una prueba de envío exitosa y su destino nombrado.
- El honeypot/validación no bloquea al usuario real.

## No hacer

- No dejar un formulario sin backend diciendo «ya está»: capturar sin recibir es peor que no capturar.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
