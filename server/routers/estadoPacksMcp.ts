/**
 * estadoPacksMcp.ts — EL INVENTARIO DE HERRAMIENTAS, AUDITABLE EN VIVO (v1.0.28)
 * ===========================================================================
 *
 * POR QUÉ SE EXTRAE (y no se añade al monolito): `server.ts` está bajo
 * presupuesto de líneas (`contrato-rutas.json`) y ese presupuesto es un
 * trinquete DELIBERADO: la casa parte, no engorda. Las dos rutas de aquí ya
 * existían o nacen con esta versión, y su cuerpo depende solo de lo que se le
 * inyecta — ninguna lee una variable global del monolito.
 *
 * LO QUE RESUELVE: hasta v1.0.27 `GET /api/tools/packs/estado` solo miró los
 * packs HTTP. Un `mcp_servers.json` que no arrancaba nada era invisible ahí, así
 * que «el modelo no usa la red» se leía como un problema del modelo. Ahora la
 * misma ruta dice, con nombre y motivo, qué servidor MCP está en línea, cuál
 * falló, cuál está apagado por configuración y cuál se descartó por estar mal
 * escrito.
 *
 * DECISIONES:
 *   · La respuesta SIEMPRE trae `mcp` (aunque esté vacío). Un campo que aparece
 *     solo cuando hay servidores hace que el cliente tenga que distinguir «no
 *     hay» de «no me lo contaron».
 *   · `POST /api/mcp/recargar` cierra los procesos vivos antes de releer: sin
 *     eso, encender una entrada y recargar dejaría el proceso viejo huérfano.
 */
import type { Request, Response } from "express";

export interface DepsEstadoPacksMcp {
  /** Packs HTTP ya cargados: id, url, si llevan token, y sus nombres. */
  packsHttp: () => Array<{ id: string; url: string; autenticado: boolean; herramientas: string[] }>;
  reintentosUsados: () => number;
  reintentoMax: () => number;
  /** Estado del último intento de carga de servidores MCP. */
  estadoMcp: () => {
    cargados: Record<string, number>;
    fallidos: string[];
    apagados: string[];
    descartados: Array<{ id: string; motivo: string }>;
  } | null;
  /** Nombres de los servidores MCP vivos ahora mismo. */
  mcpVivos: () => string[];
  /** Recarga completa de los servidores MCP. */
  recargarMcp: () => Promise<{
    cargados: Record<string, number>;
    fallidos: string[];
    apagados: string[];
    descartados: Array<{ id: string; motivo: string }>;
  }>;
}

/**
 * Monta las dos rutas en la app. `app` es `any` a propósito: el router no
 * depende de los tipos de Express (en la máquina del agente no hay
 * `node_modules`, y una suite tiene que poder importar esto igual).
 */
export function registrarEstadoPacksMcp(app: any, deps: DepsEstadoPacksMcp): void {
  app.get("/api/tools/packs/estado", (_req: Request, res: Response) => {
    const estado = deps.estadoMcp();
    const mcp = {
      vivos: deps.mcpVivos(),
      cargados: estado?.cargados || {},
      fallidos: estado?.fallidos || [],
      apagados: estado?.apagados || [],
      descartados: estado?.descartados || [],
    };
    return res.json({
      ok: true,
      packs: deps.packsHttp(),
      mcp,
      reintentos_usados: deps.reintentosUsados(),
      reintento_max: deps.reintentoMax(),
    });
  });

  app.post("/api/mcp/recargar", async (_req: Request, res: Response) => {
    try {
      const r = await deps.recargarMcp();
      return res.json({ ok: true, ...r, vivos: deps.mcpVivos() });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });
}
