---
name: cn-dependencias-sanas
description: Chequear que lo declarado en package.json sea lo que se usa y lo que hay en disco, y decidir si una dependencia nueva vale el peso. Usarla antes de `npm install` y después de limpiar código.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [run_command, read_file, search_in_files, list_files]
evidencia: [src/engine/dependenciasProyecto.ts, src/engine/pivotProveedores.ts]
---
# Auditoría de dependencias antes de instalar

> Chequear que lo declarado en package.json sea lo que se usa y lo que hay en disco, y decidir si una dependencia nueva vale el peso. Usarla antes de `npm install` y después de limpiar código.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `search_in_files` · `list_files`

## Receta

1. Comparar `package.json` contra los imports reales (`search_in_files` de `from "` por paquete).
2. Antes de instalar: preguntar si el Python embebido o el navegador pueden hacerlo sin paquete (el Python embebido trae 0 paquetes de pip: una idea ahí es humo).
3. Registrar en la respuesta qué se agregó y qué se sacó.

## Cómo se verifica (con números, no con adverbios)

- No hay dependencias declaradas sin uso.
- La puerta sigue verde con el cambio de dependencias.

## No hacer

- No instalar un paquete para resolver en el motor lo que una herramienta ya resuelve.

## Evidencia en el repo

- `src/engine/dependenciasProyecto.ts`
- `src/engine/pivotProveedores.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
