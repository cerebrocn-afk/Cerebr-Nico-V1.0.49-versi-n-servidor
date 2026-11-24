---
name: cn-entrega-como-se-abre
description: Acompañar la entrega con la ruta exacta, el orden para armarla y qué hace falta tener instalado. Usarla cuando el usuario no es desarrollador o cuando la obra tiene varias piezas.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [crear_docx, crear_pdf, list_files, run_command]
evidencia: [src/engine/entregaRitual.ts, src/engine/explicacionArtefacto.ts]
---
# Instrucciones que funcionan sin uno al lado

> Acompañar la entrega con la ruta exacta, el orden para armarla y qué hace falta tener instalado. Usarla cuando el usuario no es desarrollador o cuando la obra tiene varias piezas.

## Herramientas que usa (todas existen en este build)

`crear_docx` · `crear_pdf` · `list_files` · `run_command`

## Receta

1. Escribir la hoja de apertura (qué es, dónde está, cómo se abre, qué hacer si falla) y entregarla como .docx o .pdf.
2. Probar las instrucciones siguiendo las propias palabras una vez.
3. Nombrar dependencias reales (Python embebido sin pip, Node, navegador) y no dar por supuesto nada del equipo del usuario.

## Cómo se verifica (con números, no con adverbios)

- Un paso de la hoja fue ejecutado realmente y funcionó.
- No hay «etc.» ni «y listo» en el medio de un procedimiento.

## No hacer

- No explicar la arquitectura cuando lo que hace falta es el doble clic.

## Evidencia en el repo

- `src/engine/entregaRitual.ts`
- `src/engine/explicacionArtefacto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
