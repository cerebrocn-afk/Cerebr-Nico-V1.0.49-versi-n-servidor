# Borrador de orden del catálogo de skills — FASE 15 (PARA REVISAR, NADA APLICADO)

## 0 · Lectura de 30 segundos

**200 skills · 121 sanas · 79 rotas.** Con `capa:` 0, con `cuando_no_usar:` 0.

Agrupado **por arreglo**, no por skill: decidir 78 rutas de a una no lo hace nadie, y esta es la lista que el plano pide tener delante antes de tocar nada. Nada de lo que sigue fue aplicado.

## 1 · Los grupos

### `nombre_distinto` — 64 skills

**Qué hay que decidir:** Alinear carpeta y `name:`. Es mecánico y toca rutas: una reasignación masiva es UNA decisión tuya, no mía. Elegir criterio: ¿manda el frente (renombrar 78 carpetas) o manda la ruta (reescribir 78 frentes)?

- `ak-architect-mermaid-architect` — el frente dice `mermaid-architect`
- `ak-better-auth-explain-error` — el frente dice `explain-error`
- `ak-clarify-execution-context-builder` — el frente dice `execution-context-builder`
- `ak-clarify-flow-detector` — el frente dice `flow-detector`
- `ak-clarify-flow-selector` — el frente dice `flow-selector`
- `ak-dev-loop-tdd-planner` — el frente dice `tdd-planner`
- `ak-django-import-convention-enforcer` — el frente dice `django-import-enforcer`
- `ak-django-migration-safety-checker` — el frente dice `migration-safety-checker`
- `ak-django-model-entity-validator` — el frente dice `model-entity-validator`
- `ak-django-performance-optimizer` — el frente dice `performance-optimizer`
- … y 54 más (listado completo: `npm run skills:auditar -- --json`)

### `nombre_invalido+nombre_distinto` — 13 skills

**Qué hay que decidir:** El mismo par de arriba, listado por otro orden de detección.

- `ak-better-auth-auth-security` — el frente dice `Auth Security Patterns`
- `ak-better-auth-better-auth-patterns` — el frente dice `Better Auth Patterns`
- `ak-tanstack-router-ai-patterns` — el frente dice `TanStack AI Patterns (Alpha)`
- `ak-tanstack-router-db-patterns` — el frente dice `TanStack DB Patterns (Beta)`
- `ak-tanstack-router-devtools-patterns` — el frente dice `TanStack DevTools Patterns`
- `ak-tanstack-router-form-patterns` — el frente dice `TanStack Form Patterns`
- `ak-tanstack-router-pacer-patterns` — el frente dice `TanStack Pacer Patterns (Beta)`
- `ak-tanstack-router-query-patterns` — el frente dice `TanStack Query Patterns`
- `ak-tanstack-router-router-patterns` — el frente dice `TanStack Router Patterns`
- `ak-tanstack-router-store-patterns` — el frente dice `TanStack Store Patterns (Alpha)`
- … y 3 más (listado completo: `npm run skills:auditar -- --json`)

### `sin_frontmatter` — 1 skills

**Qué hay que decidir:** Escribir el frente (`name` + `description`). Son las peores para el índice: sin metadata, nadie las enruta y existen sólo si el usuario las nombra a mano.

- `mcp-server-main`

### `nombre_distinto+sin_descripcion` — 1 skills

**Qué hay que decidir:** ver el acta por skill; la causa está nombrada línea por línea.

- `skills-main` — el frente dice `unblocked`

## 2 · Lo que este borrador NO propone

- **Borrar ni fusionar nada.** Las 15 `cn-*` con frente YAML ilegible ya se repararon en la causa (generador comillado, FASE 15/v2.3.18) y eso sí está aplicado y vallado.
- **Renombrar en caliente.** Rearmar 78 rutas sin que veas la lista es el cambio silencioso que este repo persigue desde la FASE 11.
- **Tocar el catálogo de tu PC.** Este conteo es de `app/skills`, el que viaja en el paquete. El tuyo se mide con `npm run skills:auditar:pc` y sale con el mismo formato.

## 3 · Cómo se ejecuta la decisión, cuando la tome

1. Elegís criterio (¿manda el frente o manda la carpeta?) y si las `cuerpo_corto` se escriben o se retiran.
2. Lo aplico sobre la lista de arriba, en un solo asiento de versión, con `auditar-skills` corriendo antes y después y los números en el CHANGELOG.
3. Si algún nombre se usa en otro lado del repo, lo busca la valla de conexiones: renombrar sin ajustar al que llama es cómo una skill reparada deja de estar viva.

