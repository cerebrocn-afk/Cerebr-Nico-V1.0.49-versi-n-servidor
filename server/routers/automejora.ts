/**
 * server/routers/automejora.ts — v1.93.0 · LA POLÍTICA DE AUTOEMEJORA, EN RUTAS
 * =============================================================================
 * Las cuatro preguntas que cualquier lazo de autoemejora tiene que poder hacerle a
 * la política ANTES de tocar nada: qué existe, qué me toca confirmar, si estoy
 * autorizado y si el parche se adopta o se revierte.
 *
 * NINGUNA ruta de este archivo ejecuta un comando. DECIDEN y EXPLICAN. El que
 * ejecuta sigue siendo `run_command`/`write_file` del monolito; este router es la
 * aduana que ese lazo tiene que consultar, y si una mutación del cuerpo ocurre sin
 * pasar por acá, el registro de decisiones lo va a contar.
 *
 * POR QUÉ FUERA DEL MONOLITO: `contrato-rutas.json` fija el presupuesto de
 * `server.ts` en 12 172 líneas y `techoContexto` lo vigila. La precedentede la casa
 * (v1.62.0, `geminiTts`) es EXTRAER un bloque cohesivo cuando el contador pasa del
 * techo, no subir el número. Mismo patrón acá: el dominio sale y `sandboxAuthorized`
 * se inyecta, que es lo único que necesita del estado del monolito.
 *
 * La autenticación de las dos rutas mutantes es la MISMA aduana de las 11 puertas
 * del sandbox y de `/api/quirofano/*` (v1.6.32): lo que abre una puerta de escritura
 * se autoriza igual que lo que escribe.
 */
import type { Request, Response, Application } from "express";
import {
  VERSION_AUTOMEJORA,
  COMANDOS_DE_AUTOMEJORA,
  autorizacionDe,
  presupuestoDeParche,
  decidirAdopcion,
  leerPruebaDePuerta,
  inventarioDeAutomejora,
  preguntaDeConfirmacion,
  comandoDeAutomejora,
  type OrigenOrden,
} from "../../src/engine/automejora";

const ORIGENES: readonly string[] = ["usuario", "modelo", "herramienta", "archivo"];
const VEREDICTOS_QUIROFANO = ["seguro", "revisar", "peligroso"] as const;

export interface RutasAutomejora {
  /** La aduana del monolito (`sandboxAuthorized`). Se inyecta: el router no conoce
   *  ni sesiones ni tokens, así que no puede aflojarla por su cuenta. */
  autorizada: (req: Request) => boolean;
}

export function registrarAutomejora(app: Application, deps: RutasAutomejora): void {
  const { autorizada } = deps;

  /** Inventario completo, con el comando LITERAL a la vista. Una lista de
   *  capacidades que no muestra QUÉ corre no es transparencia, es marketing. */
  app.get("/api/automejora", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: VERSION_AUTOMEJORA,
      inventario: inventarioDeAutomejora(),
      comandos: COMANDOS_DE_AUTOMEJORA.map((c) => ({
        id: c.id,
        nivel: c.nivel,
        titulo: c.titulo,
        comando: c.comando,
        paraQue: c.paraQue,
        reversible: c.reversible,
        requiere: c.requiere,
      })),
    });
  });

  /** La pregunta que ve la persona: comando, para qué, reversible y el token
   *  exacto que hay que escribir. Nada poético, nada que haya que adivinar. */
  app.post("/api/automejora/pregunta", (req: Request, res: Response) => {
    const id = String(req.body?.id ?? "");
    if (!comandoDeAutomejora(id)) {
      return res.status(400).json({ ok: false, error: `comando desconocido: «${id}». La lista de automejora es cerrada.` });
    }
    res.json({ ok: true, pregunta: preguntaDeConfirmacion(id) });
  });

  /** ¿Se puede hacer? Depende del NIVEL del comando y del ORIGEN de la orden.
   *  Un origen que no está en la lista corta en `archivo` (el más desconfiado):
   *  fallar cerrado es la única alternativa a inventarse un origen amable. */
  app.post("/api/automejora/autorizar", (req: Request, res: Response) => {
    if (!autorizada(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const crudoOrigen = String(req.body?.origen ?? "usuario");
    const origen = (ORIGENES.includes(crudoOrigen) ? crudoOrigen : "archivo") as OrigenOrden;
    const archivos = Array.isArray(req.body?.archivos) ? req.body.archivos.map((r: any) => String(r)) : [];
    const presupuesto =
      archivos.length || req.body?.lineasNetas !== undefined
        ? presupuestoDeParche(archivos, Number(req.body?.lineasNetas ?? 0))
        : null;
    const r = autorizacionDe({
      id: String(req.body?.id ?? ""),
      origen,
      tokenUsuarioConfirmado: (req.body?.token ?? null) as string | null,
      presupuesto,
    });
    return res.json({ ok: r.permite, ...r });
  });

  /** ¿Se adopta el parche o se revierte? Recibe el log RAW de `npm run validar` y
   *  el VEREDICTO se lee ACÁ, en el servidor: no lo jura quien quiere adoptar.
   *  Esa lectura es toda la defensa contra el riesgo 1 (degradación). */
  app.post("/api/automejora/puerta", (req: Request, res: Response) => {
    if (!autorizada(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const prueba = leerPruebaDePuerta(String(req.body?.log ?? ""), Boolean(req.body?.tscOk));
    const q = req.body?.quirofano as { veredicto?: unknown; motivos?: unknown } | undefined;
    // El veredicto solo se acepta en sus TRES palabras. Un payload que dijera
    // `veredicto: "cualquiera"` se trata como «no pasó por el quirófano»
    // (bloqueante nombrado), nunca como «seguro».
    const veredictoQf =
      q && typeof q === "object" && (VEREDICTOS_QUIROFANO as readonly string[]).includes(String(q.veredicto))
        ? (String(q.veredicto) as (typeof VEREDICTOS_QUIROFANO)[number])
        : null;
    const decision = decidirAdopcion({
      prueba,
      quirofano: veredictoQf
        ? { veredicto: veredictoQf, motivos: Array.isArray(q?.motivos) ? q!.motivos.map(String) : [] }
        : null,
      reversible: Boolean(req.body?.reversible),
    });
    res.json({ ok: decision.accion === "adoptar", decision, prueba });
  });
}
