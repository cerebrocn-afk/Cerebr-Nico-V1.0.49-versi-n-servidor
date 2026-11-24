/**
 * features.ts — ROUTER DE CAPACIDADES AVANZADAS (Fase 2, v1.70.2)
 * ================================================================
 * QUÉ ES: el dominio `features` sale del monolito `server.ts`. Las siete rutas
 * (`/api/features`, `/toggle`, `/templates`, `/git/log`, `/git/commit`,
 * `/git/rollback`, `/deep-index`) se mueven **tal cual**: la regla de la
 * Fase 2 es «se mueve, no se mejora», para que cambiar de archivo no sea una
 * ocasión de romper una respuesta ya contratada.
 *
 * POR QUÉ AQUÍ Y NO EN server.ts: el trinquete de `contrato-rutas.json` dice
 * que el monolito no puede crecer, y la suite `androidProyecto` además exige
 * que quede por debajo del tamaño de v1.68.0 (12287). Registrar por delegación
 * añade DOS líneas al monolito y le quita ~70. El contrato se REGENERA con
 * `node scripts/superficie.mjs` — no se edita a mano, porque un contrato
 * editable es un trinquete que se afloja solo.
 *
 * DEPENDENCIAS: las rutas operan sobre las MISMAS instancias que vivían en el
 * monolito (`features`, y `localRag` para el índice profundo), inyectadas por
 * `deps`. No se crea ninguna segunda: una ruta movida tiene que seguir
 * hablando con el mismo estado que antes, o sería otra ruta con el mismo
 * nombre.
 */
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import type { AdvancedFeatures } from "../../src/engine/advancedFeatures";
import type { LocalRAG } from "../../src/engine/localRAG";
import { estadoPropuestasAutonomas, limpiarPatrones } from "../propuestasAutonomas";

export interface DepsFeatures {
  /** La MISMA instancia de capacidades del monolito (flags + git + plantillas). */
  features: AdvancedFeatures;
  /** La MISMA instancia de memoria vectorial: el índice profundo escribe acá. */
  localRag: LocalRAG;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_FEATURES = [
  "GET /api/features",
  "POST /api/features/toggle",
  "POST /api/features/templates",
  "GET /api/features/git/log",
  "POST /api/features/git/commit",
  "POST /api/features/git/rollback",
  "POST /api/features/deep-index",
  // v1.76.0 · auto-propuesta: qué ve el contador y cómo se olvida (2 rutas).
  "GET /api/features/propuestas/estado",
  "POST /api/features/propuestas/olvidar",
] as const;

export function registrarFeatures(app: express.Express, deps: DepsFeatures): void {
  const features = deps.features;
  const localRag = deps.localRag;

  // ─── movidos tal cual desde server.ts (v1.70.2, Fase 2) ──────────────────
  /** Catálogo completo: qué hay, qué pide y si tu máquina lo aguanta. */
  app.get("/api/features", (_req: Request, res: Response) => {
    return res.json({ ok: true, hardware: features.hardware(), features: features.catalog() });
  });

  /** El botón: activa o desactiva una capacidad y persiste la decisión. */
  app.post("/api/features/toggle", (req: Request, res: Response) => {
    const id = String(req.body?.id || "") as any;
    const activar = req.body?.enabled === true || req.body?.enabled === "true";
    const ok = features.setOn(id, activar);
    if (!ok) return res.status(400).json({ ok: false, error: "Capacidad desconocida." });
    console.log(`[CerebroNico] Capacidad "${id}" ${activar ? "ACTIVADA" : "desactivada"}`);
    const extra: any = { id, enabled: activar };
    // Al activar el multi-cerebro se crean las plantillas si faltan (nunca
    // sobrescribe lo que el usuario ya haya escrito).
    if (id === "multi_brain" && activar) extra.plantillasCreadas = features.ensureDomainTemplates();
    if (id === "git_memory") extra.git = features.gitDisponible();
    return res.json({ ok: true, ...extra, features: features.catalog() });
  });

  /** Crea las plantillas de sub-cerebro sin activar nada. */
  app.post("/api/features/templates", (_req: Request, res: Response) => {
    return res.json({ ok: true, creados: features.ensureDomainTemplates() });
  });

  /** Historial Git de la memoria: la evolución, línea por línea. */
  app.get("/api/features/git/log", (_req: Request, res: Response) => {
    return res.json({ ok: true, ...features.gitDisponible(), commits: features.logMemoria(20) });
  });

  /** Confirma el estado actual de la memoria en Git (a mano). */
  app.post("/api/features/git/commit", (req: Request, res: Response) => {
    const motivo = String(req.body?.motivo || "actualización manual");
    // v2.1 — Aquí había un `ok: true` ANTES del spread, y `commitMemoria` ya
    // devuelve su propio `ok`: el literal quedaba pisado y no hacía nada. Se
    // quita el muerto y manda el valor real de la función.
    return res.json({ ...features.commitMemoria(motivo) });
  });

  /** Vuelve a una confirmación concreta de memoria.md. */
  app.post("/api/features/git/rollback", (req: Request, res: Response) => {
    const hash = String(req.body?.hash || "");
    if (!hash) return res.status(400).json({ ok: false, error: "Falta 'hash'." });
    // v2.1 — Igual que arriba: el `ok` que cuenta es el de `rollbackGit`.
    return res.json({ ...features.rollbackGit(hash) });
  });

  /**
   * Índice profundo: indexa TODO el código del proyecto en la memoria vectorial.
   * Solo funciona si la capacidad está activada y la vectorización también.
   */
  app.post("/api/features/deep-index", async (_req: Request, res: Response) => {
    try {
      if (!features.isOn("deep_index")) {
        return res.status(400).json({ ok: false, error: "La capacidad «Índice profundo del código» está desactivada." });
      }
      const fuentes = features.collectProjectSources();
      if (fuentes.length === 0) {
        return res.json({ ok: true, archivos: 0, message: "No se encontraron archivos indexables en el proyecto." });
      }
      // Se necesita la memoria vectorial encendida para poder indexar.
      if (!localRag.isEnabled()) localRag.setEnabled(true);
      const r = await localRag.reindex(fuentes);
      return res.json({ ok: true, archivos: fuentes.length, ...r, ...localRag.status(path.join(process.cwd(), "memoria.md")) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── v1.76.0 · AUTO-PROPUESTA (la capacidad con motor propio) ─────────────
  /** Qué patrones vio el contador, totales, cooldown y propuestas generadas. */
  app.get("/api/features/propuestas/estado", (_req: Request, res: Response) => {
    return res.json(estadoPropuestasAutonomas());
  });

  /** Olvida los contadores (el humano manda sobre la memoria del patrón). */
  app.post("/api/features/propuestas/olvidar", (_req: Request, res: Response) => {
    return res.json(limpiarPatrones());
  });
}
