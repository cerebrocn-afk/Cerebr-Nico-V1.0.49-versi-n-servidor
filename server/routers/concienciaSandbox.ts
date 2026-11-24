/**
 * concienciaSandbox.ts (router) — `/api/conciencia` PARA LA APP GENERADA
 * =====================================================================
 * v1.86.0 · FASE 7.1 y 7.2 del plano de la perfección.
 *
 * QUÉ EXPONE:
 *   GET  /api/conciencia                 → la última cosa que la app recordó
 *                                          (+ lo que enruta una consulta)
 *   POST /api/conciencia                 → la app escribe una memoria nueva
 *   GET  /api/conciencia/manifiesto      → qué campos le deja ver el IDE
 *   POST /api/conciencia/manifiesto      → regenera el manifiesto en el sandbox
 *
 * POR QUÉ ESTÁ FUERA DE `server.ts`: el trinquete (presupuesto de líneas, V8
 * §8.1 y `superficieRutas`). Aquí no hay lógica propia: la lógica vive en
 * `src/engine/concienciaSandbox.ts`, que es lo que prueban las suites. El router
 * solo traduce HTTP ↔ módulo y aplica la guarda de aislamiento ANTES de leer o
 * escribir una sola vez.
 *
 * LA RAÍZ NUNCA LA ELIGE EL CLIENTE: se pregunta al servidor cuál es el proyecto
 * activo del sandbox (`resolverRaizSandbox`). Un body con `raiz` sería un túnel
 * hacia cualquier carpeta del disco, y el plano es explícito: «nunca toca
 * archivos del usuario».
 */
import type express from "express";
import type { Request, Response } from "express";
import {
  escribirConcienciaSandbox,
  leerConcienciaSandbox,
  estadoConcienciaSandbox,
  pesoCerebroSandbox,
  guardarRaizSandbox,
} from "../../src/engine/concienciaSandbox";
import {
  MANIFIESTO_ESPEJO_SANDBOX,
  LO_QUE_NO_CRUZA,
  auditarManifiestoEspejo,
  escribirManifiestoEspejo,
  leerManifiestoEspejo,
  rutaManifiestoEspejo,
  filtrarInstantaneaPorManifiesto,
  PRESUPUESTO_TOKENS_ESPEJO,
} from "../../src/engine/manifiestoEspejo";

export interface DepsConcienciaSandbox {
  /** Raíz de datos del IDE (el workspace donde viven los proyectos del sandbox). */
  raizWorkspace: string;
  /** Carpeta de la propia IDE (para que la guarda rechace raíces que la contienen). */
  raizApp: string;
  /** El proyecto activo del sandbox, resuelto por el monolito. `null` si no hay. */
  resolverRaizSandbox: () => string | null;
  /** La puerta de la casa: loopback o token válido. */
  sandboxAuthorized: (req: Request) => boolean;
  /** La instantánea viva del IDE, para que el espejo se pueda INSPECCIONAR filtrado. */
  instantaneaViva?: () => any;
}

export const RUTAS_CONCIENCIA_SANDBOX = [
  "GET /api/conciencia",
  "POST /api/conciencia",
  "GET /api/conciencia/manifiesto",
  "POST /api/conciencia/manifiesto",
] as const;

export function registrarConcienciaSandbox(app: express.Express, deps: DepsConcienciaSandbox): void {
  const ctx = () => ({ raizWorkspace: deps.raizWorkspace, raizApp: deps.raizApp });
  const raizActiva = (): { raiz: string | null; motivo?: string } => {
    let bruto: string | null = null;
    try { bruto = deps.resolverRaizSandbox(); } catch (e: any) { return { raiz: null, motivo: `no se pudo resolver el proyecto activo: ${e?.message || e}` }; }
    if (!bruto) return { raiz: null, motivo: "no hay proyecto activo en el sandbox: levantaló con el preview antes de pedirle conciencia a la app" };
    const guarda = guardarRaizSandbox(bruto, ctx());
    return guarda.ok && guarda.raiz ? { raiz: guarda.raiz } : { raiz: null, motivo: guarda.motivo };
  };

  /** GET /api/conciencia — la app pregunta por su propio contexto. */
  app.get("/api/conciencia", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const consulta = String(req.query?.consulta ?? "");
    const max = Number(req.query?.max) || undefined;
    if (String(req.query?.estado ?? "") === "1") {
      const est = estadoConcienciaSandbox(ctx(), raiz.raiz);
      return res.status(est.ok ? 200 : 422).json({ ...est, peso: pesoCerebroSandbox(raiz.raiz), manifiesto_ruta: rutaManifiestoEspejo(raiz.raiz) });
    }
    const lectura = leerConcienciaSandbox(ctx(), raiz.raiz, { consulta, max });
    return res.status(lectura.ok ? 200 : 422).json(lectura);
  });

  /** POST /api/conciencia — la app recuerda algo. */
  app.post("/api/conciencia", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const r = escribirConcienciaSandbox(
      {
        tipo: req.body?.tipo,
        tema: req.body?.tema,
        titulo: req.body?.titulo,
        texto: String(req.body?.texto ?? ""),
        palabras: req.body?.palabras,
        estado: req.body?.estado,
      },
      ctx(),
      raiz.raiz,
    );
    return res.status(r.ok ? 200 : 422).json(r);
  });

  /** GET /api/conciencia/manifiesto — qué cruza el espejo, declarado. */
  app.get("/api/conciencia/manifiesto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    const auditoria = auditarManifiestoEspejo();
    const enDisco = raiz.raiz ? leerManifiestoEspejo(raiz.raiz) : null;
    // Si el llamante trae una instantánea de prueba, se devuelve FILTRADA: así se
    // puede ver con los propios ojos que lo no declarado no cruza.
    const filtrada = req.body?.instantanea || (req as any).query?.mostrar === "viva"
      ? filtrarInstantaneaPorManifiesto(deps.instantaneaViva ? deps.instantaneaViva() : null)
      : null;
    return res.json({
      ok: auditoria.ok,
      ruta: raiz.raiz ? rutaManifiestoEspejo(raiz.raiz) : null,
      escrito: !!enDisco,
      manifiesto: MANIFIESTO_ESPEJO_SANDBOX,
      no_cruza: LO_QUE_NO_CRUZA,
      auditoria,
      presupuesto_tokens: PRESUPUESTO_TOKENS_ESPEJO,
      ...(filtrada ? { ejemplo_filtrado: filtrada } : {}),
    });
  });

  /** POST /api/conciencia/manifiesto — regenera el manifiesto en el sandbox. */
  app.post("/api/conciencia/manifiesto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ ok: false, error: "Acceso no autorizado." });
    const raiz = raizActiva();
    if (!raiz.raiz) return res.status(409).json({ ok: false, motivo: raiz.motivo });
    const auditoria = auditarManifiestoEspejo();
    if (!auditoria.ok) return res.status(422).json({ ok: false, motivo: "el manifiesto no pasa su propia auditoría", auditoria });
    const r = escribirManifiestoEspejo(raiz.raiz);
    return res.status(r.ok ? 200 : 422).json({ ...r, auditoria });
  });
}
