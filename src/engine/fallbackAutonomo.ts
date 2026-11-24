/**
 * fallbackAutonomo.ts — v1.46.0 · EL TEXTO DEL «MODO FALLBACK» SALE DEL MONOLITO
 * ==============================================================================
 * QUÉ ES: el generador de la respuesta autónoma que se enseña cuando NINGÚN
 * proveedor de IA pudo responder. Salió de `server.ts` tal cual («se mueve, no
 * se mejora»): el monolito tiene un TRINQUETE —`tests/superficieRutas.test.ts`
 * exige < 11.800 líneas— y este bloque eran 182 líneas de plantillas de texto
 * que no tocan ni una ruta, ni un guard, ni una conexión. Es la clase de código
 * que la Fase 2 pide mover primero: cero acoplamiento, cero riesgo.
 *
 * OJO, Y ESTO IMPORTA MÁS QUE EL TAMAÑO: lo que este módulo ESCRIBE es un
 * andamiaje de ejemplo con telemetría inventada (`ramUsageMb: 48`,
 * `tokensPerSec: 64.2`). NO es una medición. Va precedido —en el camino que lo
 * llama— por un aviso explícito de «Modo fallback», para que no se confunda con
 * una respuesta del modelo. Se documenta aquí porque mover código sin decir qué
 * hace es justo lo que convierte un refactor en un enterrado.
 */

/**
 * Autonomous technical fallback engine response generator
 */
export function generateAutonomousTechnicalResponse(prompt: string, attachmentSummary: string): string {
  const isReplicationOrImprovement = /replic|copi|mejor|generar todos|crear los archivos|todo.*archivo/i.test(prompt);
  const isRefactor = /refactor|mejor|repar|modific|optimi/i.test(prompt);
  const isCodeRequest = /código|funcion|crear|componente|script|endpoint|api|clase|interfaz/i.test(prompt);
  const isTerminalCommand = /comando|ejecut|instalar|docker|npm|build|port|puerto/i.test(prompt);

  if (isReplicationOrImprovement) {
    return `### ⚡ CerebroNico - Replicación y Mejora Integral del Sistema

He analizado la arquitectura completa de la aplicación y he generado los módulos optimizados con tipado estricto, desacoplamiento de estado y persistencia de telemetría.

\`\`\`typescript file="src/services/appKernel.ts"
// src/services/appKernel.ts - Núcleo de Ejecución de Alta Velocidad
export interface EngineTelemetry {
  port3000: boolean;
  port5000: boolean;
  port11434: boolean;
  ramUsageMb: number;
  tokensPerSec: number;
}

export class AppExecutionKernel {
  private listeners: Set<(t: EngineTelemetry) => void> = new Set();
  private telemetry: EngineTelemetry = {
    port3000: true,
    port5000: true,
    port11434: true,
    ramUsageMb: 48,
    tokensPerSec: 64.2,
  };

  public subscribe(cb: (t: EngineTelemetry) => void): () => void {
    this.listeners.add(cb);
    cb(this.telemetry);
    return () => this.listeners.delete(cb);
  }

  public updateTelemetry(partial: Partial<EngineTelemetry>): void {
    this.telemetry = { ...this.telemetry, ...partial };
    this.listeners.forEach((cb) => cb(this.telemetry));
  }

  public purgeRam(): void {
    this.updateTelemetry({ ramUsageMb: 36 });
  }
}

export const kernel = new AppExecutionKernel();
\`\`\`

\`\`\`typescript file="src/hooks/useKernelTelemetry.ts"
// src/hooks/useKernelTelemetry.ts - Hook Reactivo de Telemetría
import { useState, useEffect } from "react";
import { kernel, EngineTelemetry } from "../services/appKernel";

export function useKernelTelemetry() {
  const [telemetry, setTelemetry] = useState<EngineTelemetry>({
    port3000: true,
    port5000: true,
    port11434: true,
    ramUsageMb: 48,
    tokensPerSec: 64.2,
  });

  useEffect(() => {
    const unsubscribe = kernel.subscribe(setTelemetry);
    return () => unsubscribe();
  }, []);

  return { telemetry, purgeRam: () => kernel.purgeRam() };
}
\`\`\`

\`\`\`markdown file="README.md"
# CerebroNico IDE
Entorno de ingeniería de software autónomo con inferencia local en Ollama y aceleración en la nube.
- **Frontend UI**: Puerto 3000 (Next.js / Vite)
- **Backend / Workers**: Puerto 5000
- **Ollama Inferencia**: Puerto 11434 (\`http://127.0.0.1:11434\`)
- **Gestión de Memoria**: Contexto dinámico de 5 mensajes + inyección del rol de sistema.
\`\`\`

**Sincronización Completada:**
- Los archivos \`src/services/appKernel.ts\`, \`src/hooks/useKernelTelemetry.ts\` y \`README.md\` se han indexado automáticamente en el **Editor** y en la pestaña de **Entregables** para visualización y descarga en ZIP.`;
  }

  if (isCodeRequest || isRefactor) {
    return `### ⚡ CerebroNico - Módulo de Generación y Refactorización

**Análisis de la Solicitud:**
Se ha procesado el requerimiento: *"${prompt.slice(0, 120)}..."* aplicando tipado estricto en TypeScript, arquitectura modular y reactividad desacoplada.

\`\`\`typescript file="src/services/autonomousKernel.ts"
// src/services/autonomousKernel.ts
export interface KernelTask {
  id: string;
  name: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
}

export class AutonomousExecutionEngine {
  private activeJobs: Map<string, KernelTask> = new Map();

  public registerTask(name: string, priority: KernelTask["priority"] = "high"): KernelTask {
    const task: KernelTask = {
      id: "task-" + Math.random().toString(36).substring(2, 9),
      name,
      priority,
      timestamp: Date.now(),
    };
    this.activeJobs.set(task.id, task);
    return task;
  }

  public getTelemetrySummary(): { active: number; port: number } {
    return {
      active: this.activeJobs.size,
      port: 5000,
    };
  }
}

export const kernel = new AutonomousExecutionEngine();
\`\`\`

**Puntos Clave Implementados:**
1. **Tipado Estricto**: Definición de interfaces TypeScript para prevenir estados nulos o indefinidos.
2. **Sincronización con Editor**: El bloque de código ha sido indexado y está listo en la pestaña **Editor** y en **Entregables**.
3. **Persistencia**: Registrado en el ciclo de \`MEMORIA.md\`.`;
  }

  if (isTerminalCommand) {
    return `### ⚡ CerebroNico - Control de Procesos y Telemetría

\`\`\`bash file="scripts/dev-orchestrator.sh"
#!/usr/bin/env bash
# 1. Comprobar y limpiar procesos en puertos clave
# Puerto 3000 (UI Vite/React) y Puerto 5000 (Microservicios/Workers)
lsof -i :3000 -i :5000 -i :11434 2>/dev/null || true

# 2. Servir Ollama con CORS habilitado para el navegador
OLLAMA_ORIGINS="*" ollama serve &

# 3. Compilación limpia y validación de tipos
npm run lint && npm run build
\`\`\`

**Estado de Puertos:**
- **Puerto 3000**: UI Frontend activa y respondiendo.
- **Puerto 5000**: Worker / Proxy listo para despacho.
- **Puerto 11434**: Inferencia local Ollama.`;
  }

  return `### ⚡ CerebroNico - Análisis Técnico y Resolución

**Diagnóstico del Entorno:**
- **Protocolo de Actuación:** Persistencia activa en \`MEMORIA.md\`, respuesta en español técnico directo y ejecución sin rodeos.
- **Triangulación:** Puerto 3000 (UI Vite/React), Puerto 5000 (Workers backend) y Puerto 11434 (Inferencia local).

${
  attachmentSummary.length > 0
    ? `**Archivos y Documentos Procesados:**
Se han extraído correctamente los adjuntos en texto limpio (eliminando caracteres de control, tags binarios y rombos de codificación corrupta).

`
    : ""
}**Acciones Ejecutadas para:** *"${prompt.slice(0, 100)}"*

\`\`\`typescript file="src/utils/orchestrator.ts"
// src/utils/orchestrator.ts
export function executeTask(taskName: string): { success: boolean; timestamp: number } {
  console.log(\`[CerebroNico] Ejecutando: \${taskName}\`);
  return { success: true, timestamp: Date.now() };
}
\`\`\`

Todo el código analizado está sincronizado con el panel derecho (**Editor** y **Entregables**) listo para guardar o descargar.`;
}
