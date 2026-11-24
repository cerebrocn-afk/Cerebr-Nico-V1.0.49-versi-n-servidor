/**
 * nucleoAgentico.ts (router) — EL NÚCLEO AGÉNTICO A LA VISTA (v1.85.0 / v1.86.0)
 * ============================================================================
 * QUÉ EXPONE (FASE 6 puntos 2 y 4 + FASE 7 punto 3):
 *   POST /api/consejo/decidir      → una frase, el ciclo completo, y SU TRAZA
 *   GET  /api/consejo/trazas       → la cara de «Hoja de Ruta Activa»
 *   GET  /api/consejo/trazas/:id   → una traza entera, etapa por etapa
 *   GET  /api/consejo/aduana       → qué controla la aduana de lo forjado
 *   POST /api/consejo/aduana       → auditar una receta ANTES de instalarla
 *   GET  /api/multiagente/estado   → los equipos vivos y su relevo compartido
 *   POST /api/multiagente/equipo   → armar equipo, encolar y pasar las tareas
 *   GET  /api/explicar?pasoId=N    → «¿por qué decidiste esto?», citando ruta+línea
 *
 * POR QUÉ FUERA DEL MONOLITO: el trinquete de `server.ts` (V8 §8.1). Todo el
 * criterio vive en `src/engine/*` y lo prueban las suites homónimas; acá solo hay
 * traducción HTTP, la puerta de la casa (`sandboxAuthorized`) y la inyección de
 * las voces reales (`llamarVoces` de server/enjambreLlamadas), que es lo que hace
 * que el multiagente sea un proceso y no un panel que simula.
 *
 * LO QUE ESTE ROUTER NO HACE: no decide nada por su cuenta, no escribe discos que
 * no sean los del motor, y no inventa explicaciones — si la traza no existe,
 * `/api/explicar` lo dice con los pasos que sí existen.
 */
import type express from "express";
import type { Request, Response } from "express";

import { decidir, hojaTrazas, trazaPorId, listarTrazas, estadoCiclo, cargarTrazas, type TrazaDecision } from "../../src/engine/cicloDecision";
import { estadoAduanaForja, pasarAduanaForja, auditarLoteForjado } from "../../src/engine/aduanaForja";
import { explicarPaso, explicarUltimoPaso, auditarCitas, estadoExplicar } from "../../src/engine/explicarDecision";
import {
  crearEquipo,
  encolar,
  pasarTarea,
  estadoEquipo,
  cerrarSesion,
  consultarPizarra,
  type Equipo,
  type LlamadaEquipo,
} from "../../src/engine/multiagenteRelevo";
import { llamarVoces, type CredencialesEnjambre } from "../enjambreLlamadas";


export interface DepsNucleoAgentico {
  /** Raíz de datos del motor (ahí viven `cerebro/indice.json` y `cerebro/trazas/`). */
  raizDatos: string;
  /** Raíz del código fuente: con la que se resuelven las citas de regla. */
  raizFuente: string;
  /** La puerta de la casa. */
  sandboxAuthorized: (req: Request) => boolean;
  /** URL de Ollama (para que un especialista pueda hablar con un local). */
  ollamaUrl?: string;
  /** Capacidad `auto_relay` del panel de capacidades (el usuario manda). */
  relevoActivado?: () => boolean;
}

export const RUTAS_NUCLEO_AGENTICO = [
  "POST /api/consejo/decidir",
  "GET /api/consejo/trazas",
  "GET /api/consejo/trazas/:id",
  "GET /api/consejo/aduana",
  "POST /api/consejo/aduana",
  "GET /api/multiagente/estado",
  "POST /api/multiagente/equipo",
  "GET /api/explicar",
] as const;

/** Los equipos viven en la memoria del proceso. Se declara, no se esconde. */
const EQUIPOS = new Map<string, Equipo>();

function credencialesDe(cuerpo: any, ollamaPorDefecto?: string): CredencialesEnjambre {
  const c = cuerpo?.credenciales || {};
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.keys || {})) {
    if (typeof v === "string" && v.trim()) keys[k] = v.trim();
  }
  return {
    ollamaUrl: String(c.ollamaUrl || ollamaPorDefecto || "http://127.0.0.1:11434"),
    keys,
    customUrl: String(c.customUrl || "").trim(),
    customKey: String(c.customKey || "").trim(),
  };
}

export function registrarNucleoAgentico(app: express.Express, deps: DepsNucleoAgentico): void {
  // ─── FASE 6.2 · el ciclo de decisión con trazas ───────────────────────────
  app.post("/api/consejo/decidir", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const frase = String(req.body?.frase ?? "");
    const traza = decidir(frase, {
      raizDatos: deps.raizDatos,
      raizFuente: deps.raizFuente,
      datos: req.body?.datos && typeof req.body.datos === "object" ? req.body.datos : undefined,
      entidadForzada: req.body?.entidad ? String(req.body.entidad) : undefined,
      ejecutar: req.body?.ejecutar !== false,
    });
    return res.status(200).json({ ok: true, traza, hoja: hojaTrazas(8) });
  });

  app.get("/api/consejo/trazas", (_req: Request, res: Response) => {
    return res.json({
      ...hojaTrazas(Math.min(50, Math.max(1, Number(_req.query?.max) || 12))),
      disco: estadoCiclo(deps.raizDatos),
      panel: "Estas filas son las que muestra «Hoja de Ruta Activa» en su bloque de trazas del ciclo.",
    });
  });

  app.get("/api/consejo/trazas/:id", (req: Request, res: Response) => {
    const t = trazaPorId(String(req.params.id)) || cargarTrazas(deps.raizDatos, 200).trazas.find((x) => x.id === req.params.id || String(x.secuencia) === String(req.params.id).replace(/^#/, ""));
    if (!t) return res.status(404).json({ ok: false, motivo: `no existe la traza «${req.params.id}»`, disponibles: listarTrazas(10).map((x) => x.id) });
    return res.json({ ok: true, traza: t });
  });

  // ─── FASE 6.4 · la aduana de lo forjado ──────────────────────────────────
  app.get("/api/consejo/aduana", (_req: Request, res: Response) => res.json(estadoAduanaForja()));

  app.post("/api/consejo/aduana", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const lote = Array.isArray(req.body?.espejos) ? req.body.espejos : null;
    if (lote) {
      const r = auditarLoteForjado(
        lote.map((x: any) => ({ ficha: x?.ficha || x, codigo: String(x?.codigo ?? "") })),
        { existentes: (req.body?.existentes || []).map(String) },
      );
      return res.status(r.ok ? 200 : 422).json(r);
    }
    const ficha = req.body?.ficha || req.body;
    const v = pasarAduanaForja(ficha, String(req.body?.codigo ?? ""), { existentes: (req.body?.existentes || []).map(String) });
    return res.status(v.ok ? 200 : 422).json(v);
  });

  // ─── FASE 6.3 · el multiagente con relevo compartido ─────────────────────
  app.get("/api/multiagente/estado", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      equipos: [...EQUIPOS.values()].map((e) => estadoEquipo(e)),
      nota: "Los equipos viven en la memoria del proceso: al reiniciar el servidor se cierran (la pizarra, en cambio, queda en el órgano).",
    });
  });

  /**
   * Arma el equipo, encola las tareas y las pasa. Las voces son REALES: van por
   * `llamarVoces` (el mismo lazo que el enjambre ecléctico, con reloj y cuarentena
   * heredados de `fetchCloud`). Sin credenciales, el relevo se agota y el informe
   * honesto lo dice — que es exactamente el camino que el plano quiere ver.
   */
  app.post("/api/multiagente/equipo", async (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const cuerpo = req.body || {};
    const especialistas = Array.isArray(cuerpo.especialistas) ? cuerpo.especialistas.map(String) : [];
    const favoritos = Array.isArray(cuerpo.favoritos)
      ? cuerpo.favoritos.filter((f: any) => f && f.modelId).map((f: any) => ({ provider: String(f.provider || ""), modelId: String(f.modelId), name: f.name ? String(f.name) : undefined }))
      : [];
    const armado = crearEquipo(especialistas, favoritos, {
      raizDatos: deps.raizDatos,
      primarias: cuerpo.primarias && typeof cuerpo.primarias === "object" ? cuerpo.primarias : undefined,
      relevoActivado: deps.relevoActivado ? deps.relevoActivado() : cuerpo.relevoActivado !== false,
    });
    if (!armado.ok || !armado.equipo) {
      return res.status(422).json({ ok: false, rechazados: armado.rechazados, motivo: armado.motivo });
    }
    const equipo = armado.equipo;
    const tareas = Array.isArray(cuerpo.tareas) ? cuerpo.tareas : [];
    encolar(equipo, tareas.filter((t: any) => t && t.id && t.frase).map((t: any) => ({ id: String(t.id), frase: String(t.frase), entidad: t.entidad ? String(t.entidad) : undefined, datos: t.datos })));
    EQUIPOS.set(equipo.id, equipo);

    const cred = credencialesDe(cuerpo, deps.ollamaUrl);
    const resultados: unknown[] = [];
    let guard = 0;
    while (guard++ < 20) {
      const tarea = equipo.cola.shift();
      if (!tarea) break;
      const r = await pasarTarea(equipo, tarea, async (l: LlamadaEquipo, t) => {
        const [resp] = await llamarVoces([{ provider: l.proveedor, model: l.modelo }], t.frase, cred, { maxTokens: Number(cuerpo.maxTokens) || 900, timeoutMs: Number(cuerpo.timeoutMs) || 45_000 });
        if (!resp) return { texto: "", fallo: "el lazo de voces no devolvió ninguna voz" };
        return resp.ok ? { texto: resp.texto } : { texto: resp.texto, fallo: resp.error || "respuesta vacía" };
      });
      resultados.push(r);
    }
    const informe = [...resultados].reverse().find((r: any) => r.informe) as any;
    return res.json({
      ok: resultados.every((r: any) => r.ok),
      equipo: estadoEquipo(equipo),
      rechazados: armado.rechazados,
      resultados,
      pizarra: consultarPizarra(equipo, tareas.map((t: any) => String(t?.frase || "")).join(" ").slice(0, 180), 4),
      informe: informe?.informe,
    });
  });

  // ─── FASE 7.3 · «¿por qué decidiste esto?» ───────────────────────────────
  app.get("/api/explicar", (req: Request, res: Response) => {
    const ctx = { raizFuente: deps.raizFuente, raizDatos: deps.raizDatos };
    const pasoId = req.query?.pasoId;
    const explicacion = pasoId === undefined || String(pasoId) === "" ? explicarUltimoPaso(ctx) : explicarPaso(String(pasoId), ctx);
    const auditoria = auditarCitas(explicacion, ctx);
    return res.status(explicacion.ok ? 200 : 422).json({
      ...explicacion,
      auditoria,
      contrato: "ninguna cita sin ruta: cada {archivo, linea} se reverificó contra el disco antes de responder",
      pasos: estadoExplicar(ctx).pasos,
    });
  });
}

/** Cierra las sesiones de todos los equipos (lo llama el apagado del servidor). */
export function cerrarEquipos(): number {
  let n = 0;
  for (const e of EQUIPOS.values()) {
    for (const id of Object.keys(e.sesiones)) { if (cerrarSesion(e, id).ok) n++; }
  }
  return n;
}
