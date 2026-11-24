/**
 * calidad.ts — ROUTER DE CALIDAD ASISTIDA (Fase 2, v1.70.3)
 * =========================================================
 * QUÉ ES: dos dominios hermanos salen del monolito `server.ts`:
 *   · `verifier`  — GET /api/verifier/status, POST /api/verifier/config,
 *     POST /api/verifier/check (el juez independiente en la nube);
 *   · `governor`  — GET /api/governor (la lectura honesta del hardware).
 * Se mueven **tal cual** (regla de la Fase 2: «se mueve, no se mejora») en un
 * solo archivo porque los dos responden la misma pregunta desde veredas
 * distintas: «¿aguanta esta máquina y está bien lo que propone?».
 *
 * POR QUÉ FUERA DE server.ts: el trinquete de `contrato-rutas.json` y la suite
 * `androidProyecto` exigen que el monolito no crezca y quede bajo 12287
 * líneas. Registrar por delegación añade DOS líneas al monolito y le quita
 * ~60. El contrato se REGENERA con `node scripts/superficie.mjs` — no se
 * edita a mano, porque un contrato editable es un trinquete que se afloja
 * solo.
 *
 * DEPENDENCIAS: las MISMAS instancias del monolito (`verifier`, `governor`),
 * inyectadas por `deps`. Una ruta movida tiene que seguir hablando con el
 * mismo estado que antes, o sería otra ruta con el mismo nombre.
 */
import type express from "express";
import type { Request, Response } from "express";
import type { CloudVerifier } from "../../src/engine/cloudVerifier";
import type { HardwareGovernor } from "../../src/engine/hardwareGovernor";

export interface DepsCalidad {
  /** El MISMO verificador de nube del monolito (config viva, no una copia). */
  verifier: CloudVerifier;
  /** El MISMO gobernador de hardware (lee el estado real de la máquina). */
  governor: HardwareGovernor;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_CALIDAD = [
  "GET /api/verifier/status",
  "POST /api/verifier/config",
  "POST /api/verifier/check",
  "GET /api/governor",
] as const;

export function registrarCalidad(app: express.Express, deps: DepsCalidad): void {
  const verifier = deps.verifier;
  const governor = deps.governor;

  // ─── movidos tal cual desde server.ts (v1.70.3, Fase 2) ──────────────────
  /** Estado: activado o no, proveedor del juez, si hay clave y coste local. */
  app.get("/api/verifier/status", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /** Configura el juez: activar, proveedor, modelo y política ante duda. */
  app.post("/api/verifier/config", (req: Request, res: Response) => {
    try {
      const patch: any = {};
      if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
      if (typeof req.body?.provider === "string") patch.provider = req.body.provider;
      if (typeof req.body?.model === "string" && req.body.model) patch.model = req.body.model;
      if (typeof req.body?.baseUrl === "string") patch.baseUrl = req.body.baseUrl;
      if (typeof req.body?.apiKeyEnv === "string" && req.body.apiKeyEnv) patch.apiKeyEnv = req.body.apiKeyEnv;
      if (req.body?.anteDuda === "dejar_pasar" || req.body?.anteDuda === "rechazar") patch.anteDuda = req.body.anteDuda;
      const cfg = verifier.setConfig(patch);
      console.log(`[CerebroNico] Verificador ${cfg.enabled ? "ACTIVADO" : "desactivado"} · juez: ${cfg.provider}/${cfg.model}`);
      return res.json({ ok: true, ...verifier.status() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Revisa una propuesta. Sin coste si falla la capa determinista.
   * `archivosProyecto` permite además comprobar que los imports existan.
   */
  app.post("/api/verifier/check", async (req: Request, res: Response) => {
    try {
      const peticion = String(req.body?.peticion || "");
      const propuesta = String(req.body?.propuesta || "");
      if (!propuesta) return res.status(400).json({ ok: false, error: "Falta 'propuesta'." });
      const archivosProyecto = Array.isArray(req.body?.archivosProyecto)
        ? req.body.archivosProyecto.map((x: any) => String(x))
        : undefined;
      const v = await verifier.verificar(peticion, propuesta, { archivosProyecto, exigirCodigo: req.body?.exigirCodigo === true });
      return res.json({ ok: true, ...v });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Gobernador de hardware: fase, presupuesto, qué cabe ahora y en qué modo.
   * Es la pieza que convierte "tengo 12 GB" en decisiones concretas.
   */
  app.get("/api/governor", (_req: Request, res: Response) => {
    try {
      return res.json({ ok: true, ...governor.report() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}
