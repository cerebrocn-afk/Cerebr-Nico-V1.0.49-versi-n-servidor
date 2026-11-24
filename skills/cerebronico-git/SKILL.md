---
name: cerebronico-git
description: Operaciones Git seguras — commits atómicos, ramas, diffs y recuperación sin destruir historia. Leer antes de commitear, cambiar de rama o ejecutar cualquier comando git que borre trabajo.
user_invocable: true
---

# Git seguro (la historia no se borra a la ligera)

Git es la otra red de seguridad del quirófano. Las operaciones que crean historia
son libres; las que la destruyen requieren permiso explícito del usuario.

## Se puede sin preguntar

- `git status`, `git diff`, `git log`, `git show` — lectura, siempre.
- Crear rama (`git switch -c`), añadir archivos concretos (`git add <ruta>`).
- Commit **solo cuando el usuario lo pide explícitamente**. Si hay duda, se
  pregunta antes; no se commitea por iniciativa propia.

## Requiere permiso explícito (destructivo)

- `git reset --hard`, `git clean -f`, `git push --force`, `git branch -D`,
  `git rebase` sobre historia publicada. Explica qué se pierde y si es reversible.
- **Nunca** `push` directo a `main`/`master` salvo orden clara.

## Buenas prácticas de la casa

1. **Commits atómicos**: un commit = un cambio con sentido. `git add <rutas>`
   concretas, nunca `git add .` a ciegas (evita colar archivos no relacionados).
2. **Antes de commitear**: revisa `git diff --staged` y descarta secretos
   (`.env`, claves, tokens). Un archivo sospechoso se avisa, no se commitea.
3. **Mensaje**: título imperativo y corto (< 70 car.); el cuerpo explica el porqué.
4. **No toques la config de git** del usuario ni saltes hooks (`--no-verify`)
   salvo que lo pida.
5. **Prefiere commits nuevos** sobre `--amend`; solo enmienda tus propios commits
   sin publicar.

## Recuperación sin pánico

- Trabajo perdido reciente: `git reflog` → casi todo commit queda referenciado.
- Deshacer un commit publicado: `git revert` (crea uno inverso), no `reset --hard`.
- Guardar temporal: `git stash push -m "..."` en vez de descartar.

Esto convive con el quirófano (`snapshot`/`revertir`): git es para historia
compartida; el quirófano, para la red de seguridad dentro del turno.
