/**
 * capacidades.ts — ROUTER DE CAPACIDADES CORROBORADAS (v1.15.1)
 * ===============================================================
 * QUÉ ES: un único punto de verdad que dice, con números verificados contra el
 * código real, qué hay ACTIVO y qué está solo DECLARADO. Responde a la pregunta
 * que el proyecto se hizo desde el informe del motor: «¿cuánto de lo que decimos
 * que funciona, funciona de verdad?».
 *
 * FUENTES (todas leídas en caliente, no hardcodeadas):
 *   · skills      → catalogoHonesto (evidencia en disco)
 *   · herramientas→ toolRegistry (registro extensible)
 *   · consejo     → ejecutoresConsejo (ejecutor real vs declarado)
 *   · rutas       → contrato-rutas.json (superficie)
 *   · plugins     → carpeta extensions/ (manifiestos cn.*)
 */
import type express from "express";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { auditarCatalogo, resumenHonesto } from "../../src/engine/catalogoHonesto";
import { getAllToolNames, listToolPacks } from "../../src/engine/toolRegistry";
import { resumenEjecutores } from "../../src/engine/ejecutoresConsejo";
import { auditarEscena3D } from "../../src/engine/testigoEscena"; // v1.0.7 · el testigo de la escena 3D
import { compararFotogramas, type EntradaComparacion } from "../../src/engine/fotogramas"; // v1.0.8 · el ojo que compara dos fotogramas
import { generarEscena3D, TIPOS_AMBIENTE, type AmbienteTipo } from "../../src/engine/generadorEscena3D"; // v1.0.9 · el generador de ambientes

function contarPlugins(): number {
  try {
    return readdirSync(join(process.cwd(), "extensions"), { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name.startsWith("cn.")
    ).length;
  } catch {
    return 0;
  }
}

function leerRutas(): number {
  try {
    const c = JSON.parse(readFileSync(join(process.cwd(), "contrato-rutas.json"), "utf8"));
    return Number(c?.total ?? 0);
  } catch {
    return 0;
  }
}

export function registrarCapacidades(app: express.Express): void {
  app.get("/api/capacidades", (_req, res) => {
    const skills = resumenHonesto(auditarCatalogo((ruta) => existsSync(ruta)));
    const herramientas = getAllToolNames();
    res.json({
      ok: true,
      skills,
      herramientas: {
        reales: herramientas.length,
        packs: listToolPacks().map((p) => ({ id: p.id, herramientas: p.toolCount })),
      },
      consejo: resumenEjecutores(),
      rutas: leerRutas(),
      plugins: contarPlugins(),
    });
  });

  /**
   * v1.0.7 · GET /api/capacidades/testigo-3d?base=http://127.0.0.1:3500&ruta=/index.html
   * ────────────────────────────────────────────────────────────────────────────
   * La pregunta que esta casa se hace desde el informe del motor: «¿cuánto de lo
   * que decimos que funciona, funciona de verdad?». Para las escenas 3D la respuesta
   * era «no lo sabemos»: la skill y el manual exigen los testigos DOM, pero nadie
   * los pedía por HTTP. Esta ruta audita la obra COMO LA VE EL NAVEGADOR —pidiendo
   * el motor por la misma ruta que declaró el importmap—, así que el 404 de
   * `/vendor/three/three.module.js` (la pantalla negra) se detecta acá y no a oscuras.
   *
   * Cierra SOLO a localhost: es el preview de la propia máquina. Una ruta de
   * auditoría que acepta cualquier `base` es un Rebalsa-servicios disfrazado.
   * Y el veredicto trae `noMedible` siempre: un «ok» autoriza a decir «el montaje y
   * los testigos están», NO «se ve y se mueve» (eso necesita un navegador).
   */
  app.get("/api/capacidades/testigo-3d", async (req, res) => {
    const base = String((req.query as any).base || "").trim();
    const ruta = String((req.query as any).ruta || "/index.html").trim() || "/index.html";
    let urlBase: URL;
    try {
      urlBase = new URL(base);
    } catch {
      res.status(400).json({ ok: false, error: "falta el parametro BASE (la url del preview, p. ej. http://127.0.0.1:3500)" });
      return;
    }
    if (urlBase.hostname !== "127.0.0.1" && urlBase.hostname !== "localhost" && urlBase.hostname !== "[::1]") {
      res.status(400).json({ ok: false, error: "el testigo solo audita el preview local (127.0.0.1 / localhost)" });
      return;
    }
    const traer = async (rel: string) => {
      try {
        const r = await fetch(urlBase.origin + (rel.startsWith("/") ? rel : "/" + rel), { signal: AbortSignal.timeout(6000) });
        return { codigo: r.status, texto: await r.text() };
      } catch {
        return null; // 404/caida: el testigo lo va a decir con nombre y ruta
      }
    };
    try {
      const veredicto = await auditarEscena3D(traer, ruta.startsWith("/") ? ruta : "/" + ruta);
      res.json({ ...veredicto, base: urlBase.origin, ruta });
    } catch (e) {
      res.status(500).json({ ok: false, error: `el testigo tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

  /**
   * EL OJO (v1.0.8) · POST /api/capacidades/comparar-fotogramas
   * -----------------------------------------------------------
   * El testigo-3d de v1.0.7 confirma que el MONTAJE está (motor servido, canvas,
   * importmap) pero no puede decir «se MUEVE con el scroll»: para eso hay que
   * mirar dos fotogramas y compararlos. Esta ruta recibe lo que el capturador ya
   * redujo a datos —sha256 de cada PNG, testigos del recorrido y una rejilla de
   * luminancia— y delega TODO el criterio en `fotogramas.ts`. Acá no se decide
   * nada: sólo se valida el cuerpo y se devuelve el veredicto.
   *
   * Las imágenes NUNCA llegan hasta acá; sólo sus huellas y una malla reducida.
   * El veredicto trae `autorizaMovimiento` (la única frase que habilita decir «se
   * mueve») y `noMedible` siempre, para no confundir «montado» con «animado».
   */
  app.post("/api/capacidades/comparar-fotogramas", (req, res) => {
    const cuerpo = (req.body || {}) as Partial<EntradaComparacion>;
    const tieneSha = typeof cuerpo.shaA === "string" || typeof cuerpo.shaB === "string";
    const tieneRejilla = !!cuerpo.rejillaA || !!cuerpo.rejillaB;
    if (!tieneSha && !tieneRejilla) {
      res.status(400).json({
        ok: false,
        error: "faltan datos: mandá al menos shaA/shaB o rejillaA/rejillaB (el ojo no inventa movimiento sin evidencia)",
      });
      return;
    }
    try {
      const veredicto = compararFotogramas(cuerpo as EntradaComparacion);
      res.json({ ok: true, ...veredicto });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: `el ojo tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

  /**
   * EL GENERADOR (v1.0.9) · POST /api/capacidades/generar-escena-3d
   * ----------------------------------------------------------------
   * Genera un ambiente 3D navegable completo (index.html + estilo.css + main.js)
   * con render NATIVO (three vendorizado) y —esto es lo que lo hace honesto— lo
   * CORROBORA en el acto pasándolo por el mismo testigo que audita cualquier obra
   * (`auditarEscena3D`), sirviendo los archivos recién generados y el motor
   * vendorizado del disco. Así la respuesta no es «acá tenes unos archivos» sino
   * «acá tenes una obra que su propio testigo aprueba».
   *
   * El veredicto trae `noMedible`: generar + auditar el montaje NO es renderizar;
   * «se ve y se mueve» sigue necesitando el navegador (el ojo de v1.0.8).
   */
  app.post("/api/capacidades/generar-escena-3d", async (req, res) => {
    const cuerpo = (req.body || {}) as { tipo?: string; titulo?: string; semilla?: number; densidad?: number };
    const tipo = cuerpo.tipo && TIPOS_AMBIENTE.includes(cuerpo.tipo as AmbienteTipo)
      ? (cuerpo.tipo as AmbienteTipo) : undefined;
    try {
      const escena = generarEscena3D({
        tipo,
        titulo: typeof cuerpo.titulo === "string" ? cuerpo.titulo : undefined,
        semilla: Number.isFinite(cuerpo.semilla as number) ? Number(cuerpo.semilla) : undefined,
        densidad: Number.isFinite(cuerpo.densidad as number) ? Number(cuerpo.densidad) : undefined,
      });
      // Corroboración en el acto: servir lo generado + el motor del disco al testigo.
      const motorRuta = join(process.cwd(), "vendor", "three", "three.module.js");
      const motorTxt = existsSync(motorRuta) ? readFileSync(motorRuta, "utf8") : "";
      const archivos = new Map<string, string>();
      for (const a of escena.archivos) { archivos.set("/" + a.ruta, a.contenido); archivos.set(a.ruta, a.contenido); }
      const traer = async (ruta: string) => {
        if (ruta === "/vendor/three/three.module.js") return motorTxt ? { codigo: 200, texto: motorTxt } : null;
        const v = archivos.get(ruta);
        return v != null ? { codigo: 200, texto: v } : null;
      };
      const veredicto = await auditarEscena3D(traer);
      res.json({ ok: true, tipo: escena.tipo, titulo: escena.titulo, semilla: escena.semilla, archivos: escena.archivos, resumen: escena.resumen, veredicto });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: `el generador tiro: ${e instanceof Error ? e.message : String(e)}` });
    }
  });

}
