---
name: cerebronico-memoria
description: Protocolo de la capa de memoria híbrida de CerebroNico (Hindsight + espejo local). Cuándo recordar, qué aprender, cómo repasarse y qué NUNCA guardar.
user_invocable: true
---

# Memoria híbrida de CerebroNico — protocolo del motor

Las 19 herramientas `memory_*` / `listar_skills` / `leer_skill` / `skill_buscar` viven
en el pack `memoria-hindsight` (`:5100`). Detrás puede haber Hindsight (hechos
destilados + síntesis por LLM) o el **espejo local** (BM25 sobre unidades literales).
`memory_estado` dice cuál; **nunca prometas síntesis en modo espejo**.

## Ciclo obligatorio

| Cuándo | Herramienta | Truco |
|---|---|---|
| Antes de tocar código | `memory_recall` con el tema + `tags` si ya sabes el dominio | `incluir_paginas: true` para que las páginas sintetizadas compitan con los apuntes |
| Después de corregir un bug | `memory_aprender_de_error` (contexto · error · causa · corrección · **verificación**) | sin verificación no es lección, es anécdota |
| Preferencia del usuario | `memory_guardar_aprendizaje` con `tags` | una frase autocontenida: sin contexto, recall no la encontrará |
| Conocimiento estable y consultable | `memory_guardar_page` (`page_id` + `source_query`) | la página se reconstruye sola; el apunte suelto no |
| Documento completo | `memory_ingest` (o `memory_indexar_proyecto` por lotes) | texto crudo, jamás resumido antes de ingerir |
| Cierre de sesión / hito | `memory_repasar` (seco) y después `memory_exportar` | repasar **propone**; `aplicar: true` es decisión explícita |
| Pregunta de patrón o retrospectiva | `memory_reflect` | más cara que recall: no la uses para lookup |

## Qué NO guardar

- Secretos, tokens, claves ni contenido de `.env` (el puente ya rechaza raíces; la
  memoria no es la excepción).
- Datos que contradigan el acta: primero `memory_conflictos`, luego el humano decide.
- Copias de archivos que el sandbox ya lee: indexar sirve para **recordar sin abrir**,
  no para duplicar el disco.

## Etiquetas (usa pocas y estables)

`guard` · `sandbox` · `puente` · `empaque` · `ui` · `tts` · `memoria` · `leccion` ·
`error` · `indexado` · `verificado`.

## Olvido con red de seguridad

`memory_olvidar` pide ids concretas y deja snapshot en el historial antes de borrar.
Nada de «limpiar todo»: un espejo purgado de más borra decisiones que costaron días.
