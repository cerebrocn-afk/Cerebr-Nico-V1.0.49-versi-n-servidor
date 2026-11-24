/**
 * subagentes.ts — /api/SUBAGENTS FUERA DEL MONOLITO (v1.0.24)
 * ===========================================================
 * QUÉ ES: la topología del IDE con estado en vivo (UI :3000, Puente PC :5000,
 * Ollama :11434, Sandbox .proyectos). Es la primera ruta del log del 16/11 con
 * `ERR_HTTP_HEADERS_SENT`.
 *
 * POR QUÉ SALIÓ DEL MONOLITO, Y NO ENTRÓ COMO PARCHE
 * -------------------------------------------------
 * La cura es una línea (`abrirFicha`): la ruta que llega tarde ya no vuelve a
 * escribir sobre el socket. Pero `server.ts` tiene un TECHO DECLARADO que solo
 * se aprieta (`presupuesto_lineas`), y un parche de tres líneas ahí adentro lo
 * empuja por encima del techo que la propia casa vigila. La Fase 2 es partir,
 * no añadir: se mudó el cuerpo completo —y con él su comentario de fallback— a
 * su módulo, y el monolito se quedó con UNA línea de delegación.
 */
import type { Request, Response } from "express";
import fs from "node:fs";
import { abrirFicha } from "../../src/engine/fichaUnica";

export interface DepsSubagentes {
  /** Puerto de la UI (la IDE en :3000). */
  puerto: number;
  /** Puerto del puente PC (:5000). */
  puertoPuente: number;
  /** Raíz del sandbox (.proyectos). */
  raizProyecto: string;
  /** El `bridgeFetch` del monolito: ya trae su plazo y su token. */
  puente: (ruta: string) => Promise<any>;
}

export function registrarSubagentes(app: any, deps: DepsSubagentes): void {
  app.get("/api/subagents", async (_req: Request, res: Response) => {
    // v1.0.24 · ESTA RUTA ESTABA EN EL LOG CON `ERR_HTTP_HEADERS_SENT` (server.ts:6704).
    // Orden real: el reloj de /api vencía a los 20 s (el puente :5000 estaba
    // reanimándose y `bridgeFetch` espera 12 s), el middleware contestaba 504, y
    // 1 s después llegaba el fallback y volvía a llamar `res.json()`. La ficha
    // hace que la segunda escritura sea un no-op con nombre en vez de una excepción.
    const ficha = abrirFicha(res, "/api/subagents");
    const bridge = `http://127.0.0.1:${deps.puertoPuente}`;
    const data = await deps.puente("/api/subagents");
    // El puente siempre sabe de sí mismo; si no responde, construimos un fallback.
    if (data && data.items) {
      ficha.json(data);
      return;
    }
    ficha.json({
      bridge,
      items: [
        { id: "ui", name: "Interfaz UI", port: deps.puerto, role: "Frontend React/Vite + editor y chat", status: "online" },
        { id: "bridge", name: "Puente PC (Agente 5000)", port: deps.puertoPuente, role: "Ejecución de comandos y archivos sobre la PC real", status: "offline" },
        { id: "ollama", name: "Motor de Inferencia (Ollama)", port: 11434, role: "LLM local (tool-calling del chat)", status: "offline" },
        { id: "sandbox", name: "Sandbox del Proyecto", port: null, path: deps.raizProyecto, role: "Área aislada .proyectos", status: fs.existsSync(deps.raizProyecto) ? "online" : "offline" },
      ],
    });
  });
}
