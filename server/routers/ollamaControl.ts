/**
 * ollamaControl.ts — ROUTER DE RESIDENCIA OLLAMA (v1.16.3.1 · BAJO CONSUMO)
 * ==========================================================================
 * QUÉ ES: las dos rutas que el informe MEJORA_MODO_BAJO_CONSUMO_v1 §2.3 pide:
 *   · GET  /api/ollama/ps        → qué modelos están clavados en RAM y cuántos
 *                                  MB ocupan (con caché de 5 s, sin machacar).
 *   · POST /api/ollama/expulsar  → la salida: keep_alive:0 por modelo, o de
 *                                  TODO si el cuerpo viene vacío.
 * PARA QUÉ SIRVE: la pestaña "Puertos" muestra el chip `Ollama: 4.1 GB` y el
 * botón Expulsar. El usuario ve por qué se calienta la máquina y la apaga sin
 * abrir la consola. La herramienta del agente (ollama_estado / ollama_expulsar)
 * pasa por el MISMO módulo — una verdad, dos puertas.
 *
 * POR QUÉ ESTÁ FUERA DEL MONOLITO: el trinquete (server.ts no crece). Aquí no
 * hay estado propio: el sondeo y la caché viven en server/ollamaBajoConsumo.ts
 * y este fichero solo traduce HTTP ↔ módulo.
 */
import type express from "express";
import type { Request, Response } from "express";
import { expulsarModelos, sondearOllamaPs } from "../ollamaBajoConsumo";
import { aplicarPreferenciaMotor, fijarPreferenciaMotor, getModelProfile, leerPreferenciaMotor } from "../../src/engine/modelTiers";

export interface DepsOllamaControl {
  /** URL base de Ollama (la misma que usa el motor de inferencia). */
  ollamaUrl: string;
  /**
   * v1.57.14 — RAM total del equipo, para que el POST de preferencia pueda
   * responder con el techo ya aplicado en vez de prometer lo que el usuario
   * tecleó. Opcional: sin medida, `techoContexto` no opina y el dial pasa tal cual.
   */
  ramGb?: number;
}

/** Las rutas que registra este módulo. */
export const RUTAS_OLLAMA_CONTROL = [
  "GET /api/ollama/ps",
  "POST /api/ollama/expulsar",
  "GET /api/ollama/preferencia",
  "POST /api/ollama/preferencia",
] as const;

export function registrarOllamaControl(app: express.Express, deps: DepsOllamaControl): void {
  app.get("/api/ollama/ps", async (_req: Request, res: Response) => {
    const estado = await sondearOllamaPs(deps);
    return res.json({ ok: true, ...estado });
  });

  app.post("/api/ollama/expulsar", async (req: Request, res: Response) => {
    const crudo = Array.isArray(req.body?.modelos) ? req.body.modelos : [];
    const modelos = crudo.map((m: unknown) => String(m || "").trim()).filter(Boolean);
    const r = await expulsarModelos(deps, modelos.length ? modelos : undefined);
    const estado = r.despues;
    return res.status(r.ok ? 200 : 502).json({
      ok: r.ok,
      expulsados: r.expulsados,
      fallidos: r.fallidos,
      residenteMb: estado.residenteMb,
      modelos: estado.modelos,
    });
  });

  /**
   * v1.57.14 — QUÉ ESTÁ PIDIENDO EL MOTOR (dial + escalera, no lo que se tecleó).
   * La respuesta dice el número que sale por la red y por qué, que es lo único
   * que convierte un recorte en algo honesto.
   */
  app.get("/api/ollama/preferencia", (req: Request, res: Response) => {
    const modelo = String(req.query?.modelo || "").trim();
    const pref = leerPreferenciaMotor();
    if (!modelo) return res.json({ ok: true, preferencia: pref, sinModelo: true });
    const p = getModelProfile(modelo, deps.ramGb);
    return res.json({
      ok: true,
      modelo,
      preferencia: pref,
      escalera: p.ctxEscalera ?? p.numCtx,
      numCtx: p.numCtx,
      keepAlive: p.keepAlive,
      recortado: p.ctxRecortado === true,
    });
  });

  /**
   * v1.57.14 — EL DIAL DEL PANEL PRO LLEGA HASTA AQUÍ. Antes el slider de
   * «Ventana de contexto» y el selector de «Mantener modelo en RAM» se
   * guardaban en localStorage y nadie los leía nunca: reguladores mudos.
   */
  app.post("/api/ollama/preferencia", (req: Request, res: Response) => {
    const cuerpo = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const aceptada = fijarPreferenciaMotor({ numCtx: cuerpo.numCtx, keepAlive: cuerpo.keepAlive });
    if (!aceptada.ok) return res.status(400).json({ ok: false, motivo: aceptada.motivo, preferencia: leerPreferenciaMotor() });
    const pref = leerPreferenciaMotor();
    const modelo = String(cuerpo.modelo || "").trim();
    if (!modelo) return res.json({ ok: true, preferencia: pref, sinModelo: true });
    const p = getModelProfile(modelo, deps.ramGb);
    return res.json({
      ok: true,
      modelo,
      preferencia: pref,
      escalera: p.ctxEscalera ?? p.numCtx,
      numCtx: p.numCtx,
      keepAlive: p.keepAlive,
      recortado: p.ctxRecortado === true,
      // El parte del motor aplicado, para que la UI lo imprima y no lo calle:
      // se compone desde la ESCALERA (no desde el perfil ya ajustado), o el
      // motivo diría «la escalera habría dicho 30m» citando el propio dial.
      aplicado: aplicarPreferenciaMotor(
        p.ctxEscalera ?? p.numCtx,
        p.keepAliveEscalera ?? p.keepAlive,
        p.remote,
        deps.ramGb,
        pref
      ),
    });
  });
}
