---
name: cn-web-ruta-de-trabajo
description: Planificar y ejecutar la ruta de construcción con ramas paralelas cuando hay páginas independientes. Usarla en sitios multipágina, catálogos y tanda de componentes.
version: 1.0.0
dominio: web
estado: probada
requiere: [planificar_ruta_trabajo, ejecutar_ruta_paralelo, estado_creador, auditar_sitio]
evidencia: [scripts/creador_daemon.py, src/engine/planExecutors.ts]
---
# Ruta de trabajo con ramas en paralelo

> Planificar y ejecutar la ruta de construcción con ramas paralelas cuando hay páginas independientes. Usarla en sitios multipágina, catálogos y tanda de componentes.

## Herramientas que usa (todas existen en este build)

`planificar_ruta_trabajo` · `ejecutar_ruta_paralelo` · `estado_creador` · `auditar_sitio`

## Receta

1. Ramificar solo lo que no comparte archivo; navegación, tokens y layout van en una sola rama.
2. Ejecutar y leer el estado de cada rama, incluidas las que no hicieron nada.
3. Cerrar con auditoría de sitio, que es donde se ven las incoherencias entre ramas.

## Cómo se verifica (con números, no con adverbios)

- Cada rama tiene resultado o motivo de no-ejecución.
- No hay dos ramas escribiendo el mismo archivo.

## No hacer

- No paralelizar creación y auditoría de la misma página: la auditoría lee lo viejo.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/planExecutors.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
