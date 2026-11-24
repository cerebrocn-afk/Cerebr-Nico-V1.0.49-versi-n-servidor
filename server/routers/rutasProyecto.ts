/**
 * rutasProyecto.ts — v1.0.20 · LA SUPERFICIE: UNA llamada contesta todo
 * ====================================================================
 * QUÉ ES: la pieza C. Cinco rutas que sustituyen a las cuatro consultas que el
 * modelo tenía que combinar a mano (`/api/sandbox/status`, `/api/carpeta/estado`,
 * `__cn_info` y adivinar).
 *
 *   GET  /api/rutas/contexto     → instalación + datos + obra + lo servido + avisos
 *   POST /api/proyecto/abrir     → nombre → carpeta + registro + pin + bloque del modelo
 *   GET  /api/proyecto/actual    → qué proyecto está abierto (O(1), sin barridos)
 *   POST /api/proyecto/cerrar    → deja de servir (no borra nada)
 *   POST /api/rutas/clasificar   → «¿de qué raíz es esta ruta y qué hago con ella?»
 *
 * MEDIDO: `/api/rutas/contexto` NO barre el disco. Con el registro en disco es
 * una lectura + una caché de 1 s; con 40 proyectos en la raíz de datos sigue
 * siendo una respuesta, no cuarenta. La versión anterior llamaba tres veces al
 * resolutor recursivo desde `/api/sandbox/status` (segundos por refresco).
 */
import type express from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { clasificarRuta, QUE_HACER, textoDeContexto, resumenRutas, normalizarRuta, veredictoDeEscritura } from "../../src/engine/rutasAtomicas";
import { leerRegistro, abrirProyecto, cerrarProyecto, contextoDeRutas, type DepsRegistro } from "../proyectoRegistro";

export interface DepsRutasProyecto extends DepsRegistro {
  /** Autorización del sandbox (la misma puerta que el resto del IDE). */
  autorizado: (req: Request) => boolean;
  /** Lo que el :3500 sirve ahora según el arranque vivo (puede no coincidir con el registro). */
  servido?: () => string | null;
  /** URL pública de la obra (para que el modelo no la invente). */
  urlObra?: () => string | null;
}

export const RUTAS_RUTAS_PROYECTO = [
  "GET /api/rutas/contexto",
  "POST /api/proyecto/abrir",
  "GET /api/proyecto/actual",
  "POST /api/proyecto/cerrar",
  "POST /api/rutas/clasificar",
] as const;

const noAutorizado = (res: Response) => res.status(401).json({ ok: false, error: "Acceso no autorizado." });

export function registrarRutasProyecto(app: express.Express, deps: DepsRutasProyecto): void {
  /** TODO en una respuesta. Si la obra del registro no está, se dice (no se adivina). */
  app.get("/api/rutas/contexto", (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return noAutorizado(res);
    const ctx = contextoDeRutas(deps);
    const reg = leerRegistro(deps);
    let servido: string | null = null;
    try { servido = deps.servido ? deps.servido() : null; } catch { servido = null; }
    const url = (() => { try { return deps.urlObra ? deps.urlObra() : null; } catch { return null; } })();
    const avisos: string[] = [];
    if (!ctx.proyecto) avisos.push("no hay proyecto abierto: el :3500 no tiene obra que servir");
    if (ctx.proyecto && !fs.existsSync(ctx.proyecto)) avisos.push(`la carpeta de la obra ya no existe en disco: ${ctx.proyecto}`);
    if (servido && ctx.proyecto && normalizarRuta(servido).toLowerCase() !== normalizarRuta(ctx.proyecto).toLowerCase()) {
      avisos.push(`el :3500 sirve «${servido}» pero el proyecto abierto es «${ctx.proyecto}»: reiniciá el sandbox para que coincidan`);
    }
    return res.json({
      ok: true,
      clase: "contexto-rutas",
      instalacion: ctx.instalacion,
      datos: ctx.datos,
      proyecto: ctx.proyecto,
      proyectoNombre: reg.abierto?.nombre ?? null,
      sembrado: reg.abierto?.sembrado ?? [],
      servido,
      url,
      puertos: { ide: 3000, sandbox: 3500 },
      avisos,
      howTo: {
        escribir: ctx.proyecto
          ? "write_file con RUTA RELATIVA (p. ej. \"index.html\"): la obra abierta es la raíz de la escritura y del :3500"
          : "no hay obra: abrí una con POST /api/proyecto/abrir {\"nombre\":\"mi-app\"} antes de escribir",
        servir: "el IDE arranca el :3500 solo; si el preview no cambia, reiniciá el sandbox (no escribas otra ruta)",
        prohibido: `no escribas en ${ctx.instalacion} (instalación del IDE) ni fuera de ${ctx.datos}`,
      },
      texto: textoDeContexto(ctx, { servido, url }),
      resumen: resumenRutas(ctx),
    });
  });

  app.post("/api/proyecto/abrir", (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return noAutorizado(res);
    const cuerpo = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const nombre = String(cuerpo.nombre || cuerpo.proyecto || cuerpo.name || "").trim();
    const modo = cuerpo.modo === "abrir" ? "abrir" : "nuevo";
    const r = abrirProyecto(deps, nombre, modo);
    if (!r.ok) return res.status(400).json({ ok: false, error: r.motivo, avisos: r.avisos });
    return res.json({
      ok: true,
      proyecto: r.proyecto,
      ruta: r.proyecto?.ruta,
      creada: r.proyecto?.origen === "creado",
      sembrado: r.proyecto?.sembrado ?? [],
      avisos: r.avisos,
      texto: r.contexto,
      nota: "el sandbox sirve esta carpeta: si el preview no la muestra, reiniciá el sandbox (no cambies de ruta)",
    });
  });

  app.get("/api/proyecto/actual", (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return noAutorizado(res);
    const reg = leerRegistro(deps);
    const ctx = contextoDeRutas(deps);
    return res.json({
      ok: true,
      abierto: reg.abierto,
      proyectos: reg.proyectos.slice(0, 10),
      hayObra: !!reg.abierto,
      ruta: reg.abierto?.ruta ?? null,
      raizDatos: ctx.datos,
      instalacion: ctx.instalacion,
      actualizadoEn: reg.actualizadoEn,
    });
  });

  app.post("/api/proyecto/cerrar", (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return noAutorizado(res);
    const r = cerrarProyecto(deps);
    return res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      cerrado: r.cerrado,
      nota: r.ok ? "la carpeta y su contenido siguen en disco; solo se dejó de servir" : "no pude escribir el registro: el proyecto sigue abierto",
    });
  });

  /** «¿De qué raíz es esta ruta y qué hago con ella?» — puro, sin tocar el disco. */
  app.post("/api/rutas/clasificar", (req: Request, res: Response) => {
    if (!deps.autorizado(req)) return noAutorizado(res);
    const cuerpo = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const ruta = String(cuerpo.ruta || cuerpo.path || "").trim();
    if (!ruta) return res.status(400).json({ ok: false, error: "falta la ruta a clasificar" });
    const ctx = contextoDeRutas(deps);
    const clase = clasificarRuta(ruta, ctx);
    const veredicto = veredictoDeEscritura(ruta, ctx);
    return res.json({
      ok: true,
      ruta: normalizarRuta(ruta),
      clase,
      queHacer: QUE_HACER[clase],
      escritura: { permitida: veredicto.permitida, abs: veredicto.abs, motivo: veredicto.motivo },
      existe: (() => { try { return fs.existsSync(path.resolve(ruta)); } catch { return false; } })(),
      contexto: ctx,
    });
  });
}
