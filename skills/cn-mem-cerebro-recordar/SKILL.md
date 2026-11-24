---
name: cn-mem-cerebro-recordar
description: Usar `cerebro_recordar` / `cerebro_consultar` para las decisiones y preferencias del proyecto. Usarla al tomar una decisión que va a durar más que este turno.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [cerebro_recordar, cerebro_consultar, update_task, read_file]
evidencia: [src/engine/cerebroOrgano.ts, src/engine/cerebroModelo.ts]
---
# Recordar y consultar el cerebro del IDE

> Usar `cerebro_recordar` / `cerebro_consultar` para las decisiones y preferencias del proyecto. Usarla al tomar una decisión que va a durar más que este turno.

## Herramientas que usa (todas existen en este build)

`cerebro_recordar` · `cerebro_consultar` · `update_task` · `read_file`

## Receta

1. Antes de decidir, consultar: puede haber una decisión previa con su motivo.
2. Después de decidir, registrar una línea con qué, por qué y desde cuándo.
3. Si la consulta y la práctica actual divergen, se lo dice al usuario en vez de elegir en silencio.

## Cómo se verifica (con números, no con adverbios)

- Las decisiones nuevas tienen su registro.
- Nada registrado contradice una preferencia explícita del usuario.

## No hacer

- No guardar en el cerebro lo que solo sirve para este turno (eso es ruido).

## Evidencia en el repo

- `src/engine/cerebroOrgano.ts`
- `src/engine/cerebroModelo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->
