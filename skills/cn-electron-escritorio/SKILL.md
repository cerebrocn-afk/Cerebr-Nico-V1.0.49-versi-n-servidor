---
name: cn-electron-escritorio
description: Cambiar la capa de Electron (ventana, menús, arranque) sabiendo qué se rompe del pipeline web. Usarla cuando el síntoma es «en la app de escritorio no», no «en el navegador no».
version: 1.0.0
dominio: app
estado: probada
requiere: [read_file, edit_file, run_command, revisar_cambios]
evidencia: [electron-main.cjs, src/engine/raizDatos.ts]
---
# Andar por el envoltorio de escritorio

> Cambiar la capa de Electron (ventana, menús, arranque) sabiendo qué se rompe del pipeline web. Usarla cuando el síntoma es «en la app de escritorio no», no «en el navegador no».

## Herramientas que usa (todas existen en este build)

`read_file` · `edit_file` · `run_command` · `revisar_cambios`

## Receta

1. Leer `electron-main.cjs` en el rango del síntoma (ciclo de vida de ventana, paths de datos).
2. Distinguir el entorno: `.cjs` de main no comparte contexto con el bundle de Vite.
3. Probar con el build real (`npm run build`) y no solo con `npm run dev`.

## Cómo se verifica (con números, no con adverbios)

- El cambio se ve en la ventana real, no solo en el navegador.
- El presupuesto de líneas del monolito no se tocó.

## No hacer

- No importar módulos ESM en main sin verificar que el empaquetado los resuelve.

## Evidencia en el repo

- `electron-main.cjs`
- `src/engine/raizDatos.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
