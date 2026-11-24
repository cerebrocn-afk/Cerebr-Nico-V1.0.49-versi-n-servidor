# CEREBRONICO: Especificación Técnica y Arquitectura del Sistema Autónomo
*Versión: 3.0 (Edición Master - Utilitario Standard Pro)*

---

## 1. Introducción y Visión General
**CerebrONico** es un IDE autónomo de arquitectura híbrida diseñado para operar con restricciones de hardware local (CPU i5, 8 GB de RAM) combinando procesamiento determinista de alta velocidad con la agilidad de APIs Cloud gratuitas (Gemini Flash y Zai Flash). Su objetivo es planificar, construir, validar y desplegar aplicaciones web y backends en FastAPI (puerto 5000) de forma autónoma, evitando las trampas comunes de los agentes de IA tradicionales.

---

## 2. Arquitectura de Enrutamiento Híbrido (Local-Cloud Cascade)

Para superar las limitaciones de hardware y de las APIs gratuitas, el sistema implementa una distribución estricta de tareas:

```
                  ┌──────────────────────────────────────────────┐
                  │              LOCAL (i5 / 8GB RAM)            │
  [ Solicitud ] ─▶│ • Orquestador en Python (Lógica determinista)│
                  │ • Espejos AST & Validación de Hash de Archivo│
                  │ • Sandbox FastAPI (Puerto 5000)              │
                  └──────┬────────────────────────────────┬──────┘
                         │                                │
        (Peticiones Ligeras / Asíncrono)          (Worker en 2do Plano)
                         ▼                                ▼
          ┌──────────────────────────────┐ ┌──────────────────────────────┐
          │     APIs CLOUD GRATUITAS     │ │     MODELO LOCAL (1B)        │
          ├──────────────────────────────┤ ├──────────────────────────────┤
          │ • Gemini Flash: Código/Arqu. │ │ • Ollama 1B: Análisis de     │
          │ • Zai Flash: Parcheo/Diffs   │ │   logs y vectorización local │
          └──────────────────────────────┘ └──────────────────────────────┘
```

*   **Capa de Frente (Cloud):** Gemini Flash y Zai Flash manejan la generación pesada de código y refactorizaciones rápidas.
*   **Capa de Fondo (Local Asíncrona):** Un modelo local ultra-ligero (ej. 1B) opera en un hilo secundario procesando logs, vectorizando el rendimiento y actualizando la memoria sin congelar la interfaz ni la RAM.

---

## 3. Protocolos de Mitigación de Fallos Críticos (Anti-Alucinación)

### 3.1. El Problema del Tamaño de Código y Errores SRC (Context Window & Payload Limits)
*   **Problema:** Enviar archivos kilométricos o repositorios enteros a las APIs Cloud provoca rechazos del servidor (errores de contrato SRC o desbordamiento de contexto), haciendo que la API devuelva fallos de formato o se cuelgue.
*   **Solución:**
    1.  **Fragmentación Modular:** El orquestador divide el código en bloques lógicos menores a 150 líneas antes de enviarlos.
    2.  **Envío por Diff Quirúrgico:** Nunca se reenvía el archivo completo si solo se va a modificar una función; se envía únicamente el bloque afectado junto con el contrato de la función.

### 3.2. El "Bucle Fantasma" (Falsa Escritura Física)
*   **Problema:** La IA afirma haber cambiado el código, pero en el disco y en el sandbox sigue exactamente igual, atrapando al agente en un bucle infinito de iteraciones vacías.
*   **Solución:** **Validación por Hash (MD5)**. El orquestador calcula el hash del archivo antes y después de la inyección. Si el hash no cambia, la escritura se rechaza inmediatamente y se le exige al modelo reenviar el bloque correcto.

### 3.3. La "Plantilla Perezosa" (Clon Estético)
*   **Problema:** La IA recicla la misma estructura base estática cambiando solo colores o textos menores, asegurando que creó una "nueva app".
*   **Solución:** **Firma Estructural AST (`ast.parse`)**. El orquestador extrae el árbol de funciones, rutas y decoradores (`@app.get`, `@app.post`). Si la firma estructural es idéntica a la plantilla base a pesar de una solicitud de nueva funcionalidad, el sistema bloquea el cambio por plagio estructural.

### 3.4. Cortes Abruptos y Muerte Súbita del Token
*   **Problema:** Las APIs Cloud se congelan durante la fase de "pensamiento" o cortan la respuesta a mitad de línea debido a límites de tiempo o tokens.
*   **Solución:** **Timeouts Estrictos y Auto-Continuación**. El cliente HTTP de Python implementa un `timeout=15s` y un validador de bloques Markdown (` ``` `). Si un bloque queda abierto al cortarse la respuesta, el orquestador envía automáticamente un comando de continuación de contexto.

### 3.5. La Ilusión del "Falso Verde" (Desconexión de Rutas)
*   **Problema:** Tests unitarios aislados pasan en verde, pero la aplicación real no tiene el router importado ni conectado a FastAPI.
*   **Solución:** **Wiring Check (Verificación de Cableado)**. El orquestador analiza estáticamente el archivo `main.py` para asegurar que todo nuevo módulo cuente con su respectiva sentencia `import` y su registro mediante `app.include_router()`.

---

## 4. El Bucle de Aprendizaje en Caliente (`memory.md`)

Para evitar amnesia en el sistema, cada incidente corregido se transforma en una regla persistente:
1.  **Extracción de Traza:** Ante un error en el puerto 5000, el espejo local filtra el ruido y extrae solo las líneas críticas del Traceback.
2.  **Inyección Compacta:** Se añaden las últimas 15 lecciones del archivo `cerebro_memory.md` en los prompts hacia la nube.
3.  **Consolidación:** Si la prueba de humo HTTP devuelve `200 OK`, la regla de éxito se consolida en Git y en la memoria acumulativa.

---

## 5. Checklist de Integridad del Orquestador (Runtime)
1. [ ] ¿El tamaño del payload enviado a la nube cumple con el contrato SRC permitido?
2. [ ] ¿El archivo modificado cambió físicamente su Hash MD5?
3. [ ] ¿La huella digital de funciones cambió si se solicitó lógica nueva?
4. [ ] ¿El endpoint está formalmente montado y verificado en `main.py`?
5. [ ] ¿Responde el servidor en el puerto 5000 con un HTTP 200 real tras la inyección?