---
name: cn-web-desplegar-verificado
description: Copiar la obra al destino, verificar lo que quedó allá y poder responder «¿ya está publicado?». Usarla cuando el usuario habla de publicar, subir, hosting o carpeta de producción.
version: 1.0.0
dominio: web
estado: probada
requiere: [desplegar_carpeta, verificar_despliegue, listar_exportaciones, previsualizar_sitio]
evidencia: [scripts/creador_daemon.py, src/engine/entregaRitual.ts]
---
# Desplegar y verificar el despliegue

> Copiar la obra al destino, verificar lo que quedó allá y poder responder «¿ya está publicado?». Usarla cuando el usuario habla de publicar, subir, hosting o carpeta de producción.

## Herramientas que usa (todas existen en este build)

`desplegar_carpeta` · `verificar_despliegue` · `listar_exportaciones` · `previsualizar_sitio`

## Receta

1. Confirmar el destino real con el usuario (carpeta o URL); un despliegue a la carpeta equivocada es una pérdida de trabajo ajeno.
2. Desplegar y después VERIFICAR con la herramienta, leyendo la lista de archivos en destino.
3. Mostrar el registro (`listar_exportaciones`) y decir qué versión se publicó.

## Cómo se verifica (con números, no con adverbios)

- Hay verificación posterior, no solo orden de copia.
- Se nombró el destino exacto al que fue la obra.

## No hacer

- No decir «publicado» si nadie abrió la URL ni se leyó el manifiesto de destino.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/entregaRitual.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
