/**
 * autoLlamado.ts — EL TRANSPORTE DEL LAZO (v2.3.8 · frente 3, segunda mitad)
 * =========================================================================
 * `src/engine/autoLlamado.ts` tenía el criterio (las tres fronteras: voluntad,
 * costo, estancamiento) y desde v2.3.4 el libro (contador por conversación,
 * huellas, interruptor, presupuesto). Lo único que faltaba para que el "seguí"
 * exista era **quién lo consulta**: medido, cero llamantes en todo el árbol.
 *
 * Este archivo es ese cable, y lo es con la menor superficie posible:
 *
 *   · el navegador NO manda el plan ni el parte — manda `"cerró el turno N de la
 *     conversación X"`. Todo lo demás se lee acá, del disco de datos. Repartir la
 *     fuente de "todavía hay trabajo" entre el cliente y el server es la receta
 *     para que el lazo crea una cosa y el panel otra;
 *   · el estado vive en `<raízDatos>/.cerebronico/autoLlamado.json`, que es el
 *     asiento derecho del hemisferio (memoria, no instalación): si el usuario
 *     mueve la raíz, el lazo se mueve con ella;
 *   · la voluntad se respeta en los dos sentidos: apagado = callar y decirlo;
 *     prendido = a lo sumo `TOPE_AUTO_LLAMADOS` re-entradas y ni una mas;
 *   · el lazo NUNCA puede tumbar el turno: todo request responde, incluso cuando
 *     el disco está ilegible (ahí se Calla, que es el estado seguro).
 *
 * Las rutas se exportan como `RUTAS_AUTO_LLAMADO` por la misma razón que las de
 * telemetría: para que la valla pueda batirlas contra el archivo real.
 */
import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import {
  decidirAutoLlamado,
  registrarCierre,
  cancelarCola,
  setInterruptor,
  estadoInicial,
  desdeDisco,
  paraDisco,
  resumen,
  cuentaDe,
  presupuestoAgotado,
  TOPE_AUTO_LLAMADOS,
  type EstadoCola,
} from "../../src/engine/autoLlamado";

/** Las cuatro rutas de la casa del lazo (la valla bate contra esta lista). */
export const RUTAS_AUTO_LLAMADO = [
  "GET /api/autoLlamado",
  "POST /api/autoLlamado",
  "POST /api/autoLlamado/cierre",
  "POST /api/autoLlamado/cancelar",
] as const;

/** Dónde vive el libro. Un solo dueño de la ruta: este archivo. */
export const RUTA_LIBRO = (raizDatos: string) => path.join(raizDatos, ".cerebronico", "autoLlamado.json");

/** Dónde está el parte del turno. Es el asiento derecho, no la instalación. */
export const RUTA_REANUDAR = (raizDatos: string) => path.join(raizDatos, "REANUDAR.md");

export interface DepsAutoLlamado {
  raizDatos: string;
  consola?: { warn: (m: string) => void; log?: (m: string) => void };
  ahora?: () => number;
}

export function registrarAutoLlamado(app: express.Express, deps: DepsAutoLlamado): void {
  const ahora = deps.ahora || (() => Date.now());
  const ruta = RUTA_LIBRO(deps.raizDatos);
  let estado: EstadoCola = estadoInicial();

  const cargar = () => {
    try {
      if (fs.existsSync(ruta)) estado = desdeDisco(fs.readFileSync(ruta, "utf-8"));
    } catch (e: any) {
      // Ilegible no es "apagado" ni "prendido": es "no sé", y sin saber se calla.
      estado = estadoInicial();
      deps.consola?.warn(`[autoLlamado] no pude leer el libro (${e?.message || e}): el lazo queda apagado.`);
    }
  };
  const guardar = () => {
    try {
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(ruta, paraDisco(estado), "utf-8");
    } catch (e: any) {
      deps.consola?.warn(`[autoLlamado] no pude escribir el libro: ${e?.message || e}`);
    }
  };
  cargar();

  const textoReanudar = (): string => {
    try {
      const r = RUTA_REANUDAR(deps.raizDatos);
      return fs.existsSync(r) ? fs.readFileSync(r, "utf-8") : "";
    } catch {
      return "";
    }
  };

  app.get("/api/autoLlamado", (_q: Request, res: Response) => {
    res.json({
      ok: true,
      activado: estado.activado,
      tope: estado.tope,
      presupuestoMs: estado.presupuestoMs,
      conversaciones: resumen(estado),
      nota: estado.activado
        ? "prendido: el lazo puede re-entrar hasta el tope por conversacion"
        : "apagado por omision: nadie enciende un lazo que quema credito del modelo",
    });
  });

  app.post("/api/autoLlamado", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    estado = setInterruptor(estado, cuerpo.activado === true, ahora());
    guardar();
    res.json({ ok: true, activado: estado.activado, tope: TOPE_AUTO_LLAMADOS });
  });

  app.post("/api/autoLlamado/cierre", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    const conversacion = String(cuerpo.conversacion || "global");
    const cuenta = cuentaDe(estado, conversacion);
    if (presupuestoAgotado(estado, conversacion, ahora())) {
      res.json({
        ok: true,
        accion: "callar",
        mensaje: null,
        restantes: 0,
        motivo: "se agoto el presupuesto de tiempo de la corrida: el lazo se rinde con causa",
      });
      return;
    }
    const decision = decidirAutoLlamado({
      activado: estado.activado,
      // El navegador no manda el plan: la fuente de "todavia hay trabajo" es el
      // parte del turno, que vive en el asiento derecho. Un solo dueno.
      plan: [],
      llamadosHechos: cuenta?.llamados || 0,
      sellosPrevios: cuenta?.sellos || [],
      turnoFallo: cuerpo.turnoFallo === true,
      conclusion: String(cuerpo.conclusion || ""),
      reanudar: textoReanudar(),
    });
    estado = registrarCierre(estado, conversacion, decision, ahora());
    guardar();
    res.json({
      ok: true,
      accion: decision.accion,
      mensaje: decision.mensaje,
      motivo: decision.motivo,
      restantes: decision.restantes,
      origen: decision.origen,
      llamados: cuentaDe(estado, conversacion)?.llamados || 0,
    });
  });

  app.post("/api/autoLlamado/cancelar", (req: Request, res: Response) => {
    const cuerpo: any = req.body || {};
    estado = cancelarCola(estado, String(cuerpo.conversacion || "global"), ahora());
    guardar();
    res.json({ ok: true, conversaciones: resumen(estado) });
  });
}
