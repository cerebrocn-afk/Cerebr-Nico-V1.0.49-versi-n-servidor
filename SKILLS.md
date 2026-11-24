# SKILLS.md — Índice de habilidades (v1.53.1)

> Las skills se sirven AL MODELO bajo demanda vía las herramientas del pack
> `memoria-hindsight`: `listar_skills` (fichas cortas) y `leer_skill` (contenido
> completo de `skills/<nombre>/SKILL.md` u otro archivo .md/.txt/.json interno).
> No ocupan el prompt de sistema: se cargan solo cuando hacen falta.
>
> Regla de honestidad (cerebro.md §2.1): una skill leída es un PROCEDIMIENTO, no
> una capacidad verificada. Si el paso falla, se dice que falló.

| Skill | Cuándo usarla | Origen |
|---|---|---|
| `hindsight-architect` | Rediseñar/ampliar la capa de memoria: plan de bancos, tags, consolidación | vectorize-io/hindsight |
| `hindsight-local` | Recordar/aprender con `hindsight-embed` (daemon local, Ollama compatible) | vectorize-io/hindsight |
| `hindsight-cloud` | Memoria compartida de equipo vía Hindsight Cloud (CLI `hindsight`) | vectorize-io/hindsight |
| `hindsight-self-hosted` | Memoria contra un servidor Hindsight propio (Docker / `npm run hindsight:server`) | vectorize-io/hindsight |
| `hindsight-docs` | Documentación técnica completa (API, configuración, SDKs) en `references/` | vectorize-io/hindsight |
| `code-review` | Revisión de cambios tras implementar: tests faltantes, tipos, dead code, convenciones | vectorize-io/hindsight (SKILL.md raíz) |
| `cerebronico-memoria` | Protocolo de la capa: qué recordar, qué aprender, cómo repasarse, qué NUNCA guardar | propia (v1.18.0) |
| `cerebronico-verificar` | Ritual de cierre: validar → superficie → manifiesto → CRLF → prueba desde extracción | propia (v1.18.0) |
| `cerebronico-creador` | Crear sitios y apps web con el pack `creador-web`: flujo, bloques, límites honestos | propia (v1.19.0) |
| `cerebronico-creador-bucle` | Dejar la construcción del sitio en manos del bucle autónomo: plan, guion y parada honesta | propia (v1.20.0) |
| `cerebronico-web-qa` | Qué comprueba el auditor y con qué severidad; qué NO puede comprobar | propia (v1.19.0) |
| `cerebronico-ecosistema` | Puntos de enganche P1-P4 y criterios para adoptar herramientas externas | propia (v1.18.0) |
| `cerebronico-refactor` | Refactor multi-archivo seguro: renombrar/extraer/mover con puertas de verificación | propia (v1.24.0) |
| `cerebronico-depurador` | Depuración sistemática: reproducir → causa raíz → arreglo → prueba de regresión | propia (v1.24.0) |
| `cerebronico-git` | Git seguro: commits atómicos, ramas, recuperación; destructivo solo con permiso | propia (v1.24.0) |
| `cerebronico-datos` | Análisis/ETL de CSV/JSON/xlsx locales sin inventar cifras, con verificación | propia (v1.24.0) |
| `cerebronico-api` | Diseñar/consumir APIs REST: contrato, validación de entrada, seguridad por defecto | propia (v1.24.0) |
| `cerebronico-rendimiento` | Perfilar y optimizar midiendo antes/después el cuello de botella real | propia (v1.24.0) |
| `cerebronico-accesibilidad` | Auditoría WCAG: contraste, teclado, semántica, ARIA, lectores de pantalla | propia (v1.24.0) |
| `cerebronico-contenedor` | Empaquetado Docker: imagen mínima, multi-stage, sin secretos, healthcheck | propia (v1.24.0) |
| `cerebronico-observabilidad` | Logs/métricas/trazas útiles sin filtrar secretos; diagnóstico en caliente | propia (v1.24.0) |
| **`unblocked`** | **Contexto organizacional: código, PRs, docs, issues y conversaciones de equipo vía Unblocked MCP** | **unblocked/skills-main (v1.53.1)** |
| **`context7`** | **Docs actualizadas de librerías y frameworks: evita alucinaciones de APIs obsoletas** | **upstash/context7-master (v1.53.1)** |

## Extensiones MCP integradas (v1.53.1)

Las extensiones se descubren vía `scanExtensions()` en `extensions/<id>/manifest.json`.
Aportan herramientas al motor cuando su pestaña está abierta.

| Extensión | Cuándo usarla | Origen |
|---|---|---|
| **`mcp-server-main`** | **Webflow MCP: diseño y gestión de sitios vía IA. Requiere OAuth.** | **webflow/mcp-server (v2.0.0)** |

> Si la extensión no tiene OAuth activo, la IDE arranca normal. Las herramientas
> simplemente no aparecen (opcional por construcción, v1.6.2).

## Protocolo de memoria para el motor (capa nueva)

1. **Antes de una tarea** de desarrollo: `memory_recall` con el tema → si hay
   aprendizajes, aplícalos; si no, sigue normal.
2. **Después de una lección** (bug corregido, preferencia del usuario, decisión):
   `memory_guardar_aprendizaje` con una frase autocontenida + tags.
3. **Conocimiento estable y consultable** (gustos editoriales, procedimientos):
   crea una página con `memory_guardar_page` (page_id + source_query) y léela con
   `memory_leer_page` en vez de recordar de memoria.
4. **Documentos crudos** (informes, transcripciones, READMEs): `memory_ingest`
   — texto completo, nunca resumido antes de ingerir.
5. **Preguntas de patrón/retrospectiva**: `memory_reflect` (más cara; no para lookup).
6. **Tras corregir un bug**: `memory_aprender_de_error` con los cinco campos —sin
   `verificacion` no es lección, es anécdota— y alimenta la página `lecciones-de-error`.
7. **Cierre de sesión**: `memory_repasar` (seco) → `memory_conflictos` contra el acta →
   `memory_exportar` a `json`/`md`. `aplicar: true` en repasar y `memory_olvidar` son
   decisiones explícitas, nunca automáticas.
8. **Estado de la capa**: `memory_estado` dice si detrás vive Hindsight o solo el
   espejo local — repórtalo así al usuario, sin prometer síntesis LLM en modo espejo.

## Skills EXTERNAS importadas (v1.53.1 · lote «todo lo integrable»)

> Importadas en formato `SKILL.md` (compatibles con `listar_skills`/`leer_skill`).
> Se sirven AL MODELO bajo demanda; NO ocupan el prompt de sistema.
>
> **Honestidad (cerebro.md §2.1):** una skill importada es un PROCEDIMIENTO de
> terceros, **no** una capacidad verificada por CerebroNico. Algunas asumen
> herramientas/CLIs propias de su ecosistema de origen (Claude Code, bun, etc.);
> si un paso no aplica aquí, se dice que no aplica. Carpeta `skills/<id>/`.
>
> Prefijos: `ck-` = claude-skills · `ak-<pack>-` = ai-kit.


### ai-kit/architect (@smicolon) — 1 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-architect-mermaid-architect` | Generates clean, syntactically valid Mermaid.js diagrams for ERDs, system architecture, sequence flows, class diagrams, and C4 component mod… |

### ai-kit/better-auth (@smicolon) — 3 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-better-auth-auth-security` | Auto-enforce authentication security best practices. Activates when implementing password policies, rate limiting, session security, CSRF pr… |
| `ak-better-auth-better-auth-patterns` | Auto-enforce Better Auth implementation patterns. Activates when setting up authentication, configuring providers, creating auth forms, or i… |
| `ak-better-auth-explain-error` | Automatically diagnoses, explains, and resolves Better Auth runtime errors, configuration issues, database adapter mismatches, and authentic… |

### ai-kit/clarify (@smicolon) — 3 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-clarify-execution-context-builder` | Synthesizes the chosen (or only) candidate flow into the canonical execution-context Markdown + JSON artifacts under .claude/clarifications/… |
| `ak-clarify-flow-detector` | Analyzes a task description plus the surrounding codebase and produces a list of candidate end-to-end flows. Activates when a developer desc… |
| `ak-clarify-flow-selector` | Presents 2+ candidate flows from flow-detector and asks the user to pick one. Issues exactly one AskUserQuestion. Never activates when flow-… |

### ai-kit/dev-loop (@smicolon) — 1 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-dev-loop-tdd-planner` | This skill should be used when the user asks to "plan a feature", "prepare for dev loop", "structure TDD approach", "break down this task", … |

### ai-kit/django (@smicolon) — 8 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-django-import-convention-enforcer` | Automatically validate and fix Django import patterns to use absolute modular imports with aliases. Use when writing imports, creating new P… |
| `ak-django-migration-safety-checker` | This skill should be used when the user asks to "create a migration", "run makemigrations", "modify a model field", "rename a column", or me… |
| `ak-django-model-entity-validator` | This skill should be used when the user asks to "create a model", "add a Django model", "create database table", "add entity", "define schem… |
| `ak-django-performance-optimizer` | This skill should be used when the user asks to "optimize queries", "fix slow queries", "improve performance", "detect N+1", "add indexes", … |
| `ak-django-red-phase-verifier` | This skill should be used when the user asks to "write tests first", "run TDD", "verify red phase", "check failing tests", or when practicin… |
| `ak-django-security-first-validator` | This skill should be used when the user asks to "create an API endpoint", "add a view", "write a viewset", "create a serializer", or when wr… |
| `ak-django-test-coverage-advisor` | This skill should be used when the user asks to "write tests", "generate tests", "check coverage", "add test cases", or when completing feat… |
| `ak-django-test-validity-checker` | This skill should be used when the user asks to "check tests", "validate tests", "review test quality", "verify test coverage", or when writ… |

### ai-kit/failure-log (@smicolon) — 1 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-failure-log-failure-log-manager` | This skill should be used when the user asks to "log a failure", "remember this mistake", "add to failure log", "what mistakes to avoid", "c… |

### ai-kit/flutter (@smicolon) — 9 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-flutter-dart-modern-patterns` | Leverages modern Dart 3+ language features including pattern matching, switch expressions, records, and sealed class hierarchies for express… |
| `ak-flutter-declarative-routing` | Implements declarative, URL-based navigation in Flutter applications using the go_router package. Activates when configuring routes, deep li… |
| `ak-flutter-fastlane-knowledge` | Provides Fastlane configuration patterns for Flutter apps including iOS and Android lanes, code signing with match, CI/CD integration with G… |
| `ak-flutter-flutter-architecture` | Provides Flutter app architecture patterns with feature-first structure, clean architecture, and state management (Bloc, Riverpod, Provider)… |
| `ak-flutter-flutter-testing` | Guides writing unit tests, widget tests, and integration tests in Flutter using flutter_test, WidgetTester, Mockito/Mocktail, and integratio… |
| `ak-flutter-json-serialization` | Standardizes JSON serialization and deserialization in Flutter and Dart using dart:convert, manual factory constructors, or code-generation … |
| `ak-flutter-layout-debugger` | Diagnoses and resolves common Flutter layout errors, including RenderFlex overflowed by N pixels, Vertical viewport was given unbounded heig… |
| `ak-flutter-responsive-layout` | Builds responsive and adaptive Flutter user interfaces across mobile, tablet, desktop, and web form factors using LayoutBuilder, MediaQuery,… |
| `ak-flutter-store-publishing` | Provides App Store and Google Play publishing requirements, metadata management, screenshot specifications, review guidelines, and complianc… |

### ai-kit/hono (@smicolon) — 4 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-hono-cloudflare-bindings` | This skill activates when working with Cloudflare Workers bindings like D1, KV, R2, Durable Objects, or environment variables. It provides p… |
| `ak-hono-hono-patterns` | This skill activates when writing Hono routes, handlers, middleware, or discussing Hono application architecture. It provides patterns for r… |
| `ak-hono-rpc-typesafe` | This skill activates when setting up Hono RPC client, configuring type-safe API calls, or discussing client-server type sharing. It provides… |
| `ak-hono-zod-validation` | This skill activates when writing form validation, request validation, or Zod schemas in Hono. It provides patterns for validating JSON bodi… |

### ai-kit/infisical (@smicolon) — 3 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-infisical-infisical-ci-integration` | This skill activates when configuring CI/CD pipelines, writing GitHub Actions workflows, GitLab CI configs, Dockerfiles, Kubernetes manifest… |
| `ak-infisical-infisical-patterns` | This skill activates when managing environment variables, configuring .infisical.json, organizing workspace environments, or discussing secr… |
| `ak-infisical-secret-hygiene` | This skill activates when detecting hardcoded strings that look like API keys or credentials, creating .env files, referencing process.env o… |

### ai-kit/nestjs (@smicolon) — 4 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-nestjs-barrel-export-manager` | This skill should be used when the user asks to "create barrel exports", "add index.ts", "organize exports", "create entity", "add DTO", "cr… |
| `ak-nestjs-import-convention-enforcer` | Automatically enforce absolute imports from barrel exports in NestJS. Use when writing imports, creating TypeScript files, or organizing Nes… |
| `ak-nestjs-nestjs-security-validator` | Enforces NestJS security best practices including input validation with class-validator, rate limiting with @nestjs/throttler, route authent… |
| `ak-nestjs-nestjs-testing-patterns` | Guides writing isolated unit tests and integration tests for NestJS controllers, services, and guards using Test.createTestingModule() and V… |

### ai-kit/nextjs (@smicolon) — 4 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-nextjs-accessibility-validator` | Automatically validate React/Next.js components meet WCAG 2.1 AA standards. Use when creating components, forms, buttons, modals, navigation… |
| `ak-nextjs-import-convention-enforcer` | Automatically enforce consistent import patterns using Next.js path aliases and proper organization. Use when writing imports, creating new … |
| `ak-nextjs-react-form-validator` | This skill should be used when the user asks to "create a form", "add validation", "handle form submission", "use React Hook Form", or when … |
| `ak-nextjs-vercel-react-best-practices` | Official React and Next.js performance optimization guidelines from Vercel Engineering. Auto-activates when writing, reviewing, or refactori… |

### ai-kit/nuxtjs (@smicolon) — 3 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-nuxtjs-accessibility-validator` | Automatically validate Vue 3/Nuxt.js components meet WCAG 2.1 AA standards. Use when creating components, forms, buttons, modals, navigation… |
| `ak-nuxtjs-import-convention-enforcer` | Automatically enforce consistent import patterns using Nuxt.js ~/ path aliases and proper organization. Use when writing imports, creating n… |
| `ak-nuxtjs-veevalidate-form-validator` | This skill should be used when the user asks to "create a form", "add validation", "handle form submission", "use VeeValidate", or when crea… |

### ai-kit/onboard (@smicolon) — 1 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-onboard-onboard-context-provider` | Provides personalized assistance based on engineer's onboarding profile. Activates when engineer asks "how do I", "where should I", "what's … |

### ai-kit/react-review (@smicolon) — 2 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-react-review-react-perf-rules` | Provides prioritized P0/P1/P2 criteria for auditing React and Next.js branch diffs across waterfalls, bundle bloat, server execution, and cl… |
| `ak-react-review-web-design-guidelines` | Audits UI code against modern Web Interface Guidelines for typography, interactive affordances, responsive layouts, contrast, and accessibil… |

### ai-kit/tanstack-router (@smicolon) — 12 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-tanstack-router-ai-patterns` | TanStack AI patterns for unified AI SDK integration. Activates when implementing AI chat, streaming responses, or AI-powered features. NOTE:… |
| `ak-tanstack-router-db-patterns` | TanStack DB patterns for client-first reactive data stores. Activates when implementing offline-first apps, local-first data, or reactive cl… |
| `ak-tanstack-router-devtools-patterns` | TanStack DevTools patterns for debugging and development. Activates when setting up development tools, debugging queries, or configuring dev… |
| `ak-tanstack-router-form-patterns` | Auto-enforce TanStack Form best practices with Zod validation. Activates when creating forms, handling form state, implementing validation, … |
| `ak-tanstack-router-pacer-patterns` | TanStack Pacer patterns for rate limiting, debouncing, and throttling. Activates when implementing search inputs, API rate limiting, or perf… |
| `ak-tanstack-router-query-patterns` | Auto-enforce TanStack Query best practices with factory key pattern. Activates when creating queries, mutations, managing server state, or i… |
| `ak-tanstack-router-router-patterns` | Auto-enforce TanStack Router file-based routing conventions. Activates when creating routes, configuring navigation, handling route params, … |
| `ak-tanstack-router-start-patterns` | Implements TanStack Start full-stack React framework features including server functions (createServerFn), SSR streaming, middleware, client… |
| `ak-tanstack-router-store-patterns` | TanStack Store patterns for framework-agnostic reactive state. Activates when implementing client-side state, global stores, or reactive sta… |
| `ak-tanstack-router-table-patterns` | Auto-enforce TanStack Table best practices for headless data tables. Activates when creating tables, implementing sorting, filtering, pagina… |
| `ak-tanstack-router-tanstack-conventions` | Auto-enforce cross-cutting TanStack conventions and import patterns. Activates on all TanStack development to ensure consistent project stru… |
| `ak-tanstack-router-virtual-patterns` | Auto-enforce TanStack Virtual best practices for list virtualization. Activates when implementing large lists, infinite scroll, virtualized … |

### ai-kit/worktree (@smicolon) — 1 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ak-worktree-worktree-manager` | This skill should be used when the user mentions "worktree", "wt", "new branch workspace", "parallel development", "feature branch setup", "… |

### claude-skills (MakiDevelop) — 16 skill(s)

| Carpeta (`skills/`) | Qué hace |
|---|---|
| `ck-architecture-diagram` | Generate self-contained HTML architecture diagrams (inline SVG, dark theme, no JS) for blogs/READMEs. Triggers on system architecture, micro… |
| `ck-case-study` | 專案案例包裝。把真實專案包裝成面試/LinkedIn 用的結構化案例（問題→方案→架構→Tech Stack→成果→展示重點）。當用戶說「包裝案例」「寫 case study」「面試用的案例」時使用。 |
| `ck-csv-to-chart` | 把 CSV/TSV 資料自動生成圖表（line/bar/pie/scatter）。當用戶說「畫圖表」「csv 圖表」「chart」「visualize data」時使用。 |
| `ck-cv-optimize` | Resume/CV optimization. Analyze a resume, reposition strengths, and produce an optimized PDF tailored to a target role. |
| `ck-db-eda` | 用自然語言查詢 SQLite 或 DuckDB 資料庫。當用戶說「查資料庫」「SQL 查詢」「db eda」「自然語言查 DB」時使用。 |
| `ck-demo-storytelling` | 把 PoC / prototype 包裝成有說服力的 demo 故事。輸入技術成果/受眾/數據，輸出 demo 腳本 + 一頁摘要 + FAQ。當用戶要展示成果、準備 demo、報告 PoC 時使用。 |
| `ck-disk-cleanup` | macOS 磁碟清理。掃描大目錄、分類可刪/可搬/需確認、Docker/Xcode 清理。當用戶說「清磁碟」「磁碟空間不夠」「disk cleanup」時使用。 |
| `ck-drawio` | Generate draw.io diagrams (.drawio files) with optional PNG/SVG/PDF export. Triggers on diagram/flowchart/ER/sequence/class/network/architec… |
| `ck-generate-image` | 使用 Gemini Nano Banana 2 產生圖片。當用戶說「產圖」「生成圖片」「generate image」「畫一張圖」時使用。 |
| `ck-gh-issue-to-spec` | 把 GitHub Issue 轉成結構化技術規格文件。當用戶說「issue 轉 spec」「寫規格」「gh issue to spec」時使用。 |
| `ck-pdf-to-summary` | 讀取 PDF 檔案，產出結構化摘要。當用戶說「摘要 PDF」「summarize PDF」「PDF 重點」「讀這份 PDF」時使用。 |
| `ck-postmortem` | 事故記錄。收集資訊、分析 root cause、記錄修復步驟、防止再發。當服務出事故後使用。 |
| `ck-product-positioning` | 定位產品/功能的市場位置和溝通策略。輸入產品描述/目標用戶/競品，輸出 positioning statement + one-liner + elevator pitch + landing page 骨架。當用戶要介紹產品、寫 README、準備 pitch 時使用。 |
| `ck-proposal-review` | 提案簡報結構審查。分析分頁邏輯、標題長度、內容分配，給出合併/拆分/精簡建議。當用戶說「review 這份提案」「簡報結構對不對」「幫我看一下分頁」時使用。 |
| `ck-roundtable` | Virtual expert roundtable. Multiple thinkers analyze a document with different frameworks, then synthesize consensus/disagreements/blind spo… |
| `ck-vendor-eval` | Vendor proposal evaluation. Analyze technical architecture, pricing, and market benchmarks from a proposal PDF/Doc. Output evaluation report… |
