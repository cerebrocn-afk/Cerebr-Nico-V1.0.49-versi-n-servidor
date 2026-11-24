/**
 * vectorRag.ts — ROUTER DE VECTORIZACIÓN LOCAL / RAG (Fase 2, v1.59.2)
 * ===================================================================
 * QUÉ ES: el dominio `rag` sale del monolito `server.ts`. Las seis rutas
 * (`/api/rag/status|toggle|model|index|search|clear`) se mueven **tal cual**:
 * la regla de la Fase 2 es «se mueve, no se mejora», para que cambiar de
 * archivo no sea una ocasión de romper una respuesta ya contratada.
 *
 * POR QUÉ AQUÍ Y NO EN server.ts: el trinquete de `contrato-rutas.json` dice
 * que el monolito no puede crecer (la Fase 2 es partir, no añadir). Registrar
 * por delegación añade UNA línea al monolito y le quita ~65. El contrato se
 * REGENERA con `node scripts/superficie.mjs` — no se edita a mano, porque un
 * contrato editable es un trinquete que se afloja solo.
 *
 * DEPENDENCIAS: todas las rutas operan sobre la MISMA instancia de memoria
 * vectorial que vive en el monolito (`localRag`), inyectada por `deps`. No se
 * crea una segunda: una ruta movida tiene que seguir hablando con el mismo
 * estado que antes, o sería otra ruta con el mismo nombre.
 */
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import type { LocalRAG } from "../../src/engine/localRAG";

export interface DepsVectorRag {
  /** La MISMA instancia de memoria vectorial del monolito (no una nueva). */
  localRag: LocalRAG;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_VECTOR_RAG = [
  "GET /api/rag/status",
  "POST /api/rag/toggle",
  "POST /api/rag/model",
  "POST /api/rag/index",
  "POST /api/rag/search",
  "POST /api/rag/clear",
] as const;

export function registrarVectorRag(app: express.Express, deps: DepsVectorRag): void {
  const localRag = deps.localRag;

  // ─── movidos tal cual desde server.ts (v1.59.2, Fase 2) ────────────────────
  // ============================================================
  // v2.0 — VECTORIZACIÓN LOCAL (RAG): apagada por defecto, botón para activar
  // ============================================================

  /** Estado: activada o no, tamaño de la memoria, trozos indexados y recomendación. */
  app.get("/api/rag/status", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });

  /** Enciende o apaga la vectorización. Es el botón. */
  app.post("/api/rag/toggle", (req: Request, res: Response) => {
    const enabled = req.body?.enabled === true || req.body?.enabled === "true";
    const estado = localRag.setEnabled(enabled);
    console.log(`[CerebroNico] Memoria vectorial ${estado ? "ACTIVADA" : "DESACTIVADA"}`);
    if (!estado) localRag.clear(); // apagarla libera también el índice: cero RAM
    // v2.1 — `enabled: estado` quedaba pisado por el `enabled` que ya trae
    // `localRag.status()`, que es el estado REAL tras aplicarlo. Manda el real.
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });

  /** Cambia el modelo de embeddings (por defecto qwen3-embedding:0.6b de Ollama). */
  app.post("/api/rag/model", (req: Request, res: Response) => {
    const modelo = String(req.body?.model || "");
    if (!modelo) return res.status(400).json({ ok: false, error: "Falta 'model'." });
    localRag.setModel(modelo);
    return res.json({ ok: true, model: modelo });
  });

  /** Reindexa cerebro.md + memoria.md + la base de conocimiento del motor. */
  app.post("/api/rag/index", async (_req: Request, res: Response) => {
    try {
      const fuentes: Array<{ nombre: string; texto: string }> = [];
      const cerebroRuta = path.join(process.cwd(), "cerebro.md");
      const memoriaRuta = path.join(process.cwd(), "memoria.md");
      if (fs.existsSync(cerebroRuta)) fuentes.push({ nombre: "cerebro.md", texto: fs.readFileSync(cerebroRuta, "utf-8") });
      if (fs.existsSync(memoriaRuta)) fuentes.push({ nombre: "memoria.md", texto: fs.readFileSync(memoriaRuta, "utf-8") });
      try {
        const kbRuta = path.join(process.cwd(), ".cerebro-db", "kb.json");
        if (fs.existsSync(kbRuta)) {
          const kb = JSON.parse(fs.readFileSync(kbRuta, "utf-8"));
          const entradas = Array.isArray(kb?.entries) ? kb.entries : [];
          const texto = entradas.map((e: any) => `[${e.table}] ${e.title}: ${e.body}`).join("\n\n");
          if (texto) fuentes.push({ nombre: "base-de-conocimiento", texto });
        }
      } catch {}
      const r = await localRag.reindex(fuentes);
      return res.json({ ok: true, ...r, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Prueba de búsqueda: sirve para comprobar que activar la vectorización aporta. */
  app.post("/api/rag/search", async (req: Request, res: Response) => {
    const query = String(req.body?.query || "");
    if (!query) return res.status(400).json({ ok: false, error: "Falta 'query'." });
    const hits = await localRag.search(query, Number(req.body?.k) || 4);
    return res.json({ ok: true, query, hits: hits.map((h) => ({ source: h.source, score: Number(h.score.toFixed(3)), text: h.text.slice(0, 240) })) });
  });

  /** Vacía el índice en disco (no toca la memoria). */
  app.post("/api/rag/clear", (_req: Request, res: Response) => {
    localRag.clear();
    return res.json({ ok: true, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
  });
}
