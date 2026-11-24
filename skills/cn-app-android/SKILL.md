---
name: cn-app-android
description: Bajar de la idea «es una app» al proyecto android/ que compila — SDK piso, assets copiados de verdad y pérdidas declaradas. Usarla cuando el usuario pide APK, Android, instalable en el teléfono o «que ande sin navegador».
version: 1.0.0
dominio: app
estado: probada
requiere: [exportar_apk, read_file, list_files, run_command]
evidencia: [src/engine/androidProyecto.ts, src/engine/apkBuild.ts, server/fabricaApk.ts]
---
# Exportar la app a proyecto Android real

> Bajar de la idea «es una app» al proyecto android/ que compila — SDK piso, assets copiados de verdad y pérdidas declaradas. Usarla cuando el usuario pide APK, Android, instalable en el teléfono o «que ande sin navegador».

## Herramientas que usa (todas existen en este build)

`exportar_apk` · `read_file` · `list_files` · `run_command`

## Receta

1. Primero el sitio: sin obra web no hay Android. Verificar con `list_files` que los assets existen en disco.
2. Emitir el proyecto con la herramienta y leer lo que DEVOLVIÓ (archivos, piso de API, advertencias), no lo que se esperaba.
3. Declarar lo que no se emite (gradle-wrapper.jar, el release sin firmar) en la misma respuesta, con la orden que falta.

## Cómo se verifica (con números, no con adverbios)

- La ruta del proyecto generado existe y `list_files` la muestra.
- minSdk/compileSdk coinciden con los del generador (no se reescribieron a mano).

## No hacer

- No prometer un APK firmado: si no hay keystore, se dice que falta y se entrega el proyecto.

## Evidencia en el repo

- `src/engine/androidProyecto.ts`
- `src/engine/apkBuild.ts`
- `server/fabricaApk.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
