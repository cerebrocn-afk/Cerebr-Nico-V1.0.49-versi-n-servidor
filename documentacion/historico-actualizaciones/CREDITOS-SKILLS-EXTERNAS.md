# Créditos y licencias — skills importadas (v1.53.1)

El motor incorpora 76 skills de terceros en formato `SKILL.md` dentro de
`skills/`. Se integran como PROCEDIMIENTOS consultables bajo demanda
(`listar_skills`/`leer_skill`), no como código del motor. Atribución:

## claude-skills — 16 skills (prefijo `ck-`)
- **Autor:** Maki Chiba (MakiDevelop)
- **Licencia:** MIT (c) 2026
- **Origen:** https://github.com/MakiDevelop/claude-skills
- Nota del upstream: el catálogo público está «congelado» (snapshot). Varias
  skills están en chino/inglés y asumen el CLI de Claude Code; se sirven
  igualmente como guía, marcando lo que no aplica aquí.

## ai-kit — 60 skills (prefijo `ak-<pack>-`)
- **Autor:** Smicolon (@smicolon)
- **Licencia:** MIT (c) 2024-2026
- **Origen:** https://github.com/smicolon/ai-kit
- Packs de convenciones por framework: architect, better-auth, clarify,
  dev-loop, django, failure-log, flutter, hono, infisical, nestjs, nextjs,
  nuxtjs, onboard, react-review, tanstack-router, worktree. Son guías de
  convención; su valor es como lista de verificación, no como capacidad
  automática del motor.

## awesome-skills — catálogo (no es código)
- **Licencia:** Apache-2.0
- **Origen:** https://github.com/ (awesome-skills)
- No contiene skills ejecutables: es un índice de enlaces. Se incorporó como
  documentación de referencia en `documentacion/awesome-skills-catalogo.md`.

---
Todas las licencias de origen (MIT / Apache-2.0) permiten la redistribución con
atribución. Este archivo cumple ese requisito. Los textos íntegros de licencia
de cada proyecto se conservan junto a sus skills cuando el upstream los incluyó.
