/**
 * server/routers/trabajo.ts — v1.95.0 · EL MANUAL DE TRABAJO, EN RUTAS
 * ====================================================================
 * `trabajoSeguro.ts` es criterio puro; sin un consumidor en el runtime sería otro
 * ensayo verde que nadie consulta (el censo de `presupuestoHuerfanos` lo canta rojo, y
 * con razón). Estas rutas EXponen el manual, el plan y el auditor de manifiesto para
 * que el arnés —y la UI— puedan pedirlos antes de ejecutar un trabajo de PDF/Word/web/app.
 *
 * Ninguna ruta escribe nada en disco: devuelven el contrato. Quien ejecuta sigue
 * siendo el lazo de herramientas.
 */
import type { Request, Response } from "express";
import type { Express } from "express";
import {
  TRABAJO_LISTA, RECETAS, RUTAS_TRABAJO, manualDeTrabajo, planDeTrabajo,
  inventarioEsperado, auditarInventario, VERSION_TRABAJO_SEGURO, type TipoTrabajo,
} from "../../src/engine/trabajoSeguro";

const esTrabajo = (v: unknown): v is TipoTrabajo =>
  typeof v === "string" && (TRABAJO_LISTA as string[]).includes(v);

export function registrarTrabajo(app: Express): void {
  // Inventario del manual: qué trabajos hay, cuáles tienen máquina y cuáles no.
  app.get("/api/trabajo", (_req: Request, res: Response) => {
    res.json({
      version: VERSION_TRABAJO_SEGURO,
      trabajos: TRABAJO_LISTA.map((t) => ({
        id: t,
        titulo: RECETAS[t].titulo,
        una_llamada: RECETAS[t].una_llamada,
        manifiesto: inventarioEsperado(t),
        // `pendiente` se muestra a propósito: el arnés no finge capacidades.
        pendiente: RECETAS[t].pendiente || null,
      })),
      rutas: RUTAS_TRABAJO,
    });
  });

  // El texto que se inyecta en el prompt cuando el turno es de este tipo de trabajo.
  app.get("/api/trabajo/manual", (req: Request, res: Response) => {
    const pedido = String(req.query.trabajo || "").trim();
    if (pedido && !esTrabajo(pedido)) {
      return res.status(400).json({ error: `Trabajo desconocido: «${pedido}». Opciones: ${TRABAJO_LISTA.join(", ")}.` });
    }
    const trabajos = pedido ? ([pedido] as TipoTrabajo[]) : TRABAJO_LISTA;
    const texto = manualDeTrabajo(trabajos);
    res.json({ trabajo: pedido || "todos", chars: texto.length, manual: texto });
  });

  // Etapas listas para `set_plan`, con la verificación y el manifiesto al final.
  app.post("/api/trabajo/plan", (req: Request, res: Response) => {
    const trabajo = req.body?.trabajo;
    if (!esTrabajo(trabajo)) {
      return res.status(400).json({ error: `Falta 'trabajo' (uno de: ${TRABAJO_LISTA.join(", ")}).` });
    }
    res.json({ trabajo, etapas: planDeTrabajo(trabajo, String(req.body?.titulo || trabajo)) });
  });

  // El «¿nunca faltan archivos?»: se le pasa el `list_files` real y se difféa.
  app.post("/api/trabajo/inventario", (req: Request, res: Response) => {
    const trabajo = req.body?.trabajo;
    const archivos = Array.isArray(req.body?.archivos) ? req.body.archivos.map(String) : null;
    if (!esTrabajo(trabajo)) {
      return res.status(400).json({ error: `Falta 'trabajo' (uno de: ${TRABAJO_LISTA.join(", ")}).` });
    }
    if (!archivos) return res.status(400).json({ error: "Falta 'archivos': la lista de rutas relativas que devuelve list_files." });
    const esperado = inventarioEsperado(trabajo);
    const dictamen = auditarInventario(archivos, esperado);
    res.json({ trabajo, esperado, ...dictamen });
  });
}
