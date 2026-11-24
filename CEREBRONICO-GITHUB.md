# 🧠 CerebroNico IDE & Autonomous Engineering Agent

> Ecosistema de desarrollo autónomo de alta precisión y agente cognitivo embebido dentro de una IDE local inteligente.

---

## 🚀 ¿Qué es CerebroNico?

**CerebroNico** es un entorno de desarrollo integrado (IDE) de última generación y un ecosistema de agentes autónomos diseñado para transformar instrucciones ambiguas en código estructurado, limpio y **ejecutable**, compensando las limitaciones de modelos ligeros con flujos de razonamiento deterministas, memoria híbrida persistente y herramientas de autoverificación.

---

## 🏛️ Arquitectura y Componentes Principales

CerebroNico no es solo un editor: es un ecosistema completo que combina un motor de razonamiento local, un servidor de gestión de procesos, un sistema de memoria estructurada y un creador web determinista.

### 🔌 Mapa de Puertos del Sistema
- **`3000`** — Interfaz de la IDE (Frontend y panel de control).
- **`3500`** — Sandbox de previsualización en vivo (Servidor del proyecto del usuario).
- **`5000`** — Puente PC / Backend FastAPI / Workers de soporte.
- **`5100`** — Daemon de Memoria Híbrida.
- **`5102`** — Servidor del Creador Web autónomo.
- **`5103`** — Motor del Cerebro (Ingesta, consolidación y recuperación de hechos).
- **`11434`** — Servidor local Ollama para inferencia offline.

---

## 🛠️ Herramientas y Capacidades Operativas

CerebroNico cuenta con un conjunto robusto de herramientas y skills modulares para gestionar proyectos de cualquier complejidad:

### 1. Gestión de Workspace y Archivos
- **Lectura y Escritura Avanzada:** Operaciones atómicas sobre código (`write_file`, `edit_file`, `read_file_range`).
- **Análisis de Proyecto:** Inspección de estructura, búsqueda avanzada en archivos (`search_in_files`, `find_symbol`), y control de versiones (`git_status`, `git_diff`, `git_commit`).
- **Gestión de Directorios:** Creación, listado y manipulación segura dentro de las raíces autorizadas del sandbox.

### 2. Creador Web Autónomo (`creador-web`)
- Generación completa de sitios web estáticos, landings, portafolios y negocios sin frameworks pesados, con soporte PWA, Open Graph, esquemas JSON-LD y diseño responsive.
- **9 Paletas de Colores** preconfiguradas (arena, bosque, cálido, cereza, claro, noche, océano, pizarra, violeta).
- **11 Tipos de Sitio** y **15 Bloques modulares** (hero con variantes, características, precios, testimonios, FAQ, contacto, galería, equipo, pasos, etc.).
- **Inserción y gestión de imágenes** optimizada y validación WCAG 2.1 de contraste.

### 3. Memoria Híbrida y Persistencia (`Hindsight`)
- **Memoria de Largo Plazo (`memory_recall`, `memory_guardar_aprendizaje`):** Retiene decisiones de arquitectura, preferencias de usuario y lecciones aprendidas entre sesiones.
- **Consolidación de Conocimiento:** Páginas de conocimiento sintetizadas automáticamente a partir de hechos y experiencias previas.

### 4. Conciencia de Artista (X10) y Autoverificación
- **Auditoría de Oficio y Producto (10 Ejes Ponderados):** Evalúa terminación visual, estados completos (vacío, carga, error), accesibilidad, coherencia de sistema, diseño responsive móvil, feedback de interacción, consistencia de copy, robustez de datos y rendimiento percibido.
- **Autoevaluación y Bucle de Autocorrección:** El motor detecta bucles de error (por ejemplo, dependencias faltantes), ajusta su estrategia mediante una escalera de reparación y fiscaliza el cumplimiento antes de entregar.

---

## ⚙️ Protocolo de Ejecución y Guardrails

1. **Cero Ambigüedad / Veracidad:** Nunca inventa información técnica ni APIs inexistentes. Si falta un dato crítico, pregunta de forma directa con una propuesta por defecto.
2. **Atomicidad y Estructura:** Código limpio, completo y estructurado en bloques exactos con su ruta correspondiente.
3. **Conversación Primero, Código al Fondo:** La explicación en lenguaje natural viaja en el chat en español, mientras que los archivos y cambios se aplican de forma limpia en el editor en segundo plano.

---

## 📦 Instalación y Uso Rápido

1. Clona o descarga el repositorio en tu máquina.
2. Inicia el puente del sistema y los servicios:
   ```bash
   python agent_bridge_5000.py
   ```
3. Accede a la interfaz de la IDE en `http://127.0.0.1:3000` y disfruta de un desarrollo asistido por inteligencia artificial autónoma y determinista.

---
*Desarrollado para potenciar la ingeniería de software local con precisión, velocidad y autonomía.*
